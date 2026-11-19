"use client";
// The company site at heartbeatart.co.uk: the living hero, then the journal, Labs and principles.
// Static and pre-rendered (scripts/export-site.mjs). No accounts, no AI, no requests. "Make it yours" and
// "Try Heartbeat" go to the app site, where people join the early access list.
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Moon, Play, Sun } from 'lucide-react';
import RecordingDemo from './recording-demo';
import { APP_URL, CONTACT, HORIZONS, JOURNAL, PRINCIPLES, PRINCIPLES_DATE, QUESTIONS, WAITLIST_URL, entryHref, formatDate, sortedJournal, type Block, type Category, type Entry } from '@/lib/company-content';
import './company-site.css';

export { APP_URL, WAITLIST_URL };
const art = (name: string) => `/demo/art/${name}.webp`;
const HOME_ART = ['03-london-rain', '02-meadow-play', '12-whale-market', '06-starlit-water', '14-lilac-tram'];

export type Page = { path: string; title: string; description: string };
const SITE = 'Heartbeat';
/** Every page the export writes. */
export function pages(): Page[] {
  return [
    { path: '/', title: `${SITE} · a screen with a pulse`, description: 'Heartbeat builds ambient intelligence: technology that senses the moment and answers with calm. Our first product paints a new picture for your time, weather, sky and mood.' },
    { path: '/journal', title: `Journal · ${SITE}`, description: 'Notes, principles and releases from Heartbeat.' },
    ...JOURNAL.filter(entry => !entry.href).map(entry => ({ path: entryHref(entry), title: `${entry.title} · ${SITE}`, description: entry.summary })),
    { path: '/principles', title: `Principles · ${SITE}`, description: 'Calm first, private by design, dark at night, never the same twice. What Heartbeat will and won’t build.' },
    { path: '/labs', title: `Labs · ${SITE}`, description: 'The questions Heartbeat Labs works on, and where the pulse goes next.' },
    { path: '/demo', title: `Demo · ${SITE}`, description: 'One day, fifteen worlds: prepared Heartbeat paintings changing through a day.' },
  ];
}
export const normalise = (path: string) => (path.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/');

// ---------- shared pieces ----------

function ThemeToggle() {
  function flip() {
    const root = document.documentElement;
    const now = root.getAttribute('data-theme') || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = now === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('heartbeat-theme', next); } catch { /* The choice lasts for this visit only. */ }
  }
  return <button type="button" className="hb-theme" onClick={flip} aria-label="Switch between light and dark" title="Light or dark">
    <Moon className="hb-moon" size={15} aria-hidden="true" /><Sun className="hb-sun" size={15} aria-hidden="true" />
  </button>;
}

function Nav({ over = false }: { over?: boolean }) {
  return <header className={over ? 'hb-nav hb-nav-over' : 'hb-nav'}>
    <a className="hb-mark" href="/"><i aria-hidden="true" />heartbeat</a>
    <nav aria-label="Main">
      <a href="/journal">Journal</a><a href="/labs">Labs</a><a href="/principles">Principles</a>
      <ThemeToggle />
      <a className="hb-try" href={APP_URL}>Try Heartbeat <ArrowRight size={14} aria-hidden="true" /></a>
    </nav>
  </header>;
}

function Footer() {
  return <footer className="hb-band hb-footer"><div className="hb-w">
    <div className="hb-foot">
      <a className="hb-mark" href="/"><i aria-hidden="true" />heartbeat</a>
      <ul aria-label="Company"><li><a href="/journal">Journal</a></li><li><a href="/labs">Labs</a></li><li><a href="/principles">Principles</a></li><li><a href="/demo">Demo</a></li></ul>
      <ul aria-label="Product"><li><a href={APP_URL}>Try Heartbeat</a></li><li><a href={WAITLIST_URL}>Join early access</a></li><li><a href={APP_URL + 'download'}>Download</a></li><li><a href={APP_URL + 'auth'}>Sign in</a></li></ul>
      <div className="hb-mission"><p className="hb-label">Our mission</p><p>Heartbeat builds ambient intelligence: technology that senses the moment and answers with calm. We start with your sky.</p></div>
    </div>
    <div className="hb-small"><span>© 2026 Heartbeat · London · {CONTACT}</span><span><a href={APP_URL + 'terms'}>Terms</a> · <a href={APP_URL + 'privacy'}>Privacy</a></span></div>
  </div></footer>;
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((block, i) => 'h' in block ? <h2 key={i}>{block.h}</h2> : 'p' in block ? <p key={i}>{block.p}</p> : 'quote' in block ? <blockquote key={i}>{block.quote}</blockquote> : <ul key={i}>{block.list.map(item => <li key={item}>{item}</li>)}</ul>)}</>;
}

