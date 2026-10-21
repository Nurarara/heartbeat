// Real SQLite transactions + mocked provider/R2. No credentialed inference.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile } from 'node:fs/promises';
import { aiService } from '../lib/ai/service.ts';
import { planMoment, parseStoryMemory, rememberMoment } from '../lib/ambient-director.ts';
import { acceptableNightLight } from '../lib/artwork-quality.ts';

function d1(sqlite) {
  function prepared(sql, args = []) {
    const statement = sqlite.prepare(sql);
    return { bind: (...values) => prepared(sql, values), first: async () => statement.get(...args) || null,
      all: async () => ({ results: statement.all(...args) }),
      run: async () => sync(), sync };
    function sync() {
      const value = statement.run(...args); return { success: true, results: [], meta: { changes: Number(value.changes) } };
    }
  }
  return { prepare: prepared, batch: async statements => { sqlite.exec('BEGIN'); try { const result = statements.map(item => item.sync()); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
}
const sqlite = new DatabaseSync(':memory:');
for (const file of (await readdir('drizzle')).filter(file => file.endsWith('.sql')).sort()) sqlite.exec(await readFile(`drizzle/${file}`, 'utf8'));
const objects = new Map(); let at = Date.parse('2026-10-19T22:00:00Z'), directCalls = 0, imageCalls = 0, fail = false, hold = false, duplicate = false, delay, cleanupFailure = false, lastPacket;
const env = { DB: d1(sqlite), BUCKET: { put: async (key, bytes) => objects.set(key, new Uint8Array(bytes)), get: async key => objects.has(key) ? { body: new Response(objects.get(key)).body } : null, delete: async key => { if (cleanupFailure) throw new Error('Mock retention failure'); return objects.delete(key); } }, HEARTBEAT_AI_ENABLED: 'true', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'fake-test-token', HEARTBEAT_AI_ACCESS_KEY: 'fake-display-key-'.repeat(4), HEARTBEAT_APP_ORIGIN: 'http://localhost:5173', HEARTBEAT_AI_DAILY_LIMIT: '3' };
const place = { name: 'London', country: 'United Kingdom', latitude: 51.5, longitude: -.12, timezone: 'UTC' };
const weather = () => ({ temperature: 8, observedAt: at, fetchedAt: at, isDay: false, weatherCode: 63 });
const service = aiService(env, { now: () => at, context: async () => weather(), provider: () => ({ direct: async packet => { lastPacket = packet; directCalls++; if (fail) throw new Error('Mock provider failed'); return { action: hold ? 'HOLD' : 'REIMAGINE', title: 'Quiet night', reason: 'Restful artwork for the local night.', prompt: hold ? '' : 'A quiet dark coast with distant small windows.', lighting: 'dark', themeIds: hold ? [] : packet.inspiration[0].themes.map(theme => theme.id) }; }, generate: async () => { imageCalls++; if (delay) await delay; return { bytes: new Uint8Array([255, 216, duplicate ? 1 : imageCalls, 255, 217]), mime: 'image/jpeg', width: 1024, height: 1024 }; } }) });
async function call(path, { cookie, body, method = body ? 'POST' : 'GET', origin = env.HEARTBEAT_APP_ORIGIN } = {}) {
  return service.handle(new Request(`${env.HEARTBEAT_APP_ORIGIN}/api/ai/${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
}
async function login() { const response = await call('session', { body: { accessKey: env.HEARTBEAT_AI_ACCESS_KEY } }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; }
const data = (id = crypto.randomUUID()) => ({ requestId: id, location: place, force: true });
const used = () => sqlite.prepare('SELECT COUNT(*) AS used FROM ai_attempts WHERE day = ?').get(new Date(at).toISOString().slice(0, 10)).used;
try {
  assert.equal((await (await aiService({}).handle(new Request('http://localhost/api/ai/status'))).json()).configured, false);
  assert.equal((await call('session', { body: { accessKey: env.HEARTBEAT_AI_ACCESS_KEY }, origin: 'https://elsewhere.test' })).status, 403);
  assert.equal((await call('session', { body: { accessKey: 'wrong' } })).status, 401);
  const connectAt = (url, origin) => service.handle(new Request(`${url}/api/ai/session`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey: env.HEARTBEAT_AI_ACCESS_KEY }) }));
  assert.equal((await connectAt('http://127.0.0.1:5173', 'http://127.0.0.1:5173')).status, 200, 'The dev URL printed by Vite works with a localhost configuration');
  assert.equal((await connectAt('http://[::1]:5173', 'http://[::1]:5173')).status, 200);
  assert.equal((await connectAt('http://127.0.0.1:5173', 'http://localhost:5173')).status, 403, 'Cross-origin requests remain blocked');
  assert.equal((await connectAt('http://127.0.0.1:5174', 'http://127.0.0.1:5174')).status, 403);
  assert.equal((await connectAt('http://127.0.0.1.evil.test:5173', 'http://127.0.0.1.evil.test:5173')).status, 403);
  const production = aiService({ ...env, HEARTBEAT_APP_ORIGIN: 'https://heartbeat.example' });
  assert.equal((await production.handle(new Request('http://127.0.0.1:5173/api/ai/session', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5173' } }))).status, 403, 'Production origin never trusts a loopback alternative');
  const owner = await login(), foreign = await login();
  assert.equal((await call('prepare', { body: data() })).status, 401);
  assert.equal((await call('prepare', { cookie: owner + 'forged', body: data() })).status, 401);
  const requests = Array.from({ length: 20 }, () => data());
  const results = await Promise.all(requests.map(body => call('prepare', { cookie: owner, body })));
  assert.equal(directCalls, 1); assert.equal(imageCalls, 1); assert.equal(used(), 1);
  assert.equal(lastPacket.context.weather.condition, 'rain');
  assert.equal(lastPacket.context.weather.code, 63);
  assert.match(lastPacket.inspiration[0].prompt, /Rain or rain showers/);
  const ready = await results.find(response => response.status === 200).json(); assert.equal(ready.status, 'ready');
  const candidate = ready.candidate;
  assert.ok(parseStoryMemory(JSON.stringify({ version: 1, locationKey: candidate.locationKey, history: [{ direction: candidate.direction, at: candidate.createdAt }] }), place, at));
  const restored = rememberMoment(null, candidate.direction, at);
  assert.equal(restored.creative.usage['scene:cosmos'], undefined, 'Generated pictures cannot claim a fallback SVG was displayed');
  assert.ok(Object.keys(restored.creative.usage).length > 0);
  const replay = await call('prepare', { cookie: owner, body: { ...data(candidate.requestId), location: { ...place, latitude: -20 } } });
  assert.equal((await replay.json()).candidate.id, candidate.id); assert.equal(directCalls, 1);
  assert.equal((await call(`art/${candidate.id}`, { cookie: foreign })).status, 404);
  assert.equal((await call('display', { cookie: foreign, body: { id: candidate.id } })).status, 409);
  assert.equal((await call(`art/${candidate.id}`, { cookie: owner })).headers.get('cache-control'), 'private, no-store');
  assert.equal((await call('display', { cookie: owner, body: { id: candidate.id } })).status, 200);
  assert.equal((await call('display', { cookie: owner, body: { id: candidate.id } })).status, 200);
  // Separate sessions cannot each acquire their own account allowance.
  const owners = [foreign];
  for (let index = 0; index < 19; index++) { if (index % 5 === 0) at += 60000; owners.push(await login()); }
  await Promise.all(owners.map(cookie => call('prepare', { cookie, body: data() })));
  assert.equal(used(), 3); assert.equal(directCalls, 3); assert.equal(imageCalls, 3);
  // A duplicate remains retrievable even after the global budget is exhausted.
  assert.equal((await (await call(`attempt?requestId=${candidate.requestId}`, { cookie: owner })).json()).status, 'ready');
  at += 86400000;
  fail = true; const failedRequest = data();
  assert.equal((await (await call('prepare', { cookie: owner, body: failedRequest })).json()).status, 'failed');
  const afterFailure = directCalls;
  assert.equal((await (await call('prepare', { cookie: owner, body: failedRequest })).json()).status, 'failed');
  assert.equal(directCalls, afterFailure); assert.equal(used(), 1, 'Failed work remains spent');
  fail = false; hold = true; at += 600000;
  const direction = planMoment(place, weather(), at, null, 42).direction;
  const memory = rememberMoment(null, direction, at);
  const beforeHoldImages = imageCalls;
  assert.equal((await (await call('prepare', { cookie: owner, body: { ...data(), force: false, memory: JSON.stringify(memory) } })).json()).status, 'held');
  assert.equal(imageCalls, beforeHoldImages); assert.equal(used(), 2, 'Director-only holds still consume an attempt');
  const heldAt = at;
  assert.ok((await (await call('status', { cookie: owner })).json()).nextAt >= heldAt + 3600000);
  at += 600000;
  assert.equal((await call('prepare', { cookie: owner, body: data() })).status, 429, 'Reload cannot bypass a director hold');
  hold = false; at += 3000000;
  const old = crypto.randomUUID();
  sqlite.prepare("INSERT INTO ai_attempts(id,owner,request_id,claim,day,status,location_key,created_at,art_key) VALUES (?,?,?,?,?,'ready',?,?,?)").run(old, candidate.direction.artwork.attemptId, crypto.randomUUID(), 'old-claim', '2026-01-01', 'old-place', at - 8 * 86400000, 'old-art');
  // Associate the aged object with a real session so retention will encounter it.
  sqlite.prepare('UPDATE ai_attempts SET owner = (SELECT id FROM ai_sessions LIMIT 1) WHERE id = ?').run(old);
  cleanupFailure = true;
  const newer = await (await call('prepare', { cookie: owner, body: { ...data(), memory: JSON.stringify(restored) } })).json();
  assert.equal(newer.status, 'ready', 'A retention failure cannot abandon a ready candidate');
  assert.equal(lastPacket.memory.recentArtwork.at(-1).summary, restored.history.at(-1).direction.artwork.proposal.prompt);
  assert.equal(lastPacket.context.localDate, new Date(at).toISOString().slice(0,10));
  cleanupFailure = false;
  await call('display', { cookie: owner, body: { id: newer.candidate.id } });
  await call('display', { cookie: owner, body: { id: candidate.id } });
  assert.equal(sqlite.prepare('SELECT current_id FROM ai_sessions WHERE current_id = ?').get(newer.candidate.id).current_id, newer.candidate.id, 'Late ACK cannot restore an older current picture');
  at += 86400000; at += 600000;
  duplicate = true;
  assert.equal((await (await call('prepare', { cookie: owner, body: data() })).json()).status, 'failed', 'Identical image bytes are rejected');
  assert.equal(used(), 1);
  // A late provider result from an expired lease cannot overwrite a newer claim.
  at += 86400000; duplicate = false;
  let release; delay = new Promise(resolve => { release = resolve; });
  const firstInput = data(), firstRun = call('prepare', { cookie: owner, body: firstInput });
  const beforeImages = imageCalls;
  while (imageCalls === beforeImages) await new Promise(resolve => setImmediate(resolve));
  delay = undefined; at += 600000;
  const latest = await (await call('prepare', { cookie: owner, body: data() })).json();
  assert.equal(latest.status, 'ready');
  release(); assert.equal((await (await firstRun).json()).status, 'failed');
  assert.equal((await (await call(`attempt?requestId=${latest.candidate.requestId}`, { cookie: owner })).json()).status, 'ready');
  assert.equal(used(), 2);
  const white = new Uint8ClampedArray(32 * 20 * 4).fill(255), dark = new Uint8ClampedArray(32 * 20 * 4).fill(8);
  assert.equal(acceptableNightLight(white), false); assert.equal(acceptableNightLight(dark), true);
  // New cookie/login and browser history reset cannot reset the durable ledger.
  const third = await login();
  assert.equal((await (await call('status', { cookie: third })).json()).used, 2);
  console.log('Passed real-SQLite AI service: concurrent reservation, shared cap, replay, failed/HOLD accounting, private images, signed sessions, display ACK ordering, duplicate image rejection, midnight reset and night-light guard. Provider/R2 mocked; no paid calls.');
} finally { sqlite.close(); }
