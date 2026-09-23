import { readFileSync, writeFileSync } from 'node:fs';

const path = 'health-checks/validation-2026-09-23/full-universe-coverage.csv';
const raw = readFileSync(path, 'utf8');
const parse = line => {
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value);
  return values;
};
const lines = raw.trimEnd().split('\n').map(parse);
const headings = lines.shift();
const rows = lines.map(line => Object.fromEntries(headings.map((heading, index) => [heading, line[index]])))
  .filter(row => row['Audit Flags'].includes('late_signal_launch_unverified'));
const output = { checked_at: new Date().toISOString(), limitation: 'Registry search results are leads only. Verify exact product, sponsor, indication and U.S. sites before changing phase. Study dates are never launch dates.', rows: [] };
let next = 0;
async function worker() {
  while (next < rows.length) {
    const row = rows[next++];
    const result = { asset_id: row['Asset ID'], company: row.Company, therapy: row.Therapy, studies: [] };
    const clean = row.Therapy.replace(/\s*\([^)]*\)/g, '').trim();
    if (clean.length < 4 || /(?:portfolio|platform|programs|\s\/\s)/i.test(clean)) {
      result.note = 'Composite or generic name; manual sponsor/product identity review required';
      output.rows.push(result);
      continue;
    }
    try {
      const url = new URL('https://clinicaltrials.gov/api/v2/studies');
      url.searchParams.set('query.term', `"${clean}"`);
      url.searchParams.set('pageSize', '20');
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      result.truncated = !!data.nextPageToken;
      result.studies = (data.studies ?? []).map(({ protocolSection: p }) => ({
        nct_id: p.identificationModule?.nctId,
        title: p.identificationModule?.briefTitle,
        sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name,
        phase: p.designModule?.phases ?? [],
        status: p.statusModule?.overallStatus,
        last_update: p.statusModule?.lastUpdatePostDateStruct?.date,
        interventions: (p.armsInterventionsModule?.interventions ?? []).map(item => item.name),
        us_site: (p.contactsLocationsModule?.locations ?? []).some(location => location.country === 'United States'),
        source: `https://clinicaltrials.gov/study/${p.identificationModule?.nctId}`,
      }));
    } catch (error) {
      result.error = error.message;
    }
    output.rows.push(result);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
output.rows.sort((a, b) => a.company.localeCompare(b.company) || a.therapy.localeCompare(b.therapy));
const outPath = 'health-checks/validation-2026-09-23/late-stage-registry-check.json';
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ checked: output.rows.length, studies_found: output.rows.reduce((n, row) => n + row.studies.length, 0), without_matches: output.rows.filter(row => !row.studies.length && !row.note && !row.error).length, composite_or_generic: output.rows.filter(row => row.note).length, errors: output.rows.filter(row => row.error).length, outPath }, null, 2));
