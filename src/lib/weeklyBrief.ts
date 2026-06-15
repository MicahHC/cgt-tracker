import { supabase } from './supabase';

const STORAGE_KEY = 'cgt.weeklyBrief.lastSeen';

export function briefSignature(
  week: string | null | undefined,
  updatedAt?: string | null,
  changeCount = 0,
  scoreCount = 0
): string | null {
  if (!week) return null;
  return [week, updatedAt || '', changeCount, scoreCount].join('|');
}

export function getLastSeenWeek(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed.week || null;
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

export function getLastSeenBriefSignature(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed.signature || parsed.week || null;
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

export function markWeeklyBriefSeen(week: string, signature?: string | null) {
  try {
    const stored = JSON.stringify({
      week,
      signature: signature || week,
      seenAt: new Date().toISOString(),
    });
    localStorage.setItem(STORAGE_KEY, stored);
    window.dispatchEvent(new CustomEvent('cgt:weekly-brief-seen', { detail: { week, signature: signature || week } }));
  } catch {
    // ignore
  }
}

export async function fetchLatestBriefMeta(): Promise<{
  latestWeek: string | null;
  changeCount: number;
  scoreCount: number;
  updatedAt: string | null;
  signature: string | null;
}> {
  const [{ data: latestChange }, { data: latestScore }] = await Promise.all([
    supabase
      .from('cgt_change_log')
      .select('update_week, created_at')
      .not('update_week', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('cgt_score_history')
      .select('week_label, recorded_at')
      .not('week_label', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(1),
  ]);

  const candidates = [
    {
      week: ((latestChange as any[] | null)?.[0]?.update_week as string | undefined) || null,
      updatedAt: ((latestChange as any[] | null)?.[0]?.created_at as string | undefined) || null,
    },
    {
      week: ((latestScore as any[] | null)?.[0]?.week_label as string | undefined) || null,
      updatedAt: ((latestScore as any[] | null)?.[0]?.recorded_at as string | undefined) || null,
    },
  ].filter(c => c.week && c.updatedAt) as { week: string; updatedAt: string }[];

  const latest = candidates.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  if (!latest) {
    return { latestWeek: null, changeCount: 0, scoreCount: 0, updatedAt: null, signature: null };
  }

  const [{ count: changeCount }, { count: scoreCount }] = await Promise.all([
    supabase
      .from('cgt_change_log')
      .select('id', { count: 'exact', head: true })
      .eq('update_week', latest.week),
    supabase
      .from('cgt_score_history')
      .select('id', { count: 'exact', head: true })
      .eq('week_label', latest.week),
  ]);

  const changes = changeCount || 0;
  const scores = scoreCount || 0;
  return {
    latestWeek: latest.week,
    changeCount: changes,
    scoreCount: scores,
    updatedAt: latest.updatedAt,
    signature: briefSignature(latest.week, latest.updatedAt, changes, scores),
  };
}
