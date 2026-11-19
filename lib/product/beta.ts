// Private beta: invite-only sign-in with emailed six-digit codes, free pictures,
// viewing-time tracking and the owner's dashboard data.
import { authRate, email, session, trustedActor, type Auth, type User } from './auth.ts';
import { db, hash, json, localDevelopment, ProductError, rate, readJSON, type ProductEnv } from './core.ts';
import { ensureDefaultWorld } from './profiles.ts';
import { adjustPictureAllowance } from './adjustments.ts';
import { parseMood } from '../moods.ts';

export const CODE_TTL = 10 * 60000, CODE_ATTEMPTS = 5, BETA_GRANT = 5000, MAX_DATE = 8640000000000000;
export const betaMode = (env: ProductEnv) => env.HEARTBEAT_BETA === 'true';
export const ownerEmail = (env: ProductEnv) => (env.HEARTBEAT_OWNER_EMAIL || '').trim().toLowerCase();
export const isOwner = (env: ProductEnv, address: string) => !!ownerEmail(env) && address === ownerEmail(env);
export const betaSeats = (env: ProductEnv) => clamp(env.HEARTBEAT_BETA_SEATS, 25, 1, 500);
/** Default minutes between new pictures (the basic rhythm: one an hour). The owner can set each tester's own. */
export const betaCadence = (env: ProductEnv) => clamp(env.HEARTBEAT_BETA_CADENCE_MINUTES, 60, 2, 1440) * 60000;
/** Default new pictures one tester can start per UTC day, so one screen left on overnight cannot use everyone's budget. */
export const betaDailyPictures = (env: ProductEnv) => clamp(env.HEARTBEAT_BETA_USER_DAILY, 30, 1, 500);
export type TesterPace = { cadence: number; daily: number; total: number | null; custom: boolean };
/** This person's picture rhythm and daily limit: their own if the owner set one, otherwise the defaults. */
export async function testerPace(env: ProductEnv, address: string): Promise<TesterPace> {
  const row = betaMode(env) ? await db(env).prepare('SELECT rhythm_minutes,daily_limit,total_limit FROM hb_invites WHERE email=?').bind(address).first<{ rhythm_minutes: number | null; daily_limit: number | null; total_limit: number | null }>() : null;
  return { cadence: row?.rhythm_minutes ? row.rhythm_minutes * 60000 : betaCadence(env), daily: row?.daily_limit || betaDailyPictures(env), total: row?.total_limit || null, custom: !!(row?.rhythm_minutes || row?.daily_limit || row?.total_limit) };
}
function clamp(value: string | undefined, fallback: number, low: number, high: number) { const n = Number(value ?? fallback); return Number.isSafeInteger(n) && n >= low && n <= high ? n : fallback; }
const dayStart = (now: number) => Math.floor(now / 86400000) * 86400000;

export async function logActivity(env: ProductEnv, entry: { userId?: string | null; email?: string; kind: string; detail?: string }, now: number) {
  try { await db(env).prepare('INSERT INTO hb_activity(id,user_id,email,kind,detail,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), entry.userId ?? null, entry.email || '', entry.kind, (entry.detail || '').slice(0, 200), now).run(); }
  catch { /* Tracking never blocks the product. */ }
}

export async function invited(env: ProductEnv, address: string) {
  return isOwner(env, address) || !!await db(env).prepare('SELECT email FROM hb_invites WHERE email=?').bind(address).first();
}

/** A uniform six-digit code. */
export function sixDigits(): string {
  const values = new Uint32Array(1), limit = Math.floor(0x100000000 / 1000000) * 1000000;
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return String(values[0] % 1000000).padStart(6, '0');
}
const codeHash = (address: string, code: string) => hash(`heartbeat-login:${address}:${code}`);

async function mailCode(env: ProductEnv, address: string, code: string, fetcher: typeof fetch) {
  const text = `Your Heartbeat sign-in code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.\n\nHeartbeat · AI for ambience`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:32px 24px;color:#1d1b19"><p style="font-size:14px;letter-spacing:.12em;color:#8a7f73;margin:0 0 24px">HEARTBEAT</p><p style="font-size:16px;margin:0 0 12px">Your sign-in code</p><p style="font-size:36px;letter-spacing:.3em;font-weight:600;margin:0 0 24px">${code}</p><p style="font-size:14px;color:#6b635b;margin:0">It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p></div>`;
  let response: Response;
  try { response = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.HEARTBEAT_EMAIL_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.HEARTBEAT_EMAIL_FROM, to: [address], subject: `${code} is your Heartbeat code`, text, html }) }) }
  catch { throw new ProductError('The code email could not be sent. Please try again in a minute.', 503); }
  if (!response.ok) throw new ProductError('The code email could not be sent. Please try again in a minute.', 503);
}

