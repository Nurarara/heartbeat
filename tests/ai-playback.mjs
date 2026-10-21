// Full React director -> AI client -> decoded player -> ACK flow in a simulated DOM.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { planMoment } from '../lib/ambient-director.ts';
import { proposeCreativeMoment } from '../lib/creative.ts';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173', pretendToBeVisual: true });
const { window } = dom;
for (const name of ['window', 'document', 'HTMLElement', 'localStorage']) Object.defineProperty(globalThis, name, { value: name === 'window' ? window : window[name], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true });
let hidden = false, paused = false, at = Date.parse('2026-10-19T12:00:00Z'), capture, release, queuedRecovery, available = true, claimAt = 0;
Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
globalThis.Image = function () { const image = document.createElement('img'); image.decode = () => Promise.resolve(); return image; };
const location = { name: 'London', country: 'United Kingdom', latitude: 51.5, longitude: -.12, timezone: 'UTC' };
const preferences = { version: 1, location, seed: 42, unit: 'c', reducedMotion: true };
let posts = 0, polls = 0, acknowledgements = 0, invalidId;
function candidate(input, timestamp = at, wrongPhase = false) {
  const id = crypto.randomUUID();
  const direction = planMoment(location, null, timestamp, null, 43).direction;
  if (wrongPhase) { direction.phase = 'day'; invalidId = id; }
  const proposal = proposeCreativeMoment({ phase: direction.phase, season: direction.season, temperature: null, weekday: direction.brief.weekday, festive: false }, undefined, 44, timestamp);
  proposal.source = 'ai-director';
  direction.id = `generated-${id}`;
  direction.artwork = { attemptId: id, url: `/api/ai/art/${id}`, title: 'A generated quiet moment', proposal };
  return { id, requestId: input.requestId, locationKey: direction.locationKey, createdAt: timestamp, direction };
}
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path === '/api/ai/status') return Response.json({ configured: true, authorized: true, available, reason: 'Test session connected', dailyLimit: 3, used: posts, nextAt: claimAt + 600000 });
  if (path === '/api/ai/display') { acknowledgements++; return Response.json({ displayed: true }); }
  if (path === '/api/ai/prepare') {
    posts++; claimAt = at;
    const input = JSON.parse(options.body);
    if (posts === 1) return new Promise(resolve => { release = () => resolve(Response.json({ status: 'ready', candidate: candidate(input), nextAt: claimAt + 600000 })); });
    if (posts === 2) { queuedRecovery = candidate(input); available = false; throw new Error('Simulated lost response after paid work'); }
    return Response.json({ status: 'ready', candidate: candidate(input, at, true), nextAt: claimAt + 600000 });
  }
  if (path.startsWith('/api/ai/attempt?')) { polls++; return Response.json({ status: 'ready', candidate: queuedRecovery, nextAt: claimAt + 600000 }); }
  throw new Error(`Unexpected test request ${path}`);
};
const result = await build({ stdin: { contents: `import React from 'react';import {useAmbientDirector} from './hooks/use-ambient-director';import {useAIPlayback} from './hooks/use-ai-playback';import {AmbientArt} from './components/ambient-art';const storageFailure=()=>{};export default function Harness(p){const local=useAmbientDirector(p.preferences,null,p.at,p.paused,storageFailure);const ai=useAIPlayback({base:local.direction,memory:local.memory,preferences:p.preferences,at:p.at,paused:p.paused,visible:local.visible,accept:local.acceptGenerated,reject:local.rejectGenerated,localCanDisplay:local.canDisplay});p.capture({local,ai});return ai.displayDirection?<AmbientArt direction={ai.displayDirection} paused={p.paused} reducedMotion={true} visible={local.visible} retryToken={local.retryToken} onError={d=>d.artwork?ai.onFailure(d):local.onFailure(d)} onDisplayed={d=>{local.onDisplayed(d);ai.onDisplayed(d)}} canDisplay={ai.canDisplay}/>:null}`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, tsconfig: 'tsconfig.json', logLevel: 'silent' });
const artifact = new URL('../.sites-runtime/tests/ai-playback.cjs', import.meta.url);
await mkdir(new URL('../.sites-runtime/tests/', import.meta.url), { recursive: true }); await writeFile(artifact, result.outputFiles[0].contents);
const Harness = createRequire(import.meta.url)(fileURLToPath(artifact)).default;
const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('app'));
const history = () => JSON.parse(localStorage.getItem('heartbeat.story.v1') || '{"history":[]}').history;
const settle = async (ms = 15) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
async function render() { await act(async () => root.render(React.createElement(Harness, { preferences, at, paused, capture: value => { capture = value; } }))); await settle(); }
async function until(predicate) { for (let count = 0; count < 100; count++) { if (predicate()) return; await settle(); } assert.fail('Timed out awaiting playback state'); }
try {
  await render(); await until(() => posts === 1 && history().length === 1);
  assert.ok(document.querySelector('.hb-art-image').src.startsWith('blob:'));
  const before = JSON.stringify(history());
  for (let tick = 0; tick < 20; tick++) { at += 1000; await render(); }
  assert.equal(posts, 1, 'Clock renders never duplicate a funded request');
  paused = true; await render();
  await act(async () => release()); await settle();
  assert.equal(JSON.stringify(history()), before, 'Prepared images are not committed while paused');
  paused = false; await render(); await until(() => history().at(-1).direction.artwork);
  assert.equal(acknowledgements, 1);
  const first = history().at(-1).direction;
  assert.match(document.querySelector('.hb-art-image').src, /\/api\/ai\/art\//);
  await act(async () => capture.local.requestMoment()); await settle();
  assert.equal(posts, 1, 'Manual inspiration does not bypass the cooldown');
  assert.ok(document.querySelector('.hb-art-image').src.endsWith(first.artwork.attemptId), 'Current generated picture stays while replacement waits');
  at += 3600000; await render(); await until(() => posts === 2 && !capture.ai.busy);
  assert.equal(history().at(-1).direction.id, first.id);
  at += 600000; await render(); await until(() => polls === 1 && history().at(-1).direction.id !== first.id);
  assert.equal(posts, 2, 'Recovery polls, including when the daily allowance is exhausted');
  assert.equal(acknowledgements, 2);
  available = true; at = Date.parse('2026-10-19T22:00:00Z'); await act(async () => capture.ai.refresh()); await render();
  await until(() => posts === 3 && !capture.ai.busy); await settle();
  assert.ok(!history().some(item => item.direction.artwork?.attemptId === invalidId), 'Stale/bright direction never enters history');
  assert.equal(history().at(-1).direction.phase, 'night');
  console.log('Passed AI playback integration: free first frame, one funded request, paused preparation, decoded display/ACK, preserved artwork, cooldown, recovery at cap without another POST and nighttime stale-candidate rejection. Network/image decode mocked.');
} finally { await act(async () => root.unmount()); dom.window.close(); }
