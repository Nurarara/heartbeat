import assert from 'node:assert/strict';
import { LONDON } from '../lib/world.ts';
import { parseStoryMemory, rememberMoment, planMoment } from '../lib/ambient-director.ts';

const minute = 60_000;
const instant = value => Date.parse(value);
const at = instant('2026-06-21T12:00:00Z'); // Warm Sunday, 13:00 in London.
const weather = (time, value = 25, extra = {}) => ({ temperature: value, observedAt: time, fetchedAt: time, weatherCode: null, isDay: null, ...extra });
const initial = planMoment(LONDON, weather(at), at, null, 123);
assert.equal(initial.action, 'REIMAGINE');
assert.equal(initial.direction.brief.weekday, 'Sunday');
assert.equal(initial.direction.season, 'summer');
assert.equal(initial.nextCheckAt, at + 10 * minute);
assert.deepEqual(planMoment(LONDON, weather(at), at, null, 123), initial, 'Planning is deterministic');

let memory = rememberMoment(null, initial.direction, at);
const committed = memory;
assert.strictEqual(rememberMoment(memory, initial.direction, at + minute), memory, 'Duplicate commits are ignored');
const stable = planMoment(LONDON, weather(at + 10 * minute), at + 10 * minute, memory, 123);
assert.equal(stable.action, 'HOLD');
assert.strictEqual(stable.direction, initial.direction, 'HOLD returns the exact committed snapshot');
assert.equal(memory.history.length, 1, 'Planning never commits memory');
assert.strictEqual(memory, committed);
const almost = planMoment(LONDON, weather(at + 55 * minute), at + 55 * minute, memory, 123);
assert.equal(almost.action, 'HOLD');
assert.equal(almost.nextCheckAt, at + 60 * minute, 'Next check cannot overshoot maximum hold');
const refresh = planMoment(LONDON, weather(at + 60 * minute), at + 60 * minute, memory, 123);
assert.equal(refresh.action, 'REIMAGINE');
assert.notEqual(refresh.direction.scene, initial.direction.scene);
assert.notEqual(refresh.direction.recipe.seed, initial.direction.recipe.seed);
assert.notEqual(refresh.direction.id, initial.direction.id);

const jitter = planMoment(LONDON, weather(at + 20 * minute, 25.2), at + 20 * minute, memory, 123);
assert.equal(jitter.action, 'HOLD');
assert.equal(planMoment(LONDON, weather(at + 9 * minute, 12), at + 9 * minute, memory, 123).action, 'HOLD');
assert.equal(planMoment(LONDON, weather(at + 10 * minute, 12), at + 10 * minute, memory, 123).action, 'REIMAGINE');
const forced = planMoment(LONDON, weather(at + minute), at + minute, memory, 123, { force: true });
assert.equal(forced.action, 'REIMAGINE');
assert.notEqual(forced.direction.scene, initial.direction.scene);
assert.equal(memory.history.length, 1);

const unknown = planMoment(LONDON, null, at, null, 123);
assert.equal(unknown.direction.brief.temperature, null);
assert.equal(unknown.direction.recipe.temperature, 20);
assert.match(unknown.reason, /temperature unavailable/);
assert.doesNotMatch(unknown.reason, /Fresh outdoor temperature: 20/);
assert.equal(planMoment(LONDON, weather(at, NaN), at, null, 123).direction.brief.temperature, null);
assert.equal(planMoment(LONDON, weather(at, 9999), at, null, 123).direction.brief.temperature, null);
assert.equal(planMoment(LONDON, weather(at, 0), at, null, 123).direction.brief.temperature, 0);
assert.equal(planMoment(LONDON, weather(at - 91 * minute), at, null, 123).direction.brief.temperature, null);
const neutralMemory = rememberMoment(null, unknown.direction, at);
assert.equal(planMoment(LONDON, weather(at + 9 * minute, 5), at + 9 * minute, neutralMemory, 123).action, 'HOLD');
const recoveredCold = planMoment(LONDON, weather(at + 10 * minute, 5), at + 10 * minute, neutralMemory, 123);
assert.equal(recoveredCold.action, 'REIMAGINE');
assert.equal(recoveredCold.direction.brief.temperature, 5);
assert.match(recoveredCold.reason, /New outdoor temperature data/);
assert.equal(planMoment(LONDON, weather(at + 10 * minute, 20), at + 10 * minute, neutralMemory, 123).action, 'HOLD');
assert.equal(planMoment(LONDON, weather(at + 10 * minute, 22.9), at + 10 * minute, neutralMemory, 123).action, 'HOLD');
assert.equal(planMoment(LONDON, weather(at + 10 * minute, 23), at + 10 * minute, neutralMemory, 123).action, 'REIMAGINE');

