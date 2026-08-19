import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Layers, ShieldOff, Users, Search, ShieldCheck, Building2, Globe, Download } from 'lucide-react';

type AudienceMember = {
  id: string;
  account_name: string;
  country: string;
  domain: string;
  audience_segment: string;
  is_client: boolean;
};

const CANONICAL_SEGMENTS = ['Priority 1', 'Priority 2', 'ATC', 'Early Stage', 'Late Stage', 'On Market', 'Closed Won', 'Consultants'];
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
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('cgt_abm_audience_members')
      .select('id, account_name, country, domain, audience_segment, is_client')
      .order('audience_segment')
      .order('account_name');
    setMembers((data as AudienceMember[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const segments = useMemo(() => {
    const found = new Set(members.map(m => m.audience_segment).filter(Boolean));
    const ordered = CANONICAL_SEGMENTS.filter(s => found.has(s) || s === 'Closed Won');
    const extras = Array.from(found).filter(s => !CANONICAL_SEGMENTS.includes(s)).sort();
    return [...ordered, ...extras];
  }, [members]);

  const clientCount = useMemo(() => members.filter(m => m.is_client).length, [members]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: members.length };
    for (const m of members) c[m.audience_segment] = (c[m.audience_segment] || 0) + 1;
    c['Closed Won'] = clientCount;
    return c;
  }, [members, clientCount]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(m => {
      if (filter === 'Closed Won') {
        if (!m.is_client) return false;
      } else if (filter !== 'all' && m.audience_segment !== filter) {
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
      const { error } = await supabase
        .from('cgt_abm_audience_members')
        .update({ is_client: !member.is_client })
        .eq('id', member.id);
      if (!error) {
        setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_client: !m.is_client } : m));
      }
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

  return (
    <div className="space-y-8">
      <header>
        <span className="prestige-eyebrow prestige-eyebrow-light">
          <Layers className="w-3 h-3" />
          ABM Audience
        </span>
        <h1 className="prestige-section-title mt-3">Target audience lists</h1>
        <p className="text-sm text-slate-500 mt-2 max-w-3xl">
          The primary target account universe is organized by commercial priority: Priority 1 means a tracked
          therapy is expected to commercialize within 18 months; Priority 2 means relevant but not yet inside
          that Priority 1 window. Phase buckets remain available as secondary reference lists. Accounts
          flagged as clients move into Closed Won and are suppressed from spend while engagement is still tracked.
        </p>
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
            <div className="text-xs text-slate-400 mt-0.5">accounts</div>
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
            Showing <span className="font-semibold text-slate-900">{visible.length}</span> of {members.length}
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
            {filter === 'all' ? 'All accounts' : filter} ({visible.length})
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
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-900 truncate">{member.account_name}</span>
                {member.audience_segment && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase border flex-shrink-0 ${segmentColor(member.audience_segment)}`}>
                    {member.audience_segment}
                  </span>
                )}
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
