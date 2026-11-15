import assert from 'node:assert/strict';
import { sunPosition, moonPosition, moonPhase, skyStage, skyCue, compass } from '../lib/sky.ts';
import { collectContext } from '../lib/context.ts';
import { usableContext } from '../lib/ambient.ts';

const london = { latitude: 51.5074, longitude: -0.1278 }, at = iso => Date.parse(iso);
const sun = iso => sunPosition(london.latitude, london.longitude, at(iso));
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

// Published London sunrise and sunset times put the sun on the horizon (about -0.83 degrees with refraction).
near(sun('2026-06-21T03:43:00Z').elevation, -0.83, 0.5, 'midsummer sunrise 04:43 BST');
near(sun('2026-06-21T20:21:00Z').elevation, -0.83, 0.5, 'midsummer sunset 21:21 BST');
near(sun('2026-12-21T08:04:00Z').elevation, -0.83, 0.5, 'midwinter sunrise 08:04 GMT');
near(sun('2026-12-21T15:53:00Z').elevation, -0.83, 0.5, 'midwinter sunset 15:53 GMT');
// Solar noon: high and due south in June, low in December.
near(sun('2026-06-21T12:02:00Z').elevation, 61.9, 0.5, 'midsummer noon height'); near(sun('2026-06-21T12:02:00Z').azimuth, 180, 2, 'noon is due south');
near(sun('2026-12-21T12:00:00Z').elevation, 15.1, 0.5, 'midwinter noon height');
// Southern hemisphere: the midsummer noon sun stands in the north over Sydney.
const sydney = sunPosition(-33.87, 151.21, at('2026-12-21T02:00:00Z')); near(sydney.elevation, 79.5, 1, 'Sydney noon'); assert.equal(compass(sydney.azimuth), 'north');
assert.equal(compass(48.9), 'north-east'); assert.equal(compass(311), 'north-west'); assert.equal(compass(359), 'north');

assert.deepEqual([-30, -15, -9, -5, -2, 3, 12, 30, 60].map(skyStage), ['night', 'astronomical-twilight', 'nautical-twilight', 'civil-twilight', 'civil-twilight', 'golden-hour', 'low-sun', 'day', 'high-sun']);

// London golden hour on a midsummer evening: low warm sun in the north-west, about to set.
const golden = skyCue(london, at('2026-06-21T20:00:00Z'), 10);
assert.equal(golden.stage, 'golden-hour'); assert.equal(golden.rising, false); assert.equal(golden.lightCeiling, null);
assert.match(golden.sun, /Golden hour: a very low warm sun in the north-west \(about to set\), very long soft shadows\./);
assert.match(golden.cloud, /clear, open sky/);
// Morning golden hour is told apart from evening, and comes from the east side.
const dawn = skyCue(london, at('2026-06-21T04:10:00Z'));
assert.equal(dawn.stage, 'golden-hour'); assert.equal(dawn.rising, true); assert.match(dawn.sun, /north-east \(just risen\)/); assert.equal(dawn.cloud, 'Cloud cover unknown.');
// Midday: high sun, short shadows. Winter midday: only a low sun.
assert.equal(skyCue(london, at('2026-06-21T12:00:00Z')).stage, 'high-sun'); assert.match(skyCue(london, at('2026-06-21T12:00:00Z')).sun, /short shadows/);
assert.equal(skyCue(london, at('2026-12-21T12:00:00Z')).stage, 'low-sun'); assert.match(skyCue(london, at('2026-12-21T12:00:00Z')).sun, /long shadows/);

// Dusk darkens gradually: golden hour, then twilight (soft at most), blue hour, then dark.
const dusk = ['2026-06-21T20:10:00Z', '2026-06-21T20:35:00Z', '2026-06-21T21:02:00Z', '2026-06-21T21:40:00Z'].map(time => skyCue(london, at(time)));
assert.deepEqual(dusk.map(cue => cue.stage), ['golden-hour', 'civil-twilight', 'civil-twilight', 'nautical-twilight']);
assert.deepEqual(dusk.map(cue => cue.lightCeiling), [null, 'soft', 'soft', 'dark']);
assert.deepEqual(dusk.map(cue => cue.blueHour), [false, false, true, false]);
assert.match(dusk[2].sun, /^Blue hour after sunset/);
for (let i = 1; i < dusk.length; i++) assert.ok(dusk[i].darkness > dusk[i - 1].darkness, 'darkness only increases through dusk');
assert.equal(skyCue(london, at('2026-06-21T12:00:00Z')).darkness, 0); assert.equal(skyCue(london, at('2026-12-21T00:00:00Z')).darkness, 1);
// London midsummer nights never reach full astronomical darkness; midwinter nights do.
assert.equal(skyCue(london, at('2026-06-21T00:00:00Z')).stage, 'astronomical-twilight'); assert.equal(skyCue(london, at('2026-12-21T00:00:00Z')).stage, 'night');

