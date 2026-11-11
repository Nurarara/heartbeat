'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** A scripted day for demos and pitches. No account, no inference: every picture already exists. */
export type Moment = { at: string; weather: string; temp: number; title: string; why: string; src: string; fresh?: boolean; night?: boolean };

export const DAY: Moment[] = [
  { at: '06:20', weather: 'Sunny', temp: 6, title: 'Window seat sunrise', why: 'Clear dawn. First light over the rooftops, the cat still asleep.', src: '/art/morning.webp' },
  { at: '07:00', weather: 'Sunny', temp: 8, title: 'The dew post', why: 'Bright, dewy start. Something small and hopeful on its morning round.', src: '/demo/0700-dew-post.jpg', fresh: true },
  { at: '09:30', weather: 'Sunny', temp: 10, title: 'One tree, two dogs', why: 'Still sunny, and it is Saturday. Open fields and somewhere to run.', src: '/demo/sun-world.webp' },
  { at: '11:00', weather: 'Overcast', temp: 11, title: 'Whale over the market', why: 'Cloud rolled in. A slow, heavy sky that something huge could swim through.', src: '/demo/1100-whale-market.jpg', fresh: true },
  { at: '13:00', weather: 'Light rain', temp: 11, title: 'Riverside glasshouse', why: 'The first rain. Best watched from somewhere sheltered.', src: '/demo/rain-world.webp' },
  { at: '15:00', weather: 'Drizzle', temp: 12, title: 'The gutter regatta', why: 'Drizzle all afternoon, so the puddles become the adventure.', src: '/demo/1500-gutter-regatta.jpg', fresh: true },
  { at: '17:30', weather: 'Rain', temp: 11, title: 'Lamps on early', why: 'Dark comes early under rain. Warm lamps, back indoors.', src: '/art/rain.webp' },
  { at: '19:00', weather: 'After rain', temp: 13, title: 'Lilac after the rain', why: 'The rain just stopped. Clean air, wet reflections, a calm ride home.', src: '/demo/1900-lilac-tram.jpg', fresh: true },
  { at: '20:30', weather: 'Clearing', temp: 10, title: 'Violet hour', why: 'The sky cleared in time for the last colour of the day.', src: '/art/twilight.webp' },
  { at: '22:30', weather: 'Clear', temp: 8, title: 'Moon over the city', why: 'Late evening. Dim the room: one lamp and the moon.', src: '/art/night.webp', night: true },
  { at: '01:00', weather: 'Clear', temp: 6, title: 'The moon naps', why: 'Deep night. Near-black, tiny highlights, nothing to wake you.', src: '/demo/0100-moon-naps.jpg', fresh: true, night: true },
  { at: '03:30', weather: 'Clear', temp: 5, title: 'Lookout under the Milky Way', why: 'Small hours. An open dark sky and one tiny warm boat.', src: '/demo/night-world.webp', night: true },
];

const minutes = (at: string, index: number) => { const [h, m] = at.split(':').map(Number); const value = h * 60 + m; return index > 0 && value < 300 ? value + 1440 : value; };
const STARTS = DAY.map((moment, index) => minutes(moment.at, index));
const clock = (value: number) => { const v = Math.round(value) % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
const SPAN_START = 360, SPAN_END = 360 + 1440;

export function TimeLapse({ seconds = 5 }: { seconds?: number }) {
  const [{ index, progress }, setPlace] = useState({ index: 0, progress: 0 }), [playing, setPlaying] = useState(true), [speed, setSpeed] = useState(1);
  const [reduced, setReduced] = useState(false);
  const last = useRef<number | null>(null);
  useEffect(() => { const query = window.matchMedia('(prefers-reduced-motion: reduce)'); setReduced(query.matches); const change = () => setReduced(query.matches); query.addEventListener('change', change); return () => query.removeEventListener('change', change); }, []);
  useEffect(() => { DAY.forEach(moment => { const image = new Image(); image.src = moment.src; }); }, []);
  useEffect(() => {
    if (!playing) { last.current = null; return; }
    let frame = 0;
    const tick = (now: number) => {
      if (document.hidden) { last.current = now; frame = requestAnimationFrame(tick); return; }
      const step = last.current === null ? 0 : (now - last.current) / 1000 * speed / seconds; last.current = now;
      setPlace(current => { const next = current.progress + step; return next >= 1 ? { index: (current.index + 1) % DAY.length, progress: 0 } : { index: current.index, progress: next }; });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, seconds]);
  const go = useCallback((target: number) => setPlace({ index: (target + DAY.length) % DAY.length, progress: 0 }), []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === ' ') { event.preventDefault(); setPlaying(value => !value); }
      else if (event.key === 'ArrowRight') go(index + 1);
      else if (event.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [go, index]);
  const moment = DAY[index], start = STARTS[index], end = index + 1 < DAY.length ? STARTS[index + 1] : SPAN_END;
  const now = start + (end - start) * progress;
  const along = (value: number) => `${Math.max(0, Math.min(100, (value - SPAN_START) / (SPAN_END - SPAN_START) * 100))}%`;
  return (
    <main className={`tl${moment.night ? ' tl-night' : ''}`} data-reduced={reduced || undefined}>
      <div className="tl-stage" aria-hidden="true">
        {DAY.map((item, i) => <img key={item.src} src={item.src} alt="" className={i === index ? 'on' : ''} decoding="async" />)}
      </div>
      <header className="tl-top">
        <a href="/" className="tl-brand">heartbeat<span>.</span></a>
        <span className="tl-tag">Demo · a day in one minute</span>
        <div className="tl-controls">
          <button type="button" onClick={() => setPlaying(value => !value)} aria-pressed={!playing}>{playing ? 'Pause' : 'Play'}</button>
          <button type="button" onClick={() => setSpeed(value => value === 1 ? 2 : value === 2 ? .5 : 1)} aria-label="Change speed">{speed}×</button>
          <button type="button" onClick={() => go(0)}>Restart</button>
        </div>
      </header>
      <section className="tl-reading" aria-live="polite">
        <p className="tl-place">London · Saturday</p>
        <p className="tl-clock">{clock(now)}</p>
        <p className="tl-chips"><span>{moment.weather}</span><span>{moment.temp}°C</span><span className={moment.fresh ? 'fresh' : ''}>{moment.fresh ? 'New · made by Heartbeat' : 'Earlier artwork'}</span></p>
        <h1 className="tl-title">{moment.title}</h1>
        <p className="tl-why"><b>Why this picture</b>{moment.why}</p>
      </section>
      <nav className="tl-line" aria-label="Moments of the day">
        <div className="tl-track"><i style={{ width: along(now) }} /></div>
        {DAY.map((item, i) => (
          <button type="button" key={item.at} style={{ left: along(STARTS[i]) }} className={`${i === index ? 'on' : ''}${item.fresh ? ' fresh' : ''}`} onClick={() => go(i)} aria-label={`${item.at} ${item.title}`} aria-current={i === index ? 'true' : undefined}>
            <span>{item.at}</span>
          </button>
        ))}
      </nav>
      <p className="tl-note">Weather and times are a scripted example. Pictures marked “New” were generated for this demo; the director’s reasons are written for illustration.</p>
    </main>
  );
}
