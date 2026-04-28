import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CgtChangeLog, CgtScoreHistory, Tier } from '../types/database';
import {
  Newspaper, ArrowUpRight, ArrowDownRight, Minus, ExternalLink,
  ClipboardList, Activity, TrendingUp, AlertCircle, CheckCircle2, CalendarDays,
} from 'lucide-react';
import { ConfidenceBadge } from './ui/Badge';
import { markWeeklyBriefSeen } from '../lib/weeklyBrief';

interface Props {
  onOpenAsset: (id: string) => void;
}

interface ChangeRow extends CgtChangeLog {
  asset_name?: string;
  company_name?: string;
}

interface ScoreRow extends CgtScoreHistory {
  asset_name?: string;
  company_name?: string;
  prev_final?: number | null;
  prev_strategic?: number | null;
  prev_commercial_tier?: Tier | null;
  prev_strategic_tier?: Tier | null;
}

interface RunSummary {
  total: number;
  succeeded: number;
  partial: number;
  failed: number;
  signalsFound: number;
  materialSignals: number;
  scoreUpdates: number;
  latestFinishedAt: string | null;
}

function tierColor(tier: Tier | null | undefined) {
  switch (tier) {
    case 'Tier 1': return 'bg-teal-100 text-teal-800';
    case 'Tier 2': return 'bg-blue-100 text-blue-800';
    case 'Watchlist': return 'bg-amber-100 text-amber-800';
    case 'Deprioritized': return 'bg-slate-100 text-slate-600';
    default: return 'bg-slate-100 text-slate-500';
  }
}

