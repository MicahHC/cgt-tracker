/**
 * CGT scoring module — single source of truth for commercial readiness,
 * strategic opportunity, hard caps, and tier assignment.
 *
 * Spec:
 *   Subscores: 0–5 integers. Regulatory, Commercial Infrastructure, Market,
 *   Capability Gap.
 *
 *   Commercial Readiness Score (0–100):
 *     40% Regulatory, 35% Commercial Infrastructure, 25% Market
 *
 *   Strategic Opportunity Score (0–100):
 *     40% Regulatory, 30% Market, 30% Capability Gap
 *
 *   Hard caps (applied AFTER raw → 0–100 scale):
 *     - clinical_hold           → cap 30
 *     - no_manufacturing_pathway → cap 40
 *     - timeline_over_24_months → cap 50
 *     - no_us_path              → excluded entirely (final = null)
 *
 *   Commercial tier:
 *     - Tier 1 if the asset is likely to commercialize in the next 24 months
 *       (i.e., timeline_over_24_months = false AND no_us_path = false)
 *     - Tier 2 otherwise
 *     - Excluded if no_us_path = true
 */

export type Subscore = 0 | 1 | 2 | 3 | 4 | 5;

export interface Subscores {
  regulatory: Subscore;
  commercial_infrastructure: Subscore;
  market_attractiveness: Subscore;
  capability_gap_leverage: Subscore;
}

export interface HardCapFlags {
  clinical_hold: boolean;
  no_manufacturing_pathway: boolean;
  timeline_over_24_months: boolean;
  no_us_path: boolean;
}

export type Tier = "Tier 1" | "Tier 2" | "Excluded";

export interface CapResult {
  final_score: number | null; // null = excluded
  cap_applied: "clinical_hold" | "no_manufacturing_pathway" | "timeline_over_24_months" | "no_us_path" | null;
  raw_score: number;
}

export interface ScoringOutput {
  raw_commercial_score: number;
  final_commercial_score: number | null;
  strategic_opportunity_score: number;
  commercial_priority_tier: Tier;
  strategic_priority_tier: Tier;
  cap_applied: CapResult["cap_applied"];
}

// Validate that subscores are integers in [0,5]. Throws on violation so
// agents fail loudly rather than writing garbage.
export function validateSubscores(s: Subscores): void {
  const entries: Array<[string, number]> = [
    ["regulatory", s.regulatory],
    ["commercial_infrastructure", s.commercial_infrastructure],
    ["market_attractiveness", s.market_attractiveness],
    ["capability_gap_leverage", s.capability_gap_leverage],
  ];
  for (const [name, v] of entries) {
    if (!Number.isInteger(v) || v < 0 || v > 5) {
      throw new Error(`Invalid subscore: ${name}=${v} (must be integer in [0,5])`);
    }
  }
}

/**
 * Commercial Readiness — raw 0–100, before caps.
 * Weights: Reg 40% / Commercial 35% / Market 25%.
 */
export function computeCommercialReadinessRaw(s: Subscores): number {
  validateSubscores(s);
  const weighted =
    0.40 * s.regulatory +
    0.35 * s.commercial_infrastructure +
    0.25 * s.market_attractiveness;
  // Subscores are 0–5, so weighted is 0–5. Scale to 0–100 and round.
  return Math.round((weighted / 5) * 100);
}

/**
 * Strategic Opportunity — 0–100. Weights: Reg 40% / Market 30% / Capability 30%.
 * Not subject to hard caps per spec.
 */
export function computeStrategicOpportunity(s: Subscores): number {
  validateSubscores(s);
  const weighted =
    0.40 * s.regulatory +
    0.30 * s.market_attractiveness +
    0.30 * s.capability_gap_leverage;
  return Math.round((weighted / 5) * 100);
}

/**
 * Apply hard caps in spec order. Lowest applicable cap wins; no_us_path
 * returns null (excluded). `cap_applied` reports the first cap that bound
 * the score, for audit transparency.
 */
