import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, FileText, ArrowRight, Check, AlertCircle, Loader2, Download } from 'lucide-react';
import { Segment } from '../types/database';
import { SEGMENTS } from '../lib/constants';
import { computeAllScores } from '../lib/scoring';
import { useAuth } from '../contexts/AuthContext';

type Step = 'upload' | 'map' | 'review' | 'done';

interface ParsedRow {
  [key: string]: string;
}

// Canonical field definitions
const FIELDS: { key: string; label: string; kind: 'string' | 'number' | 'boolean' | 'date' | 'enum'; enumValues?: string[]; target: 'company' | 'asset' }[] = [
  { key: 'company_name', label: 'Company name', kind: 'string', target: 'company' },
  { key: 'parent_company', label: 'Parent company', kind: 'string', target: 'company' },
  { key: 'ticker', label: 'Ticker', kind: 'string', target: 'company' },
  { key: 'hq_country', label: 'HQ country', kind: 'string', target: 'company' },
  { key: 'website', label: 'Website', kind: 'string', target: 'company' },
  { key: 'asset_name', label: 'Asset name', kind: 'string', target: 'asset' },
  { key: 'modality', label: 'Modality', kind: 'string', target: 'asset' },
  { key: 'lead_indication', label: 'Lead indication', kind: 'string', target: 'asset' },
  { key: 'target_indication', label: 'Target indication', kind: 'string', target: 'asset' },
  { key: 'clinicaltrials_gov_id', label: 'ClinicalTrials.gov ID', kind: 'string', target: 'asset' },
  { key: 'segment', label: 'Segment', kind: 'enum', enumValues: SEGMENTS, target: 'asset' },
  { key: 'phase_regulatory_status', label: 'Phase / regulatory status', kind: 'string', target: 'asset' },
  { key: 'filing_status', label: 'Filing status', kind: 'string', target: 'asset' },
  { key: 'fda_designations', label: 'FDA designations', kind: 'string', target: 'asset' },
  { key: 'pdufa_date', label: 'PDUFA date', kind: 'date', target: 'asset' },
  { key: 'key_upcoming_catalyst', label: 'Key upcoming catalyst', kind: 'string', target: 'asset' },
  { key: 'catalyst_date', label: 'Catalyst date', kind: 'date', target: 'asset' },
  { key: 'us_commercialization_window', label: 'US commercialization window', kind: 'string', target: 'asset' },
  { key: 'likely_us_launch_within_24_months', label: 'Likely US launch within 24 mo', kind: 'enum', enumValues: ['Yes', 'No', 'Watchlist'], target: 'asset' },
  { key: 'manufacturing_status', label: 'Manufacturing status', kind: 'string', target: 'asset' },
  { key: 'manufacturing_pathway', label: 'Manufacturing pathway', kind: 'enum', enumValues: ['Yes', 'No', 'Unclear'], target: 'asset' },
  { key: 'manufacturing_cmc_risk_notes', label: 'Manufacturing / CMC risk notes', kind: 'string', target: 'asset' },
  { key: 'commercial_buildout_status', label: 'Commercial buildout status', kind: 'string', target: 'asset' },
  { key: 'commercial_readiness_signals', label: 'Commercial readiness signals', kind: 'string', target: 'asset' },
  { key: 'treatment_network_status', label: 'Treatment network status', kind: 'string', target: 'asset' },
  { key: 'distribution_model', label: 'Distribution model', kind: 'string', target: 'asset' },
  { key: 'key_executive_hires_changes', label: 'Key executive hires / changes', kind: 'string', target: 'asset' },
  { key: 'regulatory_clinical_risk_notes', label: 'Regulatory / clinical risk notes', kind: 'string', target: 'asset' },
  { key: 'market_access_complexity_notes', label: 'Market access complexity notes', kind: 'string', target: 'asset' },
  { key: 'latest_material_update', label: 'Latest material update', kind: 'string', target: 'asset' },
  { key: 'clinical_hold', label: 'Clinical hold', kind: 'boolean', target: 'asset' },
  { key: 'no_manufacturing_pathway', label: 'No manufacturing pathway', kind: 'boolean', target: 'asset' },
  { key: 'timeline_over_24_months', label: 'Timeline > 24 months', kind: 'boolean', target: 'asset' },
  { key: 'no_us_path', label: 'No US path', kind: 'boolean', target: 'asset' },
  { key: 'regulatory_score', label: 'Regulatory score (0-5)', kind: 'number', target: 'asset' },
  { key: 'commercial_infrastructure_score', label: 'Commercial infrastructure score (0-5)', kind: 'number', target: 'asset' },
  { key: 'market_attractiveness_score', label: 'Market attractiveness score (0-5)', kind: 'number', target: 'asset' },
  { key: 'capability_gap_leverage_score', label: 'Capability gap leverage score (0-5)', kind: 'number', target: 'asset' },
  { key: 'confidence_level', label: 'Confidence level', kind: 'enum', enumValues: ['High', 'Medium', 'Low'], target: 'asset' },
];

