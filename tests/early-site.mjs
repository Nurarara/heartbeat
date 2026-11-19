import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { exportSite, SITE_HEADERS } from '../scripts/export-site.mjs';

// The public landing site: landing and prepared demo; "Make it yours" goes to the app site waitlist.
const dom = new JSDOM('<div id="app"></div>', { url: 'https://heartbeatart.co.uk/', pretendToBeVisual: true });
for (const name of ['window', 'document', 'HTMLElement', 'HTMLImageElement', 'location', 'navigator']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true });
globalThis.self = dom.window; globalThis.addEventListener = dom.window.addEventListener.bind(dom.window); globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.Image = function () { const image = document.createElement('img'); image.decode = () => Promise.resolve(); return image; };
const requests = [];
globalThis.fetch = async url => { requests.push(new URL(url)); throw new Error(`Unexpected request to ${url}`); };
const bundle = await build({ entryPoints: ['components/early-site.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' }, write: false, tsconfig: 'tsconfig.json', logLevel: 'silent' });
await mkdir('.sites-runtime/tests', { recursive: true }); await writeFile('.sites-runtime/tests/early-site.cjs', bundle.outputFiles[0].contents);
const site = createRequire(import.meta.url)('../.sites-runtime/tests/early-site.cjs'), EarlySite = site.default;
const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client'), root = createRoot(document.getElementById('app'));
const settle = (ms = 30) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const go = async hash => { await act(async () => { dom.window.location.hash = hash; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); }); await settle(); };
const text = () => document.body.textContent, byText = (selector, label) => [...document.querySelectorAll(selector)].find(element => element.textContent.includes(label));
try {
  await act(async () => root.render(React.createElement(EarlySite))); await settle();
  // Landing: "Make it yours" goes to the waitlist on the app site; the demo stays here. Nothing is fetched.
  assert.match(text(), /A screen\s*with a pulse\./); assert.equal(byText('a', 'Make it yours').getAttribute('href'), 'https://app.heartbeatart.co.uk/#request'); assert.equal(byText('a', 'Watch the demo').getAttribute('href'), '#demo');
  assert.equal(site.WAITLIST_URL, 'https://app.heartbeatart.co.uk/#request');
  assert.doesNotMatch(document.body.innerHTML, /@heartbeatart|mailto:/, 'No personal email address on the landing site');
  await go('#demo'); assert.match(text(), /One day\.\s*Fifteen worlds\./); assert.ok(byText('a.es-leave', 'Back'), 'The demo has a way back');
  await go(''); assert.match(text(), /A screen\s*with a pulse\./);
  assert.equal(requests.length, 0, 'The site makes no requests');
  assert.equal(document.querySelector('input, form'), null, 'The landing site itself collects nothing');
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
  assert.match(headers, /connect-src 'none';/); assert.match(SITE_HEADERS['Content-Security-Policy'], /default-src 'none'; script-src 'self';/);
  assert.doesNotMatch(script, /\/api\/product|\/api\/ai|CLOUDFLARE_|KIE_API|STRIPE_/, 'No account, AI or payment code ships in the public site');
} finally { await rm(out, { recursive: true, force: true }); }
console.log('Passed landing site: Make it yours goes to the app waitlist, demo and back link, no personal email, no requests or data collection, and a complete locked-down static export with no outbound connections. DOM simulated.');
