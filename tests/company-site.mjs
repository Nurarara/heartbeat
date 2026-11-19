import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { exportSite, resolvePath, siteFiles, SITE_HEADERS } from '../scripts/export-site.mjs';
import { JOURNAL, PRINCIPLES, WAITLIST_URL, APP_URL, entryHref } from '../lib/company-content.ts';

// The company site at heartbeatart.co.uk: every page pre-rendered, links that resolve, no requests, no personal email,
// light and dark, and "Make it yours" still going to the early access list.

// Content: unique slugs, real dates, nothing empty.
assert.equal(new Set(JOURNAL.map(e => e.slug)).size, JOURNAL.length, 'Journal slugs are unique');
for (const entry of JOURNAL) {
  assert.match(entry.date, /^2026-\d\d-\d\d$/); assert.ok(!Number.isNaN(Date.parse(entry.date)));
  assert.ok(entry.title && entry.summary.length > 20 && entry.minutes > 0);
  assert.ok(entry.href || entry.body.length > 0, `${entry.slug} has a body`);
}
assert.equal(PRINCIPLES.length, 6); assert.equal(WAITLIST_URL, 'https://app.heartbeatart.co.uk/#request');

// The exported folder.
const files = await siteFiles();
const pagesOut = [...files.keys()].filter(name => name.endsWith('.html'));
const expected = ['/index.html', '/journal/index.html', '/principles/index.html', '/labs/index.html', '/demo/index.html', '/404.html', ...JOURNAL.filter(e => !e.href).map(e => `${entryHref(e)}/index.html`)];
assert.deepEqual([...pagesOut].sort(), [...expected].sort(), 'Every page is written, and only those');
for (const name of ['/site.js', '/site.css', '/theme.js', '/favicon.svg', '/robots.txt', '/sitemap.xml', '/fonts/manrope.ttf', '/fonts/newsreader-400-normal.woff2', '/fonts/newsreader-400-italic.woff2', '/fonts/newsreader-500-normal.woff2', '/fonts/plex-mono-400.woff2']) assert.ok(files.has(name), `${name} is exported`);
const text = name => files.get(name).bytes.toString('utf8');
const allLinks = new Set();
for (const name of pagesOut) {
  const html = text(name);
  assert.match(html, /<title>[^<]*Heartbeat[^<]*<\/title>/, `${name} has a title`);
  assert.match(html, /<meta name="description" content="[^"]{20,}">/);
  assert.doesNotMatch(html, /<script>(?!<\/script>)|<script(?![^>]*\bsrc=)[^>]*>[^<]/, `${name} has no inline scripts (the CSP forbids them)`);
  assert.match(html, /<script src="\/theme\.js"><\/script><link rel="stylesheet" href="\/site\.css">/, 'The theme is set before the page paints');
  assert.doesNotMatch(html, /rounak|mailto:|@gmail/i, `${name} shows no personal email`);
  if (name !== '/demo/index.html') assert.match(html, /<div id="root">(<link rel="preload"[^>]*\/>)?<div class="hb-site"/, `${name} is pre-rendered`);
  for (const [, href] of html.matchAll(/href="([^"#]+)/g)) allLinks.add(href);
}
for (const href of allLinks) {
  if (href.startsWith('https://')) { assert.ok(href.startsWith(APP_URL) || href.startsWith('https://heartbeatart.co.uk/'), `External link stays on Heartbeat: ${href}`); continue; }
  assert.ok(href.startsWith('/'), `Relative link ${href}`);
  assert.equal(resolvePath(files, href).status, 200, `Link resolves: ${href}`);
}
const home = text('/index.html');
assert.match(home, /A screen<br\/>with a pulse\./, 'The hero keeps its headline');
assert.match(home, /<a class="hb-primary" href="https:\/\/app\.heartbeatart\.co\.uk\/#request">Make it yours/, 'Make it yours goes to early access');
assert.match(home, /<a class="hb-secondary" href="\/demo">.*Watch the demo/, 'Watch the demo stays');
assert.equal((home.match(/class="hb-hero-art"/g) || []).length, 1); assert.equal((home.match(/<img src="\/demo\/art\/[^"]+" alt="" data-on="true"/g) || []).length, 1, 'One painting shows; the rest wait to rotate in');
assert.match(home, /class="hb-theme"/, 'The light and dark switch is on the page');
assert.match(text('/principles/index.html'), /id="what-we-wont-build"/);
assert.match(text('/journal/why-night-has-to-be-dark/index.html'), /0\.32/);
assert.match(text('/sitemap.xml'), /<loc>https:\/\/heartbeatart\.co\.uk\/journal\/eight-moods<\/loc>/);
// Routing like Cloudflare Pages.
assert.equal(resolvePath(files, '/journal').status, 200); assert.equal(resolvePath(files, '/journal/').status, 200);
assert.equal(resolvePath(files, '/journal/eight-moods').file, files.get('/journal/eight-moods/index.html'));
assert.equal(resolvePath(files, '/nope').status, 404); assert.equal(resolvePath(files, '/nope').file, files.get('/404.html'));
// Locked down.
assert.match(SITE_HEADERS['Content-Security-Policy'], /default-src 'none'; script-src 'self';.*connect-src 'none'/);
assert.doesNotMatch(text('/site.js'), /\/api\/product|\/api\/ai|CLOUDFLARE_|KIE_API|STRIPE_|AZURE_/, 'No account, AI or payment code ships');
assert.ok(text('/site.css').includes('@media(prefers-color-scheme:dark){:root:not([data-theme=light]){') && text('/site.css').includes(':root[data-theme=dark]{'), 'Dark mode follows the system unless chosen, and the switch wins both ways');

// In the browser: filters and the theme switch, with nothing fetched.
const dom = new JSDOM('<div id="app"></div>', { url: 'https://heartbeatart.co.uk/', pretendToBeVisual: true });
for (const name of ['window', 'document', 'HTMLElement', 'location', 'navigator', 'localStorage']) Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });
const requests = []; globalThis.fetch = async url => { requests.push(String(url)); throw new Error('No requests'); };
const bundle = await build({ entryPoints: ['components/company-site.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' }, write: false, tsconfig: 'tsconfig.json', logLevel: 'silent' });
await mkdir('.sites-runtime/tests', { recursive: true }); await writeFile('.sites-runtime/tests/company-site.cjs', bundle.outputFiles[0].contents);
const CompanySite = createRequire(import.meta.url)('../.sites-runtime/tests/company-site.cjs').default;
const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client'), root = createRoot(document.getElementById('app'));
try {
  await act(async () => root.render(React.createElement(CompanySite, { path: '/' })));
  const rows = () => document.querySelectorAll('.hb-table tbody tr').length;
  assert.equal(rows(), 6, 'The home page shows the six newest entries');
  await act(async () => [...document.querySelectorAll('.hb-filters button')].find(b => b.textContent === 'Releases').click());
  assert.equal(rows(), JOURNAL.filter(e => e.category === 'Release').length, 'Filters narrow the journal');
  assert.equal(document.querySelector('.hb-filters [aria-pressed="true"]').textContent, 'Releases');
  const theme = document.querySelector('.hb-theme');
  await act(async () => theme.click()); assert.equal(document.documentElement.getAttribute('data-theme'), 'dark'); assert.equal(localStorage.getItem('heartbeat-theme'), 'dark');
  await act(async () => theme.click()); assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  await act(async () => root.render(React.createElement(CompanySite, { path: '/journal/eight-moods/' })));
  assert.match(document.querySelector('h1').textContent, /Eight moods/, 'A trailing slash still finds the note');
  await act(async () => root.render(React.createElement(CompanySite, { path: '/missing' })));
  assert.match(document.body.textContent, /This page drifted off/);
  assert.equal(requests.length, 0, 'The site makes no requests');
  await act(async () => root.unmount());
} finally { dom.window.close(); }

// The exported folder on disk.
const out = await mkdtemp(path.join(tmpdir(), 'heartbeat-site-'));
try {
  assert.equal(await exportSite(out), files.size);
  assert.ok(existsSync(path.join(out, 'journal/eight-moods/index.html')) && existsSync(path.join(out, '404.html')));
  assert.equal((await readdir(path.join(out, 'demo/art'))).filter(name => name.endsWith('.webp')).length, 15);
  assert.match(await readFile(path.join(out, '_headers'), 'utf8'), /connect-src 'none';/);
} finally { await rm(out, { recursive: true, force: true }); }
console.log(`Passed company site: ${pagesOut.length} pre-rendered pages with titles and descriptions, every internal link resolves, external links stay on Heartbeat, no inline scripts or personal email, hero keeps "A screen with a pulse", Make it yours and Watch the demo, light/dark switch remembered, journal filters, trailing slashes and 404, no requests, locked-down headers. DOM simulated.`);