export function WeeklyBriefPage({ onOpenAsset }: Props) {
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<string | null>(null);
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [runs, setRuns] = useState<RunSummary | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('cgt_change_log')
        .select('update_week')
        .not('update_week', 'is', null)
        .order('update_week', { ascending: false });
      const weeks = Array.from(new Set(((data as any[]) || []).map(r => r.update_week as string)));
      setAvailableWeeks(weeks);
      if (weeks.length > 0) setWeek(weeks[0]);
      else setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!week) return;
    loadWeek(week);
  }, [week]);

  async function loadWeek(w: string) {
    setLoading(true);

    const changesQ = supabase
      .from('cgt_change_log')
      .select('*, cgt_assets!inner(asset_name, company_id, cgt_companies!inner(company_name))')
      .eq('update_week', w)
      .order('created_at', { ascending: false });

    const scoresQ = supabase
      .from('cgt_score_history')
      .select('*, cgt_assets!inner(asset_name, company_id, cgt_companies!inner(company_name))')
      .eq('week_label', w)
      .order('recorded_at', { ascending: false });

    const [{ data: changeData }, { data: scoreData }] = await Promise.all([changesQ, scoresQ]);

    const mappedChanges: ChangeRow[] = ((changeData as any[]) || []).map(r => ({
      ...r,
      asset_name: r.cgt_assets?.asset_name,
      company_name: r.cgt_assets?.cgt_companies?.company_name,
    }));

    const mappedScores: ScoreRow[] = ((scoreData as any[]) || []).map(r => ({
      ...r,
      asset_name: r.cgt_assets?.asset_name,
      company_name: r.cgt_assets?.cgt_companies?.company_name,
    }));

    const assetIds = Array.from(new Set(mappedScores.map(s => s.asset_id)));
    if (assetIds.length > 0) {
      const { data: prior } = await supabase
        .from('cgt_score_history')
        .select('asset_id, week_label, final_commercial_score, strategic_opportunity_score, commercial_priority_tier, strategic_priority_tier, recorded_at')
        .in('asset_id', assetIds)
        .lt('week_label', w)
        .order('recorded_at', { ascending: false });
      const priorByAsset = new Map<string, any>();
      for (const p of (prior as any[]) || []) {
        if (!priorByAsset.has(p.asset_id)) priorByAsset.set(p.asset_id, p);
      }
      for (const s of mappedScores) {
        const p = priorByAsset.get(s.asset_id);
        if (p) {
          s.prev_final = p.final_commercial_score;
          s.prev_strategic = p.strategic_opportunity_score;
          s.prev_commercial_tier = p.commercial_priority_tier;
          s.prev_strategic_tier = p.strategic_priority_tier;
        }
      }
    }

    setChanges(mappedChanges);
    setScores(mappedScores);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 14);
    const { data: runData } = await supabase
      .from('cgt_agent_runs')
      .select('status, signals_found, material_signals, score_updates, finished_at, started_at, week_label')
      .eq('week_label', w)
      .order('started_at', { ascending: false });

    const rs = (runData as any[]) || [];
    const summary: RunSummary = {
      total: rs.length,
      succeeded: rs.filter(r => r.status === 'succeeded').length,
      partial: rs.filter(r => r.status === 'partial').length,
      failed: rs.filter(r => r.status === 'failed').length,
      signalsFound: rs.reduce((a, r) => a + (r.signals_found || 0), 0),
      materialSignals: rs.reduce((a, r) => a + (r.material_signals || 0), 0),
      scoreUpdates: rs.reduce((a, r) => a + (r.score_updates || 0), 0),
      latestFinishedAt: rs.map(r => r.finished_at).filter(Boolean).sort().slice(-1)[0] || null,
    };
    setRuns(summary);

    markWeeklyBriefSeen(w);

    setLoading(false);
  }

  const topMovers = useMemo(() => {
    return [...scores]
      .filter(s => s.prev_final != null)
      .map(s => ({ ...s, delta: (s.final_commercial_score || 0) - (s.prev_final || 0) }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8);
  }, [scores]);

  const tierChanges = useMemo(() => {
    return scores.filter(s =>
      (s.prev_commercial_tier && s.prev_commercial_tier !== s.commercial_priority_tier) ||
      (s.prev_strategic_tier && s.prev_strategic_tier !== s.strategic_priority_tier)
    );
  }, [scores]);

  const criticalChanges = useMemo(() => {
    return changes.filter(c => /tier|phase|filing|pdufa|clinical hold|catalyst|regulatory/i.test(c.field_changed || ''));
  }, [changes]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;
  }

  if (!week) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
        <Newspaper className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <div className="text-slate-700 font-medium">No weekly briefs yet</div>
        <p className="text-sm text-slate-500 mt-1">Briefs appear after the weekly agent run completes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-teal-600" />
            <h1 className="text-2xl font-bold text-slate-900">Weekly Brief</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            A synthesized recap of every change, score move, and signal from the week.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <CalendarDays className="w-4 h-4 text-slate-500" />
          <select
            value={week}
            onChange={e => setWeek(e.target.value)}
            className="text-sm font-medium text-slate-900 bg-transparent outline-none"
          >
            {availableWeeks.map(w => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <header className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-teal-600" />
            <h2 className="font-semibold text-slate-900 text-sm">
              {criticalChanges.length > 0 ? 'Highlights · Top priority changes' : 'Highlights'}
            </h2>
          </div>
          <div className="text-xs text-slate-500">
            Showing {Math.min(criticalChanges.length || changes.length, 20)} of {changes.length}
          </div>
        </header>
        {changes.length === 0 ? (
          <div className="p-10 text-sm text-slate-400 text-center">No changes recorded this week.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(criticalChanges.length > 0 ? criticalChanges : changes).slice(0, 20).map(c => (
              <div key={c.id} className="px-5 py-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <button onClick={() => onOpenAsset(c.asset_id)} className="text-sm font-medium text-teal-700 hover:underline">
                      {c.asset_name || 'Asset'}
                    </button>
                    <span className="text-sm text-slate-500"> · {c.company_name} · </span>
                    <span className="text-sm font-medium text-slate-900">{c.field_changed}</span>
                    <div className="text-sm mt-1">
                      <span className="text-slate-500 line-through">{c.previous_value || '—'}</span>{' '}
                      <span className="text-teal-700">→ {c.new_value || '—'}</span>
                    </div>
                    {c.why_it_matters && <div className="text-xs text-slate-600 mt-1">{c.why_it_matters}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 text-xs text-slate-500">
                    <div>{new Date(c.created_at).toLocaleDateString()}</div>
                    <div className="flex items-center gap-2">
                      <ConfidenceBadge level={c.confidence_level} />
                      {c.source_url && (
                        <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-teal-600 hover:underline">
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
      </section>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="Changes logged" value={changes.length} icon={ClipboardList} color="teal" />
        <Stat label="Score updates" value={scores.length} icon={TrendingUp} color="blue" />
        <Stat
          label="Material signals"
          value={runs?.materialSignals ?? 0}
          icon={Activity}
          color="amber"
          sub={runs ? `${runs.signalsFound} total signals` : undefined}
        />
        <Stat
          label="Agent runs"
          value={runs?.total ?? 0}
          icon={CheckCircle2}
          color="slate"
          sub={runs ? `${runs.succeeded} ok · ${runs.partial} partial · ${runs.failed} failed` : undefined}
        />
      </div>

      {topMovers.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <header className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-600" />
            <h2 className="font-semibold text-slate-900 text-sm">Top score movers</h2>
          </header>
          <div className="divide-y divide-slate-100">
            {topMovers.map(s => (
              <div key={s.id} className="px-5 py-3 hover:bg-slate-50 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => onOpenAsset(s.asset_id)}
                    className="text-sm font-medium text-teal-700 hover:underline truncate block text-left"
                  >
                    {s.asset_name}
                  </button>
                  <div className="text-xs text-slate-500 truncate">{s.company_name}</div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Commercial</div>
                    <div className="font-mono text-slate-700">
                      {s.prev_final ?? '—'} <ArrowUpRight className="inline w-3 h-3 text-slate-400" /> <span className="font-semibold text-slate-900">{s.final_commercial_score}</span>
                    </div>
                  </div>
                  <DeltaBadge delta={s.delta} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tierChanges.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <header className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <h2 className="font-semibold text-slate-900 text-sm">Tier changes</h2>
          </header>
          <div className="divide-y divide-slate-100">
            {tierChanges.map(s => (
              <div key={s.id} className="px-5 py-3 hover:bg-slate-50">
                <button
                  onClick={() => onOpenAsset(s.asset_id)}
                  className="text-sm font-medium text-teal-700 hover:underline"
                >
                  {s.asset_name}
                </button>
                <span className="text-sm text-slate-500"> · {s.company_name}</span>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {s.prev_commercial_tier && s.prev_commercial_tier !== s.commercial_priority_tier && (
                    <div className="inline-flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500">Commercial:</span>
                      <span className={`px-1.5 py-0.5 rounded ${tierColor(s.prev_commercial_tier)}`}>{s.prev_commercial_tier}</span>
                      <ArrowUpRight className="w-3 h-3 text-slate-400" />
                      <span className={`px-1.5 py-0.5 rounded ${tierColor(s.commercial_priority_tier)}`}>{s.commercial_priority_tier ?? '—'}</span>
                    </div>
                  )}
                  {s.prev_strategic_tier && s.prev_strategic_tier !== s.strategic_priority_tier && (
                    <div className="inline-flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500">Strategic:</span>
                      <span className={`px-1.5 py-0.5 rounded ${tierColor(s.prev_strategic_tier)}`}>{s.prev_strategic_tier}</span>
                      <ArrowUpRight className="w-3 h-3 text-slate-400" />
                      <span className={`px-1.5 py-0.5 rounded ${tierColor(s.strategic_priority_tier)}`}>{s.strategic_priority_tier ?? '—'}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
        <Minus className="w-3 h-3" /> 0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${
      up ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
    }`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {up ? '+' : ''}{delta}
    </span>
  );
}

interface StatProps {
  label: string;
  value: number;
  icon: typeof ClipboardList;
  color: 'teal' | 'blue' | 'amber' | 'slate';
  sub?: string;
}
function Stat({ label, value, icon: Icon, color, sub }: StatProps) {
  const colorMap = {
    teal: 'bg-teal-50 text-teal-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-2">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
