import { CgtAbmWeeklyEngagement } from '../types/database';

const CORPORATE_SUFFIX_RE = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|plc|sa|ag|nv)\b/g;

export function normalizeSuppressionKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(CORPORATE_SUFFIX_RE, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export const CLOSED_WON_DOMAINS = new Set([
  'iovance.com',
  'vrtx.com',
  'kitepharma.com',
  'gilead.com',
  'regeneron.com',
  'precigen.com',
  'ptcbio.com',
  'merck.com',
  'rocketpharma.com',
  'orcabio.com',
  'bms.com',
  'nanostherapeutics.com',
]);

const CLOSED_WON_ACCOUNT_ALIASES = [
  'Iovance Biotherapeutics',
  'Vertex Pharmaceuticals',
  'Kite Pharma',
  'Kite Pharma Gilead',
  'Gilead',
  'Gilead Sciences',
  'Regeneron',
  'Regeneron Pharmaceuticals',
  'Precigen',
  'PTC Therapeutics',
  'Merck',
  'Rocket Pharmaceuticals',
  'Orca Bio',
  'Juno Therapeutics',
  'Juno Therapeutics BMS',
  'BMS',
  'Bristol Myers Squibb',
  'Bristol-Myers Squibb',
  'NanoScope Therapeutics',
  'Nanoscope Therapeutics',
];

export const CLOSED_WON_ACCOUNT_KEYS = new Set(
  CLOSED_WON_ACCOUNT_ALIASES.map(normalizeSuppressionKey)
);

export function isClosedWonAccount(accountName = '', domain = ''): boolean {
  const cleanDomain = domain.toLowerCase().trim();
  if (cleanDomain && CLOSED_WON_DOMAINS.has(cleanDomain)) return true;

  const key = normalizeSuppressionKey(accountName);
  return key ? CLOSED_WON_ACCOUNT_KEYS.has(key) : false;
}

export function mentionsClosedWonAccount(value = ''): boolean {
  const key = normalizeSuppressionKey(value);
  if (!key) return false;

  for (const closedWonKey of CLOSED_WON_ACCOUNT_KEYS) {
    if (closedWonKey.length >= 3 && key.includes(closedWonKey)) return true;
  }
  return false;
}

export function isSuppressedAbmRow(row: Pick<CgtAbmWeeklyEngagement, 'account_name' | 'audience_segment' | 'is_client'>): boolean {
  return row.is_client || (row.audience_segment as string) === 'Closed Won' || isClosedWonAccount(row.account_name);
}
