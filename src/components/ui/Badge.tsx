import { ReactNode } from 'react';
import { Tier } from '../../types/database';
import { tierColor } from '../../lib/scoring';

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${className}`}>
      {children}
    </span>
  );
}

export function TierBadge({ tier }: { tier: Tier | null | undefined }) {
  if (!tier) return <Badge className="bg-slate-50 text-slate-400 border-slate-200">Unscored</Badge>;
  return <Badge className={tierColor(tier)}>{tier}</Badge>;
}

export function SegmentBadge({ segment }: { segment: string }) {
  const colors: Record<string, string> = {
    'Late Stage': 'bg-teal-50 text-teal-700 border-teal-200',
    'Early Stage': 'bg-sky-50 text-sky-700 border-sky-200',
    'On-Market': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return <Badge className={colors[segment] || 'bg-slate-50 text-slate-600 border-slate-200'}>{segment}</Badge>;
}

export function ConfidenceBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    High: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Medium: 'bg-amber-50 text-amber-700 border-amber-200',
    Low: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return <Badge className={colors[level] || 'bg-slate-50 text-slate-600 border-slate-200'}>{level}</Badge>;
}

export function FlagBadge({ label, color = 'red' }: { label: string; color?: 'red' | 'amber' | 'slate' }) {
  const colors = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return <Badge className={colors[color]}>{label}</Badge>;
}
