import type { Pulse } from "./pulse";
import type { ArtDirection, WorldMemory } from "./story";
export type Place = { name: string; country: string; timezone: string; latitude: number; longitude: number; admin1?: string };
export type Profile = { name: string; location: Place; style: string; vibe: string; cadence: number; playbackVersion?: number; adaptive: boolean; unit: "c" | "f"; showClock: boolean; showTemperature: boolean; reducedMotion: boolean; live: boolean };
export type Context = { temperature: number | null; observedAt: number; fetchedAt: number; weatherCode: number | null; isDay: boolean | null; sunrise?: string; sunset?: string; stale?: boolean };
export type Frame = { id: string; url: string; title: string; phase: string; reason: string; generatedAt: number; targetAt: number; context: Context | null; preserve: string[]; changes: string[]; source: "preview" | "live"; direction?:ArtDirection };
export type World = { memory?:WorldMemory|null; pulse?: Pulse | null; profile: Profile; displayed: Frame; pending: Frame | null; version: number; moments: number; attempts: number; status: string; lastError: string | null };
export const LONDON: Place = { name: "London", country: "United Kingdom", timezone: "Europe/London", latitude: 51.5085, longitude: -0.1257 };
export const DEFAULT_PROFILE: Profile = { name: "", location: LONDON, style: "Cute anime", vibe: "Quiet cosy city evenings", cadence: 600, playbackVersion: 3, adaptive: true, unit: "c", showClock: true, showTemperature: true, reducedMotion: false, live: false };
// Upgrade the slow original preview without overriding an explicitly saved v2 cadence.
export function playbackProfile(profile: Profile): Profile { return { ...profile, cadence: 600, playbackVersion: 3 }; }
export const STYLES = ["Cute anime", "Watercolour", "Cinematic", "Photorealistic", "Pencil sketch", "Pixel art", "Abstract", "Custom"];
export function localParts(place: Place, time: number) { const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: place.timezone, hour: "numeric", hourCycle: "h23" }).formatToParts(time).find(p => p.type === "hour")?.value || 0); return { hour, phase: hour < 6 ? "night" : hour < 17 ? "day" : hour < 20 ? "twilight" : "night" }; }
export function previewFrame(index: number, context: Context | null = null, targetAt = Date.now()): Frame {
  const variants = [
    { title: "The quiet hour", phase: "twilight", url: "/art/twilight.webp", reason: "A familiar corner, warm lamplight, and the last blue light over London.", changes: ["Blue-hour exterior", "Soft amber lamplight"] },
    { title: "Rain at the window", phase: "rain", url: "/art/rain.webp", reason: "The same little world settles into a rainy evening.", changes: ["Rain against the window", "Deeper blue exterior", "Warmer interior light"] },
    { title: "After the city sleeps", phase: "night", url: "/art/night.webp", reason: "The city grows quieter under a clear, moonlit sky.", changes: ["Moonlit rooftops", "Quieter late-night atmosphere"] },
  ];
  return { ...variants[((index % 3) + 3) % 3], id: "preview-" + index, generatedAt: Date.now(), targetAt, context, preserve: ["Window nook and camera", "Cream cat", "Lamp, mug, books and plants", "Hand-painted anime style"], source: "preview" };
}
export function decide(profile: Profile, previous: Frame, context: Context | null, now: number, force = false) {
  if (force) return { action: "GENERATE" as const, reason: "You invited a new moment." };
  if (!profile.adaptive || previous.source === "preview") return { action: "GENERATE" as const, reason: previous.source === "preview" ? "Explore the next chapter of the preview world." : "Scheduled world evolution." };
  if (!context || context.stale) return { action: "HOLD" as const, reason: "Waiting for fresh local context." };
  if (localParts(profile.location, now).phase !== localParts(profile.location, previous.targetAt).phase) return { action: "GENERATE" as const, reason: "The light is moving into a new part of the day." };
  if (context.weatherCode !== previous.context?.weatherCode) return { action: "GENERATE" as const, reason: "The weather has meaningfully changed." };
  if (context.temperature !== null && previous.context?.temperature != null && Math.abs(context.temperature - previous.context.temperature) >= 3) return { action: "GENERATE" as const, reason: "The temperature has changed enough to shape the atmosphere." };
  if (now - previous.generatedAt >= 10800000) return { action: "GENERATE" as const, reason: "A small new chapter after a few quiet hours." };
  return { action: "HOLD" as const, reason: "Nothing meaningful changed. Let this moment breathe." };
}
