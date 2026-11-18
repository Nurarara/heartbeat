"use client";
// The public website: what Heartbeat is, how it works, downloads for every device, FAQ, terms and privacy.
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Apple, Download, Monitor, Moon, Smartphone, Sparkles, Sun, Tablet, Tv, CloudRain, Lock } from 'lucide-react';

type MoodCard = { id: string; label: string; colour: string; art: string; line: string };
const MOOD_ART: MoodCard[] = [
  { id: 'auto', label: 'Auto', colour: '#c9ccd0', art: '/demo/art/03-london-rain.webp', line: 'Follows your time and weather.' },
  { id: 'calm', label: 'Calm', colour: '#7fa8d6', art: '/demo/art/04-watercolour-coast.webp', line: 'Slow, spacious, peaceful.' },
  { id: 'cosy', label: 'Cosy', colour: '#d89a5b', art: '/demo/art/05-winter-refuge.webp', line: 'Warm lamps and sheltered corners.' },
  { id: 'focus', label: 'Focus', colour: '#5f9d8a', art: '/demo/art/07-mountain-observatory.webp', line: 'Quiet shapes, room to think.' },
  { id: 'playful', label: 'Playful', colour: '#f6b44b', art: '/demo/art/13-gutter-regatta.webp', line: 'Small smiles, gentle humour.' },
  { id: 'dreamy', label: 'Dreamy', colour: '#b48ad9', art: '/demo/art/12-whale-market.webp', line: 'Impossible places, soft glow.' },
  { id: 'romantic', label: 'Romantic', colour: '#b0386a', art: '/demo/art/14-lilac-tram.webp', line: 'Dim, warm and intimate.' },
  { id: 'sleep', label: 'Sleep', colour: '#3a4670', art: '/demo/art/15-moon-naps.webp', line: 'Near-black and still. Made for night.' },
];
const ROTATION = ['/demo/art/03-london-rain.webp', '/demo/art/02-meadow-play.webp', '/demo/art/10-autumn-railway.webp', '/demo/art/06-starlit-water.webp', '/demo/art/11-dew-post.webp', '/demo/art/08-moss-after-rain.webp', '/demo/art/01-sunday-window.webp'];

type Platform = 'windows' | 'mac' | 'android' | 'iphone' | 'other';
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  if (/Windows/.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  return 'other';
}
const DOWNLOADS: Record<Exclude<Platform, 'other'>, { label: string; href: string; note: string }> = {
  windows: { label: 'Download for Windows', href: '/downloads/Heartbeat.exe', note: 'Windows 10 and 11 · under 100 KB' },
  mac: { label: 'Download for Mac', href: '/downloads/Heartbeat-mac.zip', note: 'macOS 13 or later · Apple silicon and Intel' },
  android: { label: 'Download for Android', href: '/downloads/Heartbeat.apk', note: 'Android 8 or later · under 100 KB' },
  iphone: { label: 'Set up on iPhone', href: '/download#iphone', note: 'Home Screen app and lock screen picture' },
};

function useReveal() {
  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>('.ps-reveal'));
    if (!('IntersectionObserver' in window)) { items.forEach(i => i.classList.add('ps-in')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('ps-in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    items.forEach(i => io.observe(i));
    return () => io.disconnect();
  }, []);
}

function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { let on = true; fetch('/api/product/auth/session', { cache: 'no-store' }).then(r => r.json() as Promise<{ user?: unknown }>).then(d => { if (on) setSignedIn(!!d.user); }).catch(() => {}); return () => { on = false; }; }, []);
  return signedIn;
}

export function SiteNav({ solid = false }: { solid?: boolean }) {
  const signedIn = useSignedIn(), [scrolled, setScrolled] = useState(solid);
  useEffect(() => { if (solid) return; const on = () => setScrolled(window.scrollY > 24); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, [solid]);
  return <header className="ps-nav" data-solid={scrolled}>
    <a href="/" className="ps-brand" aria-label="Heartbeat home"><span className="ps-brand-dot" aria-hidden="true" />heartbeat</a>
    <nav aria-label="Main">
      <a href="/#how">How it works</a><a href="/download">Download</a><a href="/#faq">FAQ</a>
      {signedIn ? <a className="ps-nav-cta" href="/display">Open my display <ArrowRight size={14} /></a> : <a className="ps-nav-cta" href="/auth">Sign in <ArrowRight size={14} /></a>}
    </nav>
  </header>;
}

export function SiteFooter() {
  return <footer className="ps-footer">
    <div><a href="/" className="ps-brand"><span className="ps-brand-dot" aria-hidden="true" />heartbeat</a><p>AI for ambience. A screen with a pulse.</p></div>
    <nav aria-label="Footer"><a href="/download">Download</a><a href="/#faq">FAQ</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="mailto:hello@heartbeatart.co.uk">Contact</a></nav>
    <small>© {new Date().getFullYear()} Heartbeat · London</small>
  </footer>;
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const t0 = setTimeout(() => setNow(new Date()), 0); const t = setInterval(() => setNow(new Date()), 15000); return () => { clearTimeout(t0); clearInterval(t); }; }, []);
  return <time className="ps-clock" aria-label="Your local time">{now ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}</time>;
}

