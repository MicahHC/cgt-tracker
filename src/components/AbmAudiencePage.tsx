import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Layers, ShieldOff, Users, Search, ShieldCheck, Building2, Globe, Download } from 'lucide-react';
import { AudienceMember, audienceCounts } from '../lib/audienceCounts';
import { loadAudiences } from '../lib/loadAudiences';
import { useRealtimeRefresh } from '../lib/useRealtimeRefresh';

const CANONICAL_SEGMENTS = ['Late Stage', 'Priority 1', 'Priority 2', 'Launch Timing Review', 'ATC', 'Early Stage', 'On Market', 'Closed Won', 'Consultants'];
const CSV_HEADERS = ['Name', 'Country', 'Domain'];

function csvCell(value: string | null | undefined): string {
  const text = value || '';
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function safeFilenamePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'audience';
}

function exportableDomain(domain: string): string {
  return domain.endsWith('.missing-domain.invalid') ? '' : domain;
}

function exportKey(member: AudienceMember): string {
  return exportableDomain(member.domain) || member.account_name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function dedupeExportRows(rows: AudienceMember[]): AudienceMember[] {
  const seen = new Set<string>();
  return rows.filter(member => {
    const key = exportKey(member);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function segmentColor(seg: string): string {
  switch (seg) {
    case 'Priority 1': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Priority 2': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'ATC': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'Early Stage': return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'Late Stage': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'On Market': return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'Closed Won': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Consultants': return 'bg-teal-50 text-teal-700 border-teal-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function segmentRingAccent(seg: string): string {
  switch (seg) {
    case 'Priority 1': return 'ring-emerald-300 border-emerald-200 bg-emerald-50/60';
    case 'Priority 2': return 'ring-blue-300 border-blue-200 bg-blue-50/60';
    case 'ATC': return 'ring-rose-300 border-rose-200 bg-rose-50/60';
    case 'Early Stage': return 'ring-sky-300 border-sky-200 bg-sky-50/60';
    case 'Late Stage': return 'ring-emerald-300 border-emerald-200 bg-emerald-50/60';
    case 'On Market': return 'ring-violet-300 border-violet-200 bg-violet-50/60';
    case 'Closed Won': return 'ring-amber-300 border-amber-200 bg-amber-50/60';
    case 'Consultants': return 'ring-teal-300 border-teal-200 bg-teal-50/60';
    default: return 'ring-slate-300 border-slate-200 bg-white';
  }
}

export function AbmAudiencePage() {
  const [members, setMembers] = useState<AudienceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('Late Stage');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      setMembers(await loadAudiences());
      setError('');
    } catch {
      setError('Audience data could not be loaded. Retry before using these counts or exporting.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useRealtimeRefresh(['cgt_abm_audience_members', 'cgt_abm_client_domains', 'cgt_assets', 'cgt_companies'], () => load());

  const segments = useMemo(() => {
    const found = new Set(members.map(m => m.audience_segment).filter(Boolean));
    const ordered = CANONICAL_SEGMENTS.filter(s => found.has(s) || ['Late Stage', 'Priority 1', 'Priority 2', 'Closed Won'].includes(s));
    const extras = Array.from(found).filter(s => !CANONICAL_SEGMENTS.includes(s)).sort();
    return [...ordered, ...extras];
  }, [members]);

  const counts = useMemo(() => audienceCounts(members), [members]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(m => {
      if (filter === 'Closed Won') {
        if (!m.is_client) return false;
      } else if (filter !== 'all' && (m.is_client || m.audience_segment !== filter)) {
        return false;
      }
      if (q && !m.account_name.toLowerCase().includes(q) && !m.domain.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, filter, search]);

  const exportable = useMemo(() => {
    return dedupeExportRows(visible.filter(m => !m.is_client && filter !== 'Closed Won'));
  }, [visible, filter]);

  async function handleToggleClient(member: AudienceMember) {
    setBusyId(member.id);
    try {
      const { error } = member.id.startsWith('derived:')
        ? await supabase.from('cgt_abm_audience_members').insert({
          account_name: member.account_name, domain: member.domain, country: member.country,
          audience_segment: member.audience_segment, is_client: !member.is_client,
        })
        : await supabase.from('cgt_abm_audience_members').update({ is_client: !member.is_client }).eq('id', member.id);
      if (!error) {
        await load();
      } else setError('Could not save the client flag. Please retry.');
    } finally {
      setBusyId(null);
    }
  }

  function handleExportCsv() {
    if (exportable.length === 0) return;

    const lines = [
      CSV_HEADERS.map(csvCell).join(','),
      ...exportable.map(member => [
        member.account_name,
        member.country,
        exportableDomain(member.domain),
      ].map(csvCell).join(',')),
    ];

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const segmentName = filter === 'all' ? 'all-active' : filter;
    anchor.href = url;
    anchor.download = `cgt-abm-${safeFilenamePart(segmentName)}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  if (error) return <div role="alert" className="p-6 text-red-700">{error} <button onClick={load} className="underline">Retry</button></div>;

  return (
    <div className="space-y-8">
      <header>
        <span className="prestige-eyebrow prestige-eyebrow-light">
          <Layers className="w-3 h-3" />
          ABM Audience
        </span>
        <h1 className="prestige-section-title mt-3">Late Stage audience</h1>
        <p className="text-sm text-slate-500 mt-2 max-w-3xl">
          Late Stage means a company with a tracked CGT launch expected within the next 24 months, regardless of clinical phase.
          Priority 1 is within 18 months; Priority 2 is beyond 18 and within 24 months.
          Each account takes its highest qualifying priority. Closed Won accounts are suppressed.
          Priority audiences require source-reviewed U.S. launch targets. Unverified forecasts do not qualify. Targets remain conditional, not guaranteed launches.
        </p>
        {(counts['Launch Timing Review'] || 0) > 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {counts['Launch Timing Review']} accounts need launch-timing resolution. Priority counts show the source-supported subset, not a complete estimate of the market. Review these accounts before treating the audience as exhaustive.
        </p>}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-xl border p-4 text-left transition-all ${
            filter === 'all' ? `ring-2 ${segmentRingAccent('all')}` : 'bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <div className="text-xs font-bold uppercase tracking-widest text-slate-600">All</div>
          </div>
          <div className="text-3xl font-bold mt-1 text-slate-900">{counts.all}</div>
          <div className="text-xs text-slate-400 mt-0.5">accounts</div>
        </button>
        {segments.map(seg => (
          <button
            key={seg}
            onClick={() => setFilter(seg)}
            className={`rounded-xl border p-4 text-left transition-all ${
              filter === seg ? `ring-2 ${segmentRingAccent(seg)}` : 'bg-white hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-bold uppercase tracking-widest text-slate-600">{seg}</div>
            <div className="text-3xl font-bold mt-1 text-slate-900">{counts[seg] || 0}</div>
            <div className="text-xs text-slate-400 mt-0.5">{seg === 'Priority 1' || seg === 'Priority 2' ? 'within Late Stage' : 'accounts'}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts or domains..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 bg-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">
            Showing <span className="font-semibold text-slate-900">{visible.length}</span> audience memberships across {counts.all} unique accounts
          </span>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exportable.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-teal-300 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
            title="Download the current audience as a 6sense-ready CSV"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
        <p className="text-[11px] text-slate-400 lg:basis-full">
          6sense format: Name, Country, Domain. Closed Won accounts are excluded from exports.
        </p>
      </div>

      <div className="prestige-card overflow-hidden">
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {filter === 'all' ? 'All audience memberships' : filter} ({visible.length})
          </span>
          <span className="text-xs text-slate-400">Domain / Country</span>
        </div>
        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {loading && (
            <div className="px-6 py-12 text-center text-sm text-slate-400">Loading audience lists...</div>
          )}
          {!loading && visible.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-500">No accounts in this segment yet.</p>
              {filter === 'Closed Won' && (
                <p className="text-xs text-slate-400 mt-2">No clients flagged yet. Use "mark client" on any account to move it into Closed Won.</p>
              )}
            </div>
          )}
          {!loading && visible.map(member => (
            <div key={member.id} className="px-6 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
              <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-900 truncate">{member.account_name}</span>
                {member.audience_segment && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase border flex-shrink-0 ${segmentColor(member.audience_segment)}`}>
                    {member.audience_segment}
                  </span>
                )}
                {member.audience_segment === 'Late Stage' && member.priority_label && <span className="text-xs font-semibold text-teal-700">{member.priority_label}</span>}
                {member.launch_evidence && <p className="basis-full text-xs text-slate-500">{member.launch_evidence}</p>}
              </div>
              <div className="flex items-center gap-4 text-xs flex-shrink-0">
                {member.domain && (
                  <span className="flex items-center gap-1 text-slate-400 font-mono">
                    <Globe className="w-3 h-3" />
                    {member.domain}
                  </span>
                )}
                {member.country && <span className="text-slate-400 hidden md:inline">{member.country}</span>}
                {member.is_client ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-amber-100 text-amber-800 border border-amber-200">
                    <ShieldOff className="w-3 h-3" />
                    Client
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="w-3 h-3" />
                    Active
                  </span>
                )}
                <button
                  disabled={busyId === member.id}
                  onClick={() => handleToggleClient(member)}
                  className="text-[10px] text-slate-400 hover:text-teal-700 underline disabled:opacity-40"
                >
                  {member.is_client ? 'mark active' : 'mark client'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
