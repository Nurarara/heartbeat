import { usableContext } from './ambient.ts';
import type { Context } from './world.ts';

export const WEATHER_CONDITIONS = ['unknown', 'clear', 'mostly-clear', 'partly-cloudy', 'overcast', 'fog', 'drizzle', 'rain', 'snow', 'storm'] as const;
export type WeatherCondition = typeof WEATHER_CONDITIONS[number];
export type WeatherCue = { condition: WeatherCondition; summary: string; code: number | null; observedAt: string | null };

/** Open-Meteo WMO codes describe a local-area estimate, not the user's exact window. */
export function weatherCue(context: Context | null, at: number): WeatherCue {
  const fresh = usableContext(context, at), code = fresh?.weatherCode;
  let condition: WeatherCondition = 'unknown';
  if (code === 0) condition = 'clear';
  else if (code === 1) condition = 'mostly-clear';
  else if (code === 2) condition = 'partly-cloudy';
  else if (code === 3) condition = 'overcast';
  else if (code === 45 || code === 48) condition = 'fog';
  else if ([51, 53, 55, 56, 57].includes(code!)) condition = 'drizzle';
  else if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code!)) condition = 'rain';
  else if ([71, 73, 75, 77, 85, 86].includes(code!)) condition = 'snow';
  else if ([95, 96, 97, 99].includes(code!)) condition = 'storm';
  const summaries: Record<WeatherCondition, string> = {
    unknown: 'Weather conditions unavailable; do not infer rain, snow or sunshine from temperature.',
    clear: 'Clear sky in the local-area estimate.',
    'mostly-clear': 'Mainly clear sky in the local-area estimate.',
    'partly-cloudy': 'Partly cloudy in the local-area estimate.',
    overcast: 'Overcast in the local-area estimate: muted, diffused light rather than a bright blue sky.',
    fog: 'Fog in the local-area estimate: softened distance and quiet, low-contrast atmosphere.',
    drizzle: 'Drizzle in the local-area estimate: damp, subdued atmosphere and diffused light.',
    rain: 'Rain or rain showers in the local-area estimate: wet, subdued atmosphere and diffused light.',
    snow: 'Snow in the local-area estimate: a quiet wintry atmosphere; retain nighttime darkness.',
    storm: 'Thunderstorm in the local-area estimate: a sheltered, subdued atmosphere without flashing lightning.',
  };
  return { condition, summary: summaries[condition], code: condition === 'unknown' ? null : code!, observedAt: fresh ? new Date(fresh.observedAt).toISOString() : null };
}

export function weatherInspiration(weather?: WeatherCue): string {
  return `${weather?.summary || 'Weather conditions unavailable; do not invent them.'} Interpret the atmosphere creatively; no literal city or repeated rainy-window scene is required. Nighttime darkness takes priority over every weather cue.`;
}
