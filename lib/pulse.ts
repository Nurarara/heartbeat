import type { Context, Profile } from './world';

export type Phase = 'morning' | 'day' | 'dusk' | 'night';
export type Thermal = 'cold' | 'cool' | 'mild' | 'warm' | 'hot' | 'unknown';
export type Pulse = {
  engine: 'rules'; at: number; locationKey: string; context: Context | null;
  environment: { phase: Phase; phaseSource: 'sun' | 'weather' | 'clock'; thermal: Thermal; weather: string; season: string; localTime: string };
  mood: { title: string; energy: number; warmth: number; shelter: number };
  effects: { brightness: number; saturation: number; cool: number; lamp: number; driftSeconds: number; breathSeconds: number };
  action: 'HOLD' | 'ANIMATE' | 'REIMAGINE'; reason: string;
  instructions: string[]; preserve: string[]; recentEvents: { at: number; description: string }[];
};
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));
export const locationKey = (p: Profile) => `${p.location.latitude},${p.location.longitude}:${p.location.timezone}`;
export function weatherFamily(code: number | null | undefined): string {
  if (code == null) return 'unknown';
  if (code >= 95) return 'storm';
  if ([71,73,75,77,85,86].includes(code)) return 'snow';
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'rain';
  if ([45,48].includes(code)) return 'fog';
  return code >= 2 ? 'cloud' : 'clear';
}
export function localPhase(profile: Profile, context: Context | null, at: number): { phase: Phase; source: Pulse['environment']['phaseSource'] } {
  const sunrise = Date.parse(context?.sunrise || ''), sunset = Date.parse(context?.sunset || '');
  if (Number.isFinite(sunrise) && Number.isFinite(sunset) && sunrise < sunset && at >= sunrise - 43200000 && at <= sunset + 43200000) {
    if (at < sunrise || at > sunset + 1800000) return { phase: 'night', source: 'sun' };
    if (at >= sunset - 1800000) return { phase: 'dusk', source: 'sun' };
    return { phase: at < sunrise + 10800000 ? 'morning' : 'day', source: 'sun' };
  }
  const hour = Number(new Intl.DateTimeFormat('en', { timeZone: profile.location.timezone, hour: 'numeric', hourCycle: 'h23' }).format(at));
  if (context?.isDay === false) return { phase: 'night', source: 'weather' };
  if (context?.isDay === true) return { phase: hour < 11 ? 'morning' : 'day', source: 'weather' };
  return { phase: hour < 6 || hour >= 21 ? 'night' : hour < 11 ? 'morning' : hour < 17 ? 'day' : 'dusk', source: 'clock' };
}
function season(profile: Profile, at: number) {
  if (Math.abs(profile.location.latitude) < 23.5) return 'tropical location — use observed conditions';
  const month = Number(new Intl.DateTimeFormat('en', { timeZone: profile.location.timezone, month: 'numeric' }).format(at));
  const seasons = ['winter', 'spring', 'summer', 'autumn'];
  return seasons[(Math.floor((month % 12) / 3) + (profile.location.latitude < 0 ? 2 : 0)) % 4];
}
function thermal(temp: number | null | undefined): Thermal { return temp == null ? 'unknown' : temp < 5 ? 'cold' : temp < 13 ? 'cool' : temp < 22 ? 'mild' : temp < 29 ? 'warm' : 'hot'; }

