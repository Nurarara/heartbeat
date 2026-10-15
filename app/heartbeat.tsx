"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, Check, ChevronRight, Cloud, Expand, Eye, EyeOff, Heart, Info, LoaderCircle, MapPin, Moon, Pause, Play, Settings2, Sparkles, Sun, Wind, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { playbackAction } from "@/lib/playback";
import { interpretPulse, locationKey, type Pulse } from "@/lib/pulse";
import { pulseStyle, PulseReading } from "@/components/pulse-study";
import { collectContext, searchPlaces } from "@/lib/context";
import { DEFAULT_PROFILE, LONDON, STYLES, previewFrame, type Context, type Frame, type Place, type Profile, type World } from "@/lib/world";

async function api(path: string, body?: unknown) {
  const response = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as any; if (!response.ok) throw new Error(data.error || "This step is unavailable. Please try again."); return data;
}
function placeLabel(p: Place) { return `${p.name}, ${p.country}`; }
function LocationField({ value, onChange, onValidityChange }: { value: Place; onChange: (p: Place) => void; onValidityChange: (valid: boolean) => void }) {
  const [search, setSearch] = useState(placeLabel(value));
  const [open, setOpen] = useState(false);
  const [locations, setLocations] = useState<Place[]>([value]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const resolved = search === placeLabel(value);
  useEffect(() => { onValidityChange(resolved); }, [resolved, onValidityChange]);
  useEffect(() => {
    if (resolved) { setSearching(false); setError(""); return; }
    if (search.trim().length < 2) { setLocations([]); setSearching(false); return; }
    const controller = new AbortController(); setSearching(true); setLocations([]);
    const timer = setTimeout(async () => {
      try {
        let places: Place[];
        try { places = await searchPlaces(search.trim(), controller.signal); }
        catch { if (controller.signal.aborted) return; const res = await fetch(`/api/locations?q=${encodeURIComponent(search.trim())}`, { signal: controller.signal }); const data = await res.json() as any; if (!res.ok) throw new Error(); places = data.locations; }
        if (!controller.signal.aborted) { setLocations(places); setError(""); }
      } catch { if (!controller.signal.aborted) { setLocations([]); setError("Couldn't search. Try again, or use your selected city."); } }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, resolved]);
  return <div className="location-field">
    <Combobox open={open} onOpenChange={setOpen} items={locations} filter={null} inputValue={search} value={resolved ? value : null} isItemEqualToValue={(a, b) => a.latitude === b.latitude && a.longitude === b.longitude} onValueChange={p => { if (p) { onChange(p); setSearch(placeLabel(p)); setOpen(false); onValidityChange(true); } }} onInputValueChange={(input, details) => { if (["input-change", "input-clear", "clear-press"].includes(details.reason)) { setSearch(input); setOpen(input.trim().length >= 2 && input !== placeLabel(value)); onValidityChange(input === placeLabel(value)); } }} itemToStringLabel={placeLabel}>
      <ComboboxInput id="your-location" showTrigger={false} className="world-combobox" placeholder="Type your city…" aria-label="Your city" />
      <ComboboxContent className="location-results"><ComboboxEmpty>{searching ? "Finding your city…" : error || "No cities found. Try a nearby city."}</ComboboxEmpty><ComboboxList>{(p: Place) => <ComboboxItem key={`${p.latitude}-${p.longitude}`} value={p}><MapPin size={16} /><span>{p.name}<small>{p.admin1 ? p.admin1 + ", " : ""}{p.country}</small></span></ComboboxItem>}</ComboboxList></ComboboxContent>
    </Combobox>
    {!resolved && <p className="location-help">Choose the matching city below.{error && <button onClick={() => { setSearch(placeLabel(value)); onValidityChange(true); }}>Use {value.name}</button>}</p>}
  </div>;
}
function ProfileFields({ value, onChange, liveAvailable, onValidityChange }: { value: Profile; onChange: (p: Profile) => void; liveAvailable: boolean; onValidityChange: (v: boolean) => void }) {
  return <div className="profile-fields">
    <label className="field-label" htmlFor="your-location">Your city</label><LocationField value={value.location} onChange={location => onChange({ ...value, location })} onValidityChange={onValidityChange} />
    <label className="field-label" htmlFor="your-style">Artwork</label>
    {liveAvailable ? <Select value={value.style} onValueChange={style => onChange({ ...value, style })}><SelectTrigger id="your-style" className="world-input"><SelectValue /></SelectTrigger><SelectContent>{STYLES.map(style => <SelectItem key={style} value={style}>{style}</SelectItem>)}</SelectContent></Select> : <div className="style-preview"><img src="/art/twilight.webp" alt="" /><div><strong>Cosy anime</strong><span>The London window world</span></div><span className="style-tag">Preview</span></div>}
    {liveAvailable && <><label className="field-label" htmlFor="your-vibe">Mood <span>optional</span></label><Textarea id="your-vibe" className="world-input vibe-input" placeholder="A feeling, a place, a little daydream…" value={value.vibe} maxLength={500} onChange={e => onChange({ ...value, vibe: e.target.value })} /></>}
    <details className="personal-details"><summary>A personal touch</summary><label className="field-label" htmlFor="your-name">Your name <span>optional</span></label><Input id="your-name" className="world-input" value={value.name} maxLength={60} placeholder="What should we call you?" onChange={e => onChange({ ...value, name: e.target.value })} /></details>
  </div>;
}
function ToggleRow({ title, subtitle, checked, onChange }: { title: string; subtitle?: string; checked: boolean; onChange: (v: boolean) => void }) { return <label className="toggle-row"><span>{title}{subtitle && <small>{subtitle}</small>}</span><Switch aria-label={title} checked={checked} onCheckedChange={onChange} /></label>; }

export default function Heartbeat() {
  const [pulse, setPulse] = useState<Pulse | null>(null); const pulseRef = useRef<Pulse | null>(null);
  const [world, setWorld] = useState<World | null>(null); const [draft, setDraft] = useState<Profile>({ ...DEFAULT_PROFILE });
  const [locationValid, setLocationValid] = useState(true);
  const [loaded, setLoaded] = useState(false); const [liveAvailable, setLiveAvailable] = useState(false); const [settings, setSettings] = useState(false);
  const [context, setContext] = useState<Context | null>(null); const [now, setNow] = useState(Date.now()); const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false); const [controls, setControls] = useState(true); const [busy, setBusy] = useState(false); const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(""); const [weatherError, setWeatherError] = useState(false); const [ready, setReady] = useState<Frame | null>(null); const [transitioning, setTransitioning] = useState(false);
  const [current, setCurrent] = useState<Frame>(() => previewFrame(0)); const [wake, setWake] = useState(false);
  const swapping = useRef(false); const retryAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null); const nextAt = useRef(Date.now() + 600000); const inFlight = useRef(false); const prepared = useRef<Frame | null>(null); const activeWorld = useRef<World | null>(null); const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const revision = useRef(0); const currentRef = useRef(current); const pauseRef = useRef(paused);
  activeWorld.current = world; currentRef.current = current; pauseRef.current = paused;
  const profile = world?.profile || draft;
  const updateContext = useCallback(async () => { const place = activeWorld.current?.profile.location || LONDON; const key = `${place.latitude},${place.longitude}`; const valid = () => { const p=activeWorld.current?.profile.location || LONDON; return key === `${p.latitude},${p.longitude}`; }; try { const data = await api("/api/context"); if (!valid()) return; setContext(data.context); setWeatherError(false); setOffset(data.serverTime - Date.now()); } catch { try { const fresh = await collectContext(place); if (!valid()) return; setContext(fresh); setWeatherError(false); } catch { setWeatherError(true); } } }, []);
  useEffect(() => { let cancelled = false; api("/api/world").then(data => { if (cancelled) return; setLiveAvailable(data.liveAvailable); if (data.serverTime) setOffset(data.serverTime - Date.now()); if (data.world) { activeWorld.current = data.world; pulseRef.current = data.world.pulse || null; setPulse(data.world.pulse || null); setWorld(data.world); setDraft(data.world.profile); setCurrent(data.world.displayed); nextAt.current = Date.now() + data.world.profile.cadence * 1000; } }).catch(e => setNotice(e.message)).finally(() => { if (!cancelled) setLoaded(true); }); return () => { cancelled = true; }; }, []);
  useEffect(() => { updateContext(); const t = setInterval(updateContext, 300000); return () => clearInterval(t); }, [updateContext, profile.location.latitude, profile.location.longitude]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + offset), 1000); return () => clearInterval(t); }, [offset]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 7000); return () => clearTimeout(t); }, [notice]);
  const reveal = useCallback(() => { setControls(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setControls(false), 4500); }, []);
  useEffect(() => { reveal(); return () => { if (timer.current) clearTimeout(timer.current); if (fadeTimer.current) clearTimeout(fadeTimer.current); }; }, [reveal]);
  useEffect(() => { let lock: WakeLockSentinel | null = null; let cancelled = false; async function acquire() { if (cancelled || !world || paused || document.hidden || !("wakeLock" in navigator)) return; try { lock = await navigator.wakeLock.request("screen"); if (cancelled) { await lock.release(); return; } setWake(true); lock.addEventListener("release", () => setWake(false)); } catch { setWake(false); } } acquire(); document.addEventListener("visibilitychange", acquire); return () => { cancelled = true; document.removeEventListener("visibilitychange", acquire); lock?.release(); setWake(false); }; }, [!!world, paused]);
  const prepare = useCallback(async (force = false) => {
    if (inFlight.current || swapping.current || !activeWorld.current || document.hidden) return; inFlight.current = true; setBusy(true); const rev = revision.current;
    try {
      const data = await api("/api/heartbeat", { force, targetAt: nextAt.current });
      if (rev !== revision.current) return;
      if (data.world) { activeWorld.current = data.world; setWorld(data.world); if (data.world.lastError) setNotice(data.world.lastError); }
      if (data.frame) { const frame: Frame = data.frame; const image = new Image(); image.src = frame.url; await image.decode(); if (rev !== revision.current) return; prepared.current = frame; setReady(frame); }
      else { if (Date.now() >= nextAt.current) nextAt.current = Date.now() + (activeWorld.current?.profile.cadence || 600) * 1000; if (force && data.reason) setNotice(data.reason); }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not prepare the next scene. Your artwork stays here."); }
    finally { inFlight.current = false; retryAt.current = Date.now() + 5000; setBusy(false); }
  }, []);
  const swap = useCallback(async () => {
    const frame = prepared.current; const w = activeWorld.current; if (!frame || !w || pauseRef.current || swapping.current) return; swapping.current = true;
    prepared.current = null; const rev = revision.current;
    try { const result = await api("/api/display", { frameId: frame.id, version: w.version }); if (rev !== revision.current) return; if (!result.world) throw new Error("This scene is no longer ready."); activeWorld.current = result.world; setWorld(result.world); setTransitioning(true);
      const delay = w.profile.reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 50 : 3200;
      fadeTimer.current = setTimeout(() => { setCurrent(frame); setReady(null); setTransitioning(false); swapping.current = false; nextAt.current = Date.now() + w.profile.cadence * 1000; void prepare(); }, delay);
    } catch (e) { swapping.current = false; setTransitioning(false); setReady(null); retryAt.current = Date.now() + 5000; void api("/api/world").then(data => { if (rev === revision.current && data.world) { activeWorld.current = data.world; setWorld(data.world); setCurrent(data.world.displayed); } }).catch(() => {}); setNotice(e instanceof Error ? e.message : "Your current scene is kept."); }
  }, [prepare]);
  useEffect(() => { if (!world || paused) return; const t = setTimeout(() => prepare(), 500); return () => clearTimeout(t); }, [!!world, paused, prepare]);
  useEffect(() => {
    if (!world || paused) return;
    const tick = () => { const action = playbackAction(Date.now(), nextAt.current, !!prepared.current, inFlight.current || swapping.current, pauseRef.current, document.hidden, retryAt.current); if (action === "SWAP") void swap(); if (action === "PREPARE") void prepare(); };
    tick(); const t = setInterval(tick, 500); document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [!!world, paused, prepare, swap]);
  useEffect(() => { const resume = () => { if (!document.hidden) { void updateContext(); if (!pauseRef.current && !prepared.current) void prepare(); } }; document.addEventListener("visibilitychange", resume); return () => document.removeEventListener("visibilitychange", resume); }, [prepare, updateContext]);
  useEffect(() => {
    if (!world || paused) return; let cancelled = false;
    const evaluate = async () => {
      const w = activeWorld.current; if (!w) return;
      const rev = revision.current;
      const local = interpretPulse(w.profile,context,Date.now()+offset,pulseRef.current);
      pulseRef.current=local; setPulse(local);
      // The simulated laboratory uses the same interpreter but never calls this route.
      try { const data = await api("/api/pulse",{locationKey:locationKey(w.profile),context});
        if (!cancelled && rev === revision.current && data.pulse) { pulseRef.current=data.pulse; setPulse(data.pulse); setWorld(value=>value ? {...value,pulse:data.pulse}:value); }
      } catch { /* Keep the locally calculated response; the scene is never cleared. */ }
    };
    void evaluate(); const t=setInterval(evaluate,60000);
    return () => { cancelled=true; clearInterval(t); };
  }, [!!world, context, paused, offset, profile.location.latitude, profile.location.longitude, profile.vibe]);
  async function save() { if (!locationValid || swapping.current) return; setSaving(true); try { const data = await api("/api/world", { profile: draft }); revision.current++; pulseRef.current=data.world.pulse || null; setPulse(data.world.pulse || null); swapping.current = false; if (data.world.profile.location.latitude !== activeWorld.current?.profile.location.latitude || data.world.profile.location.longitude !== activeWorld.current?.profile.location.longitude) setContext(null); prepared.current = null; setReady(null); setTransitioning(false); if (fadeTimer.current) clearTimeout(fadeTimer.current); activeWorld.current = data.world; setWorld(data.world); setCurrent(data.world.displayed); setDraft(data.world.profile); setSettings(false); nextAt.current = Date.now() + data.world.profile.cadence * 1000; void updateContext(); void prepare(); } catch (e) { setNotice(e instanceof Error ? e.message : "Your settings could not be saved. Please try again."); } finally { setSaving(false); } }
  async function nextMoment() { if (swapping.current || paused) return; if (!activeWorld.current?.profile.live) { setBusy(true); try { await updateContext(); } finally { setBusy(false); } return; } if (prepared.current) await swap(); else { await prepare(true); if (prepared.current && !pauseRef.current) await swap(); } }
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setNotice("Fullscreen is unavailable in this view. Open Heartbeat in its own tab."); } }
  function openSettings() { setLocationValid(true); setDraft(activeWorld.current?.profile || draft); setSettings(true); }
  useEffect(() => { const key = (e: KeyboardEvent) => { if (!world || settings || (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "BUTTON"].includes(e.target.tagName))) return; if (e.code === "Space") { e.preventDefault(); setPaused(v => !v); reveal(); } if (e.key.toLowerCase() === "f") void fullscreen(); if (e.key.toLowerCase() === "s") openSettings(); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [world, settings, reveal]);
  useEffect(() => { const registry = (document as any).modelContext; if (!registry?.registerTool) return; const lifecycle = new AbortController();
    const register = (tool: any) => { try { Promise.resolve(registry.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} };
    register({ name: "read_heartbeat_world", title: "Read Heartbeat world", description: "Read the current world, context, and generation connection status.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => ({ world: activeWorld.current, liveAvailable, paused: pauseRef.current }) });
    register({ name: "set_heartbeat_paused", title: "Pause or resume Heartbeat", description: "Pause or resume automatic scene changes in the current display.", inputSchema: { type: "object", properties: { paused: { type: "boolean" } }, required: ["paused"], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: (input: any) => { if (typeof input?.paused !== "boolean" || Object.keys(input).some(k => k !== "paused")) throw new Error("Provide only paused as a boolean."); pauseRef.current = input.paused; setPaused(input.paused); return { paused: input.paused }; } });
    return () => lifecycle.abort();
  }, [liveAvailable]);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: profile.location.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: profile.location.timezone, weekday: "long", day: "numeric", month: "long" }).format(now);
  const stale = !context || context.stale || now - context.observedAt > 5400000;
  const temp = !stale && context.temperature != null ? Math.round(profile.unit === "f" ? context.temperature * 9 / 5 + 32 : context.temperature) : null;
  const WeatherIcon = context?.isDay ? Sun : Moon;
  const chrome = !world || controls || settings;
  return <main style={pulseStyle(pulse)} className={`ambient ${world ? "is-running" : "is-setting-up"} ${chrome ? "show-controls" : "quiet"} ${profile.reducedMotion ? "reduce-motion" : ""} ${paused ? "world-paused" : ""}`} onPointerMove={reveal} onPointerDown={reveal} onFocusCapture={reveal}>
    <div className="artwork"><img className="art-layer" key={current.id} data-frame-id={current.id} src={current.url} alt="A cosy illustrated London window nook, with a sleeping cream cat and warm lamplight" fetchPriority="high" />{ready && <img className={`art-layer next-layer ${transitioning ? "visible" : ""}`} src={ready.url} alt="" />}<div className="environment-tint" /><div className="ambient-light" /><div className="ambient-dust" /><div className="art-shade" /></div>
    <header className="display-header chrome"><div className="wordmark"><Activity size={22} strokeWidth={1.5} /><span>heartbeat</span></div><div className="world-location"><MapPin size={14} />{profile.location.name}<span className="location-divider" />{profile.style}</div></header>
    {!world && <>
      <div className="opening-caption"><span className="breathing-line" /><span>A world, listening to your day.</span></div>
      <div className="opening-clock"><span>{time}</span><small>{date}</small></div>
      <section className="onboarding">
        <p className="eyebrow">MAKE YOURSELF AT HOME</p><h1>Stay for a moment.</h1><p className="intro">Your time. Your city. A quieter screen.</p>
        <div className="quick-setup"><label className="field-label" htmlFor="your-location">Where are you?</label><div className="start-row"><LocationField value={draft.location} onChange={location => setDraft({ ...draft, location })} onValidityChange={setLocationValid} /><button className="primary-button" onClick={save} disabled={saving || !loaded || !locationValid}>{saving || !loaded ? <LoaderCircle className="spin" size={18} /> : <Play size={17} fill="currentColor" />}{saving ? "Opening…" : "Start"}</button></div></div>
        <p className="preview-note">Live AI artwork disconnected · <a href="/story">Watch one world evolve</a></p>
      </section>
    </>}
    {world && <><div className={`clock-overlay ${!profile.showClock ? "overlay-hidden" : ""}`}><div className="clock-time">{time}</div><div className="clock-date">{date}</div></div><div className={`temperature-overlay ${!profile.showTemperature ? "overlay-hidden" : ""}`}><div className="temperature-value"><WeatherIcon size={24} strokeWidth={1.2} />{temp === null ? "—" : temp}<span>°{profile.unit.toUpperCase()}</span></div><div className="temperature-place">{profile.location.name}{stale ? " · unavailable" : weatherError ? " · last update" : ""}</div></div>
    <div className="scene-caption chrome"><span className="scene-dash" /><span>{pulse?.mood.title || current.title}</span><small>{paused ? "Paused" : current.source === "preview" ? "Preview" : "Living world"}</small></div>
    <div className="playback-status chrome" role="status"><span className={`pulse-dot ${paused ? "paused" : ""}`} />{paused ? "World paused" : transitioning ? "A new moment…" : ready ? `Next scene in ${Math.max(0, Math.ceil((nextAt.current - (now - offset)) / 1000))}s` : busy ? "Preparing the next scene…" : pulse?.action === "REIMAGINE" && !profile.live ? "Scene held · AI reimagining disconnected" : pulse?.action === "HOLD" ? "Stable conditions · holding this moment" : "Light and movement follow your environment"}</div>
    <nav className="display-controls chrome" aria-label="Display controls"><button onClick={() => setPaused(v => !v)} title={paused ? "Resume (Space)" : "Pause (Space)"} aria-label={paused ? "Resume" : "Pause"}>{paused ? <Play size={18} /> : <Pause size={18} />}</button><button onClick={nextMoment} disabled={busy || transitioning || paused} title={profile.live ? "Next moment" : "Read environment now"} aria-label={profile.live ? "Next moment" : "Read environment now"}>{busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}</button><span className="control-divider" /><button onClick={fullscreen} title="Fullscreen (F)" aria-label="Fullscreen"><Expand size={18} /></button><button onClick={() => { setDraft({ ...profile, showClock: !profile.showClock, showTemperature: !profile.showClock }); setSettings(true); }} title="Overlay settings" aria-label="Overlay settings">{profile.showClock ? <Eye size={18} /> : <EyeOff size={18} />}</button><button onClick={openSettings} title="Settings (S)" aria-label="Settings"><Settings2 size={18} /></button></nav></>}
    {!world && <div className="setup-bottom"><span className="chapter-dots">{[0,1,2].map(i => <i key={i} className={Number(current.id.replace("preview-", "")) % 3 === i ? "active" : ""} />)}<span>{current.title}</span></span><span>Time and outdoor conditions shape the atmosphere</span></div>}
    {notice && <div role="status" className="notice"><Info size={16} /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={14} /></button></div>}
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="settings-panel"><DialogHeader><div className="eyebrow">YOUR LITTLE WORLD</div><DialogTitle className="settings-title">Make it feel like you.</DialogTitle><DialogDescription>Quiet changes, on your terms.</DialogDescription></DialogHeader><Tabs defaultValue="world"><TabsList className="settings-tabs"><TabsTrigger value="world">World</TabsTrigger><TabsTrigger value="display">Display</TabsTrigger><TabsTrigger value="moments">Heartbeat</TabsTrigger></TabsList>
      <TabsContent value="world"><ProfileFields value={draft} onChange={setDraft} liveAvailable={liveAvailable} onValidityChange={setLocationValid} /><div className="connection-note"><Sparkles size={17} /><div><strong>{draft.live ? "Live reimagining" : "Preview world"}</strong><p>{liveAvailable ? "Let AI evolve your chosen style and atmosphere." : "Your environment now shapes light, warmth and movement on the reference artwork. New scene details require connected AI generation; the reference location remains London."}</p></div></div>{liveAvailable && <ToggleRow title="Live AI reimagining" subtitle="Up to 24 attempts per day in this prototype." checked={draft.live} onChange={live => setDraft({ ...draft, live, cadence: 600 })} />}</TabsContent>
      <TabsContent value="display"><ToggleRow title="Show clock and date" checked={draft.showClock} onChange={showClock => setDraft({ ...draft, showClock })} /><ToggleRow title="Show temperature" checked={draft.showTemperature} onChange={showTemperature => setDraft({ ...draft, showTemperature })} /><ToggleRow title="Gentler transitions" subtitle="Reduce motion and dissolve instantly." checked={draft.reducedMotion} onChange={reducedMotion => setDraft({ ...draft, reducedMotion })} /><div className="setting-select"><label htmlFor="temperature-unit">Temperature</label><Select value={draft.unit} onValueChange={unit => setDraft({ ...draft, unit: unit as "c" | "f" })}><SelectTrigger id="temperature-unit"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="c">Celsius</SelectItem><SelectItem value="f">Fahrenheit</SelectItem></SelectContent></Select></div><p className="settings-footnote">Atmosphere listens every minute. Full scene reimagining is considered every ten minutes.</p><ToggleRow title="Change only when it matters" subtitle="Keep stable scenes; react when the environment meaningfully changes." checked={draft.adaptive} onChange={adaptive => setDraft({ ...draft, adaptive })} /><p className="settings-footnote">{wake ? "Screen stay-awake is active." : "Screen stay-awake depends on your device."} An overdue scene plays when you return to this tab.</p></TabsContent>
      <TabsContent value="moments"><PulseReading pulse={pulse} /><p className="settings-footnote">Light and tempo react now. The continuity study shows related scenes. Fresh artwork requires live AI generation, which is {liveAvailable ? "connected" : "disconnected"}.</p><a className="pulse-test-link" href="/story">Watch the continuity study</a><a className="pulse-test-link" href="/pulse">Test the environmental heartbeat</a><a className="attribution" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo <ArrowUpRight size={12} /></a></TabsContent>
    </Tabs><button className="primary-button" onClick={save} disabled={saving || !locationValid || transitioning}>{saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{saving ? "Saving…" : "Save changes"}</button></DialogContent></Dialog>
  </main>;
}