/** Step 1: email a code. In the beta only invited addresses (and the owner) receive one. */
export async function sendCode(request: Request, env: ProductEnv, now: number, fetcher: typeof fetch) {
  const input = await readJSON(request, 1024), address = email(input.email), local = localDevelopment(request, env);
  await authRate(request, env, now, address);
  await rate(env, `code-send:${address}`, now, 5);
  if (!local && (!env.HEARTBEAT_EMAIL_API_KEY || !env.HEARTBEAT_EMAIL_FROM)) throw new ProductError('Email sign-in is not configured yet.', 503);
  if (betaMode(env) && !await invited(env, address)) {
    await logActivity(env, { email: address, kind: 'not_invited' }, now);
    throw new ProductError('Heartbeat is in a small private test right now. This email isn’t on the invite list yet.', 403);
  }
  const code = sixDigits();
  await db(env).prepare('INSERT INTO hb_login_codes(email,code_hash,attempts,expires,created_at) VALUES (?,?,0,?,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,attempts=0,expires=excluded.expires,created_at=excluded.created_at').bind(address, await codeHash(address, code), now + CODE_TTL, now).run();
  await logActivity(env, { email: address, kind: 'code_sent' }, now);
  // Only on this computer without email configured: show the code instead of mailing it.
  if (local && (!env.HEARTBEAT_EMAIL_API_KEY || !env.HEARTBEAT_EMAIL_FROM)) return json({ sent: true, devCode: code });
  await mailCode(env, address, code, fetcher);
  return json({ sent: true });
}

/** Step 2: check the code, create the account on first use, start a session. */
export async function verifyCode(request: Request, env: ProductEnv, now: number) {
  const user = await codeLogin(request, env, await readJSON(request, 1024), now);
  return session(request, env, user, now, 'code');
}

/** Checks an emailed code and returns the (possibly new) account. Shared by the website and the apps. */
export async function codeLogin(request: Request, env: ProductEnv, input: Record<string, unknown>, now: number, via = ''): Promise<User> {
  const address = email(input.email);
  await authRate(request, env, now, address);
  const code = typeof input.code === 'string' ? input.code.replace(/\s/g, '') : '';
  if (!/^\d{6}$/.test(code)) throw new ProductError('Enter the six-digit code from the email.');
  const database = db(env);
  // Count the attempt before comparing, so parallel guesses cannot exceed the limit.
  const claimed = await database.prepare('UPDATE hb_login_codes SET attempts=attempts+1 WHERE email=? AND expires>? AND attempts<? RETURNING code_hash').bind(address, now, CODE_ATTEMPTS).first<{ code_hash: string }>();
  const expected = await codeHash(address, code);
  let diff = claimed ? 0 : 1; const actual = claimed?.code_hash || '0'.repeat(64);
  for (let i = 0; i < 64; i++) diff |= (expected.charCodeAt(i) || 0) ^ (actual.charCodeAt(i) || 0);
  if (diff !== 0) throw new ProductError('That code didn’t match or has expired. Check the email or send a new code.', 401);
  const used = await database.prepare('DELETE FROM hb_login_codes WHERE email=? AND code_hash=?').bind(address, expected).run();
  if (!used.meta.changes) throw new ProductError('That code was already used. Send a new code.', 401);
  if (betaMode(env) && !await invited(env, address)) throw new ProductError('This email isn’t on the invite list.', 403);
  let user = await database.prepare('SELECT * FROM hb_users WHERE email=?').bind(address).first<User>();
  const created = !user;
  if (!user) {
    user = { id: crypto.randomUUID(), email: address, password_hash: 'code-only', verified: 1, created_at: now, credential_epoch: 0 };
    try { await database.batch([database.prepare('INSERT INTO hb_users(id,email,password_hash,verified,created_at) VALUES (?,?,?,?,?)').bind(user.id, address, 'code-only', 1, now), database.prepare('INSERT INTO hb_billing(user_id) VALUES (?)').bind(user.id)]); }
    catch { user = await database.prepare('SELECT * FROM hb_users WHERE email=?').bind(address).first<User>(); if (!user) throw new ProductError('Your account could not be created. Please try again.', 503); }
    await ensureDefaultWorld(env, user.id, now);
  } else if (!user.verified) {
    // The code proves the address. Anything set up before it was proven (a password someone else may have
    // chosen, their sessions and devices) is removed, so only the address owner gets in.
    await database.batch([
      database.prepare("UPDATE hb_users SET verified=1,password_hash='code-only',credential_epoch=credential_epoch+1 WHERE id=? AND lifecycle='active'").bind(user.id),
      database.prepare('DELETE FROM hb_sessions WHERE user_id=?').bind(user.id),
      database.prepare('DELETE FROM hb_devices WHERE owner=?').bind(user.id),
    ]);
    user = await database.prepare('SELECT * FROM hb_users WHERE id=?').bind(user.id).first<User>();
    if (!user) throw new ProductError('Your account could not be opened. Please try again.', 503);
  }
  if ((user.lifecycle ?? 'active') !== 'active') throw new ProductError('This account is being deleted.', 403);
  if (betaMode(env)) await grantBetaAllowance(env, user, now);
  await logActivity(env, { userId: user.id, email: address, kind: created ? 'joined' : 'sign_in', detail: via }, now);
  return user;
}

