import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

interface CompanyData {
  name: string;
  indication: string;
  phase: string;
  trial_id: string;
  therapeutic_area: string;
  headquarters: string | null;
  notes: string;
}

function normalizePhase(phases: string[] | undefined): string {
  if (!phases || phases.length === 0) return "Phase I";

  const hasPhase1 = phases.includes("PHASE1") || phases.includes("EARLY_PHASE1");
  const hasPhase2 = phases.includes("PHASE2");
  const hasPhase3 = phases.includes("PHASE3");

  if (hasPhase2 && hasPhase3) return "Phase II/III";
  if (hasPhase3) return "Phase III";
  if (hasPhase2 && hasPhase1) return "Phase I/II";
  if (hasPhase2) return "Phase II";
  if (hasPhase1) return "Phase I";

  return "Phase I";
}

function phaseToCommercializationStatus(phase: string): string {
  switch (phase) {
    case "Phase III": return "phase_3";
    case "Phase II/III": return "phase_3";
    case "Phase II": return "phase_2";
    case "Phase I/II": return "phase_1";
    case "Phase I": return "phase_1";
    case "BLA/NDA Filed": return "bla_nda_filed";
    case "Approved": return "commercialized";
    default: return "phase_1";
  }
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

async function fetchAllCGTStudies(): Promise<ClinicalTrialStudy[]> {
  const allStudies: ClinicalTrialStudy[] = [];
  const queries = [
    "gene therapy",
    "cell therapy",
    "CAR-T",
    "CAR T cell",
    "gene transfer",
    "AAV",
    "adeno-associated virus",
    "lentiviral vector",
    "CRISPR",
    "gene editing",
    "chimeric antigen receptor",
    "stem cell transplant",
    "mesenchymal stem cell",
    "mesenchymal stromal cell",
    "regenerative cell therapy",
    "autologous cell",
    "allogeneic cell",
    "oncolytic virus",
    "oncolytic viral therapy",
    "ex vivo gene therapy",
    "cell-based immunotherapy",
    "TCR therapy",
    "T cell receptor therapy",
    "NK cell therapy",
    "natural killer cell",
    "dendritic cell vaccine",
    "tumor infiltrating lymphocyte",
    "TIL therapy",
    "iPSC derived",
    "induced pluripotent stem cell",
  ];

  for (const query of queries) {
    let pageToken: string | null = null;
    let fetchedForQuery = 0;
    const maxPerQuery = 500;

    while (fetchedForQuery < maxPerQuery) {
      const url = new URL("https://clinicaltrials.gov/api/v2/studies");
      url.searchParams.set("query.intr", query);
      url.searchParams.set("query.locn", "United States");
      url.searchParams.set("filter.overallStatus", "RECRUITING,ACTIVE_NOT_RECRUITING,ENROLLING_BY_INVITATION,COMPLETED,NOT_YET_RECRUITING");
      url.searchParams.set("pageSize", "100");

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      console.log(`Fetching ${query} from ClinicalTrials.gov...`);

      const response = await fetch(url.toString(), {
        headers: { "Accept": "application/json" },
      });

      if (!response.ok) {
        console.error(`Error fetching ${query}:`, response.status);
        break;
      }

      const data = await response.json();

      if (data.studies && data.studies.length > 0) {
        allStudies.push(...data.studies);
        fetchedForQuery += data.studies.length;
      }

      if (!data.nextPageToken || data.studies.length === 0) {
        break;
      }

      pageToken = data.nextPageToken;
    }
  }

  const uniqueStudies = new Map<string, ClinicalTrialStudy>();
  for (const study of allStudies) {
    const nctId = study.protocolSection.identificationModule.nctId;
    if (!uniqueStudies.has(nctId)) {
      uniqueStudies.set(nctId, study);
    }
  }

  return Array.from(uniqueStudies.values());
}

function processStudiesToCompanies(studies: ClinicalTrialStudy[]): CompanyData[] {
  const companiesMap = new Map<string, {
    trials: ClinicalTrialStudy[];
    bestPhase: string;
    conditions: Set<string>;
    therapeuticAreas: Set<string>;
    headquarters: string | null;
  }>();

  for (const study of studies) {
    const protocol = study.protocolSection;
    const identification = protocol.identificationModule;
    const sponsor = protocol.sponsorCollaboratorsModule?.leadSponsor;
    const conditions = protocol.conditionsModule?.conditions || [];
    const phases = protocol.designModule?.phases;
    const interventions = protocol.armsInterventionsModule?.interventions;
    const locations = protocol.contactsLocationsModule?.locations || [];

    const companyName = sponsor?.name || identification.organization?.fullName;

    if (!companyName || companyName === "Unknown Sponsor") continue;

    const usLocations = locations.filter(loc => loc.country === "United States");
    const primaryLocation = usLocations[0];
    const headquarters = primaryLocation
      ? `${primaryLocation.city || ""}${primaryLocation.state ? `, ${primaryLocation.state}` : ""}`
      : null;

    const phase = normalizePhase(phases);
    const therapeuticArea = determineTherapeuticArea(interventions);

    if (!companiesMap.has(companyName)) {
      companiesMap.set(companyName, {
        trials: [],
        bestPhase: phase,
        conditions: new Set(),
        therapeuticAreas: new Set(),
        headquarters: null,
      });
    }

    const companyEntry = companiesMap.get(companyName)!;
    companyEntry.trials.push(study);
    conditions.forEach(c => companyEntry.conditions.add(c));
    companyEntry.therapeuticAreas.add(therapeuticArea);

    if (!companyEntry.headquarters && headquarters && headquarters.trim()) {
      companyEntry.headquarters = headquarters;
    }

    const phaseOrder = ["Phase III", "Phase II/III", "Phase II", "Phase I/II", "Phase I"];
    if (phaseOrder.indexOf(phase) < phaseOrder.indexOf(companyEntry.bestPhase)) {
      companyEntry.bestPhase = phase;
    }
  }

  const companies: CompanyData[] = [];

  for (const [name, data] of companiesMap) {
    const leadTrial = data.trials.sort((a, b) => {
      const phaseOrder = ["Phase III", "Phase II/III", "Phase II", "Phase I/II", "Phase I"];
      const phaseA = normalizePhase(a.protocolSection.designModule?.phases);
      const phaseB = normalizePhase(b.protocolSection.designModule?.phases);
      return phaseOrder.indexOf(phaseA) - phaseOrder.indexOf(phaseB);
    })[0];

    companies.push({
      name,
      indication: Array.from(data.conditions).slice(0, 5).join(", ") || "Not specified",
      phase: data.bestPhase,
      trial_id: leadTrial.protocolSection.identificationModule.nctId,
      therapeutic_area: Array.from(data.therapeuticAreas).join(", "),
      headquarters: data.headquarters,
      notes: `${data.trials.length} active trial(s). Lead: ${leadTrial.protocolSection.identificationModule.briefTitle}`,
    });
  }

  return companies;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Starting comprehensive CGT company sync...");

    const studies = await fetchAllCGTStudies();
    console.log(`Found ${studies.length} unique studies`);

    const companies = processStudiesToCompanies(studies);
    console.log(`Processed into ${companies.length} unique companies`);

    let addedCount = 0;
    let updatedCount = 0;
    const batchSize = 50;

    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize);

      const { data, error } = await supabase
        .from("companies")
        .upsert(
          batch.map(c => ({
            name: c.name,
            indication: c.indication,
            phase: c.phase,
            trial_id: c.trial_id,
            therapeutic_area: c.therapeutic_area,
            headquarters: c.headquarters,
            country: "United States",
            commercialization_status: phaseToCommercializationStatus(c.phase),
            notes: c.notes,
            source: "clinicaltrials.gov",
            updated_at: new Date().toISOString(),
          })),
          {
            onConflict: "name",
            ignoreDuplicates: false,
          }
        )
        .select("id");

      if (error) {
        console.error(`Error upserting batch ${i / batchSize + 1}:`, error);
        throw new Error(`Database upsert failed: ${error.message}`);
      }

      const batchCount = data?.length || 0;
      addedCount += batchCount;
      console.log(`Batch ${i / batchSize + 1}: upserted ${batchCount} companies`);
    }

    console.log(`Sync complete: ${addedCount} companies synced`);

    return new Response(
      JSON.stringify({
        success: true,
        found: companies.length,
        synced: addedCount,
        message: `Synced ${addedCount} cell/gene therapy companies`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
