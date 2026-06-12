import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CgtAsset, CgtAssetSource } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import {
  calculateCommercialReadiness,
  calculateStrategicOpportunity,
  assignCommercialTier,
  assignStrategicTier,
  REGULATORY_RUBRIC,
  COMMERCIAL_INFRA_RUBRIC,
  MARKET_ATTRACTIVENESS_RUBRIC,
  CAPABILITY_GAP_RUBRIC,
  tierColor,
} from '../lib/scoring';
import {
  X, Save, Loader2, ShieldAlert, AlertTriangle, CheckCircle2, Info,
  Plus, Trash2, ClipboardList, Factory, TrendingUp, Target, Flag,
  Link2, BookOpen, ChevronRight,
} from 'lucide-react';

interface Props {
  asset: CgtAsset;
  existingSources: CgtAssetSource[];
  onClose: () => void;
  onSaved: () => void;
}

type FlagValue = 'unset' | 'yes' | 'no';
type SourceTier = 'Primary' | 'Secondary' | 'Tertiary';

interface SourceDraft {
  id?: string;
  url: string;
  tier: SourceTier;
  title: string;
}

const SECTIONS = [
  { id: 'regulatory', label: 'Regulatory', icon: ClipboardList },
  { id: 'commercial', label: 'Commercial Infra', icon: Factory },
  { id: 'market', label: 'Market', icon: TrendingUp },
  { id: 'strategic', label: 'Strategic', icon: Target },
  { id: 'flags', label: 'Flags', icon: Flag },
  { id: 'sources', label: 'Sources', icon: Link2 },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

export function ScoreAssetModal({ asset, existingSources, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionId>('regulatory');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmNoPrimary, setShowConfirmNoPrimary] = useState(false);

  const initialSources: SourceDraft[] = existingSources.slice(0, 3).map(s => ({
    id: s.id,
    url: s.source_url || '',
    tier: (s.source_type as SourceTier) || (s.is_primary_source ? 'Primary' : 'Secondary'),
    title: s.source_title || '',
  }));

  const [form, setForm] = useState({
    regulatory_score: asset.regulatory_score ?? 0,
    commercial_infrastructure_score: asset.commercial_infrastructure_score ?? 0,
    market_attractiveness_score: asset.market_attractiveness_score ?? 0,
    capability_gap_leverage_score: asset.capability_gap_leverage_score ?? 0,
    phase_regulatory_status: asset.phase_regulatory_status || '',
    filing_status: asset.filing_status || '',
    fda_designations: asset.fda_designations || '',
    pdufa_date: asset.pdufa_date || '',
    manufacturing_status: asset.manufacturing_status || 'Early',
    manufacturing_pathway: asset.manufacturing_pathway || 'Unclear',
    commercial_buildout_status: asset.commercial_buildout_status || 'Minimal',
    treatment_network_status: asset.treatment_network_status || '',
    key_executive_hires_changes: asset.key_executive_hires_changes || '',
    market_access_complexity_notes: asset.market_access_complexity_notes || '',
    regulatory_clinical_risk_notes: asset.regulatory_clinical_risk_notes || '',
    clinical_hold_flag: (asset.clinical_hold ? 'yes' : 'no') as FlagValue,
    no_manufacturing_flag: (asset.no_manufacturing_pathway ? 'yes' : 'no') as FlagValue,
    timeline_flag: (asset.timeline_over_24_months ? 'yes' : 'no') as FlagValue,
    no_us_path_flag: (asset.no_us_path ? 'yes' : 'no') as FlagValue,
    flags_touched: false,
    rationale: '',
  });

  const [sources, setSources] = useState<SourceDraft[]>(
    initialSources.length > 0 ? initialSources : [{ url: '', tier: 'Primary', title: '' }]
  );

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  const flagsSet = form.clinical_hold_flag !== 'unset'
    && form.no_manufacturing_flag !== 'unset'
    && form.timeline_flag !== 'unset'
    && form.no_us_path_flag !== 'unset';

  const flagsForScoring = {
    clinical_hold: form.clinical_hold_flag === 'yes',
    no_manufacturing_pathway: form.no_manufacturing_flag === 'yes',
    timeline_over_24_months: form.timeline_flag === 'yes',
    no_us_path: form.no_us_path_flag === 'yes',
  };

  const commercial = useMemo(() => calculateCommercialReadiness({
    regulatory_score: form.regulatory_score,
    commercial_infrastructure_score: form.commercial_infrastructure_score,
    market_attractiveness_score: form.market_attractiveness_score,
    ...flagsForScoring,
  }), [form.regulatory_score, form.commercial_infrastructure_score, form.market_attractiveness_score,
       form.clinical_hold_flag, form.no_manufacturing_flag, form.timeline_flag, form.no_us_path_flag]);

  const strategic = useMemo(() => calculateStrategicOpportunity({
    regulatory_score: form.regulatory_score,
    market_attractiveness_score: form.market_attractiveness_score,
    capability_gap_leverage_score: form.capability_gap_leverage_score,
  }), [form.regulatory_score, form.market_attractiveness_score, form.capability_gap_leverage_score]);

  const commercialTier = assignCommercialTier(commercial.final, asset.segment);
  const strategicTier = assignStrategicTier(strategic);

  const previousFinal = asset.final_commercial_score ?? 0;
  const previousStrategic = asset.strategic_opportunity_score ?? 0;
  const delta = Math.abs(commercial.final - previousFinal);
  const strategicDelta = Math.abs(strategic - previousStrategic);
  const regulatoryStatusChanged = form.phase_regulatory_status !== (asset.phase_regulatory_status || '');
  const anyFlagChanged =
    flagsForScoring.clinical_hold !== asset.clinical_hold ||
    flagsForScoring.no_manufacturing_pathway !== asset.no_manufacturing_pathway ||
    flagsForScoring.timeline_over_24_months !== asset.timeline_over_24_months ||
    flagsForScoring.no_us_path !== asset.no_us_path;
  const rationaleRequired = delta >= 5 || strategicDelta >= 5 || anyFlagChanged || regulatoryStatusChanged;

  const validSources = sources.filter(s => s.url.trim().length > 0);
  const hasPrimary = validSources.some(s => s.tier === 'Primary');
  const onlyTertiary = validSources.length > 0 && validSources.every(s => s.tier === 'Tertiary');

  const missing: string[] = [];
  if (!flagsSet) missing.push('All 4 flags must be explicitly set');
  if (validSources.length === 0) missing.push('At least 1 source is required');
  if (validSources.length > 3) missing.push('Maximum 3 sources allowed');
  if (rationaleRequired && !form.rationale.trim()) missing.push('Change rationale required');

  async function handleSave() {
    setError(null);
    if (missing.length > 0) {
      setError(missing.join(' · '));
      return;
    }
    if (!hasPrimary && !showConfirmNoPrimary) {
      setShowConfirmNoPrimary(true);
      return;
    }

    setSaving(true);
    try {
      const week = weekLabel(new Date());
      const nowIso = new Date().toISOString();

      const scoredPayload = {
        regulatory_score: form.regulatory_score,
        commercial_infrastructure_score: form.commercial_infrastructure_score,
        market_attractiveness_score: form.market_attractiveness_score,
        capability_gap_leverage_score: form.capability_gap_leverage_score,
        phase_regulatory_status: form.phase_regulatory_status,
        filing_status: form.filing_status,
        fda_designations: form.fda_designations,
        pdufa_date: form.pdufa_date || null,
        manufacturing_status: form.manufacturing_status,
        manufacturing_pathway: form.manufacturing_pathway,
        commercial_buildout_status: form.commercial_buildout_status,
        treatment_network_status: form.treatment_network_status,
        key_executive_hires_changes: form.key_executive_hires_changes,
        market_access_complexity_notes: form.market_access_complexity_notes,
        regulatory_clinical_risk_notes: form.regulatory_clinical_risk_notes,
        clinical_hold: flagsForScoring.clinical_hold,
        no_manufacturing_pathway: flagsForScoring.no_manufacturing_pathway,
        timeline_over_24_months: flagsForScoring.timeline_over_24_months,
        no_us_path: flagsForScoring.no_us_path,
        raw_commercial_score: commercial.raw,
        final_commercial_score: commercial.final,
        strategic_opportunity_score: strategic,
        commercial_priority_tier: commercialTier,
        strategic_priority_tier: strategicTier,
        last_reviewed_at: nowIso,
        last_reviewed_by: user?.id || null,
        updated_at: nowIso,
      };

      const { error: upErr } = await supabase.from('cgt_assets').update(scoredPayload).eq('id', asset.id);
      if (upErr) throw upErr;

      const primarySourceUrl = validSources.find(s => s.tier === 'Primary')?.url || validSources[0]?.url || '';

      const changedFields: Array<{ field: keyof CgtAsset | string; oldVal: any; newVal: any }> = [];
      const trackedComparisons: Array<[string, any, any]> = [
        ['regulatory_score', asset.regulatory_score, form.regulatory_score],
        ['commercial_infrastructure_score', asset.commercial_infrastructure_score, form.commercial_infrastructure_score],
        ['market_attractiveness_score', asset.market_attractiveness_score, form.market_attractiveness_score],
        ['capability_gap_leverage_score', asset.capability_gap_leverage_score, form.capability_gap_leverage_score],
        ['phase_regulatory_status', asset.phase_regulatory_status || '', form.phase_regulatory_status],
        ['filing_status', asset.filing_status || '', form.filing_status],
        ['fda_designations', asset.fda_designations || '', form.fda_designations],
        ['pdufa_date', asset.pdufa_date || '', form.pdufa_date || ''],
        ['manufacturing_status', asset.manufacturing_status, form.manufacturing_status],
        ['manufacturing_pathway', asset.manufacturing_pathway, form.manufacturing_pathway],
        ['commercial_buildout_status', asset.commercial_buildout_status, form.commercial_buildout_status],
        ['clinical_hold', asset.clinical_hold, flagsForScoring.clinical_hold],
        ['no_manufacturing_pathway', asset.no_manufacturing_pathway, flagsForScoring.no_manufacturing_pathway],
        ['timeline_over_24_months', asset.timeline_over_24_months, flagsForScoring.timeline_over_24_months],
        ['no_us_path', asset.no_us_path, flagsForScoring.no_us_path],
        ['final_commercial_score', previousFinal, commercial.final],
        ['strategic_opportunity_score', previousStrategic, strategic],
        ['commercial_priority_tier', asset.commercial_priority_tier || '', commercialTier || ''],
        ['strategic_priority_tier', asset.strategic_priority_tier || '', strategicTier || ''],
      ];
      for (const [f, o, n] of trackedComparisons) {
        if (String(o ?? '') !== String(n ?? '')) changedFields.push({ field: f, oldVal: o, newVal: n });
      }

      if (changedFields.length > 0) {
        const logs = changedFields.map(c => ({
          asset_id: asset.id,
          run_date: nowIso.slice(0, 10),
          update_week: week,
          agent_id: user?.id || null,
          change_type: 'score',
          field_changed: String(c.field),
          previous_value: String(c.oldVal ?? ''),
          new_value: String(c.newVal ?? ''),
          why_it_matters: form.rationale || '',
          score_impact_explanation: c.field === 'final_commercial_score' || c.field === 'strategic_opportunity_score'
            ? `Δ ${Number(c.newVal) - Number(c.oldVal)} (${commercial.caps.join('; ') || 'no caps applied'})`
            : '',
          source_url: primarySourceUrl,
          confidence_level: 'Medium',
        }));
        const { error: logErr } = await supabase.from('cgt_change_log').insert(logs);
        if (logErr) throw logErr;
      }

      const { error: histErr } = await supabase.from('cgt_score_history').insert({
        asset_id: asset.id,
        week_label: week,
        regulatory_score: form.regulatory_score,
        commercial_infrastructure_score: form.commercial_infrastructure_score,
        market_attractiveness_score: form.market_attractiveness_score,
        capability_gap_leverage_score: form.capability_gap_leverage_score,
        raw_commercial_score: commercial.raw,
        final_commercial_score: commercial.final,
        strategic_opportunity_score: strategic,
        commercial_priority_tier: commercialTier,
        strategic_priority_tier: strategicTier,
        recorded_by: user?.id || null,
      });
      if (histErr) throw histErr;

      const existingIds = existingSources.map(s => s.id);
      const keptIds = validSources.filter(s => s.id).map(s => s.id as string);
      const toDelete = existingIds.filter(id => !keptIds.includes(id));
      if (toDelete.length > 0) {
        await supabase.from('cgt_asset_sources').delete().in('id', toDelete);
      }
      for (const s of validSources) {
        const domain = extractDomain(s.url);
        if (s.id) {
          await supabase.from('cgt_asset_sources').update({
            source_url: s.url,
            source_type: s.tier,
            source_title: s.title || domain,
            source_domain: domain,
            is_primary_source: s.tier === 'Primary',
          }).eq('id', s.id);
        } else {
          await supabase.from('cgt_asset_sources').insert({
            asset_id: asset.id,
            source_url: s.url,
            source_type: s.tier,
            source_title: s.title || domain,
            source_domain: domain,
            is_primary_source: s.tier === 'Primary',
            source_date: nowIso.slice(0, 10),
            signal_type: 'score_update',
            notes: '',
          });
        }
      }

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-6 overflow-y-auto">
      <div className="bg-slate-50 w-full max-w-7xl rounded-none sm:rounded-2xl shadow-2xl flex flex-col my-0 sm:my-auto max-h-screen sm:max-h-[95vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white rounded-t-none sm:rounded-t-2xl">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-teal-600">Score asset</div>
            <div className="text-lg font-semibold text-slate-900 truncate">{asset.asset_name}</div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[220px_1fr_340px] overflow-hidden">
          <nav className="hidden lg:flex flex-col gap-1 p-4 border-r border-slate-200 bg-white">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              const done = sectionComplete(s.id, { flagsSet, validSourcesCount: validSources.length });
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active ? 'bg-teal-50 text-teal-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{s.label}</span>
                  {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  {active && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              );
            })}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <WhereToCheck />
            </div>
          </nav>

          <div className="overflow-y-auto p-6 space-y-6">
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 -mx-6 px-6 border-b border-slate-200">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-full border ${
                    activeSection === s.id ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >{s.label}</button>
              ))}
            </div>

            {activeSection === 'regulatory' && (
              <SectionCard title="Regulatory" subtitle="Weight: 40% of commercial score · 40% of strategic score">
                <ScorePicker
                  label="Regulatory Score"
                  value={form.regulatory_score}
                  onChange={v => setField('regulatory_score', v)}
                  rubric={REGULATORY_RUBRIC}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                  <TextField label="Phase / Regulatory Status" value={form.phase_regulatory_status} onChange={v => setField('phase_regulatory_status', v)} placeholder="e.g. Phase 3 / BLA accepted" />
                  <TextField label="Filing Status" value={form.filing_status} onChange={v => setField('filing_status', v)} placeholder="e.g. Rolling submission" />
                  <TextField label="FDA Designations" value={form.fda_designations} onChange={v => setField('fda_designations', v)} placeholder="e.g. Breakthrough, RMAT" />
                  <TextField label="PDUFA Date" type="date" value={form.pdufa_date} onChange={v => setField('pdufa_date', v)} />
                </div>
                <TextAreaField label="Regulatory / clinical risk notes" value={form.regulatory_clinical_risk_notes} onChange={v => setField('regulatory_clinical_risk_notes', v)} />
              </SectionCard>
            )}

            {activeSection === 'commercial' && (
              <SectionCard title="Commercial Infrastructure" subtitle="Weight: 35% of commercial score">
                <ScorePicker
                  label="Commercial Infrastructure Score"
                  value={form.commercial_infrastructure_score}
                  onChange={v => setField('commercial_infrastructure_score', v)}
                  rubric={COMMERCIAL_INFRA_RUBRIC}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                  <SelectField label="Manufacturing Status" value={form.manufacturing_status} onChange={v => setField('manufacturing_status', v as any)}
                    options={['Established', 'Scaling', 'Early', 'Constrained', 'Critical Gap']} />
                  <SelectField label="Manufacturing Pathway" value={form.manufacturing_pathway} onChange={v => setField('manufacturing_pathway', v as any)}
                    options={['Yes', 'No', 'Unclear']} />
                  <SelectField label="Commercial Buildout Status" value={form.commercial_buildout_status} onChange={v => setField('commercial_buildout_status', v as any)}
                    options={['Established', 'Scaling', 'Early', 'Minimal', 'None']} />
                  <TextField label="Treatment Network" value={form.treatment_network_status} onChange={v => setField('treatment_network_status', v)} placeholder="e.g. 35 ATCs activated" />
                </div>
                <TextAreaField label="Key executive hires / changes" value={form.key_executive_hires_changes} onChange={v => setField('key_executive_hires_changes', v)} />
              </SectionCard>
            )}

            {activeSection === 'market' && (
              <SectionCard title="Market Attractiveness" subtitle="Weight: 25% of commercial score · 30% of strategic score">
                <ScorePicker
                  label="Market Score"
                  value={form.market_attractiveness_score}
                  onChange={v => setField('market_attractiveness_score', v)}
                  rubric={MARKET_ATTRACTIVENESS_RUBRIC}
                />
                <TextAreaField label="Market access / complexity notes" value={form.market_access_complexity_notes} onChange={v => setField('market_access_complexity_notes', v)} />
              </SectionCard>
            )}

            {activeSection === 'strategic' && (
              <SectionCard title="Strategic / Capability Gap" subtitle="Weight: 30% of strategic score">
                <ScorePicker
                  label="Capability Gap Score"
                  value={form.capability_gap_leverage_score}
                  onChange={v => setField('capability_gap_leverage_score', v)}
                  rubric={CAPABILITY_GAP_RUBRIC}
                />
                <TextAreaField label="Gap rationale" value={form.market_access_complexity_notes} onChange={v => setField('market_access_complexity_notes', v)} placeholder="What capability could a partner uniquely provide?" />
              </SectionCard>
            )}

            {activeSection === 'flags' && (
              <SectionCard title="Flags" subtitle="Required before saving. Flags apply hard caps to the commercial score." icon={<Flag className="w-4 h-4 text-amber-600" />}>
                <FlagRow
                  label="Clinical Hold"
                  caption="If yes, commercial score is capped at 30."
                  value={form.clinical_hold_flag}
                  onChange={v => setField('clinical_hold_flag', v)}
                />
                <FlagRow
                  label="No Manufacturing Pathway"
                  caption="If yes, commercial score is capped at 40."
                  value={form.no_manufacturing_flag}
                  onChange={v => setField('no_manufacturing_flag', v)}
                />
                <FlagRow
                  label="Timeline > 24 Months"
                  caption="If yes, commercial score is capped at 50."
                  value={form.timeline_flag}
                  onChange={v => setField('timeline_flag', v)}
                />
                <FlagRow
                  label="No U.S. Path"
                  caption="If yes, commercial score is set to 0."
                  value={form.no_us_path_flag}
                  onChange={v => setField('no_us_path_flag', v)}
                />
                {!flagsSet && (
                  <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    All four flags must be explicitly set to Yes or No before saving.
                  </div>
                )}
              </SectionCard>
            )}

            {activeSection === 'sources' && (
              <SectionCard title="Sources" subtitle="Minimum 1, maximum 3. At least one Primary source is strongly recommended." icon={<Link2 className="w-4 h-4 text-teal-600" />}>
                <div className="space-y-3">
                  {sources.map((src, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-2 p-3 border border-slate-200 rounded-lg bg-white">
                      <div className="space-y-2">
                        <input
                          type="url"
                          value={src.url}
                          onChange={e => setSources(s => s.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                          placeholder="https://..."
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                        <input
                          type="text"
                          value={src.title}
                          onChange={e => setSources(s => s.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                          placeholder="Title (optional)"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                      </div>
                      <select
                        value={src.tier}
                        onChange={e => setSources(s => s.map((x, j) => j === i ? { ...x, tier: e.target.value as SourceTier } : x))}
                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Primary">Primary (IR / SEC / FDA)</option>
                        <option value="Secondary">Secondary (Deck / Conference)</option>
                        <option value="Tertiary">Tertiary (Trade press)</option>
                      </select>
                      <button
                        onClick={() => setSources(s => s.filter((_, j) => j !== i))}
                        className="self-start md:self-center p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        aria-label="Remove source"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {sources.length < 3 && (
                    <button
                      onClick={() => setSources(s => [...s, { url: '', tier: 'Secondary', title: '' }])}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-dashed border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 hover:border-teal-400"
                    >
                      <Plus className="w-4 h-4" /> Add source
                    </button>
                  )}
                </div>
                {onlyTertiary && (
                  <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    Only Tertiary (trade press) sources cited. Confirm primary / official sourcing was unavailable.
                  </div>
                )}
                {validSources.length > 0 && !hasPrimary && (
                  <div className="mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    No primary source provided. You will be asked to confirm before saving.
                  </div>
                )}
              </SectionCard>
            )}
          </div>

          <aside className="hidden lg:flex flex-col border-l border-slate-200 bg-white overflow-y-auto">
            <LiveScorePanel
              commercialRaw={commercial.raw}
              commercialFinal={commercial.final}
              commercialCaps={commercial.caps}
              strategic={strategic}
              commercialTier={commercialTier}
              strategicTier={strategicTier}
              previousCommercial={previousFinal}
              previousStrategic={previousStrategic}
              segment={asset.segment}
            />
          </aside>
        </div>

        <div className="border-t border-slate-200 bg-white px-6 py-4 space-y-3 rounded-b-none sm:rounded-b-2xl">
          {rationaleRequired && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Change rationale (required)
              </label>
              <textarea
                value={form.rationale}
                onChange={e => setField('rationale', e.target.value)}
                placeholder="Describe the catalyst or evidence driving this change."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-amber-400 bg-amber-50/30"
              />
              <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-x-4">
                {delta >= 5 && <span>Commercial Δ {commercial.final - previousFinal}</span>}
                {strategicDelta >= 5 && <span>Strategic Δ {strategic - previousStrategic}</span>}
                {anyFlagChanged && <span>Flag changed</span>}
                {regulatoryStatusChanged && <span>Regulatory status changed</span>}
              </div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}

          {showConfirmNoPrimary && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between gap-2">
              <span>No primary source. Save anyway?</span>
              <div className="flex gap-2">
                <button onClick={() => setShowConfirmNoPrimary(false)} className="px-2 py-1 border border-amber-300 rounded text-amber-800">Cancel</button>
                <button onClick={handleSave} className="px-2 py-1 bg-amber-600 text-white rounded">Confirm save</button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Scoring framework: <b>Reg 40 · Infra 35 · Market 25</b> (commercial) · <b>Reg 40 · Market 30 · Gap 30</b> (strategic)
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || missing.length > 0}
                className="flex items-center gap-1.5 px-5 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save score
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function sectionComplete(id: SectionId, ctx: { flagsSet: boolean; validSourcesCount: number }) {
  if (id === 'flags') return ctx.flagsSet;
  if (id === 'sources') return ctx.validSourcesCount >= 1 && ctx.validSourcesCount <= 3;
  return false;
}

function SectionCard({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-start gap-2 mb-5">
        {icon}
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ScorePicker({ label, value, onChange, rubric }: { label: string; value: number; onChange: (v: number) => void; rubric: Record<number, string> }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <span className="text-xs text-slate-500">{value}/5</span>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg border transition-all ${
              value === n
                ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:bg-teal-50/30'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
        <BookOpen className="w-3.5 h-3.5 mt-0.5 text-slate-400 flex-shrink-0" />
        <div><span className="font-semibold text-slate-700">{value} — </span>{rubric[value]}</div>
      </div>
    </div>
  );
}

function FlagRow({ label, caption, value, onChange }: { label: string; caption: string; value: FlagValue; onChange: (v: FlagValue) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 border border-slate-200 rounded-lg bg-white">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500">{caption}</div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        {(['yes', 'no'] as const).map(v => {
          const active = value === v;
          const yesStyle = active && v === 'yes' ? 'bg-red-600 text-white border-red-600' : '';
          const noStyle = active && v === 'no' ? 'bg-emerald-600 text-white border-emerald-600' : '';
          return (
            <button
              key={v}
              onClick={() => onChange(v)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                !active ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : `${yesStyle} ${noStyle}`
              }`}
            >
              {v === 'yes' ? 'Yes' : 'No'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="mt-3">
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function LiveScorePanel({
  commercialRaw, commercialFinal, commercialCaps, strategic,
  commercialTier, strategicTier, previousCommercial, previousStrategic, segment,
}: {
  commercialRaw: number; commercialFinal: number; commercialCaps: string[]; strategic: number;
  commercialTier: any; strategicTier: any; previousCommercial: number; previousStrategic: number; segment: string;
}) {
  const commercialDelta = commercialFinal - previousCommercial;
  const strategicDelta = strategic - previousStrategic;
  return (
    <div className="p-5 space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Live scoring</div>
        <ScoreBlock
          title="Commercial Readiness"
          final={commercialFinal}
          raw={commercialRaw}
          tier={commercialTier}
          tierClass={tierColor(commercialTier)}
          caps={commercialCaps}
          delta={commercialDelta}
          showRaw={commercialRaw !== commercialFinal}
          noteIfNull={segment !== 'Late Stage' ? 'Commercial tier only calculated for Late Stage assets.' : null}
        />
      </div>
      <div>
        <ScoreBlock
          title="Strategic Opportunity"
          final={strategic}
          raw={strategic}
          tier={strategicTier}
          tierClass={tierColor(strategicTier)}
          caps={[]}
          delta={strategicDelta}
          showRaw={false}
          noteIfNull={null}
        />
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Tier thresholds</div>
        <ThresholdRow label="Tier 1" range="80+" className={tierColor('Tier 1')} />
        <ThresholdRow label="Tier 2" range="65-79" className={tierColor('Tier 2')} />
        <ThresholdRow label="Watchlist" range="50-64" className={tierColor('Watchlist')} />
        <ThresholdRow label="Deprioritized" range="<50" className={tierColor('Deprioritized')} />
      </div>
    </div>
  );
}

function ScoreBlock({ title, final, raw, tier, tierClass, caps, delta, showRaw, noteIfNull }: {
  title: string; final: number; raw: number; tier: any; tierClass: string; caps: string[]; delta: number; showRaw: boolean; noteIfNull: string | null;
}) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-700">{title}</div>
        <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${tierClass}`}>
          {tier || 'Unscored'}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <div className="text-4xl font-bold text-slate-900 leading-none">{final}</div>
        <div className="text-xs text-slate-400 mb-0.5">/100</div>
        {delta !== 0 && (
          <div className={`ml-auto text-xs font-medium mb-0.5 ${delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {delta > 0 ? '+' : ''}{delta}
          </div>
        )}
      </div>
      {showRaw && <div className="text-[11px] text-slate-500 mt-0.5">raw {raw} · caps applied</div>}
      {caps.length > 0 && (
        <div className="mt-3 space-y-1">
          {caps.map(c => (
            <div key={c} className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              <ShieldAlert className="w-3 h-3 mt-0.5 flex-shrink-0" /> {c}
            </div>
          ))}
        </div>
      )}
      {noteIfNull && <div className="mt-2 text-[11px] text-slate-500 italic">{noteIfNull}</div>}
    </div>
  );
}

function ThresholdRow({ label, range, className }: { label: string; range: string; className: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${className}`}>{label}</span>
      <span className="text-[11px] text-slate-500 font-mono">{range}</span>
    </div>
  );
}

function WhereToCheck() {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Where to check</div>
      <div className="space-y-2 text-xs text-slate-600">
        <div>
          <div className="font-semibold text-slate-700">Primary</div>
          <ul className="mt-0.5 space-y-0.5 text-slate-500">
            <li>Company IR</li>
            <li>Press releases</li>
            <li>SEC filings</li>
            <li>FDA.gov</li>
            <li>ClinicalTrials.gov</li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-slate-700">Secondary</div>
          <ul className="mt-0.5 space-y-0.5 text-slate-500">
            <li>Investor decks</li>
            <li>Conferences (ASH, ASCO)</li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-slate-700">Tertiary</div>
          <ul className="mt-0.5 space-y-0.5 text-slate-500">
            <li>Fierce / Endpoints / STAT</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function weekLabel(d: Date) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
