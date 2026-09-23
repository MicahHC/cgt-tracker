import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const compiled = await build({ entryPoints: ['src/lib/commercialization.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { assessLaunch } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const source = readFileSync('src/lib/supabase.ts', 'utf8');
const db = createClient(source.match(/https:\/\/[^']+/)[0], source.match(/eyJ[^']+/)[0]);
async function all(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select('*').order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
const inputs = JSON.parse(readFileSync('data/launch-reviews-2026-09-23.json', 'utf8'));
const reviewById = new Map(inputs.reviews.map(r => [r.asset_id, r]));
const assets = await all('cgt_assets');
const companies = await all('cgt_companies');
const companyById = new Map(companies.map(c => [c.id, c.company_name]));
const now = new Date();
// Identify legacy near-term estimates for review, not for verified inclusion.
const candidates = new Set(assets.filter(asset => assessLaunch({
  ...asset,
  us_commercialization_window: `Source-reviewed U.S. launch target: ${(asset.us_commercialization_window || '').replace(/^Source-reviewed U\.S\. launch target:\s*/i, '')}`,
}, now).priority).map(asset => asset.id));
const runId = randomUUID();
const auditDir = 'health-checks/validation-2026-09-23';
mkdirSync(auditDir, { recursive: true });
const planPath = `${auditDir}/corrections-${now.toISOString().replace(/[:.]/g, '-')}.json`;
const plan = { run_id: runId, created_at: now.toISOString(), mode: process.argv.includes('--apply') ? 'apply' : 'preview', rows: [], skipped_locked: [] };
for (const asset of assets) {
  const review = reviewById.get(asset.id);
  const unverified = /^Unverified U\.S\. launch timing/i.test(asset.us_commercialization_window || '');
  if (!review && !candidates.has(asset.id) && !unverified && !['Tier 1', 'Tier 2'].includes(asset.commercial_priority_tier)) continue;
  const patch = { ...(review?.patch ?? {}) };
  const reason = review?.reason ?? 'Launch date has not passed primary-source review. Retained for research, but not counted as a source-supported priority audience. This is not a finding that the therapy cannot launch.';
  if (review?.launch_target) {
    if (!review.sources?.length) throw new Error(`No evidence for ${asset.id}`);
    patch.us_commercialization_window = `Source-reviewed U.S. launch target: ${review.launch_target}; conditional company forecast, not a guaranteed launch`;
    patch.likely_us_launch_within_24_months = 'Yes';
  } else if (review || candidates.has(asset.id) || unverified) {
    // Keep the old date in the append-only log, not in a field legacy clients parse.
    patch.us_commercialization_window = 'Unverified U.S. launch timing; source review required';
    patch.likely_us_launch_within_24_months = 'Uncertain';
  }
  const next = { ...asset, ...patch };
  const priority = assessLaunch(next, now).priority;
  patch.commercial_priority_tier = next.no_us_path ? 'Excluded' : next.segment === 'On-Market' ? null : priority === 'Priority 1' ? 'Tier 1' : priority === 'Priority 2' ? 'Tier 2' : 'Watchlist';
  if (review) {
    const note = `Launch evidence review ${inputs.reviewed_at}: ${reason}`;
    patch.latest_material_update = asset.latest_material_update?.includes(note) ? asset.latest_material_update : [asset.latest_material_update, note].filter(Boolean).join('\n');
    patch.last_reviewed_at = `${inputs.reviewed_at}T00:00:00.000Z`;
  }
  const changes = Object.entries(patch).filter(([key, value]) => key === 'last_reviewed_at'
    ? new Date(asset[key] || 0).getTime() !== new Date(value).getTime()
    : asset[key] !== value);
  if (!changes.length) continue;
  if (asset.lock_status?.toLowerCase() === 'locked') {
    plan.skipped_locked.push({ id: asset.id, therapy: asset.asset_name });
    continue;
  }
  plan.rows.push({ id: asset.id, company: companyById.get(asset.company_id), therapy: asset.asset_name, before: asset, patch: Object.fromEntries(changes), priority, reason, sources: review?.sources ?? [], status: 'pending' });
}
writeFileSync(planPath, JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ planPath, affected_assets: plan.rows.length, source_reviewed_assets: inputs.reviews.length, launch_targets: inputs.reviews.filter(r => r.launch_target).length, skipped_locked: plan.skipped_locked }, null, 2));
if (!process.argv.includes('--apply')) process.exit(0);
const existingSources = await all('cgt_asset_sources');
for (const row of plan.rows) {
  try {
    for (const url of row.sources) {
      if (existingSources.some(s => s.asset_id === row.id && s.source_url === url)) continue;
      const { error } = await db.from('cgt_asset_sources').insert({ asset_id: row.id, source_type: 'Primary', source_title: `Launch evidence review: ${row.therapy}`, source_url: url, source_domain: new URL(url).hostname, source_date: null, is_primary_source: true, signal_type: 'launch_timing_review', notes: `Reviewed ${inputs.reviewed_at}. ${row.reason}` });
      if (error) throw error;
    }
    const { data, error } = await db.from('cgt_assets').update(row.patch).eq('id', row.id).eq('updated_at', row.before.updated_at).select('*');
    if (error) throw error;
    if (data.length !== 1) throw new Error('Concurrent update or permission prevented change');
    row.status = 'asset_updated';
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    const log = Object.entries(row.patch).filter(([field]) => !['last_reviewed_at', 'latest_material_update'].includes(field)).map(([field, value]) => ({
      asset_id: row.id, agent_id: runId, run_date: inputs.reviewed_at, update_week: '2026-W39', change_type: 'launch_evidence_review', field_changed: field,
      previous_value: String(row.before[field] ?? ''), new_value: String(value ?? ''), why_it_matters: row.reason,
      score_impact_explanation: 'Commercial scores unchanged. Audience qualification reviewed independently.', source_url: row.sources[0] ?? '', confidence_level: row.sources.length ? 'Medium' : 'Low',
    }));
    if (log.length) {
      const { error } = await db.from('cgt_change_log').insert(log);
      if (error) throw error;
    }
    const { error: historyError } = await db.from('cgt_score_history').insert({
      asset_id: row.id, week_label: '2026-W39', regulatory_score: row.before.regulatory_score,
      commercial_infrastructure_score: row.before.commercial_infrastructure_score,
      market_attractiveness_score: row.before.market_attractiveness_score,
      capability_gap_leverage_score: row.before.capability_gap_leverage_score,
      raw_commercial_score: row.before.raw_commercial_score, final_commercial_score: row.before.final_commercial_score,
      commercial_priority_tier: row.patch.commercial_priority_tier ?? data[0].commercial_priority_tier,
    });
    if (historyError) throw historyError;
    for (const key of ['regulatory_score', 'commercial_infrastructure_score', 'market_attractiveness_score', 'final_commercial_score']) {
      if (data[0][key] !== row.before[key]) throw new Error(`Unexpected score change: ${key}`);
    }
    row.status = 'verified';
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
  } catch (error) {
    row.error = error.message ?? String(error);
    writeFileSync(planPath, JSON.stringify(plan, null, 2));
    throw error;
  }
}
console.log(`Verified ${plan.rows.length} asset updates with change log and score history; scores unchanged.`);
