import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SearchRequest {
  criteria: string;
  maxResults?: number;
}

interface ClinicalTrialStudy {
  protocolSection: {
    identificationModule: {
      nctId: string;
      briefTitle: string;
      officialTitle?: string;
      organization?: {
        fullName: string;
        class: string;
      };
    };
    statusModule: {
      overallStatus: string;
      startDateStruct?: { date: string };
    };
    sponsorCollaboratorsModule?: {
      leadSponsor?: {
        name: string;
        class: string;
      };
      collaborators?: Array<{ name: string; class: string }>;
    };
    conditionsModule?: {
      conditions?: string[];
    };
    designModule?: {
      phases?: string[];
    };
    armsInterventionsModule?: {
      interventions?: Array<{
        type: string;
        name: string;
        description?: string;
      }>;
    };
    contactsLocationsModule?: {
      locations?: Array<{
        facility?: string;
        city?: string;
        state?: string;
        country?: string;
      }>;
    };
  };
}

interface CompanyResult {
  name: string;
  indication: string;
  phase: string;
  trial_id: string;
  therapeutic_area: string;
  headquarters: string | null;
  notes: string;
  status: string;
  trial_title: string;
}

function normalizePhase(phases: string[] | undefined): string {
  if (!phases || phases.length === 0) return "Not Applicable";

  const phaseMap: Record<string, string> = {
    "PHASE1": "Phase I",
    "PHASE2": "Phase II",
    "PHASE3": "Phase III",
    "PHASE4": "Phase IV",
    "EARLY_PHASE1": "Phase I",
    "NA": "Not Applicable",
  };

  const highestPhase = phases[phases.length - 1];

  if (phases.includes("PHASE3")) return "Phase III";
  if (phases.includes("PHASE2") && phases.includes("PHASE3")) return "Phase II/III";
  if (phases.includes("PHASE2")) return "Phase II";
  if (phases.includes("PHASE1") && phases.includes("PHASE2")) return "Phase I/II";
  if (phases.includes("PHASE1") || phases.includes("EARLY_PHASE1")) return "Phase I";

  return phaseMap[highestPhase] || "Not Applicable";
}

function determineTherapeuticArea(interventions: Array<{ type: string; name: string; description?: string }> | undefined): string {
  if (!interventions) return "Cell/Gene Therapy";

  const interventionText = interventions
    .map(i => `${i.name} ${i.description || ""}`.toLowerCase())
    .join(" ");

  if (interventionText.includes("car-t") || interventionText.includes("car t") || interventionText.includes("chimeric antigen")) {
    return "CAR-T Cell Therapy";
  }
  if (interventionText.includes("aav") || interventionText.includes("adeno-associated") || interventionText.includes("gene transfer")) {
    return "Gene Therapy (AAV)";
  }
  if (interventionText.includes("lentivir") || interventionText.includes("lenti-")) {
    return "Gene Therapy (Lentiviral)";
  }
  if (interventionText.includes("crispr") || interventionText.includes("gene edit") || interventionText.includes("genome edit")) {
    return "Gene Editing";
  }
  if (interventionText.includes("mrna") || interventionText.includes("rna")) {
    return "RNA Therapy";
  }
  if (interventionText.includes("stem cell") || interventionText.includes("hematopoietic")) {
    return "Stem Cell Therapy";
  }
  if (interventionText.includes("cell therapy") || interventionText.includes("cellular therapy")) {
    return "Cell Therapy";
  }

  const hasGeneticIntervention = interventions.some(i =>
    i.type === "GENETIC" || i.type === "BIOLOGICAL"
  );

  if (hasGeneticIntervention) return "Gene Therapy";

  return "Cell/Gene Therapy";
}

function buildSearchQuery(criteria: string): string {
  const lowerCriteria = criteria.toLowerCase();

  const baseTerms = ["gene therapy", "cell therapy", "CAR-T", "CAR T"];

  if (lowerCriteria.includes("oncology") || lowerCriteria.includes("cancer")) {
    return "CAR-T OR CAR T OR cell therapy";
  } else if (lowerCriteria.includes("rare disease") || lowerCriteria.includes("orphan")) {
    return "gene therapy OR gene transfer";
  } else if (lowerCriteria.includes("neurolog") || lowerCriteria.includes("neuro")) {
    return "gene therapy";
  } else if (lowerCriteria.includes("ophthalmolog") || lowerCriteria.includes("eye") || lowerCriteria.includes("retina")) {
    return "gene therapy";
  } else if (lowerCriteria.includes("hemophilia") || lowerCriteria.includes("blood")) {
    return "gene therapy OR gene transfer";
  } else if (lowerCriteria.includes("muscular") || lowerCriteria.includes("dmd") || lowerCriteria.includes("duchenne")) {
    return "gene therapy";
  } else if (criteria.trim().length > 0) {
    return `gene therapy OR cell therapy OR ${criteria}`;
  }

  return baseTerms.join(" OR ");
}

