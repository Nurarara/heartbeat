import {acknowledgeDisplay} from '../product/profiles.ts';
import { cloudflareProvider, ProviderFailure } from './cloudflare.ts';
import { contextPlace, collectContext } from '../context.ts';
import { parseStoryMemory, planMoment } from '../ambient-director.ts';
import { creativePacket, type CreativeProposal } from '../creative.ts';
import { THEME_LIBRARY } from '../creative-library.ts';
import type { Context, Place } from '../world.ts';
import type { AICandidate, AIResult } from './types.ts';
import { localClock } from '../ambient.ts';
import { weatherCue } from '../weather-mood.ts';
import { accountAccess, type AccountAccess } from '../product/access.ts';

export type AIEnvironment = {
  DB?: D1Database; BUCKET?: R2Bucket; HEARTBEAT_AI_ENABLED?: string;
  CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_API_TOKEN?: string; HEARTBEAT_AI_ACCESS_KEY?: string;
  HEARTBEAT_APP_ORIGIN?: string; HEARTBEAT_AI_DAILY_LIMIT?: string;
  HEARTBEAT_DIRECTOR_MODEL?: string; HEARTBEAT_IMAGE_MODEL?: string;
  HEARTBEAT_APP_MODE?: string;
};
type Attempt = { id: string; owner: string; request_id: string; claim: string; day: string; status: string; location_key: string; created_at: number; candidate: string | null; art_key: string | null; error: string | null };
type Session = { id: string; expires: number; claim: string | null; lease_until: number; next_at: number; current_id: string | null; current_at: number; account?: AccountAccess };
type Dependencies = { now?: () => number; provider?: typeof cloudflareProvider; context?: (place: Place) => Promise<Context>; account?: (request:Request) => Promise<AccountAccess|null> };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const COOLDOWN = 600000, LEASE = 240000;
const response = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
class RequestFailure extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
const keyOf = (place: Place) => `${place.latitude},${place.longitude}:${place.timezone}`;
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
async function signature(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))));
}
async function equal(a: string, b: string) {
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [x, y] = await Promise.all([digest(a), digest(b)]); let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
async function body(request: Request, maximum: number): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader(); if (!reader) throw new RequestFailure('Request body missing.');
  let text = '', size = 0; const decoder = new TextDecoder();
  try {
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > maximum) { await reader.cancel(); throw new RequestFailure('Request too large.', 413); } text += decoder.decode(item.value, { stream: true }); }
    const value: unknown = JSON.parse(text + decoder.decode());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid JSON');
    return value as Record<string, unknown>;
  } catch (error) { if (error instanceof RequestFailure) throw error; throw new RequestFailure('Invalid request.'); }
  finally { reader.releaseLock(); }
}

