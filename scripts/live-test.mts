// Live intelligence test: real local time + live weather -> Cloudflare director -> Kie painter.
// Runs a fixed number of attempts, then stops on its own. Credentials come from .dev.vars only.
//   npm run live:test                      (London, 5 pictures, every 2 minutes, z-image)
//   npm run live:test -- --count 3 --every 3 --model seedream/5-5-text-to-image --city Kyoto
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareProvider, ProviderFailure } from '../lib/ai/cloudflare.ts';
import { kieImageProvider, KIE_MODELS, DEFAULT_KIE_MODEL } from '../lib/ai/kie.ts';
import { collectContext, searchPlaces } from '../lib/context.ts';
import { planMoment, rememberMoment, type StoryMemory } from '../lib/ambient-director.ts';
import { creativePacket, type CreativeProposal } from '../lib/creative.ts';
import { THEME_LIBRARY } from '../lib/creative-library.ts';
import { localClock } from '../lib/ambient.ts';
import { weatherCue } from '../lib/weather-mood.ts';
import type { Place } from '../lib/world.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1] ?? '');
const count = Math.max(1, Math.min(10, Number(args.get('count') || 5)));
const everyMinutes = Math.max(1, Math.min(60, Number(args.get('every') || 2)));
const port = Number(args.get('port') || 5180);

async function vars() {
  const env: Record<string, string> = {};
  try {
    for (const line of (await readFile(path.join(root, '.dev.vars'), 'utf8')).split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* fall through to the checks below */ }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(CLOUDFLARE_|KIE_|HEARTBEAT_)/.test(key))) as Record<string, string> };
}

const env = await vars();
const model = args.get('model') || env.HEARTBEAT_KIE_MODEL || DEFAULT_KIE_MODEL;
const missing = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'KIE_API_KEY'].filter(key => !env[key] || /REPLACE|GENERATED/.test(env[key]));
if (missing.length) { console.error(`Missing in .dev.vars: ${missing.join(', ')}`); process.exit(1); }
if (!(model in KIE_MODELS)) { console.error(`Unknown Kie model "${model}". Use one of: ${Object.keys(KIE_MODELS).join(', ')}`); process.exit(1); }

