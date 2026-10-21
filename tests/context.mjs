import assert from 'node:assert/strict';
import { collectContext, contextPlace, locationResults, searchPlaces } from '../lib/context.ts';
import { weatherCue } from '../lib/weather-mood.ts';
import { planMoment, rememberMoment, parseStoryMemory } from '../lib/ambient-director.ts';

const selected = new URLSearchParams({ latitude: '51.5085', longitude: '-0.1257', timezone: 'Europe/London' });
const london = contextPlace(selected);
assert.equal(london.timezone, 'Europe/London');
assert.equal(contextPlace(new URLSearchParams()), null);
for (const values of [
  { latitude: '', longitude: '0', timezone: 'UTC' },
  { latitude: '1' },
  { latitude: '91', longitude: '0', timezone: 'UTC' },
  { latitude: '0', longitude: '-181', timezone: 'UTC' },
  { latitude: 'Infinity', longitude: '0', timezone: 'UTC' },
  { latitude: '0', longitude: '0', timezone: 'Mars/Olympus' },
]) assert.throws(() => contextPlace(new URLSearchParams(values)));
assert.equal(locationResults({ results: [null, {}, { name: 'Bad', timezone: 'UTC', latitude: 999, longitude: 0 }] }).length, 0);
const result = { name: 'London', country: 'United Kingdom', latitude: 51.5085, longitude: -.1257, timezone: 'Europe/London' };
assert.deepEqual(locationResults({ results: [result] }), [result]);

const originalFetch = globalThis.fetch;
const testAt = Date.parse('2026-10-20T12:00:00Z');
const weatherAt = code => ({ temperature: 6, weatherCode: code, observedAt: testAt, fetchedAt: testAt, isDay: true });
for (const [code, condition] of [[0,'clear'],[3,'overcast'],[45,'fog'],[51,'drizzle'],[63,'rain'],[81,'rain'],[73,'snow'],[95,'storm'],[97,'storm'],[999,'unknown']]) assert.equal(weatherCue(weatherAt(code), testAt).condition, condition);
assert.equal(weatherCue(weatherAt(63), testAt + 91 * 60000).condition, 'unknown');
assert.equal(weatherCue(weatherAt(63), testAt - 6 * 60000).condition, 'unknown');
assert.equal(weatherCue(null, testAt).observedAt, null);
const clear = planMoment(london, weatherAt(0), testAt, null, 42).direction;
const clearMemory = rememberMoment(null, clear, testAt);
assert.equal(planMoment(london, weatherAt(63), testAt + 5 * 60000, clearMemory, 42).action, 'HOLD');
const rainy = planMoment(london, weatherAt(63), testAt + 11 * 60000, clearMemory, 42);
assert.equal(rainy.action, 'REIMAGINE');
assert.equal(rainy.direction.brief.weather, 'rain');
assert.notEqual(rainy.direction.scene, 'meadow');
assert.match(rainy.direction.brief.atmosphere, /Muted, diffused/);
assert.equal(parseStoryMemory(JSON.stringify(rememberMoment(null, rainy.direction, testAt + 11 * 60000)), london, testAt + 11 * 60000).history[0].direction.brief.weather, 'rain');
let request, observation = { time: Math.floor(Date.now() / 1000), temperature_2m: 12, weather_code: 3, is_day: 1 };
const solar = Math.floor(Date.now() / 1000) - 3600;
try {
  globalThis.fetch = async (url, options) => {
    request = { url: new URL(String(url)), options };
    return Response.json({ current: observation, daily: { sunrise: [solar], sunset: [solar + 36000] } });
  };
  const context = await collectContext(london);
  assert.equal(context.temperature, 12);
  assert.equal(context.observedAt, observation.time * 1000);
  assert.equal(context.sunrise, new Date(solar * 1000).toISOString());
  assert.equal(context.isDay, true);
  assert.equal(request.url.searchParams.get('timeformat'), 'unixtime');
  assert.equal(request.url.searchParams.get('temperature_unit'), 'celsius');
  assert.ok(request.options.signal instanceof AbortSignal);
  observation = { ...observation, temperature_2m: null, is_day: null };
  const missing = await collectContext(london);
  assert.equal(missing.temperature, null);
  assert.equal(missing.isDay, null);
  assert.ok(missing.sunrise, 'Missing temperature must not throw away valid solar timings');
  observation = { ...observation, temperature_2m: 1000 };
  assert.equal((await collectContext(london)).temperature, null);
  observation = { ...observation, time: Math.floor(Date.now() / 1000) - 91 * 60 };
  assert.equal((await collectContext(london)).stale, true);
  observation = { ...observation, time: Math.floor(Date.now() / 1000) + 10 * 60 };
  assert.equal((await collectContext(london)).stale, true);
  observation = { ...observation, time: null };
  await assert.rejects(() => collectContext(london), /Invalid weather data/);
  globalThis.fetch = async () => new Response('', { status: 503 });
  await assert.rejects(() => collectContext(london), /Weather unavailable/);
  globalThis.fetch = async () => Response.json({ results: [result] });
  assert.deepEqual(await searchPlaces('London'), [result]);
  console.log('Passed explicit city validation, upstream observation parsing, Celsius/epoch handling, missing data and provider failures.');
} finally { globalThis.fetch = originalFetch; }