export function aiService(env: AIEnvironment, dependencies: Dependencies = {}) {
  const now = dependencies.now || Date.now, providerFactory = dependencies.provider || cloudflareProvider, observe = dependencies.context || collectContext;
  const limit = Math.max(1, Math.min(env.HEARTBEAT_APP_MODE ? 100000 : 24, Number.parseInt(env.HEARTBEAT_AI_DAILY_LIMIT || '8', 10) || 8));
  const configured = env.HEARTBEAT_AI_ENABLED === 'true' && !!env.DB && !!env.BUCKET && /^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || '') && !!env.CLOUDFLARE_API_TOKEN && (!!env.HEARTBEAT_APP_MODE || (env.HEARTBEAT_AI_ACCESS_KEY?.length || 0) >= 32);
  const database = () => { if (!env.DB) throw new RequestFailure('AI storage is not configured.', 503); return env.DB; };
  function origin(request: Request) {
    const url = new URL(request.url);
    const trusted = env.HEARTBEAT_APP_ORIGIN || (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? url.origin : '');
    let matches = url.origin === trusted;
    try {
      const configured = new URL(trusted), loopback = ['localhost', '127.0.0.1', '[::1]'];
      matches ||= url.protocol === 'http:' && configured.protocol === 'http:' && url.port === configured.port && loopback.includes(url.hostname) && loopback.includes(configured.hostname);
    } catch { /* An invalid configured origin authorizes no alternative. */ }
    if (!trusted || request.headers.get('origin') !== url.origin || !matches) throw new RequestFailure('Connection blocked: open Heartbeat at its configured address, then connect again.', 403);
  }
  async function owner(request: Request): Promise<Session | null> {
    const account = await (dependencies.account ? dependencies.account(request) : accountAccess(request,env,now()));
    if(account) {
      const stored=await database().prepare('SELECT * FROM ai_sessions WHERE id=?').bind(account.userId).first<Session>();
      return stored ? {...stored,expires:account.expires,account} : {id:account.userId,expires:account.expires,claim:null,lease_until:0,next_at:0,current_id:null,current_at:0,account};
    }
    if(env.HEARTBEAT_APP_MODE && !(env.HEARTBEAT_APP_MODE==='development' && ['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname) && new URL(request.url).protocol==='http:')) return null;
    const raw = request.headers.get('cookie')?.match(/(?:^|;\s*)heartbeat_ai=([^;]+)/)?.[1] || '';
    const [id, expiry, signed] = raw.split('.');
    if (!UUID.test(id || '') || !/^\d{13}$/.test(expiry || '') || !signed || !env.HEARTBEAT_AI_ACCESS_KEY) return null;
    const expires = Number(expiry); if (expires <= now() || expires > now() + 31 * 86400000) return null;
    if (!await equal(signed, await signature(env.HEARTBEAT_AI_ACCESS_KEY, `${id}.${expiry}`))) return null;
    return database().prepare('SELECT * FROM ai_sessions WHERE id = ? AND expires > ?').bind(id, now()).first<Session>();
  }
  async function requireOwner(request: Request) { const session = await owner(request); if (!session) throw new RequestFailure('Unlock this browser’s AI session first.', 401); return session; }
  async function usage() { return (await database().prepare('SELECT COUNT(*) AS used FROM ai_attempts WHERE day = ?').bind(dayOf(now())).first<{ used: number }>())?.used || 0; }
  function result(attempt: Attempt, session: Session): AIResult {
    if (attempt.status === 'ready' || attempt.status === 'displayed') return { status: 'ready', candidate: JSON.parse(attempt.candidate!), nextAt: session.next_at };
    if (attempt.status === 'held') return { status: 'held', nextAt: Math.max(session.next_at, attempt.created_at + 3600000) };
    if (attempt.status === 'reserved' || attempt.status === 'directing' || attempt.status === 'generating') return { status: now() - attempt.created_at < LEASE ? 'pending' : 'failed', nextAt: session.next_at, reason: 'The previous attempt will not be charged again automatically.' };
    return { status: attempt.status === 'expired' ? 'expired' : 'failed', nextAt: session.next_at, reason: attempt.error || 'Preparation did not complete. The current picture is kept.' };
  }
  async function finish(session: Session, claim: string) { await database().prepare('UPDATE ai_sessions SET claim = NULL, lease_until = 0 WHERE id = ? AND claim = ?').bind(session.id, claim).run(); }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url), path = url.pathname.replace(/^\/api\/ai\/?/, '');
    try {
      if (request.method === 'GET' && path === 'status') {
        if (!configured) return response({ configured: false, authorized: false, available: false, reason: 'AI is off until server setup is complete. Free artwork remains available.' });
        // A missing migration is reported without leaking database/provider details.
        const session = await owner(request); await database().prepare('SELECT id FROM ai_attempts LIMIT 1').first();
        if (!session) return response({ configured: true, authorized: false, available: false, account:!!env.HEARTBEAT_APP_MODE, reason:env.HEARTBEAT_APP_MODE?'Sign in to your Heartbeat account to create pictures.':'Unlock this browser with the local AI access key.' });
        const used = await usage();
        const capacityResetAt=used>=limit?Date.parse(`${dayOf(now())}T00:00:00Z`)+86400000:undefined;
        if(session.account) { const a=session.account; return response({configured:true,authorized:true,available:a.eligible&&used<limit,reason:!a.eligible?a.reason:used>=limit?'Daily generation capacity is used. New AI pictures resume after the reset; existing artwork stays available.':a.reason,dailyLimit:a.allowance,used:a.used,remaining:Math.max(0,Math.min(a.allowance-a.used,limit-used)),nextAt:session.next_at,plan:a.plan,account:true,...(a.eligible&&capacityResetAt?{capacityResetAt}:{})}); }
        return response({ configured: true, authorized: true, available: used < limit, reason: used >= limit ? 'Today’s shared attempt allowance is used. Current artwork is kept.' : 'AI is connected for this browser.', dailyLimit: limit, used, remaining: Math.max(0, limit - used), nextAt: session.next_at });
      }
      const delivery=request.method==='GET'&&(path.startsWith('art/')||path==='attempt')||request.method==='POST'&&path==='display';
      if (!configured&&!delivery) return response({ error: 'AI setup is not complete. Free artwork is available.' }, 503);
      if (request.method !== 'GET') origin(request);
      if (path === 'session' && request.method === 'POST') {
        if(env.HEARTBEAT_APP_MODE==='production'||!env.HEARTBEAT_AI_ACCESS_KEY) throw new RequestFailure('Sign in with your Heartbeat account.',403);
        const input = await body(request, 4096), slot = new Date(now()).toISOString().slice(0, 16);
        const allowed = await database().prepare('INSERT INTO ai_auth (slot, used) VALUES (?, 1) ON CONFLICT(slot) DO UPDATE SET used = used + 1 WHERE used < 10 RETURNING used').bind(slot).first();
        if (!allowed) throw new RequestFailure('Please wait a minute before trying the access key again.', 429);
        if (typeof input.accessKey !== 'string' || !await equal(input.accessKey, env.HEARTBEAT_AI_ACCESS_KEY!)) throw new RequestFailure('The AI access key did not match.', 401);
        const existing = await owner(request), id = existing?.id || crypto.randomUUID(), expires = now() + 30 * 86400000;
        await database().prepare('INSERT INTO ai_sessions(id, expires) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET expires = excluded.expires').bind(id, expires).run();
        await database().prepare('DELETE FROM ai_auth WHERE slot < ?').bind(new Date(now() - 5 * 60000).toISOString().slice(0, 16)).run();
        const token = `${id}.${expires}.${await signature(env.HEARTBEAT_AI_ACCESS_KEY!, `${id}.${expires}`)}`;
        return response({ connected: true }, 200, { 'Set-Cookie': `heartbeat_ai=${token}; Path=/api/ai; HttpOnly; SameSite=Strict; Max-Age=2592000${url.protocol === 'https:' ? '; Secure' : ''}` });
      }
      const session = await requireOwner(request);
      if (path.startsWith('art/') && request.method === 'GET') {
        const id = path.slice(4); if (!UUID.test(id)) throw new RequestFailure('Artwork not found.', 404);
        const attempt = await database().prepare("SELECT * FROM ai_attempts WHERE id = ? AND owner = ? AND status IN ('ready', 'displayed')").bind(id, session.id).first<Attempt>();
        if (!attempt?.art_key) throw new RequestFailure('Artwork not found.', 404);
        if (session.account && !await database().prepare("SELECT id FROM hb_assets WHERE id=? AND owner=? AND art_key=? AND state='ready'").bind(id, session.id, attempt.art_key).first()) throw new RequestFailure('Artwork not found.', 404);
        const object = await env.BUCKET!.get(attempt.art_key); if (!object) throw new RequestFailure('Artwork not found.', 404);
        return new Response(object.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
      if (path === 'attempt' && request.method === 'GET') {
        const requestId = url.searchParams.get('requestId') || ''; if (!UUID.test(requestId)) throw new RequestFailure('Invalid request ID.');
        const attempt = await database().prepare('SELECT * FROM ai_attempts WHERE owner = ? AND request_id = ?').bind(session.id, requestId).first<Attempt>();
        if (!attempt) throw new RequestFailure('Attempt not found.', 404);
        return response(result(attempt, session));
      }
      if (path === 'display' && request.method === 'POST' && session.account) return response(await acknowledgeDisplay(env,session.id,await body(request,2048),now()));
      if (path === 'display' && request.method === 'POST') {
        const input = await body(request, 512); if (typeof input.id !== 'string' || !UUID.test(input.id)) throw new RequestFailure('Invalid artwork ID.');
        await database().batch([
          database().prepare("UPDATE ai_attempts SET status = 'displayed' WHERE id = ? AND owner = ? AND status = 'ready'").bind(input.id, session.id),
          database().prepare("UPDATE ai_sessions SET current_id = ?, current_at = (SELECT created_at FROM ai_attempts WHERE id = ?) WHERE id = ? AND current_at <= (SELECT created_at FROM ai_attempts WHERE id = ?) AND EXISTS(SELECT 1 FROM ai_attempts WHERE id = ? AND owner = ? AND status = 'displayed')").bind(input.id, input.id, session.id, input.id, input.id, session.id),
        ]);
        const displayed = await database().prepare("SELECT id FROM ai_attempts WHERE id = ? AND owner = ? AND status = 'displayed'").bind(input.id, session.id).first();
        if (!displayed) throw new RequestFailure('Artwork is not ready.', 409);
        return response({ displayed: true });
      }
      if (path !== 'prepare' || request.method !== 'POST') throw new RequestFailure('Not found.', 404);
      if(env.HEARTBEAT_APP_MODE)throw new RequestFailure('Use account background generation.',403);
      const input = await body(request, 160000);
      if (typeof input.requestId !== 'string' || !UUID.test(input.requestId) || !input.location || typeof input.location !== 'object') throw new RequestFailure('Choose a city and retry.');
      const location = input.location as Record<string, unknown>;
      const place = contextPlace(new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), timezone: String(location.timezone) }))!;
      const prior = await database().prepare('SELECT * FROM ai_attempts WHERE owner = ? AND request_id = ?').bind(session.id, input.requestId).first<Attempt>();
      if (prior) return response(result(prior, session));
      if(session.account&&!session.account.eligible) return response({status:'held',reason:session.account.reason,nextAt:now()+600000},429);
      const startedAt = now(), id = crypto.randomUUID(), claim = crypto.randomUUID(), day = dayOf(startedAt);
      const cooldown=session.account?.cadence||COOLDOWN;
      const reservation = await database().batch([
        database().prepare('UPDATE ai_sessions SET claim = ?, lease_until = ?, next_at = ? WHERE id = ? AND lease_until <= ? AND next_at <= ? AND NOT EXISTS(SELECT 1 FROM ai_attempts WHERE owner = ? AND request_id = ?)').bind(claim, startedAt + LEASE, startedAt + cooldown, session.id, startedAt, startedAt, session.id, input.requestId),
        database().prepare("INSERT OR IGNORE INTO ai_attempts(id, owner, request_id, claim, day, status, location_key, created_at) SELECT ?, ?, ?, ?, ?, 'reserved', ?, ? WHERE EXISTS(SELECT 1 FROM ai_sessions WHERE id = ? AND claim = ?) AND (SELECT COUNT(*) FROM ai_attempts WHERE day = ?) < ? AND (SELECT COUNT(*) FROM ai_attempts WHERE owner=? AND created_at>=? AND created_at<? AND status NOT IN ('failed','held') AND (status NOT IN ('reserved','directing','generating') OR created_at>=?)) < ?").bind(id, session.id, input.requestId, claim, day, keyOf(place), startedAt, session.id, claim, day, limit,session.id,session.account?.periodStart||0,session.account?.periodEnd||8640000000000000,startedAt-LEASE,session.account?.allowance||Number.MAX_SAFE_INTEGER),
      ]);
      const attempt = await database().prepare('SELECT * FROM ai_attempts WHERE owner = ? AND request_id = ?').bind(session.id, input.requestId).first<Attempt>();
      if (reservation[1].meta.changes !== 1 || attempt?.claim !== claim) {
        await finish(session, claim);
        if (attempt) return response(result(attempt, session));
        const used = await usage(), nextAt = used >= limit ? Date.parse(`${day}T00:00:00Z`) + 86400000 : Math.max(session.next_at, startedAt + COOLDOWN);
        return response({ status: 'held', nextAt, reason: used >= limit ? 'Daily attempt allowance reached.' : 'Another request or the cooldown is active.' }, 429);
      }
      // Reserving before any provider call keeps crashes, HOLDs and failures spent.
      try {
        const context = await observe(place), at = now();
        if (at - startedAt > 30000) throw new Error('Context collection timed out.');
        const memory = typeof input.memory === 'string' ? parseStoryMemory(input.memory, place, at) : null;
        const baseline = planMoment(place, context, at, memory, id.charCodeAt(0) + at, { force: true, festive: input.festive === true }).direction;
        const packet = creativePacket({ phase: baseline.phase, season: baseline.season, temperature: baseline.brief.temperature, weekday: baseline.brief.weekday, festive: baseline.recipe.festive, localDate: baseline.recipe.date, localTime: localClock(place, at).time, weather: weatherCue(context, at), preferredStyle: ['anime','watercolour','cinematic','pencil','photographic'].includes(String(input.style))?String(input.style):undefined }, memory?.creative, at, at, memory?.history.map(item => item.direction.scene) || [], memory?.history.map(item => ({ title: item.direction.artwork?.title || item.direction.scene, summary: item.direction.artwork?.proposal.prompt || item.direction.brief.activity, phase: item.direction.phase })) || []);
        const provider = providerFactory({ accountId: env.CLOUDFLARE_ACCOUNT_ID!, apiToken: env.CLOUDFLARE_API_TOKEN!, directorModel: env.HEARTBEAT_DIRECTOR_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', imageModel: env.HEARTBEAT_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell' });
        await database().prepare("UPDATE ai_attempts SET status = 'directing' WHERE id = ? AND claim = ?").bind(id, claim).run();
        const signal = AbortSignal.timeout(180000);
        const directed = await provider.direct(packet, { signal, mustReimagine: input.force === true || !memory?.history.length || baseline.phase === 'night' && memory.history.at(-1)?.direction.phase !== 'night' });
        if (directed.action === 'HOLD') {
          await database().prepare("UPDATE ai_attempts SET status = 'held' WHERE id = ? AND claim = ?").bind(id, claim).run();
          await database().prepare('UPDATE ai_sessions SET next_at = MAX(next_at, ?) WHERE id = ? AND claim = ?').bind(startedAt + 3600000, session.id, claim).run();
          await finish(session, claim);
          return response({ status: 'held', nextAt: startedAt + 3600000 });
        }
        await database().prepare("UPDATE ai_attempts SET status = 'generating' WHERE id = ? AND claim = ?").bind(id, claim).run();
        const image = await provider.generate(directed, packet, signal);
        if (now() - startedAt >= LEASE || signal.aborted) throw new Error('Preparation lease expired.');
        const imageHash = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', image.bytes as BufferSource)));
        const repeated = await database().prepare("SELECT id FROM ai_attempts WHERE owner = ? AND image_hash = ? AND status IN ('ready','displayed') LIMIT 1").bind(session.id, imageHash).first();
        if (repeated) throw new Error('Duplicate image rejected.');
        const themes = directed.themeIds.map(themeId => THEME_LIBRARY.find(theme => theme.id === themeId)!);
        const invented = [...new Set(`${directed.title} ${directed.prompt}`.toLowerCase().match(/[a-z]{4,}/g) || [])].sort().slice(0, 18).join('-').slice(0, 320);
        const fingerprint = ['place', 'subject', 'activity', 'viewpoint'].flatMap(category => themes.filter(theme => theme.category === category).map(theme => theme.id).sort()).join('|') || `invented-${invented || id}`;
        const proposal: CreativeProposal = { ...packet.inspiration[0], source: 'ai-director', id: `idea-${id}`, fingerprint, title: directed.title, prompt: directed.prompt, themes: themes.map(({ id: themeId, label, category }) => ({ id: themeId, label, category })), lighting: directed.lighting };
        const artKey = `heartbeat-ai/${session.id}/${id}.jpg`;
        const candidate: AICandidate = { id, requestId: input.requestId, locationKey: keyOf(place), createdAt: at, direction: { ...baseline, id: `generated-${id}`, reason: directed.reason, artwork: { attemptId: id, url: `/api/ai/art/${id}`, title: directed.title, proposal } } };
        await env.BUCKET!.put(artKey, image.bytes, { httpMetadata: { contentType: 'image/jpeg' } });
        const saved = await database().prepare("UPDATE ai_attempts SET status = 'ready', candidate = ?, art_key = ?, image_hash = ? WHERE id = ? AND claim = ? AND EXISTS(SELECT 1 FROM ai_sessions WHERE id = ? AND claim = ? AND lease_until > ?)").bind(JSON.stringify(candidate), artKey, imageHash, id, claim, session.id, claim, now()).run();
        if (saved.meta.changes !== 1) { await env.BUCKET!.delete(artKey); throw new Error('Preparation lease expired.'); }
        try { await finish(session, claim); } catch { /* Ready is durable; an expired lease can recover later. */ }
        try {
          const old = await database().prepare("SELECT id, art_key FROM ai_attempts WHERE owner = ? AND art_key IS NOT NULL AND id NOT IN (SELECT attempt_id FROM hb_likes WHERE user_id=ai_attempts.owner) AND id != COALESCE((SELECT current_id FROM ai_sessions WHERE id = ?), '') ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET 8").bind(session.id, session.id).all<{ id: string; art_key: string }>();
          const aged = await database().prepare("SELECT a.id, a.art_key FROM ai_attempts a JOIN ai_sessions s ON s.id = a.owner WHERE a.art_key IS NOT NULL AND a.id NOT IN (SELECT attempt_id FROM hb_likes WHERE user_id=a.owner) AND a.created_at < ? AND (s.expires <= ? OR a.id != COALESCE(s.current_id,'')) LIMIT 32").bind(now() - 7 * 86400000, now()).all<{ id: string; art_key: string }>();
          for (const item of [...old.results, ...aged.results]) { await env.BUCKET!.delete(item.art_key); await database().prepare("UPDATE ai_attempts SET art_key = NULL, status = 'expired' WHERE id = ?").bind(item.id).run(); }
        } catch { /* Retention is best effort and cannot turn a ready picture into failure. */ }
        return response({ status: 'ready', candidate, nextAt: startedAt + cooldown });
      } catch (error) {
        // Numeric provider diagnostics only: never log credentials, prompts or response bodies.
        if (error instanceof ProviderFailure) console.warn('Heartbeat provider failure', { kind: error.kind, status: error.status, code: error.code, hints: error.hints });
        const reason = error instanceof ProviderFailure && error.hints?.includes('night-light') ? 'The picture was unsuitable for night. Your current artwork is kept.' : error instanceof ProviderFailure && error.kind === 'quota' ? 'The provider allowance is exhausted.' : error instanceof ProviderFailure && error.kind === 'configuration' ? 'The provider configuration needs checking.' : 'The picture could not be prepared. Your current artwork is kept.';
        await database().prepare("UPDATE ai_attempts SET status = 'failed', error = ? WHERE id = ? AND claim = ? AND status NOT IN ('ready','displayed')").bind(reason, id, claim).run();
        await finish(session, claim);
        return response({ status: 'failed', reason, nextAt: startedAt + COOLDOWN });
      }
    } catch (error) {
      return response({ error: error instanceof RequestFailure ? error.message : 'AI storage/setup is unavailable. Your current artwork is kept.' }, error instanceof RequestFailure ? error.status : 503);
    }
  }
  return { handle };
}