const utc = { ...LONDON, timezone: 'UTC' };
const late = instant('2026-10-15T23:55:00Z');
const beforeMidnight = planMoment(utc, null, late, null, 1);
const midnightMemory = rememberMoment(null, beforeMidnight.direction, late);
assert.equal(planMoment(utc, null, late + 6 * minute, midnightMemory, 1).action, 'HOLD');
const nextDay = planMoment(utc, null, late + 10 * minute, midnightMemory, 1);
assert.equal(nextDay.action, 'REIMAGINE');
assert.equal(nextDay.direction.recipe.date, '2026-10-16');
assert.equal(nextDay.direction.brief.weekday, 'Friday');
assert.ok(['cosmos', 'coast'].includes(nextDay.direction.scene));
const sydney = { ...LONDON, latitude: -33.86, longitude: 151.2, timezone: 'Australia/Sydney' };
assert.equal(planMoment(sydney, null, at, null, 1).direction.season, 'winter');
const singapore = { ...LONDON, latitude: 1.35, longitude: 103.8, timezone: 'Asia/Singapore' };
assert.equal(planMoment(singapore, null, at, null, 1).direction.season, 'tropical');
assert.match(planMoment(singapore, null, at, null, 1).reason, /without assuming a wet or dry season/);
const february = instant('2026-02-28T23:40:00Z');
const februaryMoment = planMoment(utc, null, february, null, 11);
const march = planMoment(utc, null, february + 30 * minute, rememberMoment(null, februaryMoment.direction, february), 11);
assert.equal(march.action, 'REIMAGINE');
assert.equal(march.direction.season, 'spring');

// Solar darkness is urgent, even before ten minutes and before clock-based nighttime.
const winterDay = instant('2026-12-15T14:57:00Z');
const winterContext = time => weather(time, 6, { sunrise: '2026-12-15T08:00:00Z', sunset: '2026-12-15T15:00:00Z', isDay: time <= instant('2026-12-15T15:00:00Z') });
const beforeDark = planMoment(utc, winterContext(winterDay), winterDay, null, 18);
const darkAt = instant('2026-12-15T15:31:00Z');
const nearDark = planMoment(utc, winterContext(darkAt - minute), darkAt - minute, null, 18);
const dark = planMoment(utc, winterContext(darkAt), darkAt, rememberMoment(null, nearDark.direction, darkAt - minute), 18);
assert.equal(beforeDark.direction.phase, 'dusk');
assert.equal(dark.action, 'REIMAGINE');
assert.equal(dark.direction.phase, 'night');
assert.ok(['cosmos', 'coast'].includes(dark.direction.scene));

