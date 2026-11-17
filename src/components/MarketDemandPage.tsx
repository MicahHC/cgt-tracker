import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';
import { BarChart3, Database, FlaskConical, Search, Sparkles, Target } from 'lucide-react';

type AssetRow = {
  id: string;
  asset_name: string;
  modality: string;
  lead_indication: string;
  target_indication: string;
  phase_regulatory_status: string;
  segment: string;
  commercial_priority_tier: string | null;
  catalyst_date: string | null;
};

type Opportunity = {
  label: string;
  modality: string;
  therapeuticArea: string;
  phase: string;
  assets: number;
  lateStage: number;
  priority: number;
  nextStep: string;
};

function modalityGroup(value: string): string {
  const text = value.toLowerCase();
  if (/car.?t|tcr.?t|nk.?cell/.test(text)) return 'Cell therapy';
  if (/gene|aav|lentiv|crispr|edit/.test(text)) return 'Gene therapy';
  if (/stem|msc/.test(text)) return 'Regenerative medicine';
  return value.trim() || 'Unclassified';
}

function phaseGroup(value: string, segment: string): string {
  const text = value.toLowerCase();
  if (segment === 'On-Market' || /approved|marketed|launched/.test(text)) return 'On-market';
  if (/pdufa|bla accepted|filed|phase iii|phase 3|pivotal|registrational/.test(text)) return 'Late stage';
  if (/phase ii|phase 2/.test(text)) return 'Phase 2';
  if (/phase i|phase 1/.test(text)) return 'Phase 1';
  return 'Unclassified';
}

function therapeuticArea(value: string): string {
  const text = value.toLowerCase();
  if (/oncolog|cancer|tumou?r|melanoma|leukemia|myeloma/.test(text)) return 'Oncology';
  if (/neuro|cns|retina|ophthalm|huntington|muscular|duchenne/.test(text)) return 'Neurology & ophthalmology';
  if (/autoimmune|lupus|myasthenia/.test(text)) return 'Autoimmune';
  if (/hemophilia|blood|hematolog|sickle/.test(text)) return 'Hematology';
  if (/rare|metabolic|genetic|orphan/.test(text)) return 'Rare & metabolic disease';
  return value.trim() || 'Other';
}

