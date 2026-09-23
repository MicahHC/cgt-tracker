import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

const built = await build({ entryPoints: ['src/lib/buildCommercialAudiences.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { buildCommercialAudiences } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
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
const [companies, assets, members, clients] = await Promise.all(['cgt_companies', 'cgt_assets', 'cgt_abm_audience_members', 'cgt_abm_client_domains'].map(all));
const managed = new Set(['Priority 1', 'Priority 2', 'Late Stage', 'Launch Timing Review']);
const now = new Date();
const desired = buildCommercialAudiences(companies, assets, members, clients, now).filter(m => managed.has(m.audience_segment) && !m.is_client);
const key = m => `${m.domain.toLowerCase()}:${m.audience_segment}`;
const wanted = new Set(desired.map(key));
const stale = members.filter(m => managed.has(m.audience_segment) && !m.is_client && !wanted.has(key(m)));
const counts = desired.reduce((out, m) => ({ ...out, [m.audience_segment]: (out[m.audience_segment] || 0) + 1 }), {});
const dir = 'health-checks';
mkdirSync(dir, { recursive: true });
const audit = `${dir}/commercial-audiences-${now.toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(audit, JSON.stringify({ run_at: now.toISOString(), mode: process.argv.includes('--apply') ? 'apply' : 'preview', definitions: { late_stage: 'launch within 24 months', priority_1: 'within 18 months', priority_2: 'beyond 18 through 24 months' }, before: members, proposed: desired, removed: stale, counts }, null, 2));
console.log(JSON.stringify({ counts, removingStaleMemberships: stale.length, audit }, null, 2));
if (process.argv.includes('--apply')) {
  for (const member of desired) {
    const { account_name, domain, country, audience_segment } = member;
    const { error } = await db.from('cgt_abm_audience_members').upsert({ account_name, domain, country, audience_segment, is_client: false }, { onConflict: 'domain,audience_segment' });
    if (error) throw error;
  }
  for (const member of stale) {
    const { error } = await db.from('cgt_abm_audience_members').delete().eq('id', member.id).eq('is_client', false);
    if (error) throw error;
  }
  const after = await all('cgt_abm_audience_members');
  const actual = after.filter(m => managed.has(m.audience_segment) && !m.is_client);
  if (actual.length !== desired.length || actual.some(m => !wanted.has(key(m)))) throw new Error('Saved audience verification failed; inspect audit');
  console.log('Applied and verified saved audiences.');
}
