import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { companyInfo, companyId } = await req.json();

    if (!companyInfo || !companyInfo.name || !companyInfo.indication) {
      return new Response(
        JSON.stringify({ error: 'Company name and indication are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!companyId) {
      return new Response(
        JSON.stringify({ error: 'Company ID is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Auto-scoring company: ${companyInfo.name} (${companyId})`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: job, error: jobError } = await supabase
      .from('research_jobs')
      .insert({
        company_id: companyId,
        status: 'pending',
        progress: 0,
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error('Failed to create research job:', jobError);
      return new Response(
        JSON.stringify({ error: 'Failed to start scoring process', details: jobError?.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Created research job ${job.id}, triggering processor...`);

    try {
      const triggerResponse = await fetch(
        `${supabaseUrl}/functions/v1/process-research-job`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey,
          },
          body: JSON.stringify({
            jobId: job.id,
            companyId,
            companyInfo,
          }),
        }
      );

      if (!triggerResponse.ok) {
        const errorText = await triggerResponse.text();
        console.error(`process-research-job trigger failed: ${triggerResponse.status}`, errorText);

        await supabase
          .from('research_jobs')
          .update({ status: 'failed', error: `Failed to start processor: ${triggerResponse.status} - ${errorText}` })
          .eq('id', job.id);

        return new Response(
          JSON.stringify({ error: `Failed to start research processor: ${triggerResponse.status}` }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } catch (fetchError) {
      console.error('Network error triggering process-research-job:', fetchError);

      await supabase
        .from('research_jobs')
        .update({ status: 'failed', error: `Network error triggering processor: ${fetchError instanceof Error ? fetchError.message : 'Unknown'}` })
        .eq('id', job.id);

      return new Response(
        JSON.stringify({ error: 'Network error starting research processor' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        message: 'Scoring started. Research and scoring will complete in the background.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
