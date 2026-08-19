#!/usr/bin/env python3
"""Sync Priority 1 / Priority 2 tracker companies into ABM audience members."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import importlib.util
import json
import urllib.parse
import uuid
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path("/Users/micah/cgt-tracker")
IMPORTER = PROJECT_ROOT / "scripts/import_supreme_therapy_report.py"
REPORT_DIR = PROJECT_ROOT / "health-checks"
RUN_DATE = dt.date.today().isoformat()


spec = importlib.util.spec_from_file_location("supreme_import", IMPORTER)
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)


def company_key(company: dict[str, Any]) -> str:
    domain = mod.domain_from_url(company.get("website", ""))
    return domain or mod.placeholder_domain(company.get("company_name", ""))


def member_key(member: dict[str, Any]) -> tuple[str, str]:
    return (
        mod.clean(member.get("domain")).lower(),
        mod.clean(member.get("audience_segment")),
    )


def matches_client(
    company: dict[str, Any],
    members: list[dict[str, Any]],
    client_domains: list[dict[str, Any]],
) -> bool:
    domain = company_key(company)
    company_norm = mod.norm(company.get("company_name", ""))
    for client in client_domains:
        client_domain = mod.clean(client.get("domain")).lower()
        if domain and client_domain == domain:
            return True
        if mod.norm(client.get("account_name", "")) == company_norm:
            return True

    for member in members:
        if not member.get("is_client"):
            continue
        member_domain = mod.clean(member.get("domain")).lower()
        if domain and member_domain == domain:
            return True
        if mod.norm(member.get("account_name", "")) == company_norm:
            return True
    return False


def best_priority_tier(assets: list[dict[str, Any]]) -> str | None:
    if any(asset.get("commercial_priority_tier") == "Tier 1" and not asset.get("no_us_path") for asset in assets):
        return "Priority 1"
    if any(asset.get("commercial_priority_tier") == "Tier 2" and not asset.get("no_us_path") for asset in assets):
        return "Priority 2"
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write changes to Supabase. Omit for dry run.")
    args = parser.parse_args()

    sb = mod.SupabaseRest()
    companies = sb.select_all("cgt_companies")
    assets = sb.select_all("cgt_assets")
    members = sb.select_all("cgt_abm_audience_members")
    client_domains = sb.select_all("cgt_abm_client_domains")

    assets_by_company: dict[str, list[dict[str, Any]]] = {}
    for asset in assets:
        assets_by_company.setdefault(asset.get("company_id"), []).append(asset)

    existing = {member_key(member): member for member in members}
    actions: list[dict[str, Any]] = []
    counts = {
        "companies_evaluated": len(companies),
        "tier_1_companies": 0,
        "tier_2_companies": 0,
        "created": 0,
        "updated": 0,
        "suppressed_clients": 0,
        "skipped_no_priority": 0,
        "errors": 0,
    }

    for company in companies:
        if mod.clean(company.get("status")).lower() == "excluded":
            counts["skipped_no_priority"] += 1
            continue

        tier = best_priority_tier(assets_by_company.get(company.get("id"), []))
        if not tier:
            counts["skipped_no_priority"] += 1
            continue

        if tier == "Priority 1":
            counts["tier_1_companies"] += 1
        elif tier == "Priority 2":
            counts["tier_2_companies"] += 1

        if matches_client(company, members, client_domains):
            counts["suppressed_clients"] += 1
            actions.append({
                "action": "suppressed_client",
                "company": mod.clean(company.get("company_name")),
                "segment": tier,
                "domain": company_key(company),
                "error": "",
            })
            continue

        row = {
            "account_name": mod.clean(company.get("company_name")),
            "domain": company_key(company),
            "country": mod.clean(company.get("hq_country")) or "United States",
            "audience_segment": tier,
            "is_client": False,
        }
        key = (row["domain"], tier)
        current = existing.get(key)
        try:
            if current:
                patch = {
                    "account_name": row["account_name"],
                    "country": row["country"],
                    "is_client": False,
                }
                if args.apply:
                    sb.request(
                        "PATCH",
                        "cgt_abm_audience_members",
                        f"?id=eq.{urllib.parse.quote(current['id'])}",
                        patch,
                        prefer="return=minimal",
                    )
                counts["updated"] += 1
                action = "updated"
            else:
                if args.apply:
                    created = sb.request("POST", "cgt_abm_audience_members", body=row)
                    existing[key] = created[0]
                else:
                    existing[key] = {"id": f"dry-{uuid.uuid4()}", **row}
                counts["created"] += 1
                action = "created"

            actions.append({
                "action": action,
                "company": row["account_name"],
                "segment": tier,
                "domain": row["domain"],
                "error": "",
            })
        except Exception as exc:
            counts["errors"] += 1
            actions.append({
                "action": "error",
                "company": row["account_name"],
                "segment": tier,
                "domain": row["domain"],
                "error": str(exc),
            })

    REPORT_DIR.mkdir(exist_ok=True)
    suffix = "applied" if args.apply else "dry_run"
    report_path = REPORT_DIR / f"abm_priority_list_sync_{suffix}_{RUN_DATE}.csv"
    with report_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["action", "company", "segment", "domain", "error"])
        writer.writeheader()
        writer.writerows(actions)

    refreshed = sb.select_all("cgt_abm_audience_members") if args.apply else list(existing.values())
    segment_counts: dict[str, int] = {}
    for member in refreshed:
        segment = mod.clean(member.get("audience_segment"))
        segment_counts[segment] = segment_counts.get(segment, 0) + 1

    summary = {
        "mode": suffix,
        "counts": counts,
        "segment_counts": segment_counts,
        "report_path": str(report_path),
    }
    print(json.dumps(summary, indent=2))
    return 1 if counts["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
