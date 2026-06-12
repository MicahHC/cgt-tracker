import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Target, Users, Layers, AlertTriangle, Flame, Search as SearchIcon,
  FileText, Megaphone, Building2, Sparkles, Link2,
} from 'lucide-react';

interface PageHit {
  page: string;
  accounts: number;
  events: number;
  sessions?: number;
}

interface CampaignReach {
  name: string;
  reach_pct: number;
}

interface IntentTopic {
  topic: string;
  score: number;
}

interface IntentKeyword {
  term: string;
  score: number;
}

interface AccountBehavior {
  account: string;
  summary: string;
  signal: string;
}

interface Segment {
  name: string;
  segment_size: number;
  on_site: number;
  on_site_pct: number;
  on_site_accounts: string[];
  shared_note?: string;
  channel_mix?: string;
  account_behaviors?: AccountBehavior[];
  top_pages?: PageHit[];
  page_note?: string;
  campaigns?: CampaignReach[];
  bombora?: IntentTopic[];
  keywords?: IntentKeyword[];
  keyword_note?: string;
}

interface AccuracyFlag {
  label: string;
  detail: string;
}

interface BriefContent {
  headline?: string;
  overlap_note?: string;
  methodology_notes?: string[];
  segments?: Segment[];
  sources_note?: string;
  key_takeaways?: string[];
  accuracy_flags?: AccuracyFlag[];
}

interface BriefRow {
  period_label: string;
  view_window: string;
  generated_at: string;
  content: BriefContent;
}

