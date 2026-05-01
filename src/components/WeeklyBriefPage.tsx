import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CgtChangeLog, CgtScoreHistory, Tier } from '../types/database';
import {
  Newspaper, ArrowUpRight, ArrowDownRight, Minus, ExternalLink,
  ClipboardList, Activity, TrendingUp, AlertCircle, CheckCircle2, CalendarDays,
  Printer, Sparkles,
} from 'lucide-react';
import { ConfidenceBadge } from './ui/Badge';
import { markWeeklyBriefSeen } from '../lib/weeklyBrief';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';

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
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  useRealtimeRefresh(
    ['cgt_change_log', 'cgt_score_history', 'cgt_agent_runs', 'cgt_assets'],
    () => { if (week) loadWeek(week); }
  );

  useEffect(() => {
    if (loading) return;
    const root = rootRef.current;
    if (!root) return;
    root.classList.add('js-ready');
    const targets = root.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [loading, week]);

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

  const priorityChanges = criticalChanges.length > 0 ? criticalChanges : changes;

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

  const generatedLabel = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div ref={rootRef} className="prestige space-y-10" id="weekly-brief-printable">
      {/* Controls bar — excluded from print */}
      <div className="no-print flex items-center justify-between gap-4 flex-wrap">
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
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Export to PDF
        </button>
      </div>

      {/* Hero */}
      <section className="reveal prestige-hero px-8 md:px-14 py-14 md:py-20">
        <div className="max-w-4xl mx-auto text-center">
          <span className="prestige-eyebrow">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 prestige-dot" />
            Weekly Brief · {week}
          </span>
          <h1 className="prestige-headline mt-6">
            The week in <span className="prestige-gradient-text">cell &amp; gene therapy</span>
          </h1>
          <p className="text-base md:text-lg text-white/70 mt-5 max-w-2xl mx-auto leading-relaxed">
            A synthesized recap of every change, score move, and signal our agents surfaced this week.
          </p>

          <div className="mt-10 flex items-center justify-center gap-6 md:gap-10 flex-wrap">
            <HeroMetric value={changes.length} label="Changes logged" />
            <div className="prestige-divider-vert hidden md:block" />
            <HeroMetric value={priorityChanges.length} label="Top priority" />
            <div className="prestige-divider-vert hidden md:block" />
            <HeroMetric value={scores.length} label="Score updates" />
            <div className="prestige-divider-vert hidden md:block" />
            <HeroMetric value={runs?.materialSignals ?? 0} label="Material signals" sub={runs ? `${runs.signalsFound} total` : undefined} />
          </div>

          <div className="mt-8 text-xs text-white/50 tracking-wider uppercase">
            Generated {generatedLabel}
          </div>
        </div>
      </section>

      {/* Highlights · Top Priority Changes */}
      <section className="reveal reveal-delay-1">
        <header className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <Sparkles className="w-3 h-3" />
              Highlights
            </span>
            <h2 className="prestige-section-title mt-3">Top priority changes</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-xl leading-relaxed">
              The changes most likely to move a thesis this week: tier shifts, phase moves, filings, PDUFA dates, and regulatory signals.
            </p>
          </div>
          <div className="text-xs font-medium text-slate-500 tracking-wide uppercase">
            Showing {Math.min(priorityChanges.length, 20)} of {changes.length}
          </div>
        </header>

        {changes.length === 0 ? (
          <div className="prestige-card p-12 text-center text-sm text-slate-400">No changes recorded this week.</div>
        ) : (
          <div className="prestige-card overflow-hidden">
            <div className="divide-y divide-slate-100">
              {priorityChanges.slice(0, 20).map(c => (
                <div key={c.id} className="px-6 py-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <button onClick={() => onOpenAsset(c.asset_id)} className="text-[15px] font-semibold text-slate-900 hover:text-teal-700 transition-colors">
                        {c.asset_name || 'Asset'}
                      </button>
                      <span className="text-sm text-slate-500"> · {c.company_name}</span>
                      <div className="mt-1 text-[11px] font-semibold tracking-widest uppercase text-teal-700">
                        {c.field_changed}
                      </div>
                      <div className="text-sm mt-1.5 text-slate-700">
                        <span className="text-slate-400 line-through">{c.previous_value || '—'}</span>{' '}
                        <span className="text-slate-900 font-medium">→ {c.new_value || '—'}</span>
                      </div>
                      {c.why_it_matters && <div className="text-sm text-slate-600 mt-2 leading-relaxed">{c.why_it_matters}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0 text-xs text-slate-500">
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
          </div>
        )}
      </section>

      {/* Metrics Grid */}
      <section className="reveal reveal-delay-2">
        <header className="mb-6">
          <span className="prestige-eyebrow prestige-eyebrow-light">Summary</span>
          <h2 className="prestige-section-title mt-3">By the numbers</h2>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
      </section>

      {/* Top movers */}
      {topMovers.length > 0 && (
        <section className="reveal reveal-delay-3">
          <header className="mb-6">
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <TrendingUp className="w-3 h-3" />
              Movement
            </span>
            <h2 className="prestige-section-title mt-3">Top score movers</h2>
          </header>
          <div className="prestige-card overflow-hidden">
            <div className="divide-y divide-slate-100">
              {topMovers.map(s => (
                <div key={s.id} className="px-6 py-4 hover:bg-slate-50/60 flex items-center gap-4 transition-colors">
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => onOpenAsset(s.asset_id)}
                      className="text-sm font-semibold text-slate-900 hover:text-teal-700 truncate block text-left transition-colors"
                    >
                      {s.asset_name}
                    </button>
                    <div className="text-xs text-slate-500 truncate">{s.company_name}</div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Commercial</div>
                      <div className="font-mono text-slate-700 mt-0.5">
                        {s.prev_final ?? '—'} <span className="text-slate-300">→</span> <span className="font-semibold text-slate-900">{s.final_commercial_score}</span>
                      </div>
                    </div>
                    <DeltaBadge delta={s.delta} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Tier changes */}
      {tierChanges.length > 0 && (
        <section className="reveal reveal-delay-4">
          <header className="mb-6">
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <AlertCircle className="w-3 h-3" />
              Tiering
            </span>
            <h2 className="prestige-section-title mt-3">Tier changes</h2>
          </header>
          <div className="prestige-card overflow-hidden">
            <div className="divide-y divide-slate-100">
              {tierChanges.map(s => (
                <div key={s.id} className="px-6 py-4 hover:bg-slate-50/60 transition-colors">
                  <button
                    onClick={() => onOpenAsset(s.asset_id)}
                    className="text-sm font-semibold text-slate-900 hover:text-teal-700 transition-colors"
                  >
                    {s.asset_name}
                  </button>
                  <span className="text-sm text-slate-500"> · {s.company_name}</span>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {s.prev_commercial_tier && s.prev_commercial_tier !== s.commercial_priority_tier && (
                      <div className="inline-flex items-center gap-1.5 text-xs">
                        <span className="text-slate-500">Commercial:</span>
                        <span className={`px-2 py-0.5 rounded font-medium ${tierColor(s.prev_commercial_tier)}`}>{s.prev_commercial_tier}</span>
                        <ArrowUpRight className="w-3 h-3 text-slate-400" />
                        <span className={`px-2 py-0.5 rounded font-medium ${tierColor(s.commercial_priority_tier)}`}>{s.commercial_priority_tier ?? '—'}</span>
                      </div>
                    )}
                    {s.prev_strategic_tier && s.prev_strategic_tier !== s.strategic_priority_tier && (
                      <div className="inline-flex items-center gap-1.5 text-xs">
                        <span className="text-slate-500">Strategic:</span>
                        <span className={`px-2 py-0.5 rounded font-medium ${tierColor(s.prev_strategic_tier)}`}>{s.prev_strategic_tier}</span>
                        <ArrowUpRight className="w-3 h-3 text-slate-400" />
                        <span className={`px-2 py-0.5 rounded font-medium ${tierColor(s.strategic_priority_tier)}`}>{s.strategic_priority_tier ?? '—'}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function HeroMetric({ value, label, sub }: { value: number; label: string; sub?: string }) {
  return (
    <div className="text-center min-w-[120px]">
      <div className="prestige-metric-value text-white">{value}</div>
      <div className="prestige-metric-label text-white/60 mt-2">{label}</div>
      {sub && <div className="text-[11px] text-white/40 mt-1">{sub}</div>}
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
    <div className="prestige-card p-5">
      <div className="flex items-center justify-between">
        <div className="prestige-metric-label">{label}</div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="prestige-metric-value text-slate-900 mt-4">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1.5">{sub}</div>}
    </div>
  );
}
