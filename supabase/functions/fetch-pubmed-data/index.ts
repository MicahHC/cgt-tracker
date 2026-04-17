import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PubMedArticle {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  publicationDate: string;
  journal: string;
  doi?: string;
  relevance: {
    isPhaseIITrial: boolean;
    hasEfficacyData: boolean;
    hasPValue: boolean;
    hasStatisticalSignificance: boolean;
  };
}

interface ExtractedEfficacyData {
  phase2Articles: PubMedArticle[];
  efficacySummary: {
    hasStatisticallySignificantResults: boolean;
    pValues: string[];
    primaryEndpoints: string[];
    keyFindings: string[];
  };
}

async function searchPubMed(query: string): Promise<string[]> {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=20&sort=relevance`;

    const response = await fetch(searchUrl);
    if (!response.ok) {
      console.error(`PubMed search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.esearchresult?.idlist || [];
  } catch (error) {
    console.error('PubMed search error:', error);
    return [];
  }
}

async function fetchPubMedArticles(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];

  try {
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      console.error(`PubMed fetch failed: ${response.status}`);
      return [];
    }

    const xmlText = await response.text();
    return parseArticlesFromXML(xmlText);
  } catch (error) {
    console.error('PubMed fetch error:', error);
    return [];
  }
}

function parseArticlesFromXML(xml: string): PubMedArticle[] {
  const articles: PubMedArticle[] = [];

  const articleMatches = xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g);

  for (const match of articleMatches) {
    const articleXML = match[1];

    const pmidMatch = articleXML.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    const titleMatch = articleXML.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
    const abstractMatch = articleXML.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
    const journalMatch = articleXML.match(/<Title>(.*?)<\/Title>/);
    const doiMatch = articleXML.match(/<ArticleId IdType="doi">(.*?)<\/ArticleId>/);

    const yearMatch = articleXML.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
    const monthMatch = articleXML.match(/<PubDate>[\s\S]*?<Month>(\w+)<\/Month>/);

    const authorMatches = articleXML.matchAll(/<Author[^>]*>[\s\S]*?<LastName>(.*?)<\/LastName>[\s\S]*?<ForeName>(.*?)<\/ForeName>[\s\S]*?<\/Author>/g);
    const authors = Array.from(authorMatches, m => `${m[1]} ${m[2]}`);

    if (!pmidMatch || !titleMatch) continue;

    const title = titleMatch[1].replace(/<[^>]*>/g, '');
    const abstract = abstractMatch ? abstractMatch[1].replace(/<[^>]*>/g, '') : '';
    const fullText = `${title} ${abstract}`.toLowerCase();

    const isPhaseIITrial = /phase\s*(ii|2|two|iii|3|three)/i.test(fullText);
    const hasPValue = /p\s*[<=>]\s*0\.\d+/i.test(fullText);
    const hasStatisticalSignificance = /statistically significant|p\s*<\s*0\.05/i.test(fullText);
    const hasEfficacyData = /efficacy|primary endpoint|response rate|survival|hazard ratio|objective response/i.test(fullText);

    articles.push({
      pmid: pmidMatch[1],
      title,
      abstract,
      authors: authors.slice(0, 5),
      publicationDate: `${yearMatch?.[1] || ''}${monthMatch?.[1] ? `-${monthMatch[1]}` : ''}`,
      journal: journalMatch ? journalMatch[1].replace(/<[^>]*>/g, '') : '',
      doi: doiMatch?.[1],
      relevance: {
        isPhaseIITrial,
        hasEfficacyData,
        hasPValue,
        hasStatisticalSignificance,
      },
    });
  }

  return articles;
}

