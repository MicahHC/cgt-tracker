import { CgtChangeLog, CgtScoreHistory } from '../types/database';
import { LineChart, ClipboardList } from 'lucide-react';

interface Props {
  changes: CgtChangeLog[];
  history: CgtScoreHistory[];
}

export function AssetHistory({ changes, history }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2 text-sm">
          <LineChart className="w-4 h-4 text-teal-600" /> Score history
        </h2>
        {history.length === 0 ? (
          <div className="text-sm text-slate-400 py-4 text-center">No snapshots yet.</div>
        ) : (
          <>
            <ScoreSparkline history={history} />
            <div className="mt-3 space-y-1.5 max-h-60 overflow-y-auto">
              {history.map(h => (
                <div key={h.id} className="flex items-center justify-between text-xs border-b border-slate-100 pb-1.5">
                  <div className="text-slate-600">
                    <span className="font-medium text-slate-900">{h.week_label || new Date(h.recorded_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-600">Com: <span className="font-semibold text-slate-900">{h.final_commercial_score}</span></span>
                    <span className="text-slate-600">Str: <span className="font-semibold text-slate-900">{h.strategic_opportunity_score}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2 text-sm">
          <ClipboardList className="w-4 h-4 text-teal-600" /> Change log
        </h2>
        {changes.length === 0 ? (
          <div className="text-sm text-slate-400 py-4 text-center">No changes logged yet.</div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {changes.map(c => (
              <div key={c.id} className="border-l-2 border-teal-200 pl-3 py-1">
                <div className="text-sm text-slate-900">
                  <span className="font-medium">{c.field_changed}</span>: {' '}
                  <span className="text-slate-500 line-through">{c.previous_value || '—'}</span>{' '}
                  <span className="text-teal-700">→ {c.new_value || '—'}</span>
                </div>
                {c.why_it_matters && <div className="text-xs text-slate-500">{c.why_it_matters}</div>}
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {new Date(c.created_at).toLocaleString()}
                  {c.change_type && ` · ${c.change_type}`}
                  {c.confidence_level && ` · ${c.confidence_level}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreSparkline({ history }: { history: CgtScoreHistory[] }) {
  const ordered = [...history].reverse();
  if (ordered.length === 0) return null;
  const max = 100;
  const w = 340;
  const h = 60;
  const step = ordered.length > 1 ? w / (ordered.length - 1) : w;
  const commercialPoints = ordered.map((v, i) => `${i * step},${h - (v.final_commercial_score / max) * h}`).join(' ');
  const strategicPoints = ordered.map((v, i) => `${i * step},${h - (v.strategic_opportunity_score / max) * h}`).join(' ');
  return (
    <div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
        <polyline points={commercialPoints} fill="none" stroke="#0d9488" strokeWidth="2" />
        <polyline points={strategicPoints} fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-teal-600" /> Commercial</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-sky-400" style={{ borderTop: '1px dashed' }} /> Strategic</span>
      </div>
    </div>
  );
}
