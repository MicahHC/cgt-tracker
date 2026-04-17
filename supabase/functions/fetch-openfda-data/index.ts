import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DrugApplication {
  application_number: string;
  sponsor_name: string;
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
    product_type?: string[];
    route?: string[];
    substance_name?: string[];
  };
  submissions?: Array<{
    submission_type: string;
    submission_number: string;
    submission_status: string;
    submission_status_date: string;
    review_priority: string;
    submission_class_code: string;
    submission_class_code_description: string;
  }>;
  products?: Array<{
    product_number: string;
    reference_drug: string;
    brand_name: string;
    active_ingredients: Array<{
      name: string;
      strength: string;
    }>;
    reference_standard: string;
    dosage_form: string;
    route: string;
    marketing_status: string;
  }>;
}

interface AdverseEvent {
  safetyreportid: string;
  receivedate: string;
  serious: string;
  seriousnessdeath?: string;
  seriousnesslifethreatening?: string;
  seriousnesshospitalization?: string;
  patient?: {
    drug?: Array<{
      medicinalproduct: string;
      drugcharacterization: string;
    }>;
    reaction?: Array<{
      reactionmeddrapt: string;
    }>;
  };
}

interface DrugDesignation {
  application_number: string;
  sponsor_name: string;
  drug_name: string;
  generic_name: string;
  indication: string;
  development_phase: string;
  designation_date: string;
  designation_type: string;
}

interface CompetitiveDrug {
  brandName: string;
  genericName: string;
  manufacturer: string;
  approvalDate: string;
  indication: string;
  marketingStatus: string;
}

interface ExtractedFDAData {
  designations: Array<{
    type: string;
    date: string;
    indication: string;
    drugName: string;
  }>;
  approvals: Array<{
    applicationNumber: string;
    submissionType: string;
    status: string;
    date: string;
    reviewPriority?: string;
  }>;
  adverseEvents: {
    totalReports: number;
    seriousEvents: number;
    deathEvents: number;
    hospitalizationEvents: number;
  };
  marketingStatus?: string;
  competitiveDrugs?: CompetitiveDrug[];
}

