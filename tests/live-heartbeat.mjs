// Interaction acceptance checks in a simulated DOM. These do not claim browser visual QA.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://heartbeat.test/', pretendToBeVisual: true });
const { window } = dom;
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'KeyboardEvent', 'MouseEvent', 'localStorage']) Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
let rejectNextImage = false, decodeCalls = 0;
globalThis.Image = function () {
  const image = window.document.createElement('img');
  image.decode = () => { decodeCalls++; if (rejectNextImage) { rejectNextImage = false; return Promise.reject(new Error('Simulated decode failure')); } return Promise.resolve(); };
  return image;
};
const created = new Set(), revoked = new Set();
const realCreate = URL.createObjectURL.bind(URL), realRevoke = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = blob => { const url = realCreate(blob); created.add(url); return url; };
URL.revokeObjectURL = url => { revoked.add(url); realRevoke(url); };

const london = { name: 'London', country: 'United Kingdom', timezone: 'Europe/London', latitude: 51.5085, longitude: -0.1257 };
const tokyo = { name: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', latitude: 35.68, longitude: 139.69 };
const calls = [];
let holdTokyo = false, resolveTokyo, temperature = 12, failWeather = false;
const reading = () => ({ temperature, observedAt: Date.now(), fetchedAt: Date.now(), weatherCode: 3, isDay: null });
const response = data => Response.json(data);
globalThis.fetch = async (url, options = {}) => {
  const request = new URL(String(url), 'http://heartbeat.test'); calls.push(request.pathname);
  if (request.pathname === '/api/locations') return response({ locations: request.searchParams.get('q')?.toLowerCase().includes('tok') ? [tokyo] : [london] });
  if (request.pathname === '/api/context') {
    if (failWeather) throw new Error('Simulated offline weather');
    if (holdTokyo && request.searchParams.get('latitude') === String(tokyo.latitude)) return await new Promise(resolve => { resolveTokyo = resolve; });
    return response({ context: reading(), serverTime: Date.now() });
  }
  if (request.hostname === 'api.open-meteo.com') throw new Error('Simulated offline weather fallback');
  throw new Error(`Unexpected request: ${request.href}`);
};

const output = await build({ entryPoints: ['app/live-heartbeat.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, logLevel: 'silent', tsconfig: 'tsconfig.json' });
const artifact = new URL('../.sites-runtime/tests/live-heartbeat.cjs', import.meta.url);
await mkdir(new URL('../.sites-runtime/tests/', import.meta.url), { recursive: true });
await writeFile(artifact, output.outputFiles[0].contents);
const { default: Heartbeat } = createRequire(import.meta.url)(fileURLToPath(artifact));
const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
let root;
const originalStorage = globalThis.localStorage;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const settle = async (ms = 15) => { await act(async () => { await sleep(ms); }); };
const click = async element => { assert.ok(element, 'Expected an interactive element'); await act(async () => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await settle(); };
const button = label => document.querySelector(`button[aria-label="${label}"]`);
async function typeCity(name) {
  const input = document.querySelector('input[aria-label="Your city"]'); assert.ok(input);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, name);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await settle(350);
}
async function mount() { await act(async () => { root = createRoot(document.getElementById('app')); root.render(React.createElement(Heartbeat)); }); await settle(); }
async function unmount() { await act(async () => { root.unmount(); }); await settle(); }

try {
  await mount();
  assert.equal(document.querySelector('.hb-opening h1').textContent, 'heartbeat');
  assert.equal(document.querySelector('.hb-clock'), null, 'No fabricated location/time before city selection');
  assert.equal(document.querySelectorAll('.hb-opening input').length, 1, 'Only one onboarding input');
  await typeCity('London');
  assert.ok(document.querySelector('[role="option"]'), 'City search exposes a selectable result');
  await act(async () => { document.querySelector('input[aria-label="Your city"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
  await act(async () => { document.querySelector('input[aria-label="Your city"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await settle();
  assert.equal(JSON.parse(localStorage.getItem('heartbeat.ambient.v1')).location.name, 'London');
  assert.match(document.querySelector('.hb-temperature').textContent, /12°C/);
  assert.ok(document.querySelector('.hb-clock time').textContent.match(/^\d{2}:\d{2}$/));
  assert.equal(document.querySelector('.clock-date'), null, 'No permanent date overlay');
  assert.equal(document.querySelectorAll('.hb-art-frame').length, 1);

  await click(button('City and display settings'));
  assert.ok(document.querySelector('[role="dialog"]'));
  await click([...document.querySelectorAll('.hb-unit-buttons button')].find(item => item.textContent === '°F'));
  assert.match(document.querySelector('.hb-temperature').textContent, /54°F/);

  // Switching cities immediately invalidates the old city's reading, even before new fetch completes.
  holdTokyo = true;
  await typeCity('Tokyo');
  await click(document.querySelector('[role="option"]'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.match(document.querySelector('.hb-temperature').textContent, /—/);
  assert.doesNotMatch(document.querySelector('.hb-temperature').textContent, /54/);
  assert.equal(JSON.parse(localStorage.getItem('heartbeat.ambient.v1')).location.name, 'Tokyo');
  await act(async () => { resolveTokyo(response({ context: { ...reading(), temperature: 28 }, serverTime: Date.now() })); });
  await settle();
  assert.match(document.querySelector('.hb-temperature').textContent, /82°F/);
  holdTokyo = false;

  // Remembered city skips onboarding on a later visit; a new observation replaces old data.
  temperature = 5;
  await unmount(); await mount();
  assert.equal(document.querySelector('.hb-opening'), null);
  assert.match(document.querySelector('.hb-temperature').textContent, /41°F/);
  assert.match(document.querySelector('.hb-city-button').textContent, /Tokyo/);

  // Brief previews and taste feedback must never masquerade as displayed images.
  await click(button('City and display settings'));
  const beforePreview = JSON.parse(localStorage.getItem('heartbeat.story.v1'));
  await click([...document.querySelectorAll('button')].find(item => item.textContent === 'Preview a scene idea'));
  assert.ok(document.querySelector('.hb-idea'));
  assert.match(document.querySelector('.hb-idea').textContent, /has not been generated or displayed/);
  assert.deepEqual(JSON.parse(localStorage.getItem('heartbeat.story.v1')), beforePreview);
  await click([...document.querySelectorAll('button')].find(item => item.textContent === 'Less like this'));
  const rated = JSON.parse(localStorage.getItem('heartbeat.story.v1'));
  assert.equal(rated.creative.displayed, beforePreview.creative.displayed);
  assert.ok(Object.keys(rated.creative.feedback).length > 0);
  const keptPreferences = localStorage.getItem('heartbeat.ambient.v1');
  await click([...document.querySelectorAll('button')].find(item => item.textContent === 'Reset creative history'));
  assert.equal(localStorage.getItem('heartbeat.ambient.v1'), keptPreferences);
  assert.equal(JSON.parse(localStorage.getItem('heartbeat.story.v1')).history.length, 1);
  assert.deepEqual(JSON.parse(localStorage.getItem('heartbeat.story.v1')).creative.feedback, {});
  await click(button('Close settings'));

  // Pause freezes art, while outdoor information continues refreshing independently.
  await click(button('Pause artwork changes'));
  const beforePause = decodeCalls;
  await click(button('City and display settings'));
  temperature = 29;
  await click([...document.querySelectorAll('button')].find(item => item.textContent === 'Refresh temperature'));
  assert.match(document.querySelector('.hb-temperature').textContent, /84°F/);
  assert.equal(decodeCalls, beforePause);
  await click(button('Close settings'));
  await click(button('Resume artwork changes'));
  assert.equal(decodeCalls, beforePause, 'Resume keeps a stable, already decoded scene');
  await click(button('New artwork variation'));
  assert.ok(decodeCalls > beforePause);

  // An unsuitable candidate never clears the previously displayed image.
  const keptImage = document.querySelector('.hb-art-image').src;
  rejectNextImage = true;
  await click(button('New artwork variation'));
  assert.equal(document.querySelector('.hb-art-image').src, keptImage);
  assert.match(document.querySelector('.hb-notice').textContent, /current artwork is kept/);
  await click(button('New artwork variation'));
  assert.ok(document.querySelector('.hb-art-image'));

  // A mouse-focused control cannot keep the ambient chrome visible indefinitely.
  await act(async () => { button('City and display settings').focus(); });
  await settle(5100);
  assert.equal(document.querySelector('.heartbeat-live').dataset.quiet, 'true');
  await act(async () => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); });
  assert.equal(document.querySelector('.heartbeat-live').dataset.quiet, 'false');

  // Unavailable weather on a reload stays unavailable, with the local clock still present.
  failWeather = true;
  await unmount(); await mount();
  assert.match(document.querySelector('.hb-temperature').textContent, /—/);
  assert.ok(document.querySelector('.hb-clock time').textContent);
  assert.ok(!calls.some(path => ['/api/heartbeat', '/api/display', '/api/world'].includes(path)), 'Local display never invokes generation or database-owned world routes');
  await unmount();

  // Storage denial must still allow a city, clock, weather and artwork this session.
  failWeather = false;
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage blocked'); } }, configurable: true });
  await mount();
  assert.ok(document.querySelector('.hb-opening'));
  await typeCity('London');
  await click(document.querySelector('[role="option"]'));
  assert.ok(document.querySelector('.hb-clock time'));
  assert.ok(document.querySelector('.hb-art-image'));
  await click(button('City and display settings'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /cannot save your city/);
  await unmount();
  Object.defineProperty(globalThis, 'localStorage', { value: originalStorage, configurable: true });
  assert.ok([...created].every(url => revoked.has(url)), 'All image URLs are released on unmount');
  console.log('Passed simulated-DOM keyboard city setup/remembering, real-context display, city race isolation, units, pause, decode failure recovery, offline clock, blocked storage and image cleanup.');
} finally {
  Object.defineProperty(globalThis, 'localStorage', { value: originalStorage, configurable: true });
  if (document.getElementById('app').childNodes.length) await unmount();
  dom.window.close();
}
