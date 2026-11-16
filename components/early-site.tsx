"use client";
// The public early-access site: a landing page, the prepared demo, and a short
// "city, mood, preview" taste of the real product. Static: no account, no AI, no cost.
// The preview shows prepared example artwork and says so; only the clock, the
// temperature and the sky description are live.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Play } from 'lucide-react';
import RecordingDemo from './recording-demo';
import { MOOD_IDS, MOODS, type MoodId } from '@/lib/moods';
import { skyCue, sunPosition } from '@/lib/sky';
import { locationResults } from '@/lib/context';
import type { Place } from '@/lib/world';
import './early-site.css';

export const EARLY_ACCESS_EMAIL = 'rounak@heartbeatart.co.uk';
const art = (name: string) => `/demo/art/${name}.webp`;
/** What each mood feels like, in the visitor's words rather than the director's. */
export const MOOD_BLURBS: Record<MoodId, string> = {
  auto: 'Let the time and weather decide.', calm: 'Slow, quiet and spacious.', sleep: 'Near-dark, for winding down.', cosy: 'Warm lamps and shelter.',
  focus: 'A still backdrop for working.', playful: 'Whimsical and smile-making.', dreamy: 'Surreal and otherworldly.', romantic: 'Dim reds, purples and candlelight.',
};
/** Prepared example pictures for each mood, by daylight or darkness. */
export const MOOD_ART: Record<MoodId, { day: string[]; night: string[] }> = {
  auto: { day: ['02-meadow-play', '10-autumn-railway', '04-watercolour-coast'], night: ['06-starlit-water', '09-desert-night-drive'] },
  calm: { day: ['04-watercolour-coast', '10-autumn-railway'], night: ['06-starlit-water'] },
  sleep: { day: ['15-moon-naps', '09-desert-night-drive'], night: ['15-moon-naps', '09-desert-night-drive'] },
  cosy: { day: ['01-sunday-window', '05-winter-refuge'], night: ['05-winter-refuge', '03-london-rain'] },
  focus: { day: ['07-mountain-observatory', '08-moss-after-rain'], night: ['06-starlit-water', '09-desert-night-drive'] },
  playful: { day: ['13-gutter-regatta', '11-dew-post', '02-meadow-play'], night: ['15-moon-naps'] },
  dreamy: { day: ['12-whale-market', '14-lilac-tram'], night: ['15-moon-naps', '06-starlit-water'] },
  romantic: { day: ['14-lilac-tram', '03-london-rain'], night: ['03-london-rain', '06-starlit-water'] },
};
const HOME_ART = ['03-london-rain', '02-meadow-play', '12-whale-market', '06-starlit-water', '14-lilac-tram'];
const LONDON: Place = { name: 'London', country: 'United Kingdom', timezone: 'Europe/London', latitude: 51.5074, longitude: -0.1278 };
type View = 'home' | 'demo' | 'begin';
const viewOf = (hash: string): View => hash === '#demo' ? 'demo' : hash === '#begin' ? 'begin' : 'home';

/** Full-screen artwork that crossfades whenever the picture changes. */
function Backdrop({ src, dim = .45 }: { src: string; dim?: number }) {
  const [layers, setLayers] = useState([src]);
  // Keep the outgoing picture underneath while the new one fades in.
  if (layers.at(-1) !== src) setLayers([...layers.slice(-1), src]);
  return <div className="es-art" aria-hidden="true">{layers.map((layer, index) => <img key={layer} src={layer} alt="" className={index === layers.length - 1 ? 'es-on' : ''} />)}<div className="es-shade" style={{ opacity: dim }} /></div>;
}
function useRotation(list: string[], seconds: number) {
  const [turn, setTurn] = useState(0);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) setTurn(value => value + 1); }, seconds * 1000); return () => clearInterval(timer); }, [seconds]);
  return list[turn % list.length];
}

function Home() {
  const picture = useRotation(HOME_ART, 7);
  return <main className="es es-home">
    <Backdrop src={art(picture)} />
    <header className="es-top"><span className="es-mark">heartbeat</span><span className="es-tag">Private testing · London</span></header>
    <section className="es-hero">
      <p className="es-eyebrow">AI art for the room you are in</p>
      <h1>A screen<br />with a pulse.</h1>
      <p className="es-lede">Heartbeat reads the time, the weather and the mood where you are, and paints a new picture for the moment. Never the same twice.</p>
      <div className="es-actions"><a className="es-primary" href="#begin">Make it yours <ArrowRight size={18} /></a><a className="es-secondary" href="#demo"><Play size={15} /> Watch the demo</a></div>
    </section>
    <footer className="es-foot"><span>One day, many worlds.</span><span>Weather by Open-Meteo</span></footer>
  </main>;
}

