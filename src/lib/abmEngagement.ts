import { supabase } from './supabase';
import { CgtAbmWeeklyEngagement } from '../types/database';

type AbmInsertRow = Omit<CgtAbmWeeklyEngagement, 'id' | 'created_at' | 'uploaded_at' | 'uploaded_by'>;

const HEADER_ACCOUNT = 'Account';

export function normalizeAccountName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|plc|sa|ag|nv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export async function uploadAbmEngagementCsv(file: File, weekLabel: string): Promise<number> {
  const text = await file.text();
  const rows = parseAbmEngagementCsv(text, weekLabel, file.name);
  if (rows.length === 0) {
    throw new Error('No ABM account rows found in this CSV.');
  }

  const { error: deleteError } = await supabase
    .from('cgt_abm_weekly_engagement')
    .delete()
    .eq('week_label', weekLabel);
  if (deleteError) throw new Error(`Could not replace prior ABM upload: ${deleteError.message}`);

  const { error: insertError } = await (supabase as any)
    .from('cgt_abm_weekly_engagement')
    .insert(rows);
  if (insertError) throw new Error(`Could not save ABM upload: ${insertError.message}`);

  return rows.length;
}

export function parseAbmEngagementCsv(text: string, weekLabel: string, fileName: string): AbmInsertRow[] {
  const matrix = parseCsv(text).filter(row => row.some(cell => cell.trim() !== ''));
  const reportingPeriod = findMeta(matrix, 'Reporting Period');
  const reportGeneratedAt = findMeta(matrix, 'Time of Report');
  const headerIndex = matrix.findIndex(row => row[0]?.trim() === HEADER_ACCOUNT);
  if (headerIndex === -1) return [];

  const headers = matrix[headerIndex].map(h => h.trim());
  return matrix.slice(headerIndex + 1)
    .filter(row => row[0]?.trim())
    .map(row => toRecord(headers, row))
    .map(record => {
      const accountName = value(record, 'Account');
      return {
        week_label: weekLabel,
        reporting_period: reportingPeriod,
        report_generated_at: reportGeneratedAt,
        source_file_name: fileName,
        account_name: accountName,
        normalized_account_name: normalizeAccountName(accountName),
        is_total: accountName.toLowerCase() === 'total/average',
        spend: money(record, 'Spend'),
        impressions: integer(record, 'Impressions'),
        ecpm: money(record, 'eCPM'),
        clicks: integer(record, 'Clicks'),
        ctr: percent(record, 'CTR'),
        ecpc: money(record, 'eCPC'),
        viewability: nullablePercent(record, 'Viewability'),
        accounts_reached: integer(record, 'Accounts Reached'),
        accounts_engaged: integer(record, 'Accounts Engaged'),
        account_ctr: nullablePercent(record, 'Account CTR'),
        account_vtr: nullablePercent(record, 'Account VTR'),
        campaigns: integer(record, 'Campaigns'),
        cost_per_account_reached: nullableMoney(record, 'Cost per Account Reached'),
        cost_per_account_engaged: nullableMoney(record, 'Cost per Account Engaged'),
        newly_qualified_accounts: integer(record, 'Newly qualified accounts (6QA)'),
        pipeline: money(record, 'Pipeline'),
        new_pipeline: money(record, 'New Pipeline'),
        closed_won_pipeline: money(record, 'Closed Won Pipeline'),
      };
    });
}

function findMeta(matrix: string[][], label: string): string {
  const row = matrix.find(r => r[0]?.trim() === label);
  return row?.[1]?.trim() || '';
}

function toRecord(headers: string[], row: string[]): Record<string, string> {
  return headers.reduce((acc, header, index) => {
    acc[header] = row[index]?.trim() || '';
    return acc;
  }, {} as Record<string, string>);
}

function value(record: Record<string, string>, key: string): string {
  return record[key]?.trim() || '';
}

function integer(record: Record<string, string>, key: string): number {
  const cleaned = value(record, key).replace(/[$,%\s]/g, '').replace(/,/g, '');
  if (!cleaned || cleaned === '-') return 0;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(record: Record<string, string>, key: string): number {
  return nullableMoney(record, key) ?? 0;
}

function nullableMoney(record: Record<string, string>, key: string): number | null {
  const cleaned = value(record, key).replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === '-') return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(record: Record<string, string>, key: string): number {
  return nullablePercent(record, key) ?? 0;
}

function nullablePercent(record: Record<string, string>, key: string): number | null {
  const cleaned = value(record, key).replace(/[%\s]/g, '');
  if (!cleaned || cleaned === '-') return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
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

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);
  return rows;
}