/** A chosen mood stays on the hero for 20 seconds before the slideshow resumes. */
const holdUntil = () => Date.now() + 20000;

export function PublicSite() {
  useReveal();
  const [platform, setPlatform] = useState<Platform>('other');
  const [index, setIndex] = useState(0), [mood, setMood] = useState<MoodCard | null>(null), hold = useRef(0);
  useEffect(() => { const t = setTimeout(() => setPlatform(detectPlatform()), 0); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => { if (Date.now() < hold.current) return; setMood(null); setIndex(i => (i + 1) % ROTATION.length); }, 7000);
    return () => clearInterval(t);
  }, []);
  const choose = (m: MoodCard) => { setMood(m); hold.current = holdUntil(); };
  const art = mood ? mood.art : ROTATION[index];
  const layers = Array.from(new Set([...ROTATION, ...MOOD_ART.map(m => m.art)]));
  const primary = platform === 'other' ? null : DOWNLOADS[platform];

  return <div className="ps-site">
    <SiteNav />
    <section className="ps-hero" aria-label="Heartbeat" style={{ ['--mood' as string]: mood?.colour || '#fc684b' }}>
      <div className="ps-hero-art" aria-hidden="true">{layers.map(src => <img key={src} src={src} alt="" data-on={src === art} loading={src === ROTATION[0] ? 'eager' : 'lazy'} />)}</div>
      <div className="ps-hero-shade" aria-hidden="true" />
      <div className="ps-hero-copy">
        <p className="ps-eyebrow"><span className="ps-pulse" aria-hidden="true" /> AI FOR AMBIENCE</p>
        <h1>A screen<br /><em>with a pulse.</em></h1>
        <p className="ps-lede">Heartbeat paints a new original picture for the moment you’re in: your time, your weather, the sun and moon, and your mood. On your wallpaper, your screensaver and your lock screen.</p>
        <div className="ps-ctas">
          {primary ? <a className="ps-button" href={primary.href} download={platform !== 'iphone' ? true : undefined}>{platform === 'iphone' ? <Apple size={17} /> : <Download size={17} />}{primary.label}</a> : <a className="ps-button" href="/download"><Download size={17} />Get Heartbeat</a>}
          <a className="ps-button ps-ghost" href="/auth">Sign in</a>
        </div>
        <p className="ps-fine">{primary ? primary.note + ' · ' : ''}Free during the private test. <a href="#request">Request access</a> · <a href="/download">All devices</a></p>
      </div>
      <div className="ps-hero-meta" aria-hidden="true"><Clock /><span>{mood ? `${mood.label} · ${mood.line}` : 'A new picture, every hour'}</span></div>
      <a className="ps-scroll" href="#how" aria-label="Scroll to how it works"><span /></a>
    </section>

    <section className="ps-moods ps-reveal" aria-labelledby="moods-title">
      <div className="ps-section-head"><p className="ps-eyebrow">EIGHT MOODS</p><h2 id="moods-title">Choose how the room <em>feels.</em></h2><p>Tap a mood. Heartbeat still follows the time and weather, and the night always stays dark and restful.</p></div>
      <div className="ps-mood-row" role="group" aria-label="Moods">
        {MOOD_ART.map(m => <button key={m.id} className="ps-mood" aria-pressed={mood?.id === m.id} onClick={() => { choose(m); document.querySelector('.ps-hero')?.scrollIntoView({ behavior: 'smooth' }); }} style={{ ['--c' as string]: m.colour }}>
          <img src={m.art} alt="" loading="lazy" /><span><i aria-hidden="true" />{m.label}</span><small>{m.line}</small>
        </button>)}
      </div>
    </section>

    <section id="how" className="ps-how" aria-labelledby="how-title">
      <div className="ps-section-head ps-reveal"><p className="ps-eyebrow">HOW IT WORKS</p><h2 id="how-title">Three steps. <em>Then nothing.</em></h2></div>
      <ol className="ps-steps">
        <li className="ps-reveal"><span>1</span><h3>Sign in with your email</h3><p>We send a six-digit code. No password to remember.</p></li>
        <li className="ps-reveal"><span>2</span><h3>Choose your city and mood</h3><p>Your city gives Heartbeat your time, weather and sky. Change the mood whenever you like.</p></li>
        <li className="ps-reveal"><span>3</span><h3>Let it live on your screens</h3><p>Install it once. A fresh picture arrives every hour, as your wallpaper, screensaver or lock screen.</p></li>
      </ol>
      <div className="ps-promise ps-reveal">
        <div><Sun size={20} /><h3>Knows the sky</h3><p>Golden hour, blue hour, a low winter sun, a crescent moon: worked out for your city.</p></div>
        <div><CloudRain size={20} /><h3>Feels the weather</h3><p>Rain, fog, a cold clear morning. The picture follows what’s outside.</p></div>
        <div><Moon size={20} /><h3>Dark at night</h3><p>After sunset it dims, then goes near-black, so it never lights up a sleeping room.</p></div>
        <div><Lock size={20} /><h3>Private by design</h3><p>No location tracking, no ads, no selling data. Just your city, your mood and your pictures.</p></div>
      </div>
    </section>

    <section id="devices" className="ps-devices" aria-labelledby="devices-title">
      <div className="ps-section-head ps-reveal"><p className="ps-eyebrow">EVERYWHERE YOU LOOK</p><h2 id="devices-title">One account. <em>Every screen.</em></h2><p>Sign in on each device with the same email. Change the mood on one, and the rest follow.</p></div>
      <div className="ps-device-grid">
        <DeviceCard icon={<Monitor size={22} />} name="Windows" what="Wallpaper and screensaver. Starts with Windows." href="/downloads/Heartbeat.exe" cta="Download .exe" current={platform === 'windows'} />
        <DeviceCard icon={<Apple size={22} />} name="Mac" what="Wallpaper, plus full-screen Heartbeat when your Mac is idle." href="/downloads/Heartbeat-mac.zip" cta="Download for Mac" current={platform === 'mac'} />
        <DeviceCard icon={<Smartphone size={22} />} name="Android" what="Lock screen picture, and a screensaver while charging." href="/downloads/Heartbeat.apk" cta="Download .apk" current={platform === 'android'} />
        <DeviceCard icon={<Tablet size={22} />} name="iPhone & iPad" what="A Home Screen app, and your lock screen picture through Shortcuts." href="/download#iphone" cta="How to set up" current={platform === 'iphone'} />
        <DeviceCard icon={<Tv size={22} />} name="Any browser or TV" what="Open your display full-screen on any screen with a browser." href="/display" cta="Open display" current={false} />
      </div>
      <p className="ps-fine ps-center ps-reveal">Step-by-step help for each device is on the <a href="/download">download page</a>.</p>
    </section>

    <section id="faq" className="ps-faq" aria-labelledby="faq-title">
      <div className="ps-section-head ps-reveal"><p className="ps-eyebrow">QUESTIONS</p><h2 id="faq-title">Good to <em>know.</em></h2></div>
      <div className="ps-faq-list ps-reveal">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </section>

    <RequestAccess />

    <section className="ps-final ps-reveal">
      <Sparkles size={22} /><h2>Let the day in. <em>Leave the noise outside.</em></h2>
      <div className="ps-ctas ps-center"><a className="ps-button" href="/download"><Download size={17} />Get Heartbeat</a><a className="ps-button ps-ghost" href="/auth">Sign in</a></div>
    </section>
    <SiteFooter />
  </div>;
}