// Once an early sunset is observed, missing/stale weather must not brighten the
// same evening. A manual refresh still creates a different, dark composition.
const earlyNightAt = instant('2026-12-15T17:00:00Z');
const earlyNightWeather = weather(earlyNightAt, 5, { sunrise: '2026-12-15T08:00:00Z', sunset: '2026-12-15T16:00:00Z', isDay: false });
const earlyNight = planMoment(utc, earlyNightWeather, earlyNightAt, null, 81);
const eveningMemory = rememberMoment(null, earlyNight.direction, earlyNightAt);
const staleEveningAt = earlyNightAt + 105 * minute;
const staleEvening = planMoment(utc, earlyNightWeather, staleEveningAt, eveningMemory, 81);
assert.equal(staleEvening.action, 'REIMAGINE');
assert.equal(staleEvening.direction.phase, 'night');
assert.ok(['cosmos', 'coast'].includes(staleEvening.direction.scene));
assert.equal(staleEvening.direction.brief.temperature, null);
assert.match(staleEvening.reason, /earlier observed evening darkness/);
const forcedEvening = planMoment(utc, null, earlyNightAt + 5 * minute, eveningMemory, 81, { force: true });
assert.equal(forcedEvening.action, 'REIMAGINE');
assert.equal(forcedEvening.direction.phase, 'night');
assert.notEqual(forcedEvening.direction.scene, earlyNight.direction.scene);
const freshDaylight = planMoment(utc, weather(earlyNightAt + 10 * minute, 6, { isDay: true }), earlyNightAt + 10 * minute, eveningMemory, 81);
assert.equal(freshDaylight.action, 'REIMAGINE');
assert.equal(freshDaylight.direction.phase, 'day');
const nextMorning = planMoment(utc, null, instant('2026-12-16T07:00:00Z'), eveningMemory, 81);
assert.equal(nextMorning.direction.phase, 'morning');
const midnightAt = instant('2026-12-15T00:30:00Z');
const midnightFrame = planMoment(utc, null, midnightAt, null, 81);
assert.equal(planMoment(utc, null, earlyNightAt + 30 * minute, rememberMoment(null, midnightFrame.direction, midnightAt), 81).direction.phase, 'dusk', 'A missed morning does not latch an old midnight frame into the following evening');

const polar = { ...LONDON, latitude: 78.2, longitude: 15.6, timezone: 'Arctic/Longyearbyen' };
const polarEvening = instant('2026-06-21T18:55:00Z'); // 20:55 locally.
const polarContext = time => weather(time, 12, { isDay: true });
const polarDay = planMoment(polar, polarContext(polarEvening), polarEvening, null, 5);
const polarNight = planMoment(polar, polarContext(polarEvening + 5 * minute), polarEvening + 5 * minute, rememberMoment(null, polarDay.direction, polarEvening), 5);
assert.equal(polarDay.direction.phase, 'day');
assert.equal(polarNight.action, 'REIMAGINE');
assert.equal(polarNight.direction.phase, 'night');
assert.ok(['cosmos', 'coast'].includes(polarNight.direction.scene));
assert.match(polarNight.reason, /quiet hours take priority/);

for (const date of ['2026-12-09', '2026-01-07', '2026-06-21']) {
  assert.equal(planMoment(utc, null, instant(`${date}T18:00:00Z`), null, 55, { festive: true }).direction.recipe.festive, false);
}
for (const date of ['2026-12-10', '2026-12-25', '2027-01-06']) {
  assert.equal(planMoment(utc, null, instant(`${date}T18:00:00Z`), null, 55, { festive: true }).direction.recipe.festive, true);
  assert.equal(planMoment(utc, null, instant(`${date}T18:00:00Z`), null, 55).direction.recipe.festive, false);
}

// One full local day: bounded memory, no consecutive family repeats, unique committed seeds.
const start = instant('2026-10-15T05:00:00Z');
let simulated = null;
const commits = [];
for (let step = 0; step <= 24 * 6; step++) {
  const time = start + step * 10 * minute;
  const decision = planMoment(LONDON, weather(time, 18), time, simulated, 731);
  assert.ok(decision.nextCheckAt > time);
  if (decision.action === 'REIMAGINE') {
    const prior = commits.at(-1);
    if (prior) {
      assert.notEqual(decision.direction.scene, prior.direction.scene);
      assert.ok(time - prior.at <= 60 * minute);
      assert.notEqual(decision.direction.id, prior.direction.id);
    }
    commits.push({ direction: decision.direction, at: time });
    simulated = rememberMoment(simulated, decision.direction, time);
    assert.ok(simulated.history.length <= 12);
    assert.equal(parseStoryMemory(JSON.stringify(simulated), LONDON, time)?.history.length, simulated.history.length);
  }
  if (decision.direction.phase === 'night') assert.ok(['cosmos', 'coast'].includes(decision.direction.scene));
}
assert.ok(commits.length >= 24);
assert.equal(new Set(commits.map(item => item.direction.id)).size, commits.length);
assert.equal(new Set(commits.map(item => item.direction.recipe.seed)).size, commits.length);
assert.equal(simulated.history.length, 12);
assert.deepEqual(simulated.history, commits.slice(-12));

