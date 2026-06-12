import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { CgtAsset, CgtCompany } from '../types/database';
import { SEGMENTS } from '../lib/constants';
import { X, Loader2, Building2, Sparkles } from 'lucide-react';

interface Props {
  onCancel: () => void;
  onCreated: (asset: CgtAsset, company: CgtCompany) => void;
}

export function NewCompanyScoreModal({ onCancel, onCreated }: Props) {
  const [companyName, setCompanyName] = useState('');
  const [ticker, setTicker] = useState('');
  const [hq, setHq] = useState('');
  const [website, setWebsite] = useState('');
  const [assetName, setAssetName] = useState('');
  const [modality, setModality] = useState('');
  const [indication, setIndication] = useState('');
  const [segment, setSegment] = useState<string>('Late Stage');
  const [phase, setPhase] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = !companyName.trim() || !assetName.trim() || saving;

  async function handleCreate() {
    if (disabled) return;
    setSaving(true);
    setError(null);
    try {
      const { data: existing } = await supabase
        .from('cgt_companies')
        .select('*')
        .ilike('company_name', companyName.trim())
        .maybeSingle();

      let company = existing as CgtCompany | null;

      if (!company) {
        const { data: created, error: cErr } = await supabase
          .from('cgt_companies')
          .insert({
            company_name: companyName.trim(),
            ticker: ticker.trim(),
            hq_country: hq.trim(),
            website: website.trim(),
            segment_default: segment,
            parent_company: '',
            notes: '',
          })
          .select('*')
          .maybeSingle();
        if (cErr) throw cErr;
        company = created as CgtCompany;
      }

      if (!company) throw new Error('Could not create company.');

      const { data: asset, error: aErr } = await supabase
        .from('cgt_assets')
        .insert({
          company_id: company.id,
          asset_name: assetName.trim(),
          modality: modality.trim(),
          lead_indication: indication.trim(),
          target_indication: indication.trim(),
          segment,
          phase_regulatory_status: phase.trim(),
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
        })
        .select('*')
        .maybeSingle();
      if (aErr) throw aErr;

      onCreated(asset as CgtAsset, company);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create company.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Score a new company</h2>
              <p className="text-xs text-slate-500">Add a company and its lead asset, then open the rubric.</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">Company</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Company name" required>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Acme Therapeutics"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </Field>
              <Field label="Ticker">
                <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="ACME"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </Field>
              <Field label="HQ country">
                <input value={hq} onChange={e => setHq(e.target.value)} placeholder="USA"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </Field>
              <Field label="Website">
                <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </Field>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              If a company with that name already exists, the new asset will be linked to it instead of creating a duplicate.
            </p>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">Lead asset</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Asset name" required>
                <input value={assetName} onChange={e => setAssetName(e.target.value)} placeholder="e.g. ACME-001"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </Field>
              <Field label="Modality">
                <input value={modality} onChange={e => setModality(e.target.value)} placeholder="CAR-T, AAV, etc."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </Field>
              <Field label="Lead indication">
                <input value={indication} onChange={e => setIndication(e.target.value)} placeholder="e.g. Relapsed DLBCL"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </Field>
              <Field label="Segment">
                <select value={segment} onChange={e => setSegment(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500">
                  {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Phase / regulatory status">
                <input value={phase} onChange={e => setPhase(e.target.value)} placeholder="Phase 3, BLA filed..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
              </Field>
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 shadow-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Create & score
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
