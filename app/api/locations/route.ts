import { failure, json } from "@/lib/server";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || ""; if (q.length < 2) return json({ locations: [] });
  try { const response = await fetch("https://geocoding-api.open-meteo.com/v1/search?" + new URLSearchParams({ name: q, count: "7", language: "en", format: "json" }), { signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error("Location search unavailable"); const data = await response.json() as any; return json({ locations: (data.results || []).filter((p: any) => p.timezone).map((p: any) => ({ name: p.name, country: p.country || p.country_code, admin1: p.admin1, latitude: p.latitude, longitude: p.longitude, timezone: p.timezone })) }); } catch (e) { return failure(e); }
}