const FILTERS: ('All' | Category)[] = ['All', 'Notes', 'Principles', 'Release', 'Company'];
function JournalTable({ limit }: { limit?: number }) {
  const [filter, setFilter] = useState<'All' | Category>('All');
  const all = sortedJournal(), shown = all.filter(entry => filter === 'All' || entry.category === filter).slice(0, limit);
  return <>
    <div className="hb-filters" role="group" aria-label="Show">{FILTERS.map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'Release' ? 'Releases' : f}</button>)}</div>
    <table className="hb-table">
      <thead><tr><th scope="col">Title</th><th scope="col">Summary</th><th scope="col">Category</th><th scope="col">Date</th></tr></thead>
      <tbody>{shown.map(entry => <tr key={entry.slug}><td className="hb-t"><a href={entryHref(entry)}>{entry.title}</a></td><td className="hb-s">{entry.summary}</td><td className="hb-c">{entry.category}</td><td className="hb-d"><time dateTime={entry.date}>{formatDate(entry.date)}</time></td></tr>)}</tbody>
    </table>
  </>;
}

// ---------- almanac drawings (drawn here, so they follow light and dark) ----------

function SunPath() {
  const arcs: [number, number, string][] = [[62, 120, 'Winter'], [118, 150, 'Equinox'], [166, 172, 'Summer']];
  return <svg viewBox="0 0 400 250" aria-hidden="true"><rect className="c-bg" width="400" height="250" />
    <line className="c-ink" x1="24" y1="200" x2="376" y2="200" />
    {Array.from({ length: 13 }, (_, h) => <line key={h} className="c-ink" x1={24 + h * 352 / 12} y1="200" x2={24 + h * 352 / 12} y2={h % 3 ? 204 : 208} />)}
    {arcs.map(([peak, w, name], i) => <g key={name}><path className={i === 2 ? 'c-ink' : 'c-soft'} strokeDasharray={i === 1 ? '3 4' : undefined} d={`M${200 - w} 200 Q 200 ${200 - peak * 2} ${200 + w} 200`} /><text className="c-txt" x="200" y={200 - peak - (i === 0 ? 8 : 10)} textAnchor="middle">{name.toUpperCase()}</text></g>)}
    <circle className="c-acc" cx="118" cy="117" r="7" />
    <text className="c-txt2" x="24" y="230">SUN PATH · LONDON 51.5°N</text>
  </svg>;
}
function Brightness() {
  const points = Array.from({ length: 49 }, (_, s) => { const hr = s / 2, b = hr < 6 || hr > 20 ? .06 : Math.max(.06, Math.sin(Math.PI * (hr - 6) / 14)); return `${(24 + hr * 352 / 24).toFixed(1)},${(200 - b * 130).toFixed(1)}`; }).join(' ');
  return <svg viewBox="0 0 400 250" aria-hidden="true"><rect className="c-bg" width="400" height="250" />
    <rect className="c-shade" x="24" y="50" width="88" height="150" /><rect className="c-shade" x="317" y="50" width="59" height="150" />
    <line className="c-ink" x1="24" y1="200" x2="376" y2="200" />
    <polyline className="c-ink c-thick" points={points} />
    <circle className="c-acc" cx={24 + 13 * 352 / 24} cy={200 - Math.sin(Math.PI * 7 / 14) * 130} r="4.5" />
    {[['00', 24], ['06', 112], ['12', 200], ['18', 288], ['24', 376]].map(([t, x]) => <text key={t} className="c-txt2" x={x} y="216" textAnchor="middle">{t}</text>)}
    <text className="c-txt2" x="30" y="64">NIGHT</text>
    <text className="c-txt2" x="24" y="238">BRIGHTNESS THROUGH A DAY · NIGHT LIMIT 0.32</text>
  </svg>;
}
function Ingredients() {
  const groups = ['SUBJECT', 'OBJECT', 'PLACE', 'STYLE', 'TWIST', 'VIEW', 'PALETTE'], picked = [3, 6, 1, 4, 2, 5, 0];
  return <svg viewBox="0 0 400 250" aria-hidden="true"><rect className="c-bg" width="400" height="250" />
    {groups.map((g, c) => <g key={g}>{Array.from({ length: 8 }, (_, r) => <circle key={r} className={r === picked[c] ? 'c-acc' : 'c-dot'} cx={42 + c * 52} cy={40 + r * 18} r={r === picked[c] ? 5 : 3} />)}<text className="c-txt" x={42 + c * 52} y="200" textAnchor="middle" fontSize="8">{g}</text></g>)}
    <text className="c-txt2" x="24" y="230">SEVEN GROUPS · 350 WORDS · ONE FROM EACH</text>
  </svg>;
}
function Fingerprints() {
  const rows = [[3, 8, 2, 5, 9, 1, 6, 4], [7, 2, 6, 3, 1, 8, 5, 9], [2, 9, 4, 7, 5, 3, 8, 1], [6, 1, 8, 2, 7, 4, 9, 3], [4, 7, 1, 9, 3, 6, 2, 8]];
  return <svg viewBox="0 0 400 250" aria-hidden="true"><rect className="c-bg" width="400" height="250" />
    {rows.map((row, r) => <g key={r}>{row.map((v, i) => <rect key={i} className={r === 0 && i === 4 ? 'c-acc' : 'c-fill'} x={40 + i * 42} y={36 + r * 30} width={6 + v * 3} height="12" rx="1" />)}</g>)}
    <text className="c-txt2" x="24" y="230">CREATIVE MEMORY · RECENT FINGERPRINTS</text>
  </svg>;
}