async function fetchAllStudies(query: string, maxResults: number): Promise<ClinicalTrialStudy[]> {
  const allStudies: ClinicalTrialStudy[] = [];
  let pageToken: string | null = null;
  const pageSize = 100;

  while (allStudies.length < maxResults) {
    const url = new URL("https://clinicaltrials.gov/api/v2/studies");
    url.searchParams.set("query.intr", query);
    url.searchParams.set("query.locn", "United States");
    url.searchParams.set("filter.overallStatus", "RECRUITING,ACTIVE_NOT_RECRUITING,ENROLLING_BY_INVITATION,NOT_YET_RECRUITING");
    url.searchParams.set("pageSize", String(Math.min(pageSize, maxResults - allStudies.length)));

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    console.log("Fetching from ClinicalTrials.gov:", url.toString());

    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ClinicalTrials.gov API error:", response.status, errorText);
      throw new Error(`ClinicalTrials.gov API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.studies && data.studies.length > 0) {
      allStudies.push(...data.studies);
    }

    if (!data.nextPageToken || data.studies.length === 0) {
      break;
    }

    pageToken = data.nextPageToken;
  }

  return allStudies;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { criteria, maxResults = 100 }: SearchRequest = await req.json();

    if (!criteria || criteria.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Search criteria is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const searchQuery = buildSearchQuery(criteria);
    console.log("Searching ClinicalTrials.gov with query:", searchQuery);

    const studies = await fetchAllStudies(searchQuery, Math.min(maxResults, 1000));

    const companiesMap = new Map<string, CompanyResult[]>();

    for (const study of studies) {
      const protocol = study.protocolSection;
      const identification = protocol.identificationModule;
      const sponsor = protocol.sponsorCollaboratorsModule?.leadSponsor;
      const conditions = protocol.conditionsModule?.conditions || [];
      const phases = protocol.designModule?.phases;
      const interventions = protocol.armsInterventionsModule?.interventions;
      const locations = protocol.contactsLocationsModule?.locations || [];

      const companyName = sponsor?.name || identification.organization?.fullName || "Unknown Sponsor";

      if (companyName === "Unknown Sponsor") continue;

      const usLocations = locations.filter(loc => loc.country === "United States");
      const primaryLocation = usLocations[0];
      const headquarters = primaryLocation
        ? `${primaryLocation.city || ""}${primaryLocation.state ? `, ${primaryLocation.state}` : ""}`
        : null;

      const companyData: CompanyResult = {
        name: companyName,
        indication: conditions.slice(0, 3).join(", ") || "Not specified",
        phase: normalizePhase(phases),
        trial_id: identification.nctId,
        therapeutic_area: determineTherapeuticArea(interventions),
        headquarters: headquarters && headquarters.trim() ? headquarters : null,
        notes: identification.briefTitle,
        status: protocol.statusModule.overallStatus,
        trial_title: identification.briefTitle,
      };

      if (!companiesMap.has(companyName)) {
        companiesMap.set(companyName, []);
      }
      companiesMap.get(companyName)!.push(companyData);
    }

    const companies: CompanyResult[] = [];

    for (const [companyName, trials] of companiesMap) {
      const activePhase123Trials = trials.filter(t => {
        const isActive = ["RECRUITING", "ACTIVE_NOT_RECRUITING", "ENROLLING_BY_INVITATION", "NOT_YET_RECRUITING"].includes(
          t.status.toUpperCase().replace(", ", "_").replace(" ", "_")
        );
        const isPhase123 = ["Phase I", "Phase I/II", "Phase II", "Phase II/III", "Phase III"].includes(t.phase);
        return isActive && isPhase123;
      });

      if (activePhase123Trials.length === 0) continue;

      const phaseOrder = ["Phase III", "Phase II/III", "Phase II", "Phase I/II", "Phase I"];
      activePhase123Trials.sort((a, b) => {
        const aIndex = phaseOrder.indexOf(a.phase);
        const bIndex = phaseOrder.indexOf(b.phase);
        return aIndex - bIndex;
      });

      const bestTrial = activePhase123Trials[0];

      const allConditions = [...new Set(activePhase123Trials.flatMap(t => t.indication.split(", ")))];
      const allTherapeuticAreas = [...new Set(activePhase123Trials.map(t => t.therapeutic_area))];

      companies.push({
        ...bestTrial,
        indication: allConditions.slice(0, 5).join(", "),
        therapeutic_area: allTherapeuticAreas.join(", "),
        notes: `${activePhase123Trials.length} active Phase I/II/III trial(s). Lead program: ${bestTrial.trial_title}`,
      });
    }

    const phaseOrder = ["Phase III", "Phase II/III", "Phase II", "Phase I/II", "Phase I", "Not Applicable"];
    companies.sort((a, b) => {
      const aIndex = phaseOrder.indexOf(a.phase);
      const bIndex = phaseOrder.indexOf(b.phase);
      return aIndex - bIndex;
    });

    return new Response(
      JSON.stringify({
        companies,
        totalTrialsFound: studies.length,
        uniqueCompanies: companies.length,
        searchQuery,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in search-companies function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
