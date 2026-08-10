#!/usr/bin/env python3
"""Import the Supreme Therapy global export into the live CGT tracker.

The script intentionally uses only Python stdlib so it can run in the Bolt/Codex
workspace without adding dependencies. It parses the .xlsx XML directly, then
upserts companies, assets, ABM audience memberships, score history, and an
import change-log row where permissions allow.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import ssl
import sys
import urllib.parse
import urllib.request
import uuid
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path("/Users/micah/cgt-tracker")
DEFAULT_FILE = Path("/Users/micah/Downloads/2026.06.22 - Supreme Therapy Report (1).xlsx")
REPORT_DIR = PROJECT_ROOT / "health-checks"
SOURCE_FILE_NAME = "2026.06.22 - Supreme Therapy Report (1).xlsx"
RUN_DATE = dt.date.today().isoformat()
TODAY = dt.date.today()

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PKG = "{http://schemas.openxmlformats.org/package/2006/relationships}"

CORP_SUFFIX_RE = re.compile(
    r"\b(incorporated|inc|corp|corporation|co|company|ltd|limited|llc|plc|sa|ag|nv|gmbh|holdings)\b\.?",
    re.I,
)


def clean(value: Any) -> str:
    text = "" if value is None else str(value).strip()
    if text in {"(No value)", "No value", "nan", "None"}:
        return ""
    return re.sub(r"\s+", " ", text)


def norm(value: str) -> str:
    text = clean(value).lower().replace("&", " and ")
    text = CORP_SUFFIX_RE.sub("", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def domain_from_url(value: str) -> str:
    value = clean(value).lower()
    if not value:
        return ""
    value = re.sub(r"^https?://", "", value)
    value = value.split("/", 1)[0].strip()
    return value[4:] if value.startswith("www.") else value


def placeholder_domain(company_name: str) -> str:
    key = norm(company_name).replace(" ", "-")
    return f"{key or 'unknown-company'}.missing-domain.invalid"


def col_index(ref: str) -> int:
    n = 0
    for ch in "".join(c for c in ref if c.isalpha()):
        n = n * 26 + ord(ch.upper()) - 64
    return n - 1


def read_xlsx(path: Path) -> list[dict[str, str]]:
    zf = zipfile.ZipFile(path)
    shared: list[str] = []
    if "xl/sharedStrings.xml" in zf.namelist():
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        for si in root.findall(f"{NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))

    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_by_id = {r.attrib["Id"]: r.attrib["Target"] for r in rels.findall(f"{PKG}Relationship")}
    sheet = workbook.find(f"{NS}sheets").findall(f"{NS}sheet")[0]
    target = rel_by_id[sheet.attrib[f"{REL}id"]].lstrip("/")
    sheet_path = target if target.startswith("xl/") else f"xl/{target}"

    root = ET.fromstring(zf.read(sheet_path))
    matrix: list[list[str]] = []
    for row in root.findall(f".//{NS}sheetData/{NS}row"):
        values: list[str] = []
        last = -1
        for cell in row.findall(f"{NS}c"):
            idx = col_index(cell.attrib.get("r", "A1"))
            while last + 1 < idx:
                values.append("")
                last += 1
            cell_type = cell.attrib.get("t")
            v = cell.find(f"{NS}v")
            inline = cell.find(f"{NS}is")
            value = ""
            if cell_type == "s" and v is not None and v.text is not None:
                si = int(v.text)
                value = shared[si] if si < len(shared) else ""
            elif cell_type == "inlineStr" and inline is not None:
                value = "".join(t.text or "" for t in inline.iter(f"{NS}t"))
            elif v is not None and v.text is not None:
                value = v.text
            values.append(clean(value))
            last = idx
        matrix.append(values)

    headers = matrix[0]
    return [
        {headers[i]: clean(row[i]) if i < len(row) else "" for i in range(len(headers))}
        for row in matrix[1:]
        if any(clean(c) for c in row)
    ]


def excel_date(value: str) -> str:
    value = clean(value)
    if not value:
        return ""
    try:
        serial = float(value)
        if 20000 < serial < 60000:
            return (dt.date(1899, 12, 30) + dt.timedelta(days=serial)).isoformat()
    except ValueError:
        pass
    return value


def parse_date(value: str) -> dt.date | None:
    value = excel_date(value)
    if not value:
        return None
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        return None


def add_months(day: dt.date, months: int) -> dt.date:
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    last = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return dt.date(year, month, min(day.day, last))


def classify_phase(phase: str) -> str:
    lower = phase.lower()
    if "market" in lower or "approved" in lower:
        return "On-Market"
    if "registration" in lower or "phase iii" in lower or "phase 3" in lower:
        return "Late Stage"
    return "Early Stage"


def score_row(phase: str, therapy_area: str, launch_date: dt.date | None, closed_won: bool) -> dict[str, Any]:
    lower = phase.lower()
    within_18 = launch_date is not None and TODAY <= launch_date <= add_months(TODAY, 18)
    already_market = "market" in lower or (launch_date is not None and launch_date < TODAY)
    outside_priority_window = not already_market and not within_18

    if already_market:
        regulatory = 5
    elif "registration" in lower:
        regulatory = 5
    elif "phase iii" in lower or "phase 3" in lower:
        regulatory = 4 if within_18 else 3
    elif "phase ii" in lower or "phase 2" in lower:
        regulatory = 2
    else:
        regulatory = 1

    if already_market:
        commercial = 5
    elif closed_won:
        commercial = 4
    elif within_18 and ("phase iii" in lower or "registration" in lower):
        commercial = 3
    elif "phase iii" in lower:
        commercial = 2
    else:
        commercial = 1

    area = therapy_area.lower()
    market = 4 if any(x in area for x in ["oncology", "genetic", "hematological", "metabolic"]) else 3
    raw = round(regulatory * 0.4 * 20 + commercial * 0.35 * 20 + market * 0.25 * 20)

    if already_market:
        tier = None
    elif within_18:
        tier = "Tier 1"
    elif "phase iii" in lower or "phase 3" in lower or "registration" in lower:
        tier = "Tier 2"
    elif "phase i" in lower and "phase ii" not in lower:
        tier = "Deprioritized"
    else:
        tier = "Watchlist"

    if already_market:
        launch_flag = "Yes"
    elif within_18:
        launch_flag = "Yes"
    elif "phase iii" in lower or "registration" in lower:
        launch_flag = "Watchlist"
    else:
        launch_flag = "No"

    return {
        "regulatory_score": regulatory,
        "commercial_infrastructure_score": commercial,
        "market_attractiveness_score": market,
        "raw_commercial_score": raw,
        "final_commercial_score": min(raw, 50) if outside_priority_window else raw,
        "commercial_priority_tier": tier,
        "likely_us_launch_within_24_months": launch_flag,
        "timeline_over_24_months": outside_priority_window,
        "within_18": within_18,
        "already_market": already_market,
    }


def asset_label(drug: str, brand: str) -> str:
    drug = clean(drug)
    brand = clean(brand)
    if brand and norm(brand) != norm(drug):
        return f"{drug} ({brand})"
    return drug


def week_label(day: dt.date) -> str:
    iso = day.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


class SupabaseRest:
    def __init__(self) -> None:
        supabase_ts = (PROJECT_ROOT / "src/lib/supabase.ts").read_text()
        self.url = re.search(r"supabaseUrl = '([^']+)'", supabase_ts).group(1)
        self.key = re.search(r"supabaseAnonKey = '([^']+)'", supabase_ts).group(1)
        self.ctx = ssl._create_unverified_context()

    def request(self, method: str, table: str, query: str = "", body: Any | None = None, prefer: str = "return=representation") -> Any:
        full_url = f"{self.url}/rest/v1/{table}{query}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(
            full_url,
            data=data,
            method=method,
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Prefer": prefer,
            },
        )
        try:
            raw = urllib.request.urlopen(req, timeout=60, context=self.ctx).read().decode("utf-8")
            return json.loads(raw) if raw else None
        except urllib.error.HTTPError as err:
            message = err.read().decode("utf-8", "replace")
            raise RuntimeError(f"{method} {table}{query} failed {err.code}: {message}") from err

    def select_all(self, table: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            batch = self.request("GET", table, f"?select=*&limit=1000&offset={offset}")
            rows.extend(batch or [])
            if len(batch or []) < 1000:
                return rows
            offset += 1000


def find_asset(existing: list[dict[str, Any]], drug: str, brand: str, label: str, therapy_id: str) -> dict[str, Any] | None:
    therapy_marker = f"Supreme Therapy ID: {therapy_id}" if therapy_id else ""
    if therapy_marker:
        for asset in existing:
            if therapy_marker in clean(asset.get("latest_material_update")):
                return asset
        return None

    candidates = {norm(drug), norm(brand), norm(label)}
    candidates.discard("")
    for asset in existing:
        asset_key = norm(asset.get("asset_name", ""))
        if asset_key in candidates:
            return asset
        if any(c and len(c) >= 5 and (c in asset_key or asset_key in c) for c in candidates):
            return asset
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
    parser.add_argument("--apply", action="store_true", help="Write changes to Supabase. Omit for dry run.")
    parser.add_argument("--abm-only", action="store_true", help="Repair/sync only ABM audience phase memberships.")
    args = parser.parse_args()

    rows = read_xlsx(args.file)
    sb = SupabaseRest()
    companies = sb.select_all("cgt_companies")
    assets = sb.select_all("cgt_assets")
    abm_members = sb.select_all("cgt_abm_audience_members")

    company_by_key = {norm(c.get("company_name", "")): c for c in companies}
    assets_by_company: dict[str, list[dict[str, Any]]] = {}
    for asset in assets:
        assets_by_company.setdefault(asset.get("company_id"), []).append(asset)
    abm_keys = {(clean(a.get("domain", "")).lower(), clean(a.get("audience_segment", ""))): a for a in abm_members}

    counts = {
        "source_rows": len(rows),
        "companies_created": 0,
        "companies_updated": 0,
        "assets_created": 0,
        "assets_updated": 0,
        "abm_created": 0,
        "abm_updated": 0,
        "score_history_inserted": 0,
        "change_log_inserted": 0,
        "closed_won_rows": 0,
        "priority_1_rows": 0,
        "errors": 0,
    }
    report: list[dict[str, Any]] = []
    now = dt.datetime.now(dt.UTC).isoformat()
    update_week = week_label(TODAY)

    for source in rows:
        drug = clean(source.get("Drug Name"))
        company_name = clean(source.get("Company Name"))
        if not drug or not company_name:
            continue
        brand = clean(source.get("Brand Name"))
        phase = clean(source.get("Phase Bucket"))
        therapy_area = clean(source.get("Therapeutic Area"))
        molecule_type = clean(source.get("Molecule Type"))
        won_services = clean(source.get("Won InspiroGene Services"))
        therapy_id = clean(source.get("Therapy ID"))
        launch = parse_date(source.get("Global Data Launch Date", ""))
        launch_iso = launch.isoformat() if launch else ""
        closed_won = bool(won_services)
        if closed_won:
            counts["closed_won_rows"] += 1

        segment = classify_phase(phase)
        abm_segment = "On Market" if segment == "On-Market" else segment
        label = asset_label(drug, brand)
        scored = score_row(phase, therapy_area, launch, closed_won)
        if scored["commercial_priority_tier"] == "Tier 1":
            counts["priority_1_rows"] += 1

        launch_window = (
            f"Global launch date: {launch_iso or 'not provided'}; "
            f"{'Priority 1 - commercializing within 18 months' if scored['commercial_priority_tier'] == 'Tier 1' else 'Not Priority 1'}"
        )
        update_text = (
            f"Imported from {SOURCE_FILE_NAME} on {RUN_DATE}. "
            f"Supreme Therapy ID: {therapy_id or 'not provided'}. "
            f"Global launch date: {launch_iso or 'not provided'}. "
            f"Won InspiroGene Services: {won_services or 'No'}."
        )
        readiness = (
            f"Global export phase: {phase or 'not provided'}. "
            f"Molecule type: {molecule_type or 'not provided'}. "
            f"Won InspiroGene Services: {won_services or 'No'}."
        )
        action = "dry_run"
        error = ""

        try:
            company_key = norm(company_name)
            company = company_by_key.get(company_key)
            if not company:
                if args.abm_only:
                    raise RuntimeError("Company not found for ABM-only repair")
                company_payload = {
                    "company_name": company_name,
                    "parent_company": "",
                    "hq_country": "",
                    "website": "",
                    "ticker": "",
                    "segment_default": segment,
                    "notes": f"Added from {SOURCE_FILE_NAME} on {RUN_DATE}.{(' Closed won account.' if closed_won else '')}",
                    "status": "active",
                    "updated_at": now,
                }
                if args.apply:
                    created = sb.request("POST", "cgt_companies", body=company_payload)
                    company = created[0]
                    company_by_key[company_key] = company
                    assets_by_company.setdefault(company["id"], [])
                else:
                    company = {"id": f"dry-{uuid.uuid4()}", **company_payload}
                    company_by_key[company_key] = company
                    assets_by_company.setdefault(company["id"], [])
                counts["companies_created"] += 1
            elif closed_won and "Closed won" not in clean(company.get("notes")):
                counts["companies_updated"] += 1
                if args.apply:
                    notes = clean(company.get("notes"))
                    new_notes = f"{notes}\nClosed won per {SOURCE_FILE_NAME}: {won_services}.".strip()
                    sb.request("PATCH", "cgt_companies", f"?id=eq.{urllib.parse.quote(company['id'])}", {"notes": new_notes, "updated_at": now}, prefer="return=minimal")

            domain = domain_from_url(company.get("website", "")) or placeholder_domain(company_name)
            abm_key = (domain, abm_segment)
            abm_payload = {
                "account_name": company_name,
                "domain": domain,
                "country": clean(company.get("hq_country", "")),
                "audience_segment": abm_segment,
                "is_client": closed_won,
            }
            existing_abm = abm_keys.get(abm_key)
            if existing_abm:
                if closed_won and not existing_abm.get("is_client"):
                    counts["abm_updated"] += 1
                    if args.apply:
                        sb.request("PATCH", "cgt_abm_audience_members", f"?id=eq.{urllib.parse.quote(existing_abm['id'])}", {"is_client": True}, prefer="return=minimal")
            else:
                counts["abm_created"] += 1
                if args.apply:
                    created_abm = sb.request("POST", "cgt_abm_audience_members", body=abm_payload)
                    abm_keys[abm_key] = created_abm[0]
                else:
                    abm_keys[abm_key] = {"id": f"dry-{uuid.uuid4()}", **abm_payload}

            priority_abm_segment = scored["commercial_priority_tier"]
            if not closed_won and priority_abm_segment in {"Tier 1", "Tier 2"}:
                priority_key = (domain, priority_abm_segment)
                priority_payload = {
                    "account_name": company_name,
                    "domain": domain,
                    "country": clean(company.get("hq_country", "")),
                    "audience_segment": priority_abm_segment,
                    "is_client": False,
                }
                if priority_key in abm_keys:
                    counts["abm_updated"] += 1
                    if args.apply:
                        sb.request(
                            "PATCH",
                            "cgt_abm_audience_members",
                            f"?id=eq.{urllib.parse.quote(abm_keys[priority_key]['id'])}",
                            {
                                "account_name": company_name,
                                "country": clean(company.get("hq_country", "")),
                                "is_client": False,
                            },
                            prefer="return=minimal",
                        )
                else:
                    counts["abm_created"] += 1
                    if args.apply:
                        created_priority_abm = sb.request("POST", "cgt_abm_audience_members", body=priority_payload)
                        abm_keys[priority_key] = created_priority_abm[0]
                    else:
                        abm_keys[priority_key] = {"id": f"dry-{uuid.uuid4()}", **priority_payload}

            if args.abm_only:
                action = "abm_synced"
                report.append({
                    "action": action,
                    "error": error,
                    "company": company_name,
                    "asset": label,
                    "phase": phase,
                    "segment": segment,
                    "launch_date": launch_iso,
                    "commercial_priority_tier": scored["commercial_priority_tier"] or "",
                    "closed_won_services": won_services,
                    "therapy_id": therapy_id,
                })
                continue

            existing_assets = assets_by_company.setdefault(company["id"], [])
            asset = find_asset(existing_assets, drug, brand, label, therapy_id)
            asset_payload = {
                "company_id": company["id"],
                "asset_name": label,
                "modality": molecule_type,
                "target_indication": therapy_area,
                "lead_indication": therapy_area,
                "clinicaltrials_gov_id": "",
                "segment": segment,
                "phase_regulatory_status": phase,
                "filing_status": "Approved/Marketed" if segment == "On-Market" else phase,
                "key_upcoming_catalyst": "Global launch target" if launch and launch >= TODAY else "",
                "catalyst_date": launch_iso if launch and launch >= TODAY else None,
                "us_commercialization_window": launch_window,
                "likely_us_launch_within_24_months": scored["likely_us_launch_within_24_months"],
                "manufacturing_status": "Established" if segment == "On-Market" else "Early",
                "manufacturing_pathway": "Unclear",
                "commercial_buildout_status": "Established" if segment == "On-Market" or closed_won else "Minimal",
                "commercial_readiness_signals": readiness,
                "latest_material_update": update_text,
                "clinical_hold": False,
                "no_manufacturing_pathway": False,
                "timeline_over_24_months": scored["timeline_over_24_months"],
                "no_us_path": False,
                "capability_gap_leverage_score": 0,
                "strategic_opportunity_score": 0,
                "strategic_priority_tier": None,
                "confidence_level": "Medium",
                "last_reviewed_at": now,
                "last_reviewed_by": None,
                "lock_status": "Open",
                "updated_at": now,
                **{k: scored[k] for k in [
                    "regulatory_score",
                    "commercial_infrastructure_score",
                    "market_attractiveness_score",
                    "raw_commercial_score",
                    "final_commercial_score",
                    "commercial_priority_tier",
                ]},
            }

            if asset:
                action = "asset_updated"
                counts["assets_updated"] += 1
                if args.apply:
                    sb.request("PATCH", "cgt_assets", f"?id=eq.{urllib.parse.quote(asset['id'])}", asset_payload, prefer="return=minimal")
                asset_id = asset["id"]
            else:
                action = "asset_created"
                counts["assets_created"] += 1
                if args.apply:
                    created_asset = sb.request("POST", "cgt_assets", body=asset_payload)
                    asset = created_asset[0]
                    existing_assets.append(asset)
                    asset_id = asset["id"]
                else:
                    asset_id = f"dry-{uuid.uuid4()}"

            score_history = {
                "asset_id": asset_id,
                "week_label": update_week,
                "regulatory_score": scored["regulatory_score"],
                "commercial_infrastructure_score": scored["commercial_infrastructure_score"],
                "market_attractiveness_score": scored["market_attractiveness_score"],
                "capability_gap_leverage_score": 0,
                "raw_commercial_score": scored["raw_commercial_score"],
                "final_commercial_score": scored["final_commercial_score"],
                "commercial_priority_tier": scored["commercial_priority_tier"],
                "strategic_opportunity_score": 0,
                "strategic_priority_tier": None,
                "recorded_by": None,
            }
            counts["score_history_inserted"] += 1
            if args.apply:
                sb.request("POST", "cgt_score_history", body=score_history, prefer="return=minimal")

            change_log = {
                "asset_id": asset_id,
                "run_date": RUN_DATE,
                "update_week": update_week,
                "agent_id": None,
                "change_type": "global_export_import",
                "field_changed": action,
                "previous_value": "",
                "new_value": label,
                "why_it_matters": f"Global therapy export added/updated launch timing and closed-won status. {launch_window}.",
                "score_impact_explanation": f"Commercial readiness score set to {scored['final_commercial_score']} from export phase/launch timing.",
                "source_url": SOURCE_FILE_NAME,
                "confidence_level": "Medium",
            }
            counts["change_log_inserted"] += 1
            if args.apply:
                try:
                    sb.request("POST", "cgt_change_log", body=change_log, prefer="return=minimal")
                except Exception:
                    counts["change_log_inserted"] -= 1

        except Exception as exc:
            counts["errors"] += 1
            error = str(exc)

        report.append({
            "action": action,
            "error": error,
            "company": company_name,
            "asset": label,
            "phase": phase,
            "segment": segment,
            "launch_date": launch_iso,
            "commercial_priority_tier": scored["commercial_priority_tier"] or "",
            "closed_won_services": won_services,
            "therapy_id": therapy_id,
        })

    REPORT_DIR.mkdir(exist_ok=True)
    if args.abm_only:
        suffix = "abm_only_applied" if args.apply else "abm_only_dry_run"
    else:
        suffix = "applied" if args.apply else "dry_run"
    report_path = REPORT_DIR / f"supreme_therapy_import_{suffix}_{RUN_DATE}.csv"
    with report_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(report[0].keys()))
        writer.writeheader()
        writer.writerows(report)

    summary_path = REPORT_DIR / f"supreme_therapy_import_{suffix}_{RUN_DATE}.json"
    summary = {"mode": suffix, "source_file": str(args.file), "counts": counts, "report_path": str(report_path)}
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    if counts["errors"]:
        print(f"Import completed with {counts['errors']} row errors. See {report_path}", file=sys.stderr)
    return 1 if counts["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
