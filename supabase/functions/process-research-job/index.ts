import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface CompanyInfo {
  name: string;
  indication: string;
  phase: string;
  trial_id?: string;
  website?: string;
  therapeutic_area?: string;
}

interface TrialRecord {
  nctId: string;
  phase: string;
  normalizedPhase: string;
  status: string;
  studyType: string;
  primaryCompletionDate: string | null;
  enrollmentCount: number;
  title: string;
  sponsorName: string;
  conditions: string[];
  commercialRank: number;
}

interface DesignationEntry {
  label: string;
  source: string;
}

interface ScoringOutput {
  tier: string;
  totalScore: number;
  baseScore: number;
  clinicalStrengthDeduction: number;
  clinicalStrengthRationale: string;
  regulatoryMomentumDeduction: number;
  regulatoryMomentumRationale: string;
  financialStabilityDeduction: number;
  financialStabilityRationale: string;
  competitiveIntensityDeduction: number;
  competitiveIntensityRationale: string;
  dataConfidence: "high" | "medium" | "low";
  commercializationInsight: string;
  anchorTrialId: string | null;
  anchorTrialPhase: string | null;
  anchorPrimaryCompletion: string | null;
  filingTargetDate: string | null;
  designationsDetail: DesignationEntry[];
  missingFields: string[];
  bluntCallout: string;
  allTrialsConsidered: number;
  pipelineTrials: {
    nctId: string;
    phase: string;
    status: string;
    title: string;
    primaryCompletionDate: string | null;
  }[];
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 1: Multi-trial discovery via ClinicalTrials.gov sponsor search
// ────────────────────────────────────────────────────────────────────────────

function buildSponsorAliases(companyName: string): string[] {
  const aliases = [companyName];
  const lower = companyName.toLowerCase();

  const suffixes = [
    ", inc.",
    ", inc",
    " inc.",
    " inc",
    ", llc",
    " llc",
    ", ltd",
    " ltd",
    ", ltd.",
    " ltd.",
    " corporation",
    " corp.",
    " corp",
    " therapeutics",
    " biosciences",
    " pharmaceuticals",
    " pharma",
    " biotech",
    " sciences",
    " medical",
    " biotherapeutics",
    ", s.a.",
    " s.a.",
    " sa",
    " ag",
    " plc",
    " co.",
    " co",
    " gmbh",
  ];

  for (const suffix of suffixes) {
    if (lower.endsWith(suffix)) {
      aliases.push(companyName.slice(0, -suffix.length).trim());
    }
  }

  if (!suffixes.some((s) => lower.endsWith(s))) {
    aliases.push(`${companyName}, Inc.`);
    aliases.push(`${companyName} Inc.`);
  }

  return [...new Set(aliases)];
}

function normalizePhase(phases: string[]): string {
  if (!phases || phases.length === 0) return "Unknown";

  const has = (p: string) => phases.includes(p);

  if (has("PHASE3")) return "Phase III";
  if (has("PHASE2") && has("PHASE3")) return "Phase II/III";
  if (has("PHASE2")) return "Phase II";
  if (has("PHASE1") && has("PHASE2")) return "Phase I/II";
  if (has("PHASE1") || has("EARLY_PHASE1")) return "Phase I";
  if (has("PHASE4")) return "Phase IV";

  return "Unknown";
}

function phaseIsAtLeast3(normalizedPhase: string): boolean {
  return ["Phase III", "Phase II/III"].includes(normalizedPhase);
}

function phaseIsAtLeast2(normalizedPhase: string): boolean {
  return ["Phase III", "Phase II/III", "Phase II", "Phase I/II"].includes(
    normalizedPhase
  );
}

function computeCommercialRank(trial: {
  normalizedPhase: string;
  studyType: string;
  status: string;
  primaryCompletionDate: string | null;
  enrollmentCount: number;
}): number {
  let rank = 0;

  const phaseScores: Record<string, number> = {
    "Phase III": 100,
    "Phase II/III": 95,
    "Phase II": 60,
    "Phase I/II": 40,
    "Phase I": 20,
    "Phase IV": 10,
    Unknown: 0,
  };
  rank += phaseScores[trial.normalizedPhase] || 0;

  if (trial.studyType === "INTERVENTIONAL") rank += 20;

  if (trial.primaryCompletionDate) {
    rank += 15;
    const months = monthsUntil(trial.primaryCompletionDate);
    if (months !== null && months <= 24) rank += 15;
    if (months !== null && months <= 12) rank += 10;
  }

  const goodStatuses = [
    "COMPLETED",
    "ACTIVE_NOT_RECRUITING",
    "RECRUITING",
    "ENROLLING_BY_INVITATION",
  ];
  if (goodStatuses.includes(trial.status.toUpperCase().replace(/ /g, "_")))
    rank += 10;

  if (trial.enrollmentCount > 200) rank += 10;
  else if (trial.enrollmentCount > 50) rank += 5;

  return rank;
}

function monthsUntil(dateStr: string): number | null {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    return Math.round(
      (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
  } catch {
    return null;
  }
}

async function fetchAllSponsorTrials(
  companyName: string
): Promise<TrialRecord[]> {
  const aliases = buildSponsorAliases(companyName);
  const seen = new Set<string>();
  const allTrials: TrialRecord[] = [];

  for (const alias of aliases) {
    try {
      const url = new URL("https://clinicaltrials.gov/api/v2/studies");
      url.searchParams.set("query.spons", alias);
      url.searchParams.set("pageSize", "50");
      url.searchParams.set(
        "fields",
        [
          "NCTId",
          "BriefTitle",
          "OverallStatus",
          "Phase",
          "StudyType",
          "PrimaryCompletionDate",
          "EnrollmentCount",
          "LeadSponsorName",
          "Condition",
        ].join(",")
      );

      console.log(`Fetching trials for sponsor alias: "${alias}"`);
      const resp = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!resp.ok) {
        console.error(`ClinicalTrials.gov error for "${alias}": ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const studies = data.studies || [];

      for (const study of studies) {
        const proto = study.protocolSection;
        if (!proto) continue;

        const nctId = proto.identificationModule?.nctId;
        if (!nctId || seen.has(nctId)) continue;
        seen.add(nctId);

        const rawPhases = proto.designModule?.phases || [];
        const normalizedPhase = normalizePhase(rawPhases);
        const status = proto.statusModule?.overallStatus || "UNKNOWN";
        const studyType = proto.designModule?.studyType || "UNKNOWN";
        const primaryCompletionDate =
          proto.statusModule?.primaryCompletionDateStruct?.date || null;
        const enrollmentCount =
          proto.designModule?.enrollmentInfo?.count || 0;
        const title = proto.identificationModule?.briefTitle || "";
        const sponsorName =
          proto.sponsorCollaboratorsModule?.leadSponsor?.name || alias;
        const conditions = proto.conditionsModule?.conditions || [];

        const trial: TrialRecord = {
          nctId,
          phase: rawPhases.join(", "),
          normalizedPhase,
          status,
          studyType,
          primaryCompletionDate,
          enrollmentCount,
          title,
          sponsorName,
          conditions,
          commercialRank: 0,
        };
        trial.commercialRank = computeCommercialRank(trial);
        allTrials.push(trial);
      }
    } catch (err) {
      console.error(`Error fetching trials for alias "${alias}":`, err);
    }
  }

  if (allTrials.length === 0) {
    console.log(
      "No sponsor-matched trials found, trying known trial_id fallback"
    );
  }

  allTrials.sort((a, b) => b.commercialRank - a.commercialRank);
  return allTrials;
}

async function fetchSingleTrial(trialId: string): Promise<TrialRecord | null> {
  try {
    const resp = await fetch(
      `https://clinicaltrials.gov/api/v2/studies/${trialId}`,
      { headers: { Accept: "application/json" } }
    );
    if (!resp.ok) return null;

    const data = await resp.json();
    const proto = data.protocolSection;
    if (!proto) return null;

    const rawPhases = proto.designModule?.phases || [];
    const trial: TrialRecord = {
      nctId: trialId,
      phase: rawPhases.join(", "),
      normalizedPhase: normalizePhase(rawPhases),
      status: proto.statusModule?.overallStatus || "UNKNOWN",
      studyType: proto.designModule?.studyType || "UNKNOWN",
      primaryCompletionDate:
        proto.statusModule?.primaryCompletionDateStruct?.date || null,
      enrollmentCount: proto.designModule?.enrollmentInfo?.count || 0,
      title: proto.identificationModule?.briefTitle || "",
      sponsorName:
        proto.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown",
      conditions: proto.conditionsModule?.conditions || [],
      commercialRank: 0,
    };
    trial.commercialRank = computeCommercialRank(trial);
    return trial;
  } catch {
    return null;
  }
}

function selectAnchorTrial(
  allTrials: TrialRecord[],
  knownTrialId?: string
): TrialRecord | null {
  if (allTrials.length === 0) return null;

  const validStatuses = [
    "ACTIVE_NOT_RECRUITING",
    "RECRUITING",
    "ENROLLING_BY_INVITATION",
    "NOT_YET_RECRUITING",
  ];

  const eligible = allTrials.filter((t) => {
    const statusOk = validStatuses.includes(
      t.status.toUpperCase().replace(/ /g, "_")
    );
    const rejected = ["WITHDRAWN", "TERMINATED", "SUSPENDED"].includes(
      t.status.toUpperCase()
    );
    return statusOk && !rejected;
  });

  if (eligible.length === 0) return allTrials[0];

  return eligible[0];
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2: Multi-source designation extraction
// ────────────────────────────────────────────────────────────────────────────

const DESIGNATION_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /breakthrough\s*therapy/i, label: "Breakthrough Therapy" },
  { pattern: /orphan\s*drug/i, label: "Orphan Drug" },
  { pattern: /fast\s*track/i, label: "Fast Track" },
  { pattern: /priority\s*review/i, label: "Priority Review" },
  { pattern: /accelerated\s*approval/i, label: "Accelerated Approval" },
  {
    pattern: /regenerative\s*medicine\s*advanced\s*therapy/i,
    label: "RMAT",
  },
  { pattern: /\bRMAT\b/, label: "RMAT" },
  { pattern: /rare\s*pediatric\s*disease/i, label: "Rare Pediatric Disease" },
];

function scanTextForDesignations(
  text: string,
  sourceName: string
): DesignationEntry[] {
  const results: DesignationEntry[] = [];
  for (const { pattern, label } of DESIGNATION_KEYWORDS) {
    if (pattern.test(text)) {
      results.push({ label, source: sourceName });
    }
  }
  return results;
}

function dedupeDesignations(entries: DesignationEntry[]): DesignationEntry[] {
  const seen = new Map<string, DesignationEntry>();
  const sourcePriority = ["SEC EDGAR", "Tavily Web Search", "Perplexity", "OpenFDA"];

  for (const entry of entries) {
    const existing = seen.get(entry.label);
    if (!existing) {
      seen.set(entry.label, entry);
    } else {
      const existingPriority = sourcePriority.indexOf(existing.source);
      const newPriority = sourcePriority.indexOf(entry.source);
      if (
        newPriority >= 0 &&
        (existingPriority < 0 || newPriority < existingPriority)
      ) {
        seen.set(entry.label, entry);
      }
    }
  }

  return Array.from(seen.values());
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2b: Web + Perplexity research
// ────────────────────────────────────────────────────────────────────────────

async function searchWithTavily(query: string): Promise<any> {
  try {
    const key = Deno.env.get("TAVILY_API_KEY");
    if (!key) return null;
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        include_answer: true,
        include_raw_content: false,
        max_results: 3,
      }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function analyzeWithClaude(
  context: string,
  question: string
): Promise<string> {
  try {
    const key = Deno.env.get("Claude_API_Key");
    if (!key) return "";
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system:
          "You are a biotech/pharma analyst. Answer concisely using only the provided context. If the context doesn't support an answer, say 'Not found'.",
        messages: [
          {
            role: "user",
            content: `CONTEXT:\n${context}\n\nQUESTION:\n${question}`,
          },
        ],
        temperature: 0.1,
      }),
    });
    if (!resp.ok) {
      console.error(`Claude API error: ${resp.status}`);
      return "";
    }
    const data = await resp.json();
    return data.content?.[0]?.text || "";
  } catch (err) {
    console.error("Claude analysis error:", err);
    return "";
  }
}

