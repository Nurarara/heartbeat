import { DEFAULT_PROFILE } from './world.ts';
import type { Context, Place } from './world.ts';
import { localPhase } from './pulse.ts';

export type AmbientPreferences = {
  version: 1;
  location: Place;
  seed: number;
  unit: 'c' | 'f';
  reducedMotion: boolean;
  festiveTouches?: boolean;
  style?: 'surprise'|'anime'|'watercolour'|'cinematic'|'pencil'|'photographic';
};

type AmbientScene = 'room' | 'city' | 'cosmos';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/** Read a deliberately small, versioned local-storage record; never trust stored JSON. */
export function parsePreferences(raw: string | null): AmbientPreferences | null {
  if (!raw || raw.length > 4096) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data) || data.version !== 1 || !record(data.location)) return null;
    const p = data.location;
    const name = boundedString(p.name, 100);
    const country = boundedString(p.country, 100);
    const timezone = boundedString(p.timezone, 100);
    const admin1 = p.admin1 === undefined ? undefined : boundedString(p.admin1, 120);
    if (!name || !country || !timezone || admin1 === null) return null;
    if (typeof p.latitude !== 'number' || !Number.isFinite(p.latitude) || p.latitude < -90 || p.latitude > 90) return null;
    if (typeof p.longitude !== 'number' || !Number.isFinite(p.longitude) || p.longitude < -180 || p.longitude > 180) return null;
    // Intl rejects unknown IANA names. Reject offset identifiers as they are not a city's zone.
    if (/^[+-]/.test(timezone)) return null;
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(0);
    if (typeof data.seed !== 'number' || !Number.isInteger(data.seed) || data.seed < 1 || data.seed > 0xffffffff) return null;
    if ((data.unit !== 'c' && data.unit !== 'f') || typeof data.reducedMotion !== 'boolean') return null;
    if (data.festiveTouches !== undefined && typeof data.festiveTouches !== 'boolean') return null;
    if (data.style !== undefined && !['surprise','anime','watercolour','cinematic','pencil','photographic'].includes(String(data.style))) return null;
    const location: Place = { name, country, timezone, latitude: p.latitude, longitude: p.longitude };
    if (admin1 !== undefined) location.admin1 = admin1;
    return { version: 1, location, seed: data.seed, unit: data.unit, reducedMotion: data.reducedMotion, ...(typeof data.festiveTouches === 'boolean' ? { festiveTouches: data.festiveTouches } : {}),...(data.style?{style:data.style as AmbientPreferences['style']}:{}) };
  } catch {
    return null;
  }
}

/** Calendar and clock values come from the selected place, including DST and date rollover. */
export function localClock(place: Place, at: number): { time: string; date: string; hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: place.timezone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', weekday: 'long',
  }).formatToParts(at);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === name)?.value || '';
  const hour = Number(part('hour'));
  return {
    time: `${part('hour')}:${part('minute')}`,
    date: `${part('year')}-${part('month')}-${part('day')}`,
    hour: hour + Number(part('minute')) / 60 + Number(part('second')) / 3600,
    weekday: part('weekday'),
  };
}

function solarInstant(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 50 || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** Reject stale observations; a missing temperature need not discard useful solar timings. */
export function usableContext(context: Context | null, now: number): Context | null {
  if (!context || context.stale || !Number.isFinite(now) || !Number.isFinite(context.observedAt)) return null;
  if (now - context.observedAt > 90 * 60_000 || context.observedAt - now > 5 * 60_000) return null;
  return {
    temperature: typeof context.temperature === 'number' && Number.isFinite(context.temperature) ? context.temperature : null,
    observedAt: context.observedAt,
    fetchedAt: Number.isFinite(context.fetchedAt) ? context.fetchedAt : context.observedAt,
    weatherCode: typeof context.weatherCode === 'number' && Number.isFinite(context.weatherCode) ? context.weatherCode : null,
    isDay: typeof context.isDay === 'boolean' ? context.isDay : null,
    sunrise: solarInstant(context.sunrise),
    sunset: solarInstant(context.sunset),
    stale: false,
  };
}

/** A transparent rules baseline for the local renderer, without claiming AI or observed weather. */
export function ambientDirection(location: Place, context: Context | null, at: number, seed: number) {
  const clock = localClock(location, at);
  const usable = usableContext(context, at);
  const { phase, source } = localPhase({ ...DEFAULT_PROFILE, location }, usable, at);
  const scene: AmbientScene = phase === 'night' ? 'cosmos' : phase === 'dusk' ? 'city' : 'room';
  const sceneReason = scene === 'cosmos'
    ? 'A dark cosmic scene keeps the screen restful at night.'
    : scene === 'city'
      ? 'A softly lit city suits the transition into evening.'
      : 'A quiet illustrated room follows the local daylight hours.';
  const timingReason = source === 'sun'
    ? 'The phase follows fresh local sunrise and sunset times.'
    : source === 'weather'
      ? 'The phase follows the fresh local day/night observation.'
      : 'The phase follows the selected city’s local clock.';
  const temperatureReason = usable?.temperature != null
    ? `Fresh outdoor temperature: ${usable.temperature}°C.`
    : 'Outdoor temperature unavailable; the artwork uses a neutral temperature cue.';
  return {
    scene,
    recipe: { seed, hour: clock.hour, temperature: usable?.temperature ?? 20, date: clock.date, theme: scene, festive: false as const },
    reason: `${sceneReason} ${timingReason} ${temperatureReason}`,
    phase,
  };
}
