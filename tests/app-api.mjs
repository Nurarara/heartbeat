import assert from 'node:assert/strict';
import { fixture } from './product-fixture.mjs';
import { processAccountDeletions } from '../lib/product/lifecycle.ts';
import { hash } from '../lib/product/core.ts';

const OWNER = 'owner@example.test';
const f = await fixture({ production: true, env: { HEARTBEAT_BETA: 'true', HEARTBEAT_OWNER_EMAIL: OWNER, HEARTBEAT_EMAIL_API_KEY: 'fixture-mail', HEARTBEAT_EMAIL_FROM: 'Heartbeat <hello@example.test>', HEARTBEAT_DAILY_BUDGET_MICROS: '5000000', HEARTBEAT_DIRECTOR_ESTIMATE_MICROS: '2000', HEARTBEAT_IMAGE_ESTIMATE_MICROS: '40000' } });
const workflows = [];
f.env.ARTWORK_WORKFLOW = { create: async ({ id }) => { workflows.push(id); }, get: async () => ({ status: async () => ({ status: 'running' }) }) };
const codeFor = address => f.emails.filter(m => m.to[0] === address).at(-1).subject.slice(0, 6);
// Apps send no Origin header and no cookie: only the device key.
const app = (path, body, token, extra = {}) => f.service.handle(new Request(`https://heartbeat.example/api/product/app/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
const preferences = { version: 1, location: { name: 'London', country: 'United Kingdom', latitude: 51.5, longitude: -0.12, timezone: 'Europe/London' }, seed: 42, unit: 'c', reducedMotion: false };

// Strangers get no code through the app either.
assert.equal((await app('code/send', { email: 'stranger@example.test' })).status, 403);

// Sign in from the Windows app: email → code → device key.
assert.equal((await app('code/send', { email: OWNER })).status, 200);
assert.equal((await app('code/verify', { email: OWNER, code: codeFor(OWNER), platform: 'beos', deviceName: 'X' })).status, 400);
await app('code/send', { email: OWNER });
const signed = await app('code/verify', { email: OWNER, code: codeFor(OWNER), platform: 'windows', deviceName: 'LAPTOP-1\u0007' });
assert.equal(signed.status, 200, await signed.clone().text());
const { token, deviceId, owner } = await signed.json();
assert.match(token, /^[a-f0-9]{64}$/); assert.equal(owner, true);
assert.equal(f.sqlite.prepare('SELECT name FROM hb_devices WHERE id=?').get(deviceId).name, 'Windows · LAPTOP-1');
assert.equal(signed.headers.get('set-cookie'), null, 'Apps get a key, never a browser cookie');

// A second device gets its own key.
await app('code/send', { email: OWNER });
const phone = await (await app('code/verify', { email: OWNER, code: codeFor(OWNER), platform: 'android', deviceName: 'Pixel' })).json();
assert.notEqual(phone.token, token);

// Without a key, or with a wrong one, nothing is shown.
assert.equal((await app('state')).status, 401);
assert.equal((await app('state', undefined, 'f'.repeat(64))).status, 401);

// Before a city is chosen the app is told to visit the studio.
const empty = await (await app('state', undefined, token)).json();
assert.equal(empty.ready, false); assert.match(empty.reason, /city/);

// Choose a city on the website (same account).
await f.call('auth/code/send', { email: OWNER });
const web = (await f.call('auth/code/verify', { email: OWNER, code: codeFor(OWNER) })).headers.get('set-cookie').split(';')[0];
assert.equal((await f.call('preferences', { preferences }, { cookie: web })).status, 200);

// Checking while NOT showing never starts a paid picture.
const quiet = await (await app('state', undefined, token)).json();
assert.equal(quiet.ready, true); assert.equal(quiet.picture, null); assert.equal(quiet.making, false);
assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM hb_jobs').get().n, 0);
assert.equal(quiet.city, 'London'); assert.equal(quiet.mood, 'auto'); assert.equal(quiet.moods.length, 8);

// Showing starts one picture; checking again in the same 10 minutes doesn't start another.
const showing = await (await app('state?showing=1', undefined, token)).json();
assert.equal(showing.making, true);
await app('state?showing=1', undefined, token);
assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM hb_jobs').get().n, 1);

// A finished picture is offered to the app and downloadable only with the owner's key.
const owners = f.sqlite.prepare('SELECT id FROM hb_users WHERE email=?').get(OWNER).id, artId = crypto.randomUUID(), key = `heartbeat-ai/${owners}/${artId}.jpg`;
const candidate = JSON.stringify({ direction: { artwork: { title: 'Quiet harbour', attemptId: artId }, phase: 'evening' } });
f.sqlite.prepare("INSERT INTO ai_attempts(id,owner,request_id,claim,day,status,location_key,created_at,candidate,art_key) VALUES (?,?,?,'c','d','ready','l',?,?,?)").run(artId, owners, crypto.randomUUID(), f.now(), candidate, key);
f.sqlite.prepare("INSERT INTO hb_assets(id,job_id,owner,world_id,surface_id,art_key,image_hash,mime,width,height,validation_version,state,created_at,updated_at) VALUES (?,?,?,?,?,?,'h','image/jpeg',10,10,1,'ready',?,?)").run(artId, artId, owners, `world-${owners}`, `surface-${owners}`, key, f.now(), f.now());
await f.env.BUCKET.put(key, new Uint8Array([255, 216, 1, 2, 255, 217]));
const ready = await (await app('state', undefined, token)).json();
assert.equal(ready.picture.id, artId); assert.equal(ready.rhythmMinutes, 60); assert.equal(ready.wallpaperMinutes, 60); assert.equal(ready.picture.title, 'Quiet harbour'); assert.equal(ready.picture.url, `/api/product/app/art/${artId}`);
const art = await app(`art/${artId}`, undefined, token);
assert.equal(art.status, 200); assert.equal(art.headers.get('content-type'), 'image/jpeg'); assert.equal((await art.arrayBuffer()).byteLength, 6);

// Another tester's device can't fetch it.
await f.call('admin/invite', { email: 'sam@example.test' }, { cookie: web });
await app('code/send', { email: 'sam@example.test' });
const sam = await (await app('code/verify', { email: 'sam@example.test', code: codeFor('sam@example.test'), platform: 'windows', deviceName: 'Sam' })).json();
assert.equal((await app(`art/${artId}`, undefined, sam.token)).status, 404);

// iPhone picture link: created on the website, returns the newest picture, and can do nothing else.
const created = await (await f.call('devices/picture-link', {}, { cookie: web })).json();
assert.match(created.url, /\/api\/product\/app\/picture\.jpg$/, 'The address carries no key'); assert.match(created.key, /^[a-f0-9]{64}$/);
const linkKey = created.key, linkPath = '/api/product/app/picture.jpg?key=' + linkKey; // older links put the key in the address
const pic = await f.service.handle(new Request('https://heartbeat.example' + linkPath));
assert.equal(pic.status, 200); assert.equal(pic.headers.get('content-type'), 'image/jpeg'); assert.equal((await pic.arrayBuffer()).byteLength, 6);
assert.equal((await f.service.handle(new Request('https://heartbeat.example/api/product/app/picture.jpg?key=' + 'a'.repeat(64)))).status, 404);
assert.equal((await app('state', undefined, linkKey)).status, 401, 'The picture link is not a device key');
assert.equal((await app('mood', { mood: 'calm' }, linkKey)).status, 401);
// …and not on the older desktop device routes either.
const oldRoute = (path, method = 'GET') => f.service.handle(new Request(`https://heartbeat.example/api/product/${path}`, { method, headers: { Authorization: `Bearer ${linkKey}`, Origin: 'https://heartbeat.example', 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) }));
assert.equal((await oldRoute('device/status')).status, 401);
assert.equal((await oldRoute('device/refresh', 'POST')).status, 401);
assert.equal((await oldRoute(`device/art/${artId}`)).status, 401);
// The key also works as a header (keeps it out of logs).
assert.equal((await f.service.handle(new Request('https://heartbeat.example/api/product/app/picture.jpg', { headers: { Authorization: `Bearer ${linkKey}` } }))).status, 200);
// Reading the picture never starts one or marks it shown, however often it's read.
const work = () => JSON.stringify([f.sqlite.prepare('SELECT COUNT(*) AS n FROM hb_jobs').get().n, f.sqlite.prepare('SELECT status FROM ai_attempts ORDER BY created_at').all()]);
f.advance(2 * 3600000);
f.sqlite.prepare("UPDATE hb_jobs SET status='canceled' WHERE status='accepted'").run(); // no picture in progress, so one is due
const before = work();
for (let i = 0; i < 3; i++) { assert.equal((await f.service.handle(new Request('https://heartbeat.example' + linkPath))).status, 200); assert.equal((await f.service.handle(new Request('https://heartbeat.example/api/product/app/picture.jpg', { headers: { Authorization: `Bearer ${linkKey}` } }))).status, 200); }
assert.equal(work(), before, 'GET is read-only');
// Asking for the next picture needs POST with the key in the header, never in the address.
assert.equal((await f.service.handle(new Request('https://heartbeat.example' + linkPath, { method: 'POST' }))).status, 401);
assert.equal(work(), before);
assert.equal((await f.service.handle(new Request('https://heartbeat.example/api/product/app/picture.jpg', { method: 'POST', headers: { Authorization: `Bearer ${linkKey}` } }))).status, 200);
assert.ok(f.sqlite.prepare('SELECT COUNT(*) AS n FROM hb_jobs').get().n > JSON.parse(before)[0], 'POST with the header asks for the next picture when it is due');
assert.equal(f.sqlite.prepare('SELECT code_hash FROM hb_devices WHERE id=?').get(created.deviceId).code_hash.startsWith('picture-key:'), true);
// A link made before this change (shared as an address) can still read, but can never ask for a picture.
const legacyKey = 'b'.repeat(64), legacyId = crypto.randomUUID(), ownerRow = f.sqlite.prepare('SELECT id,credential_epoch FROM hb_users WHERE email=?').get(OWNER);
f.sqlite.prepare('INSERT INTO hb_devices(id,owner,secret_hash,code_hash,expires,created_at,name,credential_epoch) VALUES (?,?,?,?,?,?,?,?)').run(legacyId, ownerRow.id, await hash(legacyKey), `picture-link:${legacyId}`, f.now() + 86400000, f.now(), 'iPhone & iPad · Shortcuts link', ownerRow.credential_epoch || 0);
f.sqlite.prepare("UPDATE hb_jobs SET status='canceled' WHERE status='accepted'").run();
const legacyBefore = work();
assert.equal((await f.service.handle(new Request('https://heartbeat.example/api/product/app/picture.jpg?key=' + legacyKey))).status, 200, 'An older link still shows the newest picture');
const legacyPost = await f.service.handle(new Request('https://heartbeat.example/api/product/app/picture.jpg', { method: 'POST', headers: { Authorization: `Bearer ${legacyKey}` } }));
assert.equal(legacyPost.status, 403, 'An older link can never ask for a new picture'); assert.match((await legacyPost.json()).error, /older picture link/);
assert.equal(work(), legacyBefore, 'Nothing started by the older link');
f.sqlite.prepare('DELETE FROM hb_devices WHERE id=?').run(legacyId);
const second = await (await f.call('devices/picture-link', {}, { cookie: web })).json();
assert.equal((await f.service.handle(new Request('https://heartbeat.example' + linkPath))).status, 404, 'A new link turns the old one off');
const listed = await (await f.call('devices', undefined, { cookie: web })).json();
const linkDevice = listed.devices.find(d => d.name === 'iPhone & iPad · Shortcuts link');
assert.ok(linkDevice);
assert.equal((await f.service.handle(new Request('https://heartbeat.example/api/product/app/picture.jpg', { headers: { Authorization: `Bearer ${second.key}` } }))).status, 200);
await f.call('device/revoke', { id: linkDevice.id }, { cookie: web });
assert.equal((await f.service.handle(new Request('https://heartbeat.example/api/product/app/picture.jpg', { headers: { Authorization: `Bearer ${second.key}` } }))).status, 404, 'Disconnecting turns it off');

// Mood from the app is saved to the account and seen by the website.
assert.equal((await app('mood', { mood: 'romantic' }, token)).status, 200);
assert.equal((await app('mood', { mood: 'angry' }, token)).status, 400);
assert.equal((await (await f.call('preferences', undefined, { cookie: web })).json()).preferences.mood, 'romantic');

// Screensaver time appears on the dashboard as its own device type.
const session = crypto.randomUUID();
assert.equal((await app('presence', { session, surface: 'screensaver' }, token)).status, 200);
f.advance(60000); await app('presence', { session, surface: 'screensaver' }, token);
const overview = await (await f.call('admin/overview?days=7&tz=0', undefined, { cookie: web })).json();
assert.ok(overview.devices.some(d => d.device === 'windows screensaver' && d.seconds === 60));
assert.equal(overview.testers.find(t => t.email === OWNER).mood, 'romantic');
assert.ok(overview.activity.some(a => ['joined', 'sign_in'].includes(a.kind) && a.detail === 'Windows · LAPTOP-1'));

// Signing out removes only that device's key.
assert.equal((await app('signout', {}, token)).status, 200);
assert.equal((await app('state', undefined, token)).status, 401);
assert.equal((await app('state', undefined, phone.token)).status, 200);

// Removing a tester from the invite list disconnects their apps at once.
assert.equal((await app('state', undefined, sam.token)).status, 200);
await f.call('admin/uninvite', { email: 'sam@example.test' }, { cookie: web });
assert.equal((await app('state', undefined, sam.token)).status, 401);

// Changing city clears the wait for the next picture, so the new city starts straight away.
const ownerId = f.sqlite.prepare('SELECT id FROM hb_users WHERE email=?').get(OWNER).id;
f.sqlite.prepare('INSERT OR REPLACE INTO ai_sessions(id,expires,next_at) VALUES (?,?,?)').run(ownerId, f.now() + 86400000, f.now() + 600000);
const current = await (await f.call('preferences', undefined, { cookie: web })).json();
const sf = { ...current.preferences, location: { name: 'San Francisco', country: 'United States', latitude: 37.77, longitude: -122.42, timezone: 'America/Los_Angeles' } };
assert.equal((await f.call('preferences', { preferences: { ...current.preferences, mood: 'calm' }, expectedVersion: current.version }, { cookie: web })).status, 200);
assert.ok(f.sqlite.prepare('SELECT next_at FROM ai_sessions WHERE id=?').get(ownerId).next_at > f.now(), 'Same city keeps the rhythm');
const again = await (await f.call('preferences', undefined, { cookie: web })).json();
assert.equal((await f.call('preferences', { preferences: sf, expectedVersion: again.version }, { cookie: web })).status, 200);
assert.equal(f.sqlite.prepare('SELECT next_at FROM ai_sessions WHERE id=?').get(ownerId).next_at, 0, 'A new city starts at once');

// After the first picture is shown (memory saved), checking again in the same slot never errors.
const phoneState = await (await app('state?showing=1', undefined, phone.token)).json();
assert.equal(phoneState.notice, '', 'No "request key used for different input" error');

// A picture for the old city that hasn't started is cancelled when the city changes.
f.sqlite.prepare("INSERT INTO hb_jobs(id,owner,request_id,input,status,created_at,updated_at) VALUES ('old-city-job',?,'old-city-req','{}','accepted',?,?)").run(ownerId, f.now(), f.now());
const latestPrefs = await (await f.call('preferences', undefined, { cookie: web })).json();
const paris = { ...latestPrefs.preferences, location: { name: 'Paris', country: 'France', latitude: 48.85, longitude: 2.35, timezone: 'Europe/Paris' } };
assert.equal((await f.call('preferences', { preferences: paris, expectedVersion: latestPrefs.version }, { cookie: web })).status, 200);
assert.equal(f.sqlite.prepare("SELECT status FROM hb_jobs WHERE id='old-city-job'").get().status, 'canceled');

// A tester who signs in with emailed codes (no password) can delete their own account with a deletion code.
assert.equal((await f.call('admin/invite', { email: 'dana@example.test' }, { cookie: web })).status, 200);
await f.call('auth/code/send', { email: 'dana@example.test' });
const dana = (await f.call('auth/code/verify', { email: 'dana@example.test', code: codeFor('dana@example.test') })).headers.get('set-cookie').split(';')[0];
assert.equal((await (await f.call('auth/session', undefined, { cookie: dana })).json()).user.hasPassword, false, 'Code-only account');
await app('code/send', { email: 'dana@example.test' });
const danaApp = (await (await app('code/verify', { email: 'dana@example.test', code: codeFor('dana@example.test'), platform: 'windows', deviceName: 'DANA-PC' })).json()).token;
assert.equal((await app('state', undefined, danaApp)).status, 200);
assert.equal((await f.call('account/delete', { code: '123456' }, { cookie: dana })).status, 403, 'No code was requested yet');
f.advance(600001); // past the 3-tries-per-10-minutes limit on account deletion
assert.equal((await f.call('account/delete/code', {}, { cookie: dana })).status, 200);
const deletionMail = f.emails.at(-1);
assert.equal(deletionMail.to[0], 'dana@example.test'); assert.match(deletionMail.subject, /^\d{6} confirms deleting your Heartbeat account$/);
const deletionCode = deletionMail.subject.slice(0, 6);
await f.call('auth/code/send', { email: 'dana@example.test' });
const signInCode = codeFor('dana@example.test');
assert.equal((await f.call('account/delete', { code: signInCode === deletionCode ? '000000' : signInCode }, { cookie: dana })).status, 403, 'A sign-in code cannot delete an account');
assert.equal((await f.call('account/delete', {}, { cookie: dana })).status, 403, 'Nothing to confirm with: refused');
assert.equal((await f.call('access-request', { email: 'dana@example.test', name: 'Dana', note: 'hi' })).status, 200); // something else that names her
assert.equal((await f.call('admin/pace', { email: 'dana@example.test', rhythmMinutes: 5 }, { cookie: web })).status, 200); // and a change-log entry
assert.equal(f.sqlite.prepare("SELECT lifecycle FROM hb_users WHERE email='dana@example.test'").get().lifecycle, 'active', 'Still here after wrong confirmations');
assert.equal((await f.call('account/delete', { code: deletionCode }, { cookie: dana })).status, 200, 'The deletion code deletes the account');
assert.equal(f.sqlite.prepare("SELECT lifecycle FROM hb_users WHERE email='dana@example.test'").get().lifecycle, 'deleting');
assert.equal((await app('state', undefined, danaApp)).status, 401, 'Their app is signed out at once');
assert.equal((await f.call('auth/session', undefined, { cookie: dana })).status === 200 && (await (await f.call('auth/session', undefined, { cookie: dana })).json()).user, null, 'Their browser is signed out');
// Once the deletion worker finishes, nothing identifies her: searched by user id and by email.
const danaId = f.sqlite.prepare("SELECT id FROM hb_users WHERE email='dana@example.test'").get().id;
for (let i = 0; i < 5 && f.sqlite.prepare("SELECT state FROM hb_deletions WHERE owner=?").get(danaId)?.state !== 'completed'; i++) { f.advance(120000); await processAccountDeletions(f.env, f.now()); }
assert.equal(f.sqlite.prepare("SELECT state FROM hb_deletions WHERE owner=?").get(danaId).state, 'completed');
const mentions = { users: "SELECT COUNT(*) AS n FROM hb_users WHERE id=? OR email=?", activity: "SELECT COUNT(*) AS n FROM hb_activity WHERE user_id=? OR email=?", codes: "SELECT COUNT(*) AS n FROM hb_login_codes WHERE email=? OR email=?", requests: "SELECT COUNT(*) AS n FROM hb_access_requests WHERE email=? OR email=?", invites: "SELECT COUNT(*) AS n FROM hb_invites WHERE email=? OR email=?", changes: "SELECT COUNT(*) AS n FROM hb_admin_log WHERE target=? OR target=? OR actor=?", views: "SELECT COUNT(*) AS n FROM hb_view_sessions WHERE user_id=? OR user_id=?", devices: "SELECT COUNT(*) AS n FROM hb_devices WHERE owner=? OR owner=?", sessions: "SELECT COUNT(*) AS n FROM hb_sessions WHERE user_id=? OR user_id=?" };
for (const [table, sql] of Object.entries(mentions)) {
  const args = table === 'codes' ? ['dana@example.test', 'delete:dana@example.test'] : table === 'changes' ? [danaId, 'dana@example.test', 'dana@example.test'] : [danaId, 'dana@example.test'];
  assert.equal(f.sqlite.prepare(sql).get(...args).n, 0, `No ${table} left for the deleted account`);
}
assert.ok(f.sqlite.prepare("SELECT COUNT(*) AS n FROM hb_admin_log WHERE target='a deleted account'").get().n >= 1, 'The owner’s change log keeps the entry without the name');
// The deletion code was single-use and never signs anyone in.
assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM hb_login_codes WHERE email='delete:dana@example.test'").get().n, 0);
assert.equal((await f.call('auth/code/verify', { email: 'dana@example.test', code: deletionCode })).status === 200 && deletionCode !== signInCode, false, 'A deletion code is not a sign-in code');

// An expired deletion code is refused.
assert.equal((await f.call('admin/invite', { email: 'eli@example.test' }, { cookie: web })).status, 200);
await f.call('auth/code/send', { email: 'eli@example.test' });
const eli = (await f.call('auth/code/verify', { email: 'eli@example.test', code: codeFor('eli@example.test') })).headers.get('set-cookie').split(';')[0];
assert.equal((await f.call('account/delete/code', {}, { cookie: eli })).status, 200);
const eliCode = f.emails.at(-1).subject.slice(0, 6);
f.advance(10 * 60000 + 1);
assert.equal((await f.call('account/delete', { code: eliCode }, { cookie: eli })).status, 403, 'Expired deletion code');
assert.equal(f.sqlite.prepare("SELECT lifecycle FROM hb_users WHERE email='eli@example.test'").get().lifecycle, 'active');

f.close();
console.log('app api: ok');
