// The Windows updater installs only releases signed with Heartbeat's release key. A server that serves a changed
// manifest, a different file or an unsigned release cannot replace the installed app. Runs the real Heartbeat.exe
// (with Mono off Windows) against a local server, in a throwaway home folder.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exe = path.resolve('public/downloads/Heartbeat.exe');
const runner = process.platform === 'win32' ? null : spawnSync('mono', ['--version']).status === 0 ? 'mono' : undefined;
if (runner === undefined) { console.log('Skipped Windows updater test: Mono is not installed.'); process.exit(0); }
const manifest = JSON.parse(readFileSync('public/downloads/windows.json', 'utf8'));
assert.ok(manifest.signature, 'The published manifest is signed');
const keyFile = process.env.HEARTBEAT_WINDOWS_RELEASE_KEY || '.release/windows-release-key.pem';
const key = existsSync(keyFile) ? createPrivateKey(readFileSync(keyFile)) : null;
const message = m => ['heartbeat-windows-release/1', m.version, m.url, m.sha256, String(m.size)].join('\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

const home = mkdtempSync(path.join(tmpdir(), 'heartbeat-updater-'));
const appData = process.platform === 'win32' ? path.join(home, 'AppData', 'Local') : path.join(home, '.local', 'share');
const installDir = path.join(appData, 'Programs', 'Heartbeat'), installed = path.join(installDir, 'Heartbeat.exe');
let served = {};
const server = createServer((request, response) => { const body = served[request.url]; if (!body) { response.writeHead(404); response.end(); return; } response.writeHead(200); response.end(body); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;
async function check() {
  const env = Object.fromEntries(Object.entries({ ...process.env, HOME: home, XDG_DATA_HOME: path.join(home, '.local', 'share'), LOCALAPPDATA: appData, APPDATA: path.join(home, 'AppData', 'Roaming') }).filter(([k]) => !/^(https?|all|no)_proxy$/i.test(k)));
  // Asynchronous, so the local server in this process can answer while the app runs.
  return await new Promise(resolve => execFile(runner || exe, runner ? [exe, '--update-check', origin] : ['--update-check', origin], { env, encoding: 'utf8', timeout: 60000 }, (_error, stdout, stderr) => resolve((stdout || '') + (stderr || ''))));
}
function install() { mkdirSync(installDir, { recursive: true }); writeFileSync(installed, 'installed copy'); writeFileSync(path.join(installDir, 'Heartbeat.scr'), 'installed copy'); }
const untouched = () => readFileSync(installed, 'utf8') === 'installed copy' && readFileSync(path.join(installDir, 'Heartbeat.scr'), 'utf8') === 'installed copy';

try {
  const payload = Buffer.from('a new Heartbeat build'), good = { version: '99.0.0', url: '/downloads/Heartbeat.exe', sha256: sha(payload), size: payload.length };
  const cases = [
    ['an unsigned release', { ...good }],
    ['a release whose version was changed after signing', { ...good, version: '99.0.1', signature: manifest.signature }],
    ['the real signature reused for another file', { ...manifest, version: '99.0.0', sha256: good.sha256, size: good.size }],
    ['a forged signature', { ...good, signature: Buffer.alloc(384, 7).toString('base64') }],
  ];
  for (const [name, m] of cases) {
    install(); served = { '/downloads/windows.json': JSON.stringify(m), '/downloads/Heartbeat.exe': payload };
    const out = await check();
    assert.match(out, /refused: This update couldn.t be confirmed as coming from Heartbeat/, `${name} is refused (${out.trim()})`);
    assert.ok(untouched(), `${name} leaves the installed app and screensaver untouched`);
  }
  if (key) {
    // Signed, but the server sends a different file than the signed one: refused before anything is replaced.
    const signed = { ...good, signature: sign('sha256', Buffer.from(message(good)), key).toString('base64') };
    install(); served = { '/downloads/windows.json': JSON.stringify(signed), '/downloads/Heartbeat.exe': Buffer.from('a different build!!!!') };
    assert.match(await check(), /refused: The update didn.t match its signed details/); assert.ok(untouched(), 'A swapped file leaves the installed app untouched');
    // Signed and matching: installed.
    install(); served = { '/downloads/windows.json': JSON.stringify(signed), '/downloads/Heartbeat.exe': payload };
    assert.match(await check(), /result: updated:99\.0\.0/);
    assert.equal(readFileSync(installed, 'utf8'), payload.toString(), 'A correctly signed release is installed');
    assert.equal(readFileSync(path.join(installDir, 'Heartbeat.scr'), 'utf8'), payload.toString(), 'and the screensaver copy too');
  }
  // The real published manifest verifies (and is not newer than the app itself).
  install(); served = { '/downloads/windows.json': readFileSync('public/downloads/windows.json') };
  assert.match(await check(), /result: Heartbeat is up to date/);
  console.log(`Passed Windows updater: unsigned, altered, re-used and forged releases are refused and leave the installed app untouched${key ? '; a swapped file is refused; a correctly signed release installs' : ' (signed install case skipped: release key not on this computer)'}; the published manifest is signed. Real Heartbeat.exe${runner ? ' under Mono' : ''}, local server.`);
} finally { server.close(); rmSync(home, { recursive: true, force: true }); }
