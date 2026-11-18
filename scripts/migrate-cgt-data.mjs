/**
 * One-way, non-destructive migration from the Bolt-backed CGT database to the
 * Supreme Group CGT Intelligence project. Source rows keep their UUIDs so all
 * existing foreign-key relationships remain valid.
 *
 * Required environment variables:
 *   SOURCE_URL, SOURCE_ANON_KEY, TARGET_URL, TARGET_SERVICE_KEY
 *
 * Usage:
 *   node scripts/migrate-cgt-data.mjs --dry-run
 *   node scripts/migrate-cgt-data.mjs --apply
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const isApply = process.argv.includes('--apply');
const isReplace = process.argv.includes('--replace');
const required = ['SOURCE_URL', 'SOURCE_ANON_KEY', 'TARGET_URL', 'TARGET_SERVICE_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const source = { url: process.env.SOURCE_URL, key: process.env.SOURCE_ANON_KEY };
const target = { url: process.env.TARGET_URL, key: process.env.TARGET_SERVICE_KEY };

// Parent rows precede dependent rows. Auth-backed cgt_users is intentionally
// excluded because its UUIDs are tied to a different auth database.
const tables = [
  'cgt_companies',
  'cgt_assets',
  'cgt_asset_sources',
  'cgt_change_log',
  'cgt_score_history',
  'cgt_abm_weekly_engagement',
  'cgt_abm_audience_members',
  'cgt_abm_client_domains',
  'cgt_abm_engagement_brief',
];
const pageSize = 500;

async function request(database, path, options = {}) {
  const response = await fetch(`${database.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: database.key,
      Authorization: `Bearer ${database.key}`,
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response;
}

async function rows(database, table, select = '*') {
  const all = [];
  for (let start = 0; ; start += pageSize) {
    const response = await request(database, `${table}?select=${encodeURIComponent(select)}&order=id.asc`, {
      headers: { Range: `${start}-${start + pageSize - 1}` },
    });
    const batch = await response.json();
    all.push(...batch);
    if (batch.length < pageSize) return all;
  }
}

async function upsert(table, batch) {
  if (!batch.length) return;
  await request(target, `${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(batch),
  });
}

async function deleteAll(table) {
  await request(target, `${table}?id=not.is.null`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const backupDirectory = join('health-checks', 'migration-backups', timestamp);
await mkdir(backupDirectory, { recursive: true });

const manifest = { started_at: new Date().toISOString(), mode: isApply ? 'apply' : 'dry-run', tables: {} };
const snapshots = [];
for (const table of tables) {
  const [sourceRows, targetRows] = await Promise.all([rows(source, table), rows(target, table)]);
  await writeFile(join(backupDirectory, `${table}.target-before.json`), JSON.stringify(targetRows, null, 2));

  const sourceIds = new Set(sourceRows.map((row) => row.id));
  const targetIds = new Set(targetRows.map((row) => row.id));
  const targetOnlyIds = [...targetIds].filter((id) => !sourceIds.has(id));
  const sourceOnlyIds = [...sourceIds].filter((id) => !targetIds.has(id));
  manifest.tables[table] = {
    source_rows: sourceRows.length,
    target_rows_before: targetRows.length,
    source_only_rows: sourceOnlyIds.length,
    target_only_rows: targetOnlyIds.length,
  };
  snapshots.push({ table, sourceRows, sourceIds, targetOnlyIds });
}

if (isApply) {
  const targetOnlyTotal = snapshots.reduce((total, snapshot) => total + snapshot.targetOnlyIds.length, 0);
  if (targetOnlyTotal && !isReplace) {
    throw new Error(
      `Target contains ${targetOnlyTotal} stale rows. Re-run with --apply --replace to replace them from the backed-up source of truth.`,
    );
  }

  if (isReplace) {
    for (const { table } of [...snapshots].reverse()) await deleteAll(table);
  }

  for (const { table, sourceRows, sourceIds } of snapshots) {
    for (let offset = 0; offset < sourceRows.length; offset += pageSize) await upsert(table, sourceRows.slice(offset, offset + pageSize));
    const afterRows = await rows(target, table, 'id');
    const afterIds = new Set(afterRows.map((row) => row.id));
    const missing = [...sourceIds].filter((id) => !afterIds.has(id));
    manifest.tables[table].target_rows_after = afterRows.length;
    manifest.tables[table].source_ids_missing_after = missing.length;
    if (missing.length) throw new Error(`${table}: ${missing.length} source rows missing after upsert`);
  }
}

manifest.finished_at = new Date().toISOString();
await writeFile(join(backupDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ backup_directory: backupDirectory, manifest }, null, 2));
