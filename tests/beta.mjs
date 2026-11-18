import assert from 'node:assert/strict';
import { fixture } from './product-fixture.mjs';
import { accessFor } from '../lib/product/access.ts';
import { deviceOf, sixDigits } from '../lib/product/beta.ts';
import { selfHostedRequest } from '../lib/product/self-hosted.ts';
import { createWeatherAdapter } from '../lib/server/weather.ts';

const OWNER = 'owner@example.test';
const f = await fixture({ production: true, env: { HEARTBEAT_BETA: 'true', HEARTBEAT_OWNER_EMAIL: OWNER, HEARTBEAT_BETA_SEATS: '2', HEARTBEAT_BETA_USER_DAILY: '2', HEARTBEAT_EMAIL_API_KEY: 'fixture-mail', HEARTBEAT_EMAIL_FROM: 'Heartbeat <hello@example.test>' } });
const codeFor = address => { const mail = f.emails.filter(m => m.to[0] === address).at(-1); return mail.subject.slice(0, 6); };
async function signIn(address) {
  const sent = await f.call('auth/code/send', { email: address }); assert.equal(sent.status, 200, await sent.clone().text());
  const done = await f.call('auth/code/verify', { email: address, code: codeFor(address) }); assert.equal(done.status, 200, await done.clone().text());
  return done.headers.get('set-cookie').split(';')[0];
}

// Codes are six uniform digits.
for (let i = 0; i < 50; i++) assert.match(sixDigits(), /^\d{6}$/);

// The beta closes password sign-up, password reset and Google.
assert.equal((await f.call('auth/register', { email: 'x@example.test', password: 'a long test password' })).status, 403);
assert.equal((await f.call('auth/forgot', { email: 'x@example.test' })).status, 403);
const session = await (await f.call('auth/session')).json();
assert.equal(session.beta, true); assert.equal(session.googleAvailable, false);

// Strangers get no code and no email.
const stranger = await f.call('auth/code/send', { email: 'stranger@example.test' });
assert.equal(stranger.status, 403); assert.equal(f.emails.length, 0);

// The owner can always sign in and is told they are the owner.
const owner = await signIn(OWNER);
const ownerSession = await (await f.call('auth/session', undefined, { cookie: owner })).json();
assert.equal(ownerSession.owner, true); assert.equal(ownerSession.user.verified, true); assert.equal(ownerSession.user.hasPassword, false);

// The owner invites people, up to the number of places.
assert.equal((await f.call('admin/invite', { email: 'Sam@Example.test', note: 'Sam' }, { cookie: owner })).status, 200);
assert.equal((await f.call('admin/invite', { email: 'kim@example.test' }, { cookie: owner })).status, 200);
const full = await f.call('admin/invite', { email: 'third@example.test' }, { cookie: owner });
assert.equal(full.status, 409); assert.match((await full.json()).error, /full/);

// An invited tester signs in with a code; the account is created, verified and free.
const sam = await signIn('sam@example.test');
const samSession = await (await f.call('auth/session', undefined, { cookie: sam })).json();
assert.equal(samSession.user.email, 'sam@example.test'); assert.equal(samSession.owner, false);
assert.equal(samSession.access.eligible, true); assert.equal(samSession.access.cadence, 3600000, 'The basic rhythm is one picture an hour');
// The owner can give one tester a faster rhythm and their own daily limit.
assert.equal((await f.call('admin/pace', { email: 'sam@example.test', rhythmMinutes: 5, dailyLimit: 1 }, { cookie: sam })).status, 404, 'Only the owner');
assert.equal((await f.call('admin/pace', { email: 'sam@example.test', rhythmMinutes: 1 }, { cookie: owner })).status, 400);
assert.equal((await f.call('admin/pace', { email: 'nobody@example.test', rhythmMinutes: 5 }, { cookie: owner })).status, 404);
assert.equal((await f.call('admin/pace', { email: 'sam@example.test', rhythmMinutes: 5, dailyLimit: 4 }, { cookie: owner })).status, 200);
assert.equal((await (await f.call('auth/session', undefined, { cookie: sam })).json()).access.cadence, 300000);
const paced = await (await f.call('admin/overview?days=7&tz=0', undefined, { cookie: owner })).json();
assert.equal(paced.testers.find(t => t.email === 'sam@example.test').rhythm_minutes, 5);
assert.equal(paced.cadenceMinutes, 60); assert.equal(paced.testers.filter(t => t.email === OWNER).length, 1);
// The owner can pace themselves too, without appearing twice.
assert.equal((await f.call('admin/pace', { email: OWNER, rhythmMinutes: 10 }, { cookie: owner })).status, 200);
const ownerPaced = await (await f.call('admin/overview?days=7&tz=0', undefined, { cookie: owner })).json();
assert.equal(ownerPaced.testers.filter(t => t.email === OWNER).length, 1); assert.equal(ownerPaced.testers.find(t => t.email === OWNER).rhythm_minutes, 10);
assert.equal((await f.call('admin/invite', { email: 'extra@example.test' }, { cookie: owner })).status, 409, 'The owner row never takes a seat');
// Back to the default for the rest of this test.
assert.equal((await f.call('admin/pace', { email: 'sam@example.test', rhythmMinutes: null, dailyLimit: null }, { cookie: owner })).status, 200);
assert.ok(samSession.access.allowance >= 5000);
assert.match(f.emails.at(-1).text, /\d{6}/); assert.equal(f.emails.at(-1).from, 'Heartbeat <hello@example.test>');

