import type { Context, Place } from "./world";
/** Free direct-provider fallback belongs only to the explicit local study. */
export function localWeatherFallbackAllowed(customer:boolean,address:{protocol:string;hostname:string}):boolean {
  return !customer&&address.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(address.hostname);
}
export function contextPlace(params: URLSearchParams): Place | null {
  if (!["latitude", "longitude", "timezone"].some(key => params.has(key))) return null;
  const lat = params.get("latitude"), lon = params.get("longitude"), timezone = params.get("timezone");
  if (!lat?.trim() || !lon?.trim() || !timezone || timezone.length > 100) throw new Error("Choose a valid city.");
  const latitude = Number(lat), longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || /^[+-]/.test(timezone)) throw new Error("Choose a valid city.");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new Error("Choose a valid city timezone."); }
  return { latitude, longitude, timezone, name: "Selected city", country: "" };
}
export function locationResults(data: unknown): Place[] {
  const results = (data as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const p = value as Record<string, unknown>;
    if (typeof p.name !== "string" || typeof p.timezone !== "string" || typeof p.latitude !== "number" || typeof p.longitude !== "number") return [];
    try {
      const validated = contextPlace(new URLSearchParams({ latitude: String(p.latitude), longitude: String(p.longitude), timezone: p.timezone }))!;
      const country = typeof p.country === "string" ? p.country : typeof p.country_code === "string" ? p.country_code : "";
      if (!country || !p.name.trim()) return [];
      return [{ ...validated, name: p.name.trim().slice(0, 100), country: country.slice(0, 100), ...(typeof p.admin1 === "string" ? { admin1: p.admin1.slice(0, 120) } : {}) }];
    } catch { return []; }
  });
}
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const response = await fetch("https://geocoding-api.open-meteo.com/v1/search?" + new URLSearchParams({ name: query.slice(0, 100), count: "7", language: "en", format: "json" }), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Location search unavailable"); const data: unknown = await response.json();
  return locationResults(data);
}
export async function collectContext(place: Place, signal?: AbortSignal): Promise<Context> {
  const params = new URLSearchParams({ latitude: String(place.latitude), longitude: String(place.longitude), current: "temperature_2m,weather_code,is_day", daily: "sunrise,sunset", timezone: "auto", forecast_days: "1", timeformat: "unixtime", temperature_unit: "celsius" });
  const response = await fetch("https://api.open-meteo.com/v1/forecast?" + params, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000), cf: { cacheTtl: 300, cacheEverything: true } } as RequestInit);
  if (!response.ok) throw new Error("Weather unavailable");
  const data = await response.json() as { current?: { time?: unknown; temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown }; daily?: { sunrise?: unknown[]; sunset?: unknown[] } };
  const observedAt = Number(data.current?.time) * 1000;
  if (typeof data.current?.time !== "number" || !Number.isFinite(observedAt) || observedAt <= 0) throw new Error("Invalid weather data");
  const solar = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 && value * 1000 < 8640000000000000 ? new Date(value * 1000).toISOString() : undefined;
  const temperature = typeof data.current.temperature_2m === "number" && Number.isFinite(data.current.temperature_2m) && data.current.temperature_2m >= -90 && data.current.temperature_2m <= 65 ? data.current.temperature_2m : null;
  return { temperature, observedAt, fetchedAt: Date.now(), weatherCode: typeof data.current.weather_code === "number" && Number.isInteger(data.current.weather_code) ? data.current.weather_code : null, isDay: data.current.is_day === 1 ? true : data.current.is_day === 0 ? false : null, sunrise: solar(data.daily?.sunrise?.[0]), sunset: solar(data.daily?.sunset?.[0]), stale: Date.now() - observedAt > 5400000 || observedAt - Date.now() > 300000 };
}
