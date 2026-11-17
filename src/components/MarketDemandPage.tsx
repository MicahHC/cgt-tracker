import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, ExternalLink, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';

type Snapshot = { snapshot_week: string; nct_id: string; sponsor_name: string; asset_name: string; modality: string; therapeutic_area: string; phase: string; overall_status: string; source_url: string; study_title: string };
type SnapshotRun = { snapshot_week: string; status: 'running' | 'succeeded' | 'partial' | 'failed'; studies_stored: number; coverage_status: 'complete' | 'partial' | 'unknown'; error: string };
type DemandObservation = { observation_period: string; source_name: string; query_text: string; geography: string; monthly_search_volume: number | null };
type LoadState = 'loading' | 'ready' | 'setup-required';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00Z`));
}

export function MarketDemandPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [runs, setRuns] = useState<SnapshotRun[]>([]);
  const [demand, setDemand] = useState<DemandObservation[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');

  async function load() {
    setState('loading');
    const [runsResult, snapshotsResult, demandResult] = await Promise.all([
      supabase.from('cgt_market_snapshot_runs').select('snapshot_week, status, studies_stored, coverage_status, error').order('snapshot_week', { ascending: false }).limit(2),
      supabase.from('cgt_trial_market_snapshots').select('snapshot_week, nct_id, sponsor_name, asset_name, modality, therapeutic_area, phase, overall_status, source_url, study_title').order('snapshot_week', { ascending: false }).limit(2500),
      supabase.from('cgt_market_demand_observations').select('observation_period, source_name, query_text, geography, monthly_search_volume').order('observation_period', { ascending: false }).limit(250),
    ]);
    const firstError = runsResult.error ?? snapshotsResult.error ?? demandResult.error;
    if (firstError) {
      setError(/does not exist|schema cache/i.test(firstError.message)
        ? 'The market-intelligence evidence tables have not been deployed to the live database yet.'
        : `Could not load the evidence workspace: ${firstError.message}`);
      setState('setup-required');
      return;
    }
    setRuns((runsResult.data as SnapshotRun[] | null) ?? []);
    setSnapshots((snapshotsResult.data as Snapshot[] | null) ?? []);
    setDemand((demandResult.data as DemandObservation[] | null) ?? []);
    setError('');
    setState('ready');
  }

  useEffect(() => { load(); }, []);
  useRealtimeRefresh(['cgt_trial_market_snapshots', 'cgt_market_snapshot_runs', 'cgt_market_demand_observations'], load);

  const currentRun = runs[0];
  const currentWeek = currentRun?.snapshot_week;
  const priorWeek = runs[1]?.snapshot_week;
  const currentStudies = useMemo(() => snapshots.filter((record) => record.snapshot_week === currentWeek), [snapshots, currentWeek]);
  const priorIds = useMemo(() => new Set(snapshots.filter((record) => record.snapshot_week === priorWeek).map((record) => record.nct_id)), [snapshots, priorWeek]);
  const newStudies = useMemo(() => currentStudies.filter((record) => !priorIds.has(record.nct_id)), [currentStudies, priorIds]);
  const recentDemand = useMemo(() => demand.filter((record) => record.monthly_search_volume !== null).sort((a, b) => (b.monthly_search_volume ?? 0) - (a.monthly_search_volume ?? 0)).slice(0, 8), [demand]);

  if (state === 'loading') return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-teal-600" /></div>;
  return <div className="mx-auto max-w-7xl space-y-8 pb-10">
    <header className="flex flex-col justify-between gap-5 border-b-2 border-slate-950 pb-7 md:flex-row md:items-end">
      <div><div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Evidence workspace</div><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Market intelligence</h1><p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">Verified U.S. development activity and buyer-demand evidence, kept separate so planning decisions have an auditable source.</p></div>
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Decision rule:</span> prioritize only when a source-backed demand signal and a relevant pipeline signal overlap.</div>
    </header>
    {state === 'setup-required' ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-6"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h2 className="font-semibold text-amber-950">Evidence pipeline is not deployed</h2><p className="mt-1 text-sm leading-6 text-amber-900">{error}</p><p className="mt-3 text-sm text-amber-900">No pipeline volume or buyer-demand claims are shown until the snapshot job and source tables are live.</p></div></div></section> : <>
      <section className="grid gap-5 lg:grid-cols-2">
        <EvidenceCard icon={<Database className="h-5 w-5" />} title="ClinicalTrials.gov development activity" status={currentRun?.status === 'succeeded' ? 'Verified snapshot' : currentRun?.status === 'partial' ? 'Partial snapshot' : 'No current snapshot'} tone={currentRun?.status === 'succeeded' ? 'good' : 'warn'}>
          {currentRun ? <><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{currentRun.studies_stored.toLocaleString()}</p><p className="mt-1 text-sm text-slate-600">U.S. registry studies captured for {currentRun.snapshot_week}. Coverage: <strong>{currentRun.coverage_status}</strong>.</p><p className="mt-4 text-sm text-slate-700"><strong>{priorWeek ? newStudies.length : '—'}</strong> new-to-snapshot studies {priorWeek ? `versus ${priorWeek}` : 'after the next completed comparison week'}.</p>{currentRun.error && <p className="mt-3 text-xs text-amber-800">Run note: {currentRun.error}</p>}</> : <EmptyCopy>Run the ClinicalTrials.gov snapshot before using this panel for pipeline conclusions.</EmptyCopy>}
        </EvidenceCard>
        <EvidenceCard icon={<Search className="h-5 w-5" />} title="Buyer-demand evidence" status={demand.length ? 'Imported source data' : 'No demand data'} tone={demand.length ? 'good' : 'warn'}>
          {demand.length ? <><p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{demand.length.toLocaleString()}</p><p className="mt-1 text-sm text-slate-600">Search, prompt, or buyer-research observations. Latest period: <strong>{formatDate(demand[0].observation_period)}</strong>.</p><p className="mt-4 text-sm text-slate-700">This data is not inferred from the tracker or trial registry.</p></> : <EmptyCopy>Import an approved keyword/search-demand export with query, U.S. volume, period, geography, and source before making content recommendations.</EmptyCopy>}
        </EvidenceCard>
      </section>
      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]"><div><SectionHeading eyebrow="Pipeline movement" title="New-to-snapshot U.S. studies" description="A registry record is an observed study, not a commercialization forecast or buyer-intent signal." />{currentRun && priorWeek ? <StudyTable studies={newStudies} /> : <EmptyPanel>Two completed weekly snapshots are required before the tool can identify movement.</EmptyPanel>}</div><div><SectionHeading eyebrow="Demand input" title="Top imported queries" description="Only imported, source-attributed demand data appears here." />{recentDemand.length ? <DemandTable rows={recentDemand} /> : <EmptyPanel>There is no approved buyer-demand dataset connected yet.</EmptyPanel>}</div></section>
    </>}
  </div>;
}

function EvidenceCard({ icon, title, status, tone, children }: { icon: React.ReactNode; title: string; status: string; tone: 'good' | 'warn'; children: React.ReactNode }) { return <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-2 text-slate-950">{icon}<h2 className="font-semibold">{title}</h2></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone === 'good' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-900'}`}>{status}</span></div>{children}</article>; }
function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="border-b border-slate-200 pb-4"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</div><h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div>; }
function StudyTable({ studies }: { studies: Snapshot[] }) { if (!studies.length) return <EmptyPanel>No new registry studies appeared in the latest completed comparison.</EmptyPanel>; return <div className="overflow-x-auto"><table className="mt-3 w-full min-w-[700px] text-sm"><thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"><tr><th className="py-3 pr-4">Study</th><th className="py-3 pr-4">Sponsor</th><th className="py-3 pr-4">Phase</th><th className="py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{studies.slice(0, 20).map((study) => <tr key={study.nct_id}><td className="max-w-sm py-4 pr-4"><a className="font-medium text-teal-700 hover:underline" href={study.source_url} target="_blank" rel="noreferrer">{study.study_title || study.asset_name || study.nct_id} <ExternalLink className="inline h-3 w-3" /></a><div className="mt-1 text-xs text-slate-500">{study.modality || 'Unclassified'} · {study.therapeutic_area || 'Condition not reported'}</div></td><td className="py-4 pr-4 text-slate-700">{study.sponsor_name || 'Not reported'}</td><td className="py-4 pr-4 text-slate-700">{study.phase || 'Not reported'}</td><td className="py-4 text-slate-700">{study.overall_status || 'Not reported'}</td></tr>)}</tbody></table></div>; }
function DemandTable({ rows }: { rows: DemandObservation[] }) { return <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">{rows.map((row) => <div key={`${row.source_name}-${row.query_text}-${row.observation_period}`} className="p-4"><div className="flex justify-between gap-3"><div className="font-medium text-slate-900">{row.query_text || 'Unspecified query'}</div><div className="shrink-0 font-semibold text-slate-900">{row.monthly_search_volume?.toLocaleString()}/mo</div></div><div className="mt-1 text-xs text-slate-500">{row.source_name} · {row.geography} · {formatDate(row.observation_period)}</div></div>)}</div>; }
function EmptyCopy({ children }: { children: React.ReactNode }) { return <p className="mt-4 text-sm leading-6 text-slate-600">{children}</p>; }
function EmptyPanel({ children }: { children: React.ReactNode }) { return <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">{children}</div>; }
