import { localClock, usableContext } from './ambient.ts';
import { localPhase, type Phase } from './pulse.ts';
import { DEFAULT_PROFILE, type Context, type Place } from './world.ts';
import { parseCreativeMemory, rememberCreativeDisplay, type CreativeMemory } from './creative.ts';
import type { GeneratedArtwork } from './ai/types.ts';
import { THEME_LIBRARY } from './creative-library.ts';
import { weatherCue, WEATHER_CONDITIONS, type WeatherCondition } from './weather-mood.ts';

export type SceneId = 'room' | 'city' | 'cosmos' | 'meadow' | 'lake' | 'coast';
export type CreativeDirection = {
  id: string;
  locationKey: string;
  scene: SceneId;
  recipe: { seed: number; hour: number; temperature: number; date: string; theme: SceneId; festive: boolean };
  phase: Phase;
  season: string;
  reason: string;
  brief: { weekday: string; temperature: number | null; activity: string; atmosphere: string; weather?: WeatherCondition };
  artwork?: GeneratedArtwork;
};
export type DisplayedMoment = { direction: CreativeDirection; at: number };
export type StoryMemory = { version: 1; locationKey: string; history: DisplayedMoment[]; creative?: CreativeMemory };

const TEN_MINUTES = 600_000;
const HOUR = 3_600_000;
const SCENES: SceneId[] = ['room', 'city', 'cosmos', 'meadow', 'lake', 'coast'];
const PHASES: Phase[] = ['morning', 'day', 'dusk', 'night'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const keyOf = (place: Place) => `${place.latitude},${place.longitude}:${place.timezone}`;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const temperature = (value: unknown): value is number => finite(value) && value >= -90 && value <= 65;
const text = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
const validAt = (value: unknown): value is number => finite(value) && value >= 0 && value <= 8_640_000_000_000_000;

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function seasonAt(place: Place, date: string): string {
  if (Math.abs(place.latitude) < 23.5) return 'tropical';
  const month = Number(date.slice(5, 7));
  const index = (Math.floor((month % 12) / 3) + (place.latitude < 0 ? 2 : 0)) % 4;
  return ['winter', 'spring', 'summer', 'autumn'][index];
}

function festiveWindow(date: string): boolean {
  const monthDay = date.slice(5);
  return monthDay >= '12-10' || monthDay <= '01-06';
}

function allowedScenes(phase: Phase): SceneId[] {
  return phase === 'night' ? ['cosmos', 'coast'] : phase === 'dusk' ? ['city', 'room', 'coast'] : ['room', 'meadow', 'lake'];
}

function readDirection(value: unknown, location: Place): CreativeDirection | null {
  if (!object(value) || !object(value.recipe) || !object(value.brief)) return null;
  const r = value.recipe, b = value.brief;
  if (!text(value.id, 160) || !/^[a-zA-Z0-9:_-]+$/.test(value.id) || value.locationKey !== keyOf(location)) return null;
  if (!SCENES.includes(value.scene as SceneId) || !PHASES.includes(value.phase as Phase)) return null;
  if (!validDate(r.date) || !finite(r.seed) || !Number.isInteger(r.seed) || r.seed < 1 || r.seed > 0xffffffff) return null;
  if (!finite(r.hour) || r.hour < 0 || r.hour >= 24 || !temperature(r.temperature) || r.theme !== value.scene || typeof r.festive !== 'boolean') return null;
  if (!allowedScenes(value.phase as Phase).includes(value.scene as SceneId)) return null;
  if ((r.hour < 6 || r.hour >= 21) && value.phase !== 'night') return null;
  if (r.festive && !festiveWindow(r.date)) return null;
  if (value.season !== seasonAt(location, r.date) || !text(value.reason, 1400)) return null;
  if (!WEEKDAYS.includes(b.weekday as string) || (b.temperature !== null && !temperature(b.temperature))) return null;
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(new Date(`${r.date}T12:00:00Z`));
  if (b.weekday !== weekday || !text(b.activity, 240) || !text(b.atmosphere, 300)) return null;
  if (b.weather !== undefined && !WEATHER_CONDITIONS.includes(b.weather as WeatherCondition)) return null;
  if (r.temperature !== (b.temperature ?? 20)) return null;
  let artwork: GeneratedArtwork | undefined;
  if (value.artwork !== undefined) {
    const a = value.artwork;
    if (!object(a) || !text(a.attemptId, 36) || !/^[a-f0-9-]{36}$/.test(a.attemptId) || a.url !== `/api/ai/art/${a.attemptId}` || !text(a.title, 140) || !object(a.proposal)) return null;
    const p = a.proposal;
    if (p.version !== 1 || !text(p.id, 100) || !text(p.fingerprint, 400) || !/^[a-z0-9|\-]+$/.test(p.fingerprint) || !text(p.title, 300) || !text(p.prompt, 2048) || !['dark', 'soft', 'daylight'].includes(p.lighting as string) || !Array.isArray(p.themes) || p.themes.length > 21 || !['local-sampler', 'ai-director'].includes(p.source as string) || !SCENES.includes(p.fallbackScene as SceneId) || !finite(p.score)) return null;
    if (value.phase === 'night' && p.lighting !== 'dark') return null;
    const canonical = p.themes.map(item => object(item) ? THEME_LIBRARY.find(theme => theme.id === item.id && theme.category === item.category && theme.label === item.label) : undefined);
    if (canonical.some(item => !item)) return null;
    artwork = { attemptId: a.attemptId, url: a.url as string, title: a.title, proposal: { version: 1, id: p.id, fingerprint: p.fingerprint, title: p.title, prompt: p.prompt, lighting: p.lighting as 'dark' | 'soft' | 'daylight', themes: canonical.map(item => ({ id: item!.id, category: item!.category, label: item!.label })), source: p.source as 'local-sampler' | 'ai-director', fallbackScene: p.fallbackScene as SceneId, score: p.score } };
  }
  return {
    id: value.id, locationKey: keyOf(location), scene: value.scene as SceneId,
    recipe: { seed: r.seed, hour: r.hour, temperature: r.temperature, date: r.date, theme: r.theme as SceneId, festive: r.festive },
    phase: value.phase as Phase, season: value.season as string, reason: value.reason,
    brief: { weekday: b.weekday as string, temperature: b.temperature as number | null, activity: b.activity, atmosphere: b.atmosphere, ...(b.weather ? { weather: b.weather as WeatherCondition } : {}) },
    ...(artwork ? { artwork } : {}),
  };
}

/** Only committed artwork is persisted. Corrupt, oversized or cross-city memory is discarded. */
export function parseStoryMemory(raw: string | null, location: Place, now: number): StoryMemory | null {
  if (!raw || raw.length > 128_000 || !validAt(now)) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!object(data) || data.version !== 1 || data.locationKey !== keyOf(location) || !Array.isArray(data.history) || data.history.length > 12) return null;
    const seen = new Set<string>();
    const history: DisplayedMoment[] = [];
    for (const item of data.history) {
      if (!object(item) || !validAt(item.at) || item.at > now) return null;
      const direction = readDirection(item.direction, location);
      if (!direction || seen.has(direction.id)) return null;
      if (history.length && item.at < history[history.length - 1].at) return null;
      // A scene may finish decoding after midnight, but it cannot have been
      // planned for a calendar date that had not arrived when it was displayed.
      if (direction.recipe.date > localClock(location, item.at).date) return null;
      seen.add(direction.id);
      history.push({ direction, at: item.at });
    }
    const creative = data.creative === undefined ? undefined : parseCreativeMemory(data.creative, now);
    if (creative === null) return null;
    return { version: 1, locationKey: keyOf(location), history, ...(creative ? { creative } : {}) };
  } catch {
    return null;
  }
}