async function searchDrugApplications(drugName: string, sponsorName: string): Promise<DrugApplication[]> {
  try {
    let searchQuery = '';

    if (sponsorName) {
      searchQuery = `sponsor_name:"${sponsorName}"`;
    }

    if (drugName) {
      if (searchQuery) searchQuery += '+AND+';
      searchQuery += `(openfda.brand_name:"${drugName}"+OR+openfda.generic_name:"${drugName}")`;
    }

    if (!searchQuery) {
      console.log('No search criteria provided');
      return [];
    }

    const url = `https://api.fda.gov/drug/drugsfda.json?search=${searchQuery}&limit=100`;
    console.log(`Fetching FDA drug applications: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 404) {
      console.log('No FDA drug applications found');
      return [];
    }

    if (!response.ok) {
      console.error(`OpenFDA drugsfda API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error searching drug applications:', error);
    return [];
  }
}

async function searchAdverseEvents(drugName: string): Promise<AdverseEvent[]> {
  try {
    if (!drugName) return [];

    const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${drugName}"&limit=1000`;
    console.log(`Fetching FDA adverse events for: ${drugName}`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 404) {
      console.log('No adverse events found');
      return [];
    }

    if (!response.ok) {
      console.error(`OpenFDA adverse events API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error searching adverse events:', error);
    return [];
  }
}

async function searchDrugDesignations(sponsorName: string): Promise<DrugDesignation[]> {
  try {
    if (!sponsorName) return [];

    const designationTypes = [
      'orphan',
      'breakthrough',
      'fast_track',
      'priority_review',
      'accelerated_approval',
    ];

    const allDesignations: DrugDesignation[] = [];

    for (const designationType of designationTypes) {
      try {
        const url = `https://api.fda.gov/drug/${designationType}.json?search=sponsor_name:"${sponsorName}"&limit=100`;
        console.log(`Fetching ${designationType} designations`);

        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (response.status === 404) {
          continue;
        }

        if (!response.ok) {
          console.error(`OpenFDA ${designationType} API error: ${response.status}`);
          continue;
        }

        const data = await response.json();
        if (data.results) {
          allDesignations.push(...data.results.map((d: any) => ({
            ...d,
            designation_type: designationType,
          })));
        }
      } catch (error) {
        console.error(`Error fetching ${designationType} designations:`, error);
      }
    }

    return allDesignations;
  } catch (error) {
    console.error('Error searching drug designations:', error);
    return [];
  }
}

async function searchCompetitiveDrugs(indication: string): Promise<CompetitiveDrug[]> {
  try {
    if (!indication) return [];

    console.log(`Searching ClinicalTrials.gov for competitive programs in: ${indication}`);

    const cleanIndication = indication
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const ctUrl = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(cleanIndication)}&filter.overallStatus=COMPLETED,ACTIVE_NOT_RECRUITING&query.phase=PHASE3&pageSize=100&format=json`;

    const ctResponse = await fetch(ctUrl, {
      headers: { 'Accept': 'application/json' },
    });

    if (!ctResponse.ok) {
      console.error(`ClinicalTrials.gov API error: ${ctResponse.status}`);
      return [];
    }

    const ctData = await ctResponse.json();
    const studies = ctData.studies || [];

    console.log(`Found ${studies.length} Phase 3 trials in ${indication}`);

    const uniqueCompetitors = new Map<string, CompetitiveDrug>();

    for (const study of studies) {
      const protocol = study.protocolSection;
      if (!protocol) continue;

      const interventions = protocol.armsInterventionsModule?.interventions || [];
      const sponsorName = protocol.sponsorCollaboratorsModule?.leadSponsor?.name || 'Unknown';
      const completionDate = protocol.statusModule?.completionDateStruct?.date ||
                            protocol.statusModule?.primaryCompletionDateStruct?.date ||
                            'Unknown';

      for (const intervention of interventions) {
        if (intervention.type === 'DRUG' || intervention.type === 'BIOLOGICAL') {
          const drugName = intervention.name;
          if (!drugName || drugName.toLowerCase() === 'placebo') continue;

          const key = `${drugName}_${sponsorName}`;
          if (!uniqueCompetitors.has(key)) {
            uniqueCompetitors.set(key, {
              brandName: drugName,
              genericName: intervention.description || drugName,
              manufacturer: sponsorName,
              approvalDate: completionDate,
              indication: indication,
              marketingStatus: protocol.statusModule?.overallStatus || 'Unknown',
            });
          }
        }
      }
    }

    const competitors = Array.from(uniqueCompetitors.values());
    console.log(`Identified ${competitors.length} unique competitive programs`);

    return competitors;
  } catch (error) {
    console.error('Error searching competitive drugs:', error);
    return [];
  }
}

function extractFDAData(
  applications: DrugApplication[],
  adverseEvents: AdverseEvent[],
  designations: DrugDesignation[],
  competitiveDrugs: CompetitiveDrug[]
): ExtractedFDAData {
  const result: ExtractedFDAData = {
    designations: [],
    approvals: [],
    adverseEvents: {
      totalReports: adverseEvents.length,
      seriousEvents: 0,
      deathEvents: 0,
      hospitalizationEvents: 0,
    },
  };

  for (const designation of designations) {
    result.designations.push({
      type: designation.designation_type
        .replace('_', ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase()),
      date: designation.designation_date || 'Unknown',
      indication: designation.indication || 'Unknown',
      drugName: designation.drug_name || designation.generic_name || 'Unknown',
    });
  }

  for (const app of applications) {
    if (app.submissions) {
      for (const submission of app.submissions) {
        result.approvals.push({
          applicationNumber: app.application_number,
          submissionType: submission.submission_type,
          status: submission.submission_status,
          date: submission.submission_status_date,
          reviewPriority: submission.review_priority,
        });
      }
    }

    if (app.products && app.products.length > 0) {
      result.marketingStatus = app.products[0].marketing_status;
    }
  }

  for (const event of adverseEvents) {
    if (event.serious === '1') {
      result.adverseEvents.seriousEvents++;
    }
    if (event.seriousnessdeath === '1') {
      result.adverseEvents.deathEvents++;
    }
    if (event.seriousnesshospitalization === '1') {
      result.adverseEvents.hospitalizationEvents++;
    }
  }

  if (competitiveDrugs.length > 0) {
    result.competitiveDrugs = competitiveDrugs;
  }

  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { companyName, drugName, indication, companyId, forceRefresh } = await req.json();

    if (!companyName && !drugName) {
      return new Response(
        JSON.stringify({ error: 'Company name or drug name is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    if (companyId && !forceRefresh) {
      const { data: cachedData } = await supabase
        .from('api_data_cache')
        .select('*')
        .eq('company_id', companyId)
        .eq('api_source', 'openfda')
        .eq('data_type', 'drug_data')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cachedData) {
        console.log(`Using cached OpenFDA data for company: ${companyName}`);
        return new Response(
          JSON.stringify({
            data: cachedData.cached_data,
            cached: true,
            fetchedAt: cachedData.fetched_at
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    if (forceRefresh) {
      console.log(`Force refreshing OpenFDA data for company: ${companyName}`);
    }

    console.log(`Fetching OpenFDA data for company: ${companyName}, drug: ${drugName}, indication: ${indication}`);

    const [applications, adverseEvents, designations, competitiveDrugs] = await Promise.all([
      searchDrugApplications(drugName || '', companyName),
      drugName ? searchAdverseEvents(drugName) : Promise.resolve([]),
      searchDrugDesignations(companyName),
      indication ? searchCompetitiveDrugs(indication) : Promise.resolve([]),
    ]);

    const extractedData = extractFDAData(applications, adverseEvents, designations, competitiveDrugs);

    const responseData = {
      companyName: companyName,
      drugName: drugName,
      indication: indication,
      extractedData: extractedData,
      foundApplications: applications.length,
      foundAdverseEvents: adverseEvents.length,
      foundDesignations: designations.length,
      foundCompetitiveDrugs: competitiveDrugs.length,
    };

    if (companyId) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await supabase
        .from('api_data_cache')
        .upsert({
          company_id: companyId,
          api_source: 'openfda',
          data_type: 'drug_data',
          cache_key: `${companyName}_${drugName || 'unknown'}`,
          cached_data: responseData,
          fetched_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        }, {
          onConflict: 'company_id,api_source,data_type',
        });

      console.log(`Cached OpenFDA data for company: ${companyName}`);
    }

    return new Response(
      JSON.stringify({
        data: responseData,
        cached: false,
        fetchedAt: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
