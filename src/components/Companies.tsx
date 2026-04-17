import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CgtAsset, CgtAssetSource, CgtCompany } from '../types/database';
import { Building2, Plus, ExternalLink, Search, ChevronRight, X, Save, Gauge, ArrowUpDown, Filter } from 'lucide-react';
import { SegmentBadge, TierBadge } from './ui/Badge';
import { ScoreAssetModal } from './ScoreAssetModal';
import { NewCompanyScoreModal } from './NewCompanyScoreModal';

interface Props {
  onOpenAsset: (id: string) => void;
  canEdit: boolean;
}

export function Companies({ onOpenAsset, canEdit }: Props) {
  const [companies, setCompanies] = useState<CgtCompany[]>([]);
  const [assets, setAssets] = useState<CgtAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CgtCompany | null>(null);
  const [adding, setAdding] = useState(false);
  const [scoringAsset, setScoringAsset] = useState<CgtAsset | null>(null);
  const [scoringSources, setScoringSources] = useState<CgtAssetSource[]>([]);
  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('score-desc');

  async function openScoring(asset: CgtAsset) {
    const { data } = await supabase.from('cgt_asset_sources').select('*').eq('asset_id', asset.id).order('source_date', { ascending: false });
    setScoringSources((data as CgtAssetSource[]) || []);
    setScoringAsset(asset);
  }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('cgt_companies').select('*').order('company_name'),
      supabase.from('cgt_assets').select('*'),
    ]);
    setCompanies((c as CgtCompany[]) || []);
    setAssets((a as CgtAsset[]) || []);
    setLoading(false);
  }

  const phaseBucket = (s: string): string => {
    const t = (s || '').toLowerCase();
    if (!t) return 'Unknown';
    if (t.includes('approv')) return 'Approved';
    if (t.includes('bla') || t.includes('nda') || t.includes('filed') || t.includes('filing')) return 'Filed';
    if (t.includes('phase 3') || t.includes('phase iii') || t.includes('phase 2/3')) return 'Phase 3';
    if (t.includes('phase 2') || t.includes('phase ii') || t.includes('phase 1/2')) return 'Phase 2';
    if (t.includes('phase 1') || t.includes('phase i')) return 'Phase 1';
    if (t.includes('preclin') || t.includes('ind')) return 'Preclinical/IND';
    if (t.includes('discontinu') || t.includes('withdraw')) return 'Discontinued';
    return 'Other';
  };

  const tierRank: Record<string, number> = { 'Tier 1': 4, 'Tier 2': 3, 'Watchlist': 2, 'Deprioritized': 1 };
  const phaseRank: Record<string, number> = {
    'Approved': 7, 'Filed': 6, 'Phase 3': 5, 'Phase 2': 4, 'Phase 1': 3,
    'Preclinical/IND': 2, 'Other': 1, 'Unknown': 0, 'Discontinued': -1,
  };
  const segmentRank: Record<string, number> = { 'On-Market': 3, 'Late Stage': 2, 'Early Stage': 1 };

  const rows = companies.map(c => {
    const own = assets.filter(a => a.company_id === c.id);
    const isOnMarket = own.length > 0 && own.every(a => a.segment === 'On-Market');
    const scoreField: 'strategic_opportunity_score' | 'final_commercial_score' =
      isOnMarket ? 'strategic_opportunity_score' : 'final_commercial_score';
    const scoreLabel = isOnMarket ? 'SOS' : 'CSR';
    const scores = own.map(a => (a[scoreField] as number) ?? 0).filter(s => s > 0);
    const topScore = scores.length ? Math.max(...scores) : null;
    const topAsset = own.slice().sort((a, b) => ((b[scoreField] as number) ?? 0) - ((a[scoreField] as number) ?? 0))[0];
    const topTier = topAsset?.commercial_priority_tier || null;
    const tier1 = own.filter(a => a.commercial_priority_tier === 'Tier 1').length;
    const topSegment = topAsset?.segment || (own[0]?.segment ?? '');
    const anyHold = own.some(a => a.clinical_hold);
    const topPhase = own.length
      ? own.map(a => phaseBucket(a.phase_regulatory_status)).sort((a, b) => (phaseRank[b] ?? 0) - (phaseRank[a] ?? 0))[0]
      : 'Unknown';
    return { company: c, own, isOnMarket, scoreField, scoreLabel, topScore, topAsset, topTier, tier1, topSegment, anyHold, topPhase };
  });

  const filtered = rows.filter(r => {
    const c = r.company;
    if (search && !(
      c.company_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.parent_company || '').toLowerCase().includes(search.toLowerCase())
    )) return false;
    if (segmentFilter !== 'all' && r.topSegment !== segmentFilter) return false;
    if (tierFilter !== 'all' && r.topTier !== tierFilter) return false;
    if (phaseFilter !== 'all' && r.topPhase !== phaseFilter) return false;
    if (statusFilter === 'active' && r.anyHold) return false;
    if (statusFilter === 'hold' && !r.anyHold) return false;
    return true;
  });

  const sorted = filtered.slice().sort((a, b) => {
    switch (sortBy) {
      case 'name-asc': return a.company.company_name.localeCompare(b.company.company_name);
      case 'name-desc': return b.company.company_name.localeCompare(a.company.company_name);
      case 'score-asc': return (a.topScore ?? -1) - (b.topScore ?? -1);
      case 'score-desc': return (b.topScore ?? -1) - (a.topScore ?? -1);
      case 'tier': return (tierRank[b.topTier || ''] ?? 0) - (tierRank[a.topTier || ''] ?? 0);
      case 'phase': return (phaseRank[b.topPhase] ?? 0) - (phaseRank[a.topPhase] ?? 0);
      case 'segment': return (segmentRank[b.topSegment] ?? 0) - (segmentRank[a.topSegment] ?? 0);
      case 'status': return Number(a.anyHold) - Number(b.anyHold);
      default: return 0;
    }
  });

  const activeFilters = [segmentFilter, tierFilter, phaseFilter, statusFilter].filter(v => v !== 'all').length;

  const phaseOptions = ['Approved', 'Filed', 'Phase 3', 'Phase 2', 'Phase 1', 'Preclinical/IND', 'Discontinued', 'Other', 'Unknown'];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;

  if (selected) {
    const companyAssets = assets.filter(a => a.company_id === selected.id);
    return (
      <>
        <CompanyDetail
          company={selected}
          assets={companyAssets}
          onBack={() => setSelected(null)}
          onOpenAsset={onOpenAsset}
          canEdit={canEdit}
          onScoreAsset={openScoring}
          onChange={() => { load(); }}
        />
        {scoringAsset && (
          <ScoreAssetModal
            asset={scoringAsset}
            existingSources={scoringSources}
            onClose={() => setScoringAsset(null)}
            onSaved={() => { setScoringAsset(null); load(); }}
          />
        )}
      </>
    );
  }

  return (
    <>
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
          <p className="text-slate-500 text-sm mt-1">{companies.length} companies · {assets.length} assets</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewCompanyOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 shadow-sm"
          >
            <Gauge className="w-4 h-4" /> Score a company
          </button>
          <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 bg-white rounded-lg font-medium hover:bg-slate-50">
            <Plus className="w-4 h-4" /> Add company
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search companies..."
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 pr-1">
            <Filter className="w-3.5 h-3.5" /> Filter
          </div>
          <FilterSelect value={segmentFilter} onChange={setSegmentFilter} options={[
            { v: 'all', l: 'All segments' },
            { v: 'Late Stage', l: 'Late Stage' },
            { v: 'Early Stage', l: 'Early Stage' },
            { v: 'On-Market', l: 'On-Market' },
          ]} />
          <FilterSelect value={tierFilter} onChange={setTierFilter} options={[
            { v: 'all', l: 'All tiers' },
            { v: 'Tier 1', l: 'Tier 1' },
            { v: 'Tier 2', l: 'Tier 2' },
            { v: 'Watchlist', l: 'Watchlist' },
            { v: 'Deprioritized', l: 'Deprioritized' },
          ]} />
          <FilterSelect value={phaseFilter} onChange={setPhaseFilter} options={[
            { v: 'all', l: 'All phases' },
            ...phaseOptions.map(p => ({ v: p, l: p })),
          ]} />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={[
            { v: 'all', l: 'Active & hold' },
            { v: 'active', l: 'Active only' },
            { v: 'hold', l: 'On hold' },
          ]} />
          {activeFilters > 0 && (
            <button
              onClick={() => { setSegmentFilter('all'); setTierFilter('all'); setPhaseFilter('all'); setStatusFilter('all'); }}
              className="text-xs font-medium text-teal-700 hover:text-teal-800 underline underline-offset-2"
            >
              Clear ({activeFilters})
            </button>
          )}
          <div className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <ArrowUpDown className="w-3.5 h-3.5" /> Sort
          </div>
          <FilterSelect value={sortBy} onChange={setSortBy} options={[
            { v: 'score-desc', l: 'Score (high to low)' },
            { v: 'score-asc', l: 'Score (low to high)' },
            { v: 'tier', l: 'Tier (best first)' },
            { v: 'phase', l: 'Phase (most advanced)' },
            { v: 'segment', l: 'Segment' },
            { v: 'status', l: 'Status (active first)' },
            { v: 'name-asc', l: 'Name (A–Z)' },
            { v: 'name-desc', l: 'Name (Z–A)' },
          ]} />
        </div>
      </div>

      {adding && (
        <CompanyEdit onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map(r => {
          const { company: c, own, scoreLabel, topScore, topAsset, topTier, tier1, anyHold, topPhase } = r;
          const scoreColor = topScore == null ? 'text-slate-400 bg-slate-50 border-slate-200'
            : topScore >= 75 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : topScore >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200'
            : 'text-slate-700 bg-slate-50 border-slate-200';
          return (
            <div
              key={c.id}
              className="group relative bg-white rounded-xl border border-slate-200 p-5 hover:border-teal-300 transition-colors"
            >
              <button onClick={() => setSelected(c)} className="w-full text-left">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{c.company_name}</div>
                    <div className="text-xs text-slate-500 truncate">{c.parent_company || c.hq_country || '—'}</div>
                  </div>
                  <div className={`flex flex-col items-center justify-center min-w-[52px] px-2 py-1 rounded-lg border ${scoreColor}`}>
                    <div className="text-[10px] font-medium uppercase tracking-wide leading-none">{scoreLabel}</div>
                    <div className="text-lg font-bold leading-tight">{topScore ?? '—'}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 self-center" />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs flex-wrap">
                  <div><span className="font-semibold text-slate-900">{own.length}</span> <span className="text-slate-500">assets</span></div>
                  {topTier && <TierBadge tier={topTier} />}
                  {tier1 > 0 && <div><span className="font-semibold text-emerald-700">{tier1}</span> <span className="text-slate-500">Tier 1</span></div>}
                  {topPhase && topPhase !== 'Unknown' && (
                    <span className="px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 font-medium">{topPhase}</span>
                  )}
                  {anyHold && (
                    <span className="px-1.5 py-0.5 rounded-md border border-rose-200 bg-rose-50 text-rose-700 font-medium">Hold</span>
                  )}
                </div>
              </button>
              {topAsset && (
                <button
                  onClick={(e) => { e.stopPropagation(); openScoring(topAsset); }}
                  className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
                >
                  <Gauge className="w-4 h-4" />
                  {topAsset.last_reviewed_at ? 'Rescore' : 'Score'} {own.length > 1 ? 'top asset' : 'this asset'}
                </button>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
            No companies match the current filters.
          </div>
        )}
      </div>
    </div>
    {newCompanyOpen && (
      <NewCompanyScoreModal
        onCancel={() => setNewCompanyOpen(false)}
        onCreated={async (asset) => {
          setNewCompanyOpen(false);
          await load();
          await openScoring(asset);
        }}
      />
    )}
    {scoringAsset && (
      <ScoreAssetModal
        asset={scoringAsset}
        existingSources={scoringSources}
        onClose={() => setScoringAsset(null)}
        onSaved={() => { setScoringAsset(null); load(); }}
      />
    )}
    </>
  );
}

function CompanyDetail({ company, assets, onBack, onOpenAsset, canEdit, onScoreAsset, onChange }: {
  company: CgtCompany;
  assets: CgtAsset[];
  onBack: () => void;
  onOpenAsset: (id: string) => void;
  canEdit: boolean;
  onScoreAsset: (asset: CgtAsset) => void;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <CompanyEdit company={company} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChange(); }} />;
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-slate-600 hover:text-slate-900">← Back to companies</button>
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{company.company_name}</h1>
              <div className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                {company.ticker && <span className="font-mono">{company.ticker}</span>}
                {company.parent_company && <span>· Parent: {company.parent_company}</span>}
                {company.hq_country && <span>· {company.hq_country}</span>}
                {company.website && (
                  <a href={company.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-600 hover:underline">
                    Website <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {company.notes && <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap max-w-2xl">{company.notes}</div>}
            </div>
          </div>
          {canEdit && (
            <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">Edit</button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 font-semibold text-slate-900 text-sm">Linked assets ({assets.length})</div>
        <div className="divide-y divide-slate-100">
          {assets.length === 0 && <div className="px-5 py-8 text-sm text-slate-400 text-center">No assets for this company.</div>}
          {assets.map(a => (
            <div key={a.id} className="w-full px-5 py-3 hover:bg-slate-50 transition-colors flex items-center gap-4">
              <button onClick={() => onOpenAsset(a.id)} className="flex-1 min-w-0 text-left">
                <div className="font-medium text-slate-900">{a.asset_name}</div>
                <div className="text-xs text-slate-500 truncate">{a.lead_indication || a.target_indication} · {a.modality}</div>
              </button>
              <SegmentBadge segment={a.segment} />
              <div className="text-center min-w-[56px]">
                <div className="text-[9px] font-medium uppercase tracking-wide text-slate-500 leading-none">
                  {a.segment === 'On-Market' ? 'SOS' : 'CSR'}
                </div>
                <div className="text-sm font-bold text-slate-900 leading-tight">
                  {a.segment === 'On-Market' ? a.strategic_opportunity_score : a.final_commercial_score}
                </div>
                <TierBadge tier={a.commercial_priority_tier} />
              </div>
              <button
                onClick={() => onScoreAsset(a)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 shadow-sm"
              >
                <Gauge className="w-3.5 h-3.5" /> {a.last_reviewed_at ? 'Rescore' : 'Score'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompanyEdit({ company, onCancel, onSaved }: { company?: CgtCompany; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<CgtCompany>>(company || { segment_default: 'Late Stage' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form.company_name) { setError('Company name required'); return; }
    setSaving(true);
    setError(null);
    try {
      if (company) {
        await supabase.from('cgt_companies').update({ ...form, updated_at: new Date().toISOString() }).eq('id', company.id);
      } else {
        await supabase.from('cgt_companies').insert(form);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{company ? 'Edit company' : 'Add company'}</h2>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Inp label="Company name *" value={form.company_name} onChange={v => setForm({ ...form, company_name: v })} />
        <Inp label="Parent company" value={form.parent_company} onChange={v => setForm({ ...form, parent_company: v })} />
        <Inp label="HQ country" value={form.hq_country} onChange={v => setForm({ ...form, hq_country: v })} />
        <Inp label="Ticker" value={form.ticker} onChange={v => setForm({ ...form, ticker: v })} />
        <Inp label="Website" value={form.website} onChange={v => setForm({ ...form, website: v })} />
        <Inp label="Default segment" value={form.segment_default} onChange={v => setForm({ ...form, segment_default: v })} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
        <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
          <Save className="w-4 h-4" /> Save
        </button>
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-700 hover:border-slate-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
    >
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}

function Inp({ label, value, onChange }: { label: string; value?: string | null; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input value={value || ''} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
    </div>
  );
}