// ---------- pages ----------

function useRotation(list: string[], seconds: number) {
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => { if (!document.hidden) setTurn(value => value + 1); }, seconds * 1000);
    return () => clearInterval(timer);
  }, [seconds]);
  return list[turn % list.length];
}

function Hero() {
  const picture = useRotation(HOME_ART, 7);
  return <section className="hb-hero" aria-label="Heartbeat">
    <div className="hb-hero-art" aria-hidden="true">{HOME_ART.map(name => <img key={name} src={art(name)} alt="" data-on={name === picture} loading={name === HOME_ART[0] ? 'eager' : 'lazy'} />)}<div className="hb-hero-shade" /></div>
    <Nav over />
    <div className="hb-hero-copy">
      <p className="hb-eyebrow">AI art for the room you are in</p>
      <h1>A screen<br />with a pulse.</h1>
      <p className="hb-lede">Heartbeat reads the time, the weather and the mood where you are, and paints a new picture for the moment. Never the same twice.</p>
      <div className="hb-actions"><a className="hb-primary" href={WAITLIST_URL}>Make it yours <ArrowRight size={18} aria-hidden="true" /></a><a className="hb-secondary" href="/demo"><Play size={15} aria-hidden="true" /> Watch the demo</a></div>
    </div>
    <div className="hb-hero-foot"><span>One day, many worlds.</span><span>Private testing · London</span></div>
  </section>;
}