/** Ask to join the private test. The owner gets an email and sees it on the dashboard. */
function RequestAccess() {
  const [name, setName] = useState(''), [address, setAddress] = useState(''), [note, setNote] = useState(''), [trap, setTrap] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle'), [error, setError] = useState('');
  async function send(event: React.FormEvent) {
    event.preventDefault(); setState('sending'); setError('');
    try {
      const r = await fetch('/api/product/access-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email: address, note, website: trap }) });
      const d = await r.json() as { error?: string };
      if (!r.ok) throw new Error(d.error || 'Please try again in a moment.');
      setState('done');
    } catch (e) { setError((e as Error).message); setState('idle'); }
  }
  return <section id="request" className="ps-request ps-reveal" aria-labelledby="request-title">
    <div className="ps-section-head"><p className="ps-eyebrow">PRIVATE TEST</p><h2 id="request-title">Want to <em>try it?</em></h2><p>Heartbeat is in a small private test. Leave your email and we’ll let you know when there’s a place for you.</p></div>
    {state === 'done' ? <p className="ps-request-done" role="status">Thank you. We’ll email you when there’s a place for you.</p> :
    <form className="ps-request-form" onSubmit={send}>
      <label>Your name<input value={name} onChange={e => setName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Alex" /></label>
      <label>Email<input type="email" required value={address} onChange={e => setAddress(e.target.value)} maxLength={254} autoComplete="email" placeholder="you@example.com" /></label>
      <label className="ps-wide"><span className="ps-label">Anything you’d like to tell us? <span>(optional)</span></span><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3} placeholder="Which screens would you use it on?" /></label>
      {/* Hidden from people; robots fill it in. */}
      <label className="ps-trap" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} /></label>
      <button className="ps-button" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Request access'}<ArrowRight size={16} /></button>
      {error && <p className="ps-request-error" role="alert">{error}</p>}
      <p className="ps-fine ps-wide">We only use your email to reply about Heartbeat. <a href="/privacy">Privacy</a></p>
    </form>}
  </section>;
}

