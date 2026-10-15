import { collectContext } from '@/lib/context';
import { interpretPulse, locationKey } from '@/lib/pulse';
import { db, decode, failure, guard, json, row } from '@/lib/server';
import type { Context } from '@/lib/world';

const codes = new Set([0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
export async function POST(request: Request) {
  try {
    guard(request); const r = await row(request); if (!r) return json({ error:'Create your world first.' },400);
    const world = decode(r); const input = await request.json() as any; const now = Date.now();
    if (input.locationKey !== locationKey(world.profile)) return json({ error:'The location changed. Refresh this heartbeat.' },409);
    let context: Context | null = null;
    // Browser-collected weather is a fallback for the same user's world only.
    // It never authorizes generation or replaces server-fetched context for paid calls.
    if (input.context != null) {
      const c = input.context;
      if (!Number.isFinite(c.temperature) || c.temperature < -90 || c.temperature > 65 || !Number.isFinite(c.observedAt) || c.observedAt > now + 300000 || typeof c.isDay !== 'boolean' || !codes.has(c.weatherCode)) return json({error:'Invalid environmental observation.'},400);
      const solar = (s: unknown) => typeof s === 'string' && Number.isFinite(Date.parse(s)) ? s : undefined;
      context = { temperature:c.temperature, observedAt:c.observedAt, fetchedAt:now, weatherCode:c.weatherCode, isDay:c.isDay, sunrise:solar(c.sunrise), sunset:solar(c.sunset), stale:now-c.observedAt>5400000 };
    } else { try { context = await collectContext(world.profile.location); } catch {} }
    const pulse = interpretPulse(world.profile, context, now, world.pulse || null);
    const result = await db().prepare('UPDATE worlds SET pulse = ? WHERE id = ? AND version = ?').bind(JSON.stringify(pulse),r.id,world.version).run();
    if (!result.meta.changes) return json({error:'The world changed during this heartbeat. Try again.'},409);
    return json({pulse});
  } catch(e) { return failure(e); }
}
