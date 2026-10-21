import assert from 'node:assert/strict';
import { LONDON } from '../lib/world.ts';
import { parsePreferences, localClock, usableContext, ambientDirection } from '../lib/ambient.ts';

const saved = { version: 1, location: LONDON, seed: 713, unit: 'c', reducedMotion: false };
const parse = value => parsePreferences(JSON.stringify(value));
assert.deepEqual(parse(saved), saved);
assert.deepEqual(parse({ ...saved, location: { ...LONDON, name: ' London ', admin1: ' England ' } }).location, { ...LONDON, admin1: 'England' });
assert.equal(parsePreferences(null), null);
assert.equal(parsePreferences('{invalid'), null);
assert.equal(parsePreferences(' '.repeat(4097)), null);
for (const value of [[], null, {}, { ...saved, version: 2 }, { ...saved, seed: 0 }, { ...saved, seed: -1 }, { ...saved, seed: 1.5 }, { ...saved, seed: 2 ** 32 }, { ...saved, unit: 'kelvin' }, { ...saved, reducedMotion: 'false' }]) {
  assert.equal(parse(value), null, `Malformed preferences were accepted: ${JSON.stringify(value)}`);
}
for (const location of [
  { ...LONDON, name: '' }, { ...LONDON, name: 'x'.repeat(101) }, { ...LONDON, name: 'London\u0000' },
  { ...LONDON, country: 123 }, { ...LONDON, country: 'x'.repeat(101) }, { ...LONDON, admin1: null },
  { ...LONDON, latitude: 90.01 }, { ...LONDON, latitude: '51' }, { ...LONDON, longitude: -180.01 },
  { ...LONDON, timezone: 'Mars/Olympus' }, { ...LONDON, timezone: '+02:00' }, { ...LONDON, timezone: '' },
]) assert.equal(parse({ ...saved, location }), null);
assert.equal(parse({ ...saved, seed: 0xffffffff, location: { ...LONDON, latitude: -90, longitude: 180, timezone: 'UTC' } }).seed, 0xffffffff);
assert.equal('unknown' in parse({ ...saved, unknown: 'discard me' }), false);

const utc = { ...LONDON, timezone: 'UTC' };
assert.deepEqual(localClock(utc, Date.parse('2026-10-15T00:00:00Z')), { time: '00:00', date: '2026-10-15', hour: 0, weekday: 'Thursday' });
const india = { ...LONDON, timezone: 'Asia/Kolkata' };
assert.deepEqual(localClock(india, Date.parse('2026-10-15T19:15:30Z')), { time: '00:45', date: '2026-10-16', hour: 0.7583333333333333, weekday: 'Friday' });
assert.equal(localClock({ ...LONDON, timezone: 'Pacific/Honolulu' }, Date.parse('2026-01-01T01:00:00Z')).date, '2025-12-31');
assert.equal(localClock(LONDON, Date.parse('2026-03-29T00:30:00Z')).time, '00:30');
assert.equal(localClock(LONDON, Date.parse('2026-03-29T01:30:00Z')).time, '02:30');
assert.equal(localClock(LONDON, Date.parse('2026-10-25T00:30:00Z')).time, '01:30');
assert.equal(localClock(LONDON, Date.parse('2026-10-25T01:30:00Z')).time, '01:30');

const now = Date.parse('2026-10-15T12:00:00Z');
const observation = { observedAt: now, fetchedAt: now, temperature: 24, weatherCode: 3, isDay: true, sunrise: '2026-10-15T06:30:00Z', sunset: '2026-10-15T17:00:00Z' };
assert.equal(usableContext(null, now), null);
for (const context of [
  { ...observation, stale: true }, { ...observation, observedAt: NaN },
  { ...observation, observedAt: now - 90 * 60_000 - 1 }, { ...observation, observedAt: now + 5 * 60_000 + 1 },
]) assert.equal(usableContext(context, now), null);
assert.equal(usableContext(observation, NaN), null);
assert.ok(usableContext({ ...observation, observedAt: now - 90 * 60_000 }, now));
assert.ok(usableContext({ ...observation, observedAt: now + 5 * 60_000 }, now));
for (const temperature of [null, NaN, Infinity, '24', undefined]) {
  const usable = usableContext({ ...observation, temperature }, now);
  assert.equal(usable.temperature, null);
  assert.equal(usable.sunrise, observation.sunrise);
  assert.equal(usable.isDay, true);
}
assert.equal(usableContext({ ...observation, temperature: 0 }, now).temperature, 0);
assert.equal(usableContext({ ...observation, sunrise: '2026-10-15T06:30:00' }, now).sunrise, undefined);
assert.equal(observation.stale, undefined, 'Context helper must not mutate the observation');

const daytime = ambientDirection(LONDON, observation, now, 713);
assert.equal(daytime.scene, 'room');
assert.equal(daytime.phase, 'day');
assert.equal(daytime.recipe.temperature, 24);
assert.equal(daytime.recipe.hour, 13);
assert.equal(daytime.recipe.seed, 713);
assert.equal(daytime.recipe.festive, false);
assert.equal(daytime.recipe.theme, 'room');
assert.match(daytime.reason, /fresh local sunrise and sunset/);
assert.deepEqual(ambientDirection(LONDON, observation, now, 713), daytime);

// Solar dusk can occur before a fixed clock threshold; fresh observations win.
const solarDusk = Date.parse('2026-10-15T16:45:00Z');
assert.equal(ambientDirection(LONDON, { ...observation, observedAt: solarDusk, sunset: '2026-10-15T17:00:00Z' }, solarDusk, 713).scene, 'city');
const winterDark = Date.parse('2026-12-15T16:00:00Z');
const winter = { ...observation, temperature: null, observedAt: winterDark, sunrise: '2026-12-15T08:00:00Z', sunset: '2026-12-15T15:00:00Z' };
assert.equal(ambientDirection(LONDON, winter, winterDark, 713).scene, 'cosmos');
assert.match(ambientDirection(LONDON, winter, winterDark, 713).reason, /temperature unavailable/);
assert.equal(ambientDirection(LONDON, winter, winterDark, 713).recipe.temperature, 20);

// A stale daytime flag cannot keep the night screen bright; fallback uses local time.
const midnight = Date.parse('2026-10-15T23:15:00Z');
const quiet = ambientDirection(LONDON, { ...observation, stale: true }, midnight, 713);
assert.equal(quiet.scene, 'cosmos');
assert.equal(quiet.recipe.date, '2026-10-16');
assert.equal(quiet.recipe.temperature, 20);
assert.match(quiet.reason, /local clock/);
assert.match(quiet.reason, /temperature unavailable/);
assert.doesNotMatch(quiet.reason, /sunny|rain|snow|festive|christmas/i);
assert.equal(ambientDirection(utc, null, Date.parse('2026-10-15T18:00:00Z'), 713).scene, 'city');
assert.equal(ambientDirection(utc, null, Date.parse('2026-10-15T08:00:00Z'), 713).phase, 'morning');
assert.equal(ambientDirection(utc, null, Date.parse('2026-10-15T12:00:00Z'), 713).scene, 'room');

console.log('Passed local preference validation, DST/calendar rollover, fresh context boundaries, missing-temperature honesty, solar phases, and restful night selection.');
