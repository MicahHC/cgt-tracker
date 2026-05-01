import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';
import { CgtAsset, CgtAssetWithCompany, CgtCompany, Segment, Tier } from '../types/database';
import { SEGMENTS, TIERS, MANUFACTURING_STATUSES, CONFIDENCE_LEVELS } from '../lib/constants';
import { TierBadge, SegmentBadge, FlagBadge } from './ui/Badge';
import { Search, Filter, Plus, ShieldAlert, Factory, ChevronDown, ArrowUpDown, Lock } from 'lucide-react';

interface AssetsListProps {
  onOpenAsset: (id: string) => void;
  onCreateAsset: () => void;
  canEdit: boolean;
}

type SortKey = 'name' | 'company' | 'segment' | 'commercial' | 'strategic' | 'catalyst';

export function AssetsList({ onOpenAsset, onCreateAsset, canEdit }: AssetsListProps) {
  const [assets, setAssets] = useState<CgtAssetWithCompany[]>([]);
  const [companies, setCompanies] = useState<Record<string, CgtCompany>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<'all' | Segment>('all');
  const [commercialTier, setCommercialTier] = useState<'all' | Tier>('all');
  const [strategicTier, setStrategicTier] = useState<'all' | Tier>('all');
  const [mfg, setMfg] = useState<string>('all');
  const [confidence, setConfidence] = useState<string>('all');
  const [holdOnly, setHoldOnly] = useState(false);
  const [launch24, setLaunch24] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('commercial');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    load();
  }, []);

  useRealtimeRefresh(['cgt_assets', 'cgt_companies'], () => load());

  async function load() {
    setLoading(true);
    const [{ data: assetData }, { data: companyData }] = await Promise.all([
      supabase.from('cgt_assets').select('*').order('updated_at', { ascending: false }),
      supabase.from('cgt_companies').select('*'),
    ]);
    const companyMap: Record<string, CgtCompany> = {};
    (companyData as CgtCompany[] | null)?.forEach(c => { companyMap[c.id] = c; });
    setCompanies(companyMap);
    const enriched = ((assetData as CgtAsset[] | null) || []).map(a => ({ ...a, company: companyMap[a.company_id] }));
    setAssets(enriched);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return assets.filter(a => {
      if (s) {
        const hay = `${a.asset_name} ${a.company?.company_name || ''} ${a.lead_indication} ${a.target_indication} ${a.modality}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (segment !== 'all' && a.segment !== segment) return false;
      if (commercialTier !== 'all' && a.commercial_priority_tier !== commercialTier) return false;
      if (strategicTier !== 'all' && a.strategic_priority_tier !== strategicTier) return false;
      if (mfg !== 'all' && a.manufacturing_status !== mfg) return false;
      if (confidence !== 'all' && a.confidence_level !== confidence) return false;
      if (holdOnly && !a.clinical_hold) return false;
      if (launch24 !== 'all' && a.likely_us_launch_within_24_months !== launch24) return false;
      return true;
    }).sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name': return dir * a.asset_name.localeCompare(b.asset_name);
        case 'company': return dir * (a.company?.company_name || '').localeCompare(b.company?.company_name || '');
        case 'segment': return dir * a.segment.localeCompare(b.segment);
        case 'commercial': return dir * (a.final_commercial_score - b.final_commercial_score);
        case 'strategic': return dir * (a.strategic_opportunity_score - b.strategic_opportunity_score);
        case 'catalyst': {
          const av = a.catalyst_date ? new Date(a.catalyst_date).getTime() : Number.MAX_SAFE_INTEGER;
          const bv = b.catalyst_date ? new Date(b.catalyst_date).getTime() : Number.MAX_SAFE_INTEGER;
          return dir * (av - bv);
        }
      }
    });
  }, [assets, search, segment, commercialTier, strategicTier, mfg, confidence, holdOnly, launch24, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' || key === 'company' ? 'asc' : 'desc'); }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assets</h1>
          <p className="text-slate-500 mt-1">{filtered.length} of {assets.length} assets</p>
        </div>
        {canEdit && (
          <button onClick={onCreateAsset} className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> Add asset
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search assets, companies, indications..."
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <button onClick={() => setShowFilters(s => !s)} className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Filter className="w-4 h-4" /> Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <FilterSelect label="Segment" value={segment} onChange={v => setSegment(v as any)} options={['all', ...SEGMENTS]} />
            <FilterSelect label="Commercial Tier" value={commercialTier} onChange={v => setCommercialTier(v as any)} options={['all', ...TIERS]} />
            <FilterSelect label="Strategic Tier" value={strategicTier} onChange={v => setStrategicTier(v as any)} options={['all', ...TIERS]} />
            <FilterSelect label="Manufacturing" value={mfg} onChange={setMfg} options={['all', ...MANUFACTURING_STATUSES]} />
            <FilterSelect label="Confidence" value={confidence} onChange={setConfidence} options={['all', ...CONFIDENCE_LEVELS]} />
            <FilterSelect label="Likely launch (24mo)" value={launch24} onChange={setLaunch24} options={['all', 'Yes', 'No', 'Watchlist']} />
            <label className="flex items-center gap-2 text-sm text-slate-700 pt-6">
              <input type="checkbox" checked={holdOnly} onChange={e => setHoldOnly(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              Clinical hold only
            </label>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState canEdit={canEdit} onCreate={onCreateAsset} total={assets.length} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th onClick={() => toggleSort('name')} active={sortKey === 'name'} dir={sortDir}>Asset</Th>
                  <Th onClick={() => toggleSort('company')} active={sortKey === 'company'} dir={sortDir}>Company</Th>
                  <Th onClick={() => toggleSort('segment')} active={sortKey === 'segment'} dir={sortDir}>Segment</Th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Phase</th>
                  <Th onClick={() => toggleSort('commercial')} active={sortKey === 'commercial'} dir={sortDir} align="center">Commercial</Th>
                  <Th onClick={() => toggleSort('strategic')} active={sortKey === 'strategic'} dir={sortDir} align="center">Strategic</Th>
                  <Th onClick={() => toggleSort('catalyst')} active={sortKey === 'catalyst'} dir={sortDir}>Next catalyst</Th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(a => <AssetRow key={a.id} asset={a} onOpen={() => onOpenAsset(a.id)} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AssetRow({ asset, onOpen }: { asset: CgtAssetWithCompany; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="hover:bg-slate-50 cursor-pointer transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900 flex items-center gap-1.5">
          {asset.asset_name}
          {asset.lock_status === 'In Progress' && <Lock className="w-3 h-3 text-amber-500" />}
        </div>
        <div className="text-xs text-slate-500 truncate max-w-xs">{asset.lead_indication || asset.target_indication}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-slate-900">{asset.company?.company_name || '-'}</div>
        <div className="text-xs text-slate-500">{asset.modality}</div>
      </td>
      <td className="px-4 py-3"><SegmentBadge segment={asset.segment} /></td>
      <td className="px-4 py-3 text-slate-700 text-xs">{asset.phase_regulatory_status || '-'}</td>
      <td className="px-4 py-3 text-center">
        <div className="font-bold text-slate-900">{asset.final_commercial_score}</div>
        <TierBadge tier={asset.commercial_priority_tier} />
      </td>
      <td className="px-4 py-3 text-center">
        <div className="font-bold text-slate-900">{asset.strategic_opportunity_score}</div>
        <TierBadge tier={asset.strategic_priority_tier} />
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">
        {asset.catalyst_date ? new Date(asset.catalyst_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}
        {asset.key_upcoming_catalyst && <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{asset.key_upcoming_catalyst}</div>}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {asset.clinical_hold && <FlagBadge label="Hold" color="red" />}
          {asset.no_manufacturing_pathway && <FlagBadge label="No CMC" color="red" />}
          {asset.no_us_path && <FlagBadge label="No US" color="red" />}
          {asset.timeline_over_24_months && <FlagBadge label=">24mo" color="amber" />}
        </div>
      </td>
    </tr>
  );
}

function Th({ children, onClick, active, dir, align = 'left' }: {
  children: React.ReactNode; onClick: () => void; active: boolean; dir: 'asc' | 'desc'; align?: 'left' | 'center';
}) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider ${align === 'center' ? 'text-center' : 'text-left'}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-teal-700 ${active ? 'text-teal-700' : ''}`}>
        {children}
        <ArrowUpDown className="w-3 h-3 opacity-60" />
        {active && <span className="text-[10px]">{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white">
        {options.map(o => <option key={o} value={o}>{o === 'all' ? 'All' : o}</option>)}
      </select>
    </div>
  );
}

function EmptyState({ canEdit, onCreate, total }: { canEdit: boolean; onCreate: () => void; total: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <ShieldAlert className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        {total === 0 ? 'No assets yet' : 'No assets match your filters'}
      </h3>
      <p className="text-slate-500 mb-6 text-sm">
        {total === 0 ? 'Import the late-stage seed list from Admin, or add an asset manually.' : 'Try adjusting your search or clearing filters.'}
      </p>
      {canEdit && total === 0 && (
        <button onClick={onCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700">
          <Plus className="w-4 h-4" /> Add first asset
        </button>
      )}
    </div>
  );
}
