import { supabase } from './supabase';
import { AudienceMember, ClientAccount } from './audienceCounts';
import { buildCommercialAudiences } from './buildCommercialAudiences';
import { CgtAsset, CgtCompany } from '../types/database';

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
  const [members, clients, companies, assets] = await Promise.all([
    loadAll<AudienceMember>('cgt_abm_audience_members', 'id, account_name, country, domain, audience_segment, is_client'),
    loadAll<ClientAccount>('cgt_abm_client_domains', 'account_name, domain'),
    loadAll<CgtCompany>('cgt_companies', '*'),
    loadAll<CgtAsset>('cgt_assets', '*'),
  ]);
  return buildCommercialAudiences(companies, assets, members, clients).sort((a, b) => a.account_name.localeCompare(b.account_name));
}
