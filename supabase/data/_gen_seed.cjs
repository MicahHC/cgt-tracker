const fs = require("fs");
const dir = "/tmp/cc-agent/63173450/project/supabase/data/";
const files = [
  ["AUD_ATC_Primary.csv", "ATC"],
  ["AUD_Biopharma_EarlyStage.csv", "Early Stage"],
  ["AUD_Biopharma_EarlyStage_NonUS.csv", "Early Stage"],
  ["AUD_Biopharma_LateStage.csv", "Late Stage"],
  ["AUD_Biopharma_LateStage_NonUS.csv", "Late Stage"],
  ["AUD_Biopharma_OnMarket.csv", "On Market"],
  ["AUD_Consultants.csv", "Consultants"],
];

function parseCSV(t) {
  const rows = [];
  let i = 0, field = "", row = [], q = false;
  while (i < t.length) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") {}
      else field += c;
    }
    i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const esc = (s) => (s || "").replace(/'/g, "''");
const seen = new Set();
const vals = [];
for (const [f, seg] of files) {
  const rows = parseCSV(fs.readFileSync(dir + f, "utf8"));
  for (let r = 1; r < rows.length; r++) {
    const name = (rows[r][0] || "").trim();
    const country = (rows[r][1] || "").trim();
    const domain = (rows[r][2] || "").trim();
    if (!name) continue;
    const key = seg + "|" + (domain || name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    vals.push(`('${esc(name)}','${esc(country)}','${esc(domain)}','${seg}')`);
  }
}
const sql =
  "DELETE FROM public.cgt_abm_audience_members;\n" +
  "INSERT INTO public.cgt_abm_audience_members (account_name,country,domain,audience_segment) VALUES\n" +
  vals.join(",\n") + ";\n";
fs.writeFileSync(dir + "_seed_audience.sql", sql);
console.log("rows:", vals.length);
