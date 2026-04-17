import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CgtAsset } from '../types/database';
import { SEGMENTS, TIERS } from '../lib/constants';
import { CalendarClock, Package } from 'lucide-react';
import { SegmentBadge, TierBadge } from './ui/Badge';

interface Props {
  onOpenAsset: (id: string) => void;
}

interface Row extends CgtAsset {
  company_name?: string;
}

export function CatalystsPage({ onOpenAsset }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState<'6' | '12' | 'all'>('6');
  const [segment, setSegment] = useState<string>('all');
  const [tier, setTier] = useState<string>('all');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('cgt_assets')
      .select('*, cgt_companies!inner(company_name)')
      .order('catalyst_date', { ascending: true });
    const mapped: Row[] = ((data as any[]) || []).map(r => ({
      ...r,
      company_name: r.cgt_companies?.company_name,
    })).filter(r => r.catalyst_date);
    setRows(mapped);
    setLoading(false);
  }

  const now = new Date();
  const cutoff = new Date(now);
  if (horizon === '6') cutoff.setMonth(cutoff.getMonth() + 6);
  else if (horizon === '12') cutoff.setMonth(cutoff.getMonth() + 12);
  else cutoff.setFullYear(cutoff.getFullYear() + 10);

  const filtered = rows.filter(r => {
    const d = new Date(r.catalyst_date!);
    if (d < now || d > cutoff) return false;
    if (segment !== 'all' && r.segment !== segment) return false;
    if (tier !== 'all' && r.commercial_priority_tier !== tier) return false;
    return true;
  });

  const grouped = useMemo(() => {
    const g: Record<string, Row[]> = {};
    filtered.forEach(r => {
      const d = new Date(r.catalyst_date!);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      (g[key] ||= []).push(r);
    });
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Upcoming catalysts</h1>
        <p className="text-slate-500 text-sm mt-1">{filtered.length} catalysts in window</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(['6', '12', 'all'] as const).map(h => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${horizon === h ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {h === 'all' ? 'All future' : `Next ${h} mo`}
            </button>
          ))}
        </div>
        <select value={segment} onChange={e => setSegment(e.target.value)} className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
          <option value="all">All segments</option>
          {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={tier} onChange={e => setTier(e.target.value)} className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
          <option value="all">All commercial tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CalendarClock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <div className="text-sm text-slate-500">No catalysts match your filters.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([month, items]) => {
            const d = new Date(month + '-01');
            return (
              <div key={month} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-teal-600" />
                  <div className="font-semibold text-slate-900 text-sm">
                    {d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </div>
                  <span className="ml-auto text-xs text-slate-500">{items.length} catalyst{items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map(a => (
                    <button key={a.id} onClick={() => onOpenAsset(a.id)} className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                      <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate">{a.asset_name}</div>
                        <div className="text-xs text-slate-500 truncate">{a.company_name} · {a.key_upcoming_catalyst || 'Milestone'}</div>
                      </div>
                      <div className="text-xs text-slate-500">{new Date(a.catalyst_date!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <SegmentBadge segment={a.segment} />
                      <TierBadge tier={a.commercial_priority_tier} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
