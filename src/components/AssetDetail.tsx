import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';
import { CgtAsset, CgtAssetSource, CgtChangeLog, CgtCompany, CgtScoreHistory } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { computeAllScores } from '../lib/scoring';
import { ArrowLeft, Pencil, Lock, Unlock, Package, Building2, ExternalLink, ShieldAlert, Factory, CalendarClock, Gauge } from 'lucide-react';
import { SegmentBadge, TierBadge, ConfidenceBadge, FlagBadge } from './ui/Badge';
import { AssetEditForm } from './AssetEditForm';
import { AssetSources } from './AssetSources';
import { AssetHistory } from './AssetHistory';
import { ScoreAssetModal } from './ScoreAssetModal';

interface Props {
  assetId: string;
  onBack: () => void;
}

export function AssetDetail({ assetId, onBack }: Props) {
  const { user, role } = useAuth();
  const canEdit = role === 'admin' || role === 'analyst';
  const [asset, setAsset] = useState<CgtAsset | null>(null);
  const [company, setCompany] = useState<CgtCompany | null>(null);
  const [sources, setSources] = useState<CgtAssetSource[]>([]);
  const [changes, setChanges] = useState<CgtChangeLog[]>([]);
  const [history, setHistory] = useState<CgtScoreHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [scoring, setScoring] = useState(false);

  useEffect(() => { load(); }, [assetId]);

  useRealtimeRefresh(
    ['cgt_assets', 'cgt_asset_sources', 'cgt_change_log', 'cgt_score_history', 'cgt_companies'],
    () => load()
  );

  async function load() {
    setLoading(true);
    const { data: a } = await supabase.from('cgt_assets').select('*').eq('id', assetId).maybeSingle();
    setAsset(a as CgtAsset | null);
    if (a) {
      const [{ data: c }, { data: srcs }, { data: chgs }, { data: hist }] = await Promise.all([
        supabase.from('cgt_companies').select('*').eq('id', (a as CgtAsset).company_id).maybeSingle(),
        supabase.from('cgt_asset_sources').select('*').eq('asset_id', assetId).order('source_date', { ascending: false }),
        supabase.from('cgt_change_log').select('*').eq('asset_id', assetId).order('created_at', { ascending: false }),
        supabase.from('cgt_score_history').select('*').eq('asset_id', assetId).order('recorded_at', { ascending: false }),
      ]);
      setCompany(c as CgtCompany | null);
      setSources((srcs as CgtAssetSource[]) || []);
      setChanges((chgs as CgtChangeLog[]) || []);
      setHistory((hist as CgtScoreHistory[]) || []);
    }
    setLoading(false);
  }

  async function toggleLock() {
    if (!asset || !user) return;
    const locked = asset.lock_status === 'In Progress';
    const update = locked
      ? { lock_status: 'Open', locked_by: null, locked_at: null }
      : { lock_status: 'In Progress', locked_by: user.id, locked_at: new Date().toISOString() };
    await supabase.from('cgt_assets').update(update).eq('id', assetId);
    load();
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>;
  if (!asset) return <div className="text-slate-500">Asset not found. <button onClick={onBack} className="text-teal-600">Back</button></div>;

  if (editing) {
    return (
      <AssetEditForm
        asset={asset}
        onCancel={() => setEditing(false)}
        onSaved={() => { setEditing(false); load(); }}
      />
    );
  }

  const computed = computeAllScores(asset);
  const hasInputs = (asset.regulatory_score ?? 0) > 0 ||
    (asset.commercial_infrastructure_score ?? 0) > 0 ||
    (asset.market_attractiveness_score ?? 0) > 0 ||
    (asset.capability_gap_leverage_score ?? 0) > 0;
  const breakdown = hasInputs ? computed : {
    rawCommercial: asset.raw_commercial_score ?? asset.final_commercial_score ?? 0,
    finalCommercial: asset.final_commercial_score ?? 0,
    strategic: asset.strategic_opportunity_score ?? 0,
    commercialTier: asset.commercial_priority_tier ?? computed.commercialTier,
    strategicTier: asset.strategic_priority_tier ?? computed.strategicTier,
    caps: computed.caps,
  };
  const lockedByOther = asset.lock_status === 'In Progress' && asset.locked_by !== user?.id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back to assets
        </button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={toggleLock}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              {asset.lock_status === 'In Progress' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {asset.lock_status === 'In Progress' ? 'Release lock' : 'Lock for edit'}
            </button>
          )}
          {canEdit && !lockedByOther && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit details
              </button>
              <button
                onClick={() => setScoring(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 shadow-sm"
              >
                <Gauge className="w-3.5 h-3.5" /> Score asset
              </button>
            </>
          )}
        </div>
      </div>

      {lockedByOther && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <Lock className="w-4 h-4" /> Locked by another user. Contact an admin to override.
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-teal-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{asset.asset_name}</h1>
              <SegmentBadge segment={asset.segment} />
              {asset.last_reviewed_at && <ConfidenceBadge level={asset.confidence_level} />}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-600">
              <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {company?.company_name || 'Unknown company'}</span>
              {asset.modality && <span>· {asset.modality}</span>}
              {asset.phase_regulatory_status && <span>· {asset.phase_regulatory_status}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {asset.clinical_hold && <FlagBadge label="Clinical hold" color="red" />}
              {asset.no_manufacturing_pathway && <FlagBadge label="No manufacturing" color="red" />}
              {asset.no_us_path && <FlagBadge label="No US path" color="red" />}
              {asset.timeline_over_24_months && <FlagBadge label="Timeline >24 mo" color="amber" />}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScoreCard
          title="Commercial Readiness"
          subtitle="40% Reg / 35% Infra / 25% Market"
          raw={breakdown.rawCommercial}
          final={breakdown.finalCommercial}
          caps={breakdown.caps}
          tier={breakdown.commercialTier}
          inputs={[
            { label: 'Regulatory', value: asset.regulatory_score },
            { label: 'Commercial Infra', value: asset.commercial_infrastructure_score },
            { label: 'Market', value: asset.market_attractiveness_score },
          ]}
        />
        <ScoreCard
          title="Strategic Opportunity"
          subtitle="40% Reg / 30% Market / 30% Capability Gap"
          raw={breakdown.strategic}
          final={breakdown.strategic}
          caps={[]}
          tier={breakdown.strategicTier}
          inputs={[
            { label: 'Regulatory', value: asset.regulatory_score },
            { label: 'Market', value: asset.market_attractiveness_score },
            { label: 'Capability Gap', value: asset.capability_gap_leverage_score },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Clinical & Regulatory">
          <Field label="Phase / regulatory status" value={asset.phase_regulatory_status} />
          <Field label="Filing status" value={asset.filing_status} />
          <Field label="FDA designations" value={asset.fda_designations} />
          <Field label="PDUFA date" value={asset.pdufa_date} />
          <Field label="ClinicalTrials.gov ID" value={asset.clinicaltrials_gov_id} />
          <Field label="Clinical risk notes" value={asset.regulatory_clinical_risk_notes} multiline />
        </Section>

        <Section title="Commercial & Launch">
          <Field label="US commercialization window" value={asset.us_commercialization_window} />
          <Field label="Likely US launch within 24 mo" value={asset.likely_us_launch_within_24_months} />
          <Field label="Commercial buildout" value={asset.commercial_buildout_status} />
          <Field label="Distribution model" value={asset.distribution_model} />
          <Field label="Treatment network" value={asset.treatment_network_status} />
          <Field label="Commercial readiness signals" value={asset.commercial_readiness_signals} multiline />
        </Section>

        <Section title="Manufacturing & CMC">
          <Field label="Manufacturing status" value={asset.manufacturing_status} />
          <Field label="Manufacturing pathway" value={asset.manufacturing_pathway} />
          <Field label="CMC risk notes" value={asset.manufacturing_cmc_risk_notes} multiline />
        </Section>

        <Section title="Team & Market">
          <Field label="Key executive hires/changes" value={asset.key_executive_hires_changes} multiline />
          <Field label="Market access complexity" value={asset.market_access_complexity_notes} multiline />
          <Field label="Latest material update" value={asset.latest_material_update} multiline />
        </Section>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-teal-600" /> Upcoming catalyst</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Catalyst" value={asset.key_upcoming_catalyst} />
          <Field label="Catalyst date" value={asset.catalyst_date} />
        </div>
      </div>

      <AssetSources assetId={assetId} sources={sources} canEdit={canEdit} onChange={load} />
      <AssetHistory changes={changes} history={history} />

      {scoring && (
        <ScoreAssetModal
          asset={asset}
          existingSources={sources}
          onClose={() => setScoring(false)}
          onSaved={() => { setScoring(false); load(); }}
        />
      )}
    </div>
  );
}

function ScoreCard({ title, subtitle, raw, final, caps, tier, inputs }: {
  title: string; subtitle: string; raw: number; final: number; caps: string[]; tier: any;
  inputs: { label: string; value: number }[];
}) {
  const capped = caps.length > 0;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
        <TierBadge tier={tier} />
      </div>
      <div className="flex items-end gap-3 mb-4">
        <div className="text-4xl font-bold text-slate-900">{final}</div>
        <div className="text-sm text-slate-400 mb-1">/ 100</div>
        {capped && <div className="text-xs text-amber-600 mb-1">(raw {raw})</div>}
      </div>
      <div className="space-y-1.5 mb-3">
        {inputs.map(i => (
          <div key={i.label} className="flex items-center gap-2">
            <div className="text-xs text-slate-500 w-32 flex-shrink-0">{i.label}</div>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500" style={{ width: `${(i.value / 5) * 100}%` }} />
            </div>
            <div className="text-xs font-medium text-slate-700 w-6 text-right">{i.value}</div>
          </div>
        ))}
      </div>
      {caps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
          {caps.map(c => (
            <div key={c} className="flex items-start gap-1.5 text-xs text-amber-700">
              <ShieldAlert className="w-3 h-3 mt-0.5 flex-shrink-0" /> {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="font-semibold text-slate-900 mb-3 text-sm">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({ label, value, multiline = false }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  const display = value ? String(value) : '';
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</div>
      {display ? (
        <div className={`text-sm text-slate-900 ${multiline ? 'whitespace-pre-wrap' : ''}`}>{display}</div>
      ) : (
        <div className="text-sm text-slate-300">—</div>
      )}
    </div>
  );
}
