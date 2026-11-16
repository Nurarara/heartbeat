import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { exportSite, SITE_HEADERS } from '../scripts/export-site.mjs';
import { MOOD_IDS, MOODS } from '../lib/moods.ts';

// The public early-access site: landing, prepared demo, and city -> mood -> preview -> early access.
const dom = new JSDOM('<div id="app"></div>', { url: 'https://heartbeatart.co.uk/', pretendToBeVisual: true });
for (const name of ['window', 'document', 'HTMLElement', 'HTMLImageElement', 'location', 'navigator']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true });
globalThis.self = dom.window; globalThis.addEventListener = dom.window.addEventListener.bind(dom.window); globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.Image = function () { const image = document.createElement('img'); image.decode = () => Promise.resolve(); return image; };
let copied = ''; Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } }, configurable: true });
const requests = []; let searchFails = false;
globalThis.fetch = async url => {
  const target = new URL(url); requests.push(target);
  if (target.host === 'geocoding-api.open-meteo.com') return searchFails ? new Response('', { status: 503 }) : Response.json({ results: [{ name: 'Kyoto', country: 'Japan', admin1: 'Kyoto', timezone: 'Asia/Tokyo', latitude: 35.02, longitude: 135.75 }, { name: 'Broken', latitude: 'x' }] });
  if (target.host === 'api.open-meteo.com') return Response.json({ current: { temperature_2m: 17.6, cloud_cover: 90 } });
  throw new Error(`Unexpected request to ${target.host}`);
};
const bundle = await build({ entryPoints: ['components/early-site.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' }, write: false, tsconfig: 'tsconfig.json', logLevel: 'silent' });
await mkdir('.sites-runtime/tests', { recursive: true }); await writeFile('.sites-runtime/tests/early-site.cjs', bundle.outputFiles[0].contents);
const site = createRequire(import.meta.url)('../.sites-runtime/tests/early-site.cjs'), EarlySite = site.default;
const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client'), root = createRoot(document.getElementById('app'));
const settle = (ms = 30) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const go = async hash => { await act(async () => { dom.window.location.hash = hash; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); }); await settle(); };
const click = async element => { assert.ok(element, 'Expected a control'); await act(async () => element.click()); await settle(); };
const type = async (element, value) => { await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); await settle(450); };
const text = () => document.body.textContent, byText = (selector, label) => [...document.querySelectorAll(selector)].find(element => element.textContent.includes(label));
try {
  await act(async () => root.render(React.createElement(EarlySite))); await settle();
  // Landing: one clear invitation, and a way to the demo. Nothing is fetched until the visitor asks.
  assert.match(text(), /A screen\s*with a pulse\./); assert.equal(byText('a', 'Make it yours').getAttribute('href'), '#begin'); assert.equal(byText('a', 'Watch the demo').getAttribute('href'), '#demo');
  assert.equal(requests.length, 0, 'The landing page makes no requests');
  await go('#demo'); assert.match(text(), /One day\.\s*Fifteen worlds\./); assert.ok(byText('a.es-leave', 'Back'), 'The demo has a way back');
  // Step 1: the city. Search is validated; a failed search still lets people continue.
  await go('#begin'); assert.match(text(), /Where are you\?/);
  searchFails = true; await type(document.querySelector('.es-input'), 'Kyo'); assert.match(text(), /continue with London/);
  searchFails = false; await type(document.querySelector('.es-input'), 'Kyot');
  assert.deepEqual([...document.querySelectorAll('.es-results button')].map(button => button.querySelector('span').textContent), ['Kyoto'], 'Malformed places are dropped');
  await click(document.querySelector('.es-results button'));
  // Step 2: eight mood cards.
  assert.match(text(), /Pick a mood to begin\./); assert.match(text(), /Kyoto/);
  assert.deepEqual([...document.querySelectorAll('.es-mood strong')].map(node => node.textContent), MOOD_IDS.map(id => MOODS[id].label));
  for (const id of MOOD_IDS) { assert.ok(site.MOOD_BLURBS[id]); for (const part of ['day', 'night']) for (const name of site.MOOD_ART[id][part]) assert.ok(existsSync(`public/demo/art/${name}.webp`), `${id} ${part} picture ${name} exists`); assert.ok(site.MOOD_ART[id].day.length && site.MOOD_ART[id].night.length); }
  await click(byText('.es-mood', 'Dreamy'));
  // Preview: the city's own clock, live temperature and real sky words over labelled example artwork.
  await settle(60);
  assert.match(text(), /Preview · example artwork/); assert.match(text(), /Kyoto · Dreamy/); assert.match(document.querySelector('.es-clock time').textContent, /^\d\d:\d\d$/);
  assert.equal(document.querySelector('.es-clock time').textContent, new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(Date.now()), 'The clock is the city\'s local time');
  assert.equal(document.querySelector('.es-clock p').textContent, '18°C'); assert.match(document.querySelector('.es-story h1').textContent, /sun|night|twilight|hour/i);
  const weather = requests.find(target => target.host === 'api.open-meteo.com'); assert.equal(weather.searchParams.get('latitude'), '35.020');
  assert.match(document.querySelector('.es-art img.es-on').getAttribute('src'), /^\/demo\/art\/(12-whale-market|14-lilac-tram|15-moon-naps|06-starlit-water)\.webp$/);
  assert.equal(document.querySelector('.es-chips button[aria-pressed="true"]').textContent, 'Dreamy');
  await click(byText('.es-chips button', 'Cosy')); assert.match(text(), /Kyoto · Cosy/); assert.equal(document.querySelector('.es-chips button[aria-pressed="true"]').textContent, 'Cosy');
  assert.match(document.querySelector('.es-art img.es-on').getAttribute('src'), /(01-sunday-window|05-winter-refuge|03-london-rain)/, 'The picture follows the mood');
  // Early access: an address to write to. Nothing is collected by the site.
  await click(byText('button', 'Join early access'));
  assert.match(text(), /private testing/); assert.equal(document.querySelector('.es-email').textContent, site.EARLY_ACCESS_EMAIL);
  const mail = byText('a', 'Write the email').getAttribute('href'); assert.ok(mail.startsWith(`mailto:${site.EARLY_ACCESS_EMAIL}?subject=`)); assert.match(decodeURIComponent(mail), /City: Kyoto\nMood: Cosy/);
  await click(byText('button', 'Copy address')); assert.equal(copied, site.EARLY_ACCESS_EMAIL); assert.match(text(), /Copied/);
  await click(byText('button', 'Back to the preview')); await click(byText('button', 'Change city')); assert.match(text(), /Where are you\?/);
  await click(byText('button', 'Use London instead')); assert.match(text(), /London/);
  assert.ok(requests.every(target => ['geocoding-api.open-meteo.com', 'api.open-meteo.com'].includes(target.host) && target.protocol === 'https:'), 'Only city search and weather are ever requested');
  assert.equal(document.querySelector('input[type=password], input[type=email], form'), null, 'The site asks for no account and collects nothing');
  await act(async () => root.unmount());
} finally { dom.window.close(); }

