"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Activity, ArrowRight, Check, ChevronDown, Expand, MapPin, Pause, Play, Search, Settings2, Sparkles, X } from "lucide-react";
import { AmbientArt } from "@/components/ambient-art";
import { AIControls } from "@/components/ai-controls";
import { ArtworkStatus } from "@/components/artwork-status";
import { useAIPlayback } from "@/hooks/use-ai-playback";
import { CreativeTools } from "@/components/creative-tools";
import { localClock, parsePreferences, usableContext, type AmbientPreferences } from "@/lib/ambient";
import { planMoment, type StoryMemory } from "@/lib/ambient-director";
import { useAmbientDirector } from "@/hooks/use-ambient-director";
import { collectContext, searchPlaces } from "@/lib/context";
import { LONDON, type Context, type Place } from "@/lib/world";
import { weatherCue } from "@/lib/weather-mood";

const STORAGE_KEY = "heartbeat.ambient.v1";
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;
const placeKey = (place: Place) => `${place.latitude},${place.longitude}:${place.timezone}`;
const placeLabel = (place: Place) => `${place.name}, ${place.country}`;

function CitySearch({ initial, onChoose }: { initial?: Place; onChoose: (place: Place) => void }) {
  const [query, setQuery] = useState(initial ? placeLabel(initial) : "");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(-1);
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const resolved = !!initial && query === placeLabel(initial);
  const [selection, setSelection] = useState<Place | undefined>(initial);
  useEffect(() => {
    const abort = new AbortController();
    const searchable = !resolved && query.trim().length >= 2;
    // Batch the external search lifecycle after the current commit; a superseded
    // query must not reset the next query's state.
    queueMicrotask(() => { if (!abort.signal.aborted) { setBusy(searchable); setResults([]); setMessage(""); setActive(-1); } });
    if (!searchable) return () => abort.abort();
    const timer = setTimeout(async () => {
      try {
        const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(12000)]);
        let places: Place[];
        try {
          const response = await fetch(`/api/locations?q=${encodeURIComponent(query.trim())}`, { signal, cache: "no-store" });
          if (!response.ok) throw new Error("City search unavailable");
          const data = await response.json() as { locations: Place[] };
          places = data.locations;
        } catch {
          if (abort.signal.aborted) return;
          places = await searchPlaces(query.trim(), AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]));
        }
        if (!abort.signal.aborted) { setResults(places); setExpanded(true); setMessage(places.length ? "" : "No matching city. Try a nearby city or add the country."); }
      } catch { if (!abort.signal.aborted) setMessage("City search is unavailable. Please try again."); }
      finally { if (!abort.signal.aborted) setBusy(false); }
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query, resolved]);
  function choose(place: Place) { setExpanded(false); setSelection(place); onChoose(place); }
  return <div className="hb-city-search">
    <div className="hb-search"><Search className="hb-search-icon" size={18} aria-hidden="true" /><input autoComplete="off" autoFocus={!initial} className="hb-city-input" aria-label="Your city" placeholder="Your city" role="combobox" aria-autocomplete="list" aria-expanded={expanded && results.length > 0} aria-controls={`${id}-results`} aria-activedescendant={expanded && active >= 0 ? `${id}-${active}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setSelection(undefined); setExpanded(true); }} onFocus={() => setExpanded(true)} onKeyDown={event => {
      if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setExpanded(true); setActive(value => (value + 1) % results.length); }
      if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setExpanded(true); setActive(value => value <= 0 ? results.length - 1 : value - 1); }
      if (event.key === "Escape" && expanded && results.length) { event.stopPropagation(); setExpanded(false); }
      if (event.key === "Enter") { event.preventDefault(); if (expanded && active >= 0 && results[active]) choose(results[active]); else if (resolved && selection) choose(selection); else if (results.length === 1) choose(results[0]); else if (results.length) { setExpanded(true); setActive(0); } }
    }} /><button className="hb-enter-city" aria-label="Use selected city" disabled={!selection || !resolved} onClick={() => selection && choose(selection)}><ArrowRight size={19} /></button></div>
    {expanded && results.length > 0 && <ul id={`${id}-results`} className="hb-results" role="listbox" aria-label="Matching cities">{results.map((place, index) => <li key={placeKey(place)} role="presentation"><button id={`${id}-${index}`} role="option" aria-selected={active === index} className="hb-result" onPointerMove={() => setActive(index)} onClick={() => choose(place)}><MapPin size={16} aria-hidden="true" /><span>{place.name}<small>{place.admin1 ? `${place.admin1}, ` : ""}{place.country}</small></span><ArrowRight size={15} aria-hidden="true" /></button></li>)}</ul>}
    <p className="hb-search-status" role="status">{busy ? "Finding your city…" : message}</p>
  </div>;
}

function useOutdoorContext(place: Place | undefined, onClockOffset: (offset: number) => void) {
  const [reading, setReading] = useState<{ key: string; context: Context } | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const key = place ? placeKey(place) : "";
  useEffect(() => {
    const target = place;
    let disposed = false, active: AbortController | null = null;
    queueMicrotask(() => { if (!disposed) { setReading(null); setFailed(false); if (!target) setLoading(false); } });
    if (!target) return () => { disposed = true; };
    async function refresh() {
      if (disposed || document.hidden || active) return;
      const abort = new AbortController(); active = abort; setLoading(true);
      try {
        const params = new URLSearchParams({ latitude: String(target!.latitude), longitude: String(target!.longitude), timezone: target!.timezone });
        let observation: Context;
        try {
          const response = await fetch(`/api/context?${params}`, { cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) });
          if (!response.ok) throw new Error("Outdoor context unavailable");
          const data = await response.json() as { context: Context; serverTime: number };
          observation = data.context;
          // serverTime is sampled after the upstream weather call, not at request arrival.
          if (!disposed && Number.isFinite(data.serverTime)) onClockOffset(data.serverTime - Date.now());
        } catch {
          if (abort.signal.aborted) return;
          observation = await collectContext(target!, abort.signal);
        }
        if (!disposed && !abort.signal.aborted) { setReading({ key, context: observation }); setFailed(false); }
      } catch { if (!disposed && !abort.signal.aborted) setFailed(true); }
      finally { if (active === abort) active = null; if (!disposed) setLoading(false); }
    }
    refreshRef.current = () => { void refresh(); };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 300000);
    const resume = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", resume);
    return () => { disposed = true; active?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", resume); refreshRef.current = () => {}; };
  }, [key, place, onClockOffset]);
  return { context: reading?.key === key ? reading.context : null, failed, loading, refresh: () => refreshRef.current() };
}

export default function LiveHeartbeat({customer = false, initialPreferences, initialMemory}:{customer?:boolean;initialPreferences?:AmbientPreferences;initialMemory?:StoryMemory|null} = {}) {
  const [preferences, setPreferences] = useState<AmbientPreferences | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(0), [offset, setOffset] = useState(0);
  const [settings, setSettings] = useState(false), [paused, setPaused] = useState(false), [quiet, setQuiet] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [wake, setWake] = useState(false);
  const running = !!preferences;
  const root = useRef<HTMLElement>(null), dialog = useRef<HTMLElement>(null), settingsButton = useRef<HTMLButtonElement>(null);
  const keyboard = useRef(false), idle = useRef<ReturnType<typeof setTimeout> | null>(null), settingsRef = useRef(settings), runningRef = useRef(false);
  useLayoutEffect(() => { settingsRef.current = settings; runningRef.current = running; }, [settings, running]);
  const reveal = useCallback(() => {
    setQuiet(false);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (runningRef.current && !settingsRef.current && !(keyboard.current && root.current?.contains(document.activeElement))) setQuiet(true);
    }, 5000);
  }, []);
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      try {
        const raw = initialPreferences ? JSON.stringify(initialPreferences) : localStorage.getItem(STORAGE_KEY);
        const saved = parsePreferences(raw);
        setPreferences(saved);
        if (raw && !saved) setNotice("Choose your city again to refresh the saved settings.");
      } catch { setStorageAvailable(false); }
      setNow(Date.now()); setLoaded(true); reveal();
    });
    return () => { disposed = true; if (idle.current) clearTimeout(idle.current); };
  }, [reveal, initialPreferences]);
  useEffect(() => {
    if (!loaded || !preferences) return;
    let disposed = false;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); }
    catch { queueMicrotask(() => { if (!disposed) setStorageAvailable(false); }); }
    return () => { disposed = true; };
  }, [preferences, loaded]);
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset);
    tick(); const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [offset]);
  const changeOffset = useCallback((value: number) => setOffset(value), []);
  const outdoors = useOutdoorContext(preferences?.location, changeOffset);
  const usable = usableContext(outdoors.context, now);
  const storageFailure = useCallback(() => setStorageAvailable(false), []);
  const director = useAmbientDirector(preferences, outdoors.context, now, paused, storageFailure, initialMemory);
  const [openingDirection] = useState(() => planMoment(LONDON, null, Date.now(), null, 731921).direction);
  const ai = useAIPlayback({ base: director.direction, memory: director.memory, preferences, at: now, paused, visible: director.visible, accept: director.acceptGenerated, reject: director.rejectGenerated, localCanDisplay: director.canDisplay },customer);
  useEffect(()=>{
    if(!customer||!preferences)return;
    const abort=new AbortController();
    const timer=setTimeout(()=>{fetch('/api/product/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preferences,memory:director.memory}),signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('Save failed');}).catch(()=>{if(!abort.signal.aborted)setNotice('Your latest changes could not sync. Keep this display open and try again.');});},700);
    return()=>{clearTimeout(timer);abort.abort();};
  },[customer,preferences,director.memory]);
  const direction = ai.displayDirection || openingDirection;
  const clock = preferences ? localClock(preferences.location, now) : null;
  const temperature = usable?.temperature != null ? Math.round(preferences?.unit === "f" ? usable.temperature * 9 / 5 + 32 : usable.temperature) : null;

  const chooseCity = useCallback((location: Place) => {
    setPreferences(previous => ({ version: 1, location, seed: seed(), unit: previous?.unit || "c", reducedMotion: previous?.reducedMotion || false, ...(previous?.festiveTouches !== undefined ? { festiveTouches: previous.festiveTouches } : {}), ...(previous?.style ? { style: previous.style } : {}) }));
    setPaused(false); setSettings(false); reveal();
  }, [reveal]);
  useEffect(() => {
    if (!director.failed) return;
    const timer = setTimeout(() => setNotice("The next picture could not be prepared. Your current artwork is kept."), 0);
    return () => clearTimeout(timer);
  }, [director.failed]);
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen(); }
    catch { setNotice("Fullscreen is unavailable in this browser view."); }
  }
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!running || paused || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null, disposed = false, acquiring = false;
    async function acquire() {
      if (disposed || acquiring || document.hidden || lock && !lock.released) return;
      acquiring = true;
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (disposed) { await acquired.release(); return; }
        lock = acquired; setWake(true); acquired.addEventListener("release", () => { if (!disposed) setWake(false); });
      } catch { if (!disposed) setWake(false); }
      finally { acquiring = false; }
    }
    void acquire(); document.addEventListener("visibilitychange", acquire);
    return () => { disposed = true; document.removeEventListener("visibilitychange", acquire); void lock?.release(); setWake(false); };
  }, [running, paused]);
  useEffect(() => {
    if (!settings) return;
    const target = dialog.current;
    const returnFocus = settingsButton.current;
    target?.querySelector<HTMLInputElement>("input")?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab" || !target) return;
      const elements = [...target.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href], select, [tabindex="0"]')];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    target?.addEventListener("keydown", trap);
    return () => { target?.removeEventListener("keydown", trap); returnFocus?.focus(); };
  }, [settings]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      keyboard.current = true; reveal();
      if (event.key === "Escape") { setSettings(false); return; }
      if (!runningRef.current || settingsRef.current || (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(event.target.tagName))) return;
      if (event.code === "Space") { event.preventDefault(); setPaused(value => !value); }
      if (event.key.toLowerCase() === "f") void fullscreen();
      if (event.key.toLowerCase() === "s") setSettings(true);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [reveal]);

  return <main ref={root} className="heartbeat-live" data-customer={customer} data-running={!!preferences} data-quiet={quiet && !settings} data-paused={paused} data-reduced-motion={preferences?.reducedMotion || false} onPointerMove={reveal} onPointerDown={() => { keyboard.current = false; reveal(); }} onFocusCapture={reveal} onBlurCapture={reveal}>
    {loaded && <AmbientArt direction={direction} paused={paused} reducedMotion={preferences?.reducedMotion || false} visible={director.visible} retryToken={director.retryToken} onError={value => { if (value.artwork) ai.onFailure(value); else director.onFailure(value); }} onDisplayed={preferences ? value => { director.onDisplayed(value); ai.onDisplayed(value); } : undefined} canDisplay={preferences ? ai.canDisplay : undefined} />}
    <div className="hb-art-shade" aria-hidden="true" />
    {!loaded ? <div className="hb-startup" role="status"><Activity size={24} /><span>heartbeat</span></div> : !preferences ? <section className="hb-opening" aria-label="Choose your city"><h1>heartbeat</h1><CitySearch onChoose={chooseCity} /></section> : <>
      <header className="hb-header hb-chrome"><div className="hb-brand"><Activity size={23} strokeWidth={1.3} aria-hidden="true" /><span>heartbeat</span></div><div className="hb-header-actions">{customer&&<a className="hb-studio-link" href="/app">Your studio <ArrowRight size={13}/></a>}<button className="hb-city-button" aria-label={`Change city, currently ${placeLabel(preferences.location)}`} onClick={() => setSettings(true)}><span className="hb-city-name">{preferences.location.name}</span><ChevronDown size={13} /></button></div></header>
      <div className="hb-display-meta"><div className="hb-readings"><div className="hb-clock"><time dateTime={clock!.time}>{clock!.time}</time></div>
      <div className="hb-temperature" aria-label={temperature === null ? "Outdoor temperature unavailable" : `Outdoor temperature ${temperature} degrees ${preferences.unit === "f" ? "Fahrenheit" : "Celsius"}`} title={usable ? `Outdoor estimate · ${new Date(usable.observedAt).toLocaleTimeString("en-GB", { timeZone: preferences.location.timezone, hour: "2-digit", minute: "2-digit" })}` : "Outdoor temperature unavailable"}><strong>{temperature === null ? "—" : temperature}<span>°{preferences.unit.toUpperCase()}</span></strong>{temperature === null && <small className="hb-unavailable">{outdoors.loading ? "Updating outdoors" : "Temperature unavailable"}</small>}</div></div>
      {customer&&<ArtworkStatus connection={ai.connection} busy={ai.busy} waiting={ai.waiting} message={ai.message} original={!!ai.displayDirection?.artwork}/>}
      {notice && <p className="hb-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={14} /></button></p>}
      </div>
      <footer className="hb-controls hb-chrome" aria-label="Display controls"><button className="hb-icon-button" disabled={false} onClick={() => setPaused(value => !value)} aria-label={paused ? "Resume artwork changes" : "Pause artwork changes"} title={paused ? "Resume (Space)" : "Pause (Space)"}>{paused ? <Play size={17} /> : <Pause size={17} />}</button><button className="hb-icon-button" disabled={paused} onClick={director.requestMoment} aria-label="New artwork variation" title="A fresh visual idea"><Sparkles size={17} /></button><button className="hb-icon-button" onClick={fullscreen} aria-label="Toggle fullscreen" title="Fullscreen (F)"><Expand size={17} /></button><button ref={settingsButton} className="hb-icon-button" onClick={() => setSettings(true)} aria-label="City and display settings" title="Settings (S)"><Settings2 size={17} /></button></footer>
    </>}
    {settings && preferences && <div className="hb-panel-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setSettings(false); }}><section ref={dialog} className="hb-panel" role="dialog" aria-modal="true" aria-labelledby="hb-panel-title" aria-describedby="hb-panel-description"><header className="hb-panel-header"><h2 id="hb-panel-title" className="hb-panel-title">{customer?"Your atmosphere":"Make room for the day."}</h2><button className="hb-icon-button" aria-label="Close settings" onClick={() => setSettings(false)}><X size={19} /></button></header><CitySearch key={placeKey(preferences.location)} initial={preferences.location} onChoose={chooseCity} /><div className="hb-unit-buttons" role="group" aria-label="Temperature unit"><span>Temperature</span><button aria-pressed={preferences.unit === "c"} onClick={() => setPreferences(value => value && ({ ...value, unit: "c" }))}>°C</button><button aria-pressed={preferences.unit === "f"} onClick={() => setPreferences(value => value && ({ ...value, unit: "f" }))}>°F</button></div><label className="hb-toggle"><span>Gentler transitions</span><input type="checkbox" checked={preferences.reducedMotion} onChange={event => setPreferences(value => value && ({ ...value, reducedMotion: event.target.checked }))} /></label><label className="hb-toggle"><span>Festive touches near year-end</span><input type="checkbox" checked={preferences.festiveTouches === true} onChange={event => setPreferences(value => value && ({ ...value, festiveTouches: event.target.checked }))} /></label><p id="hb-panel-description" className="hb-panel-note">{customer?"Your city, the weather and the time of day guide each new picture. Night comfort stays on.":"Artwork follows time, temperature and season, and remembers recent scenes. A private AI connection can prepare new pictures in the background."}</p>{!customer&&director.direction&&<p className="hb-panel-note">{director.direction.brief.atmosphere}</p>}{director.failed && <p className="hb-panel-note" role="status">The next picture could not be drawn. Your current picture stays; use the sparkle control to try another.</p>}<p className="hb-panel-note">{customer?"Your city and preferences are saved to your account.":storageAvailable?"This browser remembers your city.":"This browser cannot save your city. It will need selecting again next time."} {!customer&&(wake?"Screen stay-awake is active.":"Screen stay-awake depends on your browser.")}</p><div className="hb-panel-footer"><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo ↗</a><button className="hb-preferences-button" disabled={outdoors.loading} onClick={outdoors.refresh}>{outdoors.loading ? "Updating…" : "Refresh temperature"}</button></div>{outdoors.failed && <p className="hb-panel-note" role="status">The latest outdoor update failed. Fresh previous data can remain visible; stale temperature is shown as unavailable.</p>}<AIControls key={`ai:${placeKey(preferences.location)}:${director.memory?.history.at(-1)?.direction.artwork?.attemptId || "local"}`} connection={{ ...ai.connection, account: customer || ai.connection.account }} busy={ai.busy} message={ai.message} unlock={ai.unlock} refresh={ai.refresh} taste={director.feedback} current={director.memory?.history.at(-1)?.direction} />{!customer&&<CreativeTools key={`creative:${placeKey(preferences.location)}`} preview={director.previewIdea} feedback={director.feedback} reset={director.resetMemory} memory={director.memory?.creative} />}
    {!customer&&<p className="hb-panel-note">Weather context: {weatherCue(outdoors.context, now).summary}</p>}
    <button className="hb-done-button" onClick={() => setSettings(false)}><Check size={16} />Done</button></section></div>}
    {!preferences&&notice && <p className="hb-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={14} /></button></p>}
  </main>;
}
