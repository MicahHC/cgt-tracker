import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadAbmEngagementCsv, normalizeAccountName, toggleClientStatus } from '../lib/abmEngagement';
import { AbmAudienceSegment, CgtAbmWeeklyEngagement, CgtChangeLog, CgtScoreHistory, Tier } from '../types/database';
import {
  Newspaper, ArrowUpRight, ArrowDownRight, Minus, ExternalLink,
  ClipboardList, Activity, TrendingUp, AlertCircle, CheckCircle2, CalendarDays,
  Printer, Sparkles, UploadCloud, Target, Users, DollarSign, ShieldOff,
  Layers, Flame, FileText, Megaphone, Building2, Search as SearchIcon, Link2,
} from 'lucide-react';
import { ConfidenceBadge } from './ui/Badge';
import { briefSignature, markWeeklyBriefSeen } from '../lib/weeklyBrief';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';
import { ABM_AUDIENCE_SEGMENTS } from '../lib/constants';
import { formatTrackerWeekLabel, getTrackerWeekRange } from '../lib/weekLabels';
import { useBriefData, type BriefContent, type Segment as BriefSegment, type AccountBehavior } from './AbmEngagementBrief';
import { isSuppressedAbmRow } from '../lib/abmSuppression';

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
  prev_commercial_tier?: Tier | null;
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
  commercial_priority_tier: Tier | null;
  key_upcoming_catalyst: string;
  catalyst_date: string | null;
}

type EngagementBriefRow = {
  period_label: string;
  view_window: string;
  generated_at: string;
  content: BriefContent;
};

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

function priorityLabel(tier: Tier | string | null | undefined): string {
  switch (tier) {
    case 'Tier 1': return 'Priority 1';
    case 'Tier 2': return 'Priority 2';
    case '': return 'No priority';
    case null:
    case undefined:
      return 'No priority';
    default: return String(tier);
  }
}

function formatChangeValue(field: string | null | undefined, value: string | null | undefined): string {
  if (/commercial_priority_tier/i.test(field || '')) return priorityLabel(value);
  return value || '—';
}

function priorityDisplayCopy(value: string | null | undefined): string {
  return (value || '')
    .replace(/\bCommercial tier\b/g, 'Audience priority')
    .replace(/\bcommercial tier\b/g, 'audience priority')
    .replace(/\btier rule\b/g, 'priority rule')
    .replace(/\bTier-1\b/g, 'Priority 1')
    .replace(/\bTier 1\b/g, 'Priority 1')
    .replace(/\bTier-2\b/g, 'Priority 2')
    .replace(/\bTier 2\b/g, 'Priority 2');
}

function isFreshEngagementBriefForWeek(brief: EngagementBriefRow | null | undefined, week: string | null | undefined): boolean {
  if (!brief || !week) return false;
  const range = getTrackerWeekRange(week);
  const generatedAt = Date.parse(brief.generated_at || '');
  if (!range || Number.isNaN(generatedAt)) return false;

  const start = new Date(range.start);
  start.setHours(0, 0, 0, 0);
  const end = new Date(range.end);
  end.setHours(23, 59, 59, 999);

  return generatedAt >= start.getTime() && generatedAt <= end.getTime();
}