/** Call after a prepared image actually becomes the displayed frame, never while planning. */
export function rememberMoment(memory: StoryMemory | null, direction: CreativeDirection, displayedAt: number): StoryMemory {
  if (!validAt(displayedAt)) throw new RangeError('A displayed moment needs a valid timestamp.');
  const current = memory?.version === 1 && memory.locationKey === direction.locationKey ? memory : null;
  // A server/device clock correction can move display time backwards. Keeping
  // future commits would produce an unordered record rejected on the next reload.
  const history = (current?.history || []).filter(item => item.at <= displayedAt);
  if (history.some(item => item.direction.id === direction.id)) {
    return history.length === current!.history.length ? current! : { ...current!, history };
  }
  const committed = direction.artwork ? { ...direction, artwork: { ...direction.artwork, proposal: { ...direction.artwork.proposal, prompt: direction.artwork.proposal.prompt.slice(0, 350) } } } : direction;
  return {
    version: 1,
    locationKey: direction.locationKey,
    history: [...history, { direction: committed, at: displayedAt }].slice(-12),
    creative: rememberCreativeDisplay(current?.creative, direction.artwork ? undefined : direction.scene, displayedAt, direction.artwork?.proposal),
  };
}

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  return (result >>> 0) || 1;
}

function activityFor(scene: SceneId, phase: Phase, weekend: boolean, warm: boolean): string {
  if (scene === 'cosmos') return 'A slow visual drift past a distant planet.';
  if (scene === 'coast') return phase === 'night' ? 'A distant lighthouse keeps watch above the dark sea.' : 'An unhurried look along the coast as the light softens.';
  if (scene === 'city') return weekend ? 'An evening wander past softly illuminated windows.' : 'The quiet journey home after a working day.';
  if (scene === 'lake') return phase === 'morning' ? 'A small boat and space to ease into the morning.' : 'A quiet pause beside the water, with room for reflection.';
  if (scene === 'meadow') return weekend && warm ? 'Dogs at play in an open field on an unhurried weekend.' : phase === 'morning' ? 'A little playful movement in a wide field to begin the day.' : 'Dogs following a playful arc across an open field.';
  return weekend ? warm ? 'A slow weekend rest beside an open window.' : 'A sheltered weekend rest with nowhere urgent to be.' : phase === 'morning' ? 'A quiet pause before the day gathers pace.' : 'A little rest between the day’s tasks.';
}

