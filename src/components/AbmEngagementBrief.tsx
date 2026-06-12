import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Target } from 'lucide-react';
import { isClosedWonAccount, mentionsClosedWonAccount } from '../lib/abmSuppression';

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

interface RecommendedAction {
  priority: number;
  account: string;
  action: string;
  why: string;
  next_step: string;
}

interface BriefContent {
  headline?: string;
  overlap_note?: string;
  methodology_notes?: string[];
  segments?: Segment[];
  sources_note?: string;
  key_takeaways?: string[];
  accuracy_flags?: AccuracyFlag[];
  recommended_actions?: RecommendedAction[];
}

interface BriefRow {
  period_label: string;
  view_window: string;
  generated_at: string;
  content: BriefContent;
}

const FALLBACK_BRIEF: BriefRow = {
  period_label: '2026-06 · Last 30 Days',
  view_window: 'Last 30 Days',
  generated_at: '2026-06-12T15:56:10.094325+00:00',
  content: {
    headline: 'Site engagement is real but concentrated in the mega-caps that already know McKesson. They are either monitoring (Gilead, on press releases) or running one serious diligence crawl (Amgen). The true pipeline-window Late-Stage biotechs are being reached by campaigns but are not yet showing up on-site.',
    overlap_note: 'On-Market and Late-Stage overlap. Five accounts (Novartis, Johnson & Johnson, Gilead Sciences, Genentech, Amgen) sit in both segment lists. Every On-Market account currently active on the site is one of those five, so the On-Market on-site cohort is fully contained inside the Late-Stage cohort. They are reported in both places because that is how 6sense counts them, but they are the same five companies.',
    segments: [
      {
        name: 'On-Market',
        segment_size: 19,
        on_site: 5,
        on_site_pct: 26,
        on_site_accounts: ['Novartis', 'Johnson & Johnson', 'Gilead Sciences', 'Genentech', 'Amgen'],
        shared_note: 'All five are mega-caps that also live in Late-Stage. None of the On-Market-only accounts (Sarepta, BioMarin, Krystal, Vericel, CSL, Abeona, and others) have shown site activity.',
        account_behaviors: [
          { account: 'Gilead Sciences', summary: '42 events across 16 sessions, mostly single-page. Highest total volume and the most persistent returner.', signal: 'Monitoring behavior; likely press-release tracking.' },
          { account: 'Novartis', summary: '12 events across 4 sessions and 3 pages. Moderate depth and recurring visits.', signal: 'Most balanced On-Market engagement profile.' },
          { account: 'Amgen', summary: '24 events in one session across 9 pages with zero bounce.', signal: 'Deepest individual visit in the dataset.' },
          { account: 'Johnson & Johnson / Genentech', summary: 'Short, shallow visits with high bounce.', signal: 'Present, but not yet exploring.' },
        ],
        top_pages: [
          { page: 'Homepage', accounts: 5, events: 31, sessions: 10 },
          { page: 'Kite CAR-T Distribution Partnership press release', accounts: 2, events: 7, sessions: 4 },
          { page: 'About Us / Our Team', accounts: 2, events: 3, sessions: 2 },
          { page: 'InspiroCare Patient Services', accounts: 1, events: 6, sessions: 1 },
          { page: 'Press Releases index', accounts: 1, events: 28, sessions: 13 },
        ],
        page_note: 'The homepage is the common entry point. The 28-event burst on the press-release index is one account returning thirteen times, consistent with the Gilead monitoring pattern.',
        campaigns: [
          { name: 'Awareness_OnMarket_0626', reach_pct: 100 },
          { name: 'Consideration: Specialty Pharmacy Article 1 · Lead Gen · Image V2', reach_pct: 84 },
          { name: 'Awareness_LateStage_0626', reach_pct: 78 },
          { name: 'Awareness: CGT Report Animation · Video', reach_pct: 57 },
          { name: 'Consideration: Specialty Pharmacy Article 1 · Lead Gen · Image', reach_pct: 57 },
        ],
        bombora: [
          { topic: 'Drug Development', score: 6 },
          { topic: 'Clinical Trials', score: 5 },
          { topic: 'Cold Chain', score: 3 },
          { topic: 'Biologics Drug Development', score: 3 },
          { topic: 'Pharmaceutical Distribution', score: 2 },
          { topic: 'Patient Services', score: 1 },
          { topic: 'Cell Therapy Manufacturing', score: 1 },
        ],
        keyword_note: 'The On-Market keyword panel was not in the source export, so no search terms are available for this segment.',
      },
      {
        name: 'Late-Stage',
        segment_size: 68,
        on_site: 8,
        on_site_pct: 12,
        on_site_accounts: ['Novartis', 'Johnson & Johnson', 'Gilead Sciences', 'Genentech', 'Amgen', 'AbbVie', 'Legend Biotech', 'University of California Los Angeles'],
        shared_note: 'Five accounts are shared with On-Market; three are Late-Stage-only: AbbVie, Legend Biotech, and UCLA.',
        channel_mix: 'Website 8 · 6sense Media Campaigns 65 · B2B Network 34 · External 0',
        account_behaviors: [
          { account: 'Amgen', summary: '24 events in a single session across 9 pages, zero bounce. One person did a thorough end-to-end crawl of the site in one sitting.', signal: 'Strongest individual buying-signal session in the dataset.' },
          { account: 'Gilead Sciences', summary: '42 events across 16 sessions, 81% bounce, returns repeatedly, mostly the press-release page.', signal: 'Monitoring behavior. High volume, low depth.' },
          { account: 'Novartis', summary: '12 events, 4 sessions, 3 pages, returns once.', signal: 'Moderate and recurring.' },
          { account: 'Legend Biotech', summary: '4 events, 1 session, 2 pages, zero bounce.', signal: 'Small but genuine engaged visit, not a bounce.' },
          { account: 'J&J, Genentech, AbbVie, UCLA', summary: '2 to 7 events each, mostly single-page bounces.', signal: 'Light engagement.' },
        ],
        top_pages: [
          { page: 'Homepage', accounts: 6, events: 33 },
          { page: 'CGT Report', accounts: 3, events: 4 },
          { page: 'InspiroCare Patient Services', accounts: 2, events: 8 },
          { page: 'Kite CAR-T partnership press release', accounts: 2, events: 7 },
          { page: 'About Us / Our Team', accounts: 2, events: 3 },
          { page: 'Press Releases index', accounts: 1, events: 28 },
        ],
        page_note: 'The CGT Report is the gateway asset doing its job, and it only surfaces in Late-Stage, not On-Market.',
        campaigns: [
          { name: 'Awareness_LateStage_0626', reach_pct: 95 },
          { name: 'Consideration: Specialty Pharmacy Article 1 · Lead Gen · Image V2', reach_pct: 64 },
          { name: 'Consideration: Specialty Pharmacy Article 1 · Lead Gen · Image', reach_pct: 55 },
          { name: 'Awareness: CGT Report Animation · Video', reach_pct: 52 },
          { name: 'Awareness: Awareness Videos · Video', reach_pct: 50 },
        ],
        bombora: [
          { topic: 'Drug Development', score: 9 },
          { topic: 'Clinical Trials', score: 8 },
          { topic: 'Cell Therapy Manufacturing', score: 6 },
          { topic: 'Cold Chain', score: 5 },
          { topic: 'Patient Services', score: 4 },
          { topic: 'Biologics Drug Development', score: 4 },
          { topic: 'Pharmaceutical Distribution', score: 3 },
        ],
        keywords: [
          { term: 'Cell gene therapy', score: 26 },
          { term: 'biotechnology therapeutics', score: 11 },
          { term: 'cell and gene therapy', score: 9 },
          { term: 'cgt commercialization', score: 5 },
          { term: 'InspiroGene (branded)', score: 1 },
        ],
        keyword_note: 'Generic, category-level terms dominate. Only one branded search across the segment: demand is category-level, not brand-level.',
      },
    ],
    key_takeaways: [
      'Route Amgen first. Its single deep crawl is the clearest buying signal in the dataset.',
      'Treat Gilead as monitoring behavior. It is engaged, but the pattern looks like press-release watching rather than buying exploration.',
      'Use the CGT Report and InspiroCare Patient Services as conversion paths from category research into branded consideration.',
      'Smaller, true pipeline-window Late-Stage biotechs are reached by campaigns but are not yet showing on-site engagement.',
    ],
    recommended_actions: [
      {
        priority: 1,
        account: 'Amgen',
        action: 'Route to sales / BD first',
        why: 'One uninterrupted 9-page crawl with zero bounce is the clearest buying-signal behavior in the report.',
        next_step: 'Follow up with CGT commercialization, distribution, and patient-services messaging tied to the pages viewed.',
      },
      {
        priority: 2,
        account: 'Gilead Sciences',
        action: 'Monitor and map contacts',
        why: 'High event/session volume appears concentrated on press-release monitoring, which signals attention but not necessarily active buying.',
        next_step: 'Identify repeat visitors or known contacts, then use a softer update-oriented touch rather than a hard sales push.',
      },
      {
        priority: 3,
        account: 'Legend Biotech',
        action: 'Qualify as a pipeline-window target',
        why: 'Late-Stage-only account with a small but real engaged visit and direct CGT relevance.',
        next_step: 'Check current tracker fit, therapy timing, and U.S. commercialization needs before moving into active outreach.',
      },
      {
        priority: 4,
        account: 'On-Market-only biotechs',
        action: 'Do not over-prioritize yet',
        why: 'Sarepta, BioMarin, Krystal, Vericel, CSL, Abeona, and peers are being reached but did not show site activity this window.',
        next_step: 'Keep campaigns running, but wait for website or content engagement before escalating.',
      },
    ],
    accuracy_flags: [
      { label: 'UCLA segment hygiene', detail: 'UCLA is sitting in the Late-Stage biopharma audience but is an academic center, not a sponsor. Clean this up before external use.' },
      { label: 'Category-to-brand gap', detail: 'Only one branded search across the Late-Stage segment. Frame this as category demand, not brand demand.' },
      { label: 'Overlap double count', detail: 'On-Market and Late-Stage site numbers overlap. Combined totals need a footnote.' },
    ],
    sources_note: 'Site traffic splits between google.com and direct inspirogene.com, with Google the top UTM source ahead of LinkedIn and 6sense.',
    methodology_notes: [
      'All figures are Last 30 Days.',
      'Page-level and account-level exports are separate cuts, so page-to-account joins are only certain where the math forces it. Inferences are flagged.',
    ],
  },
};

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
  const [brief, setBrief] = useState<BriefRow>(FALLBACK_BRIEF);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('cgt_abm_engagement_brief')
        .select('period_label, view_window, generated_at, content')
        .eq('is_published', true)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) console.warn('Could not load ABM engagement brief; using bundled latest report.', error.message);
      setBrief(enrichBrief(data as BriefRow | null));
    })();
  }, []);

  const c = brief.content;
  const segments = (c.segments ?? []).filter(seg => (seg.account_behaviors?.length ?? 0) > 0);
  if (segments.length === 0) return null;

  return (
    <section className="reveal reveal-delay-3">
      <header className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <span className="prestige-eyebrow prestige-eyebrow-light">
            <Target className="w-3 h-3" />
            ABM
          </span>
          <h2 className="prestige-section-title mt-3">Account engagement detail</h2>
        </div>
        <div className="text-xs text-slate-400">{brief.period_label}</div>
      </header>

      <div className="prestige-card overflow-hidden">
        <div className="divide-y divide-slate-100">
          {segments.map(seg => {
            const a = accent(seg.name);
            return (
              <div key={seg.name}>
                <div className="px-6 py-2.5 bg-slate-50/80 flex items-center justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-widest ${a.ring}`}>{seg.name}</span>
                  <span className="text-xs text-slate-400">{seg.on_site} of {seg.segment_size} on-site · {seg.on_site_pct}%</span>
                </div>
                {(seg.account_behaviors ?? []).map((b, i) => (
                  <div key={i} className="px-6 py-4 flex items-start justify-between gap-6 hover:bg-slate-50/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-slate-900">{b.account}</div>
                      <div className="text-sm text-slate-600 mt-1 leading-relaxed">{b.summary}</div>
                    </div>
                    <div className="text-xs text-slate-500 text-right max-w-xs flex-shrink-0 leading-relaxed">{b.signal}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {(c.methodology_notes?.length ?? 0) > 0 && (
        <p className="text-xs text-slate-400 leading-relaxed mt-3">{c.methodology_notes!.join(' ')}</p>
      )}
    </section>
  );
}

function enrichBrief(row: BriefRow | null): BriefRow {
  if (!row?.content?.segments?.length) {
    return { ...FALLBACK_BRIEF, content: suppressClosedWonBriefContent(FALLBACK_BRIEF.content) };
  }

  const fallbackBySegment = new Map((FALLBACK_BRIEF.content.segments || []).map(seg => [seg.name, seg]));
  const content: BriefContent = {
    ...FALLBACK_BRIEF.content,
    ...row.content,
    recommended_actions: row.content.recommended_actions?.length
      ? row.content.recommended_actions
      : FALLBACK_BRIEF.content.recommended_actions,
    key_takeaways: row.content.key_takeaways?.length
      ? row.content.key_takeaways
      : FALLBACK_BRIEF.content.key_takeaways,
    segments: row.content.segments.map(seg => {
      const fallback = fallbackBySegment.get(seg.name);
      if (!fallback) return seg;
      return {
        ...fallback,
        ...seg,
        account_behaviors: seg.account_behaviors?.length ? seg.account_behaviors : fallback.account_behaviors,
        top_pages: seg.top_pages?.length ? seg.top_pages : fallback.top_pages,
        campaigns: seg.campaigns?.length ? seg.campaigns : fallback.campaigns,
        bombora: seg.bombora?.length ? seg.bombora : fallback.bombora,
        keywords: seg.keywords?.length ? seg.keywords : fallback.keywords,
        keyword_note: seg.keyword_note || fallback.keyword_note,
        page_note: seg.page_note || fallback.page_note,
      };
    }),
  };

  return {
    ...FALLBACK_BRIEF,
    ...row,
    content: suppressClosedWonBriefContent(content),
  };
}

function suppressClosedWonBriefContent(content: BriefContent): BriefContent {
  const suppressionNote = 'Closed Won/client accounts are suppressed from active ABM recommendations and account-level reporting.';
  const overlap = [stripSuppressedSentences(content.overlap_note), suppressionNote].filter(Boolean).join(' ');

  return {
    ...content,
    headline: stripSuppressedSentences(content.headline) || 'Site engagement is real, but Closed Won/client accounts are suppressed from active ABM recommendations. Remaining engagement is ranked for fit, timing, and next-step actionability.',
    overlap_note: overlap,
    key_takeaways: content.key_takeaways?.filter(t => !mentionsClosedWonAccount(t)),
    recommended_actions: content.recommended_actions
      ?.filter(action => !isClosedWonAccount(action.account) && !mentionsClosedWonAccount(`${action.account} ${action.why} ${action.next_step}`))
      .map((action, index) => ({ ...action, priority: index + 1 })),
    accuracy_flags: content.accuracy_flags?.filter(flag => !mentionsClosedWonAccount(`${flag.label} ${flag.detail}`)),
    segments: content.segments?.map(seg => ({
      ...seg,
      on_site_accounts: seg.on_site_accounts?.filter(account => !isClosedWonAccount(account)) || [],
      shared_note: stripSuppressedSentences(seg.shared_note),
      page_note: stripSuppressedSentences(seg.page_note),
      account_behaviors: seg.account_behaviors?.filter(behavior => !isClosedWonAccount(behavior.account)),
    })),
  };
}

function stripSuppressedSentences(value?: string): string | undefined {
  if (!value) return value;
  const sentences = value.match(/[^.!?]+[.!?]?/g) || [value];
  return sentences
    .map(sentence => sentence.trim())
    .filter(sentence => sentence && !mentionsClosedWonAccount(sentence))
    .join(' ')
    .trim() || undefined;
}