/** Free pictures for the test. Idempotent: one grant per account. */
export async function grantBetaAllowance(env: ProductEnv, user: Pick<User, 'id' | 'created_at'>, now: number) {
  try { await adjustPictureAllowance(env, { requestId: `beta-grant:${user.id}`, userId: user.id, periodStart: user.created_at, periodEnd: MAX_DATE, delta: BETA_GRANT, actor: 'heartbeat-beta', reason: 'Free pictures for the private beta test', now }); }
  catch (error) { if (!(error instanceof ProductError) || error.status !== 409) throw error; /* A paid or changed period keeps its own allowance. */ }
}

/** Extra limits on generation during the beta. Returns a reason when blocked. */
export async function betaBlock(env: ProductEnv, user: Pick<User, 'id' | 'email'>, now: number): Promise<string | null> {
  if (!betaMode(env)) return null;
  if (!await invited(env, user.email)) return 'This account is no longer on the test invite list.';
  const pace = await testerPace(env, user.email);
  const counts = await db(env).prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) AS today FROM hb_jobs WHERE owner=?').bind(dayStart(now), user.id).first<{ total: number; today: number | null }>();
  if (pace.total !== null && (counts?.total || 0) >= pace.total) return 'You’ve had all the pictures for this test. Your screen keeps showing your latest one.';
  if ((counts?.today || 0) >= pace.daily) return 'That’s all the fresh pictures for today. Your screen keeps showing them, and new ones start again tomorrow.';
  return null;
}

export function deviceOf(agent: string | null) {
  const value = (agent || '').toLowerCase();
  if (/smart-?tv|tizen|webos|bravia|hbbtv|appletv|googletv|android tv|aft[a-z]/.test(value)) return 'tv';
  if (/ipad|tablet|(android(?!.*mobile))/.test(value)) return 'tablet';
  if (/iphone|android|mobile/.test(value)) return 'phone';
  return agent ? 'desktop' : 'unknown';
}

/** A screen showing Heartbeat says it is still there about once a minute. */
export async function presence(request: Request, env: ProductEnv, user: User, now: number) {
  const input = await readJSON(request, 512);
  if (typeof input.session !== 'string' || !/^[a-f0-9-]{36}$/.test(input.session)) throw new ProductError('Invalid screen session.');
  await rate(env, `presence:${user.id}`, now, 30, 60000);
  return json(await recordPresence(env, user, input.session, parseMood(input.mood), deviceOf(request.headers.get('user-agent')), now));
}