export function applyHardCaps(raw: number, flags: HardCapFlags): CapResult {
  if (flags.no_us_path) {
    return { final_score: null, cap_applied: "no_us_path", raw_score: raw };
  }

  const candidates: Array<[number, CapResult["cap_applied"]]> = [];
  if (flags.clinical_hold) candidates.push([30, "clinical_hold"]);
  if (flags.no_manufacturing_pathway) candidates.push([40, "no_manufacturing_pathway"]);
  if (flags.timeline_over_24_months) candidates.push([50, "timeline_over_24_months"]);

  if (candidates.length === 0) {
    return { final_score: raw, cap_applied: null, raw_score: raw };
  }

  // Lowest cap wins; report which cap bound the score.
  candidates.sort((a, b) => a[0] - b[0]);
  const [lowestCap, lowestReason] = candidates[0];
  if (raw <= lowestCap) {
    // Raw already below the cap — no cap materially applied.
    return { final_score: raw, cap_applied: null, raw_score: raw };
  }
  return { final_score: lowestCap, cap_applied: lowestReason, raw_score: raw };
}

/**
 * Commercial priority tier — driven by 24-month commercialization window,
 * NOT by score. Score is used for prioritization within a tier.
 */
export function assignCommercialTier(flags: HardCapFlags): Tier {
  if (flags.no_us_path) return "Excluded";
  if (flags.timeline_over_24_months) return "Tier 2";
  return "Tier 1";
}

/**
 * Strategic priority tier — mirrors commercial tier's exclusion rule but
 * is otherwise score-independent; timeline is the same gating factor.
 * Adjust here if strategic tiering should diverge from commercial.
 */
export function assignStrategicTier(flags: HardCapFlags): Tier {
  if (flags.no_us_path) return "Excluded";
  if (flags.timeline_over_24_months) return "Tier 2";
  return "Tier 1";
}

/**
 * End-to-end: subscores + flags → all outputs ready to persist.
 */
export function computeScoring(s: Subscores, flags: HardCapFlags): ScoringOutput {
  const raw = computeCommercialReadinessRaw(s);
  const capped = applyHardCaps(raw, flags);
  const strategic = computeStrategicOpportunity(s);
  return {
    raw_commercial_score: raw,
    final_commercial_score: capped.final_score,
    strategic_opportunity_score: strategic,
    commercial_priority_tier: assignCommercialTier(flags),
    strategic_priority_tier: assignStrategicTier(flags),
    cap_applied: capped.cap_applied,
  };
}

/**
 * Materiality: determine whether a change merits a cgt_change_log row.
 * Per spec, a change is material if ANY of:
 *   - commercial final score delta ≥ 5
 *   - regulatory update (field change in regulatory domain)
 *   - manufacturing signal (field change in manufacturing domain)
 *   - commercial hiring (field change in commercial hiring domain)
 *   - tier change (commercial or strategic)
 */
export interface MaterialityInputs {
  prev_final_commercial_score: number | null;
  next_final_commercial_score: number | null;
  prev_commercial_tier: Tier | null;
  next_commercial_tier: Tier;
  prev_strategic_tier: Tier | null;
  next_strategic_tier: Tier;
  signal_type?: "regulatory" | "trial" | "manufacturing" | "commercial_hiring" | "partnership" | "financial" | "other";
}

export function evaluateMateriality(inputs: MaterialityInputs): {
  is_material: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  const prev = inputs.prev_final_commercial_score;
  const next = inputs.next_final_commercial_score;
  if (prev !== null && next !== null && Math.abs(next - prev) >= 5) {
    reasons.push("score_delta_ge_5");
  }
  // Transition to/from excluded is itself material.
  if ((prev === null) !== (next === null)) {
    reasons.push("exclusion_status_change");
  }

  if (inputs.prev_commercial_tier && inputs.prev_commercial_tier !== inputs.next_commercial_tier) {
    reasons.push("commercial_tier_change");
  }
  if (inputs.prev_strategic_tier && inputs.prev_strategic_tier !== inputs.next_strategic_tier) {
    reasons.push("strategic_tier_change");
  }

  switch (inputs.signal_type) {
    case "regulatory":
      reasons.push("regulatory_update");
      break;
    case "manufacturing":
      reasons.push("manufacturing_signal");
      break;
    case "commercial_hiring":
      reasons.push("commercial_hiring");
      break;
  }

  return { is_material: reasons.length > 0, reasons };
}