/** A local creative policy, not a model: context chooses suitable original illustration families. */
export function planMoment(
  location: Place,
  context: Context | null,
  at: number,
  memory: StoryMemory | null,
  seed: number,
  options: { force?: boolean; festive?: boolean } = {},
): { action: 'HOLD' | 'REIMAGINE'; direction: CreativeDirection; reason: string; nextCheckAt: number } {
  if (!validAt(at)) throw new RangeError('Creative planning needs a valid timestamp.');
  const locationKey = keyOf(location);
  const clock = localClock(location, at);
  const usable = usableContext(context, at);
  const weather = weatherCue(context, at);
  const measured = temperature(usable?.temperature) ? usable!.temperature : null;
  const quietHours = clock.hour < 6 || clock.hour >= 21;
  const local = localPhase({ ...DEFAULT_PROFILE, location }, usable, at);
  const season = seasonAt(location, clock.date);
  const festive = options.festive === true && festiveWindow(clock.date);
  const history = memory?.version === 1 && memory.locationKey === locationKey ? memory.history : [];
  const latest = history.at(-1);
  // A clock correction can invalidate an in-memory timestamp just as a reload parser would.
  const previous = latest && validAt(latest.at) && latest.at <= at ? latest : undefined;
  // Losing a solar observation after an early sunset must not restore daytime
  // brightness. Carry that afternoon/evening darkness through this date until
  // fresh daylight evidence arrives. A previous midnight frame does not latch
  // the following evening after its intervening morning has passed.
  const eveningDarkness = !!previous && previous.direction.phase === 'night'
    && previous.direction.recipe.date === clock.date
    && previous.direction.recipe.hour >= 12 && clock.hour >= previous.direction.recipe.hour
    && local.source === 'clock';
  const phase: Phase = quietHours || eveningDarkness ? 'night' : local.phase;
  const age = previous ? at - previous.at : Infinity;
  const enteringDarkness = phase === 'night' && !!previous && (previous.direction.phase !== 'night' || !allowedScenes('night').includes(previous.direction.scene));
  const changedDate = !!previous && previous.direction.recipe.date !== clock.date;
  const changedPhase = !!previous && previous.direction.phase !== phase;
  const changedSeason = !!previous && previous.direction.season !== season;
  const changedFestive = !!previous && previous.direction.recipe.festive !== festive;
  const previousTemperature = previous?.direction.brief.temperature;
  const previousCue = previousTemperature ?? previous?.direction.recipe.temperature;
  const changedTemperature = measured != null && previousCue != null && Math.abs(measured - previousCue) >= 3;
  const recoveredTemperature = previousTemperature == null && measured != null;
  const changedWeather = weather.condition !== 'unknown' && previous?.direction.brief.weather !== weather.condition;
  const trigger = !previous ? 'Establish the first artwork for this city.'
    : options.force ? 'You invited a fresh visual idea.'
      : enteringDarkness ? 'Darkness or local quiet hours call for a restful screen now.'
        : age < TEN_MINUTES ? ''
          : changedDate ? 'The local calendar has moved into a new day.'
            : changedPhase ? 'The local light has entered a different part of the day.'
              : changedSeason ? 'The local seasonal context has changed.'
                : changedFestive ? 'Your explicit seasonal decoration preference has changed.'
                  : changedTemperature ? recoveredTemperature
                    ? 'New outdoor temperature data differs meaningfully from the neutral drawing cue.'
                    : 'Outdoor temperature has shifted enough to suggest a different atmosphere.'
                    : changedWeather ? 'Fresh local weather suggests a different atmosphere.'
                      : age >= HOUR ? 'After an hour, introduce a different visual idea even while conditions stay steady.' : '';

  if (!trigger && previous) {
    const reason = age < TEN_MINUTES
      ? 'Let the current artwork settle for at least ten minutes; darkness can still interrupt.'
      : 'Conditions are steady. Let this moment breathe until a meaningful change or the one-hour limit.';
    return {
      action: 'HOLD', direction: previous.direction, reason,
      nextCheckAt: Math.min(at + TEN_MINUTES, previous.at + HOUR, age < TEN_MINUTES ? previous.at + TEN_MINUTES : Infinity),
    };
  }

  const identity = `${locationKey}|${seed}|${at}|${previous?.direction.id || 'first'}|${history.length}`;
  let artSeed = hash(identity);
  const usedSeeds = new Set(history.map(item => item.direction.recipe.seed));
  while (usedSeeds.has(artSeed)) artSeed = (artSeed % 0xffffffff) + 1;
  const weekend = clock.weekday === 'Saturday' || clock.weekday === 'Sunday';
  const warm = measured != null && measured >= 22;
  const subduedWeather = ['overcast', 'fog', 'drizzle', 'rain', 'snow', 'storm'].includes(weather.condition);
  const eligible = allowedScenes(phase).filter(scene => !subduedWeather || scene !== 'meadow');
  const candidates = previous ? eligible.filter(scene => scene !== previous.direction.scene) : eligible;
  const weights = candidates.map(scene => {
    let weight = scene === 'room' ? 3 : 2;
    if (weekend && warm && (phase === 'morning' || phase === 'day')) weight = scene === 'meadow' ? 8 : scene === 'room' ? 5 : 2;
    if (measured != null && measured < 10 && scene === 'room') weight += 5;
    if (subduedWeather && scene === 'room') weight += 5;
    if (phase === 'morning' && !weekend && scene === 'lake') weight += 2;
    if (festive && scene === 'city') weight += 5;
    const recent = history.slice(-6).filter(item => item.direction.scene === scene).length;
    return weight / (1 + recent);
  });
  let pick = (hash(`${identity}|composition`) / 0x1_0000_0000) * weights.reduce((sum, weight) => sum + weight, 0);
  const scene = candidates.find((_, index) => { pick -= weights[index]; return pick < 0; }) || candidates[0];
  const activity = activityFor(scene, phase, weekend, warm);
  const atmosphere = phase === 'night' ? 'Dark and restful, with only small restrained points of light.'
    : subduedWeather ? 'Muted, diffused light, cool exterior tones and a sheltered, quiet atmosphere.'
    : measured == null ? 'Calm light guided by local time; outdoor temperature unavailable.'
      : phase === 'dusk' ? 'Soft evening contrast and a few inviting warm visual accents.'
        : measured >= 22 ? 'Airy and unhurried, with light fabrics and generous open space.'
          : measured < 10 ? 'A quiet composition with sheltered warmth and restrained cool exterior tones.'
            : 'Gentle local daylight and an easy balance of warmth and open space.';
  const timing = quietHours ? 'Local quiet hours take priority, including during polar daylight.'
    : eveningDarkness ? 'Keep the earlier observed evening darkness while fresh daylight evidence is unavailable.'
    : local.source === 'sun' ? 'Timing follows fresh local sunrise and sunset.'
      : local.source === 'weather' ? 'Timing follows the fresh local day/night observation.'
        : 'Timing follows the city’s local clock.';
  const thermal = measured == null ? 'Outdoor temperature unavailable; a neutral cue is used only for drawing.' : `Fresh outdoor temperature: ${measured}°C.`;
  const seasonal = season === 'tropical' ? 'Tropical latitude is noted without assuming a wet or dry season.' : `${season[0].toUpperCase()}${season.slice(1)} is calendar context for this hemisphere, not a weather observation.`;
  const decoration = festive ? 'Seasonal decoration is explicitly enabled within your December–January window.' : '';
  const reason = `${trigger} ${timing} ${thermal} ${weather.summary} ${seasonal} ${activity}${decoration ? ` ${decoration}` : ''}`;
  const direction: CreativeDirection = {
    id: `moment-${artSeed.toString(36)}-${Math.floor(at).toString(36)}`,
    locationKey, scene,
    recipe: { seed: artSeed, hour: clock.hour, temperature: measured ?? 20, date: clock.date, theme: scene, festive },
    phase, season, reason,
    brief: { weekday: clock.weekday, temperature: measured, activity, atmosphere, weather: weather.condition },
  };
  return { action: 'REIMAGINE', direction, reason, nextCheckAt: at + TEN_MINUTES };
}
