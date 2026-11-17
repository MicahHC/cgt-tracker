/**
 * Captures a source-level ClinicalTrials.gov snapshot for market-intelligence
 * reporting. This function never derives buyer demand from trial activity.
 *
 * POST { snapshot_week?: "YYYY-Www" }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const QUERIES = [
  "gene therapy", "genetic therapy", "CAR T-cell", "T-cell receptor therapy",
  "NK cell therapy", "tumor infiltrating lymphocyte", "cell therapy",
  "induced pluripotent stem cell", "regenerative medicine",
];
const ACTIVE_STATUSES = "RECRUITING,ACTIVE_NOT_RECRUITING,ENROLLING_BY_INVITATION,NOT_YET_RECRUITING,COMPLETED";
const MAX_STUDIES_PER_QUERY = 500;

type Study = Record<string, any>;

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return response({ error: "Supabase server configuration missing" }, 500);

  const body = await request.json().catch(() => ({}));
  const snapshotWeek = typeof body.snapshot_week === "string" && /^\d{4}-W\d{2}$/.test(body.snapshot_week)
    ? body.snapshot_week : isoWeek(new Date());
  const supabase = createClient(url, key);
  const sourceQueries = QUERIES.map((query) => ({ query, max_studies: MAX_STUDIES_PER_QUERY }));

  await supabase.from("cgt_market_snapshot_runs").upsert({
    snapshot_week: snapshotWeek, status: "running", source_queries: sourceQueries,
    studies_discovered: 0, studies_stored: 0, coverage_status: "unknown", error: "", started_at: new Date().toISOString(), completed_at: null,
  }, { onConflict: "snapshot_week" });

  try {
    const settled = await Promise.allSettled(QUERIES.map((query) => fetchStudies(query)));
    const failures = settled.filter((result) => result.status === "rejected");
    const truncated = settled.some((result) => result.status === "fulfilled" && result.value.truncated);
    const studies = new Map<string, { study: Study; query: string }>();
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      if (result.status !== "fulfilled") continue;
      for (const study of result.value.studies) {
        const id = study.protocolSection?.identificationModule?.nctId;
        if (id && !studies.has(id)) studies.set(id, { study, query: QUERIES[index] });
      }
    }

    const rows = [...studies.values()].map(({ study, query }) => normalizeStudy(study, snapshotWeek, query));
    await supabase.from("cgt_trial_market_snapshots").delete().eq("snapshot_week", snapshotWeek);
    for (let offset = 0; offset < rows.length; offset += 250) {
      const { error } = await supabase.from("cgt_trial_market_snapshots").insert(rows.slice(offset, offset + 250));
      if (error) throw new Error(`Snapshot insert failed: ${error.message}`);
    }
    const coverage = failures.length || truncated ? "partial" : "complete";
    await supabase.from("cgt_market_snapshot_runs").update({
      status: failures.length || truncated ? "partial" : "succeeded", coverage_status: coverage,
      studies_discovered: rows.length, studies_stored: rows.length,
      error: [
        failures.length ? `${failures.length} registry query or queries failed` : "",
        truncated ? `One or more registry queries reached the ${MAX_STUDIES_PER_QUERY}-study capture limit` : "",
      ].filter(Boolean).join("; "),
      completed_at: new Date().toISOString(),
    }).eq("snapshot_week", snapshotWeek);
    return response({ snapshot_week: snapshotWeek, studies_stored: rows.length, coverage_status: coverage });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("cgt_market_snapshot_runs").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("snapshot_week", snapshotWeek);
    return response({ error: message }, 500);
  }
});

async function fetchStudies(query: string): Promise<{ studies: Study[]; truncated: boolean }> {
  const studies: Study[] = [];
  let pageToken: string | undefined;
  do {
    const endpoint = new URL("https://clinicaltrials.gov/api/v2/studies");
    endpoint.searchParams.set("query.intr", query);
    endpoint.searchParams.set("query.locn", "United States");
    endpoint.searchParams.set("filter.overallStatus", ACTIVE_STATUSES);
    endpoint.searchParams.set("pageSize", "100");
    if (pageToken) endpoint.searchParams.set("pageToken", pageToken);
    const result = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!result.ok) throw new Error(`ClinicalTrials.gov ${query}: HTTP ${result.status}`);
    const body = await result.json();
    studies.push(...(body.studies ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken && studies.length < MAX_STUDIES_PER_QUERY);
  return { studies, truncated: Boolean(pageToken) };
}

function normalizeStudy(study: Study, snapshotWeek: string, sourceQuery: string) {
  const protocol = study.protocolSection ?? {};
  const id = protocol.identificationModule ?? {};
  const status = protocol.statusModule ?? {};
  const sponsor = protocol.sponsorCollaboratorsModule?.leadSponsor ?? {};
  const design = protocol.designModule ?? {};
  const interventions = (protocol.armsInterventionsModule?.interventions ?? []).map((item: any) => item.name).filter(Boolean);
  const conditions = (protocol.conditionsModule?.conditions ?? []).filter(Boolean);
  const title = id.briefTitle ?? "";
  return {
    snapshot_week: snapshotWeek, nct_id: id.nctId, sponsor_name: sponsor.name ?? "", asset_name: interventions[0] ?? "",
    modality: classifyModality(`${title} ${interventions.join(" ")}`), therapeutic_area: conditions[0] ?? "",
    phase: (design.phases ?? []).join(", "), overall_status: status.overallStatus ?? "",
    study_start_date: status.startDateStruct?.date ?? null, primary_completion_date: status.primaryCompletionDateStruct?.date ?? null,
    last_update_date: status.lastUpdatePostDateStruct?.date ?? null, source_url: `https://clinicaltrials.gov/study/${id.nctId}`,
    study_title: title, conditions, interventions, source_query: sourceQuery,
  };
}

function classifyModality(value: string): string {
  const text = value.toLowerCase();
  if (/car.?t|t.?cell receptor|tcr.?t|tumou?r infiltrating|til/.test(text)) return "Cell therapy";
  if (/nk.?cell/.test(text)) return "NK cell therapy";
  if (/gene therapy|genetic therapy|aav|lentiv|crispr|gene edit/.test(text)) return "Gene therapy";
  if (/stem cell|i?psc|regenerative/.test(text)) return "Regenerative medicine";
  return "Other CGT";
}

function isoWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