function CityStep({ onChoose }: { onChoose: (place: Place) => void }) {
  const [query, setQuery] = useState(''), [places, setPlaces] = useState<Place[]>([]), [status, setStatus] = useState('');
  useEffect(() => {
    const name = query.trim(); if (name.length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({ name: name.slice(0, 80), count: '6', language: 'en', format: 'json' }), { signal: abort.signal });
        if (!response.ok) throw new Error('search');
        const found = locationResults(await response.json()); setPlaces(found); setStatus(found.length ? '' : 'No city found with that name yet. Keep typing, or use London.');
      } catch { if (!abort.signal.aborted) { setPlaces([]); setStatus('City search is not available right now. You can continue with London.'); } }
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query]);
  const shown = query.trim().length < 2 ? [] : places;
  return <section className="es-step">
    <p className="es-eyebrow">Step 1 of 2</p><h1>Where are you?</h1>
    <p className="es-lede">Your city gives Heartbeat its time, weather and sky.</p>
    <input className="es-input" autoFocus autoComplete="off" aria-label="Your city" placeholder="Type your city" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && shown[0]) onChoose(shown[0]); }} />
    {shown.length > 0 && <ul className="es-results" aria-label="Matching cities">{shown.map(place => <li key={`${place.latitude},${place.longitude}`}><button type="button" onClick={() => onChoose(place)}><span>{place.name}</span><small>{[place.admin1, place.country].filter(Boolean).join(', ')}</small></button></li>)}</ul>}
    <p className="es-status" role="status">{query.trim().length < 2 ? '' : status}</p>
    <button type="button" className="es-link" onClick={() => onChoose(LONDON)}>Use London instead</button>
  </section>;
}

function MoodStep({ place, onChoose, onHover }: { place: Place; onChoose: (mood: MoodId) => void; onHover: (mood: MoodId | null) => void }) {
  return <section className="es-step es-wide">
    <p className="es-eyebrow">Step 2 of 2 · {place.name}</p><h1>Pick a mood to begin.</h1>
    <p className="es-lede">You can change it any time. Night always stays dark.</p>
    <div className="es-moods" role="group" aria-label="Choose a mood">{MOOD_IDS.map(id => <button type="button" key={id} className="es-mood" style={{ '--es-mood': MOODS[id].colour } as React.CSSProperties} onClick={() => onChoose(id)} onPointerEnter={() => onHover(id)} onPointerLeave={() => onHover(null)} onFocus={() => onHover(id)} onBlur={() => onHover(null)}>
      <i aria-hidden="true" /><strong>{MOODS[id].label}</strong><span>{MOOD_BLURBS[id]}</span></button>)}</div>
  </section>;
}

