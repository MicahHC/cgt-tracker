import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { CgtAssetSource } from '../types/database';
import { SIGNAL_TYPES, SOURCE_TYPES } from '../lib/constants';
import { ExternalLink, Plus, Trash2, X } from 'lucide-react';

interface Props {
  assetId: string;
  sources: CgtAssetSource[];
  canEdit: boolean;
  onChange: () => void;
}

export function AssetSources({ assetId, sources, canEdit, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<CgtAssetSource>>({
    source_type: 'press release',
    signal_type: 'regulatory',
    is_primary_source: false,
  });

  async function add() {
    if (!form.source_url) return;
    const domain = (() => { try { return new URL(form.source_url!).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    await supabase.from('cgt_asset_sources').insert({
      asset_id: assetId,
      source_url: form.source_url!,
      source_title: form.source_title || '',
      source_type: form.source_type || '',
      signal_type: form.signal_type || '',
      source_date: form.source_date || null,
      is_primary_source: !!form.is_primary_source,
      source_domain: domain,
      notes: form.notes || '',
    });
    setForm({ source_type: 'press release', signal_type: 'regulatory', is_primary_source: false });
    setAdding(false);
    onChange();
  }

  async function remove(id: string) {
    if (!confirm('Remove this source?')) return;
    await supabase.from('cgt_asset_sources').delete().eq('id', id);
    onChange();
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900">Sources ({sources.length})</h2>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-teal-600 hover:bg-teal-50 rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Add source
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 p-4 border border-slate-200 rounded-lg space-y-3 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder="URL *" value={form.source_url || ''} onChange={e => setForm({ ...form, source_url: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <input placeholder="Title" value={form.source_title || ''} onChange={e => setForm({ ...form, source_title: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <select value={form.source_type || ''} onChange={e => setForm({ ...form, source_type: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
              {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={form.signal_type || ''} onChange={e => setForm({ ...form, signal_type: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
              {SIGNAL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="date" value={form.source_date || ''} onChange={e => setForm({ ...form, source_date: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!form.is_primary_source} onChange={e => setForm({ ...form, is_primary_source: e.target.checked })} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              Primary source
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
            <button onClick={add} className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700">Add source</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sources.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">No sources logged yet.</div>}
        {sources.map(s => (
          <div key={s.id} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
            <div className="flex-1 min-w-0">
              <a href={s.source_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-teal-700 hover:underline inline-flex items-center gap-1 truncate max-w-full">
                {s.source_title || s.source_url}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
              <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                {s.is_primary_source && <span className="text-teal-700 font-semibold">PRIMARY</span>}
                {s.source_type && <span>{s.source_type}</span>}
                {s.signal_type && <span>· {s.signal_type}</span>}
                {s.source_domain && <span>· {s.source_domain}</span>}
                {s.source_date && <span>· {new Date(s.source_date).toLocaleDateString()}</span>}
              </div>
            </div>
            {canEdit && (
              <button onClick={() => remove(s.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
