import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/audienceCounts.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { normalizeAudiences, audienceCounts } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const member = (id, name, domain, segment, client = false) => ({
  id, account_name: name, domain, audience_segment: segment, is_client: client, country: 'United States',
});

const members = [
  member('1', 'Alpha', 'https://www.alpha.com/', 'Priority 1'),
  member('2', 'Alpha duplicate', 'alpha.com', 'Priority 1'),
  member('3', 'Alpha', 'alpha.com', 'Priority 2'),
  member('4', 'Alpha', 'alpha.com', 'Early Stage'),
  member('5', 'Beta', 'beta.com', 'Priority 2'),
  member('6', 'Closed client', 'client.com', 'Priority 1'),
  member('7', 'Closed client', 'client.com', 'Priority 2'),
  member('8', 'Manual client', 'manual.com', 'Priority 1', true),
  member('9', 'Manual client', 'manual.com', 'Early Stage'),
];
const normalized = normalizeAudiences(members, [{ account_name: 'Closed client', domain: 'client.com' }]);
assert.deepEqual(audienceCounts(normalized), { all: 4, 'Closed Won': 2, 'Priority 1': 1, 'Early Stage': 1, 'Priority 2': 1 });
assert.equal(normalized.filter(m => m.domain === 'alpha.com' && m.audience_segment === 'Priority 2').length, 0);
assert.deepEqual(normalizeAudiences(normalized, []), normalized, 'Normalization must be idempotent');
assert.deepEqual(audienceCounts(normalizeAudiences([], [])), { all: 0, 'Closed Won': 0 });
const missing = normalizeAudiences([
  member('10', 'No domain', '', 'Priority 1'),
  member('11', 'No domain', 'unknown.missing-domain.invalid', 'Priority 1'),
], []);
assert.equal(audienceCounts(missing)['Priority 1'], 1);
console.log('Audience regression checks passed: deduplication, Priority 1 precedence, global client suppression, empty data, missing domains.');

if (process.argv[2]) {
  const dir = process.argv[2];
  const liveMembers = JSON.parse(readFileSync(`${dir}/cgt_abm_audience_members.json`, 'utf8'));
  const liveClients = JSON.parse(readFileSync(`${dir}/cgt_abm_client_domains.json`, 'utf8'));
  console.log('Snapshot counts:', audienceCounts(normalizeAudiences(liveMembers, liveClients)));
}