interface ResearchResult {
  question: string;
  answer: string;
  sources: Array<{ url: string; title: string }>;
  tavilyAnswer?: string;
}

function buildResearchQueries(
  companyName: string,
  indication: string,
  anchorTrialId?: string
): Array<{ category: string; question: string; searchQuery: string }> {
  const ind = indication?.split(",")[0]?.trim() || indication;
  return [
    {
      category: "regulatory_designations",
      question: `What FDA expedited designations (Breakthrough Therapy, Orphan Drug, Fast Track, Priority Review, RMAT) has ${companyName} received for ${ind}?`,
      searchQuery: `"${companyName}" FDA designation breakthrough orphan "fast track" RMAT "${ind}"`,
    },
    {
      category: "filing_target",
      question: `Has ${companyName} disclosed a BLA or NDA submission target date for ${ind}? When is the expected filing?`,
      searchQuery: `"${companyName}" BLA OR NDA submission filing target date "${ind}"`,
    },
    {
      category: "safety_profile",
      question: `Are there any FDA clinical holds, serious adverse events (SAEs), or safety concerns for ${companyName}'s ${ind} program?`,
      searchQuery: `"${companyName}" FDA clinical hold adverse events safety "${ind}"`,
    },
    {
      category: "phase2_efficacy",
      question: `What were ${companyName}'s clinical trial results for ${ind}? Include p-values, endpoints, statistical significance.`,
      searchQuery: `"${companyName}" "${ind}" clinical trial results efficacy endpoint`,
    },
    {
      category: "fda_engagement",
      question: `Has ${companyName} disclosed any FDA meetings, pre-NDA/BLA meetings, or regulatory interactions?`,
      searchQuery: `"${companyName}" FDA meeting pre-NDA pre-BLA regulatory`,
    },
    {
      category: "recent_funding",
      question: `What is ${companyName}'s most recent funding round (amount, series, date, investors)?`,
      searchQuery: `"${companyName}" funding raised series investment 2024 OR 2025 OR 2026`,
    },
    {
      category: "strategic_partnerships",
      question: `Does ${companyName} have strategic partnerships with pharma companies for ${ind}?`,
      searchQuery: `"${companyName}" partnership collaboration pharma deal`,
    },
    {
      category: "differentiation",
      question: `Is ${companyName}'s therapy for ${ind} first-in-class or best-in-class? How does it compare to competitors?`,
      searchQuery: `"${companyName}" "${ind}" first-in-class competitor landscape`,
    },
    {
      category: "valuation",
      question: `What is ${companyName}'s most recent valuation?`,
      searchQuery: `"${companyName}" valuation funding investors`,
    },
    {
      category: "market_size",
      question: `What is the market size and unmet need for ${ind}?`,
      searchQuery: `"${ind}" market size unmet need patient population`,
    },
    {
      category: "commercial_readiness",
      question: `Has ${companyName} made commercial launch preparations (hired CCO, commercial team)?`,
      searchQuery: `"${companyName}" commercial team CCO market access launch`,
    },
  ];
}