// Testers cannot see the dashboard: it looks like it does not exist.
assert.equal((await f.call('admin/overview', undefined, { cookie: sam })).status, 404);
assert.equal((await f.call('admin/invite', { email: 'z@example.test' }, { cookie: sam })).status, 404);

// Wrong codes are counted; after five wrong tries even the right code fails.
await f.call('auth/code/send', { email: 'kim@example.test' });
const kimCode = codeFor('kim@example.test'), wrong = kimCode === '000000' ? '111111' : '000000';
for (let i = 0; i < 5; i++) assert.equal((await f.call('auth/code/verify', { email: 'kim@example.test', code: wrong })).status, 401);
assert.equal((await f.call('auth/code/verify', { email: 'kim@example.test', code: kimCode })).status, 401);
// A code expires after 10 minutes and works only once.
await f.call('auth/code/send', { email: 'kim@example.test' });
f.advance(11 * 60000);
assert.equal((await f.call('auth/code/verify', { email: 'kim@example.test', code: codeFor('kim@example.test') })).status, 401);
const kim = await signIn('kim@example.test');
assert.equal((await f.call('auth/code/verify', { email: 'kim@example.test', code: codeFor('kim@example.test') })).status, 401);

// Presence counts visible time; long gaps are not counted; mood changes are logged.
const screen = crypto.randomUUID(), ua = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile' };
assert.equal((await f.call('presence', { session: screen, mood: 'calm' }, { cookie: sam, headers: ua })).status, 200);
f.advance(60000); await f.call('presence', { session: screen, mood: 'calm' }, { cookie: sam, headers: ua });
f.advance(60000); await f.call('presence', { session: screen, mood: 'dreamy' }, { cookie: sam, headers: ua });
f.advance(3600000); await f.call('presence', { session: screen, mood: 'dreamy' }, { cookie: sam, headers: ua });
const row = f.sqlite.prepare('SELECT * FROM hb_view_sessions WHERE id=?').get(screen);
assert.equal(row.seconds, 120); assert.equal(row.device, 'phone'); assert.equal(row.mood, 'dreamy');
// Someone else's screen session cannot be extended.
assert.equal((await f.call('presence', { session: screen, mood: 'calm' }, { cookie: kim })).status, 400);

// The dashboard adds it all up.
const samId = f.sqlite.prepare('SELECT id FROM hb_users WHERE email=?').get('sam@example.test').id;
f.sqlite.prepare("INSERT INTO ai_attempts(id,owner,request_id,claim,day,status,location_key,created_at,art_key) VALUES (?,?,?,'c','2000-01-01','displayed','l',?,'k')").run(crypto.randomUUID(), samId, crypto.randomUUID(), f.now());
const overview = await (await f.call('admin/overview?days=7&tz=0', undefined, { cookie: owner })).json();
const samRow = overview.testers.find(t => t.email === 'sam@example.test');
assert.equal(samRow.seconds, 120); assert.equal(samRow.sessions, 1); assert.equal(samRow.mood, 'dreamy'); assert.equal(samRow.device, 'phone');
assert.equal(overview.series.length, 7); assert.equal(overview.series.reduce((s, d) => s + d.seconds, 0), 120);
assert.equal(overview.liveNow.length, 1);
assert.equal(overview.series.at(-1).pictures, 1); assert.equal(samRow.pictures_today, 1);
assert.ok(overview.activity.some(a => a.kind === 'mood' && a.detail === 'calm → dreamy'));
assert.ok(overview.activity.some(a => a.kind === 'joined' && a.email === 'sam@example.test'));
assert.ok(overview.activity.some(a => a.kind === 'not_invited' && a.email === 'stranger@example.test'));
assert.equal(overview.testers.find(t => t.email === OWNER).note, 'You (owner)');