const cityName = args.get('city') || 'London';
const place: Place = cityName === 'London'
  ? { name: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London' }
  : (await searchPlaces(cityName))[0];
if (!place) { console.error(`Could not find "${cityName}".`); process.exit(1); }

const director = cloudflareProvider({ accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN, directorModel: env.HEARTBEAT_DIRECTOR_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', imageModel: '@cf/black-forest-labs/flux-1-schnell' });
const painter = kieImageProvider({ apiKey: env.KIE_API_KEY, model });
const outDir = path.join(root, 'outputs', 'live', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(outDir, { recursive: true });

async function credits() {
  try { const r = await fetch('https://api.kie.ai/api/v1/chat/credit', { headers: { Authorization: `Bearer ${env.KIE_API_KEY}` } }); const d = await r.json() as { data?: number }; return typeof d.data === 'number' ? d.data : null; } catch { return null; }
}

type Frame = { n: number; file?: string; time: string; date: string; temperature: number | null; weather: string; phase: string; title?: string; reason?: string; prompt?: string; seconds?: number; error?: string };
const state = { place: `${place.name}, ${place.country}`, model, count, everyMinutes, frames: [] as Frame[], nextAt: 0, done: false, startCredits: await credits(), endCredits: null as number | null };
let memory: StoryMemory | null = null;

async function attempt(n: number) {
  const started = Date.now();
  const context = await collectContext(place);
  const at = Date.now(), clock = localClock(place, at), weather = weatherCue(context, at);
  const baseline = planMoment(place, context, at, memory, n * 7919 + at, { force: true }).direction;
  const label = { unknown: 'Weather unknown', clear: 'Clear', 'mostly-clear': 'Mostly clear', 'partly-cloudy': 'Partly cloudy', overcast: 'Overcast', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Storm' }[weather.condition] || 'Weather unknown';
  const frame: Frame = { n, time: clock.time, date: clock.date, temperature: context.temperature ?? null, weather: label, phase: baseline.phase };
  state.frames.push(frame);
  console.log(`\n[${n}/${count}] ${place.name} ${clock.time} · ${frame.temperature ?? '?'}°C · ${weather.summary} · ${baseline.phase}`);
  try {
    const packet = creativePacket({ phase: baseline.phase, season: baseline.season, temperature: baseline.brief.temperature, weekday: baseline.brief.weekday, festive: false, localDate: baseline.recipe.date, localTime: clock.time, weather }, memory?.creative, at, at,
      memory?.history.map(item => item.direction.scene) || [],
      memory?.history.map(item => ({ title: item.direction.artwork?.title || item.direction.scene, summary: item.direction.artwork?.proposal.prompt || item.direction.brief.activity, phase: item.direction.phase })) || []);
    const directed = await director.direct(packet, { mustReimagine: true, signal: AbortSignal.timeout(120000) });
    frame.title = directed.title; frame.reason = directed.reason; frame.prompt = directed.prompt;
    console.log(`   Director: "${directed.title}" (${directed.reason})`);
    const image = await painter.generate(directed, packet, AbortSignal.timeout(170000));
    const file = `${String(n).padStart(2, '0')}.jpg`;
    await writeFile(path.join(outDir, file), image.bytes);
    frame.file = file; frame.seconds = Math.round((Date.now() - started) / 1000);
    const themes = directed.themeIds.map(id => THEME_LIBRARY.find(theme => theme.id === id)!).filter(Boolean);
    const attemptId = crypto.randomUUID();
    const proposal: CreativeProposal = { ...packet.inspiration[0], source: 'ai-director', id: `idea-${attemptId}`, fingerprint: `live-${n}-${directed.title.toLowerCase().replace(/[^a-z]+/g, '-')}`.slice(0, 200), title: directed.title, prompt: directed.prompt, themes: themes.map(({ id, label, category }) => ({ id, label, category })), lighting: directed.lighting };
    memory = rememberMoment(memory, { ...baseline, id: `generated-${attemptId}`, reason: directed.reason, artwork: { attemptId, url: `/api/ai/art/${attemptId}`, title: directed.title, proposal } }, Date.now());
    console.log(`   Painted ${image.width}x${image.height} in ${frame.seconds}s -> outputs/live/${path.basename(outDir)}/${file}`);
  } catch (error) {
    const kind = error instanceof ProviderFailure ? `${error.kind}${error.hints?.length ? ` (${error.hints.join(', ')})` : ''}` : (error as Error).message;
    frame.error = kind.includes('night-light') ? 'Too bright for night, so it was rejected. Your screen keeps the previous picture.' : `Could not make this one: ${kind}`;
    console.log(`   ${frame.error}`);
  }
  await writeFile(path.join(outDir, 'log.json'), JSON.stringify(state, null, 2));
}

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Heartbeat · live test</title>
<style>[hidden]{display:none!important}@font-face{font-family:Manrope;src:url(/font) format("truetype")}html,body{margin:0;height:100%;background:#05080c;color:#f3f0e8;font-family:Manrope,Segoe UI,Arial,sans-serif}
.art{position:fixed;inset:0}.art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 2s ease}.art img.on{opacity:1}
.scrim{position:fixed;inset:0;background:linear-gradient(180deg,#05080c88,transparent 25%,transparent 55%,#05080ccc)}
header{position:fixed;top:28px;left:40px;right:40px;display:flex;justify-content:space-between;font-size:13px;color:#cfd3d7}header b{font-size:22px;color:#f3f0e8;letter-spacing:-.04em}
.story{position:fixed;left:40px;bottom:48px;max-width:560px}.story p{margin:0;color:#d5d8db;font-size:14px}.story h1{font-weight:500;font-size:clamp(28px,3.4vw,46px);letter-spacing:-.04em;line-height:1.08;margin:12px 0}
.clock{position:fixed;right:40px;bottom:48px;text-align:right}.clock time{display:block;font-size:clamp(64px,9vw,120px);font-weight:300;letter-spacing:-.05em;line-height:1}.clock p{margin:8px 0 0;font-size:14px;color:#d5d8db}
.wait{position:fixed;inset:0;display:grid;place-items:center;text-align:center;color:#c9ccd0;font-size:15px}.err{color:#ffb3a4}</style></head>
<body><div class="art" id="art"></div><div class="scrim"></div><header><span><b>heartbeat</b>&nbsp; live test</span><span id="status"></span></header>
<div class="wait" id="wait">Reading the weather and asking the director…</div><section class="story" id="story" hidden><p id="where"></p><h1 id="title"></h1><p id="reason"></p></section>
<div class="clock" id="clock" hidden><time id="time"></time><p id="temp"></p></div>
<script>let shown='';async function tick(){const s=await (await fetch('/state',{cache:'no-store'})).json();const ok=s.frames.filter(f=>f.file),last=ok.at(-1),latest=s.frames.at(-1);
const left=s.done?'Finished':s.nextAt?Math.max(0,Math.round((s.nextAt-Date.now())/1000))+'s to next':'Preparing…';
document.getElementById('status').textContent=s.place+' · picture '+s.frames.length+' of '+s.count+' · '+left;
if(last&&last.file!==shown){shown=last.file;const img=new Image();img.src='/img/'+last.file;await img.decode().catch(()=>{});const art=document.getElementById('art');art.querySelectorAll('img').forEach(i=>i.classList.remove('on'));art.append(img);requestAnimationFrame(()=>img.classList.add('on'));setTimeout(()=>[...art.querySelectorAll('img')].slice(0,-1).forEach(i=>i.remove()),2500);
document.getElementById('wait').hidden=true;document.getElementById('story').hidden=false;document.getElementById('clock').hidden=false;
document.getElementById('where').textContent=s.place.split(',')[0]+' · '+last.weather;document.getElementById('title').textContent=last.title;document.getElementById('reason').textContent=last.reason;
document.getElementById('time').textContent=last.time;document.getElementById('temp').textContent=(last.temperature??'?')+'°C · '+last.phase;}
if(latest&&latest.error&&latest!==last){const w=document.getElementById('where');w.innerHTML='';w.append(s.place.split(',')[0]+' · ');const e=document.createElement('span');e.className='err';e.textContent=latest.error;w.append(e);}}
setInterval(tick,3000);tick();</script></body></html>`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(page); return; }
  if (url.pathname === '/state') { response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ ...state, frames: state.frames.map(({ prompt, ...rest }) => rest) })); return; }
  if (url.pathname === '/font') { response.writeHead(200, { 'Content-Type': 'font/ttf' }); response.end(await readFile(path.join(root, 'public/fonts/manrope.ttf'))); return; }
  const image = /^\/img\/(\d{2}\.jpg)$/.exec(url.pathname);
  if (image) { try { response.writeHead(200, { 'Content-Type': 'image/jpeg' }); response.end(await readFile(path.join(outDir, image[1]))); } catch { response.writeHead(404); response.end(); } return; }
  response.writeHead(404); response.end();
});
server.listen(port, '127.0.0.1');
console.log(`Heartbeat live test: ${place.name}, ${count} pictures, one every ${everyMinutes} min, painter ${model}.`);
console.log(`Kie credits at start: ${state.startCredits ?? 'unknown'}`);
console.log(`Open http://127.0.0.1:${port}/ and leave it on screen. Press Ctrl+C to stop early.`);

for (let n = 1; n <= count; n++) {
  const slot = Date.now();
  await attempt(n);
  if (n < count) { state.nextAt = slot + everyMinutes * 60000; await new Promise(resolve => setTimeout(resolve, Math.max(0, state.nextAt - Date.now()))); }
}
state.done = true; state.nextAt = 0; state.endCredits = await credits();
await writeFile(path.join(outDir, 'log.json'), JSON.stringify(state, null, 2));
const made = state.frames.filter(frame => frame.file).length;
console.log(`\nDone: ${made} of ${count} pictures made. Kie credits now: ${state.endCredits ?? 'unknown'}${state.startCredits != null && state.endCredits != null ? ` (used ${(state.startCredits - state.endCredits).toFixed(1)})` : ''}.`);
console.log(`Pictures and the director's notes are in outputs/live/${path.basename(outDir)}/. The page stays open; press Ctrl+C to close it.`);
