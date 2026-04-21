/**
 * discovery — weekly agent that searches for CGT companies and assets not
 * yet tracked. Writes candidates to cgt_companies with status='candidate'
 * so an analyst can review and promote to 'active'. Does NOT score.
 *
 * Request: POST { week_label: string, search_focus?: string }
 *
 * Output: cgt_agent_runs row; candidate companies inserted with source URLs.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.30.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CLAUDE_MODEL = "claude-opus-4-6";

interface DiscoveryRequest {
  week_label: string;
  search_focus?: string;
}

interface CandidateCompany {
  name: string;
  ticker: string | null;
  website: string | null;
  asset_name: string;
  indication: string;
  modality: string; // CAR-T | gene therapy | TCR | NK | other
  estimated_phase: string | null;
  likely_commercialization_window: "within_24_months" | "beyond_24_months" | "unknown";
  rationale: string;
  sources: Array<{ url: string; tier: 1 | 2 | 3; domain: string }>;
  confidence: "low" | "medium" | "high";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return err(405, "Method not allowed");

  const body: DiscoveryRequest = await req.json().catch(() => ({} as DiscoveryRequest));
  if (!body.week_label) return err(400, "week_label required");

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
      agent_type: "discovery",
      mode: "weekly",
      week_label: body.week_label,
      status: "running",
    })
    .select()
    .single();
  if (runErr || !run) return err(500, `Failed to create run: ${runErr?.message}`);

  try {
    const existing = await loadExistingCompanyNames(supabase);
    const candidates = await discover(anthropic, existing, body.search_focus);

    let inserted = 0;
    let skipped = 0;
    for (const c of candidates) {
      const norm = c.name.trim().toLowerCase();
      if (existing.has(norm)) {
        skipped += 1;
        continue;
      }
      const ok = await persistCandidate(supabase, c, run.id);
      if (ok) inserted += 1;
    }

    await supabase
      .from("cgt_agent_runs")
      .update({
        status: "succeeded",
        signals_found: candidates.length,
        material_signals: inserted, // reuse field for candidate count
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return json({ run_id: run.id, candidates_found: candidates.length, inserted, skipped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("cgt_agent_runs")
      .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return err(500, msg);
  }
});

async function loadExistingCompanyNames(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("cgt_companies").select("company_name");
  if (error) throw new Error(`loadExistingCompanyNames: ${error.message}`);
  // deno-lint-ignore no-explicit-any
  return new Set((data ?? []).map((r: any) => String(r.company_name).trim().toLowerCase()));
}

async function discover(
  anthropic: Anthropic,
  existing: Set<string>,
  searchFocus: string | undefined
): Promise<CandidateCompany[]> {
  const system = `You are a CGT (cell & gene therapy) market scout. Identify companies with assets likely to commercialize in the U.S. within the next 24 months that are NOT in the provided exclusion list.

SCOPE:
- Autologous/allogeneic cell therapies (CAR-T, TCR, NK, TIL)
- Gene therapies (AAV, LV, gene editing)
- Regenerative / iPSC-derived therapies

INCLUDE only if:
- Clear U.S. regulatory path (do not include EU-only or ex-US-only assets)
- Indication has meaningful commercial potential
- There is a public, Tier-1 or Tier-2 source you can cite (IR, press release, SEC, FDA, ClinicalTrials.gov, investor deck, publication)

RULES:
- NEVER fabricate or infer regulatory status.
- Provide 1-3 sources per candidate with URLs.
- Be conservative — if evidence is weak, lower confidence.
- Return at most 15 candidates per run.`;

  const user = JSON.stringify({
    exclude_names: Array.from(existing).slice(0, 500),
    search_focus: searchFocus ?? "any CGT commercializing within 24 months in the U.S.",
    instructions: "Return candidates via the emit_candidates tool.",
  });

  const tool = {
    name: "emit_candidates",
    description: "Emit CGT company/asset candidates for human review.",
    input_schema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              ticker: { type: ["string", "null"] },
              website: { type: ["string", "null"] },
              asset_name: { type: "string" },
              indication: { type: "string" },
              modality: { type: "string" },
              estimated_phase: { type: ["string", "null"] },
              likely_commercialization_window: { type: "string", enum: ["within_24_months", "beyond_24_months", "unknown"] },
              rationale: { type: "string" },
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
            },
            required: ["name", "asset_name", "indication", "modality", "likely_commercialization_window", "rationale", "sources", "confidence"],
          },
        },
      },
      required: ["candidates"],
    },
  };

  const resp = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: "emit_candidates" },
    messages: [{ role: "user", content: user }],
  });

  const block = resp.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Claude did not return tool_use");
  const out = block.input as { candidates: CandidateCompany[] };
  return out.candidates ?? [];
}

async function persistCandidate(
  supabase: SupabaseClient,
  c: CandidateCompany,
  runId: string
): Promise<boolean> {
  const { data: company, error: cErr } = await supabase
    .from("cgt_companies")
    .insert({
      company_name: c.name,
      ticker: c.ticker,
      website: c.website,
      status: "candidate",
    })
    .select()
    .single();
  if (cErr || !company) {
    console.error(`persistCandidate company insert failed: ${cErr?.message}`);
    return false;
  }

  // Record discovery rationale as a (non-material) signal for audit
  const primary = c.sources[0];
  await supabase.from("cgt_signals").insert({
    agent_run_id: runId,
    company_id: company.id,
    signal_type: "other",
    source_url: primary?.url ?? "",
    source_tier: primary?.tier ?? 3,
    source_domain: primary?.domain ?? "",
    raw_summary: `DISCOVERY: ${c.asset_name} (${c.indication}, ${c.modality}). ${c.rationale}`,
    is_material: false,
    materiality_reasons: ["discovery_candidate"],
  });

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
