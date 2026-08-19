import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dbnmnorholzehkppwvap.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRibm1ub3Job2x6ZWhrcHB3dmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NzYyNzAsImV4cCI6MjA4NTM1MjI3MH0.R6i7hjo5AwklCSsxlIKT7o5tt7BVyV9i2qGG06LeBkw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchAll(table, select, applyQuery) {
  const rows = [];
  let from = 0;
  const step = 1000;

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + step - 1);
    query = applyQuery(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < step) break;
    from += step;
  }

  return rows;
}

function priorityLabel(tier) {
  if (tier === 'Tier 1') return 'Priority 1';
  if (tier === 'Tier 2') return 'Priority 2';
  return tier || 'No priority';
}

function cleanReason(value) {
  return String(value || '')
    .replace(/\bCommercial tier\b/g, 'Audience priority')
    .replace(/\bcommercial tier\b/g, 'audience priority')
    .replace(/\bTier 1\b/g, 'Priority 1')
    .replace(/\bTier 2\b/g, 'Priority 2')
    .trim();
}

function companyName(score) {
  return score.cgt_assets?.cgt_companies?.company_name || 'Company';
}

function assetName(score) {
  return score.cgt_assets?.asset_name || 'Asset';
}

function getWeekRange(label) {
  const match = String(label || '').match(/^(\d{4})-W(\d{1,2})$/);
  if (!match) return label || 'latest week';

  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const dayOfYear = Math.floor((dec31.getTime() - new Date(year, 0, 1).getTime()) / 86400000) + 1;
  const startOffset = Math.max(0, 7 * week - 7 - jan1.getDay());
  const endOffset = Math.min(dayOfYear - 1, 7 * week - jan1.getDay() - 1);
  const start = new Date(year, 0, 1 + startOffset);
  const end = new Date(year, 0, 1 + endOffset);
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}-${end.getDate()}, ${end.getFullYear()}`;
}

async function latestWeek() {
  const [{ data: latestChange }, { data: latestScore }] = await Promise.all([
    supabase
      .from('cgt_change_log')
      .select('update_week, created_at')
      .not('update_week', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('cgt_score_history')
      .select('week_label, recorded_at')
      .not('week_label', 'is', null)
      .order('recorded_at', { ascending: false })
      .limit(1),
  ]);

  return [
    ...((latestChange || []).map(row => ({ week: row.update_week, at: row.created_at }))),
    ...((latestScore || []).map(row => ({ week: row.week_label, at: row.recorded_at }))),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]?.week;
}

function changeContext(changes, assetId) {
  const assetChanges = changes.filter(change => change.asset_id === assetId);
  const scoreChange = assetChanges.find(change => /final_commercial_score/i.test(change.field_changed || ''));
  const priorityChange = assetChanges.find(change => /commercial_priority_tier/i.test(change.field_changed || ''));
  const source = scoreChange?.source_url || priorityChange?.source_url || '';
  const reason = cleanReason(scoreChange?.why_it_matters || priorityChange?.why_it_matters || '');
  return { scoreChange, priorityChange, source, reason };
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(incorporated|inc|corp|corporation|co|company|ltd|limited|llc|plc|therapeutics|biotherapeutics|pharmaceuticals|pharma|biosciences|biotech|biotechnology)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0];
}

function fallbackReason(row, asset) {
  const currentPriority = row.score.commercial_priority_tier;
  const status = asset?.phase_regulatory_status || 'status not captured';
  const window = asset?.us_commercialization_window || 'commercialization window not captured';
  const launchFlag = asset?.likely_us_launch_within_24_months || 'unknown';
  const catalyst = asset?.key_upcoming_catalyst
    ? `${asset.key_upcoming_catalyst}${asset.catalyst_date ? ` (${asset.catalyst_date})` : ''}`
    : '';

  if (currentPriority === 'Tier 1') {
    return `Moved into Priority 1 because the stored tracker profile now indicates an active U.S. commercialization window: ${status}; launch-window flag ${launchFlag}; ${window}${catalyst ? `; catalyst: ${catalyst}` : ''}. No new external-source detail was captured with this classification row, so treat this as a tracker classification update rather than a new market signal.`;
  }

  if (currentPriority === 'Tier 2') {
    return `Moved into Priority 2 because the asset remains relevant to CGT monitoring, but the profile does not support active Priority 1 commercialization: ${status}; launch-window flag ${launchFlag}; ${window}${catalyst ? `; catalyst: ${catalyst}` : ''}. No new external-source detail was captured with this classification row, so keep it in nurture/research rather than active launch outreach.`;
  }

  return "Moved based on this week's score and priority re-evaluation; no new external-source detail was captured with the classification row.";
}

function shouldUseFallbackReason(reason) {
  return !reason || /no underlying flag change|initial tier assignment|tier rule|timeline estimate was revised/i.test(reason);
}

function clientSafeSource(row) {
  const company = companyName(row.score);
  const asset = assetName(row.score);

  if (/Arcellx/i.test(company) && /Anito/i.test(asset)) {
    return 'https://www.kitepharma.com/news/press-releases/2026/2/gilead-sciences-to-acquire-arcellx-to-maximize-long-term-potential-of-anito-cel';
  }

  if (/supabase.co\/functions/i.test(row.source || '')) return '';
  return row.source || '';
}

async function buildEmail(week) {
  const targetWeek = week || await latestWeek();
  if (!targetWeek) throw new Error('No weekly tracker data found.');

  const changes = await fetchAll(
    'cgt_change_log',
    '*, cgt_assets(asset_name, company_id, cgt_companies(company_name))',
    query => query.eq('update_week', targetWeek).order('created_at', { ascending: false })
  );
  const scores = await fetchAll(
    'cgt_score_history',
    '*, cgt_assets(asset_name, company_id, cgt_companies(company_name))',
    query => query.eq('week_label', targetWeek).order('recorded_at', { ascending: false })
  );
  const clientRows = await fetchAll(
    'cgt_abm_client_domains',
    'account_name, domain',
    query => query.order('account_name', { ascending: true })
  );

  const latestByAsset = new Map();
  for (const score of scores) {
    const existing = latestByAsset.get(score.asset_id);
    if (!existing || Date.parse(score.recorded_at || '') > Date.parse(existing.recorded_at || '')) {
      latestByAsset.set(score.asset_id, score);
    }
  }

  const latestScores = Array.from(latestByAsset.values());
  const assetIds = latestScores.map(score => score.asset_id);
  const assetContextRows = assetIds.length > 0
    ? await fetchAll(
      'cgt_assets',
      'id, asset_name, phase_regulatory_status, filing_status, pdufa_date, us_commercialization_window, likely_us_launch_within_24_months, key_upcoming_catalyst, catalyst_date, commercial_buildout_status, manufacturing_pathway, latest_material_update',
      query => query.in('id', assetIds)
    )
    : [];
  const assetContextById = new Map(assetContextRows.map(row => [row.id, row]));
  const clientNames = new Set(clientRows.map(row => normalizeName(row.account_name)).filter(Boolean));
  const clientDomains = new Set(clientRows.map(row => normalizeDomain(row.domain)).filter(Boolean));
  const prior = assetIds.length > 0
    ? await fetchAll(
      'cgt_score_history',
      'asset_id, week_label, final_commercial_score, commercial_priority_tier, recorded_at',
      query => query.in('asset_id', assetIds).lt('week_label', targetWeek).order('recorded_at', { ascending: false })
    )
    : [];

  const priorByAsset = new Map();
  for (const row of prior) {
    if (!priorByAsset.has(row.asset_id)) priorByAsset.set(row.asset_id, row);
  }

  const rows = latestScores
    .map(score => {
      const previous = priorByAsset.get(score.asset_id);
      const delta = previous ? (score.final_commercial_score || 0) - (previous.final_commercial_score || 0) : null;
      const context = changeContext(changes, score.asset_id);
      const asset = assetContextById.get(score.asset_id);
      const isClient = clientNames.has(normalizeName(companyName(score))) ||
        clientDomains.has(normalizeDomain(score.cgt_assets?.cgt_companies?.website));
      return { score, previous, delta, asset, isClient, ...context };
    })
    .filter(row =>
      row.previous &&
      (
        Math.abs(row.delta || 0) >= 5 ||
        row.previous.commercial_priority_tier !== row.score.commercial_priority_tier
      )
    )
    .sort((a, b) => {
      const priorityDelta = Number(a.previous.commercial_priority_tier !== a.score.commercial_priority_tier);
      const priorityDeltaB = Number(b.previous.commercial_priority_tier !== b.score.commercial_priority_tier);
      return priorityDeltaB - priorityDelta || Math.abs(b.delta || 0) - Math.abs(a.delta || 0);
    });

  const activeRows = rows.filter(row => !row.isClient).slice(0, 6);
  const suppressedRows = rows.filter(row => row.isClient).slice(0, 4);
  const bulletFor = row => {
    const score = row.score;
    const previous = row.previous;
    const deltaText = row.delta > 0 ? `+${row.delta}` : `${row.delta}`;
    const priorityMove = `${priorityLabel(previous.commercial_priority_tier)} to ${priorityLabel(score.commercial_priority_tier)}`;
    const source = clientSafeSource(row);
    const sourceText = source ? ` Source: ${source}` : '';
    const actionNote = row.isClient ? ' Note: this account is currently marked Closed Won/client, so this is a tracker update, not a paid-media activation target.' : '';
    const reason = shouldUseFallbackReason(row.reason) ? fallbackReason(row, row.asset) : row.reason;
    return `- ${companyName(score)} / ${assetName(score)}: ${priorityMove}; commercial score ${previous.final_commercial_score} to ${score.final_commercial_score} (${deltaText}). ${reason}${actionNote}${sourceText}`;
  };
  const bullets = activeRows.map(bulletFor);
  const suppressedBullets = suppressedRows.map(bulletFor);
  const movedIntoP1 = activeRows.filter(row => row.score.commercial_priority_tier === 'Tier 1' && row.previous.commercial_priority_tier !== 'Tier 1').length;
  const movedOutOfP1 = activeRows.filter(row => row.previous.commercial_priority_tier === 'Tier 1' && row.score.commercial_priority_tier !== 'Tier 1').length;

  const subject = `CGT tracker weekly update: ${getWeekRange(targetWeek)}`;
  const body = [
    `Subject: ${subject}`,
    '',
    'Hi team,',
    '',
    `Here are the main CGT tracker movements from the latest weekly run (${getWeekRange(targetWeek)}). I focused this note on assets that changed audience priority or moved materially in commercial readiness score.`,
    '',
    'Activation-relevant movers:',
    ...(bullets.length > 0 ? bullets : ['- No non-client accounts had a material score or priority movement this week.']),
    '',
    ...(suppressedBullets.length > 0
      ? [
        'Suppressed tracker movement, not for paid activation:',
        ...suppressedBullets,
        '',
      ]
      : []),
    `Net/net for active, non-client accounts: ${movedIntoP1} account(s) moved into Priority 1 and ${movedOutOfP1} moved out of Priority 1. Priority 1 remains the active commercialization audience: U.S. path plus expected commercialization inside 18 months.`,
    '',
    'Recommended next steps:',
    '- Refresh Priority 1 activation audiences in 6sense and suppress Closed Won/client accounts.',
    '- Use the upward movers as timely outreach hooks this week, especially where the move is tied to regulatory acceptance, PDUFA timing, or commercial launch readiness.',
    '- Keep downward movers in nurture or research until the commercialization timeline or regulatory path strengthens.',
    '',
    'Best,',
    'Micah',
    '',
  ].join('\n');

  return { week: targetWeek, subject, body, rows: activeRows, suppressedRows };
}

const weekArg = process.argv.find(arg => arg.startsWith('--week='))?.split('=')[1];
const result = await buildEmail(weekArg);
const outputDir = path.join('/Users/micah/cgt-tracker/health-checks');
await fs.mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `mckesson_weekly_email_${result.week}.txt`);
await fs.writeFile(outputPath, result.body);
console.log(result.body);
console.error(`Saved: ${outputPath}`);
