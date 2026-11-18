import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';
import { CgtAsset, CgtCompany } from '../types/database';
import { CalendarClock, ArrowUpRight } from 'lucide-react';
import { TierBadge, SegmentBadge } from './ui/Badge';
import { PageKey } from './Layout';
import { audienceCounts } from '../lib/audienceCounts';
import { loadAudiences } from '../lib/loadAudiences';
import { directEvidenceUrl } from '../lib/weeklyBriefFocus';

interface DashboardProps {
  onNavigate: (page: PageKey) => void;
  onOpenAsset: (id: string) => void;
}

export function Dashboard({ onNavigate, onOpenAsset }: DashboardProps) {
  const [assets, setAssets] = useState<CgtAsset[]>([]);
  const [companies, setCompanies] = useState<CgtCompany[]>([]);
  const [companyCount, setCompanyCount] = useState(0);
  const [recentChanges, setRecentChanges] = useState<Array<{ id: string; asset_id: string; field_changed: string; why_it_matters: string; created_at: string; change_type: string; source_url: string; asset_name?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [priorityCounts, setPriorityCounts] = useState<Record<string, number> | null>(null);
  const [audienceError, setAudienceError] = useState(false);

  async function refreshAudiences() {
    try {
      setPriorityCounts(audienceCounts(await loadAudiences()));
      setAudienceError(false);
    } catch {
      setAudienceError(true);
    }
  }

  useEffect(() => {
    load();
    refreshAudiences();
  }, []);

  useRealtimeRefresh(['cgt_assets', 'cgt_companies', 'cgt_change_log', 'cgt_score_history'], () => load());
  useRealtimeRefresh(['cgt_abm_audience_members', 'cgt_abm_client_domains', 'cgt_assets', 'cgt_companies'], refreshAudiences);

  async function load() {
    const [{ data: assetData }, { data: companyData, count: cCount }, { data: changes }] = await Promise.all([
      supabase.from('cgt_assets').select('*'),
      supabase.from('cgt_companies').select('*', { count: 'exact' }),
      supabase
        .from('cgt_change_log')
        .select('id, asset_id, field_changed, why_it_matters, created_at, change_type, source_url, cgt_assets(asset_name)')
        .like('change_type', 'human_reviewed:%')
        .order('created_at', { ascending: false })
        .limit(8),
    ]);
    setAssets((assetData as CgtAsset[]) || []);
    setCompanies((companyData as CgtCompany[]) || []);
    setCompanyCount(cCount || 0);
    setRecentChanges(((changes as any[]) || [])
      .filter(c => directEvidenceUrl(c.source_url))
      .slice(0, 8)
      .map(c => ({ ...c, asset_name: c.cgt_assets?.asset_name })));
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
  const clinicalHolds = assets.filter(a => a.clinical_hold).length;
  const noMfg = assets.filter(a => a.no_manufacturing_pathway).length;

  const now = new Date();
  const sixMonths = new Date(now);
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  const upcoming = assets
    .filter(a => a.catalyst_date && !/global launch|source review/i.test(a.key_upcoming_catalyst || '') && new Date(a.catalyst_date) >= now && new Date(a.catalyst_date) <= sixMonths)
    .sort((a, b) => new Date(a.catalyst_date!).getTime() - new Date(b.catalyst_date!).getTime())
    .slice(0, 6);

  const companyById = new Map(companies.map(c => [c.id, c]));
  // This card is a launch-priority view, not a list of every clinical program.
  // Include only assets that meet the source-reviewed Priority 1/2 rules.
  const trackerAssets = assets.filter(a =>
    a.segment === 'Late Stage' && ['Tier 1', 'Tier 2'].includes(a.commercial_priority_tier || '')
  );
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

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="font-mono text-[11px] text-teal-700">Portfolio coverage</div>
                <h2 className="mt-1 text-xl font-medium text-slate-900">Tracked therapy mix</h2>
              </div>
              <button onClick={() => onNavigate('assets')} className="font-mono text-xs text-slate-500 hover:text-teal-700">{assets.length.toLocaleString()} assets · {companyCount.toLocaleString()} companies →</button>
            </div>
            <div className="mt-6 space-y-5">
              <PortfolioBar label="Late Stage" assets={lateStage.length} companies={lateStageCompanies} max={Math.max(lateStage.length, earlyStage.length, onMarket.length, 1)} tone="teal" />
              <PortfolioBar label="Early Stage" assets={earlyStage.length} companies={earlyStageCompanies} max={Math.max(lateStage.length, earlyStage.length, onMarket.length, 1)} tone="slate" />
              <PortfolioBar label="On-Market" assets={onMarket.length} companies={onMarketCompanies} max={Math.max(lateStage.length, earlyStage.length, onMarket.length, 1)} tone="slate" />
            </div>
          </div>
          <aside className="border-t border-slate-200 pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
            <div className="font-mono text-[11px] text-slate-500">Audience readiness</div>
            {audienceError && <p role="alert" className="mt-3 text-sm text-rose-700">Audience counts unavailable. <button className="underline" onClick={refreshAudiences}>Retry</button></p>}
            {!audienceError && !priorityCounts && <p className="mt-3 text-sm text-slate-500">Loading audience counts</p>}
            {!audienceError && priorityCounts && <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
              <AudienceMetric label="Late Stage" value={priorityCounts['Late Stage'] || 0} detail="Expected launch within 24 months" onClick={() => onNavigate('abmaudience')} />
              <AudienceMetric label="Priority 1" value={priorityCounts['Priority 1'] || 0} detail="Within 18 months" onClick={() => onNavigate('abmaudience')} />
              <AudienceMetric label="Priority 2" value={priorityCounts['Priority 2'] || 0} detail="19 to 24 months" onClick={() => onNavigate('abmaudience')} />
            </dl>}
            <div className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-600"><span className="font-mono text-lg text-rose-700">{clinicalHolds + noMfg}</span> risk flags <span className="text-slate-400">· {clinicalHolds} hold / {noMfg} manufacturing</span></div>
          </aside>
        </div>
      </section>

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

function PortfolioBar({ label, assets, companies, max, tone }: { label: string; assets: number; companies: number; max: number; tone: 'teal' | 'slate' }) {
  const width = `${Math.max((assets / max) * 100, assets ? 3 : 0)}%`;
  return <div className="grid grid-cols-[112px_minmax(0,1fr)_90px] items-center gap-4"><div><div className="text-sm font-medium text-slate-800">{label}</div><div className="text-xs text-slate-500">{companies} companies</div></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone === 'teal' ? 'bg-teal-600' : 'bg-slate-400'}`} style={{ width }} /></div><div className="font-mono text-right text-sm text-slate-800">{assets}</div></div>;
}

function AudienceMetric({ label, value, detail, onClick }: { label: string; value: number; detail: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-baseline justify-between gap-4 py-3 text-left hover:text-teal-700"><span><span className="block text-sm font-medium text-slate-800">{label}</span><span className="block text-xs text-slate-500">{detail}</span></span><span className="font-mono text-lg text-slate-900">{value}</span></button>;
}