export function ImportWizard() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultSegment, setDefaultSegment] = useState<Segment>('Late Stage');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length === 0) return;
    setHeaders(parsed[0]);
    setRows(parsed.slice(1).map(r => {
      const obj: ParsedRow = {};
      parsed[0].forEach((h, i) => { obj[h] = r[i] || ''; });
      return obj;
    }).filter(r => Object.values(r).some(v => v.trim())));
    // Auto-map headers by exact or normalized name
    const autoMap: Record<string, string> = {};
    parsed[0].forEach(h => {
      const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const match = FIELDS.find(f => f.key === norm || f.label.toLowerCase().replace(/[^a-z0-9]/g, '_') === norm);
      if (match) autoMap[match.key] = h;
    });
    setMapping(autoMap);
    setStep('map');
  }

  async function runImport() {
    setImporting(true);
    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    for (const row of rows) {
      try {
        const companyName = (row[mapping['company_name']] || '').trim();
        const assetName = (row[mapping['asset_name']] || '').trim();
        if (!companyName || !assetName) {
          errors.push(`Row skipped: missing company or asset name (${companyName || '?'} / ${assetName || '?'})`);
          continue;
        }

        // Find or create company
        const { data: existingCompany } = await supabase
          .from('cgt_companies')
          .select('*')
          .ilike('company_name', companyName)
          .maybeSingle();

        let companyId: string;
        if (existingCompany) {
          companyId = existingCompany.id;
        } else {
          const companyPayload: any = { company_name: companyName };
          FIELDS.filter(f => f.target === 'company' && f.key !== 'company_name').forEach(f => {
            const src = mapping[f.key];
            if (src && row[src]) companyPayload[f.key] = row[src].trim();
          });
          const { data: newCo, error } = await supabase.from('cgt_companies').insert(companyPayload).select('id').maybeSingle();
          if (error || !newCo) { errors.push(`Failed to create company ${companyName}: ${error?.message}`); continue; }
          companyId = (newCo as any).id;
        }

        // Build asset payload
        const assetPayload: any = {
          company_id: companyId,
          asset_name: assetName,
          segment: defaultSegment,
          last_reviewed_at: new Date().toISOString(),
          last_reviewed_by: user?.id,
        };
        FIELDS.filter(f => f.target === 'asset' && f.key !== 'asset_name').forEach(f => {
          const src = mapping[f.key];
          if (!src) return;
          const raw = (row[src] || '').trim();
          if (!raw) return;
          if (f.kind === 'number') {
            const n = parseInt(raw, 10);
            if (!isNaN(n)) assetPayload[f.key] = Math.max(0, Math.min(5, n));
          } else if (f.kind === 'boolean') {
            assetPayload[f.key] = ['true', 'yes', '1', 'y'].includes(raw.toLowerCase());
          } else if (f.kind === 'date') {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) assetPayload[f.key] = d.toISOString().slice(0, 10);
          } else if (f.kind === 'enum') {
            const match = f.enumValues?.find(v => v.toLowerCase() === raw.toLowerCase());
            if (match) assetPayload[f.key] = match;
          } else {
            assetPayload[f.key] = raw;
          }
        });

        // Compute scores
        const preview = computeAllScores({
          regulatory_score: assetPayload.regulatory_score || 0,
          commercial_infrastructure_score: assetPayload.commercial_infrastructure_score || 0,
          market_attractiveness_score: assetPayload.market_attractiveness_score || 0,
          capability_gap_leverage_score: assetPayload.capability_gap_leverage_score || 0,
          clinical_hold: assetPayload.clinical_hold || false,
          no_manufacturing_pathway: assetPayload.no_manufacturing_pathway || false,
          timeline_over_24_months: assetPayload.timeline_over_24_months || false,
          no_us_path: assetPayload.no_us_path || false,
          segment: assetPayload.segment || defaultSegment,
        } as any);

        assetPayload.raw_commercial_score = preview.rawCommercial;
        assetPayload.final_commercial_score = preview.finalCommercial;
        assetPayload.strategic_opportunity_score = preview.strategic;
        assetPayload.commercial_priority_tier = preview.commercialTier;
        assetPayload.strategic_priority_tier = preview.strategicTier;

        // Dedup: company + asset_name
        const { data: existingAsset } = await supabase
          .from('cgt_assets')
          .select('id')
          .eq('company_id', companyId)
          .ilike('asset_name', assetName)
          .maybeSingle();

        if (existingAsset) {
          await supabase.from('cgt_assets').update(assetPayload).eq('id', (existingAsset as any).id);
          updated++;
        } else {
          const { data: created_, error: insErr } = await supabase.from('cgt_assets').insert(assetPayload).select('id').maybeSingle();
          if (insErr) { errors.push(`Failed ${assetName}: ${insErr.message}`); continue; }
          created++;
          if (created_) {
            await supabase.from('cgt_score_history').insert({
              asset_id: (created_ as any).id,
              week_label: weekLabel(new Date()),
              regulatory_score: assetPayload.regulatory_score || 0,
              commercial_infrastructure_score: assetPayload.commercial_infrastructure_score || 0,
              market_attractiveness_score: assetPayload.market_attractiveness_score || 0,
              capability_gap_leverage_score: assetPayload.capability_gap_leverage_score || 0,
              raw_commercial_score: preview.rawCommercial,
              final_commercial_score: preview.finalCommercial,
              strategic_opportunity_score: preview.strategic,
              commercial_priority_tier: preview.commercialTier,
              strategic_priority_tier: preview.strategicTier,
              recorded_by: user?.id,
            });
          }
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Unknown error');
      }
    }

    setResult({ created, updated, errors });
    setImporting(false);
    setStep('done');
  }

  function downloadTemplate() {
    const header = FIELDS.map(f => f.key).join(',');
    const example = FIELDS.map(f => {
      if (f.key === 'company_name') return 'Example Therapeutics';
      if (f.key === 'asset_name') return 'ASSET-101';
      if (f.key === 'segment') return 'Late Stage';
      if (f.kind === 'number') return '3';
      if (f.kind === 'boolean') return 'No';
      return '';
    }).join(',');
    const blob = new Blob([header + '\n' + example], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cgt_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (step === 'upload') {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-5">
        <div className="w-14 h-14 rounded-xl bg-teal-100 flex items-center justify-center mx-auto">
          <Upload className="w-6 h-6 text-teal-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Import assets from CSV</h2>
          <p className="text-sm text-slate-500 mt-1">Upload a CSV file. You&apos;ll map columns in the next step. Rows are deduplicated by company + asset name.</p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 cursor-pointer">
            <Upload className="w-4 h-4" />
            Choose CSV file
            <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
          </label>
          <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="w-4 h-4" /> Download template
          </button>
        </div>
      </div>
    );
  }

  if (step === 'map') {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Map CSV columns ({rows.length} rows)</h2>
          <div>
            <label className="text-xs text-slate-500 mr-2">Default segment</label>
            <select value={defaultSegment} onChange={e => setDefaultSegment(e.target.value as Segment)} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white">
              {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 max-h-[500px] overflow-y-auto pr-2">
          {FIELDS.map(f => (
            <div key={f.key} className="flex items-center gap-3">
              <div className="flex-1 text-sm">
                <div className="font-medium text-slate-900">{f.label}</div>
                <div className="text-[11px] text-slate-500">{f.target} · {f.kind}</div>
              </div>
              <select
                value={mapping[f.key] || ''}
                onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })}
                className="w-44 px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">— skip —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="flex justify-between pt-4 border-t border-slate-100">
          <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">← Back</button>
          <button
            onClick={() => setStep('review')}
            disabled={!mapping['company_name'] || !mapping['asset_name']}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            Review <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (step === 'review') {
    const preview = rows.slice(0, 5);
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Review and import</h2>
        <div className="text-sm text-slate-600">
          Ready to import <span className="font-semibold text-slate-900">{rows.length}</span> rows as <span className="font-semibold text-slate-900">{defaultSegment}</span>. Duplicates (same company + asset name) will be updated.
        </div>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-slate-600">Company</th>
                <th className="px-3 py-2 text-left text-slate-600">Asset</th>
                <th className="px-3 py-2 text-left text-slate-600">Indication</th>
                <th className="px-3 py-2 text-left text-slate-600">Phase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-slate-900">{r[mapping['company_name']] || '—'}</td>
                  <td className="px-3 py-2 text-slate-900">{r[mapping['asset_name']] || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{r[mapping['lead_indication']] || r[mapping['target_indication']] || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{r[mapping['phase_regulatory_status']] || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 5 && <div className="px-3 py-2 text-xs text-slate-500 bg-slate-50 border-t border-slate-200">+ {rows.length - 5} more rows</div>}
        </div>
        <div className="flex justify-between pt-2">
          <button onClick={() => setStep('map')} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">← Back to mapping</button>
          <button onClick={runImport} disabled={importing} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {importing ? 'Importing...' : `Import ${rows.length} rows`}
          </button>
        </div>
      </div>
    );
  }

  // done
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
          <Check className="w-5 h-5 text-emerald-700" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Import complete</h2>
          <p className="text-sm text-slate-500">{result?.created} created, {result?.updated} updated, {result?.errors.length || 0} errors</p>
        </div>
      </div>
      {result?.errors && result.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
          <div className="flex items-center gap-1.5 text-sm font-medium text-red-700 mb-1">
            <AlertCircle className="w-4 h-4" /> Errors
          </div>
          <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
            {result.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      <button onClick={() => { setStep('upload'); setRows([]); setMapping({}); setResult(null); }} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
        Start new import
      </button>
    </div>
  );
}

function weekLabel(d: Date) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        cur.push(field); field = '';
        if (cur.some(v => v.length)) rows.push(cur);
        cur = [];
      } else { field += ch; }
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

// FileText kept for potential usage in future
void FileText;
