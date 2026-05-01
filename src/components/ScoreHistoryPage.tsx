import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';
import { CgtScoreHistory } from '../types/database';
import { LineChart, TrendingDown, TrendingUp } from 'lucide-react';
import { TierBadge } from './ui/Badge';

interface Row extends CgtScoreHistory {
  asset_name?: string;
  company_name?: string;
}

interface Props {
  onOpenAsset: (id: string) => void;
}

export function ScoreHistoryPage({ onOpenAsset }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  useRealtimeRefresh(['cgt_score_history', 'cgt_assets'], () => load());

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('cgt_score_history')
      .select('*, cgt_assets!inner(asset_name, cgt_companies!inner(company_name))')
      .order('recorded_at', { ascending: false })
      .limit(500);
    const mapped: Row[] = ((data as any[]) || []).map(r => ({
      ...r,
      asset_name: r.cgt_assets?.asset_name,
      company_name: r.cgt_assets?.cgt_companies?.company_name,
    }));
    setRows(mapped);
    setLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;

  // Compute deltas per asset
  const byAsset: Record<string, Row[]> = {};
  rows.forEach(r => {
    (byAsset[r.asset_id] ||= []).push(r);
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Score history</h1>
        <p className="text-slate-500 text-sm mt-1">{rows.length} snapshots across {Object.keys(byAsset).length} assets. Append-only.</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <LineChart className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <div className="text-sm text-slate-500">No score history recorded yet. Snapshots are written each time an asset is saved.</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Recorded</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Asset</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Commercial</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Strategic</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Δ vs prior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const assetRows = byAsset[r.asset_id];
                  const idx = assetRows.findIndex(x => x.id === r.id);
                  const prior = idx >= 0 ? assetRows[idx + 1] : null;
                  const delta = prior ? r.final_commercial_score - prior.final_commercial_score : 0;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpenAsset(r.asset_id)}>
                      <td className="px-4 py-3 text-slate-600 text-xs">{new Date(r.recorded_at).toLocaleString()}<div className="text-[11px] text-slate-400">{r.week_label}</div></td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.asset_name}</td>
                      <td className="px-4 py-3 text-slate-600">{r.company_name}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="font-bold text-slate-900">{r.final_commercial_score}</div>
                        <TierBadge tier={r.commercial_priority_tier} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="font-bold text-slate-900">{r.strategic_opportunity_score}</div>
                        <TierBadge tier={r.strategic_priority_tier} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {prior ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-700' : 'text-slate-500'}`}>
                            {delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
