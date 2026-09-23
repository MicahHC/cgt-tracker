export interface LaunchAsset {
  id?: string;
  company_id?: string | null;
  asset_name?: string;
  segment?: string | null;
  no_us_path?: boolean;
  clinical_hold?: boolean;
  us_commercialization_window?: string | null;
  latest_material_update?: string | null;
}

export type LaunchAssessment = {
  priority: 'Priority 1' | 'Priority 2' | null;
  reason: string;
  latestDate: string | null;
  forecastOnly: boolean;
};

function monthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

export function cutoffDate(now: Date, months: number): Date {
  const last = monthEnd(now.getUTCFullYear(), now.getUTCMonth() + months + 1);
  return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), Math.min(now.getUTCDate(), last.getUTCDate())));
}

// Parse launch windows only. Filing dates and trial milestones are not launch dates.
export function assessLaunch(asset: LaunchAsset, now = new Date()): LaunchAssessment {
  const rawText = (asset.us_commercialization_window || '').trim();
  const text = rawText.replace(/^Source-reviewed U\.S\. launch target:\s*/i, '');
  const forecastOnly = /global(?:data)?\s+launch/i.test(text);
  const result = (reason: string, latestDate: string | null = null): LaunchAssessment => ({ priority: null, reason, latestDate, forecastOnly });
  if (asset.no_us_path) return result('No U.S. commercialization path');
  if (/^on[- ]market$/i.test(asset.segment || '')) return result('Already on market; no separate future launch recorded');
  if (asset.clinical_hold) return result('Clinical hold; launch timing needs review');
  if (!/^Source-reviewed U\.S\. launch target:/i.test(rawText)) return result('Unverified launch timing; source review required before audience inclusion');
  if (!text || /not provided|unknown|tbd|\buntil\b|source.confirmed|unlikely|no source.backed|not expected to commercialize/i.test(text)) return result('Launch timing needs confirmation');
  if (/\b(filing|filed|bla|phase|topline)\b/i.test(text) && !/launch|commercializ|approval anticipated|potential .*approval/i.test(text)) return result('Milestone only; launch date not established');
  if (/pdufa/i.test(text) && !/launch/i.test(text)) return result('FDA decision date requires a separate launch estimate');

  const dates: Date[] = [];
  const exact = [...text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)];
  for (const m of exact) {
    const date = new Date(`${m[0]}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== m[0]) return result('Invalid launch date');
    dates.push(date);
  }
  if (!dates.length) {
    const periods = [...text.matchAll(/\b(20\d{2})\s*([HQ])([1-4])\b/gi)];
    for (const m of periods) {
      if (m[2].toUpperCase() === 'H' && Number(m[3]) > 2) return result('Invalid launch half-year');
      dates.push(monthEnd(Number(m[1]), Number(m[3]) * (m[2].toUpperCase() === 'H' ? 6 : 3)));
    }
  }
  if (!dates.length) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const named = [...text.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi)];
    for (const m of named) dates.push(monthEnd(Number(m[2]), months.indexOf(m[1].toLowerCase()) + 1));
  }
  if (!dates.length) {
    const years = [...text.matchAll(/\b20\d{2}\b/g)];
    for (const m of years) dates.push(monthEnd(Number(m[0]), 12));
  }
  if (!dates.length) return result('No usable launch date; manual review required');
  const latest = new Date(Math.max(...dates.map(d => d.getTime())));
  const latestDate = latest.toISOString().slice(0, 10);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (latest < today) return result('Launch estimate has passed; refresh required', latestDate);
  if (latest > cutoffDate(now, 24)) return result('Outside the next 24 months', latestDate);
  const priority = latest <= cutoffDate(now, 18) ? 'Priority 1' : 'Priority 2';
  return { priority, latestDate, forecastOnly, reason: `${priority}: source-reviewed launch target window ends ${latestDate}; forecast, not a guaranteed launch` };
}

export function companyPriority(assets: LaunchAsset[], now = new Date()): LaunchAssessment['priority'] {
  const priorities = assets.map(a => assessLaunch(a, now).priority);
  return priorities.includes('Priority 1') ? 'Priority 1' : priorities.includes('Priority 2') ? 'Priority 2' : null;
}