function extractEfficacyData(articles: PubMedArticle[]): ExtractedEfficacyData {
  const phase2Articles = articles.filter(a =>
    a.relevance.isPhaseIITrial && a.relevance.hasEfficacyData
  );

  const pValues: string[] = [];
  const primaryEndpoints: string[] = [];
  const keyFindings: string[] = [];
  let hasStatisticallySignificantResults = false;

  for (const article of phase2Articles) {
    const text = `${article.title} ${article.abstract}`;

    const pValueMatches = text.matchAll(/p\s*[<=>]\s*(0\.\d+)/gi);
    for (const match of pValueMatches) {
      pValues.push(match[0]);
      if (/p\s*<\s*0\.05/i.test(match[0])) {
        hasStatisticallySignificantResults = true;
      }
    }

    const endpointMatches = text.matchAll(/primary endpoint[^.]*?([^.]{20,100})/gi);
    for (const match of endpointMatches) {
      primaryEndpoints.push(match[1].trim());
    }

    if (article.relevance.hasStatisticalSignificance) {
      keyFindings.push(`${article.title} (PMID: ${article.pmid}): Published in ${article.journal}, ${article.publicationDate}`);
    }
  }

  return {
    phase2Articles,
    efficacySummary: {
      hasStatisticallySignificantResults,
      pValues: [...new Set(pValues)].slice(0, 10),
      primaryEndpoints: [...new Set(primaryEndpoints)].slice(0, 5),
      keyFindings: keyFindings.slice(0, 3),
    },
  };
}

async function checkCache(cacheKey: string, companyId?: string): Promise<any> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('api_data_cache')
      .select('cached_data, fetched_at')
      .eq('cache_key', cacheKey)
      .eq('api_source', 'pubmed')
      .eq('data_type', 'publications')
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const cacheAge = Date.now() - new Date(data.fetched_at).getTime();
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

    if (cacheAge < ONE_WEEK) {
      console.log(`Cache hit for ${cacheKey} (age: ${Math.round(cacheAge / 1000 / 60 / 60)} hours)`);
      return data.cached_data;
    }

    return null;
  } catch (error) {
    console.error('Cache check error:', error);
    return null;
  }
}

async function saveToCache(cacheKey: string, data: any, companyId?: string): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await supabase
      .from('api_data_cache')
      .upsert({
        company_id: companyId || null,
        api_source: 'pubmed',
        data_type: 'publications',
        cache_key: cacheKey,
        cached_data: data,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'company_id,api_source,data_type',
      });

    console.log(`Saved to cache: ${cacheKey}`);
  } catch (error) {
    console.error('Cache save error:', error);
  }
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

    if (!companyName) {
      return new Response(
        JSON.stringify({ error: 'Company name is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const cacheKey = `pubmed:${companyName}:${drugName || ''}:${indication || ''}`.toLowerCase();

    if (!forceRefresh) {
      const cachedData = await checkCache(cacheKey, companyId);
      if (cachedData) {
        return new Response(
          JSON.stringify({ data: cachedData, cached: true }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    if (forceRefresh) {
      console.log(`Force refreshing PubMed data for company: ${companyName}`);
    }

    console.log(`Searching PubMed for: ${companyName}${drugName ? ` ${drugName}` : ''}${indication ? ` ${indication}` : ''}`);

    const searchTerms = [
      `${companyName} AND (phase 2[Title/Abstract] OR phase 3[Title/Abstract] OR clinical trial[Title/Abstract])`,
      drugName ? `${drugName} AND (phase 2[Title/Abstract] OR phase 3[Title/Abstract] OR clinical trial[Title/Abstract])` : null,
      indication ? `${companyName} AND ${indication} AND (phase 2[Title/Abstract] OR phase 3[Title/Abstract])` : null,
    ].filter(Boolean);

    let allPmids: Set<string> = new Set();

    for (const term of searchTerms) {
      const pmids = await searchPubMed(term as string);
      pmids.forEach(id => allPmids.add(id));
      await new Promise(resolve => setTimeout(resolve, 350));
    }

    console.log(`Found ${allPmids.size} unique PubMed articles`);

    const pmidArray = Array.from(allPmids);
    const articles = await fetchPubMedArticles(pmidArray);

    const extractedData = extractEfficacyData(articles);

    const result = {
      extractedData,
      totalArticles: articles.length,
      phase2Articles: extractedData.phase2Articles.length,
      searchTerms,
      fetchedAt: new Date().toISOString(),
    };

    await saveToCache(cacheKey, result, companyId);

    return new Response(
      JSON.stringify({ data: result, cached: false }),
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
