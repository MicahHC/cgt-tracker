import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function triggerProcessJob(
  supabaseUrl: string,
  supabaseServiceKey: string,
  jobId: string,
  companyId: string,
  companyInfo: {
    name: string;
    indication: string;
    phase: string;
    trial_id: string | null;
    website: string | null;
    therapeutic_area: string | null;
  }
): Promise<{ success: boolean; companyName: string; error?: string }> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/process-research-job`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey,
      },
      body: JSON.stringify({
        jobId,
        companyId,
        companyInfo,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "Unknown");
      return { success: false, companyName: companyInfo.name, error: `HTTP ${resp.status}: ${errText}` };
    }

    return { success: true, companyName: companyInfo.name };
  } catch (err) {
    return {
      success: false,
      companyName: companyInfo.name,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let companyIds: string[] = [];
    let batchSize = 25;
    let phasesFilter: string[] = ["Phase II", "Phase II/III", "Phase III"];
    let concurrency = 5;

    try {
      const body = await req.json();
      if (body.companyIds && Array.isArray(body.companyIds)) {
        companyIds = body.companyIds;
      }
      if (body.batchSize && typeof body.batchSize === "number") {
        batchSize = Math.min(body.batchSize, 50);
      }
      if (body.phases && Array.isArray(body.phases)) {
        phasesFilter = body.phases;
      }
      if (body.concurrency && typeof body.concurrency === "number") {
        concurrency = Math.min(body.concurrency, 10);
      }
    } catch {
      // empty body = score all unscored Phase II/III
    }

    // Clean up stale jobs first (pending/processing for more than 10 minutes)
    await supabase
      .from("research_jobs")
      .update({ status: "failed", error: "Stale job cleaned up by batch-score", updated_at: new Date().toISOString() })
      .in("status", ["pending", "processing"])
      .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    let targetCompanies: Array<{
      id: string;
      name: string;
      indication: string;
      phase: string;
      trial_id: string | null;
      website: string | null;
      therapeutic_area: string | null;
    }>;

    if (companyIds.length > 0) {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, indication, phase, trial_id, website, therapeutic_area")
        .in("id", companyIds);

      if (error) return jsonResponse({ error: error.message }, 500);
      targetCompanies = data || [];
    } else {
      const { data: allCompanies, error } = await supabase
        .from("companies")
        .select("id, name, indication, phase, trial_id, website, therapeutic_area")
        .in("phase", phasesFilter)
        .order("phase", { ascending: false })
        .order("name");

      if (error) return jsonResponse({ error: error.message }, 500);
      if (!allCompanies || allCompanies.length === 0) {
        return jsonResponse({ message: "No companies found matching phase filter" });
      }

      const { data: scored } = await supabase
        .from("company_scores")
        .select("company_id");

      const scoredSet = new Set((scored || []).map((s) => s.company_id));
      targetCompanies = allCompanies.filter((c) => !scoredSet.has(c.id));
    }

    if (targetCompanies.length === 0) {
      return jsonResponse({
        success: true,
        message: "All companies in the selected phases already have scores",
        jobsCreated: 0,
        triggered: 0,
        remaining: 0,
      });
    }

    const { data: existingJobs } = await supabase
      .from("research_jobs")
      .select("company_id, status")
      .in("company_id", targetCompanies.map((c) => c.id))
      .in("status", ["pending", "processing", "completed"]);

    const excludeSet = new Set((existingJobs || []).map((j) => j.company_id));
    targetCompanies = targetCompanies.filter((c) => !excludeSet.has(c.id));

    if (targetCompanies.length === 0) {
      return jsonResponse({
        success: true,
        message: "All selected companies already have scoring jobs in progress",
        jobsCreated: 0,
        triggered: 0,
        remaining: 0,
      });
    }

    const batch = targetCompanies.slice(0, batchSize);

    const jobInserts = batch.map((c) => ({
      company_id: c.id,
      status: "pending" as const,
      progress: 0,
    }));

    const { data: jobs, error: insertError } = await supabase
      .from("research_jobs")
      .insert(jobInserts)
      .select("id, company_id");

    if (insertError) {
      return jsonResponse({ error: `Failed to create jobs: ${insertError.message}` }, 500);
    }

    const companyMap = new Map(batch.map((c) => [c.id, c]));
    let triggered = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process in small concurrent groups
    const jobList = jobs || [];
    for (let i = 0; i < jobList.length; i += concurrency) {
      const chunk = jobList.slice(i, i + concurrency);
      const promises = chunk.map((job) => {
        const company = companyMap.get(job.company_id);
        if (!company) return Promise.resolve({ success: false, companyName: "unknown", error: "Company not found" });
        return triggerProcessJob(supabaseUrl, supabaseServiceKey, job.id, company.id, {
          name: company.name,
          indication: company.indication,
          phase: company.phase,
          trial_id: company.trial_id,
          website: company.website,
          therapeutic_area: company.therapeutic_area,
        });
      });

      const results = await Promise.all(promises);
      for (const r of results) {
        if (r.success) {
          triggered++;
        } else {
          failed++;
          errors.push(`${r.companyName}: ${r.error}`);
        }
      }

      if (i + concurrency < jobList.length) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const remaining = targetCompanies.length - batch.length;

    return jsonResponse({
      success: true,
      jobsCreated: jobList.length,
      triggered,
      failed,
      batchSize: batch.length,
      totalEligible: targetCompanies.length,
      remaining,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
      message: remaining > 0
        ? `Queued ${batch.length} companies. ${remaining} more remain -- call again to process the next batch.`
        : `Queued all ${batch.length} remaining companies for scoring.`,
    });
  } catch (error) {
    console.error("Batch score error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