// Moon phase against known events: two total eclipses (exact full and new moon) and almanac dates.
const full = moonPhase(at('2025-03-14T06:55:00Z')); assert.equal(full.phase, 'full'); assert.ok(full.illumination > .99);   // total lunar eclipse
const dark = moonPhase(at('2024-04-08T18:21:00Z')); assert.equal(dark.phase, 'new'); assert.ok(dark.illumination < .01);    // total solar eclipse
assert.equal(moonPhase(at('2024-01-25T17:54:00Z')).phase, 'full'); assert.equal(moonPhase(at('2025-01-13T22:27:00Z')).phase, 'full');
// The phases follow each other in order through one month.
const month = [0, 4, 7.4, 11, 14.8, 18.5, 22.1, 26, 29.5].map(days => moonPhase(at('2024-04-08T18:21:00Z') + days * 86400000).phase);
assert.deepEqual(month, ['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent', 'new']);
// A full moon is opposite the sun: up at midnight, down at midday.
assert.ok(moonPosition(london.latitude, london.longitude, at('2025-01-13T23:59:00Z')).elevation > 30);
assert.ok(moonPosition(london.latitude, london.longitude, at('2025-01-13T12:00:00Z')).elevation < 0);
const fullNight = skyCue(london, at('2025-01-13T23:59:00Z'), 95);
assert.equal(fullNight.moonPhase, 'full'); assert.equal(fullNight.moonUp, true); assert.match(fullNight.moon, /^A full moon, above the horizon now\./);
assert.match(fullNight.cloud, /Thick cloud hides the sun and moon/);
assert.match(skyCue(london, at('2024-04-08T18:21:00Z')).moon, /^New moon: the moon is not visible/);
assert.match(skyCue(london, at('2024-04-10T20:00:00Z')).moon, /thin waxing crescent moon/);
assert.match(skyCue(london, 0, 60).cloud, /Mostly cloudy/); assert.match(skyCue(london, 0, 30).cloud, /Scattered cloud/); assert.equal(skyCue(london, 0, 140).cloud, 'Cloud cover unknown.');

// Cloud cover is requested from Open-Meteo and survives into the usable context; older responses still work.
{
  const original = globalThis.fetch, now = Date.now(); let requested;
  const reply = current => async url => { requested = new URL(url); return Response.json({ current: { time: Math.floor(now / 1000), temperature_2m: 11, weather_code: 3, is_day: 1, ...current }, daily: { sunrise: [Math.floor(now / 1000) - 3600], sunset: [Math.floor(now / 1000) + 3600] } }); };
  const place = { name: 'London', country: 'United Kingdom', timezone: 'Europe/London', ...london };
  try {
    globalThis.fetch = reply({ cloud_cover: 87.4 });
    const context = await collectContext(place);
    assert.match(requested.searchParams.get('current'), /(^|,)cloud_cover(,|$)/); assert.equal(context.cloudCover, 87); assert.equal(usableContext(context, now).cloudCover, 87);
    globalThis.fetch = reply({});
    const without = await collectContext(place); assert.equal('cloudCover' in without, false); assert.equal(without.temperature, 11);
    globalThis.fetch = reply({ cloud_cover: 250 });
    assert.equal('cloudCover' in await collectContext(place), false, 'An impossible cloud value is dropped, not trusted');
  } finally { globalThis.fetch = original; }
}
console.log('Passed sky awareness: sun height and direction against published London sunrise/sunset/noon, twilight stages, gradual dusk darkening, golden and blue hour, moon phases against eclipse dates, moonrise sense, cloud wording and cloud cover in weather context. Pure maths; weather mocked.');
