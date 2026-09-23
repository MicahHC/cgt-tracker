import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/lib/commercialization.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { assessLaunch, companyPriority, cutoffDate } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const now = new Date('2026-09-23T12:00:00Z');
const check = (window, priority, extra = {}) => assert.equal(assessLaunch({ us_commercialization_window: window, ...extra }, now).priority, priority, window);
check('Global launch date: 2028-03-23', 'Priority 1');
check('Global launch date: 2028-03-24', 'Priority 2');
check('Global launch date: 2028-09-23', 'Priority 2');
check('Global launch date: 2028-09-24', null);
check('Global launch date: 2031-07-01; Not Priority 1', null);
check('Global launch date: 2026-08-01', null);
check('2027H1-2027H2', 'Priority 1');
check('2028H2', null);
check('2028', null);
check('2027', 'Priority 1');
check('2027', null, { no_us_path: true });
check('2027', null, { clinical_hold: true });
check('2027', null, { segment: 'On-Market' });
check('2027', 'Priority 1', { segment: 'Early Stage' });
check('BLA filing anticipated in 2028; Priority 2 - not expected to commercialize within 18 months', null);
check('PDUFA December 23, 2026; Priority 1 - commercializing within 18 months if approved', null);
check('No launch estimate available', null);
check('Global launch date: 2027-02-31', null);
check('GlobalData launch estimate February 2028, but no filed BLA; Priority 2 until commercialization timing is source-confirmed', null);
assert.equal(companyPriority([{ us_commercialization_window: '2028-08-01' }, { us_commercialization_window: '2027-12-01' }], now), 'Priority 1');
assert.equal(cutoffDate(new Date('2026-08-31T00:00:00Z'), 18).toISOString().slice(0, 10), '2028-02-29');
console.log('Commercialization tests passed: boundaries, phase independence, P1 precedence, stale/missing dates, partial dates and milestone exclusions.');

const audienceBuild = await build({ entryPoints: ['src/lib/buildCommercialAudiences.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { buildCommercialAudiences } = await import(`data:text/javascript;base64,${Buffer.from(audienceBuild.outputFiles[0].text).toString('base64')}`);
const companies = ['one', 'two', 'client', 'far'].map(id => ({ id, company_name: id, website: `${id}.com`, hq_country: 'US' }));
const assets = [
  { company_id: 'one', segment: 'Early Stage', us_commercialization_window: '2027-12-01' },
  { company_id: 'one', us_commercialization_window: '2028-07-01' },
  { company_id: 'two', us_commercialization_window: '2028-07-01' },
  { company_id: 'client', us_commercialization_window: '2027-12-01' },
  { company_id: 'far', us_commercialization_window: '2031-07-01' },
];
const rows = buildCommercialAudiences(companies, assets, [], [{ account_name: 'client', domain: 'client.com' }], now);
const active = rows.filter(r => !r.is_client);
assert.equal(active.filter(r => r.audience_segment === 'Late Stage').length, 2);
assert.equal(active.filter(r => r.audience_segment === 'Priority 1').length, 1);
assert.equal(active.filter(r => r.audience_segment === 'Priority 2').length, 1);
assert.equal(active.some(r => r.account_name === 'far' || r.account_name === 'client'), false);
console.log('Company audience tests passed: exclusive priorities, early-phase eligibility, 24-month cutoff and closed-won suppression.');
