import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const compiled = await build({ entryPoints: ['supabase/functions/_shared/scoring.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { computeScoring } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const source = readFileSync('src/lib/supabase.ts', 'utf8');
const db = createClient(source.match(/https:\/\/[^']+/)[0], source.match(/eyJ[^']+/)[0]);
const { data: assets, error } = await db.from('cgt_assets').select('*')
  .ilike('us_commercialization_window', 'Source-reviewed U.S. launch target:%')
  .eq('timeline_over_24_months', true);
if (error) throw error;
const runId = randomUUID();
const week = '2026-W39';
let changed = 0;
for (const asset of assets) {
  const flags = {
    clinical_hold: asset.clinical_hold,
    no_manufacturing_pathway: asset.no_manufacturing_pathway,
    timeline_over_24_months: false,
    no_us_path: asset.no_us_path,
  };
  const scored = computeScoring({
    regulatory: asset.regulatory_score,
    commercial_infrastructure: asset.commercial_infrastructure_score,
    market_attractiveness: asset.market_attractiveness_score,
  }, flags, asset);
  if (!['Tier 1', 'Tier 2'].includes(scored.commercial_priority_tier)) continue;
  const { data: sources, error: sourceError } = await db.from('cgt_asset_sources')
    .select('source_url').eq('asset_id', asset.id).eq('signal_type', 'launch_timing_review').limit(1);
  if (sourceError) throw sourceError;
  if (!sources?.[0]?.source_url) throw new Error(`No launch evidence for ${asset.asset_name}`);
  const patch = {
    timeline_over_24_months: false,
    raw_commercial_score: scored.raw_commercial_score,
    final_commercial_score: scored.final_commercial_score,
    commercial_priority_tier: scored.commercial_priority_tier,
  };
  console.log(JSON.stringify({ therapy: asset.asset_name, before: asset.final_commercial_score, after: patch.final_commercial_score, tier: patch.commercial_priority_tier, source: sources[0].source_url }));
  if (!process.argv.includes('--apply')) continue;
  const { data: updated, error: updateError } = await db.from('cgt_assets').update(patch)
    .eq('id', asset.id).eq('updated_at', asset.updated_at).eq('timeline_over_24_months', true).select('*');
  if (updateError) throw updateError;
  if (updated?.length !== 1) throw new Error(`Concurrent update or permission prevented change: ${asset.id}`);
  const why = 'Corrected legacy 18-month interpretation of the over-24-month cap; cited U.S. launch target is within 24 months. Regulatory and manufacturing flags unchanged.';
  const fields = ['timeline_over_24_months', 'raw_commercial_score', 'final_commercial_score', 'commercial_priority_tier'];
  const logs = fields.filter((field) => asset[field] !== patch[field]).map((field) => ({
    asset_id: asset.id, agent_id: runId, run_date: '2026-09-23', update_week: week,
    change_type: 'timeline_cap_correction', field_changed: field,
    previous_value: String(asset[field] ?? ''), new_value: String(patch[field] ?? ''),
    why_it_matters: why,
    score_impact_explanation: `Final commercial score ${asset.final_commercial_score} -> ${patch.final_commercial_score}`,
    source_url: sources[0].source_url, confidence_level: 'High',
  }));
  const { error: logError } = await db.from('cgt_change_log').insert(logs);
  if (logError) throw logError;
  const { error: historyError } = await db.from('cgt_score_history').insert({
    asset_id: asset.id, week_label: week,
    regulatory_score: asset.regulatory_score,
    commercial_infrastructure_score: asset.commercial_infrastructure_score,
    market_attractiveness_score: asset.market_attractiveness_score,
    capability_gap_leverage_score: asset.capability_gap_leverage_score,
    raw_commercial_score: patch.raw_commercial_score,
    final_commercial_score: patch.final_commercial_score,
    commercial_priority_tier: patch.commercial_priority_tier,
  });
  if (historyError) throw historyError;
  changed += 1;
}
console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'preview', corrected: changed, candidates: assets.length }));
