import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';
import { CgtAsset, CgtCompany, CgtAssetSource } from '../types/database';
import { ScoreAssetModal } from './ScoreAssetModal';
import { NewCompanyScoreModal } from './NewCompanyScoreModal';
import { TierBadge, SegmentBadge } from './ui/Badge';
import { Gauge, Search, Loader2, CheckCircle2, Plus } from 'lucide-react';

type SortMode = 'needs_review' | 'highest' | 'lowest' | 'recent';
type FilterMode = 'all' | 'unscored' | 'scored';

export function ScoringPage() {
  const [assets, setAssets] = useState<CgtAsset[]>([]);
  const [companies, setCompanies] = useState<CgtCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('needs_review');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [scoringAsset, setScoringAsset] = useState<CgtAsset | null>(null);
  const [scoringSources, setScoringSources] = useState<CgtAssetSource[]>([]);
  const [showNewCompany, setShowNewCompany] = useState(false);

  async function load() {
    setLoading(true);
    const [assetsRes, companiesRes] = await Promise.all([
      supabase.from('cgt_assets').select('*').order('asset_name'),
      supabase.from('cgt_companies').select('*').order('company_name'),
    ]);
    setAssets((assetsRes.data as CgtAsset[]) || []);
    setCompanies((companiesRes.data as CgtCompany[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useRealtimeRefresh(['cgt_assets', 'cgt_companies', 'cgt_score_history'], () => load());

  async function openScoring(asset: CgtAsset) {
    const { data } = await supabase
      .from('cgt_asset_sources')
      .select('*')
      .eq('asset_id', asset.id)
      .order('source_date', { ascending: false });
    setScoringSources((data as CgtAssetSource[]) || []);
    setScoringAsset(asset);
  }

  const companyMap = useMemo(() => {
    const m = new Map<string, CgtCompany>();
    companies.forEach(c => m.set(c.id, c));
    return m;
  }, [companies]);

  const visible = useMemo(() => {
    let rows = assets.slice();
    if (filter === 'unscored') rows = rows.filter(a => !a.last_reviewed_at);
    if (filter === 'scored') rows = rows.filter(a => !!a.last_reviewed_at);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(a => {
        const co = companyMap.get(a.company_id)?.company_name || '';
        return `${a.asset_name} ${co} ${a.modality ?? ''} ${a.target_indication ?? ''} ${a.lead_indication ?? ''}`
          .toLowerCase()
          .includes(q);
      });
    }
    const byScoreDesc = (a: CgtAsset, b: CgtAsset) => (b.final_commercial_score ?? -1) - (a.final_commercial_score ?? -1);
    const byScoreAsc = (a: CgtAsset, b: CgtAsset) => (a.final_commercial_score ?? 999) - (b.final_commercial_score ?? 999);
    const byReviewDesc = (a: CgtAsset, b: CgtAsset) => {
      const at = a.last_reviewed_at ? new Date(a.last_reviewed_at).getTime() : 0;
      const bt = b.last_reviewed_at ? new Date(b.last_reviewed_at).getTime() : 0;
      return bt - at;
    };
    if (sort === 'highest') rows.sort(byScoreDesc);
    else if (sort === 'lowest') rows.sort(byScoreAsc);
    else if (sort === 'recent') rows.sort(byReviewDesc);
    else {
      rows.sort((a, b) => {
        const aNew = a.last_reviewed_at ? 1 : 0;
        const bNew = b.last_reviewed_at ? 1 : 0;
        if (aNew !== bNew) return aNew - bNew;
        const aDate = a.last_reviewed_at ? new Date(a.last_reviewed_at).getTime() : 0;
        const bDate = b.last_reviewed_at ? new Date(b.last_reviewed_at).getTime() : 0;
        return aDate - bDate;
      });
    }
    return rows;
  }, [assets, filter, sort, search, companyMap]);

  const stats = useMemo(() => {
    const total = assets.length;
    const scored = assets.filter(a => !!a.last_reviewed_at).length;
    const tier1 = assets.filter(a => a.commercial_priority_tier === 'Tier 1').length;
    const stale = assets.filter(a => {
      if (!a.last_reviewed_at) return false;
      const days = (Date.now() - new Date(a.last_reviewed_at).getTime()) / (1000 * 60 * 60 * 24);
      return days > 90;
    }).length;
    return { total, scored, unscored: total - scored, tier1, stale };
  }, [assets]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Gauge className="w-6 h-6 text-teal-600" />
              Scoring
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Score any asset against the regulatory, commercial infrastructure, market, and capability-gap rubrics.
            </p>
          </div>
          <button
            onClick={() => setShowNewCompany(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Score new company
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total assets" value={stats.total} />
          <StatCard label="Scored" value={stats.scored} hint={`${stats.total ? Math.round((stats.scored / stats.total) * 100) : 0}% coverage`} tone="emerald" />
          <StatCard label="Unscored" value={stats.unscored} tone={stats.unscored > 0 ? 'amber' : 'slate'} />
          <StatCard label="Tier 1" value={stats.tier1} tone="teal" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search asset, company, modality, indication..."
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm"
            />
          </div>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unscored', label: `Unscored (${stats.unscored})` },
              { value: 'scored', label: `Scored (${stats.scored})` },
            ]}
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortMode)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="needs_review">Sort: Needs review first</option>
            <option value="highest">Sort: Highest CSR</option>
            <option value="lowest">Sort: Lowest CSR</option>
            <option value="recent">Sort: Most recently scored</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-5 py-2.5 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <div className="col-span-5">Asset</div>
            <div className="col-span-2">Segment</div>
            <div className="col-span-1 text-center">CSR</div>
            <div className="col-span-2">Tier</div>
            <div className="col-span-2 text-right">Action</div>
          </div>
          <div className="divide-y divide-slate-100">
            {visible.length === 0 && (
              <div className="px-5 py-16 text-center text-sm text-slate-400">
                No assets match your filters.
              </div>
            )}
            {visible.map(a => {
              const co = companyMap.get(a.company_id);
              const score = a.final_commercial_score;
              const scoreColor = score == null ? 'text-slate-400'
                : score >= 75 ? 'text-emerald-700'
                : score >= 50 ? 'text-amber-700'
                : 'text-slate-700';
              const reviewed = a.last_reviewed_at;
              const staleDays = reviewed ? Math.floor((Date.now() - new Date(reviewed).getTime()) / (1000 * 60 * 60 * 24)) : null;
              return (
                <div key={a.id} className="grid grid-cols-12 gap-3 px-5 py-3 items-center hover:bg-slate-50 transition-colors">
                  <div className="col-span-5 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{a.asset_name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {co?.company_name || 'Unlinked company'}
                      {a.modality ? ` · ${a.modality}` : ''}
                      {a.lead_indication || a.target_indication ? ` · ${a.lead_indication || a.target_indication}` : ''}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      {reviewed && (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Last scored {staleDays === 0 ? 'today' : `${staleDays}d ago`}
                        </span>
                      )}
                      {staleDays !== null && staleDays > 90 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                          Stale
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <SegmentBadge segment={a.segment} />
                  </div>
                  <div className="col-span-1 text-center">
                    <div className={`text-xl font-bold leading-none ${scoreColor}`}>{score ?? '—'}</div>
                  </div>
                  <div className="col-span-2">
                    <TierBadge tier={a.commercial_priority_tier} />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button
                      onClick={() => openScoring(a)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 shadow-sm transition-colors"
                    >
                      <Gauge className="w-4 h-4" />
                      {reviewed ? 'Rescore' : 'Score'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {scoringAsset && (
        <ScoreAssetModal
          asset={scoringAsset}
          existingSources={scoringSources}
          onClose={() => setScoringAsset(null)}
          onSaved={() => { setScoringAsset(null); load(); }}
        />
      )}

      {showNewCompany && (
        <NewCompanyScoreModal
          onCancel={() => setShowNewCompany(false)}
          onCreated={(asset) => {
            setShowNewCompany(false);
            setScoringSources([]);
            setScoringAsset(asset);
            load();
          }}
        />
      )}
    </>
  );
}

function StatCard({ label, value, hint, tone = 'slate' }: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'teal';
}) {
  const tones: Record<string, string> = {
    slate: 'border-slate-200 text-slate-900',
    emerald: 'border-emerald-200 text-emerald-800',
    amber: 'border-amber-200 text-amber-800',
    teal: 'border-teal-200 text-teal-800',
  };
  return (
    <div className={`bg-white rounded-xl border p-4 ${tones[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex p-0.5 bg-slate-100 rounded-lg">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