function Home() {
  const latest = sortedJournal().slice(0, 3);
  const tiles: { slug: string; label: string; drawing: React.ReactNode; image: string; flip?: boolean }[] = [
    { slug: 'painting-the-real-sky', label: 'Sky', drawing: <SunPath />, image: '07-mountain-observatory' },
    { slug: 'why-night-has-to-be-dark', label: 'Night', drawing: <Brightness />, image: '06-starlit-water', flip: true },
    { slug: 'how-heartbeat-decides-a-picture', label: 'Method', drawing: <Ingredients />, image: '05-winter-refuge' },
    { slug: 'never-the-same-picture-twice', label: 'Memory', drawing: <Fingerprints />, image: '03-london-rain', flip: true },
  ];
  const bySlug = (slug: string) => JOURNAL.find(entry => entry.slug === slug)!;
  return <>
    <Hero />
    <main>
      <div className="hb-g"><div className="hb-w">
        <section className="hb-intro" aria-labelledby="intro-title">
          <div className="hb-stack"><p className="hb-label">Heartbeat · London</p><h2 id="intro-title">Every space has a pulse.</h2></div>
          <div className="hb-read">
            <p>Heartbeat builds ambient intelligence: technology that senses the moment and answers with calm instead of notifications.</p>
            <p>Our first product paints a new original picture for the time, the weather, the sky and the mood where you are, on your wallpaper, screensaver and lock screen.</p>
            <a className="hb-textlink" href="/principles">Read our principles</a>
          </div>
        </section>
        <section className="hb-latest" aria-label="Latest">{latest.map(entry => <a key={entry.slug} className="hb-card" href={entryHref(entry)}><span className="hb-meta"><span className="hb-dash" />{entry.category} · <time dateTime={entry.date}>{formatDate(entry.date)}</time></span><h3>{entry.title}</h3><p>{entry.summary}</p></a>)}</section>
      </div></div>

      <section className="hb-band hb-g" aria-labelledby="labs-title"><div className="hb-w hb-labs">
        <div className="hb-labs-head"><div className="hb-stack"><p className="hb-label">Heartbeat Labs</p><h2 id="labs-title">Questions we’re working on.</h2></div><p>The product proves the ideas; the lab pushes them further. These are the problems we think matter for spaces that can feel the moment.</p></div>
        <div className="hb-questions">{QUESTIONS.map(q => <div key={q.title} className="hb-q"><h3>{q.title}</h3><p>{q.text}</p></div>)}</div>
        <a className="hb-textlink hb-on-band" href="/labs">Where the pulse goes next</a>
      </div></section>

      <div className="hb-g"><div className="hb-w">
        <section className="hb-section" aria-labelledby="alm-title">
          <div className="hb-row-head"><h2 id="alm-title">From the almanac</h2><span className="hb-label">Notes on how Heartbeat sees the sky</span></div>
          <div className="hb-tiles">{tiles.map(tile => { const entry = bySlug(tile.slug); return <a key={tile.slug} className="hb-tile" href={entryHref(entry)}>
            <div className={tile.flip ? 'hb-art hb-flip' : 'hb-art'}>{tile.flip ? <><img src={art(tile.image)} alt="" loading="lazy" />{tile.drawing}</> : <>{tile.drawing}<img src={art(tile.image)} alt="" loading="lazy" /></>}</div>
            <span className="hb-label">{tile.label}</span><h3>{entry.title}</h3><p>{entry.summary}</p></a>; })}</div>
        </section>

        <section className="hb-section" aria-labelledby="j-title">
          <div className="hb-row-head"><h2 id="j-title">Journal</h2><a className="hb-label hb-plain" href="/journal">All {JOURNAL.length} entries →</a></div>
          <JournalTable limit={6} />
        </section>

        <section className="hb-doc" aria-labelledby="pr-title">
          <aside className="hb-toc" aria-label="Principles">{PRINCIPLES.map((p, i) => <a key={p.id} href={`/principles#${p.id}`}><span>{String(i + 1).padStart(2, '0')}</span>{p.title}</a>)}</aside>
          <article className="hb-body">
            <p className="hb-label">Principles · {formatDate(PRINCIPLES_DATE)}</p>
            <h2 id="pr-title" className="hb-doc-title">Heartbeat Principles</h2>
            {PRINCIPLES.slice(0, 2).map((p, i) => <div key={p.id}><h3>{String(i + 1).padStart(2, '0')} · {p.title}</h3><Blocks blocks={p.body} /></div>)}
            <a className="hb-textlink" href="/principles">Read all six principles</a>
          </article>
        </section>
      </div></div>
    </main>
  </>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <><div className="hb-g hb-nav-wrap"><div className="hb-w"><Nav /></div></div><main className="hb-g"><div className="hb-w">{children}</div></main></>;
}

function JournalPage() {
  return <Shell>
    <section className="hb-page-head"><p className="hb-label">Journal</p><h1>Notes, principles and releases.</h1><p className="hb-page-lede">What we are building, how it works, and what changed. Written plainly, dated, and kept up to date.</p></section>
    <section className="hb-section hb-first"><JournalTable /></section>
  </Shell>;
}

