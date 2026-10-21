// Fast clock/visibility simulation of the actual director hook and decoded player.
// This is lifecycle verification, not a real-time soak test or browser screenshot QA.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://heartbeat.test/', pretendToBeVisual: true });
const { window } = dom;
for (const name of ['window', 'document', 'HTMLElement', 'localStorage']) Object.defineProperty(globalThis, name, { value: name === 'window' ? window : window[name], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false });
let hidden = false, holdImages = false, rejectImage = false;
Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
const deferred = [], created = new Set(), revoked = new Set();
const realCreate = URL.createObjectURL.bind(URL), realRevoke = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = blob => { const url = realCreate(blob); created.add(url); return url; };
URL.revokeObjectURL = url => { revoked.add(url); realRevoke(url); };
globalThis.Image = function () {
  const image = document.createElement('img');
  image.decode = () => {
    if (rejectImage) { rejectImage = false; return Promise.reject(new Error('Simulated invalid candidate')); }
    return holdImages ? new Promise(resolve => deferred.push(resolve)) : Promise.resolve();
  };
  return image;
};
const bundle = await build({ stdin: { contents: `import React from 'react'; import {useAmbientDirector} from './hooks/use-ambient-director'; import {AmbientArt} from './components/ambient-art'; const storageFailure=()=>{}; export default function Harness(props) {const director=useAmbientDirector(props.preferences,props.context,props.at,props.paused,storageFailure); props.capture(director); return director.direction ? <AmbientArt direction={director.direction} paused={props.paused} reducedMotion={props.preferences.reducedMotion} visible={director.visible} retryToken={director.retryToken} onError={director.onFailure} onDisplayed={director.onDisplayed} canDisplay={director.canDisplay}/> : null;}`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, tsconfig: 'tsconfig.json', logLevel: 'silent' });
const artifact = new URL('../.sites-runtime/tests/ambient-playback.cjs', import.meta.url);
await mkdir(new URL('../.sites-runtime/tests/', import.meta.url), { recursive: true });
await writeFile(artifact, bundle.outputFiles[0].contents);
const Harness = createRequire(import.meta.url)(fileURLToPath(artifact)).default;
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const minute = 60000;
const location = { name: 'London', country: 'United Kingdom', timezone: 'Europe/London', latitude: 51.5085, longitude: -.1257 };
let at = Date.parse('2026-06-20T12:00:00Z'), temperature = 24, paused = false, director, root;
const preferences = { version: 1, location, seed: 42, unit: 'c', reducedMotion: true };
const capture = value => { director = value; };
const history = () => JSON.parse(localStorage.getItem('heartbeat.story.v1') || '{"history":[]}').history;
const currentId = () => document.querySelector('.hb-art-frame:last-child')?.dataset.momentId;
const settle = async (ms = 15) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
async function render() {
  await act(async () => { root.render(React.createElement(Harness, { preferences, at, paused, context: { temperature, observedAt: at, fetchedAt: at, isDay: null, weatherCode: null }, capture })); });
  await settle();
}
async function mount() { root = createRoot(document.getElementById('app')); await render(); await settle(); }
async function visibility(value) { hidden = value; await act(async () => { document.dispatchEvent(new window.Event('visibilitychange')); }); await settle(); }
async function unmount() { await act(async () => { root.unmount(); }); await settle(); }

try {
  await mount();
  assert.equal(history().length, 1);
  const firstId = currentId();
  const firstFamily = history().at(-1).direction.scene;
  const decoded = created.size;
  at += 5 * minute; temperature = 24.2; await render();
  assert.equal(currentId(), firstId);
  assert.equal(created.size, decoded, 'A stable hold does not decode another image');
  at += 5 * minute; temperature = 14; await render();
  assert.notEqual(currentId(), firstId);
  assert.notEqual(history().at(-1).direction.scene, firstFamily);

  const commits = [history().at(-1).direction];
  for (let step = 1; step <= 24 * 6; step++) {
    at += 10 * minute;
    await render();
    const latest = history().at(-1).direction;
    if (latest.id !== commits.at(-1).id) {
      assert.notEqual(latest.scene, commits.at(-1).scene);
      commits.push(latest);
    }
    assert.ok(history().length <= 12);
    assert.ok(document.querySelector('.hb-art-image'), 'Every simulated heartbeat keeps a visible image');
    if (director.direction.phase === 'night') assert.ok(['cosmos', 'coast'].includes(director.direction.scene));
  }
  assert.ok(commits.length >= 24);
  assert.equal(new Set(commits.map(value => value.id)).size, commits.length);
  assert.equal(new Set(commits.map(value => value.recipe.seed)).size, commits.length);

  // A pending picture is never history, including if it finishes while hidden.
  at = Date.parse('2026-06-21T12:30:00Z'); await render();
  const beforeHidden = JSON.stringify(history());
  holdImages = true;
  await act(async () => { director.requestMoment(); }); await settle();
  assert.equal(JSON.stringify(history()), beforeHidden);
  await visibility(true);
  at = Date.parse('2026-06-21T21:30:00Z'); await render();
  await act(async () => { for (const resolve of deferred.splice(0)) resolve(); }); await settle();
  assert.equal(JSON.stringify(history()), beforeHidden, 'Hidden decoded candidates never enter history');
  holdImages = false;
  await visibility(false); await settle();
  assert.equal(history().at(-1).direction.phase, 'night');
  assert.ok(['cosmos', 'coast'].includes(document.querySelector('.hb-art-frame:last-child').dataset.scene));

  // Pausing across a long gap defers progression, then resumes with one current scene.
  paused = true; await render();
  const pausedId = currentId(), pausedHistory = JSON.stringify(history());
  at += 10 * 60 * minute; await render();
  assert.equal(currentId(), pausedId);
  assert.equal(JSON.stringify(history()), pausedHistory);
  paused = false; await render(); await settle();
  assert.notEqual(currentId(), pausedId);
  const afterResume = history().at(-1).direction.id;
  await render();
  assert.equal(history().at(-1).direction.id, afterResume, 'Resume does not replay missed moments');

  // Failed image -> same current frame/history -> bounded automatic retry -> one commit.
  const kept = currentId(), keptHistory = JSON.stringify(history());
  rejectImage = true;
  await act(async () => { director.requestMoment(); }); await settle();
  assert.equal(currentId(), kept);
  assert.equal(JSON.stringify(history()), keptHistory);
  assert.equal(director.failed, true);
  await settle(5150); await settle();
  assert.notEqual(currentId(), kept);
  assert.equal(director.failed, false);
  const restored = currentId();
  await unmount(); await mount();
  assert.equal(currentId(), restored, 'Reload restores the actually displayed composition');

  // Real-duration transitions: interrupted fades must not become history, and
  // rapid manual requests must eventually leave one frame and one new commit.
  preferences.reducedMotion = false; await render();
  const beforeBurst = JSON.stringify(history());
  for (let request = 0; request < 10; request++) {
    await act(async () => { director.requestMoment(); }); await settle();
    assert.ok(document.querySelector('.hb-art-image'), 'A burst never clears the screen');
    assert.equal(JSON.stringify(history()), beforeBurst, 'Partial fades do not become committed history');
  }
  const finalBurst = currentId();
  await settle(1950);
  assert.equal(history().at(-1).direction.id, finalBurst);
  assert.equal(history().filter(item => !JSON.parse(beforeBurst).some(old => old.direction.id === item.direction.id)).length, 1);
  assert.equal(document.querySelectorAll('.hb-art-frame').length, 1, 'Interrupted frames are all removed after fades');
  assert.equal([...created].filter(url => !revoked.has(url)).length, 1, 'Only the visible image URL remains allocated');
  // Finishing a fade while hidden or paused cannot commit/ACK unseen artwork.
  const beforeHiddenFade = JSON.stringify(history());
  await act(async () => { director.requestMoment(); }); await settle();
  await visibility(true); await settle(1950);
  assert.equal(JSON.stringify(history()), beforeHiddenFade);
  await visibility(false); await settle();
  assert.equal(history().at(-1).direction.id, currentId(), 'A deferred fade commits when visible again');
  const beforePausedFade = JSON.stringify(history());
  await act(async () => { director.requestMoment(); }); await settle();
  paused = true; await render(); await settle(1950);
  assert.equal(JSON.stringify(history()), beforePausedFade);
  paused = false; await render(); await settle();
  assert.equal(history().at(-1).direction.id, currentId(), 'A deferred fade commits on resume');
  await unmount();
  assert.ok([...created].every(url => revoked.has(url)), 'Every candidate image URL is released');
  console.log(`Passed ${commits.length} unique displayed moments over 24 simulated hours, exact holds, bounded memory, hidden decode/night return, pause/backlog, automatic retry, reload, full-duration interrupted fades, rapid requests and URL cleanup.`);
} finally {
  if (document.getElementById('app').childNodes.length) await unmount();
  dom.window.close();
}
