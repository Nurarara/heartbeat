// The API the installed apps (Windows screensaver, Android, later iPhone) use. See docs/api-for-apps.md.
// Apps hold a long-lived device key sent as `Authorization: Bearer <key>` instead of a browser cookie,
// so these routes need no Origin check. The server stays the single brain: apps only show what it sends.
import type { User } from './auth.ts';
import { db, hash, json, ProductError, randomToken, rate, readJSON } from './core.ts';
import { profileFor, acknowledgeDisplay, updatePreferences } from './profiles.ts';
import { generation, type JobEnv } from './jobs.ts';
import { betaMode, codeLogin, invited, isOwner, recordPresence, sendCode } from './beta.ts';
import { MOOD_IDS, MOODS, parseMood } from '../moods.ts';
import { withMood } from '../ambient.ts';
import { createWeatherAdapter } from '../server/weather.ts';

export const APP_PLATFORMS = ['windows', 'android', 'mac', 'ios'] as const;
const DEVICE_DAYS = 365, CHECK_SECONDS = 60;
type Device = { id: string; owner: string; expires: number; surface_id: string | null; credential_epoch: number; name: string };

function cleanName(value: unknown) {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) : '';
  return name || 'My device';
}

async function deviceFor(request: Request, env: JobEnv, now: number) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) throw new ProductError('Sign in again.', 401);
  const device = await db(env).prepare("SELECT id,owner,expires,surface_id,credential_epoch,name FROM hb_devices WHERE secret_hash=? AND expires>? AND owner IS NOT NULL AND code_hash LIKE 'app-sign-in:%'").bind(await hash(token), now).first<Device>();
  if (!device) throw new ProductError('Sign in again.', 401);
  const user = await db(env).prepare("SELECT * FROM hb_users WHERE id=? AND lifecycle='active' AND credential_epoch=?").bind(device.owner, device.credential_epoch).first<User>();
  if (!user) throw new ProductError('Sign in again.', 401);
  if (betaMode(env) && !await invited(env, user.email)) throw new ProductError('This account is no longer on the test invite list.', 401);
  return { device, user };
}

/** The platform word in a device name, e.g. "Windows · LAPTOP-2KH" → "windows". */
const platformOf = (device: Device) => device.name.split(' · ')[0].toLowerCase();

