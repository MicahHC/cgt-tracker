import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';

type AssetRow = {
  id: string;
  modality: string;
  lead_indication: string;
  target_indication: string;
  phase_regulatory_status: string;
  segment: string;
  commercial_priority_tier: string | null;
};

type LandscapeRow = {
  modality: string;
  therapeuticArea: string;
  phase: string;
  programs: number;
  launchCandidates: number;
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
  const [phase, setPhase] = useState('All phases');

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('cgt_assets')
      .select('id, modality, lead_indication, target_indication, phase_regulatory_status, segment, commercial_priority_tier');
    setAssets((data as AssetRow[] | null) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useRealtimeRefresh(['cgt_assets', 'cgt_companies'], load);

  const landscape = useMemo(() => {
    const groups = new Map<string, LandscapeRow>();
    for (const asset of assets) {
      const phaseLabel = phaseGroup(asset.phase_regulatory_status, asset.segment);
      if (phase !== 'All phases' && phaseLabel !== phase) continue;
      const modality = modalityGroup(asset.modality);
      const area = therapeuticArea(asset.lead_indication || asset.target_indication);
      const key = `${modality}|${area}|${phaseLabel}`;
      const row = groups.get(key) || { modality, therapeuticArea: area, phase: phaseLabel, programs: 0, launchCandidates: 0 };
      row.programs += 1;
      if (['Tier 1', 'Tier 2'].includes(asset.commercial_priority_tier || '')) row.launchCandidates += 1;
      groups.set(key, row);
    }
    return [...groups.values()]
      .sort((a, b) => b.launchCandidates - a.launchCandidates || b.programs - a.programs)
      .slice(0, 15);
  }, [assets, phase]);

  const lateStage = assets.filter(asset => phaseGroup(asset.phase_regulatory_status, asset.segment) === 'Late stage').length;
  const launchCandidates = assets.filter(asset => ['Tier 1', 'Tier 2'].includes(asset.commercial_priority_tier || '')).length;

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-teal-600" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-10">
      <header className="border-b-2 border-slate-950 pb-8">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Research workspace</div>
        <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-slate-950">What should we build content around in 2027?</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">This workspace separates what the CGT tracker can establish from the evidence still required to validate buyer demand.</p>
      </header>

      <section className="grid gap-8 border-b border-slate-200 pb-8 md:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">What we can answer now</div>
          <p className="mt-3 text-xl leading-8 text-slate-900">Where the tracked U.S. CGT pipeline is concentrated by modality, therapeutic area, and clinical stage.</p>
          <dl className="mt-7 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200">
            <Fact label="Programs tracked" value={assets.length} />
            <Fact label="Late-stage programs" value={lateStage} />
            <Fact label="Launch candidates" value={launchCandidates} />
          </dl>
        </div>
        <div className="border-l-0 border-slate-200 pl-0 md:border-l md:pl-8">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Not yet answerable</div>
          <p className="mt-3 text-sm leading-6 text-slate-700">How buyers phrase their search, how often they search it, and which intersections have sufficient demand to justify content investment.</p>
          <p className="mt-3 text-sm leading-6 text-slate-500">Those answers require a licensed keyword or search-demand dataset. Pipeline volume is not a substitute.</p>
        </div>
      </section>

      <section>
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Pipeline landscape</div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Where trial and development activity is concentrated</h2>
          </div>
          <label className="text-sm font-medium text-slate-700">Phase
            <select value={phase} onChange={(event) => setPhase(event.target.value)} className="ml-3 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
              {['All phases', 'Phase 1', 'Phase 2', 'Late stage', 'On-market'].map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr><th className="py-3 pr-6">Modality</th><th className="py-3 pr-6">Therapeutic area</th><th className="py-3 pr-6">Stage</th><th className="py-3 text-right">Programs</th><th className="py-3 pl-6 text-right">Validated launch candidates</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {landscape.map(row => <tr key={`${row.modality}-${row.therapeuticArea}-${row.phase}`}>
                <td className="py-4 pr-6 font-medium text-slate-900">{row.modality}</td>
                <td className="py-4 pr-6 text-slate-700">{row.therapeuticArea}</td>
                <td className="py-4 pr-6 text-slate-600">{row.phase}</td>
                <td className="py-4 text-right font-semibold text-slate-900">{row.programs}</td>
                <td className="py-4 pl-6 text-right font-semibold text-teal-700">{row.launchCandidates || '—'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-y border-slate-200 py-7">
        <div className="grid gap-6 md:grid-cols-3">
          <div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next data input</div><p className="mt-2 text-sm leading-6 text-slate-800">Keyword or search-demand export with phrase, U.S. volume, trend, and geography.</p></div>
          <div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Then map</div><p className="mt-2 text-sm leading-6 text-slate-800">Modality, therapeutic area, phase, service need, and commercial intent.</p></div>
          <div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Decision rule</div><p className="mt-2 text-sm leading-6 text-slate-800">Prioritize only when buyer demand and verified pipeline momentum overlap.</p></div>
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return <div className="px-4 py-4 first:pl-0 last:pr-0"><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</dd></div>;
}