// The per-tester daily limit stops new pictures until tomorrow.
const samUser = f.sqlite.prepare('SELECT * FROM hb_users WHERE email=?').get('sam@example.test');
for (let i = 0; i < 2; i++) f.sqlite.prepare("INSERT INTO hb_jobs(id,owner,request_id,input,status,created_at,updated_at) VALUES (?,?,?,?,'done',?,?)").run(crypto.randomUUID(), samUser.id, crypto.randomUUID(), '{}', f.now(), f.now());
const limited = await accessFor({ user: samUser, expires: f.now() + 1000 }, f.env, f.now());
assert.equal(limited.eligible, false); assert.match(limited.reason, /tomorrow/);
f.advance(86400000);
assert.equal((await accessFor({ user: samUser, expires: f.now() + 1000 }, f.env, f.now())).eligible, true);

// Removing a tester signs them out at once and stops new codes.
assert.equal((await f.call('admin/uninvite', { email: 'sam@example.test' }, { cookie: owner })).status, 200);
assert.equal((await f.call('auth/session', undefined, { cookie: sam }).then(r => r.json())).user, null);
assert.equal((await f.call('auth/code/send', { email: 'sam@example.test' })).status, 403);
assert.equal((await f.call('admin/uninvite', { email: OWNER }, { cookie: owner })).status, 400);

// Device names from user agents.
assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
assert.equal(deviceOf('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)'), 'tv');
assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'desktop');
f.close();

// Local development without email shows the code on screen instead of mailing it.
const local = await fixture({ env: { HEARTBEAT_BETA: 'true', HEARTBEAT_OWNER_EMAIL: OWNER } });
const shown = await (await local.call('auth/code/send', { email: OWNER })).json();
assert.match(shown.devCode, /^\d{6}$/); assert.equal(local.emails.length, 0);
local.close();

// Self-hosting behind a tunnel restores the public HTTPS address, and only for the public host.
const env = { HEARTBEAT_SELF_HOSTED: 'true', HEARTBEAT_APP_ORIGIN: 'https://app.heartbeatart.co.uk' };
assert.equal(selfHostedRequest(new Request('http://app.heartbeatart.co.uk/api/product/auth/session?x=1'), env).url, 'https://app.heartbeatart.co.uk/api/product/auth/session?x=1');
assert.equal(selfHostedRequest(new Request('http://127.0.0.1:4300/api/product/ops/maintenance'), env).url, 'http://127.0.0.1:4300/api/product/ops/maintenance');
assert.equal(selfHostedRequest(new Request('http://app.heartbeatart.co.uk/'), { ...env, HEARTBEAT_SELF_HOSTED: 'false' }).url, 'http://app.heartbeatart.co.uk/');
const posted = selfHostedRequest(new Request('http://app.heartbeatart.co.uk/api/product/presence', { method: 'POST', body: '{"a":1}', headers: { Origin: 'https://app.heartbeatart.co.uk' } }), env);
assert.equal(posted.method, 'POST'); assert.equal(await posted.text(), '{"a":1}'); assert.equal(posted.headers.get('origin'), 'https://app.heartbeatart.co.uk');

