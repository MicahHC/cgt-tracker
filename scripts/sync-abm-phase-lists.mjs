import { readFileSync } from 'node:fs';

const SUPABASE_URL = process.env.CGT_SUPABASE_URL || 'https://dbnmnorholzehkppwvap.supabase.co';
const REST_URL = `${SUPABASE_URL}/rest/v1`;
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const MANAGED_SEGMENTS = new Set(['Early Stage', 'Late Stage', 'On Market']);

const supabaseSource = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
const anonKey = process.env.CGT_SUPABASE_ANON_KEY
  || supabaseSource.match(/(?:CGT_SUPABASE_ANON_KEY|supabaseAnonKey)\s*=\s*'([^']+)'/)?.[1];

if (!anonKey) {
  throw new Error('Missing CGT_SUPABASE_ANON_KEY. Set it in the environment or src/lib/supabase.ts.');
}

function cleanDomain(value = '') {
  return `${value || ''}`
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

function normalizeName(value = '') {
  return `${value || ''}`
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|holdings|holding|therapeutics|pharmaceuticals|pharma|biopharmaceuticals|biotherapeutics|biosciences|sciences|technology|technologies)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

async function request(method, path, body, prefer = 'return=minimal') {
  const response = await fetch(`${REST_URL}/${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok || data?.code) {
    throw new Error(`${method} ${path} failed: ${text || response.statusText}`);
  }
  return data;
}

function textIncludesAny(value, terms) {
  const text = `${value || ''}`.toLowerCase();
  return terms.some(term => text.includes(term));
}

function classifyAsset(asset) {
  if (asset.no_us_path) return null;

  const segment = `${asset.segment || ''}`.toLowerCase();
  const phase = `${asset.phase_regulatory_status || ''}`.toLowerCase();
  const filing = `${asset.filing_status || ''}`.toLowerCase();
  const window = `${asset.us_commercialization_window || ''}`.toLowerCase();
  const negativePhase3 = textIncludesAny(phase, [
    'no current phase 3',
    'no current cgt phase 3',
    'no phase 3 confirmed',
    'phase 3 terminated',
    'prior phase 3 terminated',
  ]);

  if (
    segment === 'on-market'
    || segment === 'on market'
    || filing.includes('approved')
    || phase.includes('approved')
    || window === 'approved'
  ) {
    return 'On Market';
  }

  if (
    !negativePhase3
    && (
      segment === 'late stage'
      || textIncludesAny(phase, ['phase 3', 'phase iii', 'bla', 'pdufa'])
      || textIncludesAny(filing, ['accepted', 'filed', 'filing'])
    )
  ) {
    return 'Late Stage';
  }

  if (
    segment === 'early stage'
    || textIncludesAny(phase, ['phase 1', 'phase i', 'phase 2', 'phase ii', 'candidate', 'preclinical'])
  ) {
    return 'Early Stage';
  }

  return null;
}

function pickCompanySegment(company) {
  if (`${company.status || ''}`.toLowerCase() === 'excluded') return null;

  const assetSegments = (company.cgt_assets || [])
    .map(classifyAsset)
    .filter(Boolean);

  if (assetSegments.includes('On Market')) return 'On Market';
  if (assetSegments.includes('Late Stage')) return 'Late Stage';
  if (assetSegments.includes('Early Stage')) return 'Early Stage';

  if (MANAGED_SEGMENTS.has(company.segment_default)) return company.segment_default;
  if (`${company.status || ''}`.toLowerCase() === 'candidate') return 'Early Stage';
  return null;
}

function memberMatchesCompany(member, companyName, domain) {
  const memberDomain = cleanDomain(member.domain);
  if (domain && memberDomain && domain === memberDomain) return true;
  return normalizeName(member.account_name) === normalizeName(companyName);
}

async function main() {
  const [companies, members] = await Promise.all([
    request(
      'GET',
      'cgt_companies?select=id,company_name,hq_country,website,status,segment_default,cgt_assets(id,segment,phase_regulatory_status,filing_status,us_commercialization_window,no_us_path)&limit=2000',
      undefined,
      null,
    ),
    request('GET', 'cgt_abm_audience_members?select=*&limit=5000', undefined, null),
  ]);

  const actions = [];
  const skipped = [];
  const desiredCompanies = companies
    .map(company => ({
      ...company,
      desiredSegment: pickCompanySegment(company),
      domain: cleanDomain(company.website),
      country: company.hq_country || 'United States',
    }))
    .filter(company => company.desiredSegment);

  for (const company of desiredCompanies) {
    const companyDefault = company.desiredSegment === 'On Market' ? 'On-Market' : company.desiredSegment;
    if (company.segment_default !== companyDefault) {
      actions.push({
        type: 'updated_company_segment_default',
        company: company.company_name,
        from: company.segment_default || '',
        to: companyDefault,
      });
      if (!DRY_RUN) {
        await request('PATCH', `cgt_companies?id=eq.${company.id}`, {
          segment_default: companyDefault,
          updated_at: new Date().toISOString(),
        });
      }
    }

    const matches = members.filter(member => memberMatchesCompany(member, company.company_name, company.domain));
    const clientMatches = matches.filter(member => member.is_client);
    if (clientMatches.length) {
      actions.push({ type: 'preserved_client', company: company.company_name, count: clientMatches.length });
      continue;
    }

    const managedMatches = matches.filter(member => MANAGED_SEGMENTS.has(member.audience_segment));
    const targetMatch = managedMatches.find(member => member.audience_segment === company.desiredSegment);
    const usableDomain = company.domain || cleanDomain(targetMatch?.domain || managedMatches[0]?.domain || '');

    if (!usableDomain) {
      skipped.push({ company: company.company_name, reason: 'missing website/domain', desiredSegment: company.desiredSegment });
      continue;
    }

    if (targetMatch) {
      const patch = {
        account_name: company.company_name,
        country: company.country,
        domain: usableDomain,
      };
      actions.push({ type: 'updated_existing', company: company.company_name, segment: company.desiredSegment, domain: usableDomain });
      if (!DRY_RUN) await request('PATCH', `cgt_abm_audience_members?id=eq.${targetMatch.id}`, patch);
    } else if (managedMatches.length) {
      const rowToMove = managedMatches[0];
      const patch = {
        account_name: company.company_name,
        country: company.country,
        domain: usableDomain,
        audience_segment: company.desiredSegment,
      };
      actions.push({
        type: 'moved_segment',
        company: company.company_name,
        from: rowToMove.audience_segment,
        to: company.desiredSegment,
        domain: usableDomain,
      });
      if (!DRY_RUN) await request('PATCH', `cgt_abm_audience_members?id=eq.${rowToMove.id}`, patch);

      for (const duplicate of managedMatches.slice(1)) {
        actions.push({ type: 'removed_duplicate', company: duplicate.account_name, segment: duplicate.audience_segment, domain: duplicate.domain });
        if (!DRY_RUN) await request('DELETE', `cgt_abm_audience_members?id=eq.${duplicate.id}`);
      }
    } else {
      const row = {
        account_name: company.company_name,
        country: company.country,
        domain: usableDomain,
        audience_segment: company.desiredSegment,
        is_client: false,
      };
      actions.push({ type: 'inserted', company: company.company_name, segment: company.desiredSegment, domain: usableDomain });
      if (!DRY_RUN) await request('POST', 'cgt_abm_audience_members', row);
    }
  }

  const refreshedMembers = DRY_RUN
    ? members
    : await request('GET', 'cgt_abm_audience_members?select=account_name,domain,audience_segment,is_client&limit=5000', undefined, null);
  const counts = refreshedMembers.reduce((acc, member) => {
    acc[member.audience_segment] = (acc[member.audience_segment] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    desiredTrackerCompanies: desiredCompanies.length,
    actions,
    skipped,
    counts,
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
