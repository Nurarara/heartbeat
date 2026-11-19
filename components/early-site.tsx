"use client";
// The public landing site at heartbeatart.co.uk: a landing page and the prepared demo. Static: no account, no AI, no cost.
// "Make it yours" goes to the waitlist on the app site (app.heartbeatart.co.uk), which stores each sign-up and emails the owner.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';
import RecordingDemo from './recording-demo';
import './early-site.css';

export const APP_URL = 'https://app.heartbeatart.co.uk/';
export const WAITLIST_URL = APP_URL + '#request';
const art = (name: string) => `/demo/art/${name}.webp`;
const HOME_ART = ['03-london-rain', '02-meadow-play', '12-whale-market', '06-starlit-water', '14-lilac-tram'];
type View = 'home' | 'demo';
const viewOf = (hash: string): View => hash === '#demo' ? 'demo' : 'home';

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
      <div className="es-actions"><a className="es-primary" href={WAITLIST_URL}>Make it yours <ArrowRight size={18} /></a><a className="es-secondary" href="#demo"><Play size={15} /> Watch the demo</a></div>
    </section>
    <footer className="es-foot"><span>One day, many worlds.</span><a href={APP_URL}>Already testing? Sign in</a></footer>
  </main>;
}

export default function EarlySite() {
  const [view, setView] = useState<View>(() => typeof location === 'undefined' ? 'home' : viewOf(location.hash));
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Older shared links to the in-page sign-up (#begin) now go to the waitlist.
    const change = () => { if (location.hash === '#begin') { location.replace(WAITLIST_URL); return; } setView(viewOf(location.hash)); top.current?.scrollIntoView?.(); };
    change(); addEventListener('hashchange', change); return () => removeEventListener('hashchange', change);
  }, []);
  return <div ref={top}>{view === 'demo' ? <><RecordingDemo standalone /><a className="es-leave" href="#"><ArrowLeft size={14} /> Back</a></> : <Home />}</div>;
}
