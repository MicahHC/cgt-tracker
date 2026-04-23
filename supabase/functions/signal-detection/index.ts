/**
 * signal-detection — weekly agent that scans up to 10 companies for new
 * material signals, updates scores where warranted, and writes an audit
 * trail.
 *
 * Request:
 *   POST { company_ids: string[], week_label: string, agent_id?: string }
 *
 * Column names in this file match the existing cgt_* schema
 * (see supabase/migrations/20260416175234_create_cgt_tracker_schema.sql).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.30.1";

import {
  computeScoring,
  evaluateMateriality,
  type Subscores,
  type HardCapFlags,
  type Tier,
} from "../_shared/scoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_COMPANIES_PER_BATCH = 10;
// Haiku for high-volume structured extraction. Rate limits are ~10x
// Opus at every tier, and Haiku is more than capable of extracting
// signals from structured source dumps. Monthly re-evaluation keeps
// Opus since it re-derives scores from first principles.
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_USER_PAYLOAD_CHARS = 40_000;
const MAX_RETRIES_ON_429 = 2;

// ---------- Types ----------

interface AgentRequest {
  company_ids: string[];
  week_label: string;
  agent_id?: string;
}

interface AssetWithCompany {
  id: string;
  company_id: string;
  company_name: string;
  asset_name: string;
  lead_indication: string | null;
  phase_regulatory_status: string | null;
  // Hard-cap flags (match DB exactly)
  clinical_hold: boolean;
  no_manufacturing_pathway: boolean;
  timeline_over_24_months: boolean;
  no_us_path: boolean;
  // Contextual manufacturing / timeline text fields (for agent context, not scoring)
  manufacturing_status: string | null;
  manufacturing_pathway: string | null;
  us_commercialization_window: string | null;
  likely_us_launch_within_24_months: string | null;
  // Subscores (DB columns: <metric>_score)
  regulatory_score: number | null;
  commercial_infrastructure_score: number | null;
  market_attractiveness_score: number | null;
  capability_gap_leverage_score: number | null;
  // Outputs
  final_commercial_score: number | null;
  commercial_priority_tier: Tier | null;
  strategic_priority_tier: Tier | null;
}

interface ExtractedSignal {
  signal_type: "regulatory" | "trial" | "manufacturing" | "commercial_hiring" | "partnership" | "financial" | "other";
  source_url: string;
  source_tier: 1 | 2 | 3;
  source_domain: string;
  published_date: string | null; // ISO date
  summary: string;
  conflicts_with: string | null;
  why_it_matters: string;
  confidence: "low" | "medium" | "high";
}

interface AgentOutput {
  signals: ExtractedSignal[];
  // Agent's best current read on subscores given all sources; applied only
  // if at least one signal is present.
  current_subscores: Subscores | null;
  current_flags: HardCapFlags | null;
  notes: string;
}

// ---------- Entry ----------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  let body: AgentRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const { company_ids, week_label } = body;
  if (!Array.isArray(company_ids) || company_ids.length === 0) {
    return jsonError(400, "company_ids must be a non-empty array");
  }
  if (company_ids.length > MAX_COMPANIES_PER_BATCH) {
    return jsonError(400, `Max ${MAX_COMPANIES_PER_BATCH} companies per batch`);
  }
  if (!week_label) return jsonError(400, "week_label is required");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicKey = Deno.env.get("Claude_API_Key") ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !supabaseKey) return jsonError(500, "Supabase env not configured");
  if (!anthropicKey) return jsonError(500, "Claude_API_Key (or ANTHROPIC_API_KEY) not configured");

  const supabase = createClient(supabaseUrl, supabaseKey);
  // maxRetries: 0 — our own callWithRetry handles 429/529/503 with
  // bounded backoff. The SDK's default maxRetries=2 would stack on top
  // and push total attempts to 6, easily blowing the per-asset budget.
  // timeout: 45_000 — cap any single Anthropic request at 45s so the
  // per-asset ceiling is never dominated by a stuck SDK call.
  const anthropic = new Anthropic({ apiKey: anthropicKey, maxRetries: 0, timeout: 45_000 });

  const { data: run, error: runErr } = await supabase
    .from("cgt_agent_runs")
    .insert({
      agent_type: "signal_detection",
      mode: "weekly",
      batch_company_ids: company_ids,
      week_label,
      status: "running",
    })
    .select()
    .single();
  if (runErr || !run) return jsonError(500, `Failed to create agent run: ${runErr?.message}`);

  const totals = { signals_found: 0, material_signals: 0, score_updates: 0, errors: [] as string[] };

  try {
    const assets = await loadAssets(supabase, company_ids);

    // Process all assets in parallel. Sequential processing of a batch of
    // 10 would blow past the Supabase Edge Function ~150s timeout
    // (~32s/asset × 10 ≈ 5 min), leaving the run row stuck in "running"
    // even though per-asset writes had committed.
    // 120s is generous given each upstream fetch is now bounded to 25s
    // and the Haiku call typically returns in 5-20s. Sits comfortably
    // under the Supabase Edge Function ~150s wall-time ceiling.
    const perAssetTimeoutMs = 120_000;
    await Promise.all(
      assets.map((asset) =>
        withTimeout(
          (async () => {
            const t0 = Date.now();
            const sources = await gatherSources(asset);
            const tSources = Date.now() - t0;

            const t1 = Date.now();
            const agentOutput = await extractSignals(anthropic, asset, sources);
            const tAgent = Date.now() - t1;

            const t2 = Date.now();
            totals.signals_found += agentOutput.signals.length;

            for (const s of agentOutput.signals) {
              await persistSignal(supabase, run.id, asset, s);
            }

            if (agentOutput.signals.length > 0 && agentOutput.current_subscores && agentOutput.current_flags) {
              const updated = await applyAndGate(supabase, asset, agentOutput, run.id, week_label);
              if (updated.material) totals.material_signals += 1;
              if (updated.scoreUpdated) totals.score_updates += 1;
            }
            const tPersist = Date.now() - t2;
            console.log(`[${asset.id}] sources=${tSources}ms agent=${tAgent}ms persist=${tPersist}ms total=${Date.now()-t0}ms signals=${agentOutput.signals.length}`);
          })(),
          perAssetTimeoutMs,
          `asset ${asset.id} exceeded ${perAssetTimeoutMs}ms`
        ).catch((err) => {
          const msg = `asset ${asset.id}: ${err instanceof Error ? err.message : String(err)}`;
          console.error(msg);
          totals.errors.push(msg);
        })
      )
    );

    const status = totals.errors.length === 0 ? "succeeded" : totals.errors.length < assets.length ? "partial" : "failed";
    await supabase
      .from("cgt_agent_runs")
      .update({
        status,
        signals_found: totals.signals_found,
        material_signals: totals.material_signals,
        score_updates: totals.score_updates,
        error: totals.errors.length ? totals.errors.join("\n") : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return new Response(
      JSON.stringify({ run_id: run.id, status, ...totals }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("cgt_agent_runs")
      .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return jsonError(500, msg);
  }
});

// ---------- Data access ----------

async function loadAssets(supabase: SupabaseClient, company_ids: string[]): Promise<AssetWithCompany[]> {
  const { data, error } = await supabase
    .from("cgt_assets")
    .select(`
      id, company_id, asset_name, lead_indication, phase_regulatory_status,
      clinical_hold, no_manufacturing_pathway, timeline_over_24_months, no_us_path,
      manufacturing_status, manufacturing_pathway,
      us_commercialization_window, likely_us_launch_within_24_months,
      regulatory_score, commercial_infrastructure_score, market_attractiveness_score,
      capability_gap_leverage_score,
      final_commercial_score, commercial_priority_tier, strategic_priority_tier,
      cgt_companies!inner(id, company_name)
    `)
    .in("company_id", company_ids);
  if (error) throw new Error(`loadAssets: ${error.message}`);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    company_id: row.company_id,
    company_name: row.cgt_companies.company_name,
    asset_name: row.asset_name,
    lead_indication: row.lead_indication,
    phase_regulatory_status: row.phase_regulatory_status,
    clinical_hold: row.clinical_hold ?? false,
    no_manufacturing_pathway: row.no_manufacturing_pathway ?? false,
    timeline_over_24_months: row.timeline_over_24_months ?? false,
    no_us_path: row.no_us_path ?? false,
    manufacturing_status: row.manufacturing_status,
    manufacturing_pathway: row.manufacturing_pathway,
    us_commercialization_window: row.us_commercialization_window,
    likely_us_launch_within_24_months: row.likely_us_launch_within_24_months,
    regulatory_score: row.regulatory_score,
    commercial_infrastructure_score: row.commercial_infrastructure_score,
    market_attractiveness_score: row.market_attractiveness_score,
    capability_gap_leverage_score: row.capability_gap_leverage_score,
    final_commercial_score: row.final_commercial_score,
    commercial_priority_tier: row.commercial_priority_tier,
    strategic_priority_tier: row.strategic_priority_tier,
  }));
}

async function gatherSources(asset: AssetWithCompany) {
  const functionsBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
  };
  const body = JSON.stringify({ companyName: asset.company_name, companyId: asset.company_id });

  const endpoints = [
    { name: "sec_edgar", url: `${functionsBase}/fetch-sec-edgar-data`, tier: 1 },
    { name: "openfda", url: `${functionsBase}/fetch-openfda-data`, tier: 1 },
    { name: "pubmed", url: `${functionsBase}/fetch-pubmed-data`, tier: 2 },
  ];

  // AbortController-backed timeout so a slow upstream (cold SEC EDGAR
  // cache, PubMed lag, etc.) doesn't stall the whole asset. Whatever
  // returns in FETCH_TIMEOUT_MS is used; the rest is dropped.
  const FETCH_TIMEOUT_MS = 25_000;

  const results = await Promise.allSettled(
    endpoints.map(async (e) => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const r = await fetch(e.url, { method: "POST", headers, body, signal: ctrl.signal });
        const j = await r.json();
        return { ...e, data: j };
      } finally {
        clearTimeout(tid);
      }
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<{ name: string; url: string; tier: number; data: unknown }> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ---------- Claude ----------

async function extractSignals(
  anthropic: Anthropic,
  asset: AssetWithCompany,
  sources: Array<{ name: string; tier: number; data: unknown }>
): Promise<AgentOutput> {
  const system = `You are a CGT regulatory and commercial analyst extracting MATERIAL signals for a weekly tracker.

SCORING SUBSCORES (0-5 integers, required if you emit any signal):
  regulatory: 5=BLA accepted/PDUFA, 4=positive Ph3 filing imminent, 3=credible late Ph3, 2=early Ph3 uncertain, 1=weak, 0=hold/failure
  commercial_infrastructure: 5=full launch infra, 4=strong buildout, 3=early buildout, 2=minimal, 1=none, 0=structural gaps
  market_attractiveness: 5=high-value/low-barrier, 3=moderate, 1=constrained
  capability_gap_leverage: 5=strong asset + solvable gaps, 0=no leverage/non-viable

HARD-CAP FLAGS (booleans):
  clinical_hold, no_manufacturing_pathway, timeline_over_24_months, no_us_path

SOURCE HIERARCHY: Tier 1 = IR, press releases, SEC, FDA, ClinicalTrials.gov (PREFER). Tier 2 = investor decks, conference, publications. Tier 3 = Fierce Biotech, Endpoints, STAT.

RULES:
- NEVER infer regulatory status. Quote the source.
- Flag conflicting sources explicitly in conflicts_with.
- Only surface signals where a Tier-1 or Tier-2 source supports them.
- Be conservative. If unsure, lower confidence.
- If nothing material, return an empty signals array.`;

  const user = JSON.stringify({
    asset: {
      company: asset.company_name,
      asset: asset.asset_name,
      lead_indication: asset.lead_indication,
      phase_regulatory_status: asset.phase_regulatory_status,
      manufacturing: {
        status: asset.manufacturing_status,
        pathway: asset.manufacturing_pathway,
      },
      timeline: {
        us_commercialization_window: asset.us_commercialization_window,
        likely_us_launch_within_24_months: asset.likely_us_launch_within_24_months,
      },
      current_subscores: {
        regulatory: asset.regulatory_score,
        commercial_infrastructure: asset.commercial_infrastructure_score,
        market_attractiveness: asset.market_attractiveness_score,
        capability_gap_leverage: asset.capability_gap_leverage_score,
      },
      current_flags: {
        clinical_hold: asset.clinical_hold,
        no_manufacturing_pathway: asset.no_manufacturing_pathway,
        timeline_over_24_months: asset.timeline_over_24_months,
        no_us_path: asset.no_us_path,
      },
    },
    sources,
  }).slice(0, MAX_USER_PAYLOAD_CHARS);

  const tool = {
    name: "emit_signals",
    description: "Emit material CGT signals and the agent's current read on subscores/flags.",
    input_schema: {
      type: "object",
      properties: {
        signals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              signal_type: { type: "string", enum: ["regulatory", "trial", "manufacturing", "commercial_hiring", "partnership", "financial", "other"] },
              source_url: { type: "string" },
              source_tier: { type: "integer", enum: [1, 2, 3] },
              source_domain: { type: "string" },
              published_date: { type: ["string", "null"] },
              summary: { type: "string" },
              conflicts_with: { type: ["string", "null"] },
              why_it_matters: { type: "string" },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["signal_type", "source_url", "source_tier", "source_domain", "summary", "why_it_matters", "confidence"],
          },
        },
        current_subscores: {
          type: ["object", "null"],
          properties: {
            regulatory: { type: "integer", minimum: 0, maximum: 5 },
            commercial_infrastructure: { type: "integer", minimum: 0, maximum: 5 },
            market_attractiveness: { type: "integer", minimum: 0, maximum: 5 },
            capability_gap_leverage: { type: "integer", minimum: 0, maximum: 5 },
          },
        },
        current_flags: {
          type: ["object", "null"],
          properties: {
            clinical_hold: { type: "boolean" },
            no_manufacturing_pathway: { type: "boolean" },
            timeline_over_24_months: { type: "boolean" },
            no_us_path: { type: "boolean" },
          },
        },
        notes: { type: "string" },
      },
      required: ["signals", "notes"],
    },
  };

  const resp = await callWithRetry(() =>
    anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: "emit_signals" },
      messages: [{ role: "user", content: user }],
    })
  );

  const block = resp.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Claude did not return tool_use");
  return block.input as AgentOutput;
}

// ---------- Persistence ----------

async function persistSignal(
  supabase: SupabaseClient,
  runId: string,
  asset: AssetWithCompany,
  s: ExtractedSignal
) {
  await supabase.from("cgt_signals").insert({
    agent_run_id: runId,
    asset_id: asset.id,
    company_id: asset.company_id,
    signal_type: s.signal_type,
    source_url: s.source_url,
    source_tier: s.source_tier,
    source_domain: s.source_domain,
    published_date: s.published_date,
    raw_summary: s.summary,
    conflicts_with: s.conflicts_with,
    is_material: false,
    materiality_reasons: [],
  });
}

async function applyAndGate(
  supabase: SupabaseClient,
  asset: AssetWithCompany,
  out: AgentOutput,
  runId: string,
  weekLabel: string
): Promise<{ material: boolean; scoreUpdated: boolean }> {
  const nextSubscores = out.current_subscores as Subscores;
  const nextFlags: HardCapFlags = out.current_flags!;
  const scored = computeScoring(nextSubscores, nextFlags);

  const mat = evaluateMateriality({
    prev_final_commercial_score: asset.final_commercial_score,
    next_final_commercial_score: scored.final_commercial_score,
    prev_commercial_tier: asset.commercial_priority_tier,
    next_commercial_tier: scored.commercial_priority_tier,
    prev_strategic_tier: asset.strategic_priority_tier,
    next_strategic_tier: scored.strategic_priority_tier,
    signal_type: out.signals[0]?.signal_type,
  });

  if (!mat.is_material) return { material: false, scoreUpdated: false };

  await supabase
    .from("cgt_signals")
    .update({ is_material: true, materiality_reasons: mat.reasons })
    .eq("agent_run_id", runId)
    .eq("asset_id", asset.id);

  await supabase
    .from("cgt_assets")
    .update({
      regulatory_score: nextSubscores.regulatory,
      commercial_infrastructure_score: nextSubscores.commercial_infrastructure,
      market_attractiveness_score: nextSubscores.market_attractiveness,
      capability_gap_leverage_score: nextSubscores.capability_gap_leverage,
      clinical_hold: nextFlags.clinical_hold,
      no_manufacturing_pathway: nextFlags.no_manufacturing_pathway,
      timeline_over_24_months: nextFlags.timeline_over_24_months,
      no_us_path: nextFlags.no_us_path,
      raw_commercial_score: scored.raw_commercial_score,
      final_commercial_score: scored.final_commercial_score ?? 0,
      strategic_opportunity_score: scored.strategic_opportunity_score,
      commercial_priority_tier: scored.commercial_priority_tier,
      strategic_priority_tier: scored.strategic_priority_tier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", asset.id);

  await supabase.from("cgt_score_history").insert({
    asset_id: asset.id,
    week_label: weekLabel,
    regulatory_score: nextSubscores.regulatory,
    commercial_infrastructure_score: nextSubscores.commercial_infrastructure,
    market_attractiveness_score: nextSubscores.market_attractiveness,
    capability_gap_leverage_score: nextSubscores.capability_gap_leverage,
    raw_commercial_score: scored.raw_commercial_score,
    final_commercial_score: scored.final_commercial_score ?? 0,
    strategic_opportunity_score: scored.strategic_opportunity_score,
    commercial_priority_tier: scored.commercial_priority_tier,
    strategic_priority_tier: scored.strategic_priority_tier,
  });

  // Change-log: one row per changed field.
  const changes: Array<{ field: string; prev: unknown; next: unknown }> = [];
  if (asset.final_commercial_score !== scored.final_commercial_score)
    changes.push({ field: "final_commercial_score", prev: asset.final_commercial_score, next: scored.final_commercial_score });
  if (asset.commercial_priority_tier !== scored.commercial_priority_tier)
    changes.push({ field: "commercial_priority_tier", prev: asset.commercial_priority_tier, next: scored.commercial_priority_tier });
  if (asset.strategic_priority_tier !== scored.strategic_priority_tier)
    changes.push({ field: "strategic_priority_tier", prev: asset.strategic_priority_tier, next: scored.strategic_priority_tier });

  const primarySignal = out.signals[0];
  for (const ch of changes) {
    const delta =
      asset.final_commercial_score !== null && scored.final_commercial_score !== null
        ? scored.final_commercial_score - asset.final_commercial_score
        : null;
    await supabase.from("cgt_change_log").insert({
      asset_id: asset.id,
      update_week: weekLabel,
      agent_id: runId,
      change_type: mat.reasons.join(","),
      field_changed: ch.field,
      previous_value: String(ch.prev ?? ""),
      new_value: String(ch.next ?? ""),
      why_it_matters: primarySignal?.why_it_matters ?? mat.reasons.join(", "),
      score_impact_explanation: delta !== null ? `final_commercial_score delta: ${delta >= 0 ? "+" : ""}${delta}` : "",
      source_url: primarySignal?.source_url ?? "",
      confidence_level: primarySignal?.confidence ?? "Medium",
    });
  }

  return { material: true, scoreUpdated: true };
}

// ---------- Utils ----------

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
  ]);
}

// Retry on transient Anthropic errors (429 rate limit, 529 overloaded).
// Exponential backoff with jitter. Honors a numeric `retry-after` header
// if the SDK exposes it. Max 3 retries.
async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // deno-lint-ignore no-explicit-any
      const status = (err as any)?.status ?? (err as any)?.response?.status;
      const isRetryable = status === 429 || status === 529 || status === 503;
      if (!isRetryable || attempt === MAX_RETRIES_ON_429) throw err;
      // deno-lint-ignore no-explicit-any
      const hdr = (err as any)?.headers?.["retry-after"] ?? (err as any)?.response?.headers?.get?.("retry-after");
      const retryAfterMs = hdr ? Math.min(Number(hdr) * 1000, 30_000) : Math.min(2 ** attempt * 1000, 15_000);
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, retryAfterMs + jitter));
    }
  }
  throw lastErr;
}