function fallbackPriorityReason(tier: Tier | null | undefined): string {
  if (tier === 'Tier 1') {
    return 'Moved into Priority 1 because the asset is treated as having a U.S. path and a commercialization window inside 18 months.';
  }
  if (tier === 'Tier 2') {
    return 'Moved into Priority 2 because the asset remains relevant for CGT monitoring but is not proven to commercialize in the U.S. within 18 months.';
  }
  if (tier === 'Watchlist') {
    return 'Moved to Watchlist because it still needs confirmation on launch timing, U.S. path, or commercial readiness before it belongs in an active ABM audience.';
  }
  if (tier === 'Deprioritized') {
    return 'Moved to Deprioritized because the latest profile does not support active commercialization targeting.';
  }
  return 'Priority changed based on the latest score snapshot and tracker rules.';
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
  const [assetContext, setAssetContext] = useState<AssetContext[]>([]);
  const [uploadingAbm, setUploadingAbm] = useState(false);
  const [abmUploadMessage, setAbmUploadMessage] = useState<string | null>(null);
  const [abmUploadError, setAbmUploadError] = useState<string | null>(null);
  const [uploadSegment, setUploadSegment] = useState<AbmAudienceSegment>('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const briefData = useBriefData();

  useEffect(() => {
    (async () => {
      const [{ data: changeWeeks }, { data: scoreWeeks }, { data: abmWeeks }] = await Promise.all([
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
        supabase
          .from('cgt_abm_weekly_engagement')
          .select('week_label, created_at')
          .not('week_label', 'is', null)
          .order('created_at', { ascending: false })
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
      for (const row of (abmWeeks as any[]) || []) {
        if (!row.week_label) continue;
        latestByWeek.set(row.week_label, Math.max(latestByWeek.get(row.week_label) || 0, Date.parse(row.created_at || '') || 0));
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
        final_commercial_score,
        commercial_priority_tier, key_upcoming_catalyst, catalyst_date,
        cgt_companies!inner(company_name)
      `)
      .order('final_commercial_score', { ascending: false });

    const [{ data: changeData }, { data: scoreData }, { data: abmData }, { data: assetData }] = await Promise.all([
      changesQ,
      scoresQ,
      abmQ,
      assetContextQ,
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
      commercial_priority_tier: r.commercial_priority_tier,
      key_upcoming_catalyst: r.key_upcoming_catalyst || '',
      catalyst_date: r.catalyst_date,
    }));

    const assetIds = Array.from(new Set(mappedScores.map(s => s.asset_id)));
    if (assetIds.length > 0) {
      const { data: prior } = await supabase
        .from('cgt_score_history')
        .select('asset_id, week_label, final_commercial_score, commercial_priority_tier, recorded_at')
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
          s.prev_commercial_tier = p.commercial_priority_tier;
        }
      }
    }

    setChanges(mappedChanges);
    setScores(mappedScores);
    setAbmRows(((abmData as CgtAbmWeeklyEngagement[] | null) || []));
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

  const latestScores = useMemo(() => {
    const latestByAsset = new Map<string, ScoreRow>();
    for (const score of scores) {
      const existing = latestByAsset.get(score.asset_id);
      if (!existing || Date.parse(score.recorded_at || '') > Date.parse(existing.recorded_at || '')) {
        latestByAsset.set(score.asset_id, score);
      }
    }
    return Array.from(latestByAsset.values());
  }, [scores]);

  const topMovers = useMemo(() => {
    return [...latestScores]
      .filter(s => s.prev_final != null)
      .map(s => ({ ...s, delta: (s.final_commercial_score || 0) - (s.prev_final || 0) }))
      .filter(s => Math.abs(s.delta) > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8);
  }, [latestScores]);

  const flatScoresCount = useMemo(() => {
    return latestScores.filter(s => s.prev_final != null && (s.final_commercial_score || 0) - (s.prev_final || 0) === 0).length;
  }, [latestScores]);

  const tierChanges = useMemo(() => {
    return latestScores.filter(s =>
      (s.prev_commercial_tier && s.prev_commercial_tier !== s.commercial_priority_tier)
    );
  }, [latestScores]);

  const tierChangeDetails = useMemo(() => {
    return tierChanges.map(score => {
      const reason = changes.find(change =>
        change.asset_id === score.asset_id &&
        /commercial_priority_tier/i.test(change.field_changed || '') &&
        (!change.previous_value || change.previous_value === score.prev_commercial_tier) &&
        (!change.new_value || change.new_value === score.commercial_priority_tier)
      ) || changes.find(change =>
        change.asset_id === score.asset_id &&
        /commercial_priority_tier/i.test(change.field_changed || '')
      );
      return { score, reason };
    });
  }, [tierChanges, changes]);

  const criticalChanges = useMemo(() => {
    return changes.filter(c => /tier|phase|filing|pdufa|clinical hold|catalyst|regulatory/i.test(c.field_changed || ''));
  }, [changes]);

  const priorityChanges = criticalChanges.length > 0 ? criticalChanges : changes;
  const activeAbmRows = useMemo(() => abmRows.filter(row => !isSuppressedAbmRow(row)), [abmRows]);
  const suppressedAbmCount = abmRows.filter(row => !row.is_total && isSuppressedAbmRow(row)).length;

  const abmTotal = useMemo(() => {
    const accountRows = activeAbmRows.filter(r => !r.is_total);
    if (accountRows.length === 0) return null;
    const total = accountRows.reduce((acc, row) => ({
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
    return {
      ...total,
      ctr: total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0,
      account_ctr: total.accounts_reached > 0 ? (total.accounts_engaged / total.accounts_reached) * 100 : 0,
    };
  }, [activeAbmRows]);

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

    return activeAbmRows
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
  }, [activeAbmRows, assetContext, changes, scores]);

  const showAudienceEngagementBrief = useMemo(() => {
    if (!isFreshEngagementBriefForWeek(briefData.brief, week)) return false;
    const onSiteAccounts = briefData.brief?.content?.segments?.reduce((total, segment) => total + (segment.on_site || 0), 0) || 0;
    return onSiteAccounts > 0;
  }, [briefData.brief, week]);

  const audienceOnSiteCount = showAudienceEngagementBrief
    ? briefData.brief?.content?.segments?.reduce((total, segment) => total + (segment.on_site || 0), 0) || 0
    : 0;

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
            {showAudienceEngagementBrief || abmTotal
              ? 'Market movement, scoring updates, and ABM audience engagement in one view.'
              : 'Market movement and scoring updates in one view.'}
          </p>

          <div className="mt-10 flex items-center justify-center gap-6 md:gap-10 flex-wrap">
            {changes.length > 0 && (
              <>
                <HeroMetric value={changes.length} label="Changes logged" />
                <div className="prestige-divider-vert hidden md:block" />
              </>
            )}
            {scores.length > 0 && (
              <>
                <HeroMetric value={scores.length} label="Score updates" />
                <div className="prestige-divider-vert hidden md:block" />
              </>
            )}
            {(runs?.materialSignals ?? 0) > 0 && (
              <>
                <HeroMetric value={runs?.materialSignals ?? 0} label="Material signals" sub={runs ? `${runs.signalsFound} total` : undefined} />
                <div className="prestige-divider-vert hidden md:block" />
              </>
            )}
            {showAudienceEngagementBrief && (
              <HeroMetric value={audienceOnSiteCount} label="Accounts on site" sub={briefData.brief ? briefData.brief.view_window : undefined} />
            )}
          </div>

          <div className="mt-8 text-xs text-white/50 tracking-wider uppercase">
            Latest data update: {generatedLabel} · Tracker code {week}
          </div>
        </div>
      </section>

      {/* ABM Audience Engagement Intelligence */}
      {showAudienceEngagementBrief && briefData.brief && (
        <EngagementBriefSection brief={briefData.brief} spotlights={briefData.spotlights} />
      )}

      {/* Highlights · Top Priority Changes — only if there's data */}
      {changes.length > 0 && (
      <section className="reveal reveal-delay-1">
        <header className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <Sparkles className="w-3 h-3" />
              Highlights
            </span>
            <h2 className="prestige-section-title mt-3">Top priority changes</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-xl leading-relaxed">
              The changes most likely to move a thesis this week: audience-priority shifts, phase moves, filings, PDUFA dates, and regulatory signals.
            </p>
          </div>
          <div className="text-xs font-medium text-slate-500 tracking-wide uppercase">
            Showing {Math.min(priorityChanges.length, 20)} of {changes.length}
          </div>
        </header>

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
                        <span className="text-slate-400 line-through">{formatChangeValue(c.field_changed, c.previous_value)}</span>{' '}
                        <span className="text-slate-900 font-medium">→ {formatChangeValue(c.field_changed, c.new_value)}</span>
                      </div>
                      {c.why_it_matters && <div className="text-sm text-slate-600 mt-2 leading-relaxed">{priorityDisplayCopy(c.why_it_matters)}</div>}
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
      </section>
      )}

      {/* Metrics Grid — only show when there's market data */}
      {(changes.length > 0 || scores.length > 0 || (runs?.total ?? 0) > 0) && (
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
      )}

      {/* ABM account engagement — only show when CSV data exists */}
      {abmTotal && (
      <section className="reveal reveal-delay-3">
        <header className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <Target className="w-3 h-3" />
              Account-Level Upload
            </span>
            <h2 className="prestige-section-title mt-3">Top engaged accounts from CSV</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">
              Friday account-level upload, translated into actions. Closed Won/client accounts are suppressed from this reporting view.
            </p>
            {suppressedAbmCount > 0 && (
              <p className="text-xs text-amber-700 mt-2">
                {suppressedAbmCount} Closed Won/client {suppressedAbmCount === 1 ? 'account is' : 'accounts are'} suppressed from the totals and ranking below.
              </p>
            )}
          </div>
          <div className="text-xs text-slate-500 text-right">
            <div className="font-semibold uppercase tracking-wider">Reporting period</div>
            <div>{abmTotal.reporting_period || '—'}</div>
          </div>
        </header>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Stat label="Accounts engaged" value={abmTotal.accounts_engaged || 0} icon={Users} color="teal" sub={`${abmTotal.accounts_reached || 0} reached`} />
              <Stat label="ABM clicks" value={abmTotal.clicks || 0} icon={Activity} color="blue" sub={`${formatPercent(abmTotal.ctr)} CTR`} />
              <Stat label="Campaigns" value={abmTotal.campaigns || 0} icon={ClipboardList} color="amber" sub={`${activeAbmRows.filter(r => !r.is_total).length} active accounts`} />
              <Stat label="Pipeline" value={Math.round((abmTotal.pipeline || 0) / 1000000)} icon={DollarSign} color="slate" sub={`${formatCurrency(abmTotal.pipeline)} total`} />
            </div>

            <div className="prestige-card overflow-hidden">
              <div className="divide-y divide-slate-100">
                {topAbmAccounts.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-slate-400">No engaged ABM accounts in this upload.</div>
                ) : topAbmAccounts.map(account => (
                  <div key={account.id} className={`px-6 py-4 hover:bg-slate-50/60 transition-colors ${account.is_client ? 'bg-amber-50/30' : ''}`}>
                    <div className="flex items-start justify-between gap-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {account.relatedAsset ? (
                            <button
                              onClick={() => onOpenAsset(account.relatedAsset!.id)}
                              className="text-[15px] font-semibold text-slate-900 hover:text-teal-700 transition-colors text-left"
                            >
                              {account.account_name}
                            </button>
                          ) : (
                            <div className="text-[15px] font-semibold text-slate-900">{account.account_name}</div>
                          )}
                          {account.audience_segment && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase border ${segmentColor(account.audience_segment)}`}>
                              {account.audience_segment}
                            </span>
                          )}
                          {account.is_client && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-amber-100 text-amber-800 border border-amber-200">
                              <ShieldOff className="w-3 h-3" />
                              Client · Suppressed
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase ${recommendationStyle(account.recommendation.tone)}`}>
                            {account.recommendation.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
                            {account.recommendation.fit}
                          </span>
                          <button
                            onClick={() => handleToggleClient(account)}
                            className="no-print text-[10px] text-slate-400 hover:text-amber-700 transition-colors underline"
                            title={account.is_client ? 'Remove client suppression' : 'Mark as client (suppress spend)'}
                          >
                            {account.is_client ? 'unsuppress' : 'mark client'}
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          {account.relatedAsset ? (
                            <>
                              <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">Matched: {account.relatedAsset.company_name}</span>
                              <span className={`px-2 py-0.5 rounded-full font-medium ${tierColor(account.relatedAsset.commercial_priority_tier)}`}>
                                {priorityLabel(account.relatedAsset.commercial_priority_tier)}
                              </span>
                              <span className="text-slate-500">
                                {account.relatedAsset.asset_name}
                                {account.relatedAsset.modality ? ` · ${account.relatedAsset.modality}` : ''}
                                {account.relatedAsset.lead_indication ? ` · ${account.relatedAsset.lead_indication}` : ''}
                                {` · score ${account.relatedAsset.final_commercial_score}`}
                              </span>
                            </>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">No tracker match</span>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Why</div>
                            <div className="text-sm text-slate-700 mt-1 leading-relaxed">{account.recommendation.reason}</div>
                          </div>
                          <div className="rounded-lg bg-teal-50/60 border border-teal-100 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-widest text-teal-700">Recommended next step</div>
                            <div className="text-sm text-teal-900 mt-1 leading-relaxed">{account.recommendation.nextStep}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span>{account.relatedChanges} weekly changes</span>
                          <span>{account.relatedScoreUpdates} score updates</span>
                          {account.pipeline > 0 && <span>{formatCurrency(account.pipeline)} pipeline</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-right text-sm flex-shrink-0">
                        <MiniMetric label="Engaged" value={formatNumber(account.accounts_engaged)} />
                        <MiniMetric label="Clicks" value={formatNumber(account.clicks)} />
                        {account.is_client ? (
                          <MiniMetric label="Spend" value="Suppressed" muted />
                        ) : (
                          <MiniMetric label="Spend" value={formatCurrency(account.spend)} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
      </section>
      )}

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
      {tierChangeDetails.length > 0 && (
        <section className="reveal reveal-delay-4">
          <header className="mb-6">
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <AlertCircle className="w-3 h-3" />
              Audience Priority
            </span>
            <h2 className="prestige-section-title mt-3">Priority movement</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">
              Priority 1 means a U.S. commercialization window inside 18 months. Priority 2 means relevant CGT opportunity,
              but not yet proven inside that active commercialization window.
            </p>
          </header>
          <div className="prestige-card overflow-hidden">
            <div className="divide-y divide-slate-100">
              {tierChangeDetails.map(({ score: s, reason }) => (
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
                        <span className="text-slate-500">Audience priority:</span>
                        <span className={`px-2 py-0.5 rounded font-medium ${tierColor(s.prev_commercial_tier)}`}>{priorityLabel(s.prev_commercial_tier)}</span>
                        <ArrowUpRight className="w-3 h-3 text-slate-400" />
                        <span className={`px-2 py-0.5 rounded font-medium ${tierColor(s.commercial_priority_tier)}`}>{priorityLabel(s.commercial_priority_tier)}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Why it moved</div>
                      <div className="text-sm text-slate-700 mt-1 leading-relaxed">
                        {priorityDisplayCopy(reason?.why_it_matters) || fallbackPriorityReason(s.commercial_priority_tier)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-teal-50/60 border border-teal-100 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-teal-700">Score impact</div>
                      <div className="text-sm text-teal-900 mt-1 leading-relaxed">
                        {reason?.score_impact_explanation || `Commercial score ${s.prev_final ?? '—'} to ${s.final_commercial_score}.`}
                        {reason?.source_url && (
                          <a href={reason.source_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-teal-700 font-semibold hover:underline">
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
    (b.final_commercial_score || 0) - (a.final_commercial_score || 0)
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
      reason: `${row.account_name} is engaging and maps to ${therapy}. ${timely ? 'The asset is inside the 18-month Priority 1 commercialization window.' : 'This week’s tracker activity gives the outreach a timely hook.'}`,
      nextStep: 'Start/refresh ABM outreach this week. Anchor messaging to commercialization readiness, launch support, manufacturing access, and the latest tracker signal.',
    };
  }

  if (hasEngagement && strongScore) {
    return {
      tone: 'nurture',
      label: 'Nurture',
      fit: 'Possible fit',
      reason: `${row.account_name} is engaged and has a tracked CGT therapy (${therapy}), but there is no urgent weekly catalyst or Priority 1 commercialization trigger.`,
      nextStep: 'Keep in the ABM nurture lane. Use education-oriented content and watch for regulatory, manufacturing, or commercial hiring signals before escalating.',
    };
  }

  if (hasEngagement) {
    return {
      tone: 'research',
      label: 'Qualify',
      fit: 'Possible fit',
      reason: `${row.account_name} is engaged and matched to ${therapy}, but the current score/priority does not yet justify aggressive commercialization messaging.`,
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

const BRIEF_ACCENT: Record<string, { bar: string; chip: string; ring: string }> = {
  'On-Market': { bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: 'text-emerald-600' },
  'Late-Stage': { bar: 'bg-teal-500', chip: 'bg-teal-50 text-teal-700 border-teal-200', ring: 'text-teal-600' },
  'Early Stage': { bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 border-sky-200', ring: 'text-sky-600' },
  default: { bar: 'bg-slate-500', chip: 'bg-slate-50 text-slate-700 border-slate-200', ring: 'text-slate-600' },
};

function briefAccent(name: string) {
  return BRIEF_ACCENT[name] || BRIEF_ACCENT.default;
}

function EngagementBriefSection({ brief, spotlights }: { brief: { period_label: string; view_window: string; generated_at: string; content: BriefContent }; spotlights: AccountBehavior[] }) {
  const c = brief.content;
  if (!c.segments?.length) return null;

  const generated = new Date(brief.generated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <section className="reveal reveal-delay-3 space-y-6">
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <Target className="w-3 h-3" />
              Audience Engagement
            </span>
            <h2 className="prestige-section-title mt-3">Who is engaging, and with what</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">
              On-Market and Late-Stage biopharma engagement across the site, campaigns, keyword research, and Bombora surge.
            </p>
          </div>
          <div className="text-xs text-slate-500 text-right">
            <div className="font-semibold uppercase tracking-wider">{brief.view_window}</div>
            <div>{generated}</div>
          </div>
        </header>

        {c.headline && (
          <div className="prestige-card p-5">
            <p className="text-sm text-slate-700 leading-relaxed">{c.headline}</p>
          </div>
        )}

        {c.overlap_note && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex items-start gap-2.5">
              <Link2 className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-amber-800">Segment overlap</div>
                <p className="text-sm text-amber-900 mt-1 leading-relaxed">{c.overlap_note}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {c.segments.map(seg => (
            <BriefSegmentCard key={seg.name} seg={seg} />
          ))}
        </div>
      </section>

      {spotlights.length > 0 && (
        <section className="reveal reveal-delay-4">
          <header className="mb-6">
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <Users className="w-3 h-3" />
              Account Spotlights
            </span>
            <h2 className="prestige-section-title mt-3">Notable account behavior</h2>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {spotlights.slice(0, 6).map((b, i) => (
              <div key={`${b.account}-${i}`} className="prestige-card p-4">
                <div className="text-sm font-bold text-slate-900">{b.account}</div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{b.summary}</p>
                <p className="text-xs font-semibold text-teal-700 mt-2">{b.signal}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {c.recommended_actions && c.recommended_actions.length > 0 && (
        <section className="reveal reveal-delay-4">
          <header className="mb-6">
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <Target className="w-3 h-3" />
              Engagement-Based Actions
            </span>
            <h2 className="prestige-section-title mt-3">Recommended next steps</h2>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...c.recommended_actions].sort((a, b) => a.priority - b.priority).map(action => (
              <div key={`${action.priority}-${action.account}`} className="prestige-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{action.account}</div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-teal-700 mt-1">{action.action}</div>
                  </div>
                  <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-500">#{action.priority}</span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed mt-3">{action.why}</p>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Next step</div>
                  <p className="text-sm text-slate-800 leading-relaxed mt-1">{action.next_step}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {c.key_takeaways && c.key_takeaways.length > 0 && (
        <section className="reveal reveal-delay-4">
          <header className="mb-4">
            <span className="prestige-eyebrow prestige-eyebrow-light">
              <Sparkles className="w-3 h-3" />
              Takeaways
            </span>
            <h2 className="prestige-section-title mt-3">What it means</h2>
          </header>
          <div className="prestige-card p-5">
            <ul className="space-y-2.5">
              {c.key_takeaways.map((t, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {c.accuracy_flags && c.accuracy_flags.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600">Accuracy flags</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {c.accuracy_flags.map((f, i) => (
              <div key={i} className="rounded-lg bg-white border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-800">{f.label}</div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{f.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function BriefSegmentCard({ seg }: { seg: BriefSegment }) {
  const a = briefAccent(seg.name);
  return (
    <div className="prestige-card overflow-hidden flex flex-col">
      <div className={`h-1 w-full ${a.bar}`} />
      <div className="p-5 space-y-4 flex-1">
        <div className="flex items-center gap-2">
          <Layers className={`w-4 h-4 ${a.ring}`} />
          <h3 className="text-base font-bold text-slate-900">{seg.name}</h3>
          {seg.channel_mix && <span className="text-xs text-slate-400 ml-auto">{seg.channel_mix}</span>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-center">
            <div className="text-xl font-bold text-slate-900">{seg.segment_size}</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">In segment</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-center">
            <div className={`text-xl font-bold ${a.ring}`}>{seg.on_site}</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">On site</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-center">
            <div className="text-xl font-bold text-slate-900">{seg.on_site_pct}%</div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Rate</div>
          </div>
        </div>

        {seg.on_site_accounts?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">On the site</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seg.on_site_accounts.map(name => (
                <span key={name} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${a.chip}`}>{name}</span>
              ))}
            </div>
            {seg.shared_note && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{seg.shared_note}</p>}
          </div>
        )}

        {seg.top_pages && seg.top_pages.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Top pages</span>
            </div>
            <div className="space-y-1">
              {seg.top_pages.slice(0, 4).map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-xs py-1 border-b border-slate-50 last:border-0">
                  <span className="text-slate-700 truncate">{p.page}</span>
                  <span className="text-slate-500 flex-shrink-0 font-mono">
                    {p.accounts} acct · {p.events} ev
                  </span>
                </div>
              ))}
            </div>
            {seg.page_note && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{seg.page_note}</p>}
          </div>
        )}

        {seg.campaigns && seg.campaigns.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Megaphone className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Campaign reach</span>
            </div>
            <div className="space-y-2">
              {seg.campaigns.slice(0, 3).map((cp, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-600 truncate">{cp.name}</span>
                    <span className="font-semibold text-slate-800 flex-shrink-0">{cp.reach_pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full ${a.bar}`} style={{ width: `${Math.min(100, cp.reach_pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {seg.keywords && seg.keywords.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <SearchIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">What they search</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seg.keywords.map((k, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
                  {k.term} <span className="text-slate-400">{k.score}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {seg.bombora && seg.bombora.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Flame className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Intent surge</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seg.bombora.map((t, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-700 border border-orange-100">
                  {t.topic} <span className="text-orange-400">{t.score}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
