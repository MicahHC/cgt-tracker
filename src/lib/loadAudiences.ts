import { supabase } from './supabase';
import { AudienceMember, ClientAccount, normalizeAudiences } from './audienceCounts';

async function loadAll<T>(table: string, fields: string): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(table).select(fields).order('id').range(start, start + 999);
    if (error) throw error;
    rows.push(...(data as unknown as T[]));
    if (data.length < 1000) return rows;
  }
}

export async function loadAudiences(): Promise<AudienceMember[]> {
  const [members, clients] = await Promise.all([
    loadAll<AudienceMember>('cgt_abm_audience_members', 'id, account_name, country, domain, audience_segment, is_client'),
    loadAll<ClientAccount>('cgt_abm_client_domains', 'account_name, domain'),
  ]);
  return normalizeAudiences(members, clients).sort((a, b) => a.account_name.localeCompare(b.account_name));
}
