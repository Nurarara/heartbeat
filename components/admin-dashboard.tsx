"use client";
import { useCallback, useEffect, useState } from 'react';
import { Activity, Clock3, Image as ImageIcon, MonitorSmartphone, RefreshCw, Trash2, UserPlus, Users, Wallet } from 'lucide-react';
import { Brand, productAPI } from './product-shell';
import { MOODS, parseMood } from '@/lib/moods';

type Tester = { email: string; note: string; invited_at: number; user_id: string | null; joined_at: number | null; last_sign_in: number | null; last_seen: number | null; sessions: number; seconds: number; seconds_today: number; pictures: number; pictures_today: number; mood: string | null; device: string | null };
type Session = { id: string; email: string; device: string; mood: string; started_at: number; last_seen: number; seconds: number };
type Overview = {
  generatedAt: number; days: number; seats: number; beta: boolean; cadenceMinutes: number; dailyPicturesPerTester: number;
  budget: { capMicros: number; spentMicros: number; reservedMicros: number; attempts: number; imageEstimateMicros: number; painter: string };
  testers: Tester[]; series: { day: string; seconds: number; viewers: number; sessions: number; pictures: number }[];
  hourly: { hour: number; seconds: number }[]; moods: { mood: string; seconds: number }[]; devices: { device: string; seconds: number; sessions: number }[];
  jobs: { id: string; email: string; status: string; reason: string | null; created_at: number; updated_at: number }[];
  liveNow: Session[]; sessions: Session[]; activity: { kind: string; email: string; detail: string; created_at: number }[];
};

const WATCH = 'var(--ad-series-1)', PICTURES = 'var(--ad-series-2)';
export function duration(seconds: number) {
  const s = Math.max(0, Math.round(seconds)); if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`;
}
function ago(at: number | null, now: number) {
  if (!at) return '—'; const s = Math.max(0, (now - at) / 1000);
  if (s < 90) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} d ago`;
}
const clock = (at: number) => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const money = (micros: number) => `$${(micros / 1e6).toFixed(2)}`;
const moodLabel = (mood: string | null) => mood ? MOODS[parseMood(mood)].label : '—';
const JOB: Record<string, string> = { ready: 'Ready', done: 'Ready', held: 'Kept current', failed: 'Failed', outcome_unknown: 'Failed', canceled: 'Cancelled' };
const KIND: Record<string, string> = { joined: 'joined the test', sign_in: 'signed in', code_sent: 'asked for a code', not_invited: 'tried to sign in (not invited)', screen_open: 'opened a screen', mood: 'changed mood', invited: 'was invited', removed: 'was removed' };

type Bar = { label: string; value: number; tip: string };
const STEPS = { time: [30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800], count: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000] };
/** A round axis top with one clean midpoint, e.g. 0 · 30m · 1h. */
function axisStep(max: number, unit: 'time' | 'count') { const list = STEPS[unit]; return list.find(step => step * 2 >= max) ?? Math.ceil(max / 2); }
function BarChart({ title, bars, color, format, unit, every = 1 }: { title: string; bars: Bar[]; color: string; format: (v: number) => string; unit: 'time' | 'count'; every?: number }) {
  const [hover, setHover] = useState<number | null>(null), [table, setTable] = useState(false);
  const step0 = axisStep(Math.max(0, ...bars.map(b => b.value)), unit), width = 640, height = 190, left = 44, bottom = 24, top = 10, max = step0 * 2, empty = bars.every(b => !b.value);
  const step = (width - left) / Math.max(1, bars.length), bar = Math.max(2, step - 2);
  const y = (v: number) => top + (height - top - bottom) * (1 - v / max);
  const ticks = [0, step0, max];
  return <section className="ad-card ad-chart">
    <header><h2>{title}</h2><button className="ad-link" onClick={() => setTable(v => !v)}>{table ? 'Show chart' : 'Show table'}</button></header>
    {empty && !table ? <p className="ad-empty ad-chart-empty">Nothing yet. This fills in as people watch.</p> : table ? <table className="ad-table ad-mini"><tbody>{bars.map(b => <tr key={b.label}><td>{b.label}</td><td className="ad-num">{format(b.value)}</td></tr>)}</tbody></table> :
      <div className="ad-plot">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {ticks.map((t, i) => <g key={i}><line x1={left} x2={width} y1={y(t)} y2={y(t)} className="ad-grid" /><text x={left - 8} y={y(t) + 4} textAnchor="end" className="ad-axis">{format(t)}</text></g>)}
          {bars.map((b, i) => {
            const x = left + i * step + 1, h = Math.max(0, height - bottom - y(b.value)), r = Math.min(4, bar / 2, h);
            return <g key={b.label} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={b.tip}>
              <rect x={left + i * step} y={top} width={step} height={height - top - bottom} fill="transparent" />
              {h > 0 && <path d={`M${x},${height - bottom} V${height - bottom - h + r} Q${x},${height - bottom - h} ${x + r},${height - bottom - h} H${x + bar - r} Q${x + bar},${height - bottom - h} ${x + bar},${height - bottom - h + r} V${height - bottom} Z`} fill={color} opacity={hover === null || hover === i ? 1 : .45} />}
              {i % every === 0 && <text x={x + bar / 2} y={height - 6} textAnchor="middle" className="ad-axis">{b.label}</text>}
            </g>;
          })}
          <line x1={left} x2={width} y1={height - bottom} y2={height - bottom} className="ad-baseline" />
        </svg>
        {hover !== null && <div className="ad-tooltip" style={{ left: `${((left + hover * step + step / 2) / width) * 100}%` }}>{bars[hover].tip}</div>}
      </div>}
  </section>;
}