// The self-hosted private test may use Open-Meteo's free service; ordinary production may not.
const geo = async url => { assert.match(String(url), /^https:\/\/geocoding-api\.open-meteo\.com\//); return Response.json({ results: [{ name: 'London', country: 'United Kingdom', latitude: 51.5, longitude: -0.12, timezone: 'Europe/London' }] }); };
const betaWeather = createWeatherAdapter({ HEARTBEAT_APP_MODE: 'production', HEARTBEAT_BETA: 'true', HEARTBEAT_SELF_HOSTED: 'true' }, { fetcher: geo });
assert.equal((await betaWeather.search('London'))[0].name, 'London');
await assert.rejects(createWeatherAdapter({ HEARTBEAT_APP_MODE: 'production' }, { fetcher: geo }).search('London'), /Commercial weather/);
await assert.rejects(createWeatherAdapter({ HEARTBEAT_APP_MODE: 'production', HEARTBEAT_BETA: 'true' }, { fetcher: geo }).search('London'), /Commercial weather/);

console.log('private beta: ok');

// The dashboard page itself is refused on the server for everyone but the owner.
{
  const { ownerOnlyPage } = await import('../lib/product/owner-page.ts');
  const g = await fixture({ production: true, env: { HEARTBEAT_BETA: 'true', HEARTBEAT_OWNER_EMAIL: 'boss@example.test', HEARTBEAT_EMAIL_API_KEY: 'k', HEARTBEAT_EMAIL_FROM: 'H <h@example.test>' } });
  const page = cookie => new Request('https://heartbeat.example/admin', { headers: cookie ? { Cookie: cookie } : {} });
  assert.equal((await ownerOnlyPage(page(), g.env, g.now())).status, 404);
  await g.call('admin/invite', { email: 'friend@example.test' }, {});
  const code = a => g.emails.filter(m => m.to[0] === a).at(-1).subject.slice(0, 6);
  await g.call('auth/code/send', { email: 'boss@example.test' });
  const boss = (await g.call('auth/code/verify', { email: 'boss@example.test', code: code('boss@example.test') })).headers.get('set-cookie').split(';')[0];
  await g.call('admin/invite', { email: 'friend@example.test' }, { cookie: boss });
  await g.call('auth/code/send', { email: 'friend@example.test' });
  const friend = (await g.call('auth/code/verify', { email: 'friend@example.test', code: code('friend@example.test') })).headers.get('set-cookie').split(';')[0];
  assert.equal((await ownerOnlyPage(page(friend), g.env, g.now())).status, 404, 'A signed-in tester gets 404');
  assert.equal(await ownerOnlyPage(page(boss), g.env, g.now()), null, 'The owner gets the page');
  g.close();
  console.log('owner-only dashboard page: ok');
}

// Page guards see the path the router uses, so encoded or .rsc variants can't slip past.
{
  const { routePath } = await import('../lib/product/route-path.ts');
  for (const raw of ['/admin', '/%61dmin', '//admin', '/admin.rsc', '/admin/', '/%61dmin.rsc']) assert.equal(routePath(raw), '/admin', raw);
  assert.equal(routePath('/admin/x'), '/admin/x'); assert.equal(routePath('/'), '/'); assert.equal(routePath('/%E0%A4%A'), '/%E0%A4%A');
  console.log('route path normalisation: ok');
}

// A password set before the address was proven (for example by someone else) stops working once the
// real owner of the address signs in with a code; their sessions and devices are removed.
{
  const h = await fixture({ production: true, env: { HEARTBEAT_BETA: 'true', HEARTBEAT_OWNER_EMAIL: 'boss@example.test', HEARTBEAT_EMAIL_API_KEY: 'k', HEARTBEAT_EMAIL_FROM: 'H <h@example.test>' } });
  const { passwordHash } = await import('../lib/product/auth.ts');
  h.sqlite.prepare("INSERT INTO hb_users(id,email,password_hash,verified,created_at) VALUES ('squatter','boss@example.test',?,0,?)").run(await passwordHash('an attacker password'), h.now());
  h.sqlite.prepare("INSERT INTO hb_sessions(hash,user_id,expires,credential_epoch,auth_method,authenticated_at) VALUES ('old-session','squatter',?,0,'password',?)").run(h.now() + 86400000, h.now());
  await h.call('auth/code/send', { email: 'boss@example.test' });
  const code = h.emails.at(-1).subject.slice(0, 6);
  assert.equal((await h.call('auth/code/verify', { email: 'boss@example.test', code })).status, 200);
  const row = h.sqlite.prepare("SELECT * FROM hb_users WHERE id='squatter'").get();
  assert.equal(row.verified, 1); assert.equal(row.password_hash, 'code-only'); assert.equal(row.credential_epoch, 1);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM hb_sessions WHERE hash='old-session'").get().n, 0);
  assert.equal((await h.call('auth/login', { email: 'boss@example.test', password: 'an attacker password' })).status, 401);
  h.close();
  console.log('unproven password removed on code sign-in: ok');
}
