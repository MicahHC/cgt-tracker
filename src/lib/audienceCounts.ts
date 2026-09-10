export type AudienceMember = {
  id: string;
  account_name: string;
  country: string;
  domain: string;
  audience_segment: string;
  is_client: boolean;
};

export type ClientAccount = { account_name: string; domain: string };

function domainKey(value: string): string {
  const domain = (value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return domain.endsWith('.missing-domain.invalid') ? '' : domain;
}

function nameKey(value: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function accountKey(member: ClientAccount): string {
  return domainKey(member.domain) || nameKey(member.account_name);
}

export function normalizeAudiences(members: AudienceMember[], clients: ClientAccount[]): AudienceMember[] {
  const suppressed = [...clients, ...members.filter(m => m.is_client)];
  const clientDomains = new Set(suppressed.map(m => domainKey(m.domain)).filter(Boolean));
  const clientNames = new Set(suppressed.map(m => nameKey(m.account_name)).filter(Boolean));
  const marked = members.map(m => ({
    ...m,
    is_client: m.is_client || clientDomains.has(domainKey(m.domain)) || clientNames.has(nameKey(m.account_name)),
  }));
  const priorityOne = new Set(marked.filter(m => !m.is_client && m.audience_segment === 'Priority 1').map(accountKey));
  const seen = new Set<string>();
  return marked.filter(m => {
    if (!m.is_client && m.audience_segment === 'Priority 2' && priorityOne.has(accountKey(m))) return false;
    const key = `${accountKey(m)}:${m.is_client ? 'Closed Won' : m.audience_segment}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function audienceCounts(members: AudienceMember[]): Record<string, number> {
  const counts: Record<string, number> = { all: new Set(members.map(accountKey)).size, 'Closed Won': 0 };
  for (const member of members) {
    const segment = member.is_client ? 'Closed Won' : member.audience_segment;
    counts[segment] = (counts[segment] || 0) + 1;
  }
  return counts;
}
