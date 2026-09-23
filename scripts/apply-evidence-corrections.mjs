import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const manifest = JSON.parse(readFileSync('data/evidence-corrections-2026-09-23.json', 'utf8'));
const compiled = await build({ entryPoints: ['supabase/functions/_shared/scoring.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { computeScoring } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const source = readFileSync('src/lib/supabase.ts', 'utf8');
const db = createClient(source.match(/https:\/\/[^']+/)[0], source.match(/eyJ[^']+/)[0]);
const runId = randomUUID();
const applying = process.argv.includes('--apply');
let applied = 0;

for (const correction of manifest.corrections) {
  if (!correction.reason || !correction.sources?.length || correction.sources.length > 3 || correction.source_dates?.length !== correction.sources.length) throw new Error(`Missing evidence or source dates: ${correction.asset_id}`);
  const { data: asset, error: assetError } = await db.from('cgt_assets').select('*').eq('id', correction.asset_id).single();
  if (assetError) throw assetError;
  const note = `Evidence correction ${manifest.reviewed_at}: ${correction.reason}`;
  const next = { ...asset, ...correction.patch };
  const scored = computeScoring({
    regulatory: asset.regulatory_score,
    commercial_infrastructure: asset.commercial_infrastructure_score,
    market_attractiveness: asset.market_attractiveness_score,
  }, {
    clinical_hold: next.clinical_hold,
    no_manufacturing_pathway: next.no_manufacturing_pathway,
    timeline_over_24_months: next.timeline_over_24_months,
    no_us_path: next.no_us_path,
  }, next);
  const patch = {
    ...correction.patch,
    raw_commercial_score: scored.raw_commercial_score,
    final_commercial_score: scored.final_commercial_score,
    commercial_priority_tier: next.segment === 'On-Market' ? null : scored.commercial_priority_tier,
    latest_material_update: asset.latest_material_update?.includes(note) ? asset.latest_material_update : [asset.latest_material_update, note].filter(Boolean).join('\n'),
    last_reviewed_at: `${manifest.reviewed_at}T00:00:00.000Z`,
  };
  const changes = Object.entries(patch).filter(([field, value]) => field === 'last_reviewed_at'
    ? new Date(asset[field] || 0).getTime() !== new Date(value).getTime()
    : asset[field] !== value);
  if (!changes.length && !applying) continue;
  console.log(JSON.stringify({ therapy: asset.asset_name, score: `${asset.final_commercial_score} -> ${patch.final_commercial_score}`, changes: changes.map(([field]) => field), sources: correction.sources }));
  if (!applying) continue;
  if (asset.lock_status?.toLowerCase() === 'locked') throw new Error(`Asset locked: ${asset.id}`);
  for (const [index, url] of correction.sources.entries()) {
    const { data: exists, error: sourceError } = await db.from('cgt_asset_sources').select('id, source_date').eq('asset_id', asset.id).eq('source_url', url).limit(1);
    if (sourceError) throw sourceError;
    if (exists?.length) {
      if (exists[0].source_date !== correction.source_dates[index]) {
        const { error: dateError } = await db.from('cgt_asset_sources').update({ source_date: correction.source_dates[index] }).eq('id', exists[0].id);
        if (dateError) throw dateError;
      }
      continue;
    }
    const { error: insertError } = await db.from('cgt_asset_sources').insert({
      asset_id: asset.id, source_type: 'Primary', source_title: `Evidence correction: ${asset.asset_name}`,
      source_url: url, source_domain: new URL(url).hostname, source_date: correction.source_dates[index],
      is_primary_source: true, signal_type: 'evidence_correction', notes: correction.reason,
    });
    if (insertError) throw insertError;
  }
  if (!changes.length) continue;
  const { data: saved, error: updateError } = await db.from('cgt_assets').update(patch)
    .eq('id', asset.id).eq('updated_at', asset.updated_at).select('*');
  if (updateError) throw updateError;
  if (saved?.length !== 1) throw new Error(`Concurrent update or permission prevented change: ${asset.id}`);
  const logs = changes.filter(([field]) => field !== 'last_reviewed_at').map(([field, value]) => ({
    asset_id: asset.id, agent_id: runId, run_date: manifest.reviewed_at, update_week: '2026-W39',
    change_type: 'evidence_correction', field_changed: field,
    previous_value: String(asset[field] ?? ''), new_value: String(value ?? ''),
    why_it_matters: correction.reason,
    score_impact_explanation: `Final commercial score ${asset.final_commercial_score} -> ${patch.final_commercial_score}; on-market/non-CGT records are not launch audiences`,
    source_url: correction.sources[0], confidence_level: 'High',
  }));
  const { error: logError } = await db.from('cgt_change_log').insert(logs);
  if (logError) throw logError;
  const { error: historyError } = await db.from('cgt_score_history').insert({
    asset_id: asset.id, week_label: '2026-W39', regulatory_score: asset.regulatory_score,
    commercial_infrastructure_score: asset.commercial_infrastructure_score,
    market_attractiveness_score: asset.market_attractiveness_score,
    capability_gap_leverage_score: asset.capability_gap_leverage_score,
    raw_commercial_score: patch.raw_commercial_score,
    final_commercial_score: patch.final_commercial_score,
    commercial_priority_tier: patch.commercial_priority_tier,
  });
  if (historyError) throw historyError;
  for (const [field, value] of Object.entries(patch)) {
    const actual = saved[0][field];
    if (field === 'last_reviewed_at' ? new Date(actual).getTime() !== new Date(value).getTime() : actual !== value) {
      throw new Error(`Read-back mismatch ${asset.id}.${field}`);
    }
  }
  applied += 1;
}
console.log(JSON.stringify({ mode: applying ? 'apply' : 'preview', applied }));
