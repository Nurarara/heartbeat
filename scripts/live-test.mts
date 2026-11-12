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
const count = Math.max(1, Math.min(24, Number(args.get('count') || 5)));
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

type Frame = { n: number; file?: string; showAt?: number; time: string; date: string; temperature: number | null; weather: string; phase: string; title?: string; reason?: string; prompt?: string; seconds?: number; error?: string };
const state = { place: `${place.name}, ${place.country}`, timezone: place.timezone, model, count, everyMinutes, frames: [] as Frame[], nextAt: 0, done: false, startCredits: await credits(), endCredits: null as number | null };
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
<style>[hidden]{display:none!important}@font-face{font-family:Manrope;src:url(/font) format("truetype")}
html,body{margin:0;height:100%;background:#05080c;font-family:Manrope,Segoe UI,Arial,sans-serif;overflow:hidden;cursor:none}
body.awake{cursor:default}
.art{position:fixed;inset:0}.art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 2.4s ease}.art img.on{opacity:1}
.reading{position:fixed;--ink:#f4f1ea;--shade:#0009;color:var(--ink);text-shadow:0 2px 24px var(--shade);transition:opacity 1.2s ease;display:flex;flex-direction:column;gap:2px}
.reading.dark{--ink:#17191c;--shade:#fff6}
.reading.bl{left:5vw;bottom:6vh;align-items:flex-start}.reading.br{right:5vw;bottom:6vh;align-items:flex-end}
.reading.tl{left:5vw;top:6vh;align-items:flex-start}.reading.tr{right:5vw;top:6vh;align-items:flex-end}
.reading time{font-size:clamp(84px,11vw,176px);font-weight:300;letter-spacing:-.055em;line-height:.92;font-variant-numeric:tabular-nums}
.reading span{font-size:clamp(42px,5.2vw,84px);font-weight:300;letter-spacing:-.03em;line-height:1;opacity:.9;font-variant-numeric:tabular-nums}
.reading.moving{opacity:0}
.info{position:fixed;left:24px;right:24px;top:20px;display:flex;justify-content:space-between;gap:20px;font-size:13px;color:#e7e5df;text-shadow:0 1px 10px #000;opacity:0;transition:opacity .6s}
body.awake .info{opacity:1}.info b{font-size:20px;letter-spacing:-.04em}
.why{position:fixed;left:24px;bottom:20px;max-width:560px;font-size:13px;line-height:1.5;color:#e7e5df;text-shadow:0 1px 10px #000;opacity:0;transition:opacity .6s}
body.awake .why{opacity:1}
.wait{position:fixed;inset:0;display:grid;place-items:center;color:#9ba2a9;font-size:14px;letter-spacing:.04em}</style></head>
<body><div class="art" id="art"></div>
<div class="reading br" id="clockbox" hidden><time id="time"></time></div><div class="reading tl" id="tempbox" hidden><span id="temp"></span></div>
<div class="info"><span><b>heartbeat</b>&nbsp; live test</span><span id="status"></span></div><p class="why" id="why"></p>
<div class="wait" id="wait">Reading the weather and preparing the first picture…</div>
<script>
const $=id=>document.getElementById(id);let shown='',temp=null,wake=0;const preloaded=new Set();
// The clock follows this computer's own time, so it changes exactly with the desktop clock.
const clock=()=>{const n=new Date();$('time').textContent=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');};
setInterval(clock,250);clock();
// Click anywhere (or press F) to fill the whole screen; Escape leaves full screen.
const full=()=>{if(document.fullscreenElement)return;const el=document.documentElement;(el.requestFullscreen||el.webkitRequestFullscreen)?.call(el)?.catch?.(()=>{});};
addEventListener('click',full);addEventListener('keydown',e=>{if(e.key==='f'||e.key==='F')full();});
addEventListener('pointermove',()=>{document.body.classList.add('awake');clearTimeout(wake);wake=setTimeout(()=>document.body.classList.remove('awake'),2500);});
// Put the reading where the picture is calmest, and pick light or dark ink for that spot.
function placement(img){
  const W=48,H=27,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d',{willReadFrequently:true});
  const scale=Math.max(W/img.naturalWidth,H/img.naturalHeight),dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;g.drawImage(img,(W-dw)/2,(H-dh)/2,dw,dh);
  const d=g.getImageData(0,0,W,H).data,L=(x,y)=>{const i=(y*W+x)*4;return (0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255;};
  const boxes={bl:[0,H*.55,W*.42,H],br:[W*.58,H*.55,W,H],tl:[0,0,W*.42,H*.42],tr:[W*.58,0,W,H*.42]};const ranked=[];
  for(const [k,[x0,y0,x1,y1]] of Object.entries(boxes)){let sum=0,sq=0,edge=0,n=0;
    for(let y=Math.floor(y0);y<Math.floor(y1);y++)for(let x=Math.floor(x0);x<Math.floor(x1);x++){const v=L(x,y);sum+=v;sq+=v*v;n++;if(x+1<W)edge+=Math.abs(v-L(x+1,y));if(y+1<H)edge+=Math.abs(v-L(x,y+1));}
    const mean=sum/n,busy=Math.sqrt(Math.max(0,sq/n-mean*mean))+edge/n+(k[0]==='t'?.02:0);ranked.push({corner:k,busy,dark:mean>.62});}
  ranked.sort((a,b)=>a.busy-b.busy);const clockSpot=ranked[0];
  // Temperature goes to the calmest corner on the other side, well away from the clock.
  const tempSpot=ranked.find(r=>r.corner[1]!==clockSpot.corner[1]);
  return {clock:clockSpot,temp:tempSpot};
}
async function show(frame){
  const img=new Image();img.src='/img/'+frame.file;try{await img.decode();}catch{return;}
  shown=frame.file;const art=$('art'),spot=placement(img),boxes=[[$('clockbox'),spot.clock],[$('tempbox'),spot.temp]];
  art.querySelectorAll('img').forEach(i=>i.classList.remove('on'));art.append(img);requestAnimationFrame(()=>img.classList.add('on'));
  setTimeout(()=>[...art.querySelectorAll('img')].slice(0,-1).forEach(i=>i.remove()),3000);
  for(const [box,place] of boxes){const first=box.hidden;box.classList.add('moving');setTimeout(()=>{box.className='reading '+place.corner+(place.dark?' dark':'');box.hidden=false;},first?0:1200);}
  temp=frame.temperature;$('temp').textContent=temp==null?'':Math.round(temp)+'°';$('why').textContent=frame.title+' · '+frame.reason;$('wait').hidden=true;
}
async function tick(){let s;try{s=await (await fetch('/state',{cache:'no-store'})).json();}catch{return;}
  const due=s.frames.filter(f=>f.file&&f.showAt&&f.showAt<=Date.now()).at(-1),ready=s.frames.filter(f=>f.file).length;
  const left=s.done?'finished':s.nextAt?'next in '+Math.max(0,Math.round((s.nextAt-Date.now())/1000))+'s':'preparing';
  $('status').textContent=s.place+' · '+ready+' of '+s.count+' ready · '+left;
  if(due&&due.file!==shown)await show(due);
  for(const f of s.frames)if(f.file&&f.file!==shown&&!preloaded.has(f.file)){preloaded.add(f.file);const p=new Image();p.src='/img/'+f.file;}
}
setInterval(tick,1000);tick();
</script></body></html>`;

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

// Prepare ahead: each picture is made while the previous one is on screen,
// then shown exactly on schedule (or as soon as it is ready, if it runs late).
let lastShown = 0;
for (let n = 1; n <= count; n++) {
  await attempt(n);
  const frame = state.frames.at(-1)!;
  if (!frame.file) continue;
  const showAt = lastShown ? Math.max(lastShown + everyMinutes * 60000, Date.now()) : Date.now();
  state.nextAt = showAt; frame.showAt = showAt;
  if (showAt > Date.now() + 1000) console.log(`   Ready early; it will appear at ${new Date(showAt).toLocaleTimeString('en-GB', { timeZone: place.timezone })}.`);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, showAt - Date.now())));
  lastShown = showAt;
  if (n < count) state.nextAt = lastShown + everyMinutes * 60000;
}
await new Promise(resolve => setTimeout(resolve, 2000));
state.done = true; state.nextAt = 0; state.endCredits = await credits();
await writeFile(path.join(outDir, 'log.json'), JSON.stringify(state, null, 2));
const made = state.frames.filter(frame => frame.file).length;
console.log(`\nDone: ${made} of ${count} pictures made. Kie credits now: ${state.endCredits ?? 'unknown'}${state.startCredits != null && state.endCredits != null ? ` (used ${(state.startCredits - state.endCredits).toFixed(1)})` : ''}.`);
console.log(`Pictures and the director's notes are in outputs/live/${path.basename(outDir)}/. The page stays open; press Ctrl+C to close it.`);