function Article({ entry }: { entry: Entry }) {
  const others = sortedJournal().filter(other => other.slug !== entry.slug).slice(0, 3);
  return <Shell>
    <article className="hb-article">
      <a className="hb-back" href="/journal"><ArrowLeft size={14} aria-hidden="true" /> Journal</a>
      <p className="hb-label">{entry.category} · <time dateTime={entry.date}>{formatDate(entry.date)}</time> · {entry.minutes} min read</p>
      <h1>{entry.title}</h1>
      <p className="hb-page-lede">{entry.summary}</p>
      <div className="hb-body hb-article-body"><Blocks blocks={entry.body} /></div>
    </article>
    <section className="hb-section" aria-labelledby="more-title"><div className="hb-row-head"><h2 id="more-title">More from the journal</h2></div>
      <div className="hb-latest hb-latest-flat">{others.map(other => <a key={other.slug} className="hb-card" href={entryHref(other)}><span className="hb-meta"><span className="hb-dash" />{other.category} · <time dateTime={other.date}>{formatDate(other.date)}</time></span><h3>{other.title}</h3><p>{other.summary}</p></a>)}</div>
    </section>
  </Shell>;
}

function PrinciplesPage() {
  return <Shell>
    <section className="hb-page-head"><p className="hb-label">Principles · {formatDate(PRINCIPLES_DATE)}</p><h1>Heartbeat Principles</h1><p className="hb-page-lede">What we believe a screen in your home should be, and what we will and won’t build to get there.</p></section>
    <div className="hb-doc hb-first">
      <aside className="hb-toc" aria-label="Chapters">{PRINCIPLES.map((p, i) => <a key={p.id} href={`#${p.id}`}><span>{String(i + 1).padStart(2, '0')}</span>{p.title}</a>)}</aside>
      <article className="hb-body">{PRINCIPLES.map((p, i) => <section key={p.id} id={p.id} className="hb-chapter"><h2>{String(i + 1).padStart(2, '0')} · {p.title}</h2><Blocks blocks={p.body} /></section>)}</article>
    </div>
  </Shell>;
}

function LabsPage() {
  return <Shell>
    <section className="hb-page-head"><p className="hb-label">Heartbeat Labs</p><h1>Every space has a pulse.</h1><p className="hb-page-lede">Heartbeat Labs studies ambient intelligence: how a place can sense the moment and answer with beauty instead of noise. The product proves the ideas; the lab pushes them further.</p></section>
    <section className="hb-section hb-first" aria-labelledby="q-title"><div className="hb-row-head"><h2 id="q-title">Questions we’re working on</h2></div>
      <div className="hb-questions hb-questions-paper">{QUESTIONS.map(q => <div key={q.title} className="hb-q"><h3>{q.title}</h3><p>{q.text}</p></div>)}</div>
    </section>
    <section className="hb-section" aria-labelledby="h-title"><div className="hb-row-head"><h2 id="h-title">Where the pulse goes next</h2><span className="hb-label">A direction, not a promise. Only “Now” exists today.</span></div>
      <div className="hb-horizons">{HORIZONS.map(h => <div key={h.when} className="hb-horizon" data-now={h.now ? 'true' : undefined}>
        <div className="hb-when"><b>{h.when}</b><span className="hb-reach"><i aria-hidden="true" />{h.reach}</span></div>
        <h3>{h.title}</h3>
        <ul>{h.items.map(item => <li key={item}>{item}</li>)}</ul>
      </div>)}</div>
    </section>
  </Shell>;
}

function DemoPage() {
  return <><RecordingDemo standalone /><a className="hb-leave" href="/"><ArrowLeft size={14} aria-hidden="true" /> Back</a></>;
}

function NotFound() {
  return <Shell><section className="hb-page-head hb-404"><p className="hb-label">404</p><h1>This page drifted off.</h1><p className="hb-page-lede">It may have moved. Try the <a href="/">home page</a> or the <a href="/journal">journal</a>.</p></section></Shell>;
}

export default function CompanySite({ path }: { path: string }) {
  const at = normalise(path);
  // Older links to the in-page sign-up (#begin) and the demo (#demo) still work.
  useEffect(() => {
    if (location.hash === '#begin') location.replace(WAITLIST_URL);
    else if (location.hash === '#demo' && normalise(location.pathname) === '/') location.replace('/demo');
  }, []);
  const entry = JOURNAL.find(item => !item.href && entryHref(item) === at);
  const page = at === '/' ? <Home /> : at === '/journal' ? <JournalPage /> : entry ? <Article entry={entry} /> : at === '/principles' ? <PrinciplesPage /> : at === '/labs' ? <LabsPage /> : at === '/demo' ? <DemoPage /> : <NotFound />;
  return <div className="hb-site" data-page={at === '/' ? 'home' : at.split('/')[1] || 'other'}>{page}{at !== '/demo' && <Footer />}</div>;
}