async function runWebResearch(
  companyName: string,
  indication: string,
  anchorTrialId: string | undefined,
  updateProgress: (pct: number, results: any) => Promise<void>
): Promise<Record<string, ResearchResult>> {
  const queries = buildResearchQueries(companyName, indication, anchorTrialId);
  const results: Record<string, ResearchResult> = {};
  const hasTavily = !!Deno.env.get("TAVILY_API_KEY");
  const hasClaude = !!Deno.env.get("Claude_API_Key");

  if (!hasTavily) {
    for (const q of queries) {
      results[q.category] = {
        question: q.question,
        answer: "Web research APIs not configured",
        sources: [],
      };
    }
    return results;
  }

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log(`Research ${i + 1}/${queries.length}: ${q.category}`);

    try {
      const searchResults = await searchWithTavily(q.searchQuery);
      if (searchResults?.results?.length > 0) {
        let answer = searchResults.answer || "";
        if (hasClaude) {
          const ctx = searchResults.results
            .map((r: any) => `Source: ${r.url}\n${r.content}`)
            .join("\n\n");
          const claudeAnswer = await analyzeWithClaude(ctx, q.question);
          if (claudeAnswer && claudeAnswer !== "Not found" && claudeAnswer.trim()) {
            answer = claudeAnswer;
          }
        }
        results[q.category] = {
          question: q.question,
          answer: answer || "No conclusive data found",
          sources: searchResults.results.map((r: any) => ({
            url: r.url,
            title: r.title,
          })),
          tavilyAnswer: searchResults.answer || "",
        };
      } else {
        results[q.category] = {
          question: q.question,
          answer: "No data found",
          sources: [],
        };
      }
    } catch (err) {
      console.error(`Error in ${q.category}:`, err);
      results[q.category] = {
        question: q.question,
        answer: "Research error",
        sources: [],
      };
    }

    const pct = 30 + Math.round(((i + 1) / queries.length) * 55);
    await updateProgress(pct, {
      phase: `Web research ${i + 1}/${queries.length}`,
      research: results,
    });
  }

  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2c: SEC EDGAR designation + filing target extraction
// ────────────────────────────────────────────────────────────────────────────

