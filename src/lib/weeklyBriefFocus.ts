import { assessLaunch, type LaunchAsset } from './commercialization';

export interface BriefChange {
  field_changed?: string | null;
  previous_value?: string | null;
  new_value?: string | null;
}

export type FocusAudience = 'ATC' | 'Late Stage' | 'On Market';

export function directEvidenceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host.endsWith('.supabase.co') || host.endsWith('.vercel.app') || host === 'cgtscore.com') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function focusAudiences(asset: LaunchAsset | undefined, audiences: Iterable<string>, now = new Date()): FocusAudience[] {
  const memberships = new Set(audiences);
  const result: FocusAudience[] = [];
  if (memberships.has('ATC')) result.push('ATC');
  if (asset && assessLaunch(asset, now).priority) result.push('Late Stage');
  if (asset?.segment === 'On-Market' || memberships.has('On Market')) result.push('On Market');
  return result;
}

export function focusAudience(asset: LaunchAsset | undefined, audiences: Iterable<string>, now = new Date()): FocusAudience | null {
  return focusAudiences(asset, audiences, now)[0] || null;
}

export function isEarlyToLateMove(change: BriefChange, asset: LaunchAsset | undefined, now = new Date()): boolean {
  if (change.field_changed === 'segment') {
    return change.previous_value === 'Early Stage' && change.new_value === 'Late Stage';
  }
  if (!asset || !assessLaunch(asset, now).priority) return false;
  if (change.field_changed !== 'commercial_priority_tier') return false;
  return !['Tier 1', 'Tier 2'].includes(change.previous_value || '') &&
    ['Tier 1', 'Tier 2'].includes(change.new_value || '');
}