function Breakdown({ title, rows, total }: { title: string; rows: { key: string; label: string; value: number; dot?: string }[]; total: number }) {
  return <section className="ad-card"><header><h2>{title}</h2></header>
    {rows.length ? <ul className="ad-breakdown">{rows.map(row => <li key={row.key}>
      <span className="ad-breakdown-label">{row.dot && <i style={{ background: row.dot }} aria-hidden="true" />}{row.label}</span>
      <span className="ad-track"><span style={{ width: `${total ? Math.max(2, (row.value / total) * 100) : 0}%` }} /></span>
      <span className="ad-num">{duration(row.value)} <small>{total ? Math.round((row.value / total) * 100) : 0}%</small></span>
    </li>)}</ul> : <p className="ad-empty">No viewing yet.</p>}
  </section>;
}

function Stat({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note?: string; tone?: 'live' | 'warn' }) {
  return <div className="ad-stat" data-tone={tone}><span className="ad-stat-label">{icon}{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

export function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(''), [days, setDays] = useState(14), [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(''), [note, setNote] = useState(''), [message, setMessage] = useState('');
  const load = useCallback(async () => {
    try { setData(await productAPI<Overview>(`admin/overview?days=${days}&tz=${new Date().getTimezoneOffset()}`)); setError(''); }
    catch (e) { const text = (e as Error).message; if (/sign in/i.test(text)) location.replace('/auth?next=%2Fadmin'); else setError(text); }
  }, [days]);
  useEffect(() => { const first = setTimeout(() => void load(), 0); const timer = setInterval(() => { if (!document.hidden) void load(); }, 30000); return () => { clearTimeout(first); clearInterval(timer); }; }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await productAPI('admin/invite', { email: invite, note }); setMessage(`${invite.trim()} can now sign in.`); setInvite(''); setNote(''); await load(); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(email: string) {
    if (!confirm(`Remove ${email} from the test? They are signed out straight away.`)) return;
    setBusy(true); setMessage('');
    try { await productAPI('admin/uninvite', { email }); setMessage(`${email} was removed.`); await load(); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }

  if (!data) return <div className="hp-site ad-root ad-loading"><Brand /><p role="status">{error || 'Loading the dashboard…'}</p></div>;
  const now = data.generatedAt, people = data.testers.filter(t => t.note !== 'You (owner)'), joined = people.filter(t => t.user_id);
  const today = data.series.at(-1), range = data.series.reduce((sum, d) => sum + d.seconds, 0), sessions = data.series.reduce((sum, d) => sum + d.sessions, 0);
  const viewTotal = data.moods.reduce((s, m) => s + Number(m.seconds), 0), deviceTotal = data.devices.reduce((s, m) => s + Number(m.seconds), 0);
  const cap = data.budget.capMicros, used = data.budget.spentMicros + data.budget.reservedMicros, share = cap ? used / cap : 0;
  const every = data.days > 21 ? 4 : data.days > 10 ? 2 : 1;

  return <div className="hp-site ad-root">
    <header className="ad-top"><Brand /><div><h1>Test dashboard</h1><p>Only you can see this page. Updated {new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · refreshes every 30 s</p></div>
      <div className="ad-controls"><label>Range<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label><button className="ad-button" onClick={() => void load()}><RefreshCw size={14} /> Refresh</button><a className="ad-button" href="/display">Open display</a></div></header>
    {error && <p className="ad-alert" role="alert">{error}</p>}

    <section className="ad-stats">
      <Stat icon={<Activity size={14} />} label="Watching now" value={String(new Set(data.liveNow.map(s => s.email)).size)} note={data.liveNow.length ? `${[...new Set(data.liveNow.map(s => s.email.split('@')[0]))].join(', ')}${data.liveNow.length > 1 ? ` · ${data.liveNow.length} screens` : ''}` : 'Nobody right now'} tone={data.liveNow.length ? 'live' : undefined} />
      <Stat icon={<Users size={14} />} label="Testers joined" value={`${joined.length} / ${people.length}`} note={`${data.seats - people.length} of ${data.seats} places left`} />
      <Stat icon={<Clock3 size={14} />} label="Watch time today" value={duration(today?.seconds || 0)} note={`${today?.viewers || 0} people · ${today?.sessions || 0} sessions`} />
      <Stat icon={<Clock3 size={14} />} label={`Watch time, ${data.days} days`} value={duration(range)} note={`Average session ${duration(sessions ? range / sessions : 0)}`} />
      <Stat icon={<ImageIcon size={14} />} label="Pictures today" value={String(today?.pictures || 0)} note={`New picture every ${data.cadenceMinutes} min · up to ${data.dailyPicturesPerTester} each a day`} />
      <Stat icon={<Wallet size={14} />} label="Spent today (UTC)" value={money(used)} note={cap ? `of ${money(cap)} daily cap · ${data.budget.painter}` : 'No daily cap set'} tone={share >= .8 ? 'warn' : undefined} />
    </section>
    {cap > 0 && <div className="ad-meter" role="meter" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={used} aria-label="Daily spend"><span style={{ width: `${Math.min(100, share * 100)}%` }} data-warn={share >= .8} /><small>{share >= 1 ? 'Daily cap reached: screens keep their last picture until midnight UTC.' : `${Math.round(share * 100)}% of today’s cap used`}</small></div>}

    <div className="ad-grid-2">
      <BarChart title="Watch time per day" unit="time" color={WATCH} every={every} format={duration} bars={data.series.map(d => ({ label: shortDay(d.day), value: d.seconds, tip: `${shortDay(d.day)} · ${duration(d.seconds)} · ${d.viewers} people · ${d.sessions} sessions` }))} />
      <BarChart title="Pictures made per day" unit="count" color={PICTURES} every={every} format={v => String(Math.round(v))} bars={data.series.map(d => ({ label: shortDay(d.day), value: d.pictures, tip: `${shortDay(d.day)} · ${d.pictures} pictures` }))} />
    </div>
    <div className="ad-grid-3">
      <BarChart title="When people watch (your time)" unit="time" color={WATCH} every={3} format={duration} bars={data.hourly.map(h => ({ label: `${String(h.hour).padStart(2, '0')}`, value: h.seconds, tip: `${String(h.hour).padStart(2, '0')}:00–${String((h.hour + 1) % 24).padStart(2, '0')}:00 · ${duration(h.seconds)}` }))} />
      <Breakdown title="Moods used (watch time)" total={viewTotal} rows={data.moods.map(m => ({ key: m.mood, label: moodLabel(m.mood), value: Number(m.seconds), dot: MOODS[parseMood(m.mood)].colour }))} />
      <Breakdown title="Devices (watch time)" total={deviceTotal} rows={data.devices.map(d => ({ key: d.device, label: d.device[0].toUpperCase() + d.device.slice(1), value: Number(d.seconds) }))} />
    </div>

    <section className="ad-card"><header><h2>Testers</h2><span className="ad-sub">{people.length} invited · {data.seats} places</span></header>
      <form className="ad-invite" onSubmit={add}><UserPlus size={16} aria-hidden="true" /><input type="email" required placeholder="friend@example.com" value={invite} onChange={e => setInvite(e.target.value)} aria-label="Email to invite" /><input placeholder="Note (optional), e.g. Sam, iPad" value={note} maxLength={80} onChange={e => setNote(e.target.value)} aria-label="Note" /><button className="ad-button ad-primary" disabled={busy}>Invite</button></form>
      {message && <p className="ad-message" role="status">{message}</p>}
      <div className="ad-scroll"><table className="ad-table">
        <thead><tr><th>Person</th><th>Status</th><th>Joined</th><th>Last seen</th><th className="ad-num">Sessions</th><th className="ad-num">Watch total</th><th className="ad-num">Today</th><th className="ad-num">Avg session</th><th className="ad-num">Pictures</th><th>Mood</th><th>Device</th><th /></tr></thead>
        <tbody>{data.testers.map(t => {
          const live = !!t.last_seen && now - t.last_seen < 120000, status = live ? 'Watching' : t.user_id ? 'Joined' : 'Invited';
          return <tr key={t.email}><td><strong>{t.email}</strong>{t.note && <small>{t.note}</small>}</td><td><span className="ad-status" data-status={status.toLowerCase()}>{status}</span></td>
            <td>{t.joined_at ? clock(t.joined_at) : '—'}</td><td title={t.last_seen ? clock(t.last_seen) : ''}>{ago(t.last_seen, now)}</td><td className="ad-num">{t.sessions}</td><td className="ad-num">{duration(t.seconds)}</td><td className="ad-num">{duration(t.seconds_today)}</td><td className="ad-num">{duration(t.sessions ? t.seconds / t.sessions : 0)}</td><td className="ad-num">{t.pictures}{t.pictures_today ? <small> +{t.pictures_today} today</small> : null}</td><td>{moodLabel(t.mood)}</td><td>{t.device || '—'}</td>
            <td>{t.note !== 'You (owner)' && <button className="ad-icon" aria-label={`Remove ${t.email}`} title="Remove from test" disabled={busy} onClick={() => void remove(t.email)}><Trash2 size={14} /></button>}</td></tr>;
        })}</tbody></table></div>
    </section>

    <section className="ad-card"><header><h2>Recent pictures</h2><span className="ad-sub">{data.jobs.filter(j => j.status === 'failed' || j.status === 'outcome_unknown').length} failed of the last {data.jobs.length}</span></header>
      {data.jobs.length ? <div className="ad-scroll"><table className="ad-table"><thead><tr><th>Asked</th><th>Person</th><th>Result</th><th className="ad-num">Took</th><th>Why it failed</th></tr></thead><tbody>
        {data.jobs.map(j => { const result = JOB[j.status] || j.status; return <tr key={j.id}><td>{clock(j.created_at)}</td><td>{j.email}</td><td><span className="ad-status" data-status={result === 'Ready' ? 'joined' : result === 'Failed' ? 'failed' : 'invited'}>{result}</span></td><td className="ad-num">{duration((j.updated_at - j.created_at) / 1000)}</td><td className="ad-reason">{j.status === 'failed' || j.status === 'outcome_unknown' ? (j.reason || 'no reason recorded') : j.reason && j.status !== 'ready' && j.status !== 'done' ? `waiting: ${j.reason}` : ''}</td></tr>; })}
      </tbody></table></div> : <p className="ad-empty">No pictures asked for yet.</p>}
    </section>

    <div className="ad-grid-2">
      <section className="ad-card"><header><h2>Recent screen sessions</h2><MonitorSmartphone size={15} aria-hidden="true" /></header>
        {data.sessions.length ? <div className="ad-scroll"><table className="ad-table"><thead><tr><th>Person</th><th>Started</th><th className="ad-num">Length</th><th>Mood</th><th>Device</th></tr></thead><tbody>
          {data.sessions.map(s => <tr key={s.id}><td>{now - s.last_seen < 120000 && <span className="ad-live-dot" aria-label="watching now" />}{s.email}</td><td>{clock(s.started_at)}</td><td className="ad-num">{duration(s.seconds)}</td><td>{moodLabel(s.mood)}</td><td>{s.device}</td></tr>)}
        </tbody></table></div> : <p className="ad-empty">No sessions yet. They appear when someone opens their display.</p>}
      </section>
      <section className="ad-card"><header><h2>Activity</h2></header>
        {data.activity.length ? <ol className="ad-feed">{data.activity.map((a, i) => <li key={i}><time>{clock(a.created_at)}</time><span><strong>{a.email || 'someone'}</strong> {KIND[a.kind] || a.kind}{a.detail ? <em> · {a.detail}</em> : null}</span></li>)}</ol> : <p className="ad-empty">Nothing yet.</p>}
      </section>
    </div>
    <p className="ad-foot">Watch time counts only while a display is open and visible. Spend is the server’s estimate from each picture’s cost, reset at midnight UTC.</p>
  </div>;
}
