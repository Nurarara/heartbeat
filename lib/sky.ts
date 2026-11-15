// Sky awareness: where the sun and moon really are for a place and moment.
// Pure maths (low-precision almanac formulas, good to about a degree); no network.
import type { Place } from './world.ts';

const RAD = Math.PI / 180, DAY = 86_400_000, J2000 = Date.UTC(2000, 0, 1, 12);
const wrap = (degrees: number) => ((degrees % 360) + 360) % 360;
const sin = (degrees: number) => Math.sin(degrees * RAD), cos = (degrees: number) => Math.cos(degrees * RAD);

export type SkyStage = 'night' | 'astronomical-twilight' | 'nautical-twilight' | 'civil-twilight' | 'golden-hour' | 'low-sun' | 'day' | 'high-sun';
export type MoonPhase = 'new' | 'waxing-crescent' | 'first-quarter' | 'waxing-gibbous' | 'full' | 'waning-gibbous' | 'last-quarter' | 'waning-crescent';
export type SkyCue = {
  stage: SkyStage; blueHour: boolean; rising: boolean;
  /** Plain words for the director: image models do not follow numeric angles. */
  sun: string; moon: string; cloud: string;
  moonPhase: MoonPhase; moonUp: boolean;
  /** 0 in full daylight, 1 once the sun is well below the horizon. */
  darkness: number;
  /** The brightest lighting the real sky allows right now. */
  lightCeiling: 'dark' | 'soft' | null;
};

function horizontal(rightAscension: number, declination: number, days: number, latitude: number, longitude: number) {
  const siderealTime = wrap((18.697374558 + 24.06570982441908 * days) * 15 + longitude);
  const hourAngle = siderealTime - rightAscension;
  const elevation = Math.asin(sin(latitude) * sin(declination) + cos(latitude) * cos(declination) * cos(hourAngle)) / RAD;
  // Measured clockwise from north.
  const azimuth = wrap(Math.atan2(sin(hourAngle), cos(hourAngle) * sin(latitude) - Math.tan(declination * RAD) * cos(latitude)) / RAD + 180);
  return { elevation, azimuth };
}
function equatorial(longitude: number, latitude: number, days: number) {
  const tilt = 23.439 - 0.00000036 * days;
  return {
    rightAscension: wrap(Math.atan2(sin(longitude) * cos(tilt) - Math.tan(latitude * RAD) * sin(tilt), cos(longitude)) / RAD),
    declination: Math.asin(sin(latitude) * cos(tilt) + cos(latitude) * sin(tilt) * sin(longitude)) / RAD,
  };
}
const sunLongitude = (days: number) => { const anomaly = 357.529 + 0.98560028 * days; return wrap(280.459 + 0.98564736 * days + 1.915 * sin(anomaly) + 0.020 * sin(2 * anomaly)); };
const moonEcliptic = (days: number) => ({ longitude: wrap(218.316 + 13.176396 * days + 6.289 * sin(134.963 + 13.064993 * days)), latitude: 5.128 * sin(93.272 + 13.229350 * days) });

/** Sun elevation (degrees above the horizon) and azimuth (degrees clockwise from north). */
export function sunPosition(latitude: number, longitude: number, at: number) {
  const days = (at - J2000) / DAY, { rightAscension, declination } = equatorial(sunLongitude(days), 0, days);
  return horizontal(rightAscension, declination, days, latitude, longitude);
}
export function moonPosition(latitude: number, longitude: number, at: number) {
  const days = (at - J2000) / DAY, moon = moonEcliptic(days), { rightAscension, declination } = equatorial(moon.longitude, moon.latitude, days);
  return horizontal(rightAscension, declination, days, latitude, longitude);
}
/** Phase from the real angle between moon and sun, not a fixed 29.5-day count. */
export function moonPhase(at: number): { phase: MoonPhase; illumination: number; elongation: number } {
  const days = (at - J2000) / DAY, elongation = wrap(moonEcliptic(days).longitude - sunLongitude(days));
  const phase: MoonPhase = elongation < 20 || elongation >= 340 ? 'new' : elongation < 80 ? 'waxing-crescent' : elongation < 100 ? 'first-quarter' : elongation < 160 ? 'waxing-gibbous'
    : elongation < 200 ? 'full' : elongation < 260 ? 'waning-gibbous' : elongation < 280 ? 'last-quarter' : 'waning-crescent';
  return { phase, illumination: (1 - cos(elongation)) / 2, elongation };
}
export function skyStage(elevation: number): SkyStage {
  return elevation < -18 ? 'night' : elevation < -12 ? 'astronomical-twilight' : elevation < -6 ? 'nautical-twilight' : elevation < -0.833 ? 'civil-twilight'
    : elevation < 6 ? 'golden-hour' : elevation < 20 ? 'low-sun' : elevation < 45 ? 'day' : 'high-sun';
}
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass = (azimuth: number) => COMPASS[Math.round(wrap(azimuth) / 45) % 8];