const SEGMENT_ACCENT: Record<string, { bar: string; chip: string; ring: string }> = {
  'On-Market': { bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: 'text-emerald-600' },
  'Late-Stage': { bar: 'bg-teal-500', chip: 'bg-teal-50 text-teal-700 border-teal-200', ring: 'text-teal-600' },
  'Early Stage': { bar: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 border-sky-200', ring: 'text-sky-600' },
  default: { bar: 'bg-slate-500', chip: 'bg-slate-50 text-slate-700 border-slate-200', ring: 'text-slate-600' },
};

function accent(name: string) {
  return SEGMENT_ACCENT[name] || SEGMENT_ACCENT.default;
}

export function AbmEngagementBrief() {
  const [brief, setBrief] = useState<BriefRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('cgt_abm_engagement_brief')
        .select('period_label, view_window, generated_at, content')
        .eq('is_published', true)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setBrief((data as BriefRow | null) ?? null);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="prestige-card p-10 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (!brief || !brief.content?.segments?.length) {
    return (
      <div className="prestige-card p-10 text-center">
        <Target className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <div className="text-slate-700 font-medium">No engagement brief published yet</div>
        <p className="text-sm text-slate-500 mt-1">The latest 6sense ABM report will appear here once it is loaded.</p>
      </div>
    );
  }

  const c = brief.content;
  const generated = new Date(brief.generated_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <section className="reveal reveal-delay-3 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="prestige-eyebrow prestige-eyebrow-light">
            <Target className="w-3 h-3" />
            ABM Engagement
          </span>
          <h2 className="prestige-section-title mt-3">Account engagement brief</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">
            How our target audiences are engaging across the site, campaigns, and intent data.
          </p>
        </div>
        <div className="text-xs text-slate-500 text-right">
          <div className="font-semibold uppercase tracking-wider">{brief.view_window}</div>
          <div>{generated}</div>
        </div>
      </header>

      {c.headline && (
        <div className="prestige-card p-6 border-l-4 border-l-teal-500">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
            <p className="text-[15px] text-slate-800 leading-relaxed">{c.headline}</p>
          </div>
        </div>
      )}

      {c.overlap_note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-2.5">
            <Link2 className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-amber-800">Read this first · segment overlap</div>
              <p className="text-sm text-amber-900 mt-1 leading-relaxed">{c.overlap_note}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {c.segments!.map(seg => (
          <SegmentCard key={seg.name} seg={seg} />
        ))}
      </div>

      {c.key_takeaways && c.key_takeaways.length > 0 && (
        <div className="prestige-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-600">What it means</h3>
          </div>
          <ul className="space-y-2.5">
            {c.key_takeaways.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
                {t}
              </li>
            ))}
          </ul>
          {c.sources_note && (
            <p className="text-xs text-slate-500 mt-4 pt-4 border-t border-slate-100">{c.sources_note}</p>
          )}
        </div>
      )}

      {c.accuracy_flags && c.accuracy_flags.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600">Accuracy flags before this goes external</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {c.accuracy_flags.map((f, i) => (
              <div key={i} className="rounded-lg bg-white border border-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-800">{f.label}</div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{f.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {c.methodology_notes && c.methodology_notes.length > 0 && (
        <p className="text-xs text-slate-400 leading-relaxed">
          {c.methodology_notes.join(' ')}
        </p>
      )}
    </section>
  );
}

function SegmentCard({ seg }: { seg: Segment }) {
  const a = accent(seg.name);
  return (
    <div className="prestige-card overflow-hidden flex flex-col">
      <div className={`h-1 w-full ${a.bar}`} />
      <div className="p-6 space-y-5 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className={`w-4 h-4 ${a.ring}`} />
              <h3 className="text-lg font-bold text-slate-900">{seg.name}</h3>
            </div>
            {seg.channel_mix && <p className="text-xs text-slate-500 mt-1">{seg.channel_mix}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatBox label="In segment" value={seg.segment_size} />
          <StatBox label="On the site" value={seg.on_site} accent={a.ring} />
          <StatBox label="On-site rate" value={`${seg.on_site_pct}%`} />
        </div>

        {seg.on_site_accounts?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">On the site</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seg.on_site_accounts.map(name => (
                <span key={name} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${a.chip}`}>{name}</span>
              ))}
            </div>
            {seg.shared_note && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{seg.shared_note}</p>}
          </div>
        )}

        {seg.account_behaviors && seg.account_behaviors.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Account behavior</span>
            </div>
            <div className="space-y-2">
              {seg.account_behaviors.map((b, i) => (
                <div key={i} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                  <div className="text-sm font-semibold text-slate-800">{b.account}</div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{b.summary}</p>
                  <p className="text-xs font-medium text-teal-700 mt-1">{b.signal}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {seg.top_pages && seg.top_pages.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Top pages</span>
            </div>
            <div className="space-y-1">
              {seg.top_pages.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-sm py-1 border-b border-slate-50 last:border-0">
                  <span className="text-slate-700 truncate">{p.page}</span>
                  <span className="text-xs text-slate-500 flex-shrink-0 font-mono">
                    {p.accounts} acct · {p.events} ev{p.sessions ? ` · ${p.sessions} sess` : ''}
                  </span>
                </div>
              ))}
            </div>
            {seg.page_note && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{seg.page_note}</p>}
          </div>
        )}

        {seg.campaigns && seg.campaigns.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Megaphone className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Campaign reach</span>
            </div>
            <div className="space-y-2">
              {seg.campaigns.map((cp, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-600 truncate">{cp.name}</span>
                    <span className="font-semibold text-slate-800 flex-shrink-0">{cp.reach_pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full ${a.bar}`} style={{ width: `${Math.min(100, cp.reach_pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {seg.keywords && seg.keywords.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <SearchIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">What they search</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seg.keywords.map((k, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
                  {k.term} <span className="text-slate-400">·{k.score}</span>
                </span>
              ))}
            </div>
            {seg.keyword_note && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{seg.keyword_note}</p>}
          </div>
        )}

        {(!seg.keywords || seg.keywords.length === 0) && seg.keyword_note && (
          <p className="text-xs text-slate-400 italic leading-relaxed">{seg.keyword_note}</p>
        )}

        {seg.bombora && seg.bombora.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Flame className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Intent surge (Bombora)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seg.bombora.map((t, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-700 border border-orange-100">
                  {t.topic} <span className="text-orange-400">·{t.score}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, accent: accentColor }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
      <div className={`text-2xl font-bold ${accentColor || 'text-slate-900'}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}