async function fetchSECDesignationsAndFilingTarget(
  companyName: string,
  companyId: string
): Promise<{
  designations: DesignationEntry[];
  filingTarget: string | null;
  fundingEvents: number;
  lastFundingDate: string | null;
}> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/fetch-sec-edgar-data`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey!,
        },
        body: JSON.stringify({ companyName, companyId }),
      }
    );

    if (!resp.ok) {
      return {
        designations: [],
        filingTarget: null,
        fundingEvents: 0,
        lastFundingDate: null,
      };
    }

    const result = await resp.json();
    const secData = result.data;
    if (!secData?.extractedData)
      return {
        designations: [],
        filingTarget: null,
        fundingEvents: 0,
        lastFundingDate: null,
      };

    const designations: DesignationEntry[] = [];

    const fdaEntries = secData.extractedData.fdaEngagement || [];
    for (const entry of fdaEntries) {
      const text = `${entry.details || ""} ${entry.type || ""}`;
      designations.push(...scanTextForDesignations(text, "SEC EDGAR"));
    }

    let filingTarget: string | null = null;
    for (const entry of fdaEntries) {
      const text = (entry.details || "").toLowerCase();
      if (
        text.includes("bla") ||
        text.includes("nda") ||
        text.includes("submission") ||
        text.includes("filing")
      ) {
        const dateMatch = text.match(
          /(?:q[1-4]\s*20\d{2}|20\d{2}|first half|second half|h[12]\s*20\d{2})/i
        );
        if (dateMatch) {
          filingTarget = dateMatch[0];
        }
      }
    }

    const fundingEntries = secData.extractedData.funding || [];
    const recentFundings = fundingEntries.filter((f: any) => {
      if (!f.date) return false;
      const mAgo =
        (Date.now() - new Date(f.date).getTime()) / (1000 * 60 * 60 * 24 * 30);
      return mAgo <= 24;
    });

    return {
      designations,
      filingTarget,
      fundingEvents: recentFundings.length,
      lastFundingDate: fundingEntries[0]?.date || null,
    };
  } catch (err) {
    console.error("SEC EDGAR fetch error:", err);
    return {
      designations: [],
      filingTarget: null,
      fundingEvents: 0,
      lastFundingDate: null,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2d: OpenFDA designations
// ────────────────────────────────────────────────────────────────────────────

async function fetchOpenFDADesignations(
  companyName: string,
  indication: string | undefined,
  companyId: string
): Promise<{ designations: DesignationEntry[]; competitorCount: number }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/fetch-openfda-data`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey!,
        },
        body: JSON.stringify({
          companyName,
          drugName: indication,
          indication,
          companyId,
        }),
      }
    );

    if (!resp.ok)
      return { designations: [], competitorCount: 0 };

    const result = await resp.json();
    const fdaData = result.data?.extractedData;
    if (!fdaData) return { designations: [], competitorCount: 0 };

    const designations: DesignationEntry[] = (fdaData.designations || []).map(
      (d: any) => ({
        label: d.type || "Unknown",
        source: "OpenFDA",
      })
    );

    const competitorCount = fdaData.competitiveDrugs?.length || 0;
    return { designations, competitorCount };
  } catch {
    return { designations: [], competitorCount: 0 };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2e: PubMed
// ────────────────────────────────────────────────────────────────────────────

async function fetchPubMedCount(
  companyName: string,
  indication: string | undefined,
  companyId: string
): Promise<number> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/fetch-pubmed-data`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey!,
        },
        body: JSON.stringify({ companyName, indication, companyId }),
      }
    );
    if (!resp.ok) return 0;
    const result = await resp.json();
    const pubs = result.data?.extractedData?.publications || [];
    return pubs.filter((p: any) => {
      if (!p.date) return false;
      const mAgo =
        (Date.now() - new Date(p.date).getTime()) / (1000 * 60 * 60 * 24 * 30);
      return mAgo <= 24;
    }).length;
  } catch {
    return 0;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 3: Scoring engine
// ────────────────────────────────────────────────────────────────────────────

function extractFilingTargetFromWebResearch(
  research: Record<string, ResearchResult>
): string | null {
  const answer = research?.filing_target?.answer || "";
  if (!answer || answer === "No data found" || answer === "Research error")
    return null;

  const lower = answer.toLowerCase();
  const patterns = [
    /(?:bla|nda)\s*(?:submission|filing)?\s*(?:target|expected|planned|anticipated)?\s*(?:in|by|for)?\s*(q[1-4]\s*20\d{2})/i,
    /(?:submit|file|filing)\s*(?:a\s*)?(?:bla|nda)\s*(?:in|by|for)?\s*(q[1-4]\s*20\d{2}|(?:first|second)\s*half\s*(?:of\s*)?20\d{2}|20\d{2})/i,
    /(q[1-4]\s*20\d{2})\s*(?:bla|nda|submission|filing)/i,
    /(?:plans?\s*to\s*(?:submit|file))\s*.*?(q[1-4]\s*20\d{2}|(?:first|second)\s*half\s*(?:of\s*)?20\d{2}|early\s*20\d{2}|mid\s*20\d{2}|late\s*20\d{2})/i,
  ];

  for (const p of patterns) {
    const m = answer.match(p);
    if (m) return m[1];
  }

  if (
    lower.includes("bla") ||
    lower.includes("nda") ||
    lower.includes("submission")
  ) {
    const dateMatch = answer.match(
      /(?:Q[1-4]\s*20\d{2}|(?:first|second)\s*half\s*(?:of\s*)?20\d{2}|early\s*20\d{2}|mid[-\s]*20\d{2}|late\s*20\d{2}|H[12]\s*20\d{2}|20\d{2})/i
    );
    if (dateMatch) return dateMatch[0];
  }

  return null;
}

function extractFundingFromResearch(
  research: Record<string, ResearchResult>
): { events: number; recentAmount: string | null } {
  const answer = research?.recent_funding?.answer || "";
  if (!answer || answer === "No data found") return { events: 0, recentAmount: null };

  let events = 0;
  const amountMatches = answer.match(/\$[\d.,]+\s*(?:million|billion|M|B)/gi);
  if (amountMatches) events = amountMatches.length;

  const roundMatches = answer.match(/series\s+[a-f]/gi);
  if (roundMatches) events = Math.max(events, roundMatches.length);

  if (events === 0 && answer.length > 50 && !answer.includes("No") && !answer.includes("not found"))
    events = 1;

  return { events, recentAmount: amountMatches?.[0] || null };
}

function extractCompetitorsFromResearch(
  research: Record<string, ResearchResult>
): number {
  const answer = (research?.differentiation?.answer || "").toLowerCase();
  if (!answer || answer === "no data found") return -1;

  if (
    answer.includes("first-in-class") ||
    answer.includes("no approved competitor") ||
    answer.includes("no direct competitor")
  )
    return 0;
  if (answer.includes("highly competitive") || answer.includes("crowded"))
    return 8;
  if (
    answer.includes("moderate competition") ||
    answer.includes("several competitor")
  )
    return 4;
  if (
    answer.includes("limited competition") ||
    answer.includes("few competitor")
  )
    return 2;

  return -1;
}

function extractSafetySignals(
  research: Record<string, ResearchResult>
): { hasClinicalHold: boolean; hasSeriousSafety: boolean } {
  const answer = (research?.safety_profile?.answer || "").toLowerCase();
  return {
    hasClinicalHold: answer.includes("clinical hold"),
    hasSeriousSafety:
      answer.includes("serious adverse") ||
      answer.includes("grade 3") ||
      answer.includes("grade 4") ||
      answer.includes("death"),
  };
}

function computeScore(input: {
  anchor: TrialRecord | null;
  allTrials: TrialRecord[];
  companyPhase: string;
  allDesignations: DesignationEntry[];
  secFunding: { events: number; lastDate: string | null };
  webFunding: { events: number; recentAmount: string | null };
  competitorCountAPI: number;
  competitorCountWeb: number;
  publicationsCount: number;
  safetySignals: { hasClinicalHold: boolean; hasSeriousSafety: boolean };
  filingTarget: string | null;
  webResearch: Record<string, ResearchResult>;
}): ScoringOutput {
  const {
    anchor,
    allTrials,
    companyPhase,
    allDesignations,
    secFunding,
    webFunding,
    competitorCountAPI,
    competitorCountWeb,
    publicationsCount,
    safetySignals,
    filingTarget,
    webResearch,
  } = input;

  const designationLabels = [
    ...new Set(allDesignations.map((d) => d.label)),
  ];
  const hasBreakthrough = designationLabels.some((d) =>
    /breakthrough/i.test(d)
  );
  const hasOrphan = designationLabels.some((d) => /orphan/i.test(d));
  const hasFastTrack = designationLabels.some((d) => /fast track/i.test(d));
  const hasPriority = designationLabels.some((d) => /priority/i.test(d));
  const hasRMAT = designationLabels.some((d) => /rmat/i.test(d));
  const hasAccelerated = designationLabels.some((d) =>
    /accelerated/i.test(d)
  );

  const expeditedCount = [
    hasBreakthrough,
    hasOrphan,
    hasFastTrack,
    hasPriority,
    hasRMAT,
    hasAccelerated,
  ].filter(Boolean).length;

  const anchorPhase = anchor?.normalizedPhase || "";
  const anchorIsPhase3 = phaseIsAtLeast3(anchorPhase);
  const anchorIsPhase2 = phaseIsAtLeast2(anchorPhase);
  const companyIsPhase3 =
    companyPhase.includes("III") || companyPhase.includes("3");
  const companyIsPhase2 =
    companyPhase.includes("II") || companyPhase.includes("2");
  const effectivePhase3 = anchorIsPhase3 || companyIsPhase3;
  const effectivePhase2 = anchorIsPhase2 || companyIsPhase2;

  let primaryCompletionMonths: number | null = null;
  if (anchor?.primaryCompletionDate) {
    primaryCompletionMonths = monthsUntil(anchor.primaryCompletionDate);
  }

  // --- Tier 1 eligibility check ---
  let tier1Eligible = false;
  let tier1Reason = "";

  if (effectivePhase3 && primaryCompletionMonths !== null && primaryCompletionMonths <= 24) {
    tier1Eligible = true;
    tier1Reason = `Phase III primary completion within 24 months (${primaryCompletionMonths}mo)`;
  }

  if (filingTarget) {
    const filingLower = filingTarget.toLowerCase();
    const yearMatch = filingTarget.match(/20(\d{2})/);
    if (yearMatch) {
      const filingYear = 2000 + parseInt(yearMatch[1]);
      const currentYear = new Date().getFullYear();
      if (filingYear <= currentYear + 2) {
        tier1Eligible = true;
        tier1Reason = `BLA/NDA filing target: ${filingTarget}`;
      }
    }
  }

  if (
    (hasFastTrack || hasRMAT || hasBreakthrough) &&
    effectivePhase2 &&
    primaryCompletionMonths !== null &&
    primaryCompletionMonths <= 24
  ) {
    tier1Eligible = true;
    const desigNames = [
      hasFastTrack && "Fast Track",
      hasRMAT && "RMAT",
      hasBreakthrough && "Breakthrough",
    ]
      .filter(Boolean)
      .join("/");
    tier1Reason = `${desigNames} + Phase II/III completion within 24mo`;
  }

  // --- Base score ---
  let baseScore = 10;

  if (effectivePhase3) {
    if (primaryCompletionMonths !== null) {
      if (primaryCompletionMonths <= 0) baseScore = 100;
      else if (primaryCompletionMonths <= 12) baseScore = 100;
      else if (primaryCompletionMonths <= 18) baseScore = 95;
      else if (primaryCompletionMonths <= 24) baseScore = 90;
      else if (primaryCompletionMonths <= 36) baseScore = 80;
      else baseScore = 70;
    } else {
      baseScore = 75;
    }
  } else if (effectivePhase2) {
    baseScore = 55;
  } else {
    baseScore = 30;
  }

  // --- Clinical strength deduction (max 20) ---
  let clinicalDed = 0;
  const clinicalReasons: string[] = [];

  if (anchor) {
    const status = anchor.status.toUpperCase().replace(/ /g, "_");
    if (status === "COMPLETED") {
      clinicalReasons.push(`Anchor trial ${anchor.nctId} completed (0)`);
    } else if (status === "ACTIVE_NOT_RECRUITING") {
      clinicalDed += 3;
      clinicalReasons.push(`Anchor trial ${anchor.nctId} active, not recruiting (-3)`);
    } else if (status === "RECRUITING") {
      clinicalDed += 5;
      clinicalReasons.push(`Anchor trial ${anchor.nctId} recruiting (-5)`);
    } else if (status === "NOT_YET_RECRUITING") {
      clinicalDed += 8;
      clinicalReasons.push(`Anchor trial ${anchor.nctId} not yet recruiting (-8)`);
    } else {
      clinicalDed += 5;
      clinicalReasons.push(`Anchor trial status: ${anchor.status} (-5)`);
    }

    if (safetySignals.hasClinicalHold) {
      clinicalDed += 10;
      clinicalReasons.push("FDA clinical hold detected (-10)");
    }
  } else if (effectivePhase3) {
    clinicalDed += 5;
    clinicalReasons.push("Phase III per company record, no ClinicalTrials.gov match (-5)");
  } else if (effectivePhase2) {
    clinicalDed += 8;
    clinicalReasons.push("Phase II stage (-8)");
  } else {
    clinicalDed += 15;
    clinicalReasons.push("Pre-Phase II or no trial data (-15)");
  }

  clinicalDed = Math.min(clinicalDed, 20);

  // --- Regulatory momentum deduction (max 15) ---
  let regDed = 0;
  let regRationale = "";

  if (expeditedCount >= 3) {
    regDed = 0;
    regRationale = `Strong regulatory support: ${designationLabels.join(", ")} (0)`;
  } else if (expeditedCount === 2) {
    regDed = 2;
    regRationale = `Multiple designations: ${designationLabels.join(", ")} (-2)`;
  } else if (expeditedCount === 1) {
    regDed = 5;
    regRationale = `Single designation: ${designationLabels.join(", ")} (-5)`;
  } else if (designationLabels.length > 0) {
    regDed = 8;
    regRationale = `Minor designation: ${designationLabels.join(", ")} (-8)`;
  } else {
    regDed = 15;
    regRationale = "No FDA expedited designations found (-15)";
  }

  regDed = Math.min(regDed, 15);

  // --- Financial stability deduction (max 15) ---
  const totalFundingEvents = Math.max(secFunding.events, webFunding.events);
  let finDed = 0;
  const finReasons: string[] = [];

  if (totalFundingEvents === 0) {
    finDed = 15;
    finReasons.push("No recent funding events found (-15)");
  } else if (totalFundingEvents === 1) {
    finDed = 5;
    finReasons.push(
      `1 funding event${webFunding.recentAmount ? ` (${webFunding.recentAmount})` : ""} (-5)`
    );
  } else {
    finDed = 0;
    finReasons.push(`${totalFundingEvents} funding events (0)`);
  }

  if (secFunding.lastDate) {
    const mAgo =
      (Date.now() - new Date(secFunding.lastDate).getTime()) /
      (1000 * 60 * 60 * 24 * 30);
    if (mAgo > 36) {
      finDed += 5;
      finReasons.push("Last SEC filing >36 months ago (-5)");
    }
  }

  finDed = Math.min(finDed, 15);

  // --- Competitive intensity deduction (max 10) ---
  const compCount =
    competitorCountAPI >= 0
      ? competitorCountAPI
      : competitorCountWeb >= 0
        ? competitorCountWeb
        : 0;

  let compDed = 0;
  let compRationale = "";

  if (compCount === 0) {
    compDed = 0;
    compRationale = "First-in-class, no approved competitors (0)";
  } else if (compCount <= 3) {
    compDed = 3;
    compRationale = `${compCount} competitor(s), limited competition (-3)`;
  } else if (compCount <= 10) {
    compDed = 6;
    compRationale = `${compCount} competitors, moderate competition (-6)`;
  } else {
    compDed = 10;
    compRationale = `${compCount}+ competitors, crowded market (-10)`;
  }

  compDed = Math.min(compDed, 10);

  // --- Final score ---
  const totalScore = Math.max(
    0,
    Math.min(100, baseScore - clinicalDed - regDed - finDed - compDed)
  );

  // --- Tier assignment (Tier 1 requires eligibility check) ---
  let tier: string;
  if (tier1Eligible && totalScore >= 80) {
    tier = "Tier 1";
  } else if (totalScore >= 85) {
    tier = "Tier 1";
  } else if (totalScore >= 70) {
    tier = "Tier 2";
  } else if (totalScore >= 55) {
    tier = "Tier 3";
  } else {
    tier = "Tier 4";
  }

  // --- Data confidence ---
  const dataPoints = [
    anchor !== null,
    allTrials.length > 0,
    allDesignations.length > 0,
    totalFundingEvents > 0,
    publicationsCount > 0,
    Object.keys(webResearch).filter(
      (k) => webResearch[k]?.answer && !webResearch[k].answer.includes("No data")
    ).length >= 5,
  ].filter(Boolean).length;

  let dataConfidence: "high" | "medium" | "low";
  if (dataPoints >= 5) dataConfidence = "high";
  else if (dataPoints >= 3) dataConfidence = "medium";
  else dataConfidence = "low";

  // --- Missing fields ---
  const missingFields: string[] = [];
  if (!anchor) missingFields.push("anchor_trial");
  if (primaryCompletionMonths === null && effectivePhase3)
    missingFields.push("primary_completion_date");
  if (allDesignations.length === 0) missingFields.push("fda_designations");
  if (!filingTarget && effectivePhase3) missingFields.push("filing_target_date");
  if (totalFundingEvents === 0) missingFields.push("recent_funding");
  if (publicationsCount === 0) missingFields.push("publications");

  // --- Blunt callout ---
  let bluntCallout = "";

  if (safetySignals.hasClinicalHold) {
    bluntCallout =
      "This company has an active FDA clinical hold. That overrides most positive signals until resolved.";
  } else if (!anchor && effectivePhase3) {
    bluntCallout =
      "Company claims Phase III but no matching ClinicalTrials.gov study was found under their name. Verify the trial sponsor.";
  } else if (tier1Eligible && tier === "Tier 1") {
    if (filingTarget) {
      bluntCallout = `Near-term filing opportunity: ${filingTarget}. Strong commercialization trajectory if clinical data holds.`;
    } else {
      bluntCallout = `Phase III ${primaryCompletionMonths !== null && primaryCompletionMonths <= 12 ? "completion imminent" : "nearing completion"}. ${designationLabels.length > 0 ? `Regulatory tailwinds with ${designationLabels.join(", ")}.` : "No expedited designations on file."}`;
    }
  } else if (allDesignations.length === 0 && effectivePhase3) {
    bluntCallout =
      "Phase III asset with zero FDA expedited designations. Either the company hasn't pursued them or the indication doesn't qualify. Worth clarifying.";
  } else if (totalFundingEvents === 0 && effectivePhase3) {
    bluntCallout =
      "No recent funding activity detected for a Phase III-stage company. Cash runway and ability to commercialize should be verified.";
  } else if (tier === "Tier 4") {
    bluntCallout =
      "Early stage or data-poor profile. Multiple scoring dimensions lack supporting evidence.";
  } else if (effectivePhase2 && !effectivePhase3) {
    bluntCallout = `Phase II stage. ${designationLabels.length > 0 ? `${designationLabels.join(", ")} designation(s) could accelerate path.` : "No expedited designations detected."} Monitor for Phase III initiation or pivotal data readout.`;
  } else {
    bluntCallout = `Score ${totalScore}/100 (${tier}). ${missingFields.length > 0 ? `Missing data in: ${missingFields.join(", ")}.` : "Reasonable data coverage."}`;
  }

  // --- Insight ---
  const insightParts: string[] = [];
  if (tier === "Tier 1") insightParts.push("High commercialization readiness.");
  else if (tier === "Tier 2") insightParts.push("Strong potential, some gaps.");
  else if (tier === "Tier 3") insightParts.push("Moderate timeline.");
  else insightParts.push("Early-stage or high-risk profile.");

  if (anchor) {
    insightParts.push(
      `Anchor: ${anchor.nctId} (${anchor.normalizedPhase}, ${anchor.status}).`
    );
  }

  if (primaryCompletionMonths !== null) {
    if (primaryCompletionMonths <= 0) insightParts.push("Primary completion date passed.");
    else insightParts.push(`Primary completion in ~${primaryCompletionMonths} months.`);
  }

  if (filingTarget) insightParts.push(`Filing target: ${filingTarget}.`);

  if (designationLabels.length > 0)
    insightParts.push(`Designations: ${designationLabels.join(", ")}.`);

  if (allTrials.length > 1)
    insightParts.push(`${allTrials.length} total trials evaluated.`);

  return {
    tier,
    totalScore,
    baseScore,
    clinicalStrengthDeduction: clinicalDed,
    clinicalStrengthRationale: clinicalReasons.join("; "),
    regulatoryMomentumDeduction: regDed,
    regulatoryMomentumRationale: regRationale,
    financialStabilityDeduction: finDed,
    financialStabilityRationale: finReasons.join("; "),
    competitiveIntensityDeduction: compDed,
    competitiveIntensityRationale: compRationale,
    dataConfidence,
    commercializationInsight: insightParts.join(" "),
    anchorTrialId: anchor?.nctId || null,
    anchorTrialPhase: anchor?.normalizedPhase || null,
    anchorPrimaryCompletion: anchor?.primaryCompletionDate || null,
    filingTargetDate: filingTarget,
    designationsDetail: allDesignations,
    missingFields,
    bluntCallout,
    allTrialsConsidered: allTrials.length,
    pipelineTrials: allTrials
      .filter((t) => {
        const s = t.status.toUpperCase().replace(/ /g, "_");
        const activeStatuses = ["ACTIVE_NOT_RECRUITING", "RECRUITING", "ENROLLING_BY_INVITATION", "NOT_YET_RECRUITING"];
        const isActive = activeStatuses.includes(s);
        const isPhase23 =
          t.normalizedPhase.includes("II") ||
          t.normalizedPhase.includes("III") ||
          t.normalizedPhase.includes("2") ||
          t.normalizedPhase.includes("3");
        return isActive && isPhase23;
      })
      .map((t) => ({
        nctId: t.nctId,
        phase: t.normalizedPhase,
        status: t.status,
        title: t.title,
        primaryCompletionDate: t.primaryCompletionDate,
      })),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Job progress helper
// ────────────────────────────────────────────────────────────────────────────

async function updateJobProgress(
  supabase: any,
  jobId: string,
  progress: number,
  results?: any,
  status?: string
) {
  const updates: any = { progress, updated_at: new Date().toISOString() };
  if (results) updates.results = results;
  if (status) updates.status = status;
  if (status === "completed") updates.completed_at = new Date().toISOString();
  await supabase.from("research_jobs").update(updates).eq("id", jobId);
}

// ────────────────────────────────────────────────────────────────────────────
// Main pipeline
// ────────────────────────────────────────────────────────────────────────────

async function processResearchJob(
  jobId: string,
  companyId: string,
  companyInfo: CompanyInfo
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const progress = async (pct: number, results: any) =>
    updateJobProgress(supabase, jobId, pct, results);

  try {
    await updateJobProgress(supabase, jobId, 0, null, "processing");

    // ── Phase 1: Discover all trials for this sponsor ──
    console.log(`Phase 1: Discovering all trials for "${companyInfo.name}"`);

    let allTrials = await fetchAllSponsorTrials(companyInfo.name);

    if (allTrials.length === 0 && companyInfo.trial_id) {
      console.log(`No sponsor-matched trials. Falling back to known trial: ${companyInfo.trial_id}`);
      const fallback = await fetchSingleTrial(companyInfo.trial_id);
      if (fallback) allTrials = [fallback];
    }

    const anchor = selectAnchorTrial(allTrials, companyInfo.trial_id);

    console.log(
      `Found ${allTrials.length} trials. Anchor: ${anchor?.nctId || "none"} (${anchor?.normalizedPhase || "N/A"}, rank=${anchor?.commercialRank || 0})`
    );

    await progress(15, {
      phase: "Trial discovery complete",
      trialsFound: allTrials.length,
      anchor: anchor
        ? {
            nctId: anchor.nctId,
            phase: anchor.normalizedPhase,
            status: anchor.status,
            primaryCompletion: anchor.primaryCompletionDate,
          }
        : null,
    });

    const rejectedStatuses = ["WITHDRAWN", "TERMINATED"];
    if (anchor && rejectedStatuses.includes(anchor.status.toUpperCase())) {
      const nextBest = allTrials.find(
        (t) =>
          t.nctId !== anchor.nctId &&
          !rejectedStatuses.includes(t.status.toUpperCase())
      );
      if (!nextBest) {
        await supabase
          .from("research_jobs")
          .update({
            status: "failed",
            error: `All trials for ${companyInfo.name} are withdrawn/terminated.`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        return;
      }
    }

    // ── Phase 2a: Parallel structured data fetch ──
    console.log("Phase 2: Fetching structured data (SEC, OpenFDA, PubMed)...");

    const [secResult, fdaResult, pubmedCount] = await Promise.all([
      fetchSECDesignationsAndFilingTarget(companyInfo.name, companyId),
      fetchOpenFDADesignations(
        companyInfo.name,
        companyInfo.indication,
        companyId
      ),
      fetchPubMedCount(companyInfo.name, companyInfo.indication, companyId),
    ]);

    await progress(30, {
      phase: "Structured data collected",
      sec: secResult.designations.length > 0 ? "found" : "empty",
      fda: fdaResult.designations.length > 0 ? "found" : "empty",
      pubmed: pubmedCount,
    });

    // ── Phase 2b: Web research ──
    console.log("Phase 2b: Running web research...");

    const webResearch = await runWebResearch(
      companyInfo.name,
      companyInfo.indication,
      anchor?.nctId,
      progress
    );

    // ── Phase 2c: Extract designations from web research ──
    const webDesignations: DesignationEntry[] = [];
    const regAnswer = webResearch?.regulatory_designations?.answer || "";
    if (regAnswer && regAnswer !== "No data found") {
      webDesignations.push(
        ...scanTextForDesignations(regAnswer, "Tavily Web Search")
      );
    }

    const fdaEngAnswer = webResearch?.fda_engagement?.answer || "";
    if (fdaEngAnswer && fdaEngAnswer !== "No data found") {
      webDesignations.push(
        ...scanTextForDesignations(fdaEngAnswer, "Tavily Web Search")
      );
    }

    const allDesignations = dedupeDesignations([
      ...secResult.designations,
      ...webDesignations,
      ...fdaResult.designations,
    ]);

    console.log(
      `Designations found: ${allDesignations.map((d) => `${d.label} (${d.source})`).join(", ") || "none"}`
    );

    // ── Phase 2d: Extract filing target from web + SEC ──
    const webFilingTarget = extractFilingTargetFromWebResearch(webResearch);
    const filingTarget = secResult.filingTarget || webFilingTarget;
    if (filingTarget) console.log(`Filing target: ${filingTarget}`);

    // ── Phase 3: Compute scores ──
    console.log("Phase 3: Computing scores...");

    const webFunding = extractFundingFromResearch(webResearch);
    const webCompetitors = extractCompetitorsFromResearch(webResearch);
    const safetySignals = extractSafetySignals(webResearch);

    const result = computeScore({
      anchor,
      allTrials,
      companyPhase: companyInfo.phase,
      allDesignations,
      secFunding: {
        events: secResult.fundingEvents,
        lastDate: secResult.lastFundingDate,
      },
      webFunding,
      competitorCountAPI: fdaResult.competitorCount,
      competitorCountWeb: webCompetitors,
      publicationsCount: pubmedCount,
      safetySignals,
      filingTarget,
      webResearch,
    });

    // ── Phase 4: Persist ──
    let commercializationStatus = "phase_1";
    const effectivePhase = anchor?.normalizedPhase || companyInfo.phase;
    if (effectivePhase.includes("III") || effectivePhase.includes("3"))
      commercializationStatus = "phase_3";
    else if (effectivePhase.includes("II") || effectivePhase.includes("2"))
      commercializationStatus = "phase_2";

    await supabase
      .from("companies")
      .update({
        commercialization_status: commercializationStatus,
        phase: anchor?.normalizedPhase || companyInfo.phase,
        trial_id: anchor?.nctId || companyInfo.trial_id,
      })
      .eq("id", companyId);

    const totalDeductions =
      result.clinicalStrengthDeduction +
      result.regulatoryMomentumDeduction +
      result.financialStabilityDeduction +
      result.competitiveIntensityDeduction;

    const { error: upsertError } = await supabase
      .from("company_scores")
      .upsert(
        {
          company_id: companyId,
          base_score: result.baseScore,
          clinical_strength_deduction: result.clinicalStrengthDeduction,
          regulatory_momentum_deduction: result.regulatoryMomentumDeduction,
          financial_stability_deduction: result.financialStabilityDeduction,
          competitive_intensity_deduction:
            result.competitiveIntensityDeduction,
          clinical_strength_rationale: result.clinicalStrengthRationale,
          regulatory_momentum_rationale: result.regulatoryMomentumRationale,
          financial_stability_rationale: result.financialStabilityRationale,
          competitive_intensity_rationale:
            result.competitiveIntensityRationale,
          total_score: result.totalScore,
          tier: result.tier,
          data_confidence_level: result.dataConfidence,
          commercialization_insight: result.commercializationInsight,
          key_insights: result.bluntCallout,
          anchor_trial_id: result.anchorTrialId,
          anchor_trial_phase: result.anchorTrialPhase,
          anchor_primary_completion: result.anchorPrimaryCompletion
            ? (result.anchorPrimaryCompletion.match(/^\d{4}-\d{2}$/)
              ? `${result.anchorPrimaryCompletion}-01`
              : result.anchorPrimaryCompletion)
            : null,
          filing_target_date: result.filingTargetDate,
          designations_detail: result.designationsDetail,
          missing_fields: result.missingFields,
          blunt_callout: result.bluntCallout,
          all_trials_considered: result.allTrialsConsidered,
          pipeline_trials: result.pipelineTrials,
          scored_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      );

    if (upsertError) {
      console.error("Score save error:", upsertError);
      throw new Error(`Failed to save scores: ${upsertError.message}`);
    }

    console.log(
      `Scores saved: ${result.totalScore}/100, ${result.tier}, anchor=${result.anchorTrialId}`
    );

    await updateJobProgress(
      supabase,
      jobId,
      100,
      {
        phase: "completed",
        research: webResearch,
        scores: {
          total_score: result.totalScore,
          tier: result.tier,
          base_score: result.baseScore,
          deductions: totalDeductions,
          data_confidence: result.dataConfidence,
          anchor_trial: result.anchorTrialId,
          anchor_phase: result.anchorTrialPhase,
          filing_target: result.filingTargetDate,
          designations: allDesignations.map((d) => d.label),
          blunt_callout: result.bluntCallout,
          missing_fields: result.missingFields,
          trials_considered: result.allTrialsConsidered,
        },
      },
      "completed"
    );
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    await supabase
      .from("research_jobs")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { jobId, companyId, companyInfo } = body;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Job ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!companyId || !companyInfo) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: job, error: jobError } = await supabase
        .from("research_jobs")
        .select("*, companies(*)")
        .eq("id", jobId)
        .single();

      if (jobError || !job) {
        return new Response(
          JSON.stringify({ error: "Job not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const company = job.companies;
      EdgeRuntime.waitUntil(
        processResearchJob(jobId, company.id, {
          name: company.name,
          indication: company.indication,
          phase: company.phase,
          trial_id: company.trial_id,
          website: company.website,
          therapeutic_area: company.therapeutic_area,
        })
      );
    } else {
      EdgeRuntime.waitUntil(
        processResearchJob(jobId, companyId, companyInfo)
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Research and scoring job started",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
