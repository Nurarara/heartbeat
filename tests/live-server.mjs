// Opt-in integration smoke check against a running dev server and real weather.
// No keys, browser automation or generation routes are used.
import assert from 'node:assert/strict';

const origin = process.env.HEARTBEAT_TEST_URL || 'http://127.0.0.1:5173';
async function request(path, status = 200) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, status, `${path}: HTTP ${response.status}`);
  return response;
}

const home = await (await request('/')).text();
assert.match(home, /heartbeat/i);
const short = await (await request('/api/locations?q=L')).json();
assert.deepEqual(short.locations, []);
const places = await Promise.all(['London', 'Tokyo', 'Sydney'].map(async city => {
  const { locations } = await (await request(`/api/locations?q=${city}`)).json();
  assert.ok(locations.length, `${city} search returned no places`);
  const place = locations.find(item => item.name === city && ({ London: 'Europe/London', Tokyo: 'Asia/Tokyo', Sydney: 'Australia/Sydney' })[city] === item.timezone);
  assert.ok(place, `${city} was not resolved to the expected timezone`);
  return place;
}));
const london = places[0];
const params = new URLSearchParams({ latitude: String(london.latitude), longitude: String(london.longitude), timezone: london.timezone });
const { context, serverTime } = await (await request(`/api/context?${params}`)).json();
assert.ok(Number.isFinite(serverTime) && Math.abs(Date.now() - serverTime) < 60000);
assert.ok(Number.isFinite(context.observedAt) && Number.isFinite(context.fetchedAt));
assert.ok(context.temperature === null || typeof context.temperature === 'number' && context.temperature >= -90 && context.temperature <= 65);
assert.equal(context.stale, false, 'Live upstream observation should be fresh');
assert.ok(Date.now() - context.observedAt <= 90 * 60000 && context.observedAt - Date.now() <= 5 * 60000);
for (const query of [
  'latitude=999&longitude=0&timezone=UTC',
  'latitude=51&longitude=0&timezone=Invalid/Timezone',
  'latitude=51',
]) {
  const invalid = await (await request(`/api/context?${query}`, 400)).json();
  assert.ok(invalid.error);
}
await Promise.all(['room', 'city', 'cosmos', 'meadow', 'lake', 'coast'].map(async scene => {
  assert.match(await (await request(`/prototype/scenes/${scene}.mjs`)).text(), /export function render/);
}));
console.log('Passed live home, London/Tokyo/Sydney geocoding, fresh outdoor context, invalid-city rejection and six renderer assets.');
