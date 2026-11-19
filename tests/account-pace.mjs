// The signed-in browser display follows the account's pace, counted from when each picture was started, and a
// failed request is retried at that pace (between 1 and 10 minutes), never a fixed 10 minutes. DOM simulated; server mocked.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { planMoment } from '../lib/ambient-director.ts';
import { proposeCreativeMoment } from '../lib/creative.ts';
let CADENCE = 120000, failNext = false;
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost:5173', pretendToBeVisual: true });
const { window } = dom;
for (const name of ['window', 'document', 'HTMLElement', 'localStorage']) Object.defineProperty(globalThis, name, { value: name === 'window' ? window : window[name], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true; window.matchMedia = () => ({ matches: true });
let at = Date.parse('2026-11-19T12:00:00Z'); const start = at; let serverNext = 0; const posts = []; const jobs = new Map();
globalThis.Image = function () { const image = document.createElement('img'); image.decode = () => Promise.resolve(); return image; };
const location = { name: 'London', country: 'United Kingdom', latitude: 51.5, longitude: -.12, timezone: 'UTC' };
const preferences = { version: 1, location, seed: 42, unit: 'c', reducedMotion: true };
function candidate(input) { const id = crypto.randomUUID(); const direction = planMoment(location, null, at, null, 43).direction; const proposal = proposeCreativeMoment({ phase: direction.phase, season: direction.season, temperature: null, weekday: direction.brief.weekday, festive: false }, undefined, 44, at); proposal.source = 'ai-director'; direction.id = `generated-${id}`; direction.artwork = { attemptId: id, url: `/api/ai/art/${id}`, title: 'A picture', proposal }; return { id, requestId: input.requestId, locationKey: direction.locationKey, createdAt: at, direction }; }
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path === '/api/ai/status') return Response.json({ configured: true, authorized: true, available: true, account: true, reason: 'ok', dailyLimit: 999, used: posts.length, nextAt: serverNext, cadence: CADENCE });
  if (path === '/api/product/generation' && !options.method) return Response.json({ status: 'idle' });
  if (path === '/api/product/generation' && options.method === 'POST') { const input = JSON.parse(options.body); if (serverNext > at) { posts.push(-1); return Response.json({ error: 'Your next picture is queued until its cadence.' }, { status: 429 }); } if (failNext) { failNext = false; posts.push((at - start) / 60000); return Response.json({ error: 'Something went wrong.' }, { status: 500 }); } posts.push((at - start) / 60000); serverNext = at + 5000 + CADENCE; jobs.set(input.requestId, { readyAt: at + 75000, input }); return Response.json({ status: 'pending', requestId: input.requestId, retryAfter: 5 }, { status: 202 }); }
  if (path.startsWith('/api/product/generation?requestId=')) { const id = new URL('http://x' + path).searchParams.get('requestId'), job = jobs.get(id); if (!job) return Response.json({ error: 'not found' }, { status: 404 }); if (at < job.readyAt) return Response.json({ status: 'pending', requestId: id, retryAfter: 5 }, { status: 202 }); job.c ??= candidate(job.input); return Response.json({ status: 'ready', candidate: job.c, nextAt: serverNext }); }
  if (path.startsWith('/api/product/display')) return Response.json({ displayed: true });
  if (path.startsWith('/api/ai/art/')) return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
  throw new Error('Unexpected ' + path);
};
const source = `import React,{useState,useEffect} from 'react';import {useAmbientDirector} from './hooks/use-ambient-director';import {useAIPlayback} from './hooks/use-ai-playback';import {AmbientArt} from './components/ambient-art';const storageFailure=()=>{};export default function Harness(p){const [rhythm,setRhythm]=useState(undefined);const local=useAmbientDirector(p.preferences,null,p.at,false,storageFailure,null,Math.min(rhythm??30000,30000));const ai=useAIPlayback({base:local.direction,memory:local.memory,preferences:p.preferences,at:p.at,paused:false,visible:local.visible,accept:local.acceptGenerated,reject:local.rejectGenerated,localCanDisplay:local.canDisplay},true);useEffect(()=>{if(ai.connection.cadence&&ai.connection.cadence!==rhythm)setRhythm(ai.connection.cadence)},[ai.connection.cadence,rhythm]);p.capture({local,ai});return ai.displayDirection?<AmbientArt direction={ai.displayDirection} paused={false} reducedMotion={true} visible={local.visible} retryToken={local.retryToken} onError={d=>d.artwork?ai.onFailure(d):local.onFailure(d)} onDisplayed={d=>{local.onDisplayed(d);ai.onDisplayed(d)}} canDisplay={ai.canDisplay}/>:null}`;
const result = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, tsconfig: 'tsconfig.json', logLevel: 'silent', loader: { '.css': 'empty' } });
await mkdir(new URL('../.sites-runtime/tests/', import.meta.url), { recursive: true }); await writeFile(new URL('../.sites-runtime/tests/account-pace.cjs', import.meta.url), result.outputFiles[0].contents);
const Harness = createRequire(import.meta.url)(fileURLToPath(new URL('../.sites-runtime/tests/account-pace.cjs', import.meta.url))).default;
const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client');
async function run(cadence, minutes, fail = false) {
  CADENCE = cadence; failNext = fail; posts.length = 0; serverNext = 0; jobs.clear(); localStorage.clear(); at = start;
  const root = createRoot(document.getElementById('app')); let cap;
  const settle = async (ms = 15) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
  for (let step = 0; step <= minutes * 4; step++) { at = start + step * 15000; await act(async () => root.render(React.createElement(Harness, { preferences, at, capture: v => { cap = v; } }))); for (let i = 0; i < 5; i++) await settle(); }
  await act(async () => root.unmount());
  return posts.filter(p => p >= 0);
}
const gaps = list => list.slice(1).map((v, i) => v - list[i]);
for (const minutes of [2, 3, 10]) {
  const requests = await run(minutes * 60000, minutes * 4 + 1);
  assert.ok(requests.length >= 4, `${minutes}-minute pace: several pictures (${requests.join(', ')})`);
  for (const gap of gaps(requests)) assert.ok(gap >= minutes && gap <= minutes + .5, `${minutes}-minute pace keeps to about ${minutes} minutes, not longer (gaps ${gaps(requests).join(', ')})`);
}
const afterFailure = await run(120000, 8, true);
assert.equal(afterFailure[0], 0); assert.ok(afterFailure[1] <= 2.5, `After a failed request the display tries again at the 2-minute pace (${afterFailure.join(', ')})`);
console.log('Passed account pace: the browser display asks for a new picture every 2, 3 and 10 minutes when that is the pace, counted from when each picture was started, and retries a failed request at the pace instead of after 10 minutes. DOM simulated; server mocked with 75-second painting.');
dom.window.close(); process.exit(0);
