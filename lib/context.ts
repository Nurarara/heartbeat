import type { Context, Place } from "./world";
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const response = await fetch("https://geocoding-api.open-meteo.com/v1/search?" + new URLSearchParams({ name: query.slice(0, 100), count: "7", language: "en", format: "json" }), { signal: signal || AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Location search unavailable"); const data = await response.json() as any;
  return (data.results || []).filter((p: any) => p.timezone && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).map((p: any) => ({ name: p.name, country: p.country || p.country_code, admin1: p.admin1, latitude: p.latitude, longitude: p.longitude, timezone: p.timezone }));
}
export async function collectContext(place: Place): Promise<Context> {
  const params = new URLSearchParams({ latitude: String(place.latitude), longitude: String(place.longitude), current: "temperature_2m,weather_code,is_day", daily: "sunrise,sunset", timezone: "auto", forecast_days: "1", timeformat: "unixtime" });
  const response = await fetch("https://api.open-meteo.com/v1/forecast?" + params, { signal: AbortSignal.timeout(12000), cf: { cacheTtl: 300, cacheEverything: true } } as RequestInit);
  if (!response.ok) throw new Error("Weather unavailable"); const data = await response.json() as any;
  const observedAt = Number(data.current?.time) * 1000;
  if (!Number.isFinite(observedAt) || !Number.isFinite(data.current?.temperature_2m)) throw new Error("Invalid weather data");
  return { temperature: data.current.temperature_2m, observedAt, fetchedAt: Date.now(), weatherCode: data.current.weather_code, isDay: data.current.is_day === 1, sunrise: data.daily?.sunrise?.[0] ? new Date(data.daily.sunrise[0] * 1000).toISOString() : undefined, sunset: data.daily?.sunset?.[0] ? new Date(data.daily.sunset[0] * 1000).toISOString() : undefined, stale: Date.now() - observedAt > 5400000 };
}