export function MarketDemandPage() {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhase, setSelectedPhase] = useState('All phases');

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('cgt_assets')
      .select('id, asset_name, modality, lead_indication, target_indication, phase_regulatory_status, segment, commercial_priority_tier, catalyst_date');
    setAssets((data as AssetRow[] | null) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useRealtimeRefresh(['cgt_assets', 'cgt_companies'], load);

  const opportunities = useMemo(() => {
    const groups = new Map<string, Opportunity>();
    for (const asset of assets) {
      const modality = modalityGroup(asset.modality);
      const area = therapeuticArea(asset.lead_indication || asset.target_indication);
      const phase = phaseGroup(asset.phase_regulatory_status, asset.segment);
      if (selectedPhase !== 'All phases' && phase !== selectedPhase) continue;
      const key = `${modality}|${area}|${phase}`;
      const current = groups.get(key) || {
        label: `${modality} for ${area}`,
        modality,
        therapeuticArea: area,
        phase,
        assets: 0,
        lateStage: 0,
        priority: 0,
        nextStep: '',
      };
      current.assets += 1;
      if (phase === 'Late stage') current.lateStage += 1;
      if (['Tier 1', 'Tier 2'].includes(asset.commercial_priority_tier || '')) current.priority += 1;
      groups.set(key, current);
    }
    return [...groups.values()]
      .map(item => ({
        ...item,
        nextStep: item.priority > 0
          ? `Build an account-facing ${item.modality.toLowerCase()} package for ${item.therapeuticArea.toLowerCase()}.`
          : `Validate buyer language before investing in a ${item.phase.toLowerCase()} content package.`,
      }))
      .sort((a, b) => (b.priority * 20 + b.lateStage * 10 + b.assets) - (a.priority * 20 + a.lateStage * 10 + a.assets))
      .slice(0, 12);
  }, [assets, selectedPhase]);

  const reviewedPriorities = assets.filter(asset => ['Tier 1', 'Tier 2'].includes(asset.commercial_priority_tier || '')).length;
  const lateStage = assets.filter(asset => phaseGroup(asset.phase_regulatory_status, asset.segment) === 'Late stage').length;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-teal-700">Market Demand</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Content opportunity map</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Use pipeline concentration to focus research and package development. Search-volume validation is intentionally separated until a licensed demand-data source is connected.</p>
        </div>
        <label className="text-sm font-medium text-slate-700">
          Phase focus
          <select value={selectedPhase} onChange={(event) => setSelectedPhase(event.target.value)} className="ml-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
            {['All phases', 'Phase 1', 'Phase 2', 'Late stage', 'On-market'].map(phase => <option key={phase}>{phase}</option>)}
          </select>
        </label>
      </header>

      <section className="grid gap-5 md:grid-cols-3">
        <Metric icon={Database} label="Tracked programs" value={assets.length} detail="Current CGT asset universe" />
        <Metric icon={FlaskConical} label="Late-stage programs" value={lateStage} detail="Pipeline signal, not a launch forecast" />
        <Metric icon={Target} label="Reviewed launch priorities" value={reviewedPriorities} detail="Source-reviewed Priority 1 or 2" />
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.16em] uppercase text-slate-500">Pipeline-led opportunities</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Where the current universe is concentrated</h2>
            </div>
            <span className="text-xs text-slate-500">Ranked by validated priority and program concentration</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr><th className="px-5 py-3">Opportunity</th><th className="px-4 py-3">Phase</th><th className="px-4 py-3 text-center">Programs</th><th className="px-4 py-3 text-center">Priority</th><th className="px-5 py-3">Recommended next step</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {opportunities.map(item => <tr key={`${item.modality}-${item.therapeuticArea}-${item.phase}`} className="align-top hover:bg-slate-50">
                  <td className="px-5 py-4 font-medium text-slate-900">{item.label}<div className="mt-1 text-xs font-normal text-slate-500">{item.therapeuticArea}</div></td>
                  <td className="px-4 py-4 text-slate-600">{item.phase}</td>
                  <td className="px-4 py-4 text-center font-semibold text-slate-900">{item.assets}</td>
                  <td className="px-4 py-4 text-center font-semibold text-teal-700">{item.priority || '—'}</td>
                  <td className="px-5 py-4 text-slate-600">{item.nextStep}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="border-l border-slate-200 pl-0 lg:pl-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Search className="h-4 w-4 text-teal-600" /> Buyer-language validation</div>
          <p className="mt-3 text-sm leading-6 text-slate-600">Not connected yet. This prevents the tracker from presenting pipeline activity as search demand.</p>
          <div className="mt-5 space-y-4 text-sm">
            <Step number="1" title="Import keyword demand" text="Connect a licensed Google Ads, DataForSEO, or Semrush export with volume, trend, and geography." />
            <Step number="2" title="Map buyer phrases" text="Cluster phrases by modality, therapeutic area, phase, and service need." />
            <Step number="3" title="Prioritize content" text="Rank only where buyer demand and pipeline momentum overlap." />
          </div>
          <div className="mt-7 border-t border-slate-200 pt-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Sparkles className="h-4 w-4 text-amber-500" /> Current recommendation</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">Use this page to choose which combinations warrant demand research first. Do not use it to claim query volume until a demand-data source is imported.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof BarChart3; label: string; value: number; detail: string }) {
  return <div className="border-b border-slate-200 pb-5">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"><Icon className="h-4 w-4 text-teal-600" /> {label}</div>
    <div className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{value}</div>
    <div className="mt-1 text-sm text-slate-500">{detail}</div>
  </div>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">{number}</span><div><div className="font-medium text-slate-900">{title}</div><p className="mt-1 leading-5 text-slate-600">{text}</p></div></div>;
}
