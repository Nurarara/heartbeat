import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fixture } from './product-fixture.mjs';
import { runArtworkJob } from '../lib/product/jobs.ts';
import { acknowledgeDisplay } from '../lib/product/profiles.ts';
import { MOOD_IDS, MOODS } from '../lib/moods.ts';

// ---------------------------------------------------------------------------------------------
// 1. Account path: a chosen mood is saved with the preferences and guides the NEXT picture.
// ---------------------------------------------------------------------------------------------
const preferences = { version: 1, location: { name: 'London', country: 'United Kingdom', latitude: 51.5, longitude: -.12, timezone: 'Europe/London' }, seed: 42, unit: 'c', reducedMotion: false };
const f = await fixture(), packets = []; let images = 0;
f.env.ARTWORK_WORKFLOW = { create: async () => {}, get: async () => ({ status: async () => ({ status: 'running' }) }) };
const deps = { now: f.now, context: async () => ({ temperature: 12, weatherCode: 2, observedAt: f.now(), fetchedAt: f.now(), isDay: true, cloudCover: 35 }),
  provider: () => ({ direct: async packet => { packets.push(packet); return { action: 'REIMAGINE', title: `Scene ${packets.length}`, reason: 'It fits the moment.', prompt: 'A scene built from the drawn words.', lighting: packet.rules.maximumLighting === 'dark' ? 'dark' : 'soft', themeIds: [], usedWords: packet.draw.slice(0, 3).map(word => word.id) }; },
    generate: async () => ({ bytes: new Uint8Array([255, 216, ++images, 255, 217]), mime: 'image/jpeg', width: 1280, height: 720 }) }) };
async function picture(cookie) {
  const requestId = crypto.randomUUID(); assert.equal((await f.call('generation', { requestId, force: true }, { cookie })).status, 202);
  const job = f.sqlite.prepare('SELECT * FROM hb_jobs WHERE request_id=?').get(requestId); await runArtworkJob(f.env, job.id, deps);
  const done = await (await f.call(`generation?requestId=${requestId}`, undefined, { cookie })).json(); assert.equal(done.status, 'ready');
  return { job, candidate: done.candidate, input: JSON.parse(f.sqlite.prepare('SELECT input FROM hb_jobs WHERE id=?').get(job.id).input) };
}
try {
  const a = await f.register();
  // No mood saved: Auto. The new engine still runs (draw + real sky), with no mood instruction.
  assert.equal((await f.call('preferences', { preferences }, { cookie: a.cookie })).status, 200);
  const auto = await picture(a.cookie);
  assert.equal(auto.input.mood, undefined); assert.equal(packets[0].mood, undefined);
  assert.equal(packets[0].draw.length, 7); assert.equal(packets[0].rules.minimumDrawnWords, 2);
  assert.ok(packets[0].context.sky.sun && packets[0].context.sky.moon, 'The real sky reaches the director');
  assert.match(packets[0].context.sky.cloud, /Scattered cloud/, 'Cloud cover from the weather reaches the director');
  // The words the director used are stored with the picture, for memory and down-weighting.
  assert.deepEqual(auto.candidate.direction.artwork.proposal.themes.map(theme => theme.id), packets[0].draw.slice(0, 3).map(word => word.id));
  assert.equal((await acknowledgeDisplay(f.env, a.data.user.id, { id: auto.job.id, eventId: 'shown-1' }, f.now())).displayed, true);

  // The picker saves the mood. It is validated on the server, and the current picture is untouched.
  assert.equal((await f.call('preferences', { preferences: { ...preferences, mood: 'furious' }, expectedVersion: 1 }, { cookie: a.cookie })).status, 400, 'Unknown moods are refused');
  const saved = await f.call('preferences', { preferences: { ...preferences, mood: 'sleep' }, expectedVersion: 1 }, { cookie: a.cookie });
  assert.equal(saved.status, 200); assert.equal((await saved.json()).preferences.mood, 'sleep');
  assert.equal((await (await f.call('preferences', undefined, { cookie: a.cookie })).json()).preferences.mood, 'sleep', 'The choice is remembered');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_jobs").get().n, 1, 'Choosing a mood starts no new picture and spends nothing');
  assert.equal(f.sqlite.prepare('SELECT current_asset_id id FROM hb_surfaces').get().id, auto.job.id, 'The current picture stays');

  // The NEXT picture follows the mood: Sleep is dark even at midday.
  f.advance(3_700_000);
  const sleep = await picture(a.cookie);
  assert.equal(sleep.input.mood, 'sleep'); assert.equal(packets[1].mood.id, 'sleep'); assert.equal(packets[1].mood.instruction, MOODS.sleep.instruction);
  assert.equal(packets[1].context.phase, 'day'); assert.equal(packets[1].rules.maximumLighting, 'dark'); assert.equal(packets[1].rules.requiredLighting, 'dark');
  assert.equal(packets[1].memory.frequent.some(item => item.id === packets[0].draw[0].id), true, 'Words from the shown picture are remembered');

  // Changing mood again while a picture waits: that picture is not shown under the old mood, and the next follows the new one.
  const changed = await f.call('preferences', { preferences: { ...preferences, mood: 'romantic' }, expectedVersion: 2 }, { cookie: a.cookie }); assert.equal(changed.status, 200);
  await assert.rejects(acknowledgeDisplay(f.env, a.data.user.id, { id: sleep.job.id, eventId: 'shown-2' }, f.now()), /atmosphere changed/);
  f.advance(3_700_000);
  const romantic = await picture(a.cookie);
  assert.equal(packets[2].mood.id, 'romantic'); assert.equal(packets[2].rules.maximumLighting, 'soft'); assert.equal(packets[2].rules.maximumMeanLight, .5);
  // Back to Auto removes the mood entirely.
  assert.equal((await (await f.call('preferences', { preferences, expectedVersion: 3 }, { cookie: a.cookie })).json()).preferences.mood, undefined);
  assert.equal(romantic.input.mood, 'romantic');
} finally { f.close(); }

