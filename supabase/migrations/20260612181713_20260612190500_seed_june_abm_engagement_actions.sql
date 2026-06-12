/*
  # Seed June ABM engagement actions

  Stores the actionable data extracted from the June 2026 InspiroGene Audience
  Engagement Intelligence report as structured JSON. This is intentionally data
  only; React renders it from cgt_abm_engagement_brief.content.
*/

INSERT INTO public.cgt_abm_engagement_brief (
  period_label,
  view_window,
  content,
  is_published,
  generated_at
)
VALUES (
  '2026-06 · Last 30 Days',
  'Last 30 Days',
  $json$
  {
    "headline": "Site engagement is real but concentrated in the mega-caps that already know McKesson. They are either monitoring (Gilead, on press releases) or running one serious diligence crawl (Amgen). The true pipeline-window Late-Stage biotechs are being reached by campaigns but are not yet showing up on-site.",
    "overlap_note": "On-Market and Late-Stage overlap. Five accounts (Novartis, Johnson & Johnson, Gilead Sciences, Genentech, Amgen) sit in both segment lists. Every On-Market account currently active on the site is one of those five, so the On-Market on-site cohort is fully contained inside the Late-Stage cohort. They are reported in both places because that is how 6sense counts them, but they are the same five companies.",
    "segments": [
      {
        "name": "On-Market",
        "segment_size": 19,
        "on_site": 5,
        "on_site_pct": 26,
        "on_site_accounts": ["Novartis", "Johnson & Johnson", "Gilead Sciences", "Genentech", "Amgen"],
        "shared_note": "All five are mega-caps that also live in Late-Stage. None of the On-Market-only accounts (Sarepta, BioMarin, Krystal, Vericel, CSL, Abeona, and others) have shown site activity.",
        "account_behaviors": [
          {
            "account": "Gilead Sciences",
            "summary": "42 events across 16 sessions, mostly single-page. Highest total volume and most persistent returner in the On-Market cohort.",
            "signal": "Monitoring behavior; likely press-release tracking rather than immediate buying exploration."
          },
          {
            "account": "Novartis",
            "summary": "12 events across 4 sessions and 3 pages. Moderate depth and recurring visits.",
            "signal": "Balanced engagement profile; keep in nurture and watch for repeat visits to CGT content."
          },
          {
            "account": "Amgen",
            "summary": "24 events in one session across 9 pages with zero bounce.",
            "signal": "Deepest individual visit in the dataset; route for near-term follow-up."
          },
          {
            "account": "Johnson & Johnson / Genentech",
            "summary": "Short, shallow visits with high bounce.",
            "signal": "Present but not yet exploring; keep in awareness/nurture until depth improves."
          }
        ],
        "top_pages": [
          { "page": "Homepage", "accounts": 5, "events": 31, "sessions": 10 },
          { "page": "Kite CAR-T Distribution Partnership press release", "accounts": 2, "events": 7, "sessions": 4 },
          { "page": "About Us / Our Team", "accounts": 2, "events": 3, "sessions": 2 },
          { "page": "InspiroCare Patient Services", "accounts": 1, "events": 6, "sessions": 1 },
          { "page": "Press Releases index", "accounts": 1, "events": 28, "sessions": 13 }
        ],
        "page_note": "The homepage is the common entry point. The 28-event burst on the press-release index is one account returning thirteen times, consistent with the Gilead monitoring pattern.",
        "campaigns": [
          { "name": "Awareness_OnMarket_0626", "reach_pct": 100 },
          { "name": "Consideration | Specialty Pharmacy Article 1 | Lead Gen | Image V2", "reach_pct": 84 },
          { "name": "Awareness_LateStage_0626", "reach_pct": 78 },
          { "name": "Awareness | CGT Report Animation | Video", "reach_pct": 57 },
          { "name": "Consideration | Specialty Pharmacy Article 1 | Lead Gen | Image", "reach_pct": 57 }
        ],
        "bombora": [
          { "topic": "Drug Development", "score": 6 },
          { "topic": "Clinical Trials", "score": 5 },
          { "topic": "Cold Chain", "score": 3 },
          { "topic": "Biologics Drug Development", "score": 3 },
          { "topic": "Pharmaceutical Distribution", "score": 2 },
          { "topic": "Patient Services", "score": 1 },
          { "topic": "Cell Therapy Manufacturing", "score": 1 }
        ],
        "keywords": [],
        "keyword_note": "The On-Market keyword panel was not in the source export, so no search terms are available for this segment."
      },
      {
        "name": "Late-Stage",
        "segment_size": 68,
        "on_site": 8,
        "on_site_pct": 12,
        "on_site_accounts": ["Novartis", "Johnson & Johnson", "Gilead Sciences", "Genentech", "Amgen", "AbbVie", "Legend Biotech", "University of California Los Angeles"],
        "shared_note": "Five accounts are shared with On-Market (Novartis, J&J, Gilead, Genentech, Amgen); three are Late-Stage-only: AbbVie, Legend Biotech, and UCLA.",
        "channel_mix": "Website 8 · 6sense Media Campaigns 65 · B2B Network 34 · External 0",
        "account_behaviors": [
          {
            "account": "Amgen",
            "summary": "24 events in a single session across 9 pages, zero bounce. One person did a thorough end-to-end crawl of the site in one sitting.",
            "signal": "Strongest individual buying-signal session in the dataset."
          },
          {
            "account": "Gilead Sciences",
            "summary": "42 events across 16 sessions, 81% bounce, returns repeatedly, mostly the press-release page.",
            "signal": "Monitoring behavior. High volume, low depth."
          },
          {
            "account": "Novartis",
            "summary": "12 events, 4 sessions, 3 pages, returns once.",
            "signal": "Moderate and recurring."
          },
          {
            "account": "Legend Biotech",
            "summary": "4 events, 1 session, 2 pages, zero bounce.",
            "signal": "Small but genuine engaged visit, not a bounce."
          },
          {
            "account": "J&J, Genentech, AbbVie, UCLA",
            "summary": "2 to 7 events each, mostly single-page bounces.",
            "signal": "Light engagement."
          }
        ],
        "top_pages": [
          { "page": "Homepage", "accounts": 6, "events": 33 },
          { "page": "CGT Report", "accounts": 3, "events": 4 },
          { "page": "InspiroCare Patient Services", "accounts": 2, "events": 8 },
          { "page": "Kite CAR-T partnership press release", "accounts": 2, "events": 7 },
          { "page": "About Us / Our Team", "accounts": 2, "events": 3 },
          { "page": "Press Releases index", "accounts": 1, "events": 28 }
        ],
        "page_note": "The CGT Report is the gateway asset doing its job, and it only surfaces in Late-Stage, not On-Market. Single hits also appear on Commercializing CGT: Four Keys to Success, Services and Solutions, Specialty Distribution, Third Party Logistics, Site Map, and Contact.",
        "campaigns": [
          { "name": "Awareness_LateStage_0626", "reach_pct": 95 },
          { "name": "Consideration | Specialty Pharmacy Article 1 | Lead Gen | Image V2", "reach_pct": 64 },
          { "name": "Consideration | Specialty Pharmacy Article 1 | Lead Gen | Image", "reach_pct": 55 },
          { "name": "Awareness | CGT Report Animation | Video", "reach_pct": 52 },
          { "name": "Awareness | Awareness Videos | Video", "reach_pct": 50 }
        ],
        "bombora": [
          { "topic": "Drug Development", "score": 9 },
          { "topic": "Clinical Trials", "score": 8 },
          { "topic": "Cell Therapy Manufacturing", "score": 6 },
          { "topic": "Cold Chain", "score": 5 },
          { "topic": "Patient Services", "score": 4 },
          { "topic": "Biologics Drug Development", "score": 4 },
          { "topic": "Pharmaceutical Distribution", "score": 3 }
        ],
        "keywords": [
          { "term": "Cell gene therapy", "score": 26 },
          { "term": "biotechnology therapeutics", "score": 11 },
          { "term": "cell and gene therapy", "score": 9 },
          { "term": "cgt commercialization", "score": 5 },
          { "term": "InspiroGene (branded)", "score": 1 }
        ],
        "keyword_note": "Generic, category-level terms dominate. Only one branded search across the Late-Stage segment: demand is category-level, not brand-level."
      }
    ],
    "recommended_actions": [
      {
        "priority": 1,
        "account": "Amgen",
        "action": "Route to sales / BD first",
        "why": "One uninterrupted 9-page crawl with zero bounce is the clearest buying-signal behavior in the report.",
        "next_step": "Follow up with CGT commercialization, distribution, and patient-services messaging tied to the pages viewed."
      },
      {
        "priority": 2,
        "account": "Gilead Sciences",
        "action": "Monitor and map contacts",
        "why": "High event/session volume appears concentrated on press-release monitoring, which signals attention but not necessarily active buying.",
        "next_step": "Identify repeat visitors or known contacts, then use a softer update-oriented touch rather than a hard sales push."
      },
      {
        "priority": 3,
        "account": "Legend Biotech",
        "action": "Qualify as a pipeline-window target",
        "why": "Late-Stage-only account with a small but real engaged visit and direct CGT relevance.",
        "next_step": "Check current tracker fit, therapy timing, and U.S. commercialization needs before moving into active outreach."
      },
      {
        "priority": 4,
        "account": "On-Market-only biotechs",
        "action": "Do not over-prioritize yet",
        "why": "Sarepta, BioMarin, Krystal, Vericel, CSL, Abeona, and peers are being reached but did not show site activity this window.",
        "next_step": "Keep campaigns running, but wait for website or content engagement before escalating."
      }
    ],
    "key_takeaways": [
      "Route Amgen first. Its single deep crawl is the clearest buying signal in the dataset.",
      "Treat Gilead as monitoring behavior. It is engaged, but the pattern looks like press-release watching rather than buying exploration.",
      "Use the CGT Report and InspiroCare Patient Services as conversion paths from category research into branded consideration.",
      "Smaller, true pipeline-window Late-Stage biotechs are reached by campaigns but are not yet showing on-site engagement."
    ],
    "accuracy_flags": [
      {
        "label": "UCLA segment hygiene",
        "detail": "UCLA is sitting in the Late-Stage biopharma audience but is an academic center, not a sponsor. Clean this up before external use."
      },
      {
        "label": "Category-to-brand gap",
        "detail": "Only one branded search across the Late-Stage segment. Frame this as category demand, not brand demand."
      },
      {
        "label": "Overlap double count",
        "detail": "On-Market and Late-Stage site numbers overlap. Combined totals need a footnote."
      }
    ],
    "sources_note": "Site traffic splits between google.com and direct inspirogene.com, with Google the top UTM source ahead of LinkedIn and 6sense.",
    "methodology_notes": [
      "All figures are Last 30 Days.",
      "Page-level and account-level exports are separate cuts, so page-to-account joins are only certain where the math forces it. Inferences are flagged."
    ],
    "data_note": "Structured data extracted from the June 2026 InspiroGene Audience Engagement Intelligence report. The original uploaded HTML formatting is not required by the app."
  }
  $json$::jsonb,
  true,
  '2026-06-12T15:56:10.094325+00'::timestamptz
)
ON CONFLICT (period_label)
DO UPDATE SET
  view_window = EXCLUDED.view_window,
  content = EXCLUDED.content,
  is_published = true,
  generated_at = EXCLUDED.generated_at;