/** Transparent baseline interpreter. It is deliberately not presented as an LLM. */
export function interpretPulse(profile: Profile, context: Context | null, at: number, previous: Pulse | null = null): Pulse {
  if (previous?.locationKey !== locationKey(profile)) previous = null;
  const fresh = context && !context.stale && context.observedAt <= at + 300000 && at - context.observedAt <= 5400000;
  const usable = fresh ? context : null;
  const { phase, source } = localPhase(profile, usable, at);
  const weather = weatherFamily(usable?.weatherCode);
  let temperature = thermal(usable?.temperature);
  // Keep tiny temperature fluctuations from repeatedly switching atmosphere.
  if (previous?.context?.temperature != null && usable?.temperature != null && Math.abs(previous.context.temperature - usable.temperature) < 1.5) temperature = previous.environment.thermal;
  const wet = ['rain','snow','storm'].includes(weather);
  const cold = temperature === 'cold' || temperature === 'cool';
  const warm = temperature === 'warm' || temperature === 'hot';
  const quietPreference = /quiet|cosy|cozy|calm|peaceful|slow/i.test(profile.vibe);
  const baseEnergy = { morning:.58, day:.74, dusk:.38, night:.16 }[phase];
  const energy = clamp(baseEnergy + (warm ? -.09 : 0) + (weather === 'storm' ? .12 : 0) - (quietPreference ? .1 : 0), .06, .9);
  const shelter = clamp((cold ? .42 : .15) + (wet ? .3 : 0) + (phase === 'night' ? .18 : 0));
  const warmth = clamp((cold ? .7 : warm ? .2 : .42) + (phase === 'night' || phase === 'dusk' ? .18 : 0) + (wet ? .08 : 0));
  const title = phase === 'night' ? wet ? 'Sheltered stillness' : 'The world settles' : phase === 'dusk' ? 'Gathering warmth' : warm ? 'Unhurried daylight' : wet ? 'A quiet day indoors' : phase === 'morning' ? 'The world wakes' : 'Daylight, at ease';
  const effects = { brightness: { morning:1.1, day:1.13, dusk:.91, night:.63 }[phase] - (wet ? .06 : 0), saturation: warm ? .92 : .82 + energy * .2, cool: phase === 'night' ? .34 : wet ? .2 : .04, lamp: warmth, driftSeconds: Math.round(78 - energy * 49), breathSeconds: Math.round((7 + (1-energy)*8)*10)/10 };
  const changes: string[] = [];
  if (previous && phase !== previous.environment.phase) changes.push(`Local light moved from ${previous.environment.phase} to ${phase}.`);
  if (previous && weather !== 'unknown' && previous.environment.weather !== 'unknown' && weather !== previous.environment.weather) changes.push(`Conditions changed from ${previous.environment.weather} to ${weather}.`);
  const delta = usable?.temperature != null && previous?.context?.temperature != null ? Math.abs(usable.temperature - previous.context.temperature) : 0;
  if (delta >= 3 && temperature !== previous?.environment.thermal) changes.push(`Outdoor temperature shifted by ${Math.round(delta)}°C, changing the need for shelter.`);
  let action: Pulse['action'] = !previous || changes.length ? 'REIMAGINE' : delta >= 1.5 || Math.abs(energy - previous.mood.energy) >= .05 || Math.abs(warmth - previous.mood.warmth) >= .05 || weather !== previous.environment.weather ? 'ANIMATE' : 'HOLD';
  if (!usable) action = previous ? phase !== previous.environment.phase ? 'ANIMATE' : 'HOLD' : 'ANIMATE';
  const reason = changes.length ? changes.join(' ') : !usable ? 'Fresh outdoor conditions are unavailable. Follow local time gently; do not invent weather.' : !previous ? `Establish a ${phase} atmosphere around ${usable.temperature}°C outdoor conditions.` : action === 'ANIMATE' ? 'A small environmental shift can be expressed through light and movement.' : 'The environment is stable. Preserve this moment and its remaining gentle motion.';
  const instructions = [
    phase === 'night' ? 'Let exterior activity settle; cool the exterior light and retain a few warm occupied windows.' : phase === 'dusk' ? 'Ease into the evening: soften exterior light and gradually bring lamps into use.' : phase === 'morning' ? 'Introduce soft daylight and a little waking activity in the existing world.' : 'Let daylight reach the existing scene without changing its camera or geography.',
    cold ? 'Suggest outdoor cold through appropriate clothing or shelter; make interior warmth inviting without claiming an indoor temperature.' : warm ? 'Make the world feel airy and unhurried; avoid heavy clothing and excessive warm lamplight.' : 'Keep temperature cues restrained.',
    wet ? `Suggest ${weather} only in exterior regions; shelter recurring inhabitants appropriately.` : weather === 'unknown' ? 'Do not invent precipitation, cloud cover or wind.' : 'Use the observed weather subtly, without adding a forecast or weather graphic.',
    `Respect the preferred atmosphere: ${profile.vibe || 'a calm place to spend time'}. Evolve at an energy of ${Math.round(energy*100)}/100.`,
    'Change only one or two meaningful details; maintain the scene identity and do not render text.',
  ];
  const recentEvents = [...(previous?.recentEvents || []), ...(action === 'HOLD' ? [] : [{ at, description:reason }])].slice(-6);
  return { engine:'rules', at, locationKey:locationKey(profile), context:usable, environment:{ phase, phaseSource:source, thermal:temperature, weather, season:season(profile,at), localTime:new Intl.DateTimeFormat('en-GB',{timeZone:profile.location.timezone,dateStyle:'full',timeStyle:'short'}).format(at) }, mood:{title,energy,warmth,shelter}, effects, action, reason, instructions, preserve:['Camera and scene geometry','Recurring inhabitants and objects','Established visual style','Recent story events'], recentEvents };
}