/** Everything the director needs about the real sky, in plain words. Cloud cover is optional (0-100). */
export function skyCue(place: Pick<Place, 'latitude' | 'longitude'>, at: number, cloudCover?: number | null): SkyCue {
  const sun = sunPosition(place.latitude, place.longitude, at), stage = skyStage(sun.elevation), rising = sun.azimuth < 180;
  const blueHour = sun.elevation >= -6 && sun.elevation < -4, from = compass(sun.azimuth), when = rising ? 'before sunrise' : 'after sunset';
  const sunWords: Record<SkyStage, string> = {
    night: 'Full night: no sunlight at all.',
    'astronomical-twilight': `Deep night with only the faintest trace of twilight ${when}.`,
    'nautical-twilight': `Dark navy twilight ${when}; a faint glow low in the ${from}.`,
    'civil-twilight': blueHour ? `Blue hour ${when}: deep blue sky, no direct sun, a soft glow low in the ${from}.` : `Twilight just ${when}: no direct sun, a warm band of colour low in the ${from} under a cooling sky.`,
    'golden-hour': `Golden hour: a very low warm sun in the ${from} (${rising ? 'just risen' : 'about to set'}), very long soft shadows.`,
    'low-sun': `A low ${rising ? 'morning' : 'afternoon'} sun from the ${from}, long shadows and warm side light.`,
    day: `Daylight with the sun in the ${from}, medium shadows.`,
    'high-sun': `A high sun from the ${from}, short shadows and bright, even light.`,
  };
  const { phase, illumination } = moonPhase(at), moonUp = moonPosition(place.latitude, place.longitude, at).elevation > 0;
  const names: Record<MoonPhase, string> = { new: 'new moon (not visible)', 'waxing-crescent': 'waxing crescent moon', 'first-quarter': 'first-quarter half moon', 'waxing-gibbous': 'waxing gibbous moon', full: 'full moon', 'waning-gibbous': 'waning gibbous moon', 'last-quarter': 'last-quarter half moon', 'waning-crescent': 'waning crescent moon' };
  const thin = phase.endsWith('crescent') && illumination < .15 ? 'thin ' : '';
  const moon = phase === 'new' ? 'New moon: the moon is not visible tonight.' : `A ${thin}${names[phase]}, ${moonUp ? 'above the horizon now' : 'below the horizon now'}.`;
  const cover = typeof cloudCover === 'number' && Number.isFinite(cloudCover) && cloudCover >= 0 && cloudCover <= 100 ? cloudCover : null;
  const cloud = cover === null ? 'Cloud cover unknown.' : cover >= 85 ? 'Thick cloud hides the sun and moon: flat, diffuse light and no hard shadows.' : cover >= 50 ? 'Mostly cloudy: the sun or moon comes and goes, softened shadows.' : cover >= 15 ? 'Scattered cloud in an otherwise open sky.' : 'A clear, open sky.';
  return {
    stage, blueHour, rising, sun: sunWords[stage], moon, cloud, moonPhase: phase, moonUp,
    darkness: Math.round(Math.max(0, Math.min(1, (6 - sun.elevation) / 12)) * 100) / 100,
    lightCeiling: sun.elevation < -6 ? 'dark' : sun.elevation < -0.833 ? 'soft' : null,
  };
}
