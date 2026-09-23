import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { build } from 'esbuild';

const base = JSON.parse(readFileSync('data/launch-reviews-2026-09-23.json'));
const followup = JSON.parse(readFileSync('data/launch-review-followup-2026-09-23.json'));
const reviews = new Map([...base.reviews, ...followup.reviews].map(r => [r.asset_id, r]));
const dir = 'health-checks/validation-2026-09-23';

const source = readFileSync('src/lib/supabase.ts', 'utf8');
const db = createClient(source.match(/https:\/\/[^']+/)[0], source.match(/eyJ[^']+/)[0]);
async function all(table) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.from(table).select('*').order('id').range(start, start + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
const assets = await all('cgt_assets');
const companies = await all('cgt_companies');
const members = await all('cgt_abm_audience_members');
const clients = await all('cgt_abm_client_domains');
const sources = await all('cgt_asset_sources');
const changeLog = await all('cgt_change_log');
const compiled = await build({ entryPoints: ['src/lib/buildCommercialAudiences.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { buildCommercialAudiences } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const byId = new Map(assets.map(a => [a.id, a]));
for (const [id, review] of reviews) {
  const asset = byId.get(id);
  assert(asset, `Missing asset ${id}`);
  assert(asset.latest_material_update?.includes(review.reason), `Missing saved review ${id}`);
  for (const [key, value] of Object.entries(review.patch || {})) assert.equal(asset[key], value, `${id}: ${key}`);
  for (const url of review.sources) assert(sources.some(s => s.asset_id === id && s.source_url === url), `Missing evidence ${id}: ${url}`);
}
const derived = buildCommercialAudiences(companies, assets, members, clients, new Date());
const active = derived.filter(m => !m.is_client && ['Priority 1', 'Priority 2'].includes(m.audience_segment));
const p1 = new Set(active.filter(m => m.audience_segment === 'Priority 1').map(m => m.domain));
assert(!active.some(m => m.audience_segment === 'Priority 2' && p1.has(m.domain)), 'Audience overlap');
assert(!active.some(m => !m.domain || m.domain.endsWith('.missing-domain.invalid')), 'Qualified audience domain missing');
const saved = members.filter(m => !m.is_client && ['Priority 1', 'Priority 2'].includes(m.audience_segment));
const key = m => `${m.domain}:${m.audience_segment}`;
assert.deepEqual(saved.map(key).sort(), active.map(key).sort(), 'Saved and displayed priority audiences differ');

const scoringBuilt = await build({ entryPoints: ['supabase/functions/_shared/scoring.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { computeScoring } = await import(`data:text/javascript;base64,${Buffer.from(scoringBuilt.outputFiles[0].text).toString('base64')}`);
let auditedScoreCorrections = 0;
for (const asset of assets) {
  const correction = changeLog.find(log => log.asset_id === asset.id && log.change_type === 'timeline_cap_correction' && log.field_changed === 'final_commercial_score');
  if (correction) {
    assert.match(asset.us_commercialization_window || '', /^Source-reviewed U\.S\. launch target:/i);
    assert.equal(asset.timeline_over_24_months, false);
    const computed = computeScoring({
      regulatory: asset.regulatory_score,
      commercial_infrastructure: asset.commercial_infrastructure_score,
      market_attractiveness: asset.market_attractiveness_score,
    }, {
      clinical_hold: asset.clinical_hold,
      no_manufacturing_pathway: asset.no_manufacturing_pathway,
      timeline_over_24_months: asset.timeline_over_24_months,
      no_us_path: asset.no_us_path,
    }, asset);
    assert.equal(asset.final_commercial_score, computed.final_commercial_score);
    assert(correction.source_url, `Missing score correction source: ${asset.id}`);
    auditedScoreCorrections += 1;
  }
}
const csv = rows => rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
const report = [['Company', 'Therapy', 'Review date', 'Saved launch status', 'Saved regulatory status', 'Finding and next evidence needed', 'Sources']];
for (const [id, review] of reviews) {
  const asset = byId.get(id);
  const company = companies.find(item => item.id === asset.company_id);
  report.push([company?.company_name, asset.asset_name, base.reviewed_at, asset.us_commercialization_window, asset.phase_regulatory_status, review.reason, review.sources.join(' | ')]);
}
writeFileSync(`${dir}/candidate-review-findings.csv`, csv(report));
const summary = {
  verified_at: new Date().toISOString(),
  assets_retained: assets.length, companies_retained: companies.length,
  reviewed_companies: new Set([...reviews.keys()].map(id => byId.get(id).company_id)).size,
  cumulative_reviewed_therapies: reviews.size,
  priority_1: active.filter(m => m.audience_segment === 'Priority 1').length,
  priority_2: active.filter(m => m.audience_segment === 'Priority 2').length,
  launch_timing_review_accounts: derived.filter(m => !m.is_client && m.audience_segment === 'Launch Timing Review').length,
  overlap: 0, missing_qualified_domains: 0, audited_score_corrections: auditedScoreCorrections,
  limitation: 'Completed evidence pass for the original candidate batch, not an exhaustive audit of all 627 assets or certification of future launches. Unconfirmed windows stay outside qualified audiences. Deployed weekly worker version/access not verified by this data read-back.',
};
writeFileSync(`${dir}/followup-verification.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