export async function appRoute(request: Request, env: JobEnv, path: string, now: number, fetcher: typeof fetch): Promise<Response> {
  const route = path.slice('app/'.length);

  // Sign-in, step 1: the same emailed code as the website (invite list and limits apply).
  if (route === 'code/send' && request.method === 'POST') return sendCode(request, env, now, fetcher);

  // Sign-in, step 2: the code becomes a device key the app keeps.
  if (route === 'code/verify' && request.method === 'POST') {
    const input = await readJSON(request, 1024);
    const platform = typeof input.platform === 'string' && (APP_PLATFORMS as readonly string[]).includes(input.platform) ? input.platform : null;
    if (!platform) throw new ProductError('Unknown app platform.');
    const label = `${platform[0].toUpperCase()}${platform.slice(1)} · ${cleanName(input.deviceName)}`;
    const user = await codeLogin(request, env, input, now, label);
    const token = randomToken(), id = crypto.randomUUID();
    await db(env).prepare('INSERT INTO hb_devices(id,owner,secret_hash,code_hash,expires,created_at,name,credential_epoch) VALUES (?,?,?,?,?,?,?,?)')
      // code_hash is unique per row; app keys mark it with their own id.
      .bind(id, user.id, await hash(token), `app-sign-in:${id}`, now + DEVICE_DAYS * 86400000, now, label, user.credential_epoch || 0).run();
    return json({ token, deviceId: id, email: user.email, owner: isOwner(env, user.email) });
  }

  const { device, user } = await deviceFor(request, env, now);

  // What should this screen show now? With showing=1 the screen is visible, so a due picture is started.
  if (route === 'state' && request.method === 'GET') {
    await rate(env, `app-state:${device.id}`, now, 20, 60000);
    const url = new URL(request.url), showing = url.searchParams.get('showing') === '1';
    const profile = await profileFor(env, user.id, {}, now);
    if (!profile.preferences) return json({ ready: false, reason: 'Choose your city in your studio first.', studio: '/app', checkAfterSeconds: CHECK_SECONDS });
    const preferences = profile.preferences;
    let making = false, notice = '';
    if (showing) {
      try {
        // One request key per 10 minutes, so repeated checks never start a second picture.
        const key = await hash(`${user.id}:app:${Math.floor(now / 600000)}`), requestId = `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20, 32)}`;
        const started = await (await generation(request, env, user, { requestId, surfaceId: profile.surfaceId, force: !profile.memory }, now)).json() as { status?: string; reason?: string };
        making = started.status === 'pending';
        if (started.status === 'failed' && started.reason) notice = started.reason;
      } catch (error) { if (error instanceof ProductError) notice = error.message; else throw error; }
    }
    const latest = await db(env).prepare("SELECT a.id,a.status,a.candidate,a.created_at FROM ai_attempts a JOIN hb_assets m ON m.id=a.id AND m.owner=a.owner AND m.art_key=a.art_key AND m.state='ready' WHERE a.owner=? AND a.art_key IS NOT NULL AND a.status IN ('ready','displayed') ORDER BY a.created_at DESC LIMIT 1").bind(user.id).first<{ id: string; status: string; candidate: string; created_at: number }>();
    // A visible screen is about to show the newest picture: record it, so the next scene builds on it.
    if (latest && showing && latest.status === 'ready') { try { await acknowledgeDisplay(env, user.id, { id: latest.id, surfaceId: profile.surfaceId }, now); } catch { /* shown either way */ } }
    let temperature: number | null = null;
    try { const context = await createWeatherAdapter(env, { now: () => now }).collect(preferences.location); temperature = typeof context.temperature === 'number' ? Math.round(preferences.unit === 'f' ? context.temperature * 9 / 5 + 32 : context.temperature) : null; } catch { /* the picture matters more than the number */ }
    const candidate = latest ? JSON.parse(latest.candidate) : null;
    return json({
      ready: true, checkAfterSeconds: CHECK_SECONDS, making, notice,
      picture: latest ? { id: latest.id, title: candidate?.direction?.artwork?.title || '', url: `/api/product/app/art/${latest.id}`, createdAt: latest.created_at } : null,
      city: preferences.location.name, timezone: preferences.location.timezone, temperature, unit: preferences.unit,
      mood: parseMood(preferences.mood), moods: MOOD_IDS.map(id => ({ id, label: MOODS[id].label, colour: MOODS[id].colour })),
      studio: '/app', email: user.email,
    });
  }

  // The picture itself, only to its owner's devices.
  if (route.startsWith('art/') && request.method === 'GET') {
    const id = route.slice('art/'.length); if (!/^[a-f0-9-]{36}$/.test(id)) throw new ProductError('Picture not found.', 404);
    const row = await db(env).prepare("SELECT a.art_key FROM ai_attempts a JOIN hb_assets m ON m.id=a.id AND m.owner=a.owner AND m.art_key=a.art_key AND m.state='ready' WHERE a.id=? AND a.owner=? AND a.art_key IS NOT NULL AND a.status IN ('ready','displayed')").bind(id, user.id).first<{ art_key: string }>();
    const art = row ? await env.BUCKET?.get(row.art_key) : null; if (!art) throw new ProductError('Picture not found.', 404);
    return new Response(art.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' } });
  }

  // Change the mood from the app; the next picture follows it, exactly like the website.
  if (route === 'mood' && request.method === 'POST') {
    const mood = (await readJSON(request, 256)).mood;
    if (typeof mood !== 'string' || !(MOOD_IDS as readonly string[]).includes(mood)) throw new ProductError('Choose a valid mood.');
    const profile = await profileFor(env, user.id, {}, now); if (!profile.preferences) throw new ProductError('Choose your city in your studio first.', 409);
    await updatePreferences(env, user.id, { preferences: withMood(profile.preferences, parseMood(mood)), expectedVersion: profile.version }, now);
    return json({ mood });
  }

  // "Still showing", once a minute while the screensaver (or wallpaper) is visible, for the owner's dashboard.
  if (route === 'presence' && request.method === 'POST') {
    const input = await readJSON(request, 512);
    if (typeof input.session !== 'string' || !/^[a-f0-9-]{36}$/.test(input.session)) throw new ProductError('Invalid screen session.');
    await rate(env, `presence:${user.id}`, now, 30, 60000);
    const surface = input.surface === 'wallpaper' ? 'wallpaper' : input.surface === 'lockscreen' ? 'lock screen' : 'screensaver';
    const profile = await profileFor(env, user.id, {}, now);
    return json(await recordPresence(env, user, input.session, parseMood(profile.preferences?.mood), `${platformOf(device)} ${surface}`, now));
  }

  if (route === 'signout' && request.method === 'POST') {
    await db(env).prepare('DELETE FROM hb_devices WHERE id=?').bind(device.id).run();
    return json({ signedOut: true });
  }
  throw new ProductError('This page could not be found.', 404);
}