/** One "still showing" report from any screen: the website, a screensaver or a phone. */
export async function recordPresence(env: ProductEnv, user: Pick<User, 'id' | 'email'>, sessionId: string, mood: string, device: string, now: number) {
  const database = db(env), input = { session: sessionId };
  const prior = await database.prepare('SELECT user_id,mood FROM hb_view_sessions WHERE id=?').bind(input.session).first<{ user_id: string; mood: string }>();
  if (prior && prior.user_id !== user.id) throw new ProductError('Invalid screen session.');
  // Gaps over 150 seconds mean the screen was hidden or asleep; that time is not counted.
  await database.prepare('INSERT INTO hb_view_sessions(id,user_id,device,mood,started_at,last_seen,seconds) VALUES (?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET seconds=seconds+CASE WHEN ?-last_seen BETWEEN 0 AND 150000 THEN CAST(ROUND((?-last_seen)/1000.0) AS INTEGER) ELSE 0 END,last_seen=MAX(last_seen,?),mood=excluded.mood WHERE user_id=excluded.user_id').bind(input.session, user.id, device, mood, now, now, now, now, now).run();
  if (!prior) await logActivity(env, { userId: user.id, email: user.email, kind: 'screen_open', detail: device }, now);
  else if (prior.mood !== mood) await logActivity(env, { userId: user.id, email: user.email, kind: 'mood', detail: `${prior.mood} → ${mood}` }, now);
  return { ok: true };
}

function requireOwner(env: ProductEnv, auth: Auth) {
  // Hidden from everyone else: the route looks like it does not exist.
  if (!isOwner(env, auth.user.email) || !auth.user.verified) throw new ProductError('This page could not be found.', 404);
}

/** Every change the owner makes, with what it was before and after. */
export async function adminLog(env: ProductEnv, entry: { actor: string; target?: string; action: string; before?: string; after?: string }, now: number) {
  await db(env).prepare('INSERT INTO hb_admin_log(id,actor,target,action,before,after,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), entry.actor, entry.target || '', entry.action, (entry.before || '').slice(0, 300), (entry.after || '').slice(0, 300), now).run();
}
const paceText = (row: { rhythm_minutes?: number | null; daily_limit?: number | null; total_limit?: number | null } | null) =>
  `${row?.rhythm_minutes ? `every ${row.rhythm_minutes} min` : 'default rhythm'} · ${row?.daily_limit ? `${row.daily_limit}/day` : 'default per day'} · ${row?.total_limit ? `${row.total_limit} total` : 'no total limit'}`;

/** Public: someone asks to join the test. Stored for the owner, who is emailed. Replies the same either way. */
export async function accessRequest(request: Request, env: ProductEnv, now: number, fetcher: typeof fetch) {
  const input = await readJSON(request, 2048);
  const thanks = json({ received: true, message: 'You’re on the early access list. We’ll email you when there’s a place for you.' });
  if (typeof input.website === 'string' && input.website.trim()) return thanks; // a form-filling robot
  const address = email(input.email);
  const name = typeof input.name === 'string' ? input.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80) : '';
  const note = typeof input.note === 'string' ? input.note.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 500) : '';
  await rate(env, 'access-request:global', now, 30, 3600000);
  await rate(env, `access-request:ip:${trustedActor(request, env)}`, now, 5, 3600000);
  const database = db(env);
  const pending = await database.prepare("SELECT id FROM hb_access_requests WHERE email=? AND status='new'").bind(address).first();
  if (pending || await invited(env, address)) return thanks;
  await database.prepare('INSERT INTO hb_access_requests(id,email,name,note,status,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), address, name, note, 'new', now).run();
  await logActivity(env, { email: address, kind: 'requested', detail: name }, now);
  const owner = ownerEmail(env);
  if (owner && env.HEARTBEAT_EMAIL_API_KEY && env.HEARTBEAT_EMAIL_FROM) {
    const origin = env.HEARTBEAT_APP_ORIGIN || '';
    const text = `${name || 'Someone'} (${address}) asked for Heartbeat early access.\n\n${note ? `Their note: ${note}\n\n` : ''}Invite or dismiss them on your dashboard: ${origin}/admin#requests`;
    try { await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.HEARTBEAT_EMAIL_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.HEARTBEAT_EMAIL_FROM, to: [owner], reply_to: address, subject: `Heartbeat early access: ${name ? `${name} · ` : ''}${address}`, text }) }); }
    catch { /* the request is saved on the dashboard either way */ }
  }
  return thanks;
}

