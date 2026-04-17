import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CgtAsset, CgtCompany } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { computeAllScores, REGULATORY_RUBRIC, COMMERCIAL_INFRA_RUBRIC, MARKET_ATTRACTIVENESS_RUBRIC, CAPABILITY_GAP_RUBRIC } from '../lib/scoring';
import { SEGMENTS, MANUFACTURING_STATUSES, MANUFACTURING_PATHWAYS, COMMERCIAL_BUILDOUTS, LIKELY_LAUNCH_24, CONFIDENCE_LEVELS } from '../lib/constants';
import { X, Save, Loader2, Info } from 'lucide-react';

interface Props {
  asset?: CgtAsset;
  initialCompanyId?: string;
  onCancel: () => void;
  onSaved: () => void;
}

export function AssetEditForm({ asset, initialCompanyId, onCancel, onSaved }: Props) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<CgtCompany[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CgtAsset>>(asset || {
    company_id: initialCompanyId || '',
    asset_name: '',
    segment: 'Late Stage',
    regulatory_score: 0,
    commercial_infrastructure_score: 0,
    market_attractiveness_score: 0,
    capability_gap_leverage_score: 0,
    confidence_level: 'Medium',
    manufacturing_status: 'Early',
    manufacturing_pathway: 'Unclear',
    commercial_buildout_status: 'Minimal',
    likely_us_launch_within_24_months: 'No',
    clinical_hold: false,
    no_manufacturing_pathway: false,
    timeline_over_24_months: false,
    no_us_path: false,
  });

  useEffect(() => {
    supabase.from('cgt_companies').select('*').order('company_name').then(({ data }) => {
      setCompanies((data as CgtCompany[]) || []);
    });
  }, []);

  function update<K extends keyof CgtAsset>(key: K, value: CgtAsset[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  const preview = computeAllScores({
    ...(asset || {}),
    regulatory_score: form.regulatory_score ?? 0,
    commercial_infrastructure_score: form.commercial_infrastructure_score ?? 0,
    market_attractiveness_score: form.market_attractiveness_score ?? 0,
    capability_gap_leverage_score: form.capability_gap_leverage_score ?? 0,
    segment: (form.segment ?? 'Late Stage') as CgtAsset['segment'],
    clinical_hold: form.clinical_hold ?? false,
    no_manufacturing_pathway: form.no_manufacturing_pathway ?? false,
    timeline_over_24_months: form.timeline_over_24_months ?? false,
    no_us_path: form.no_us_path ?? false,
  } as CgtAsset);

  async function handleSave() {
    if (!form.asset_name || !form.company_id) {
      setError('Asset name and company are required.');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      ...form,
      raw_commercial_score: preview.rawCommercial,
      final_commercial_score: preview.finalCommercial,
      strategic_opportunity_score: preview.strategic,
      commercial_priority_tier: preview.commercialTier,
      strategic_priority_tier: preview.strategicTier,
      last_reviewed_at: new Date().toISOString(),
      last_reviewed_by: user?.id,
      updated_at: new Date().toISOString(),
    };

    try {
      let savedId = asset?.id;
      if (asset) {
        const { error: upErr } = await supabase.from('cgt_assets').update(payload).eq('id', asset.id);
        if (upErr) throw upErr;

        const changedFields: Array<keyof CgtAsset> = [
          'regulatory_score', 'commercial_infrastructure_score', 'market_attractiveness_score',
          'capability_gap_leverage_score', 'clinical_hold', 'no_manufacturing_pathway',
          'timeline_over_24_months', 'no_us_path', 'segment', 'phase_regulatory_status',
          'latest_material_update', 'key_upcoming_catalyst', 'catalyst_date',
        ];
        const logs = changedFields
          .filter(k => String(asset[k] ?? '') !== String((form as any)[k] ?? ''))
          .map(k => ({
            asset_id: asset.id,
            run_date: new Date().toISOString().slice(0, 10),
            agent_id: user?.id,
            change_type: 'edit',
            field_changed: String(k),
            previous_value: String(asset[k] ?? ''),
            new_value: String((form as any)[k] ?? ''),
            why_it_matters: '',
            confidence_level: (form.confidence_level as string) || 'Medium',
          }));
        if (logs.length) {
          await supabase.from('cgt_change_log').insert(logs);
        }
      } else {
        const { data: created, error: insErr } = await supabase
          .from('cgt_assets')
          .insert(payload)
          .select('id')
          .maybeSingle();
        if (insErr) throw insErr;
        savedId = (created as any)?.id;
      }

      if (savedId) {
        await supabase.from('cgt_score_history').insert({
          asset_id: savedId,
          week_label: weekLabel(new Date()),
          regulatory_score: form.regulatory_score ?? 0,
          commercial_infrastructure_score: form.commercial_infrastructure_score ?? 0,
          market_attractiveness_score: form.market_attractiveness_score ?? 0,
          capability_gap_leverage_score: form.capability_gap_leverage_score ?? 0,
          raw_commercial_score: preview.rawCommercial,
          final_commercial_score: preview.finalCommercial,
          strategic_opportunity_score: preview.strategic,
          commercial_priority_tier: preview.commercialTier,
          strategic_priority_tier: preview.strategicTier,
          recorded_by: user?.id,
        });
      }

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{asset ? 'Edit asset' : 'Add asset'}</h1>
          <p className="text-slate-500 text-sm mt-1">Score inputs drive the tier automatically. Final scores cannot be edited directly.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            <X className="w-4 h-4" /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h2 className="font-semibold text-slate-900">Basics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Asset name" value={form.asset_name} onChange={v => update('asset_name', v as any)} required />
          <Select label="Company" value={form.company_id || ''} onChange={v => update('company_id', v as any)} options={companies.map(c => ({ value: c.id, label: c.company_name }))} required />
          <Input label="Modality" value={form.modality} onChange={v => update('modality', v as any)} />
          <Select label="Segment" value={form.segment || 'Late Stage'} onChange={v => update('segment', v as any)} options={SEGMENTS.map(s => ({ value: s, label: s }))} />
          <Input label="Lead indication" value={form.lead_indication} onChange={v => update('lead_indication', v as any)} />
          <Input label="Target indication" value={form.target_indication} onChange={v => update('target_indication', v as any)} />
          <Input label="Phase / regulatory status" value={form.phase_regulatory_status} onChange={v => update('phase_regulatory_status', v as any)} />
          <Input label="Filing status" value={form.filing_status} onChange={v => update('filing_status', v as any)} />
          <Input label="FDA designations" value={form.fda_designations} onChange={v => update('fda_designations', v as any)} />
          <Input label="ClinicalTrials.gov ID" value={form.clinicaltrials_gov_id} onChange={v => update('clinicaltrials_gov_id', v as any)} />
          <Input label="PDUFA date" type="date" value={form.pdufa_date || ''} onChange={v => update('pdufa_date', (v || null) as any)} />
          <Input label="Catalyst date" type="date" value={form.catalyst_date || ''} onChange={v => update('catalyst_date', (v || null) as any)} />
          <Input label="Key upcoming catalyst" value={form.key_upcoming_catalyst} onChange={v => update('key_upcoming_catalyst', v as any)} />
          <Select label="Confidence level" value={form.confidence_level || 'Medium'} onChange={v => update('confidence_level', v as any)} options={CONFIDENCE_LEVELS.map(s => ({ value: s, label: s }))} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <h2 className="font-semibold text-slate-900">Score inputs (0-5)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ScoreInput label="Regulatory" value={form.regulatory_score ?? 0} onChange={v => update('regulatory_score', v as any)} rubric={REGULATORY_RUBRIC} />
          <ScoreInput label="Commercial Infrastructure" value={form.commercial_infrastructure_score ?? 0} onChange={v => update('commercial_infrastructure_score', v as any)} rubric={COMMERCIAL_INFRA_RUBRIC} />
          <ScoreInput label="Market Attractiveness" value={form.market_attractiveness_score ?? 0} onChange={v => update('market_attractiveness_score', v as any)} rubric={MARKET_ATTRACTIVENESS_RUBRIC} />
          <ScoreInput label="Capability Gap Leverage" value={form.capability_gap_leverage_score ?? 0} onChange={v => update('capability_gap_leverage_score', v as any)} rubric={CAPABILITY_GAP_RUBRIC} />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="font-medium text-slate-900 mb-2 text-sm">Overrides & hard caps</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Check label="Clinical hold (cap 30)" value={!!form.clinical_hold} onChange={v => update('clinical_hold', v as any)} />
            <Check label="No manufacturing pathway (cap 40)" value={!!form.no_manufacturing_pathway} onChange={v => update('no_manufacturing_pathway', v as any)} />
            <Check label="Timeline > 24 months (cap 50)" value={!!form.timeline_over_24_months} onChange={v => update('timeline_over_24_months', v as any)} />
            <Check label="No US path (score 0, excluded)" value={!!form.no_us_path} onChange={v => update('no_us_path', v as any)} />
          </div>
        </div>

        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex items-center gap-4">
          <Info className="w-4 h-4 text-teal-600 flex-shrink-0" />
          <div className="flex-1 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-teal-700 font-semibold">Commercial Readiness</div>
              <div className="text-2xl font-bold text-slate-900">{preview.finalCommercial}</div>
              <div className="text-xs text-slate-600">Tier: {preview.commercialTier || '—'}{preview.rawCommercial !== preview.finalCommercial ? ` (raw ${preview.rawCommercial})` : ''}</div>
            </div>
            <div>
              <div className="text-xs text-teal-700 font-semibold">Strategic Opportunity</div>
              <div className="text-2xl font-bold text-slate-900">{preview.strategic}</div>
              <div className="text-xs text-slate-600">Tier: {preview.strategicTier || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Commercial & Manufacturing</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select label="Manufacturing status" value={form.manufacturing_status || 'Early'} onChange={v => update('manufacturing_status', v as any)} options={MANUFACTURING_STATUSES.map(s => ({ value: s, label: s }))} />
          <Select label="Manufacturing pathway" value={form.manufacturing_pathway || 'Unclear'} onChange={v => update('manufacturing_pathway', v as any)} options={MANUFACTURING_PATHWAYS.map(s => ({ value: s, label: s }))} />
          <Select label="Commercial buildout" value={form.commercial_buildout_status || 'Minimal'} onChange={v => update('commercial_buildout_status', v as any)} options={COMMERCIAL_BUILDOUTS.map(s => ({ value: s, label: s }))} />
          <Select label="Likely US launch (24 mo)" value={form.likely_us_launch_within_24_months || 'No'} onChange={v => update('likely_us_launch_within_24_months', v as any)} options={LIKELY_LAUNCH_24.map(s => ({ value: s, label: s }))} />
          <Input label="US commercialization window" value={form.us_commercialization_window} onChange={v => update('us_commercialization_window', v as any)} />
          <Input label="Distribution model" value={form.distribution_model} onChange={v => update('distribution_model', v as any)} />
          <Input label="Treatment network status" value={form.treatment_network_status} onChange={v => update('treatment_network_status', v as any)} />
        </div>
        <Textarea label="CMC / manufacturing risk notes" value={form.manufacturing_cmc_risk_notes} onChange={v => update('manufacturing_cmc_risk_notes', v as any)} />
        <Textarea label="Commercial readiness signals" value={form.commercial_readiness_signals} onChange={v => update('commercial_readiness_signals', v as any)} />
        <Textarea label="Regulatory / clinical risk notes" value={form.regulatory_clinical_risk_notes} onChange={v => update('regulatory_clinical_risk_notes', v as any)} />
        <Textarea label="Market access complexity" value={form.market_access_complexity_notes} onChange={v => update('market_access_complexity_notes', v as any)} />
        <Textarea label="Key executive hires / changes" value={form.key_executive_hires_changes} onChange={v => update('key_executive_hires_changes', v as any)} />
        <Textarea label="Latest material update" value={form.latest_material_update} onChange={v => update('latest_material_update', v as any)} />
      </div>
    </div>
  );
}

function weekLabel(d: Date) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function Input({ label, value, onChange, type = 'text', required }: { label: string; value?: string | null; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}{required && ' *'}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
    </div>
  );
}

function Textarea({ label, value, onChange }: { label: string; value?: string | null; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
    </div>
  );
}

function Select({ label, value, onChange, options, required }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}{required && ' *'}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
        <option value="">Select...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
      {label}
    </label>
  );
}

function ScoreInput({ label, value, onChange, rubric }: { label: string; value: number; onChange: (v: number) => void; rubric: Record<number, string> }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label} <span className="text-slate-400">({value}/5)</span></label>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 py-1.5 text-sm font-medium rounded border transition-colors ${
              value === n
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="text-[11px] text-slate-500 mt-1 italic">{rubric[value]}</div>
    </div>
  );
}