// ---------------------------------------------------------------------------------------------
// 2. The chips themselves (real React component in a simulated DOM): keyboard and touch friendly.
// ---------------------------------------------------------------------------------------------
const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:5173/display', pretendToBeVisual: true });
for (const name of ['window', 'document', 'HTMLElement']) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const bundle = await build({ entryPoints: ['components/mood-picker.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, tsconfig: 'tsconfig.json', logLevel: 'silent' });
await mkdir('.sites-runtime/tests', { recursive: true }); await writeFile('.sites-runtime/tests/mood-picker.cjs', bundle.outputFiles[0].contents);
const { MoodPicker } = createRequire(import.meta.url)('../.sites-runtime/tests/mood-picker.cjs');
const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client'), root = createRoot(document.getElementById('app'));
try {
  const chosen = []; let value = 'auto';
  const render = (disabled = false) => act(async () => root.render(React.createElement(MoodPicker, { value, disabled, onChoose: mood => { chosen.push(mood); value = mood; } })));
  await render();
  const group = document.querySelector('[role="group"]'), chips = () => [...group.querySelectorAll('button')];
  assert.match(group.getAttribute('aria-label'), /Mood/);
  assert.deepEqual(chips().map(chip => chip.textContent), MOOD_IDS.map(id => MOODS[id].label));
  assert.ok(chips().every(chip => chip.type === 'button' && chip.querySelector('i[aria-hidden="true"]').style.background), 'Every chip is a real button with a colour dot');
  assert.deepEqual(chips().filter(chip => chip.getAttribute('aria-pressed') === 'true').map(chip => chip.textContent), ['Auto']);
  await act(async () => chips().find(chip => chip.textContent === 'Dreamy').click());
  assert.deepEqual(chosen, ['dreamy']); await render();
  assert.deepEqual(chips().filter(chip => chip.getAttribute('aria-pressed') === 'true').map(chip => chip.textContent), ['Dreamy']);
  await act(async () => chips().find(chip => chip.textContent === 'Dreamy').click());
  assert.deepEqual(chosen, ['dreamy'], 'Choosing the current mood again does nothing');
  await render(true); assert.ok(chips().every(chip => chip.disabled));
  await act(async () => chips()[1].click()); assert.deepEqual(chosen, ['dreamy'], 'Disabled chips cannot change the mood');
  await act(async () => root.unmount());
} finally { dom.window.close(); }
// The display places the chips inside its auto-hiding controls, and the fade follows the mood.
const display = await readFile('app/live-heartbeat.tsx', 'utf8'), css = await readFile('app/live-ambient.css', 'utf8');
assert.match(display, /<footer className="hb-controls hb-chrome"[^>]*>\{customer&&<MoodPicker /, 'Chips live in the controls that appear on movement and fade when idle');
assert.match(css, /\[data-quiet="true"\] \.hb-chrome \{ opacity: 0; pointer-events: none; \}/);
assert.match(display, /fadeMs=\{/);

// ---------------------------------------------------------------------------------------------
// 3. The live test viewer: start with a mood, change it from the page, and the next picture follows.
//    Real script and local server; weather, director and painter are mocked (no credits).
// ---------------------------------------------------------------------------------------------
const out = await mkdtemp(path.join(tmpdir(), 'heartbeat-live-')), port = 5300 + Math.floor(Math.random() * 400), origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['--import', './tests/fixtures/live-test-mock.mjs', '--experimental-strip-types', 'scripts/live-test.mts', 'count=2', 'every=0.2', 'lead=4', 'mood=calm', `port=${port}`, `out=${out}`],
  { env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'fake', KIE_API_KEY: 'fake', NODE_NO_WARNINGS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
const state = async () => (await fetch(`${origin}/state`)).json(), until = async (test, label) => { for (let i = 0; i < 300; i++) { try { const value = await test(); if (value) return value; } catch { /* server still starting */ } await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timed out waiting for ${label}.\n${output}`); };
const post = (mood, from = origin) => fetch(`${origin}/mood`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: from }, body: JSON.stringify({ mood }) });
try {
  const first = await until(async () => { const s = await state(); return s.frames[0]?.file && !s.preparing ? s : null; }, 'the first picture');
  assert.equal(first.mood, 'calm'); assert.equal(first.frames[0].mood, 'calm'); assert.equal(first.frames[0].fadeMs, MOODS.calm.crossfadeMs);
  assert.deepEqual(first.moods.map(mood => mood.id), [...MOOD_IDS]); assert.equal(first.frames[0].words.length, 3); assert.equal('prompt' in first.frames[0], false);
  const page = await (await fetch(origin)).text();
  assert.match(page, /id="moods" role="group"/); assert.match(page, /body\.awake \.moods,\.moods:focus-within\{opacity:1/); assert.match(page, /'pointermove','pointerdown','keydown','touchstart'/);
  assert.equal((await post('dreamy', 'https://elsewhere.example')).status, 403, 'Other sites cannot change the mood');
  assert.equal((await post('furious')).status, 400); assert.equal((await fetch(`${origin}/mood`)).status, 404);
  assert.equal((await state()).mood, 'calm');
  const accepted = await post('dreamy'); assert.equal(accepted.status, 200); assert.deepEqual(await accepted.json(), { mood: 'dreamy' });
  const after = await state(); assert.equal(after.mood, 'dreamy'); assert.equal(after.frames.length, 1, 'Changing the mood starts no extra picture'); assert.equal(after.frames[0].mood, 'calm', 'The current picture stays as it was');
  const done = await until(async () => { const s = await state(); return s.done ? s : null; }, 'the run to finish');
  assert.equal(done.frames.length, 2); assert.equal(done.frames[1].mood, 'dreamy', 'The next picture follows the chosen mood'); assert.equal(done.frames[1].fadeMs, MOODS.dreamy.crossfadeMs);
  assert.ok(done.frames[1].file && done.frames[1].showAt >= done.frames[0].showAt + 12000 - 50, 'It still appears on schedule');
  const log = JSON.parse(await readFile(path.join(out, 'log.json'), 'utf8')); assert.equal(log.frames[1].mood, 'dreamy'); assert.match(log.frames[1].sky, /moon/);
  assert.match(output, /mood calm/); assert.match(output, /Mood changed to dreamy/); assert.match(output, /Drawn words: /);
} finally { child.kill(); await rm(out, { recursive: true, force: true }); }
// An unknown starting mood is refused before anything is spent.
const refused = spawn(process.execPath, ['--experimental-strip-types', 'scripts/live-test.mts', 'mood=furious'], { env: { ...process.env, NODE_NO_WARNINGS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let complaint = ''; refused.stderr.on('data', chunk => { complaint += chunk; });
assert.equal(await new Promise(resolve => refused.on('exit', resolve)), 1); assert.match(complaint, /Unknown mood "furious"\. Use one of: auto, calm, sleep, cosy, focus, playful, dreamy, romantic/);
console.log('Passed mood picker: saved and validated with account preferences, no picture started or spent by choosing, current picture kept, NEXT picture follows the mood (Sleep dark at midday, Romantic dim), stale-mood picture not shown, real chip component (labels, colour dots, pressed state, disabled), chips inside auto-hiding controls, and the live-test viewer mood change end to end with same-origin protection. SQLite real; DOM simulated; weather, director and painter mocked.');