const encoded = JSON.stringify(memory);
assert.deepEqual(parseStoryMemory(encoded, LONDON, at), memory);
assert.equal(parseStoryMemory(encoded, sydney, at), null);
assert.equal(parseStoryMemory(encoded, LONDON, at - 1), null);
assert.equal(parseStoryMemory(null, LONDON, at), null);
assert.equal(parseStoryMemory('{bad', LONDON, at), null);
assert.equal(parseStoryMemory('x'.repeat(48_001), LONDON, at), null);
assert.equal(parseStoryMemory(encoded, LONDON, NaN), null);
const twoFrames = rememberMoment(memory, forced.direction, at + minute);
const reversedHistory = { ...twoFrames, history: [...twoFrames.history].reverse() };
assert.equal(parseStoryMemory(JSON.stringify(reversedHistory), LONDON, at + minute), null);
const sameSecond = rememberMoment(memory, forced.direction, at);
assert.deepEqual(parseStoryMemory(JSON.stringify(sameSecond), LONDON, at), sameSecond, 'Equal commit timestamps are legitimate');
const correctedClock = at - minute;
const correctedDirection = planMoment(LONDON, weather(correctedClock), correctedClock, memory, 123).direction;
const correctedMemory = rememberMoment(memory, correctedDirection, correctedClock);
assert.deepEqual(parseStoryMemory(JSON.stringify(correctedMemory), LONDON, correctedClock), correctedMemory, 'A backward clock correction must not persist future history');
const acrossMidnight = rememberMoment(null, initial.direction, instant('2026-06-22T00:00:00Z'));
assert.deepEqual(parseStoryMemory(JSON.stringify(acrossMidnight), LONDON, instant('2026-06-22T00:00:00Z')), acrossMidnight, 'An older planned calendar date may finish displaying after midnight');
function corrupt(change) {
  const value = JSON.parse(encoded);
  change(value);
  return parseStoryMemory(JSON.stringify(value), LONDON, at);
}
for (const change of [
  value => value.version = 2,
  value => value.history[0].at = at + 1,
  value => value.history[0].at = null,
  value => value.history[0].direction.recipe.date = '2026-02-30',
  value => { value.history[0].direction.recipe.date = '2026-06-22'; value.history[0].direction.brief.weekday = 'Monday'; },
  value => value.history[0].direction.recipe.seed = 0,
  value => value.history[0].direction.recipe.hour = 24,
  value => value.history[0].direction.recipe.theme = 'city',
  value => value.history[0].direction.brief.temperature = '25',
  value => value.history[0].direction.brief.weekday = 'Tuesday',
  value => value.history[0].direction.season = 'winter',
  value => value.history[0].direction.recipe.festive = true,
  value => value.history.push(value.history[0]),
  value => value.history = Array(13).fill(value.history[0]),
]) assert.equal(corrupt(change), null, 'Malformed or contradictory memory must be rejected');
assert.throws(() => rememberMoment(memory, initial.direction, Infinity), RangeError);
const reset = rememberMoment(memory, planMoment(sydney, null, at, memory, 123).direction, at);
assert.equal(reset.history.length, 1);
assert.notEqual(reset.locationKey, memory.locationKey);

console.log(`Passed creative policy, exact stable holds, temperature jitter, force, solar/quiet-hour darkness, calendar/season/weekend context, explicit festivities, safe committed memory, and ${commits.length} unique moments across 24 simulated hours.`);
