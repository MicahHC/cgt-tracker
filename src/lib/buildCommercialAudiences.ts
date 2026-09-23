import { assessLaunch, companyPriority, LaunchAsset } from './commercialization';
import { accountKey, AudienceMember, ClientAccount, normalizeAudiences } from './audienceCounts';

type Company = { id: string; company_name: string; website: string; hq_country: string; status?: string };
const managed = new Set(['Priority 1', 'Priority 2', 'Late Stage']);

export function buildCommercialAudiences(companies: Company[], assets: LaunchAsset[], members: AudienceMember[], clients: ClientAccount[], now = new Date()): AudienceMember[] {
  const rows = members.filter(m => !managed.has(m.audience_segment) || m.is_client);
  const byCompany = new Map<string, LaunchAsset[]>();
  for (const asset of assets) {
    if (!asset.company_id) continue;
    const own = byCompany.get(asset.company_id) || [];
    own.push(asset);
    byCompany.set(asset.company_id, own);
  }
  for (const company of companies) {
    if (company.status?.toLowerCase() === 'excluded') continue;
    const own = byCompany.get(company.id) || [];
    const priority = companyPriority(own, now);
    if (!priority) continue;
    const name = company.company_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matches = members.filter(m => m.account_name.toLowerCase().replace(/[^a-z0-9]/g, '') === name || (company.website && accountKey(m) === accountKey({ account_name: company.company_name, domain: company.website })));
    const domain = company.website || matches.find(m => m.domain && !m.domain.endsWith('.missing-domain.invalid'))?.domain || `${name}.missing-domain.invalid`;
    const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const evidence = own.filter(a => assessLaunch(a, now).priority === priority).map(a => `${a.asset_name}: ${assessLaunch(a, now).reason}`).join(' | ');
    for (const segment of [priority, 'Late Stage']) {
      const existing = matches.find(m => m.audience_segment === segment);
      rows.push({
        id: existing?.id || `derived:${company.id}:${segment}`,
        account_name: company.company_name,
        domain: cleanDomain,
        country: company.hq_country || '',
        audience_segment: segment,
        is_client: matches.some(m => m.is_client),
        priority_label: priority,
        launch_evidence: evidence,
      });
    }
  }
  const normalized = normalizeAudiences(rows, clients);
  // Domain aliases can join companies with different qualifying assets. P1 wins.
  const p1 = new Map(normalized.filter(m => m.audience_segment === 'Priority 1' && !m.is_client).map(m => [accountKey(m), m]));
  return normalized.map(m => m.audience_segment === 'Late Stage' && p1.has(accountKey(m))
    ? { ...m, priority_label: 'Priority 1', launch_evidence: p1.get(accountKey(m))!.launch_evidence }
    : m);
}
