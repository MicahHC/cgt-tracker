import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';
import { CgtAsset, CgtCompany } from '../types/database';
import {
  Package, Target, FlaskConical, ShoppingBag, ShieldAlert, Factory,
  CalendarClock, Activity, ArrowUpRight
} from 'lucide-react';
import { TierBadge, SegmentBadge } from './ui/Badge';
import { PageKey } from './Layout';

interface DashboardProps {
  onNavigate: (page: PageKey) => void;
  onOpenAsset: (id: string) => void;
}

export function Dashboard({ onNavigate, onOpenAsset }: DashboardProps) {
  const [assets, setAssets] = useState<CgtAsset[]>([]);
  const [companies, setCompanies] = useState<CgtCompany[]>([]);
  const [companyCount, setCompanyCount] = useState(0);
  const [recentChanges, setRecentChanges] = useState<Array<{ id: string; asset_id: string; field_changed: string; why_it_matters: string; created_at: string; asset_name?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  useRealtimeRefresh(['cgt_assets', 'cgt_companies', 'cgt_change_log', 'cgt_score_history'], () => load());

  async function load() {
    const [{ data: assetData }, { data: companyData, count: cCount }, { data: changes }] = await Promise.all([
      supabase.from('cgt_assets').select('*'),
      supabase.from('cgt_companies').select('*', { count: 'exact' }),
      supabase
        .from('cgt_change_log')
        .select('id, asset_id, field_changed, why_it_matters, created_at, cgt_assets(asset_name)')
        .order('created_at', { ascending: false })
        .limit(8),
    ]);
    setAssets((assetData as CgtAsset[]) || []);
    setCompanies((companyData as CgtCompany[]) || []);
    setCompanyCount(cCount || 0);
    setRecentChanges(((changes as any[]) || []).map(c => ({
      ...c,
      asset_name: c.cgt_assets?.asset_name,
    })));
    setLoading(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;
  }

  const lateStage = assets.filter(a => a.segment === 'Late Stage');
  const earlyStage = assets.filter(a => a.segment === 'Early Stage');
  const onMarket = assets.filter(a => a.segment === 'On-Market');
  const uniqCompanies = (list: CgtAsset[]) => new Set(list.map(a => a.company_id)).size;
  const lateStageCompanies = uniqCompanies(lateStage);
  const earlyStageCompanies = uniqCompanies(earlyStage);
  const onMarketCompanies = uniqCompanies(onMarket);
  const tier1Commercial = lateStage.filter(a => a.commercial_priority_tier === 'Tier 1').length;
  const tier2Commercial = lateStage.filter(a => a.commercial_priority_tier === 'Tier 2').length;
  const tier1Strategic = assets.filter(a => a.strategic_priority_tier === 'Tier 1').length;
  const clinicalHolds = assets.filter(a => a.clinical_hold).length;
  const noMfg = assets.filter(a => a.no_manufacturing_pathway).length;

  const now = new Date();
  const sixMonths = new Date(now);
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  const upcoming = assets
    .filter(a => a.catalyst_date && new Date(a.catalyst_date) >= now && new Date(a.catalyst_date) <= sixMonths)
    .sort((a, b) => new Date(a.catalyst_date!).getTime() - new Date(b.catalyst_date!).getTime())
    .slice(0, 6);

  const companyById = new Map(companies.map(c => [c.id, c]));
  const trackerAssets = assets.filter(a => a.segment === 'Late Stage' || a.segment === 'On-Market');
  const trackerByCompany = new Map<string, { company: CgtCompany | undefined; topAsset: CgtAsset; assetCount: number }>();
  for (const a of trackerAssets) {
    if (!a.company_id) continue;
    const existing = trackerByCompany.get(a.company_id);
    if (!existing) {
      trackerByCompany.set(a.company_id, { company: companyById.get(a.company_id), topAsset: a, assetCount: 1 });
    } else {
      existing.assetCount += 1;
      if (a.final_commercial_score > existing.topAsset.final_commercial_score) {
        existing.topAsset = a;
      }
    }
  }
  const topCompanies = Array.from(trackerByCompany.values())
    .sort((a, b) => b.topAsset.final_commercial_score - a.topAsset.final_commercial_score)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Commercial intelligence snapshot across all CGT assets.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total companies" value={companyCount} icon={Package} color="slate" onClick={() => onNavigate('companies')} />
        <Kpi label="Late Stage" value={lateStageCompanies} icon={Target} color="teal" onClick={() => onNavigate('companies')} sub={`${lateStage.length} assets`} />
        <Kpi label="Early Stage" value={earlyStageCompanies} icon={FlaskConical} color="sky" onClick={() => onNavigate('companies')} sub={`${earlyStage.length} assets`} />
        <Kpi label="On-Market" value={onMarketCompanies} icon={ShoppingBag} color="emerald" onClick={() => onNavigate('companies')} sub={`${onMarket.length} assets`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Commercial Tier 1" value={tier1Commercial} icon={Target} color="emerald" />
        <Kpi label="Commercial Tier 2" value={tier2Commercial} icon={Target} color="blue" />
        <Kpi label="Strategic Tier 1" value={tier1Strategic} icon={Activity} color="teal" />
        <Kpi label="Risk flags" value={clinicalHolds + noMfg} icon={ShieldAlert} color="red" sub={`${clinicalHolds} hold / ${noMfg} no mfg`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Top Late-Stage Companies</h2>
            <button onClick={() => onNavigate('companies')} className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">
              View all <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {topCompanies.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">No late-stage companies yet. Import or score your late-stage list in Admin.</div>}
            {topCompanies.map(entry => (
              <button
                key={entry.topAsset.id}
                onClick={() => onOpenAsset(entry.topAsset.id)}
                className="w-full flex items-center gap-3 p-3 border border-slate-100 rounded-lg hover:border-teal-200 hover:bg-teal-50/40 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 text-sm truncate">{entry.company?.company_name || 'Unknown company'}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {entry.topAsset.asset_name}{entry.assetCount > 1 ? ` · +${entry.assetCount - 1} more` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900">{entry.topAsset.final_commercial_score}</div>
                  <TierBadge tier={entry.topAsset.commercial_priority_tier} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-teal-600" />
              Upcoming catalysts (6 mo)
            </h2>
            <button onClick={() => onNavigate('catalysts')} className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">
              View all <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {upcoming.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">No catalysts logged in the next 6 months.</div>}
            {upcoming.map(a => (
              <button
                key={a.id}
                onClick={() => onOpenAsset(a.id)}
                className="w-full flex items-center gap-3 p-3 border border-slate-100 rounded-lg hover:border-teal-200 hover:bg-teal-50/40 transition-colors text-left"
              >
                <div className="w-12 text-xs font-semibold text-teal-700 bg-teal-50 rounded py-1 text-center flex-shrink-0">
                  {new Date(a.catalyst_date!).toLocaleDateString('en-US', { month: 'short' })}
                  <div className="text-[10px] text-teal-600 font-normal">{new Date(a.catalyst_date!).getFullYear()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 text-sm truncate">{a.asset_name}</div>
                  <div className="text-xs text-slate-500 truncate">{a.key_upcoming_catalyst || 'Milestone'}</div>
                </div>
                <SegmentBadge segment={a.segment} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Recent material changes (30 days)</h2>
          <button onClick={() => onNavigate('changelog')} className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">
            View change log <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {recentChanges.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">No changes logged recently.</div>}
          {recentChanges.map(c => (
            <button
              key={c.id}
              onClick={() => onOpenAsset(c.asset_id)}
              className="w-full flex items-start gap-3 py-3 text-left hover:bg-slate-50 -mx-2 px-2 rounded transition-colors"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-2" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">
                  {c.asset_name || 'Asset'} <span className="text-slate-400 font-normal">— {c.field_changed}</span>
                </div>
                {c.why_it_matters && <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{c.why_it_matters}</div>}
              </div>
              <div className="text-xs text-slate-400 flex-shrink-0">{new Date(c.created_at).toLocaleDateString()}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, sub, onClick }: {
  label: string;
  value: number;
  icon: typeof Package;
  color: 'slate' | 'teal' | 'sky' | 'emerald' | 'blue' | 'red';
  sub?: string;
  onClick?: () => void;
}) {
  const map = {
    slate: { bg: 'bg-slate-100', text: 'text-slate-700' },
    teal: { bg: 'bg-teal-100', text: 'text-teal-700' },
    sky: { bg: 'bg-sky-100', text: 'text-sky-700' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-700' },
    red: { bg: 'bg-red-100', text: 'text-red-700' },
  }[color];
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { onClick } : {})}
      className={`bg-white rounded-xl border border-slate-200 p-4 text-left ${onClick ? 'hover:border-teal-200 transition-colors' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${map.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${map.text}`} />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-500 font-medium">{label}</div>
          <div className="text-2xl font-bold text-slate-900 leading-tight">{value}</div>
        </div>
      </div>
      {sub && <div className="mt-2 text-[11px] text-slate-400">{sub}</div>}
    </Wrapper>
  );
}
