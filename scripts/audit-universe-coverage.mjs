import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const compiled = await build({ entryPoints: ['src/lib/commercialization.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { assessLaunch } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const source = readFileSync('src/lib/supabase.ts', 'utf8');
const db = createClient(source.match(/https:\/\/[^']+/)[0], source.match(/eyJ[^']+/)[0]);
const all = async table => {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.from(table).select('*').order('id').range(start, start + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
};
const [assets, companies, sources] = await Promise.all(['cgt_assets', 'cgt_companies', 'cgt_asset_sources'].map(all));
const companyById = new Map(companies.map(company => [company.id, company.company_name]));
const sourcesByAsset = new Map();
for (const sourceRow of sources) {
  const current = sourcesByAsset.get(sourceRow.asset_id) ?? [];
  current.push(sourceRow);
  sourcesByAsset.set(sourceRow.asset_id, current);
}
const isSearchLink = url => /(?:clinicaltrials\.gov|fda\.gov)\/search(?:\?|\/|$)/i.test(url || '');
const now = new Date();
const rows = assets.map(asset => {
  const attached = sourcesByAsset.get(asset.id) ?? [];
  const direct = attached.filter(item => item.is_primary_source && !isSearchLink(item.source_url));
  const reviewed = /^Source-reviewed U\.S\. launch target:/i.test(asset.us_commercialization_window || '');
  const assessment = assessLaunch(asset, now);
  const lateSignal = /phase iii|phase 3|pivotal|bla|pdufa/i.test(asset.phase_regulatory_status || '');
  const flags = [];
  if (reviewed && !direct.length) flags.push('qualified_window_without_direct_primary_source');
  if (lateSignal && !reviewed && asset.segment !== 'On-Market') flags.push('late_signal_launch_unverified');
  if (!direct.length) flags.push('no_direct_primary_source');
  if (attached.length && attached.every(item => isSearchLink(item.source_url))) flags.push('search_links_only');
  if (!asset.last_reviewed_at || (now.getTime() - new Date(asset.last_reviewed_at).getTime()) > 90 * 864e5) flags.push('review_over_90_days_or_missing');
  if (/(?:portfolio|platform|programs|\s\/\s)/i.test(asset.asset_name)) flags.push('identity_or_composite_review');
  if (asset.segment === 'On-Market' && ['Tier 1', 'Tier 2'].includes(asset.commercial_priority_tier)) flags.push('marketed_asset_priority_conflict');
  return {
    asset_id: asset.id,
    company: companyById.get(asset.company_id) ?? 'Unknown company',
    therapy: asset.asset_name,
    segment: asset.segment,
    phase: asset.phase_regulatory_status,
    launch_window: asset.us_commercialization_window,
    assessed_priority: assessment.priority,
    saved_tier: asset.commercial_priority_tier,
    direct_primary_sources: direct.length,
    placeholder_links: attached.filter(item => isSearchLink(item.source_url)).length,
    last_reviewed_at: asset.last_reviewed_at,
    flags,
  };
});
const summary = {
  generated_at: now.toISOString(),
  limitation: 'Field-level audit and research queue only. A trial phase, registry update, or external launch estimate does not establish a U.S. commercial launch date.',
  assets: assets.length,
  companies: companies.length,
  source_reviewed_launch_targets: rows.filter(row => /^Source-reviewed U\.S\. launch target:/i.test(row.launch_window || '')).length,
  assets_with_direct_primary_source: rows.filter(row => row.direct_primary_sources > 0).length,
  assets_without_direct_primary_source: rows.filter(row => row.direct_primary_sources === 0).length,
  late_signal_launch_unverified: rows.filter(row => row.flags.includes('late_signal_launch_unverified')).length,
  identity_or_composite_review: rows.filter(row => row.flags.includes('identity_or_composite_review')).length,
  search_links_only: rows.filter(row => row.flags.includes('search_links_only')).length,
  assessed_priority_1_assets: rows.filter(row => row.assessed_priority === 'Priority 1').length,
  assessed_priority_2_assets: rows.filter(row => row.assessed_priority === 'Priority 2').length,
};
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const headings = ['Asset ID', 'Company', 'Therapy', 'Segment', 'Clinical/Regulatory Status', 'U.S. Launch Window', 'Assessed Priority', 'Saved Tier', 'Direct Primary Sources', 'Search Links', 'Last Reviewed', 'Audit Flags'];
const lines = [headings, ...rows.map(row => [row.asset_id, row.company, row.therapy, row.segment, row.phase, row.launch_window, row.assessed_priority, row.saved_tier, row.direct_primary_sources, row.placeholder_links, row.last_reviewed_at, row.flags.join('; ')])];
const dir = 'health-checks/validation-2026-09-23';
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/full-universe-coverage.csv`, lines.map(line => line.map(csv).join(',')).join('\n') + '\n');
writeFileSync(`${dir}/full-universe-coverage-summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
