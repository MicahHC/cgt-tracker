import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Layers, ShieldOff, Users, Search, ShieldCheck, Building2, Globe } from 'lucide-react';

type AudienceMember = {
  id: string;
  account_name: string;
  country: string;
  domain: string;
  audience_segment: string;
  is_client: boolean;
};

const CANONICAL_SEGMENTS = ['ATC', 'Early Stage', 'Late Stage', 'On Market', 'Closed Won', 'Consultants'];

function segmentColor(seg: string): string {
  switch (seg) {
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

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: members.length };
    for (const m of members) c[m.audience_segment] = (c[m.audience_segment] || 0) + 1;
    return c;
  }, [members]);

  const clientCount = useMemo(() => members.filter(m => m.is_client).length, [members]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(m => {
      if (filter !== 'all' && m.audience_segment !== filter) return false;
      if (q && !m.account_name.toLowerCase().includes(q) && !m.domain.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, filter, search]);

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

  return (
    <div className="space-y-8">
      <header>
        <span className="prestige-eyebrow prestige-eyebrow-light">
          <Layers className="w-3 h-3" />
          ABM Audience
        </span>
        <h1 className="prestige-section-title mt-3">Target audience lists</h1>
        <p className="text-sm text-slate-500 mt-2 max-w-3xl">
          The full target account universe organized by funnel segment. Client (Closed Won) accounts are flagged and
          suppressed from spend while engagement is still tracked.
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
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <ShieldOff className="w-3.5 h-3.5 text-amber-700" />
            <div className="text-xs font-bold uppercase tracking-widest text-amber-800">Clients</div>
          </div>
          <div className="text-3xl font-bold mt-1 text-amber-900">{clientCount}</div>
          <div className="text-xs text-amber-700 mt-0.5">spend suppressed</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts or domains..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 bg-white"
          />
        </div>
        <span className="text-xs text-slate-500">
          Showing <span className="font-semibold text-slate-900">{visible.length}</span> of {members.length}
        </span>
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
                <p className="text-xs text-slate-400 mt-2">Mark accounts as clients to populate Closed Won, or upload a Closed Won list.</p>
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