function csv(rows: Record<string, unknown>[], columns: string[]) {
  const cell = (v: unknown) => { let t = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return [columns.join(','), ...rows.map(r => columns.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}
const iso = (v: unknown) => typeof v === 'number' && v > 0 ? new Date(v).toISOString() : '';

/** Owner-only routes under /api/product/admin/. */
export async function adminRoute(request: Request, env: ProductEnv, auth: Auth, path: string, now: number) {
  requireOwner(env, auth);
  const database = db(env);
  if (path === 'admin/invite' && request.method === 'POST') {
    const input = await readJSON(request, 1024), address = email(input.email), note = typeof input.note === 'string' ? input.note.trim().slice(0, 80) : '';
    const count = await database.prepare('SELECT COUNT(*) AS n FROM hb_invites WHERE email<>?').bind(ownerEmail(env)).first<{ n: number }>();
    const exists = await database.prepare('SELECT email FROM hb_invites WHERE email=?').bind(address).first();
    if (!exists && !isOwner(env, address) && (count?.n || 0) >= betaSeats(env)) throw new ProductError(`The test is full (${betaSeats(env)} places). Remove someone first.`, 409);
    await database.prepare('INSERT INTO hb_invites(email,note,invited_by,invited_at) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET note=excluded.note').bind(address, note, auth.user.email, now).run();
    if (!exists) await logActivity(env, { email: address, kind: 'invited', detail: note }, now);
    await adminLog(env, { actor: auth.user.email, target: address, action: exists ? 'note changed' : 'invited', after: note }, now);
    // Anyone who asked for access and is now invited is marked as handled.
    await database.prepare("UPDATE hb_access_requests SET status='invited',handled_at=? WHERE email=? AND status='new'").bind(now, address).run();
    return json({ invited: address });
  }
  if (path === 'admin/pace' && request.method === 'POST') {
    // Per-tester picture rhythm (minutes) and daily limit; empty means the default.
    const input = await readJSON(request, 1024), address = email(input.email);
    const numeric = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v));
    if ([input.rhythmMinutes, input.dailyLimit, input.totalLimit].some(v => v != null && v !== '' && !numeric(v))) throw new ProductError('Use whole numbers.');
    const minutes = input.rhythmMinutes === null || input.rhythmMinutes === '' || input.rhythmMinutes === undefined ? null : Number(input.rhythmMinutes);
    const daily = input.dailyLimit === null || input.dailyLimit === '' || input.dailyLimit === undefined ? null : Number(input.dailyLimit);
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 2 || minutes > 1440)) throw new ProductError('Choose between 2 and 1440 minutes.');
    if (daily !== null && (!Number.isInteger(daily) || daily < 1 || daily > 500)) throw new ProductError('Choose between 1 and 500 pictures a day.');
    const total = input.totalLimit === null || input.totalLimit === '' || input.totalLimit === undefined ? null : Number(input.totalLimit);
    if (total !== null && (!Number.isInteger(total) || total < 1 || total > 100000)) throw new ProductError('Choose a total between 1 and 100000 pictures.');
    const before = await database.prepare('SELECT rhythm_minutes,daily_limit,total_limit FROM hb_invites WHERE email=?').bind(address).first<{ rhythm_minutes: number | null; daily_limit: number | null; total_limit: number | null }>();
    if (!isOwner(env, address) && !await database.prepare('SELECT email FROM hb_invites WHERE email=?').bind(address).first()) throw new ProductError('Invite this person first.', 404);
    const after = { rhythm_minutes: minutes, daily_limit: daily, total_limit: total };
    if (paceText(before) === paceText(after)) return json({ email: address, rhythmMinutes: minutes, dailyLimit: daily, totalLimit: total, unchanged: true });
    await database.prepare("INSERT INTO hb_invites(email,note,invited_by,invited_at,rhythm_minutes,daily_limit,total_limit) VALUES (?,'',?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET rhythm_minutes=excluded.rhythm_minutes,daily_limit=excluded.daily_limit,total_limit=excluded.total_limit").bind(address, auth.user.email, now, minutes, daily, total).run();
    await adminLog(env, { actor: auth.user.email, target: address, action: 'picture pace', before: paceText(before), after: paceText(after) }, now);
    // The new rhythm applies from the next picture: let a waiting screen ask again now.
    const user = await database.prepare('SELECT id FROM hb_users WHERE email=?').bind(address).first<{ id: string }>();
    if (user) await database.prepare('UPDATE ai_sessions SET next_at=MIN(next_at,?) WHERE id=?').bind(now + (minutes ?? betaCadence(env) / 60000) * 60000, user.id).run();
    await logActivity(env, { email: address, kind: 'pace', detail: paceText(after) }, now);
    return json({ email: address, rhythmMinutes: minutes, dailyLimit: daily, totalLimit: total });
  }
  if (path === 'admin/uninvite' && request.method === 'POST') {
    const address = email((await readJSON(request, 1024)).email);
    if (isOwner(env, address)) throw new ProductError('You can’t remove yourself.');
    const user = await database.prepare('SELECT id FROM hb_users WHERE email=?').bind(address).first<{ id: string }>();
    const was = await database.prepare('SELECT note,rhythm_minutes,daily_limit,total_limit FROM hb_invites WHERE email=?').bind(address).first<{ note: string; rhythm_minutes: number | null; daily_limit: number | null; total_limit: number | null }>();
    if (was) await adminLog(env, { actor: auth.user.email, target: address, action: 'removed', before: `${was.note ? `${was.note} · ` : ''}${paceText(was)}` }, now);
    await database.batch([
      database.prepare('DELETE FROM hb_invites WHERE email=?').bind(address),
      database.prepare('DELETE FROM hb_login_codes WHERE email=?').bind(address),
      ...(user ? [database.prepare('UPDATE hb_users SET credential_epoch=credential_epoch+1 WHERE id=?').bind(user.id), database.prepare('DELETE FROM hb_sessions WHERE user_id=?').bind(user.id), database.prepare('DELETE FROM hb_devices WHERE owner=?').bind(user.id)] : []),
    ]);
    await logActivity(env, { userId: user?.id, email: address, kind: 'removed' }, now);
    return json({ removed: address });
  }
  if (path === 'admin/request' && request.method === 'POST') {
    // Dismiss an access request (inviting goes through admin/invite, which marks it handled).
    const input = await readJSON(request, 512);
    if (typeof input.id !== 'string' || input.action !== 'dismiss') throw new ProductError('Choose a request.');
    const row = await database.prepare('SELECT email,name FROM hb_access_requests WHERE id=?').bind(input.id).first<{ email: string; name: string }>();
    if (!row) throw new ProductError('Request not found.', 404);
    await database.prepare("UPDATE hb_access_requests SET status='dismissed',handled_at=? WHERE id=?").bind(now, input.id).run();
    await adminLog(env, { actor: auth.user.email, target: row.email, action: 'request dismissed', before: row.name }, now);
    return json({ dismissed: true });
  }
  if (path === 'admin/overview' && request.method === 'GET') return json(await overview(env, now, new URL(request.url).searchParams));
  if (path === 'admin/export' && request.method === 'GET') {
    const kind = new URL(request.url).searchParams.get('kind') || '';
    const all = async (sql: string, ...v: unknown[]) => (await database.prepare(sql).bind(...v).all<Record<string, unknown>>()).results;
    let rows: Record<string, unknown>[] = [], columns: string[] = [];
    if (kind === 'testers') {
      rows = (await overview(env, now, new URLSearchParams('days=60'))).testers as Record<string, unknown>[];
      rows = rows.map(r => ({ ...r, invited_at: iso(r.invited_at), joined_at: iso(r.joined_at), last_seen: iso(r.last_seen), last_sign_in: iso(r.last_sign_in) }));
      columns = ['email', 'note', 'invited_at', 'joined_at', 'last_sign_in', 'last_seen', 'sessions', 'seconds', 'seconds_today', 'pictures', 'pictures_today', 'mood', 'device', 'rhythm_minutes', 'daily_limit', 'total_limit'];
    } else if (kind === 'sessions') {
      rows = (await all('SELECT u.email,v.device,v.mood,v.started_at,v.last_seen,v.seconds FROM hb_view_sessions v JOIN hb_users u ON u.id=v.user_id ORDER BY v.started_at DESC LIMIT 20000')).map(r => ({ ...r, started_at: iso(r.started_at), last_seen: iso(r.last_seen) }));
      columns = ['email', 'device', 'mood', 'started_at', 'last_seen', 'seconds'];
    } else if (kind === 'pictures') {
      rows = (await all('SELECT j.id,u.email,j.status,j.error_category AS reason,j.created_at,j.updated_at FROM hb_jobs j JOIN hb_users u ON u.id=j.owner ORDER BY j.created_at DESC LIMIT 20000')).map(r => ({ ...r, seconds: Math.round((Number(r.updated_at) - Number(r.created_at)) / 1000), created_at: iso(r.created_at), updated_at: iso(r.updated_at) }));
      columns = ['id', 'email', 'status', 'reason', 'created_at', 'updated_at', 'seconds'];
    } else if (kind === 'activity') {
      rows = (await all('SELECT created_at,email,kind,detail FROM hb_activity ORDER BY created_at DESC LIMIT 20000')).map(r => ({ ...r, created_at: iso(r.created_at) }));
      columns = ['created_at', 'email', 'kind', 'detail'];
    } else if (kind === 'changes') {
      rows = (await all('SELECT created_at,actor,target,action,before,after FROM hb_admin_log ORDER BY created_at DESC LIMIT 20000')).map(r => ({ ...r, created_at: iso(r.created_at) }));
      columns = ['created_at', 'actor', 'target', 'action', 'before', 'after'];
    } else if (kind === 'requests') {
      rows = (await all('SELECT created_at,email,name,note,status,handled_at FROM hb_access_requests ORDER BY created_at DESC LIMIT 20000')).map(r => ({ ...r, created_at: iso(r.created_at), handled_at: iso(r.handled_at) }));
      columns = ['created_at', 'email', 'name', 'note', 'status', 'handled_at'];
    } else if (kind === 'daily') {
      rows = (await overview(env, now, new URLSearchParams('days=60'))).series as Record<string, unknown>[];
      columns = ['day', 'seconds', 'viewers', 'sessions', 'pictures'];
    } else throw new ProductError('Choose what to export.', 404);
    await adminLog(env, { actor: auth.user.email, action: 'exported', after: kind }, now);
    return new Response(csv(rows, columns), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="heartbeat-${kind}-${new Date(now).toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  throw new ProductError('This page could not be found.', 404);
}

type Row = Record<string, number | string | null>;
export async function overview(env: ProductEnv, now: number, params: URLSearchParams) {
  const database = db(env), owner = ownerEmail(env);
  // The viewer's time zone offset in minutes (Date#getTimezoneOffset), so days match their calendar.
  const tz = Math.max(-840, Math.min(840, Number(params.get('tz')) || 0)), shift = -tz * 60000;
  const days = Math.max(7, Math.min(60, Number(params.get('days')) || 14));
  const localToday = Math.floor((now + shift) / 86400000) * 86400000 - shift, since = localToday - (days - 1) * 86400000, live = now - 120000;
  const all = async (sql: string, ...values: unknown[]) => (await database.prepare(sql).bind(...values).all<Row>()).results;
  const testers = await all(`WITH people AS (SELECT email,note,invited_at,rhythm_minutes,daily_limit,total_limit FROM hb_invites WHERE email<>? UNION ALL SELECT ?,'You (owner)',0,(SELECT rhythm_minutes FROM hb_invites WHERE email=?),(SELECT daily_limit FROM hb_invites WHERE email=?),(SELECT total_limit FROM hb_invites WHERE email=?) WHERE ?<>'')
    SELECT p.email,p.note,p.invited_at,p.rhythm_minutes,p.daily_limit,p.total_limit,u.id AS user_id,u.created_at AS joined_at,
     (SELECT MAX(authenticated_at) FROM hb_sessions s WHERE s.user_id=u.id) AS last_sign_in,
     (SELECT MAX(last_seen) FROM hb_view_sessions v WHERE v.user_id=u.id) AS last_seen,
     (SELECT COUNT(*) FROM hb_view_sessions v WHERE v.user_id=u.id AND v.seconds>0) AS sessions,
     (SELECT COALESCE(SUM(seconds),0) FROM hb_view_sessions v WHERE v.user_id=u.id) AS seconds,
     (SELECT COALESCE(SUM(seconds),0) FROM hb_view_sessions v WHERE v.user_id=u.id AND v.started_at>=?) AS seconds_today,
     (SELECT COUNT(*) FROM ai_attempts a WHERE a.owner=u.id AND a.art_key IS NOT NULL) AS pictures,
     (SELECT COUNT(*) FROM ai_attempts a WHERE a.owner=u.id AND a.art_key IS NOT NULL AND a.created_at>=?) AS pictures_today,
     (SELECT mood FROM hb_view_sessions v WHERE v.user_id=u.id ORDER BY last_seen DESC LIMIT 1) AS mood,
     (SELECT device FROM hb_view_sessions v WHERE v.user_id=u.id ORDER BY last_seen DESC LIMIT 1) AS device
    FROM people p LEFT JOIN hb_users u ON u.email=p.email ORDER BY last_seen IS NULL, last_seen DESC, p.invited_at DESC`, owner, owner, owner, owner, owner, owner, localToday, localToday);
  const daily = await all(`SELECT CAST((started_at+?)/86400000 AS INTEGER) AS bucket, SUM(seconds) AS seconds, COUNT(DISTINCT user_id) AS viewers, SUM(CASE WHEN seconds>0 THEN 1 ELSE 0 END) AS sessions FROM hb_view_sessions WHERE started_at>=? GROUP BY bucket`, shift, since);
  const pictures = await all(`SELECT CAST((created_at+?)/86400000 AS INTEGER) AS bucket, COUNT(*) AS pictures FROM ai_attempts WHERE art_key IS NOT NULL AND created_at>=? GROUP BY bucket`, shift, since);
  const hourly = await all(`SELECT CAST(((started_at+?)%86400000)/3600000 AS INTEGER) AS hour, SUM(seconds) AS seconds FROM hb_view_sessions WHERE started_at>=? GROUP BY hour`, shift, since);
  const moods = await all(`SELECT mood, SUM(seconds) AS seconds FROM hb_view_sessions WHERE started_at>=? GROUP BY mood ORDER BY seconds DESC`, since);
  const devices = await all(`SELECT device, SUM(seconds) AS seconds, COUNT(*) AS sessions FROM hb_view_sessions WHERE started_at>=? GROUP BY device ORDER BY seconds DESC`, since);
  const liveNow = await all(`SELECT v.id,u.email,v.device,v.mood,v.started_at,v.last_seen,v.seconds FROM hb_view_sessions v JOIN hb_users u ON u.id=v.user_id WHERE v.last_seen>=? ORDER BY v.started_at`, live);
  const sessions = await all(`SELECT v.id,u.email,v.device,v.mood,v.started_at,v.last_seen,v.seconds FROM hb_view_sessions v JOIN hb_users u ON u.id=v.user_id WHERE v.seconds>0 OR v.last_seen>=? ORDER BY v.last_seen DESC LIMIT 40`, live);
  const jobs = await all(`SELECT j.id,u.email,j.status,j.error_category AS reason,j.created_at,j.updated_at FROM hb_jobs j JOIN hb_users u ON u.id=j.owner ORDER BY j.created_at DESC LIMIT 30`);
  const activity = await all(`SELECT kind,email,detail,created_at FROM hb_activity ORDER BY created_at DESC LIMIT 60`);
  const requests = await all(`SELECT id,email,name,note,status,created_at,handled_at FROM hb_access_requests ORDER BY status<>'new', created_at DESC LIMIT 100`);
  const changes = await all(`SELECT actor,target,action,before,after,created_at FROM hb_admin_log ORDER BY created_at DESC LIMIT 200`);
  const utcDay = new Date(now).toISOString().slice(0, 10);
  const spend = await all(`SELECT day, spent_micros, reserved_micros, attempts FROM hb_operating_days WHERE day>=? ORDER BY day`, new Date(since).toISOString().slice(0, 10));
  const today = spend.find(row => row.day === utcDay);
  const series = Array.from({ length: days }, (_, index) => {
    const day = Math.floor((since + shift) / 86400000) + index, d = daily.find(row => Number(row.bucket) === day), p = pictures.find(row => Number(row.bucket) === day);
    return { day: new Date(day * 86400000).toISOString().slice(0, 10), seconds: Number(d?.seconds || 0), viewers: Number(d?.viewers || 0), sessions: Number(d?.sessions || 0), pictures: Number(p?.pictures || 0) };
  });
  return {
    generatedAt: now, days, seats: betaSeats(env), beta: betaMode(env), cadenceMinutes: betaCadence(env) / 60000, dailyPicturesPerTester: betaDailyPictures(env),
    budget: { capMicros: Number(env.HEARTBEAT_DAILY_BUDGET_MICROS) || 0, spentMicros: Number(today?.spent_micros || 0), reservedMicros: Number(today?.reserved_micros || 0), attempts: Number(today?.attempts || 0), imageEstimateMicros: Number(env.HEARTBEAT_IMAGE_ESTIMATE_MICROS) || 0, painter: env.HEARTBEAT_IMAGE_PROVIDER || 'cloudflare', history: spend },
    testers, series, hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, seconds: Number(hourly.find(row => Number(row.hour) === hour)?.seconds || 0) })),
    moods, devices, liveNow, sessions, activity, jobs, requests, changes,
  };
}