function DeviceCard({ icon, name, what, href, cta, current }: { icon: React.ReactNode; name: string; what: string; href: string; cta: string; current: boolean }) {
  const file = href.startsWith('/downloads/');
  return <article className="ps-device ps-reveal" data-current={current}>
    <div className="ps-device-icon">{icon}</div><h3>{name}{current && <small>This device</small>}</h3><p>{what}</p>
    <a href={href} download={file ? true : undefined}>{cta} <ArrowRight size={14} /></a>
  </article>;
}

export const FAQ: [string, string][] = [
  ['What is Heartbeat?', 'An ambient art service. It paints a new original picture for your city’s time, weather and sky, in the mood you choose, and shows it on your screens as a wallpaper, screensaver or lock screen.'],
  ['How often does the picture change?', 'Every hour, while a screen is showing Heartbeat. Pictures aren’t made while your devices are asleep or locked, so nothing is wasted.'],
  ['Does it work at night?', 'Yes, and gently. After sunset pictures get dim, then near-black, with only tiny highlights, so Heartbeat never lights up a dark room.'],
  ['Will the screensaver hide my notifications?', 'No. On a phone, the lock screen picture sits behind your notifications as usual, and the charging screensaver works like your phone’s own clock screensaver: notifications still sound and appear as soon as you touch the screen. On a computer, Heartbeat steps aside the moment you move the mouse or press a key, and it won’t start while a video or call is keeping the screen awake.'],
  ['Does it drain my battery?', 'Very little. The pictures are made on our servers; your device only downloads one small image now and then. On battery, the screensaver lets your screen sleep as normal.'],
  ['Why does Windows or my Mac warn me when I install it?', 'Heartbeat is new, and paid “trusted developer” certificates come later. Windows: choose More info → Run anyway. Mac: open System Settings → Privacy & Security → Open Anyway. The download page walks you through it.'],
  ['Is it on the App Store or Google Play?', 'Not yet. Android is being prepared for Google Play; for now, download it here. On iPhone and iPad, Heartbeat works as a Home Screen app plus a lock screen picture through Apple’s Shortcuts app, with no App Store needed.'],
  ['What do you know about me?', 'Your email, the city you choose, your mood, your pictures, and when and for how long a Heartbeat screen is showing. No precise location, contacts, photos or ads. Read the privacy notice for the details.'],
  ['How do I get access?', 'Heartbeat is in a small private test. If you were invited, sign in with that email. Otherwise, use “Request access” on this page and we’ll email you when there’s a place for you.'],
  ['How do I stop or remove it?', 'Windows: right-click the Heartbeat icon by the clock → Uninstall. Mac: menu bar icon → Quit, then drag Heartbeat to the Bin. Android: uninstall like any app. Your previous wallpaper and screensaver are put back.'],
];
