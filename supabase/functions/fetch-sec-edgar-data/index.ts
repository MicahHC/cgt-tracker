import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EdgarFiling {
  accessionNumber: string;
  filingDate: string;
  formType: string;
  fileNumber: string;
  filmNumber: string;
  description: string;
  size: string;
  primaryDocument: string;
  primaryDocDescription: string;
}

interface EdgarCompanyData {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  insiderTransactionForOwnerExists: number;
  insiderTransactionForIssuerExists: number;
  name: string;
  tickers: string[];
  exchanges: string[];
  ein: string;
  description: string;
  website: string;
  investorWebsite: string;
  category: string;
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  stateOfIncorporationDescription: string;
  addresses: {
    mailing: any;
    business: any;
  };
  phone: string;
  flags: string;
  formerNames: any[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      acceptanceDateTime: string[];
      act: string[];
      form: string[];
      fileNumber: string[];
      filmNumber: string[];
      items: string[];
      size: number[];
      isXBRL: number[];
      isInlineXBRL: number[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

interface ExtractedData {
  funding: Array<{
    type: string;
    amount?: string;
    date?: string;
    investors?: string;
    source: string;
  }>;
  partnerships: Array<{
    partner: string;
    type: string;
    date?: string;
    details?: string;
    source: string;
  }>;
  fdaEngagement: Array<{
    type: string;
    date?: string;
    details: string;
    source: string;
  }>;
  valuations: Array<{
    amount?: string;
    date?: string;
    context: string;
    source: string;
  }>;
}

async function searchCompanyByCIK(companyName: string): Promise<string | null> {
  try {
    const apiKey = Deno.env.get('SEC_EDGAR_API_KEY');
    if (!apiKey) {
      console.error('SEC_EDGAR_API_KEY not configured');
      return null;
    }

    const response = await fetch(
      'https://www.sec.gov/cgi-bin/browse-edgar?company=' + encodeURIComponent(companyName) + '&action=getcompany&output=atom',
      {
        headers: {
          'User-Agent': apiKey,
          'Accept': 'application/atom+xml',
        },
      }
    );

    if (!response.ok) {
      console.error(`SEC EDGAR search failed: ${response.status}`);
      return null;
    }

    const text = await response.text();
    const cikMatch = text.match(/CIK=(\d{10})/);
    return cikMatch ? cikMatch[1] : null;
  } catch (error) {
    console.error('Error searching for CIK:', error);
    return null;
  }
}

async function getCompanyFilings(cik: string): Promise<EdgarCompanyData | null> {
  try {
    const apiKey = Deno.env.get('SEC_EDGAR_API_KEY');
    if (!apiKey) {
      console.error('SEC_EDGAR_API_KEY not configured');
      return null;
    }

    const paddedCik = cik.padStart(10, '0');
    const response = await fetch(
      `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
      {
        headers: {
          'User-Agent': apiKey,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`SEC EDGAR filings fetch failed: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching company filings:', error);
    return null;
  }
}

async function fetchFilingContent(accessionNumber: string, primaryDocument: string, cik: string): Promise<string | null> {
  try {
    const apiKey = Deno.env.get('SEC_EDGAR_API_KEY');
    if (!apiKey) return null;

    const accessionNumberClean = accessionNumber.replace(/-/g, '');
    const paddedCik = cik.padStart(10, '0');

    const url = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accessionNumberClean}/${primaryDocument}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': apiKey,
        'Accept': 'text/html,text/plain',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch filing content: ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error('Error fetching filing content:', error);
    return null;
  }
}

function extractRelevantData(filings: EdgarCompanyData): ExtractedData {
  const result: ExtractedData = {
    funding: [],
    partnerships: [],
    fdaEngagement: [],
    valuations: [],
  };

  const recentFilings = filings.filings.recent;
  const relevantForms = ['8-K', '10-K', '10-Q', 'S-1', '424B4', 'DEF 14A'];

  for (let i = 0; i < Math.min(recentFilings.form.length, 50); i++) {
    const form = recentFilings.form[i];
    const date = recentFilings.filingDate[i];
    const accessionNumber = recentFilings.accessionNumber[i];
    const description = recentFilings.primaryDocDescription[i];

    if (!relevantForms.includes(form)) continue;

    const descLower = (description || '').toLowerCase();
    const items = (recentFilings.items[i] || '').toLowerCase();

    if (
      descLower.includes('financing') ||
      descLower.includes('funding') ||
      descLower.includes('series') ||
      descLower.includes('private placement') ||
      items.includes('1.01')
    ) {
      result.funding.push({
        type: descLower.includes('series') ? 'Series Funding' : 'Financing',
        amount: undefined,
        date: date,
        investors: undefined,
        source: `SEC Filing ${form} - ${accessionNumber}. ${description}`,
      });
    }

    if (
      descLower.includes('partnership') ||
      descLower.includes('collaboration') ||
      descLower.includes('agreement') ||
      items.includes('1.01') ||
      items.includes('8.01')
    ) {
      result.partnerships.push({
        partner: 'Unknown',
        type: 'Strategic Agreement',
        date: date,
        details: description,
        source: `SEC Filing ${form} - ${accessionNumber}`,
      });
    }

    if (
      descLower.includes('fda') ||
      descLower.includes('pre-nda') ||
      descLower.includes('pre-bla') ||
      descLower.includes('regulatory')
    ) {
      result.fdaEngagement.push({
        type: 'FDA Interaction',
        date: date,
        details: description,
        source: `SEC Filing ${form} - ${accessionNumber}`,
      });
    }

    if (
      form === 'S-1' ||
      form === '424B4' ||
      descLower.includes('valuation') ||
      descLower.includes('offering')
    ) {
      result.valuations.push({
        date: date,
        context: description,
        source: `SEC Filing ${form} - ${accessionNumber}`,
      });
    }
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
    const { companyName, companyId, forceRefresh } = await req.json();

    if (!companyName) {
      return new Response(
        JSON.stringify({ error: 'Company name is required' }),
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
        .eq('api_source', 'sec_edgar')
        .eq('data_type', 'filings')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cachedData) {
        console.log(`Using cached SEC EDGAR data for company: ${companyName}`);
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
      console.log(`Force refreshing SEC EDGAR data for company: ${companyName}`);
    }

    console.log(`Fetching SEC EDGAR data for company: ${companyName}`);

    const cik = await searchCompanyByCIK(companyName);

    if (!cik) {
      return new Response(
        JSON.stringify({
          error: 'Company not found in SEC EDGAR database',
          data: null
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found CIK: ${cik} for company: ${companyName}`);

    const filings = await getCompanyFilings(cik);

    if (!filings) {
      return new Response(
        JSON.stringify({
          error: 'Could not fetch company filings',
          data: null
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const extractedData = extractRelevantData(filings);

    const responseData = {
      cik: cik,
      companyName: filings.name,
      website: filings.website,
      category: filings.category,
      sic: filings.sic,
      sicDescription: filings.sicDescription,
      extractedData: extractedData,
      totalFilings: filings.filings.recent.form.length,
    };

    if (companyId) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await supabase
        .from('api_data_cache')
        .upsert({
          company_id: companyId,
          api_source: 'sec_edgar',
          data_type: 'filings',
          cache_key: cik,
          cached_data: responseData,
          fetched_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        }, {
          onConflict: 'company_id,api_source,data_type',
        });

      console.log(`Cached SEC EDGAR data for company: ${companyName}`);
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
