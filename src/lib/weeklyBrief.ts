import { supabase } from './supabase';

const STORAGE_KEY = 'cgt.weeklyBrief.lastSeen';

export function getLastSeenWeek(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function markWeeklyBriefSeen(week: string) {
  try {
    localStorage.setItem(STORAGE_KEY, week);
    window.dispatchEvent(new CustomEvent('cgt:weekly-brief-seen', { detail: week }));
  } catch {
    // ignore
  }
}

export async function fetchLatestBriefMeta(): Promise<{
  latestWeek: string | null;
  changeCount: number;
}> {
  const { data } = await supabase
    .from('cgt_change_log')
    .select('update_week')
    .not('update_week', 'is', null)
    .order('update_week', { ascending: false })
    .limit(1);
  const latestWeek = ((data as any[] | null)?.[0]?.update_week as string | undefined) || null;
  if (!latestWeek) return { latestWeek: null, changeCount: 0 };

  const { count } = await supabase
    .from('cgt_change_log')
    .select('id', { count: 'exact', head: true })
    .eq('update_week', latestWeek);

  return { latestWeek, changeCount: count || 0 };
}
