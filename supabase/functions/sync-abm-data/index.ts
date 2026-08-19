import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AbmRow {
  week_label: string;
  reporting_period: string;
  report_generated_at: string;
  source_file_name: string;
  account_name: string;
  normalized_account_name: string;
  is_total: boolean;
  spend: number;
  impressions: number;
  ecpm: number;
  clicks: number;
  ctr: number;
  ecpc: number;
  viewability: number | null;
  accounts_reached: number;
  accounts_engaged: number;
  account_ctr: number | null;
  account_vtr: number | null;
  campaigns: number;
  cost_per_account_reached: number | null;
  cost_per_account_engaged: number | null;
  newly_qualified_accounts: number;
  pipeline: number;
  new_pipeline: number;
  closed_won_pipeline: number;
  audience_segment: string;
  is_client: boolean;
}

type ClientSuppressions = {
  domains: Set<string>;
  accountNames: Set<string>;
};

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(
      /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|plc|sa|ag|nv)\b/g,
      ""
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeAccountName(value: string): string {
  return normalizeKey(value);
}

function currentIsoWeek(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear =
    Math.floor((now.getTime() - jan1.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const abmSalesUrl = Deno.env.get("6SENSE_ABM_Sales");
    const abmCompanyUrl = Deno.env.get("6SENSE_ABM_Company");

    if (!abmSalesUrl && !abmCompanyUrl) {
      return new Response(
        JSON.stringify({
          error:
            "No 6sense secrets configured. Set 6SENSE_ABM_Sales and/or 6SENSE_ABM_Company.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const clientSuppressions = await fetchClientSuppressions(supabase);

    let body: { week_label?: string; segment_override?: string } = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        // no body is fine
      }
    }
    const weekLabel = body.week_label || currentIsoWeek();

    const results: { source: string; accounts: number; error?: string }[] = [];

    if (abmSalesUrl) {
      const r = await fetchAndIngest(
        supabase,
        abmSalesUrl,
        "6SENSE_ABM_Sales",
        weekLabel,
        body.segment_override || "",
        clientSuppressions
      );
      results.push(r);
    }

    if (abmCompanyUrl) {
      const r = await fetchAndIngest(
        supabase,
        abmCompanyUrl,
        "6SENSE_ABM_Company",
        weekLabel,
        body.segment_override || "",
        clientSuppressions
      );
      results.push(r);
    }

    return new Response(
      JSON.stringify({ week_label: weekLabel, results }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function fetchAndIngest(
  supabase: any,
  url: string,
  sourceName: string,
  weekLabel: string,
  segmentOverride: string,
  clientSuppressions: ClientSuppressions
): Promise<{ source: string; accounts: number; error?: string }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        source: sourceName,
        accounts: 0,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const csvText = await response.text();
    if (!csvText.trim()) {
      return { source: sourceName, accounts: 0, error: "Empty response" };
    }

    const segment = segmentOverride || detectSegment(sourceName);
    const rows = parseCsv6sense(csvText, weekLabel, sourceName, segment, clientSuppressions);

    if (rows.length === 0) {
      return {
        source: sourceName,
        accounts: 0,
        error: "No account rows found in CSV (may be grouped by Week instead of Account)",
      };
    }

    // Delete prior data for same week+segment before inserting
    await supabase
      .from("cgt_abm_weekly_engagement")
      .delete()
      .eq("week_label", weekLabel)
      .eq("source_file_name", sourceName);

    const batchSize = 100;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("cgt_abm_weekly_engagement")
        .insert(batch);
      if (error) {
        return {
          source: sourceName,
          accounts: inserted,
          error: `Insert failed at batch ${Math.floor(i / batchSize) + 1}: ${error.message}`,
        };
      }
      inserted += batch.length;
    }

    return { source: sourceName, accounts: inserted };
  } catch (err) {
    return { source: sourceName, accounts: 0, error: String(err) };
  }
}

async function fetchClientSuppressions(supabase: any): Promise<ClientSuppressions> {
  const { data } = await supabase
    .from("cgt_abm_client_domains")
    .select("domain, account_name");

  const domains = new Set<string>();
  const accountNames = new Set<string>();
  for (const row of data || []) {
    if (row.domain) domains.add(String(row.domain).toLowerCase().trim());
    if (row.account_name) accountNames.add(normalizeKey(String(row.account_name)));
  }
  return { domains, accountNames };
}

function detectSegment(sourceName: string): string {
  const lower = sourceName.toLowerCase();
  if (lower.includes("sales")) return "Late Stage";
  if (lower.includes("company")) return "On Market";
  return "";
}

function parseCsv6sense(
  text: string,
  weekLabel: string,
  sourceName: string,
  segment: string,
  clientSuppressions: ClientSuppressions
): AbmRow[] {
  const matrix = parseCsvMatrix(text).filter((row) =>
    row.some((cell) => cell.trim() !== "")
  );

  const reportingPeriod = findMeta(matrix, "Reporting Period");
  const reportGeneratedAt = findMeta(matrix, "Time of Report");

  const headerIndex = matrix.findIndex(
    (row) => row[0]?.trim() === "Account"
  );
  if (headerIndex === -1) return [];

  const headers = matrix[headerIndex].map((h) => h.trim());

  return matrix
    .slice(headerIndex + 1)
    .filter((row) => row[0]?.trim())
    .map((row) => toRecord(headers, row))
    .map((record) => {
      const accountName = val(record, "Account");
      const domain = val(record, "Domain").toLowerCase().trim();
      const closedWonPipeline = money(record, "Closed Won Pipeline");
      const accountKey = normalizeKey(accountName);
      const isClient =
        closedWonPipeline > 0 ||
        (domain ? clientSuppressions.domains.has(domain) : false) ||
        (accountKey ? clientSuppressions.accountNames.has(accountKey) : false);
      return {
        week_label: weekLabel,
        reporting_period: reportingPeriod,
        report_generated_at: reportGeneratedAt,
        source_file_name: sourceName,
        account_name: accountName,
        normalized_account_name: normalizeAccountName(accountName),
        is_total: accountName.toLowerCase() === "total/average",
        spend: money(record, "Spend"),
        impressions: integer(record, "Impressions"),
        ecpm: money(record, "eCPM"),
        clicks: integer(record, "Clicks"),
        ctr: pct(record, "CTR"),
        ecpc: money(record, "eCPC"),
        viewability: nullPct(record, "Viewability"),
        accounts_reached: integer(record, "Accounts Reached"),
        accounts_engaged: integer(record, "Accounts Engaged"),
        account_ctr: nullPct(record, "Account CTR"),
        account_vtr: nullPct(record, "Account VTR"),
        campaigns: integer(record, "Campaigns"),
        cost_per_account_reached: nullMoney(record, "Cost per Account Reached"),
        cost_per_account_engaged: nullMoney(record, "Cost per Account Engaged"),
        newly_qualified_accounts: integer(
          record,
          "Newly qualified accounts (6QA)"
        ),
        pipeline: money(record, "Pipeline"),
        new_pipeline: money(record, "New Pipeline"),
        closed_won_pipeline: closedWonPipeline,
        audience_segment: segment,
        is_client: isClient,
      };
    });
}

function findMeta(matrix: string[][], label: string): string {
  const row = matrix.find((r) => r[0]?.trim() === label);
  return row?.[1]?.trim() || "";
}

function toRecord(headers: string[], row: string[]): Record<string, string> {
  return headers.reduce((acc, header, index) => {
    acc[header] = row[index]?.trim() || "";
    return acc;
  }, {} as Record<string, string>);
}

function val(record: Record<string, string>, key: string): string {
  return record[key]?.trim() || "";
}

function integer(record: Record<string, string>, key: string): number {
  const cleaned = val(record, key)
    .replace(/[$,%\s]/g, "")
    .replace(/,/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(record: Record<string, string>, key: string): number {
  return nullMoney(record, key) ?? 0;
}

function nullMoney(record: Record<string, string>, key: string): number | null {
  const cleaned = val(record, key).replace(/[$,\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function pct(record: Record<string, string>, key: string): number {
  return nullPct(record, key) ?? 0;
}

function nullPct(record: Record<string, string>, key: string): number | null {
  const cleaned = val(record, key).replace(/[%\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);
  return rows;
}
