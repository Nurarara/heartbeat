import { env } from "cloudflare:workers";
import { DEFAULT_PROFILE, type World, type Profile, previewFrame, playbackProfile } from "./world";
export function runtime() { return env as unknown as { DB: D1Database; BUCKET: R2Bucket; OPENAI_API_KEY?: string; HEARTBEAT_IMAGE_MODEL?: string; HEARTBEAT_DIRECTOR_MODEL?: string }; }
export function db() { const d = runtime().DB; if (!d) throw new Error("World storage is temporarily unavailable."); return d; }
export function sessionId(request: Request) { return request.headers.get("cookie")?.match(/(?:^|;\s*)heartbeat_world=([a-f0-9-]{36})(?:;|$)/)?.[1] || null; }
export function cookie(id: string, request: Request) { return `heartbeat_world=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`; }
export function guard(request: Request) { const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) throw new Error("Please use the Heartbeat display to make this change."); }
export async function row(request: Request) { const id = sessionId(request); return id ? db().prepare("SELECT * FROM worlds WHERE id = ?").bind(id).first<Record<string, unknown>>() : null; }
export function decode(r: Record<string, unknown>): World { return { memory:r.memory ? JSON.parse(r.memory as string):null, pulse: r.pulse ? JSON.parse(r.pulse as string) : null, profile: playbackProfile(JSON.parse(r.profile as string)), displayed: JSON.parse(r.displayed as string), pending: r.pending ? JSON.parse(r.pending as string) : null, version: Number(r.version), moments: Number(r.moments), attempts: Number(r.attempts), status: r.status as string, lastError: r.last_error as string | null }; }
export function json(data: unknown, status = 200, headers: Record<string, string> = {}) { return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } }); }
export function failure(error: unknown, status = 503) { console.error("Heartbeat:", error instanceof Error ? error.message : "Unavailable"); return json({ error: status === 400 ? (error instanceof Error ? error.message : "Please check your settings.") : "This step is temporarily unavailable. Your current artwork is safe." }, status); }
export function cleanProfile(input: any): Profile {
  const p = input?.profile; if (!p?.location || typeof p.location.name !== "string" || typeof p.location.country !== "string" || typeof p.location.timezone !== "string") throw new Error("Choose a location from the search results.");
  const lat = p.location.latitude, lon = p.location.longitude;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("Choose a valid location.");
  new Intl.DateTimeFormat("en", { timeZone: p.location.timezone });
  const str = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
  const live = p.live === true && !!runtime().OPENAI_API_KEY;
  return { ...DEFAULT_PROFILE, name: str(p.name, 60), vibe: str(p.vibe, 500), style: live ? str(p.style, 40) || "Cute anime" : "Cute anime", location: { name: str(p.location.name, 100), country: str(p.location.country, 100), timezone: p.location.timezone, latitude: lat, longitude: lon }, cadence: 600, playbackVersion: 3, adaptive: p.adaptive !== false, unit: p.unit === "f" ? "f" : "c", showClock: p.showClock !== false, showTemperature: p.showTemperature !== false, reducedMotion: p.reducedMotion === true, live };
}
export async function saveProfile(request: Request, profile: Profile) {
  const existing = await row(request); const id = existing?.id as string || crypto.randomUUID(); const now = Date.now();
  if (existing) {
    const previous = decode(existing).profile;
    const resetWorld = previous.location.latitude !== profile.location.latitude || previous.location.longitude !== profile.location.longitude || previous.location.timezone !== profile.location.timezone || previous.vibe !== profile.vibe || previous.style !== profile.style;
    await db().prepare("UPDATE worlds SET profile = ?, pending = NULL, pulse = CASE WHEN ? THEN NULL ELSE pulse END, memory = CASE WHEN ? THEN NULL ELSE memory END, anchor = CASE WHEN ? THEN NULL ELSE anchor END, version = version + 1, status = 'idle', lease = 0, updated_at = ? WHERE id = ?").bind(JSON.stringify(profile), resetWorld ? 1 : 0, resetWorld ? 1 : 0, resetWorld ? 1 : 0, now, id).run();
  }
  else await db().prepare("INSERT INTO worlds (id, profile, displayed, day, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, JSON.stringify(profile), JSON.stringify(previewFrame(0)), new Date().toISOString().slice(0, 10), now).run();
  return { id, world: decode((await db().prepare("SELECT * FROM worlds WHERE id = ?").bind(id).first<Record<string, unknown>>())!) };
}
