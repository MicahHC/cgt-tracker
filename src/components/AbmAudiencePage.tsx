import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeAccountName, addClientDomain, removeClientDomain } from '../lib/abmEngagement';
import { AbmAudienceSegment } from '../types/database';
import { Layers, ShieldOff, Users, Search, ShieldCheck, Building2 } from 'lucide-react';

type AudienceMember = {
  key: string;
  account_name: string;
  segments: Set<AbmAudienceSegment>;
  asset_count: number;
  is_client: boolean;
  totalClicks: number;
  totalEngaged: number;
};

const SEGMENTS: AbmAudienceSegment[] = ['ATC', 'Early Stage', 'Late Stage', 'On Market'];

function segmentColor(seg: AbmAudienceSegment): string {
  switch (seg) {
    case 'ATC': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'Early Stage': return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'Late Stage': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'On Market': return 'bg-violet-50 text-violet-700 border-violet-200';
    default: return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function segmentRingAccent(seg: AbmAudienceSegment | 'all'): string {
  switch (seg) {
    case 'ATC': return 'ring-rose-300 border-rose-200 bg-rose-50/60';
    case 'Early Stage': return 'ring-sky-300 border-sky-200 bg-sky-50/60';
    case 'Late Stage': return 'ring-emerald-300 border-emerald-200 bg-emerald-50/60';
    case 'On Market': return 'ring-violet-300 border-violet-200 bg-violet-50/60';
    default: return 'ring-slate-300 border-slate-200 bg-white';
  }
}

function normalizeAssetSegment(value: string | null | undefined): AbmAudienceSegment {
  if (!value) return '';
  const v = value.toLowerCase().trim();
  if (v === 'atc') return 'ATC';
  if (v === 'early stage') return 'Early Stage';
  if (v === 'late stage') return 'Late Stage';
  if (v === 'on-market' || v === 'on market') return 'On Market';
  return '';
}

export function AbmAudiencePage() {
  const [members, setMembers] = useState<AudienceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AbmAudienceSegment | 'all'>('all');
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);

    const [assetsRes, clientsRes, engagementRes] = await Promise.all([
      supabase
        .from('cgt_assets')
        .select('segment, company:cgt_companies(company_name)'),
      supabase
        .from('cgt_abm_client_domains')
        .select('domain'),
      supabase
        .from('cgt_abm_weekly_engagement')
        .select('account_name, clicks, accounts_engaged, is_total')
        .eq('is_total', false),
    ]);

    const assets = (assetsRes.data as any[]) || [];
    const clientNames = new Set<string>(((clientsRes.data as any[]) || []).map(r => (r.domain || '').toLowerCase().trim()));
    const engagement = (engagementRes.data as any[]) || [];

    const engagementByKey = new Map<string, { clicks: number; engaged: number }>();
    for (const e of engagement) {
      const key = normalizeAccountName(e.account_name || '');
      if (!key) continue;
      const existing = engagementByKey.get(key) || { clicks: 0, engaged: 0 };
      existing.clicks += e.clicks || 0;
      existing.engaged += e.accounts_engaged || 0;
      engagementByKey.set(key, existing);
    }

    const map = new Map<string, AudienceMember>();
    for (const a of assets) {
      const companyName: string | undefined = a.company?.company_name;
      if (!companyName) continue;
      const seg = normalizeAssetSegment(a.segment);
      if (!seg) continue;
      const key = normalizeAccountName(companyName);
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        existing.segments.add(seg);
        existing.asset_count += 1;
      } else {
        const eng = engagementByKey.get(key);
        map.set(key, {
          key,
          account_name: companyName,
          segments: new Set<AbmAudienceSegment>([seg]),
          asset_count: 1,
          is_client: clientNames.has(key),
          totalClicks: eng?.clicks || 0,
          totalEngaged: eng?.engaged || 0,
        });
      }
    }

    const list = Array.from(map.values()).sort((a, b) => a.account_name.localeCompare(b.account_name));
    setMembers(list);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: members.length };
    for (const seg of SEGMENTS) c[seg] = 0;
    for (const m of members) {
      for (const seg of m.segments) c[seg] = (c[seg] || 0) + 1;
    }
    return c;
  }, [members]);

  const clientCount = useMemo(() => members.filter(m => m.is_client).length, [members]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(m => {
      if (filter !== 'all' && !m.segments.has(filter)) return false;
      if (q && !m.account_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, filter, search]);

  async function handleToggleClient(member: AudienceMember) {
    setBusyKey(member.key);
    try {
      if (member.is_client) {
        await removeClientDomain(member.key);
      } else {
        await addClientDomain(member.key, member.account_name);
      }
      setMembers(prev => prev.map(m => m.key === member.key ? { ...m, is_client: !m.is_client } : m));
    } finally {
      setBusyKey(null);
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
          Every company in the CGT universe organized by where their assets sit in the funnel. Companies with assets
          in multiple stages appear in every relevant segment. Client accounts are flagged and suppressed from spend
          while engagement is still tracked.
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
        {SEGMENTS.map(seg => (
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
            placeholder="Search accounts..."
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
          <span className="text-xs text-slate-400">Engagement totals across all weeks</span>
        </div>
        <div className="divide-y divide-slate-100">
          {loading && (
            <div className="px-6 py-12 text-center text-sm text-slate-400">Loading audience lists...</div>
          )}
          {!loading && visible.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-500">No accounts match your filters.</p>
            </div>
          )}
          {!loading && visible.map(member => (
            <div key={member.key} className="px-6 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-900 truncate">{member.account_name}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {Array.from(member.segments).sort().map(seg => (
                    <span key={seg} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase border ${segmentColor(seg)}`}>
                      {seg}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400 ml-1">{member.asset_count} {member.asset_count === 1 ? 'asset' : 'assets'}</span>
              </div>
              <div className="flex items-center gap-4 text-xs flex-shrink-0">
                {member.is_client ? (
                  <span className="text-amber-700 italic">— suppressed —</span>
                ) : (
                  <>
                    <span className="text-slate-500 tabular-nums">{member.totalClicks} clicks</span>
                    <span className="text-slate-400 tabular-nums">{member.totalEngaged} engaged</span>
                  </>
                )}
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
                  disabled={busyKey === member.key}
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
