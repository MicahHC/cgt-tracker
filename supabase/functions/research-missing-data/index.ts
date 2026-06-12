import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CompanyInfo {
  name: string;
  indication: string;
  phase: string;
  trial_id?: string;
  website?: string;
  therapeutic_area?: string;
}

interface ResearchQuery {
  category: string;
  question: string;
  searchQuery: string;
}

async function searchWithTavily(query: string, timeoutMs: number = 8000): Promise<any> {
  try {
    const tavilyApiKey = Deno.env.get('TAVILY_API_KEY');
    if (!tavilyApiKey) {
      console.error('TAVILY_API_KEY not configured');
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: query,
        search_depth: 'basic', // Use basic for faster results
        include_answer: true,
        include_raw_content: false,
        max_results: 3, // Reduce to 3 for faster processing
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Tavily search failed: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Tavily search timed out');
    } else {
      console.error('Error searching with Tavily:', error);
    }
    return null;
  }
}

async function analyzeWithClaude(context: string, question: string, timeoutMs: number = 15000): Promise<string> {
  try {
    const claudeApiKey = Deno.env.get('Claude_API_Key');
    if (!claudeApiKey) {
      console.error('Claude_API_Key not configured');
      return '';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: 'You are a biotech research analyst. Provide concise, factual answers based on the given context. If the information is not sufficient, say "Information not found".',
        messages: [
          {
            role: 'user',
            content: `Based on the following research context about a biotech company, answer this specific question concisely:\n\nCONTEXT:\n${context}\n\nQUESTION:\n${question}`,
          },
        ],
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Claude API failed: ${response.status}`);
      return '';
    }

    const result = await response.json();
    return result.content?.[0]?.text || '';
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Claude API timed out');
    } else {
      console.error('Error analyzing with Claude:', error);
    }
    return '';
  }
}

function buildResearchQueries(companyInfo: CompanyInfo): ResearchQuery[] {
  const companyName = companyInfo.name;
  const indication = companyInfo.indication;

  return [
    {
      category: 'phase2_efficacy',
      question: 'What were the Phase 2 clinical trial results? Include p-values, primary endpoints, and statistical significance.',
      searchQuery: `${companyName} ${indication} Phase 2 clinical trial results efficacy p-value`,
    },
    {
      category: 'safety_profile',
      question: 'Are there any FDA clinical holds, serious adverse events (SAEs), or safety concerns? Include Grade 3+ SAE percentages if available.',
      searchQuery: `${companyName} ${indication} safety adverse events clinical hold FDA SAE`,
    },
    {
      category: 'regulatory_designations',
      question: 'What FDA designations has this drug received (Breakthrough Therapy, Orphan Drug, Fast Track, Priority Review)?',
      searchQuery: `${companyName} ${indication} FDA Breakthrough Therapy Orphan Drug designation`,
    },
    {
      category: 'fda_engagement',
      question: 'Has the company disclosed any FDA meetings, pre-NDA/BLA meetings, or regulatory interactions?',
      searchQuery: `${companyName} FDA meeting pre-NDA pre-BLA regulatory interaction`,
    },
    {
      category: 'recent_funding',
      question: 'What is the most recent funding round (amount, series, date, investors)?',
      searchQuery: `${companyName} funding round Series C Series D investment raised`,
    },
    {
      category: 'strategic_partnerships',
      question: 'Does the company have any strategic partnerships with pharma companies (co-development, commercialization deals)?',
      searchQuery: `${companyName} partnership collaboration pharma deal commercialization`,
    },
    {
      category: 'valuation',
      question: 'What is the company\'s most recent post-money valuation?',
      searchQuery: `${companyName} valuation post-money Series funding`,
    },
    {
      category: 'market_size',
      question: 'What is the market size and unmet need for this indication?',
      searchQuery: `${indication} market size unmet need patient population prevalence`,
    },
    {
      category: 'differentiation',
      question: 'Is this drug first-in-class, best-in-class, or how does it compare to competitors?',
      searchQuery: `${companyName} ${indication} first-in-class best-in-class competitive landscape`,
    },
    {
      category: 'commercial_readiness',
      question: 'Has the company made any commercial preparations (hired CCO, commercial team, market access)?',
      searchQuery: `${companyName} Chief Commercial Officer CCO commercial team hiring`,
    },
  ];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { companyInfo, missingCategories } = await req.json();

    if (!companyInfo || !companyInfo.name || !companyInfo.indication) {
      return new Response(
        JSON.stringify({ error: 'Company info with name and indication is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Researching missing data for: ${companyInfo.name}`);
    console.log(`Missing categories:`, missingCategories);

    const queries = buildResearchQueries(companyInfo);
    const targetQueries = missingCategories && missingCategories.length > 0
      ? queries.filter(q => missingCategories.includes(q.category))
      : queries;

    const researchResults: Record<string, any> = {};

    // Process queries in parallel batches of 5 with tighter timeouts
    const batchSize = 5;
    for (let i = 0; i < targetQueries.length; i += batchSize) {
      const batch = targetQueries.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (query) => {
          console.log(`\n=== Researching: ${query.category} ===`);
          console.log(`Search query: ${query.searchQuery}`);

          try {
            // Search with Tavily (8s timeout)
            const searchResults = await searchWithTavily(query.searchQuery, 8000);

            if (searchResults && searchResults.results && searchResults.results.length > 0) {
              const context = searchResults.results
                .map((r: any) => `Source: ${r.url}\n${r.content}`)
                .join('\n\n');

              const answer = await analyzeWithClaude(context, query.question, 15000);

              if (answer && answer !== 'Information not found' && answer.trim() !== '') {
                researchResults[query.category] = {
                  question: query.question,
                  answer: answer,
                  sources: searchResults.results.map((r: any) => ({
                    url: r.url,
                    title: r.title,
                  })),
                  tavilyAnswer: searchResults.answer || '',
                };
                console.log(`✓ Found data: ${answer.substring(0, 150)}...`);
              } else {
                researchResults[query.category] = {
                  question: query.question,
                  answer: 'Couldn\'t find details - manual research needed',
                  sources: [],
                };
                console.log(`✗ No conclusive information found`);
              }
            } else {
              researchResults[query.category] = {
                question: query.question,
                answer: 'Couldn\'t find details - manual research needed',
                sources: [],
              };
              console.log(`✗ No search results found`);
            }
          } catch (error) {
            console.error(`Error researching ${query.category}:`, error);
            researchResults[query.category] = {
              question: query.question,
              answer: 'Couldn\'t find details - manual research needed',
              sources: [],
            };
          }
        })
      );

      // Minimal delay between batches
      if (i + batchSize < targetQueries.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return new Response(
      JSON.stringify({
        companyName: companyInfo.name,
        researchResults: researchResults,
        queriesProcessed: targetQueries.length,
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