// The exported folder is complete and locked down.
const out = await mkdtemp(path.join(tmpdir(), 'heartbeat-site-'));
try {
  assert.equal(await exportSite(out), 20);
  const index = await readFile(path.join(out, 'index.html'), 'utf8'), headers = await readFile(path.join(out, '_headers'), 'utf8'), script = await readFile(path.join(out, 'site.js'), 'utf8');
  assert.match(index, /<title>Heartbeat/); assert.match(index, /src="\/site\.js"/); assert.match(index, /href="\/site\.css"/);
  assert.equal((await readdir(path.join(out, 'demo/art'))).filter(name => name.endsWith('.webp')).length, 15);
  assert.ok(existsSync(path.join(out, 'fonts/manrope.ttf')) && existsSync(path.join(out, 'favicon.svg')));
  assert.match(headers, /connect-src https:\/\/geocoding-api\.open-meteo\.com https:\/\/api\.open-meteo\.com;/); assert.match(SITE_HEADERS['Content-Security-Policy'], /default-src 'none'; script-src 'self';/);
  assert.doesNotMatch(script, /\/api\/product|\/api\/ai|CLOUDFLARE_|KIE_API|STRIPE_/, 'No account, AI or payment code ships in the public site');
} finally { await rm(out, { recursive: true, force: true }); }
console.log('Passed early-access site: landing, demo and back link, validated city search with fallback, eight mood cards with existing artwork, live local clock/temperature/sky preview labelled as example artwork, mood switching, early-access email with copy and mailto, no data collection, and a complete locked-down static export. DOM simulated; city search and weather mocked.');