function Preview({ place, mood, onMood, onCity }: { place: Place; mood: MoodId; onMood: (mood: MoodId) => void; onCity: () => void }) {
  const [now, setNow] = useState(() => Date.now()), [temperature, setTemperature] = useState<number | null>(null), [cloud, setCloud] = useState<number | null>(null);
  const [joining, setJoining] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const abort = new AbortController();
    fetch('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({ latitude: place.latitude.toFixed(3), longitude: place.longitude.toFixed(3), current: 'temperature_2m,cloud_cover', temperature_unit: 'celsius' }), { signal: abort.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('weather')))
      .then((data: unknown) => {
        const current = (data as { current?: { temperature_2m?: unknown; cloud_cover?: unknown } } | null)?.current, value = current?.temperature_2m, cover = current?.cloud_cover;
        setTemperature(typeof value === 'number' && value >= -90 && value <= 65 ? Math.round(value) : null);
        setCloud(typeof cover === 'number' && cover >= 0 && cover <= 100 ? cover : null);
      }).catch(() => { /* The preview still works without live weather. */ });
    return () => abort.abort();
  }, [place]);
  const minute = Math.floor(now / 60000);
  const night = useMemo(() => sunPosition(place.latitude, place.longitude, minute * 60000).elevation < -4, [place, minute]);
  const sky = useMemo(() => skyCue(place, minute * 60000, cloud), [place, minute, cloud]);
  const picture = useRotation(MOOD_ART[mood][night ? 'night' : 'day'], 9);
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: place.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const mail = `mailto:${EARLY_ACCESS_EMAIL}?subject=${encodeURIComponent('Heartbeat early access')}&body=${encodeURIComponent(`Hi, I would like early access to Heartbeat.\n\nCity: ${place.name}\nMood: ${MOODS[mood].label}\n`)}`;
  const copy = useCallback(async () => { try { await navigator.clipboard.writeText(EARLY_ACCESS_EMAIL); setCopied(true); } catch { setCopied(false); } }, []);
  return <section className="es-preview">
    <Backdrop src={art(picture)} dim={joining ? .7 : .22} />
    <p className="es-label">Preview · example artwork</p>
    <div className="es-readings"><div className="es-story"><p>{place.name} · {MOODS[mood].label}</p><h1>{sky.sun}</h1><p className="es-moon">{sky.moon}</p></div>
      <div className="es-clock"><time>{clock}</time>{temperature !== null && <p>{temperature}°C</p>}</div></div>
    <div className="es-chips" role="group" aria-label="Mood">{MOOD_IDS.map(id => <button type="button" key={id} aria-pressed={id === mood} onClick={() => onMood(id)}><i aria-hidden="true" style={{ background: MOODS[id].colour }} />{MOODS[id].label}</button>)}</div>
    <div className="es-bar"><button type="button" className="es-link" onClick={onCity}>Change city</button><p>The real Heartbeat paints a new picture for this exact moment every few minutes.</p><button type="button" className="es-primary" onClick={() => setJoining(true)}>Join early access <ArrowRight size={18} /></button></div>
    {joining && <div className="es-join" role="dialog" aria-modal="true" aria-labelledby="es-join-title"><h2 id="es-join-title">Heartbeat is in private testing.</h2>
      <p>Email to ask for early access. Say your city and the mood you liked, and you will hear back when a place opens.</p>
      <p className="es-email">{EARLY_ACCESS_EMAIL}</p>
      <div className="es-actions"><a className="es-primary" href={mail}>Write the email <ArrowRight size={18} /></a><button type="button" className="es-secondary" onClick={copy}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy address</>}</button></div>
      <button type="button" className="es-link" onClick={() => setJoining(false)}>Back to the preview</button></div>}
  </section>;
}

function Begin() {
  const [place, setPlace] = useState<Place | null>(null), [mood, setMood] = useState<MoodId | null>(null), [hover, setHover] = useState<MoodId | null>(null);
  const idle = useRotation(HOME_ART, 8);
  if (place && mood) return <main className="es"><header className="es-top"><a className="es-mark" href="#">heartbeat</a></header><Preview place={place} mood={mood} onMood={setMood} onCity={() => { setPlace(null); setMood(null); }} /></main>;
  return <main className="es es-begin" style={hover ? { '--es-tint': MOODS[hover].colour } as React.CSSProperties : undefined}>
    <Backdrop src={art(hover ? MOOD_ART[hover].day[0] : idle)} dim={.62} /><div className="es-tint" aria-hidden="true" />
    <header className="es-top"><a className="es-mark" href="#">heartbeat</a>{place ? <button type="button" className="es-link" onClick={() => { setPlace(null); setHover(null); }}><ArrowLeft size={14} /> Change city</button> : <a className="es-link" href="#"><ArrowLeft size={14} /> Back</a>}</header>
    {place ? <MoodStep place={place} onChoose={setMood} onHover={setHover} /> : <CityStep onChoose={setPlace} />}
  </main>;
}

export default function EarlySite() {
  const [view, setView] = useState<View>(() => typeof location === 'undefined' ? 'home' : viewOf(location.hash));
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { const change = () => { setView(viewOf(location.hash)); top.current?.scrollIntoView?.(); }; addEventListener('hashchange', change); return () => removeEventListener('hashchange', change); }, []);
  return <div ref={top}>{view === 'demo' ? <><RecordingDemo standalone /><a className="es-leave" href="#"><ArrowLeft size={14} /> Back</a></> : view === 'begin' ? <Begin key="begin" /> : <Home />}</div>;
}
