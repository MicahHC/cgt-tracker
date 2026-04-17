import { CgtAsset, Segment, Tier } from '../types/database';

export interface ScoreBreakdown {
  rawCommercial: number;
  finalCommercial: number;
  strategic: number;
  commercialTier: Tier | null;
  strategicTier: Tier | null;
  caps: string[];
}

export function calculateCommercialReadiness(asset: Pick<CgtAsset,
  'regulatory_score' | 'commercial_infrastructure_score' | 'market_attractiveness_score' |
  'clinical_hold' | 'no_manufacturing_pathway' | 'timeline_over_24_months' | 'no_us_path'
>): { raw: number; final: number; caps: string[] } {
  const raw = Math.round(
    asset.regulatory_score * 0.4 * 20 +
    asset.commercial_infrastructure_score * 0.35 * 20 +
    asset.market_attractiveness_score * 0.25 * 20
  );
  let final = raw;
  const caps: string[] = [];
  if (asset.no_us_path) {
    final = 0;
    caps.push('No US path: score set to 0');
  } else {
    if (asset.clinical_hold) {
      if (final > 30) caps.push('Clinical hold: capped at 30');
      final = Math.min(final, 30);
    }
    if (asset.no_manufacturing_pathway) {
      if (final > 40) caps.push('No manufacturing pathway: capped at 40');
      final = Math.min(final, 40);
    }
    if (asset.timeline_over_24_months) {
      if (final > 50) caps.push('Timeline over 24 months: capped at 50');
      final = Math.min(final, 50);
    }
  }
  return { raw, final, caps };
}

export function calculateStrategicOpportunity(asset: Pick<CgtAsset,
  'regulatory_score' | 'market_attractiveness_score' | 'capability_gap_leverage_score'
>): number {
  return Math.round(
    asset.regulatory_score * 0.4 * 20 +
    asset.market_attractiveness_score * 0.3 * 20 +
    asset.capability_gap_leverage_score * 0.3 * 20
  );
}

export function assignCommercialTier(score: number, segment: Segment): Tier | null {
  if (segment !== 'Late Stage') return null;
  if (score >= 80) return 'Tier 1';
  if (score >= 65) return 'Tier 2';
  if (score >= 50) return 'Watchlist';
  return 'Deprioritized';
}

export function assignStrategicTier(score: number): Tier {
  if (score >= 80) return 'Tier 1';
  if (score >= 65) return 'Tier 2';
  if (score >= 50) return 'Watchlist';
  return 'Deprioritized';
}

export function computeAllScores(asset: CgtAsset): ScoreBreakdown {
  const commercial = calculateCommercialReadiness(asset);
  const strategic = calculateStrategicOpportunity(asset);
  return {
    rawCommercial: commercial.raw,
    finalCommercial: commercial.final,
    strategic,
    commercialTier: assignCommercialTier(commercial.final, asset.segment),
    strategicTier: assignStrategicTier(strategic),
    caps: commercial.caps,
  };
}

export const REGULATORY_RUBRIC: Record<number, string> = {
  5: 'BLA accepted / PDUFA / near-term regulatory milestone',
  4: 'Positive Phase 3, filing imminent',
  3: 'Credible late-stage pathway',
  2: 'Active Phase 3 with meaningful uncertainty',
  1: 'Weak or ambiguous signal',
  0: 'Hold, failure, or no credible path',
};

export const COMMERCIAL_INFRA_RUBRIC: Record<number, string> = {
  5: 'Full launch infrastructure visible',
  4: 'Major buildout underway',
  3: 'Early visible buildout',
  2: 'Minimal readiness',
  1: 'Little visible preparation',
  0: 'Structural launch barriers',
};

export const MARKET_ATTRACTIVENESS_RUBRIC: Record<number, string> = {
  5: 'Strong commercial opportunity with manageable barriers',
  4: 'Above-average commercial opportunity',
  3: 'Moderate opportunity',
  2: 'Below-average opportunity',
  1: 'Highly constrained opportunity',
  0: 'Not commercially viable',
};

export const CAPABILITY_GAP_RUBRIC: Record<number, string> = {
  5: 'Strong asset with clear solvable gaps a partner could address',
  4: 'Meaningful gaps a partner could address',
  3: 'Some partner leverage available',
  2: 'Limited partner leverage',
  1: 'Minimal partner leverage',
  0: 'Non-viable or fully self-sufficient',
};

export function tierColor(tier: Tier | null | undefined): string {
  switch (tier) {
    case 'Tier 1': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Tier 2': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Watchlist': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Deprioritized': return 'bg-slate-100 text-slate-600 border-slate-200';
    default: return 'bg-slate-50 text-slate-500 border-slate-200';
  }
}
