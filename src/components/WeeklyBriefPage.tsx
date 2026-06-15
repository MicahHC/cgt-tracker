import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadAbmEngagementCsv, normalizeAccountName, toggleClientStatus } from '../lib/abmEngagement';
import { isClosedWonAccount, mentionsClosedWonAccount } from '../lib/abmSuppression';
import { AbmAudienceSegment, CgtAbmWeeklyEngagement, CgtChangeLog, CgtScoreHistory, Tier } from '../types/database';
import {
  Newspaper, ArrowUpRight, ArrowDownRight, Minus, ExternalLink,
  ClipboardList, Activity, TrendingUp, AlertCircle, CheckCircle2, CalendarDays,
  Printer, Sparkles, UploadCloud, Target, Users, DollarSign, ShieldOff,
} from 'lucide-react';
import { ConfidenceBadge } from './ui/Badge';
import { briefSignature, markWeeklyBriefSeen } from '../lib/weeklyBrief';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';
import { ABM_AUDIENCE_SEGMENTS } from '../lib/constants';
import { formatTrackerWeekLabel } from '../lib/weekLabels';
import { AbmEngagementBrief } from './AbmEngagementBrief';

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

interface AbmBriefSummary {
  headline?: string;
  key_takeaways?: string[];
  recommended_actions?: Array<{ priority: number; account: string; action: string; why: string; next_step: string }>;
  segments?: Array<{ on_site_accounts?: string[] }>;
}

interface RunSummary {
  succeeded: number;
  partial: number;
  failed: number;
  signalsFound: number;
  materialSignals: number;
  scoreUpdates: number;
  latestFinishedAt: string | null;
}

interface AssetContext {
  id: string;
  company_id: string;
  company_name: string;
  asset_name: string;
  modality: string;
  lead_indication: string;
  target_indication: string;
  phase_regulatory_status: string;
  likely_us_launch_within_24_months: string;
  commercial_buildout_status: string;
  final_commercial_score: number;
  strategic_opportunity_score: number;
  commercial_priority_tier: Tier | null;
  strategic_priority_tier: Tier | null;
  key_upcoming_catalyst: string;
  catalyst_date: string | null;
}

type AbmRecommendationTone = 'market' | 'add' | 'nurture' | 'research' | 'deprioritize';

interface AbmRecommendation {
  tone: AbmRecommendationTone;
  label: string;
  fit: 'High fit' | 'Possible fit' | 'Unknown fit' | 'Low fit';
  reason: string;
  nextStep: string;
}

