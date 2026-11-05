import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['src/lib/weekLabels.ts', 'src/lib/weeklyBriefFocus.ts'],
  bundle: true, write: false, platform: 'node', format: 'esm', outdir: 'dist-tests',
});
const modules = await Promise.all(compiled.outputFiles.map(file =>
  import(`data:text/javascript;base64,${Buffer.from(file.text).toString('base64')}`)
));
const week = modules.find(module => module.recentTrackerWeeks);
const focus = modules.find(module => module.isEarlyToLateMove);
const now = new Date('2026-11-05T12:00:00Z');

assert.equal(week.trackerWeekLabel(now), '2026-W45');
assert.deepEqual(week.recentTrackerWeeks(now, 2), ['2026-W45', '2026-W44']);
assert.equal(week.formatTrackerWeekLabel('2026-W44'), 'Oct 26-Nov 1, 2026');
assert.equal(week.getTrackerWeekRange('2026-11'), null);
assert.equal(week.trackerWeekLabel(new Date('2027-01-01T12:00:00Z')), '2026-W53');
assert.equal(week.getTrackerWeekRange('2026-W53').end.toISOString().slice(0, 10), '2027-01-03');
assert.equal(week.getTrackerWeekRange('2026-W54'), null);

const reviewed = { segment: 'Early Stage', us_commercialization_window: 'Source-reviewed U.S. launch target: 2027H2' };
const promotion = { field_changed: 'commercial_priority_tier', previous_value: 'Watchlist', new_value: 'Tier 1' };
assert.equal(focus.isEarlyToLateMove(promotion, reviewed, now), true);
assert.equal(focus.isEarlyToLateMove(promotion, { ...reviewed, us_commercialization_window: 'Global launch date: 2027H2' }, now), false);
assert.equal(focus.isEarlyToLateMove(promotion, { ...reviewed, no_us_path: true }, now), false);
assert.equal(focus.isEarlyToLateMove({ field_changed: 'segment', previous_value: 'Early Stage', new_value: 'Late Stage' }, reviewed, now), true);
assert.equal(focus.isEarlyToLateMove({ field_changed: 'segment', previous_value: 'Early Stage', new_value: 'Late Stage' }, { segment: 'Late Stage' }, now), true);
assert.equal(focus.focusAudience(reviewed, [], now), 'Late Stage');
assert.deepEqual(focus.focusAudiences(reviewed, ['ATC'], now), ['ATC', 'Late Stage']);
assert.equal(focus.focusAudience(undefined, ['ATC'], now), 'ATC');
assert.equal(focus.focusAudience({ segment: 'On-Market' }, [], now), 'On Market');
assert.equal(focus.focusAudience({ segment: 'Early Stage' }, [], now), null);
assert.equal(focus.directEvidenceUrl('https://clinicaltrials.gov/study/NCT12345678'), 'https://clinicaltrials.gov/study/NCT12345678');
assert.equal(focus.directEvidenceUrl('https://dbnmnorholzehkppwvap.supabase.co/functions/v1/fetch-openfda-data'), null);
assert.equal(focus.directEvidenceUrl('https://www.fda.gov/'), null);
assert.equal(focus.directEvidenceUrl('not-a-url'), null);
console.log('Weekly brief tests passed: ISO weeks, month-label exclusion, source-reviewed promotions, and audience focus.');
