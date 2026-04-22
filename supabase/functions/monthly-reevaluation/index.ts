/**
 * monthly-reevaluation — monthly agent that re-scores assets from first
 * principles. Unlike signal-detection (which surfaces incremental material
 * changes), this re-validates the full state of each asset: subscores,
 * timeline assumptions, and tier assignments.
 *
 * Request: POST { company_ids: string[], month_label: string }
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
const CLAUDE_MODEL = "claude-opus-4-6";
const MAX_RETRIES_ON_429 = 3;

interface Req {
  company_ids: string[];
  month_label: string;
}

interface AssetWithCompany {
  id: string;
  company_id: string;
  company_name: string;
  asset_name: string;
  lead_indication: string | null;
  phase_regulatory_status: string | null;
  clinical_hold: boolean;
  no_manufacturing_pathway: boolean;
  timeline_over_24_months: boolean;
  no_us_path: boolean;
  manufacturing_status: string | null;
  manufacturing_pathway: string | null;
  us_commercialization_window: string | null;
  likely_us_launch_within_24_months: string | null;
  final_commercial_score: number | null;
  commercial_priority_tier: Tier | null;
  strategic_priority_tier: Tier | null;
}

interface ReevalOutput {
  subscores: Subscores;
  flags: HardCapFlags;
  timeline_validation_notes: string;
  tier_rationale: string;
  sources: Array<{ url: string; tier: 1 | 2 | 3; domain: string }>;
  confidence: "low" | "medium" | "high";
  changed_fields: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return err(405, "Method not allowed");

  let body: Req;
  try { body = await req.json(); } catch { return err(400, "Invalid JSON"); }
  if (!Array.isArray(body.company_ids) || body.company_ids.length === 0) return err(400, "company_ids required");
  if (body.company_ids.length > MAX_COMPANIES_PER_BATCH) return err(400, `Max ${MAX_COMPANIES_PER_BATCH} companies per batch`);
  if (!body.month_label) return err(400, "month_label required");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicKey = Deno.env.get("Claude_API_Key") ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !supabaseKey) return err(500, "Supabase env missing");
  if (!anthropicKey) return err(500, "Claude_API_Key (or ANTHROPIC_API_KEY) missing");

  const supabase = createClient(supabaseUrl, supabaseKey);
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const { data: run, error: runErr } = await supabase
    .from("cgt_agent_runs")
    .insert({
      agent_type: "monthly_reevaluation",
      mode: "monthly",
      batch_company_ids: body.company_ids,
      week_label: body.month_label,
      status: "running",
    })
    .select()
    .single();
  if (runErr || !run) return err(500, `Failed to create run: ${runErr?.message}`);

  const totals = { assets: 0, material: 0, errors: [] as string[] };

  try {
    const assets = await loadAssets(supabase, body.company_ids);
    totals.assets = assets.length;

    // Parallel per-asset to stay under the Edge Function timeout.
    const perAssetTimeoutMs = 90_000;
    await Promise.all(
      assets.map((asset) =>
        withTimeout(
          (async () => {
            const out = await reevaluate(anthropic, asset);
            const applied = await applyAndPersist(supabase, asset, out, run.id, body.month_label);
            if (applied) totals.material += 1;
          })(),
          perAssetTimeoutMs,
          `asset ${asset.id} exceeded ${perAssetTimeoutMs}ms`
        ).catch((e) => {
          const msg = `asset ${asset.id}: ${e instanceof Error ? e.message : String(e)}`;
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
        signals_found: totals.assets,
        material_signals: totals.material,
        score_updates: totals.material,
        error: totals.errors.length ? totals.errors.join("\n") : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return json({ run_id: run.id, status, ...totals });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("cgt_agent_runs")
      .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return err(500, msg);
  }
});

async function loadAssets(supabase: SupabaseClient, company_ids: string[]): Promise<AssetWithCompany[]> {
  const { data, error } = await supabase
    .from("cgt_assets")
    .select(`
      id, company_id, asset_name, lead_indication, phase_regulatory_status,
      clinical_hold, no_manufacturing_pathway, timeline_over_24_months, no_us_path,
      manufacturing_status, manufacturing_pathway,
      us_commercialization_window, likely_us_launch_within_24_months,
      final_commercial_score, commercial_priority_tier, strategic_priority_tier,
      cgt_companies!inner(id, company_name)
    `)
    .in("company_id", company_ids);
  if (error) throw new Error(`loadAssets: ${error.message}`);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    company_id: r.company_id,
    company_name: r.cgt_companies.company_name,
    asset_name: r.asset_name,
    lead_indication: r.lead_indication,
    phase_regulatory_status: r.phase_regulatory_status,
    clinical_hold: r.clinical_hold ?? false,
    no_manufacturing_pathway: r.no_manufacturing_pathway ?? false,
    timeline_over_24_months: r.timeline_over_24_months ?? false,
    no_us_path: r.no_us_path ?? false,
    manufacturing_status: r.manufacturing_status,
    manufacturing_pathway: r.manufacturing_pathway,
    us_commercialization_window: r.us_commercialization_window,
    likely_us_launch_within_24_months: r.likely_us_launch_within_24_months,
    final_commercial_score: r.final_commercial_score,
    commercial_priority_tier: r.commercial_priority_tier,
    strategic_priority_tier: r.strategic_priority_tier,
  }));
}

async function reevaluate(anthropic: Anthropic, asset: AssetWithCompany): Promise<ReevalOutput> {
  const system = `You are a CGT regulatory and commercial analyst performing a MONTHLY re-evaluation from FIRST PRINCIPLES.

Do not anchor to prior scores. Re-derive subscores (0-5) for:
  regulatory (5=BLA accepted/PDUFA, 4=positive Ph3 filing imminent, 3=credible late Ph3, 2=early Ph3 uncertain, 1=weak, 0=hold/failure),
  commercial_infrastructure (5=full launch infra, 4=strong buildout, 3=early buildout, 2=minimal, 1=none, 0=structural gaps),
  market_attractiveness (5=high-value/low-barrier, 3=moderate, 1=constrained),
  capability_gap_leverage (5=strong asset + solvable gaps, 0=no leverage/non-viable).

Validate hard-cap flags explicitly (booleans):
  clinical_hold, no_manufacturing_pathway, timeline_over_24_months, no_us_path.

Validate the 24-month commercialization window against the most recent public statements.

Source hierarchy: Tier 1 (IR, SEC, FDA, ClinicalTrials.gov) > Tier 2 (investor decks, pubs) > Tier 3 (trade press). Provide 1-3 sources. Never infer regulatory status.`;

  const user = JSON.stringify({
    asset: {
      company: asset.company_name,
      asset: asset.asset_name,
      lead_indication: asset.lead_indication,
      phase_regulatory_status: asset.phase_regulatory_status,
      manufacturing: { status: asset.manufacturing_status, pathway: asset.manufacturing_pathway },
      timeline: {
        us_commercialization_window: asset.us_commercialization_window,
        likely_us_launch_within_24_months: asset.likely_us_launch_within_24_months,
      },
      prior_state_FYI_ONLY: {
        clinical_hold: asset.clinical_hold,
        no_manufacturing_pathway: asset.no_manufacturing_pathway,
        timeline_over_24_months: asset.timeline_over_24_months,
        no_us_path: asset.no_us_path,
      },
    },
  });

  const tool = {
    name: "emit_reevaluation",
    description: "Emit a first-principles re-evaluation of this asset.",
    input_schema: {
      type: "object",
      properties: {
        subscores: {
          type: "object",
          properties: {
            regulatory: { type: "integer", minimum: 0, maximum: 5 },
            commercial_infrastructure: { type: "integer", minimum: 0, maximum: 5 },
            market_attractiveness: { type: "integer", minimum: 0, maximum: 5 },
            capability_gap_leverage: { type: "integer", minimum: 0, maximum: 5 },
          },
          required: ["regulatory", "commercial_infrastructure", "market_attractiveness", "capability_gap_leverage"],
        },
        flags: {
          type: "object",
          properties: {
            clinical_hold: { type: "boolean" },
            no_manufacturing_pathway: { type: "boolean" },
            timeline_over_24_months: { type: "boolean" },
            no_us_path: { type: "boolean" },
          },
          required: ["clinical_hold", "no_manufacturing_pathway", "timeline_over_24_months", "no_us_path"],
        },
        timeline_validation_notes: { type: "string" },
        tier_rationale: { type: "string" },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              tier: { type: "integer", enum: [1, 2, 3] },
              domain: { type: "string" },
            },
            required: ["url", "tier", "domain"],
          },
        },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        changed_fields: { type: "array", items: { type: "string" } },
      },
      required: ["subscores", "flags", "timeline_validation_notes", "sources", "confidence", "changed_fields"],
    },
  };

  const resp = await callWithRetry(() =>
    anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: "emit_reevaluation" },
      messages: [{ role: "user", content: user }],
    })
  );

  const block = resp.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Claude did not return tool_use");
  return block.input as ReevalOutput;
}

async function applyAndPersist(
  supabase: SupabaseClient,
  asset: AssetWithCompany,
  out: ReevalOutput,
  runId: string,
  monthLabel: string
): Promise<boolean> {
  const scored = computeScoring(out.subscores, out.flags);

  const mat = evaluateMateriality({
    prev_final_commercial_score: asset.final_commercial_score,
    next_final_commercial_score: scored.final_commercial_score,
    prev_commercial_tier: asset.commercial_priority_tier,
    next_commercial_tier: scored.commercial_priority_tier,
    prev_strategic_tier: asset.strategic_priority_tier,
    next_strategic_tier: scored.strategic_priority_tier,
  });

  const primary = out.sources[0];
  await supabase.from("cgt_signals").insert({
    agent_run_id: runId,
    asset_id: asset.id,
    company_id: asset.company_id,
    signal_type: "other",
    source_url: primary?.url ?? "",
    source_tier: primary?.tier ?? 2,
    source_domain: primary?.domain ?? "",
    raw_summary: `MONTHLY REEVAL: ${out.tier_rationale}. Timeline: ${out.timeline_validation_notes}`,
    is_material: mat.is_material,
    materiality_reasons: mat.reasons,
  });

  // Always append score history on monthly runs.
  await supabase.from("cgt_score_history").insert({
    asset_id: asset.id,
    week_label: monthLabel,
    regulatory_score: out.subscores.regulatory,
    commercial_infrastructure_score: out.subscores.commercial_infrastructure,
    market_attractiveness_score: out.subscores.market_attractiveness,
    capability_gap_leverage_score: out.subscores.capability_gap_leverage,
    raw_commercial_score: scored.raw_commercial_score,
    final_commercial_score: scored.final_commercial_score ?? 0,
    strategic_opportunity_score: scored.strategic_opportunity_score,
    commercial_priority_tier: scored.commercial_priority_tier,
    strategic_priority_tier: scored.strategic_priority_tier,
  });

  if (!mat.is_material) return false;

  await supabase
    .from("cgt_assets")
    .update({
      regulatory_score: out.subscores.regulatory,
      commercial_infrastructure_score: out.subscores.commercial_infrastructure,
      market_attractiveness_score: out.subscores.market_attractiveness,
      capability_gap_leverage_score: out.subscores.capability_gap_leverage,
      clinical_hold: out.flags.clinical_hold,
      no_manufacturing_pathway: out.flags.no_manufacturing_pathway,
      timeline_over_24_months: out.flags.timeline_over_24_months,
      no_us_path: out.flags.no_us_path,
      raw_commercial_score: scored.raw_commercial_score,
      final_commercial_score: scored.final_commercial_score ?? 0,
      strategic_opportunity_score: scored.strategic_opportunity_score,
      commercial_priority_tier: scored.commercial_priority_tier,
      strategic_priority_tier: scored.strategic_priority_tier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", asset.id);

  const changes: Array<{ field: string; prev: unknown; next: unknown }> = [];
  if (asset.final_commercial_score !== scored.final_commercial_score)
    changes.push({ field: "final_commercial_score", prev: asset.final_commercial_score, next: scored.final_commercial_score });
  if (asset.commercial_priority_tier !== scored.commercial_priority_tier)
    changes.push({ field: "commercial_priority_tier", prev: asset.commercial_priority_tier, next: scored.commercial_priority_tier });
  if (asset.strategic_priority_tier !== scored.strategic_priority_tier)
    changes.push({ field: "strategic_priority_tier", prev: asset.strategic_priority_tier, next: scored.strategic_priority_tier });

  for (const ch of changes) {
    const delta =
      asset.final_commercial_score !== null && scored.final_commercial_score !== null
        ? scored.final_commercial_score - asset.final_commercial_score
        : null;
    await supabase.from("cgt_change_log").insert({
      asset_id: asset.id,
      update_week: monthLabel,
      agent_id: runId,
      change_type: `monthly_reeval:${mat.reasons.join(",")}`,
      field_changed: ch.field,
      previous_value: String(ch.prev ?? ""),
      new_value: String(ch.next ?? ""),
      why_it_matters: out.tier_rationale,
      score_impact_explanation: delta !== null ? `final_commercial_score delta: ${delta >= 0 ? "+" : ""}${delta}` : "",
      source_url: primary?.url ?? "",
      confidence_level: out.confidence,
    });
  }

  return true;
}

function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function json(obj: unknown) {
  return new Response(JSON.stringify(obj), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)),
  ]);
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // deno-lint-ignore no-explicit-any
      const status = (e as any)?.status ?? (e as any)?.response?.status;
      const isRetryable = status === 429 || status === 529 || status === 503;
      if (!isRetryable || attempt === MAX_RETRIES_ON_429) throw e;
      // deno-lint-ignore no-explicit-any
      const hdr = (e as any)?.headers?.["retry-after"] ?? (e as any)?.response?.headers?.get?.("retry-after");
      const retryAfterMs = hdr ? Math.min(Number(hdr) * 1000, 30_000) : Math.min(2 ** attempt * 1000, 15_000);
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, retryAfterMs + jitter));
    }
  }
  throw lastErr;
}