interface AbmAccountInsight extends CgtAbmWeeklyEngagement {
  relatedAsset?: AssetContext;
  relatedChanges: number;
  relatedScoreUpdates: number;
  engagementScore: number;
  recommendation: AbmRecommendation;
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

function segmentColor(seg: AbmAudienceSegment | string): string {
  switch (seg) {
    case 'ATC': return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'Early Stage': return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'Late Stage': return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'On Market': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

export function WeeklyBriefPage({ onOpenAsset }: Props) {
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<string | null>(null);
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [runs, setRuns] = useState<RunSummary | null>(null);
  const [abmRows, setAbmRows] = useState<CgtAbmWeeklyEngagement[]>([]);
  const [abmBrief, setAbmBrief] = useState<AbmBriefSummary | null>(null);
  const [assetContext, setAssetContext] = useState<AssetContext[]>([]);
  const [uploadingAbm, setUploadingAbm] = useState(false);
  const [abmUploadMessage, setAbmUploadMessage] = useState<string | null>(null);
  const [abmUploadError, setAbmUploadError] = useState<string | null>(null);
  const [uploadSegment, setUploadSegment] = useState<AbmAudienceSegment>('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: changeWeeks }, { data: scoreWeeks }] = await Promise.all([
        supabase
          .from('cgt_change_log')
          .select('update_week, created_at')
          .not('update_week', 'is', null)
          .order('created_at', { ascending: false })
          .limit(250),
        supabase
          .from('cgt_score_history')
          .select('week_label, recorded_at')
          .not('week_label', 'is', null)
          .order('recorded_at', { ascending: false })
          .limit(250),
      ]);

      const latestByWeek = new Map<string, number>();
      for (const row of (changeWeeks as any[]) || []) {
        if (!row.update_week) continue;
        latestByWeek.set(row.update_week, Math.max(latestByWeek.get(row.update_week) || 0, Date.parse(row.created_at || '') || 0));
      }
      for (const row of (scoreWeeks as any[]) || []) {
        if (!row.week_label) continue;
        latestByWeek.set(row.week_label, Math.max(latestByWeek.get(row.week_label) || 0, Date.parse(row.recorded_at || '') || 0));
      }
      const weeks = Array.from(latestByWeek.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([label]) => label);
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
    ['cgt_change_log', 'cgt_score_history', 'cgt_agent_runs', 'cgt_assets', 'cgt_abm_weekly_engagement'],
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

    const abmQ = supabase
      .from('cgt_abm_weekly_engagement')
      .select('*')
      .eq('week_label', w)
      .order('accounts_engaged', { ascending: false });

    const assetContextQ = supabase
      .from('cgt_assets')
      .select(`
        id, company_id, asset_name, modality, lead_indication, target_indication,
        phase_regulatory_status, likely_us_launch_within_24_months, commercial_buildout_status,
        final_commercial_score, strategic_opportunity_score,
        commercial_priority_tier, strategic_priority_tier, key_upcoming_catalyst, catalyst_date,
        cgt_companies!inner(company_name)
      `)
      .order('final_commercial_score', { ascending: false });

    const abmBriefQ = supabase
      .from('cgt_abm_engagement_brief')
      .select('content')
      .eq('is_published', true)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const [{ data: changeData }, { data: scoreData }, { data: abmData }, { data: assetData }, { data: briefData }] = await Promise.all([
      changesQ,
      scoresQ,
      abmQ,
      assetContextQ,
      abmBriefQ,
    ]);

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

    const mappedAssets: AssetContext[] = ((assetData as any[]) || []).map(r => ({
      id: r.id,
      company_id: r.company_id,
      company_name: r.cgt_companies?.company_name || '',
      asset_name: r.asset_name,
      modality: r.modality || '',
      lead_indication: r.lead_indication || '',
      target_indication: r.target_indication || '',
      phase_regulatory_status: r.phase_regulatory_status || '',
      likely_us_launch_within_24_months: r.likely_us_launch_within_24_months || '',
      commercial_buildout_status: r.commercial_buildout_status || '',
      final_commercial_score: r.final_commercial_score || 0,
      strategic_opportunity_score: r.strategic_opportunity_score || 0,
      commercial_priority_tier: r.commercial_priority_tier,
      strategic_priority_tier: r.strategic_priority_tier,
      key_upcoming_catalyst: r.key_upcoming_catalyst || '',
      catalyst_date: r.catalyst_date,
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
    setAbmRows(((abmData as CgtAbmWeeklyEngagement[] | null) || []));
    setAbmBrief((briefData as any)?.content ?? null);
    setAssetContext(mappedAssets);

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

    const latestDataAt = [
      ...mappedChanges.map(c => c.created_at),
      ...mappedScores.map(s => s.recorded_at),
    ].filter(Boolean).sort().slice(-1)[0] || null;
    markWeeklyBriefSeen(w, briefSignature(w, latestDataAt, mappedChanges.length, mappedScores.length));

    setLoading(false);
  }

  async function handleAbmUpload(file: File | null) {
    if (!file || !week) return;
    const weekDisplay = formatTrackerWeekLabel(week);
    setUploadingAbm(true);
    setAbmUploadError(null);
    setAbmUploadMessage(null);

    try {
      const imported = await uploadAbmEngagementCsv(file, week, uploadSegment || undefined);
      const accountCount = Math.max(0, imported - 1);
      const segLabel = uploadSegment || 'auto-detected';
      setAbmUploadMessage(`Imported ${accountCount} ABM accounts for ${weekDisplay} (${segLabel}).`);
      await loadWeek(week);
    } catch (err) {
      setAbmUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingAbm(false);
    }
  }

  async function handleToggleClient(account: { id: string; is_client: boolean }) {
    try {
      await toggleClientStatus(account.id, !account.is_client);
      if (week) await loadWeek(week);
    } catch {}
  }

  const topMovers = useMemo(() => {
    return [...scores]
      .filter(s => s.prev_final != null)
      .map(s => ({ ...s, delta: (s.final_commercial_score || 0) - (s.prev_final || 0) }))
      .filter(s => Math.abs(s.delta) > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8);
  }, [scores]);

  const flatScoresCount = useMemo(() => {
    return scores.filter(s => s.prev_final != null && (s.final_commercial_score || 0) - (s.prev_final || 0) === 0).length;
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

  const abmIntel = useMemo(() => {
    if (!abmBrief) return null;
    const takeaways = (abmBrief.key_takeaways ?? []).filter(t => !mentionsClosedWonAccount(t));
    const actions = (abmBrief.recommended_actions ?? [])
      .filter(a => !isClosedWonAccount(a.account))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3);
    const uniqueOnSite = new Set(
      (abmBrief.segments ?? []).flatMap(s => s.on_site_accounts ?? []).filter(a => !isClosedWonAccount(a))
    ).size;
    const headline = abmBrief.headline && !mentionsClosedWonAccount(abmBrief.headline) ? abmBrief.headline : null;
    return { takeaways, actions, uniqueOnSite, headline };
  }, [abmBrief]);

  const abmTotal = useMemo(() => {
    const total = abmRows.find(r => r.is_total);
    if (total) return total;
    const accountRows = abmRows.filter(r => !r.is_total);
    if (accountRows.length === 0) return null;
    return accountRows.reduce((acc, row) => ({
      ...acc,
      spend: acc.spend + (row.spend || 0),
      impressions: acc.impressions + (row.impressions || 0),
      clicks: acc.clicks + (row.clicks || 0),
      accounts_reached: acc.accounts_reached + (row.accounts_reached || 0),
      accounts_engaged: acc.accounts_engaged + (row.accounts_engaged || 0),
      campaigns: Math.max(acc.campaigns || 0, row.campaigns || 0),
      newly_qualified_accounts: acc.newly_qualified_accounts + (row.newly_qualified_accounts || 0),
      pipeline: acc.pipeline + (row.pipeline || 0),
      new_pipeline: acc.new_pipeline + (row.new_pipeline || 0),
      closed_won_pipeline: acc.closed_won_pipeline + (row.closed_won_pipeline || 0),
    }), {
      ...accountRows[0],
      account_name: 'Total/Average',
      is_total: true,
      spend: 0,
      impressions: 0,
      clicks: 0,
      accounts_reached: 0,
      accounts_engaged: 0,
      campaigns: 0,
      newly_qualified_accounts: 0,
      pipeline: 0,
      new_pipeline: 0,
      closed_won_pipeline: 0,
    });
  }, [abmRows]);

  const topAbmAccounts = useMemo<AbmAccountInsight[]>(() => {
    const changesByCompany = new Map<string, number>();
    const scoresByCompany = new Map<string, number>();

    for (const c of changes) {
      const key = normalizeAccountName(c.company_name || '');
      if (key) changesByCompany.set(key, (changesByCompany.get(key) || 0) + 1);
    }

    for (const s of scores) {
      const key = normalizeAccountName(s.company_name || '');
      if (key) scoresByCompany.set(key, (scoresByCompany.get(key) || 0) + 1);
    }

    return abmRows
      .filter(r => !r.is_total)
      .map(row => {
        const relatedAsset = findRelatedAsset(row, assetContext);
        const relatedKey = relatedAsset ? normalizeAccountName(relatedAsset.company_name) : row.normalized_account_name;
        const relatedChanges = changesByCompany.get(relatedKey) || 0;
        const relatedScoreUpdates = scoresByCompany.get(relatedKey) || 0;
        const recommendation = buildAbmRecommendation(row, relatedAsset, relatedChanges, relatedScoreUpdates);
        const engagementScore =
          (row.accounts_engaged || 0) * 1000 +
          (row.clicks || 0) * 120 +
          (row.pipeline || 0) / 100000 +
          relatedChanges * 750 +
          relatedScoreUpdates * 500 +
          (recommendation.tone === 'market' ? 600 : 0) +
          (recommendation.tone === 'add' ? 500 : 0) +
          (relatedAsset ? 250 : 0);
        return { ...row, relatedAsset, relatedChanges, relatedScoreUpdates, engagementScore, recommendation };
      })
      .filter(row => row.accounts_engaged > 0 || row.clicks > 0 || row.pipeline > 0 || row.relatedChanges > 0 || row.relatedScoreUpdates > 0)
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, 12);
  }, [abmRows, assetContext, changes, scores]);

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

  const generatedLabel = (() => {
    const ts = runs?.latestFinishedAt;
    if (ts) {
      return new Date(ts).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });
    }
    const latestDataAt = [
      ...changes.map(c => c.created_at),
      ...scores.map(s => s.recorded_at),
    ].filter(Boolean).sort().slice(-1)[0] || null;
    if (latestDataAt) {
      return new Date(latestDataAt).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });
    }
    return 'data not yet generated';
  })();
  const weekDisplay = formatTrackerWeekLabel(week);

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
            aria-label="Weekly brief reporting period"
          >
            {availableWeeks.map(w => (
              <option key={w} value={w}>{formatTrackerWeekLabel(w)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <select
            value={uploadSegment}
            onChange={e => setUploadSegment(e.target.value as AbmAudienceSegment)}
            className="text-xs font-medium bg-white border border-slate-200 rounded-lg px-2 py-2 text-slate-700 outline-none"
          >
            <option value="">Segment: auto-detect</option>
            {ABM_AUDIENCE_SEGMENTS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            uploadingAbm ? 'bg-slate-100 text-slate-400' : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-100'
          }`}>
            <UploadCloud className="w-4 h-4" />
            {uploadingAbm ? 'Uploading ABM…' : 'Upload Friday ABM CSV'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={uploadingAbm}
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                void handleAbmUpload(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Export to PDF
          </button>
        </div>
      </div>

      {(abmUploadMessage || abmUploadError) && (
        <div className={`no-print rounded-lg border px-4 py-3 text-sm ${
          abmUploadError ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-teal-50 border-teal-100 text-teal-800'
        }`}>
          {abmUploadError || abmUploadMessage}
        </div>
      )}

      {/* Hero */}
      <section className="reveal prestige-hero px-8 md:px-14 py-14 md:py-20">
        <div className="max-w-4xl mx-auto text-center">
          <span className="prestige-eyebrow">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 prestige-dot" />
            Weekly Brief · {weekDisplay}
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
            {(abmIntel?.uniqueOnSite ?? 0) > 0 && (
              <>
                <div className="prestige-divider-vert hidden md:block" />
                <HeroMetric value={abmIntel!.uniqueOnSite} label="On-site accounts" />
              </>
            )}
          </div>

          <div className="mt-8 text-xs text-white/50 tracking-wider uppercase">
            Latest data update: {generatedLabel} · Tracker code {week}
          </div>
        </div>
      </section>

      {/* ABM Intelligence · hot takeaways + top action */}
      {abmIntel && (abmIntel.takeaways.length > 0 || abmIntel.actions.length > 0) && (
        <section className="reveal reveal-delay-1">
          <header className="flex items-end justify-between gap-4 mb-6 flex-wrap">
            <div>
              <span className="prestige-eyebrow prestige-eyebrow-light">
                <Target className="w-3 h-3" />
                ABM Intelligence
              </span>
              <h2 className="prestige-section-title mt-3">Market engagement summary</h2>
            </div>
          </header>

          <div className="prestige-card overflow-hidden">
            <div className="divide-y divide-slate-100">
              {abmIntel.takeaways.map((t, i) => (
                <div key={i} className="px-6 py-4 flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-2 flex-shrink-0" />
                  <p className="text-sm text-slate-700 leading-relaxed">{t}</p>
                </div>
              ))}
              {abmIntel.actions.slice(0, 2).map((action, i) => (
                <div key={i} className="px-6 py-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-teal-700">{action.action}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-sm font-semibold text-slate-900">{action.account}</span>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">{action.next_step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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

      {/* ABM engagement brief — client-facing, authoritative segment numbers */}
      <AbmEngagementBrief />

      {/* Top movers */}
      {(topMovers.length > 0 || flatScoresCount > 0) && (
        <section className="reveal reveal-delay-4">
          <header className="mb-6">
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <TrendingUp className="w-3 h-3" />
              Movement
            </span>
            <h2 className="prestige-section-title mt-3">Top score movers</h2>
            {topMovers.length === 0 && flatScoresCount > 0 && (
              <p className="text-sm text-slate-500 mt-2">
                {flatScoresCount} {flatScoresCount === 1 ? 'asset was' : 'assets were'} re-evaluated this week but {flatScoresCount === 1 ? 'its' : 'their'} commercial score did not move.
              </p>
            )}
          </header>
          {topMovers.length === 0 ? null : (
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
          )}
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

function findRelatedAsset(row: CgtAbmWeeklyEngagement, assets: AssetContext[]): AssetContext | undefined {
  const account = row.normalized_account_name || normalizeAccountName(row.account_name);
  if (!account) return undefined;

  const exact = assets.filter(asset => normalizeAccountName(asset.company_name) === account);
  if (exact.length > 0) return strongestAsset(exact);

  const fuzzy = assets.filter(asset => {
    const company = normalizeAccountName(asset.company_name);
    return company.length >= 5 && account.length >= 5 && (company.includes(account) || account.includes(company));
  });
  return fuzzy.length > 0 ? strongestAsset(fuzzy) : undefined;
}

function strongestAsset(assets: AssetContext[]): AssetContext {
  return [...assets].sort((a, b) =>
    (b.final_commercial_score || 0) - (a.final_commercial_score || 0) ||
    (b.strategic_opportunity_score || 0) - (a.strategic_opportunity_score || 0)
  )[0];
}

function buildAbmRecommendation(
  row: CgtAbmWeeklyEngagement,
  asset: AssetContext | undefined,
  relatedChanges: number,
  relatedScoreUpdates: number
): AbmRecommendation {
  const hasEngagement = row.accounts_engaged > 0 || row.clicks > 0;
  const hasPipeline = row.pipeline > 0 || row.new_pipeline > 0 || row.closed_won_pipeline > 0;

  if (!asset) {
    if (hasEngagement || hasPipeline) {
      return {
        tone: 'add',
        label: 'Add / research',
        fit: 'Unknown fit',
        reason: `${row.account_name} is engaged in ABM but is not currently matched to a CGT tracker company. Treat this as a database gap until we verify whether they have a relevant cell or gene therapy asset.`,
        nextStep: 'Create a candidate tracker entry, verify CGT pipeline/therapy and U.S. commercialization path from primary sources, then decide whether to assign it to weekly monitoring.',
      };
    }

    return {
      tone: 'research',
      label: 'Research fit',
      fit: 'Unknown fit',
      reason: `${row.account_name} is present in the ABM report but has no tracker match and no clear engagement spike.`,
      nextStep: 'Do a lightweight fit check before adding. If no CGT asset or commercialization relevance is found, keep it out of the tracker.',
    };
  }

  const therapy = describeTherapy(asset);
  const timely = asset.commercial_priority_tier === 'Tier 1' || /yes/i.test(asset.likely_us_launch_within_24_months || '');
  const meaningfulMovement = relatedChanges > 0 || relatedScoreUpdates > 0;
  const strongScore = (asset.final_commercial_score || 0) >= 50 || asset.commercial_priority_tier === 'Tier 2';

  if (hasEngagement && (timely || meaningfulMovement)) {
    return {
      tone: 'market',
      label: 'Market now',
      fit: 'High fit',
      reason: `${row.account_name} is engaging and maps to ${therapy}. ${timely ? 'The asset is inside/near the 24-month commercialization window.' : 'This week’s tracker activity gives the outreach a timely hook.'}`,
      nextStep: 'Start/refresh ABM outreach this week. Anchor messaging to commercialization readiness, launch support, manufacturing access, and the latest tracker signal.',
    };
  }

  if (hasEngagement && strongScore) {
    return {
      tone: 'nurture',
      label: 'Nurture',
      fit: 'Possible fit',
      reason: `${row.account_name} is engaged and has a tracked CGT therapy (${therapy}), but there is no urgent weekly catalyst or Tier 1 commercialization trigger.`,
      nextStep: 'Keep in the ABM nurture lane. Use education-oriented content and watch for regulatory, manufacturing, or commercial hiring signals before escalating.',
    };
  }

  if (hasEngagement) {
    return {
      tone: 'research',
      label: 'Qualify',
      fit: 'Possible fit',
      reason: `${row.account_name} is engaged and matched to ${therapy}, but the current score/tier does not yet justify aggressive commercialization messaging.`,
      nextStep: 'Have research validate launch timing, manufacturing pathway, and U.S. commercial path before moving this account into active campaign focus.',
    };
  }

  return {
    tone: 'deprioritize',
    label: 'Do not prioritize',
    fit: 'Low fit',
    reason: `${row.account_name} has a tracker match (${therapy}) but no meaningful ABM engagement in this upload.`,
    nextStep: 'Do not spend active ABM effort this week. Keep monitoring in the CGT tracker and re-rank if engagement or material signals appear.',
  };
}

function describeTherapy(asset: AssetContext): string {
  const parts = [
    asset.asset_name,
    asset.modality,
    asset.lead_indication || asset.target_indication,
    asset.phase_regulatory_status,
  ].filter(Boolean);
  return parts.join(' / ');
}

function recommendationStyle(tone: AbmRecommendationTone): string {
  switch (tone) {
    case 'market':
      return 'bg-emerald-100 text-emerald-800';
    case 'add':
      return 'bg-violet-100 text-violet-800';
    case 'nurture':
      return 'bg-blue-100 text-blue-800';
    case 'research':
      return 'bg-amber-100 text-amber-800';
    case 'deprioritize':
      return 'bg-slate-100 text-slate-600';
  }
}

function formatCurrency(value: number | null | undefined): string {
  const safeValue = value || 0;
  if (Math.abs(safeValue) >= 1_000_000) {
    return `$${(safeValue / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  }
  return safeValue.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatNumber(value: number | null | undefined): string {
  return (value || 0).toLocaleString();
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function MiniMetric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`font-mono font-semibold mt-1 ${muted ? 'text-slate-400 italic text-xs' : 'text-slate-800'}`}>{value}</div>
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
