import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CgtChangeLog } from '../types/database';
import { Search, ClipboardList, ExternalLink } from 'lucide-react';
import { ConfidenceBadge } from './ui/Badge';

interface Props {
  onOpenAsset: (id: string) => void;
}

interface Row extends CgtChangeLog {
  asset_name?: string;
  company_name?: string;
}

export function ChangeLogPage({ onOpenAsset }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [changeType, setChangeType] = useState<string>('all');
  const [company, setCompany] = useState<string>('all');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('cgt_change_log')
      .select('*, cgt_assets!inner(asset_name, company_id, cgt_companies!inner(company_name))')
      .order('created_at', { ascending: false })
      .limit(500);
    const mapped: Row[] = ((data as any[]) || []).map(r => ({
      ...r,
      asset_name: r.cgt_assets?.asset_name,
      company_name: r.cgt_assets?.cgt_companies?.company_name,
    }));
    setRows(mapped);
    setLoading(false);
  }

  const types = useMemo(() => Array.from(new Set(rows.map(r => r.change_type).filter(Boolean))), [rows]);
  const companies = useMemo(() => Array.from(new Set(rows.map(r => r.company_name).filter(Boolean))), [rows]);

  const filtered = rows.filter(r => {
    if (search && !(`${r.asset_name} ${r.company_name} ${r.field_changed} ${r.new_value} ${r.previous_value}`).toLowerCase().includes(search.toLowerCase())) return false;
    if (changeType !== 'all' && r.change_type !== changeType) return false;
    if (company !== 'all' && r.company_name !== company) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Change log</h1>
        <p className="text-slate-500 text-sm mt-1">{filtered.length} of {rows.length} changes. Append-only audit trail.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg" />
        </div>
        <select value={changeType} onChange={e => setChangeType(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg bg-white">
          <option value="all">All change types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={company} onChange={e => setCompany(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg bg-white">
          <option value="all">All companies</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-sm text-slate-400 text-center flex flex-col items-center gap-2">
            <ClipboardList className="w-8 h-8 text-slate-300" />
            No changes match your filters.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(r => (
              <div key={r.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <button onClick={() => onOpenAsset(r.asset_id)} className="text-sm font-medium text-teal-700 hover:underline">
                      {r.asset_name || 'Asset'}
                    </button>
                    <span className="text-sm text-slate-500"> · {r.company_name} · </span>
                    <span className="text-sm font-medium text-slate-900">{r.field_changed}</span>
                    <div className="text-sm mt-1">
                      <span className="text-slate-500 line-through">{r.previous_value || '—'}</span>{' '}
                      <span className="text-teal-700">→ {r.new_value || '—'}</span>
                    </div>
                    {r.why_it_matters && <div className="text-xs text-slate-600 mt-1">{r.why_it_matters}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 text-xs text-slate-500">
                    <div>{new Date(r.created_at).toLocaleString()}</div>
                    <div className="flex items-center gap-2">
                      <ConfidenceBadge level={r.confidence_level} />
                      {r.source_url && (
                        <a href={r.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-teal-600 hover:underline">
                          Source <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
