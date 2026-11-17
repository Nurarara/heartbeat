// Live intelligence test: real local time + live weather -> Cloudflare director -> Kie or Azure FLUX painter.
// Runs a fixed number of attempts, then stops on its own. Credentials come from .dev.vars only.
//   npm run live:test                      (London, 5 pictures, every 2 minutes, z-image)
//   npm run live:test count=12 every=10 model=seedream/5-5-text-to-image city=Kyoto
//   npm run live:test count=5 every=2 mood=dreamy   (moods: auto calm sleep cosy focus playful dreamy romantic)
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareProvider, ProviderFailure } from '../lib/ai/cloudflare.ts';
import { kieImageProvider, KIE_MODELS, DEFAULT_KIE_MODEL } from '../lib/ai/kie.ts';
import { azureFluxProvider, azureFluxEndpoint, AZURE_FLUX_MODELS, DEFAULT_AZURE_FLUX_MODEL } from '../lib/ai/azure-flux.ts';
import { collectContext, searchPlaces } from '../lib/context.ts';
import { planMoment, rememberMoment, type StoryMemory } from '../lib/ambient-director.ts';
import { creativePacket, type CreativeProposal } from '../lib/creative.ts';
import { findTheme } from '../lib/ingredients.ts';
import { MOOD_IDS, MOODS, type MoodId } from '../lib/moods.ts';
import { skyCue } from '../lib/sky.ts';
import { localClock } from '../lib/ambient.ts';
import { weatherCue } from '../lib/weather-mood.ts';
import type { Place } from '../lib/world.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = new Map<string, string>();
// Accepts `--count 12 --every 10` and `count=12 every=10`. The second form also works through
// `npm run` in PowerShell, which drops the `--` separator and swallows dashed flags.
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const pair = /^-{0,2}([a-z]+)=(.*)$/.exec(argv[i]);
  if (pair) args.set(pair[1], pair[2]);
  else if (argv[i].startsWith('--')) { args.set(argv[i].slice(2), argv[i + 1] ?? ''); i++; }
}
const count = Math.max(1, Math.min(24, Number(args.get('count') || 5)));
const everyMinutes = Math.max(.2, Math.min(60, Number(args.get('every') || 2)));
// Each picture is prepared this long before it is due: early enough to be ready, late enough
// that a mood chosen meanwhile still guides it.
const leadMs = Math.max(5, Math.min(300, Number(args.get('lead')) || Math.max(45, Math.min(120, everyMinutes * 36)))) * 1000;
const port = Number(args.get('port') || 5180);
const startMood = (args.get('mood') || 'auto').toLowerCase();
if (!(MOOD_IDS as readonly string[]).includes(startMood)) { console.error(`Unknown mood "${startMood}". Use one of: ${MOOD_IDS.join(', ')}`); process.exit(1); }

async function vars() {
  const env: Record<string, string> = {};
  try {
    for (const line of (await readFile(path.join(root, '.dev.vars'), 'utf8')).split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* fall through to the checks below */ }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(CLOUDFLARE_|KIE_|AZURE_IMAGE_|HEARTBEAT_)/.test(key))) as Record<string, string> };
}

const env = await vars();
// painter=azure uses FLUX.2 on Microsoft Foundry (Azure credits); the default is Kie.
const azure = (args.get('painter') || (env.HEARTBEAT_IMAGE_PROVIDER === 'azure' ? 'azure' : 'kie')) === 'azure';
const model = args.get('model') || (azure ? env.AZURE_IMAGE_MODEL || DEFAULT_AZURE_FLUX_MODEL : env.HEARTBEAT_KIE_MODEL || DEFAULT_KIE_MODEL);
const missing = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', ...(azure ? ['AZURE_IMAGE_ENDPOINT', 'AZURE_IMAGE_KEY'] : ['KIE_API_KEY'])].filter(key => !env[key] || /REPLACE|GENERATED/.test(env[key]));
if (missing.length) { console.error(`Missing in .dev.vars: ${missing.join(', ')}`); process.exit(1); }
if (azure && !azureFluxEndpoint(env.AZURE_IMAGE_ENDPOINT)) { console.error('AZURE_IMAGE_ENDPOINT should look like https://<name>.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro (no ?api-version).'); process.exit(1); }
if (azure ? !(AZURE_FLUX_MODELS as readonly string[]).includes(model) : !(model in KIE_MODELS)) { console.error(`Unknown model "${model}". Use one of: ${(azure ? [...AZURE_FLUX_MODELS] : Object.keys(KIE_MODELS)).join(', ')}`); process.exit(1); }
const paidWith = azure ? 'Azure credit' : 'Kie credit';

const cityName = args.get('city') || 'London';
const place: Place = cityName === 'London'
  ? { name: 'London', country: 'United Kingdom', latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London' }
  : (await searchPlaces(cityName))[0];
if (!place) { console.error(`Could not find "${cityName}".`); process.exit(1); }

const director = cloudflareProvider({ accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN, directorModel: env.HEARTBEAT_DIRECTOR_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', imageModel: '@cf/black-forest-labs/flux-1-schnell' });
// A night picture that comes back too bright is dimmed and kept, so its credit is not wasted.
const dimTooBright = args.get('dim') !== 'off';
const painter = azure ? azureFluxProvider({ endpoint: env.AZURE_IMAGE_ENDPOINT, apiKey: env.AZURE_IMAGE_KEY, model, dimTooBright }) : kieImageProvider({ apiKey: env.KIE_API_KEY, model, dimTooBright });
const outDir = args.get('out') ? path.resolve(args.get('out')!) : path.join(root, 'outputs', 'live', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(outDir, { recursive: true });

async function credits() {
  if (azure) return null; // Azure has no balance API for a key; check Cost Management in the portal.
  try { const r = await fetch('https://api.kie.ai/api/v1/chat/credit', { headers: { Authorization: `Bearer ${env.KIE_API_KEY}` } }); const d = await r.json() as { data?: number }; return typeof d.data === 'number' ? d.data : null; } catch { return null; }
}

type Frame = { n: number; file?: string; showAt?: number; time: string; date: string; temperature: number | null; weather: string; phase: string; mood: MoodId; fadeMs: number; sky?: string; words?: string[]; title?: string; reason?: string; prompt?: string; seconds?: number; error?: string; paid?: boolean; dimmed?: boolean };
const state = { place: `${place.name}, ${place.country}`, timezone: place.timezone, model, count, everyMinutes, mood: startMood as MoodId, moods: MOOD_IDS.map(id => ({ id, label: MOODS[id].label, colour: MOODS[id].colour })), frames: [] as Frame[], nextAt: 0, preparing: '' as MoodId | '', stopped: '', done: false, startCredits: await credits(), endCredits: null as number | null };
let memory: StoryMemory | null = null;

async function attempt(n: number) {
  const started = Date.now();
  const context = await collectContext(place);
  const at = Date.now(), clock = localClock(place, at), weather = weatherCue(context, at);
  const baseline = planMoment(place, context, at, memory, n * 7919 + at, { force: true }).direction;
  const label = { unknown: 'Weather unknown', clear: 'Clear', 'mostly-clear': 'Mostly clear', 'partly-cloudy': 'Partly cloudy', overcast: 'Overcast', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Storm' }[weather.condition] || 'Weather unknown';
  // The mood is read when preparation starts, so a change made before then guides this picture.
  const mood = state.mood, sky = skyCue(place, at, context.cloudCover);
  state.preparing = mood;
  const frame: Frame = { n, time: clock.time, date: clock.date, temperature: context.temperature ?? null, weather: label, phase: baseline.phase, mood, fadeMs: MOODS[mood].crossfadeMs, sky: `${sky.sun} ${sky.moon} ${sky.cloud}` };
  state.frames.push(frame);
  console.log(`\n[${n}/${count}] ${place.name} ${clock.time} · ${frame.temperature ?? '?'}°C · ${weather.summary} · ${baseline.phase} · mood ${mood}`);
  console.log(`   Sky: ${frame.sky}`);
  try {
    const packet = creativePacket({ phase: baseline.phase, season: baseline.season, temperature: baseline.brief.temperature, weekday: baseline.brief.weekday, festive: false, localDate: baseline.recipe.date, localTime: clock.time, weather, mood, sky }, memory?.creative, at, at,
      memory?.history.map(item => item.direction.scene) || [],
      memory?.history.map(item => ({ title: item.direction.artwork?.title || item.direction.scene, summary: item.direction.artwork?.proposal.prompt || item.direction.brief.activity, phase: item.direction.phase })) || [], { ingredients: true });
    console.log(`   Drawn words: ${packet.draw!.map(word => word.label).join(' + ')}`);
    // The director's reply is checked before any picture is painted. A reply that breaks the rules is asked
    // for once more: that costs no Kie credit, where giving up would waste this picture's slot.
    let directed;
    try { directed = await director.direct(packet, { mustReimagine: true, signal: AbortSignal.timeout(120000) }); }
    catch (error) {
      if (!(error instanceof ProviderFailure) || error.kind !== 'invalid-output') throw error;
      console.log(`   The director's first answer broke a rule (${error.hints?.join(', ') || 'unknown'}); asking once more.`);
      directed = await director.direct(packet, { mustReimagine: true, signal: AbortSignal.timeout(120000) });
    }
    frame.title = directed.title; frame.reason = directed.reason; frame.prompt = directed.prompt;
    frame.words = (directed.usedWords || []).map(id => packet.draw!.find(word => word.id === id)!.label);
    console.log(`   Director: "${directed.title}" (${directed.reason})`);
    console.log(`   Used: ${frame.words.join(' + ')}`);
    const image = await painter.generate(directed, packet, AbortSignal.timeout(170000));
    const file = `${String(n).padStart(2, '0')}.jpg`;
    await writeFile(path.join(outDir, file), image.bytes);
    frame.file = file; frame.seconds = Math.round((Date.now() - started) / 1000);
    const themes = [...directed.themeIds, ...(directed.usedWords || [])].flatMap(id => { const theme = findTheme(id); return theme ? [theme] : []; });
    const attemptId = crypto.randomUUID();
    const proposal: CreativeProposal = { ...packet.inspiration[0], source: 'ai-director', id: `idea-${attemptId}`, fingerprint: `live-${n}-${directed.title.toLowerCase().replace(/[^a-z]+/g, '-')}`.slice(0, 200), title: directed.title, prompt: directed.prompt, themes: themes.map(({ id, label, category }) => ({ id, label, category })), lighting: directed.lighting };
    memory = rememberMoment(memory, { ...baseline, id: `generated-${attemptId}`, reason: directed.reason, artwork: { attemptId, url: `/api/ai/art/${attemptId}`, title: directed.title, proposal } }, Date.now());
    if ('dimmed' in image) { frame.dimmed = true; console.log('   The picture came back too bright for this moment, so it was dimmed instead of thrown away.'); }
    console.log(`   Painted ${image.width}x${image.height} in ${frame.seconds}s -> ${path.relative(root, path.join(outDir, file))}`);
  } catch (error) {
    const kind = error instanceof ProviderFailure ? `${error.kind}${error.hints?.length ? ` (${error.hints.join(', ')})` : ''}` : (error as Error).message;
    frame.error = kind.includes('night-light') ? 'Too bright for night, so it was rejected. Your screen keeps the previous picture.' : kind.includes('mood-light') ? 'Too bright for this mood or twilight, so it was rejected. Your screen keeps the previous picture.' : kind.includes('words') ? 'The director did not use enough of the drawn words, so this one was skipped.' : `Could not make this one: ${kind}`;
    frame.paid = /light/.test(kind);
    console.log(`   ${frame.error}${frame.paid ? ` (This one used ${paidWith}.)` : ` (No ${paidWith} used.)`}`);
  }
  await writeFile(path.join(outDir, 'log.json'), JSON.stringify(state, null, 2));
}

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Heartbeat · live test</title>
<style>[hidden]{display:none!important}@font-face{font-family:Manrope;src:url(/font) format("truetype")}
html,body{margin:0;height:100%;background:#05080c;font-family:Manrope,Segoe UI,Arial,sans-serif;overflow:hidden;cursor:none}
body.awake{cursor:default}
.art{position:fixed;inset:0}.frame{position:absolute;inset:0;opacity:0;transition:opacity 2.4s ease}.frame.on{opacity:1}
.frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.frame .back{display:none}
/* Tall screens (phones held upright): show the whole picture, with a soft blurred copy filling the space around it. */
@media (orientation:portrait){.frame .back{display:block;filter:blur(28px) brightness(.55);transform:scale(1.15)}.frame .main{object-fit:contain}
.reading time{font-size:clamp(64px,22vw,120px)}.reading span{font-size:clamp(34px,10vw,64px)}
.reading.bl,.reading.br{bottom:calc(5vh + env(safe-area-inset-bottom,0px))}.reading.tl,.reading.tr{top:calc(5vh + env(safe-area-inset-top,0px))}}
.reading{position:fixed;--ink:#f4f1ea;--shade:#0009;color:var(--ink);text-shadow:0 2px 24px var(--shade);transition:opacity 1.2s ease;display:flex;flex-direction:column;gap:2px}
.reading.dark{--ink:#17191c;--shade:#fff6}
.reading.bl{left:5vw;bottom:6vh;align-items:flex-start}.reading.br{right:5vw;bottom:6vh;align-items:flex-end}
.reading.tl{left:5vw;top:6vh;align-items:flex-start}.reading.tr{right:5vw;top:6vh;align-items:flex-end}
.reading time{font-size:clamp(84px,11vw,176px);font-weight:300;letter-spacing:-.055em;line-height:.92;font-variant-numeric:tabular-nums}
.reading span{font-size:clamp(42px,5.2vw,84px);font-weight:300;letter-spacing:-.03em;line-height:1;opacity:.9;font-variant-numeric:tabular-nums}
.reading.moving{opacity:0}
.info{position:fixed;left:24px;right:24px;top:20px;display:flex;justify-content:space-between;gap:20px;font-size:13px;color:#e7e5df;text-shadow:0 1px 10px #000;opacity:0;transition:opacity .6s}
body.awake .info{opacity:1}.info b{font-size:20px;letter-spacing:-.04em}
.why{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(122px + env(safe-area-inset-bottom,0px));width:min(680px,calc(100% - 48px));margin:0;text-align:center;font-size:13px;line-height:1.5;color:#e7e5df;text-shadow:0 1px 10px #000;opacity:0;transition:opacity .6s}
/* While the controls show, the clock and temperature step back so nothing overlaps. */
body.awake .reading{opacity:.14;transition:opacity .5s ease}
body::after{content:'';position:fixed;inset:auto 0 0 0;height:46vh;background:linear-gradient(180deg,transparent,#05080cd9);opacity:0;transition:opacity .6s;pointer-events:none}
body.awake::after{opacity:1}
.info,.why,.moods,.next,.trouble{z-index:2}
.trouble{position:fixed;right:24px;top:46px;max-width:min(460px,calc(100% - 48px));margin:0;text-align:right;font-size:12.5px;line-height:1.45;color:#ffc9bd;text-shadow:0 1px 10px #000;opacity:0;transition:opacity .6s}
body.awake .trouble{opacity:1}
body.awake .why{opacity:1}
.wait{position:fixed;inset:0;display:grid;place-items:center;color:#9ba2a9;font-size:14px;letter-spacing:.04em}
/* Mood chips: hidden until the mouse moves or the screen is touched, then fade away again. */
.moods{position:fixed;left:0;right:0;bottom:calc(64px + env(safe-area-inset-bottom,0px));display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:0 16px;opacity:0;pointer-events:none;transition:opacity .6s}
body.awake .moods,.moods:focus-within{opacity:1;pointer-events:auto}
.moods button{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 15px;border-radius:999px;border:1px solid #ffffff40;background:#0b1118b8;color:#f1eee4;font:500 13px/1 Manrope,Segoe UI,Arial,sans-serif;backdrop-filter:blur(8px);cursor:pointer}
.moods button[aria-pressed=true]{border-color:#fc684b;background:#fc684b33}
.moods button:focus-visible{outline:2px solid #fc684b;outline-offset:3px}
.moods i{width:9px;height:9px;border-radius:50%}
.next{position:fixed;left:0;right:0;bottom:calc(30px + env(safe-area-inset-bottom,0px));text-align:center;font-size:12.5px;color:#e7e5df;text-shadow:0 1px 10px #000;opacity:0;transition:opacity .6s;margin:0}
body.awake .next,.moods:focus-within~.next{opacity:1}
@media (max-width:600px){.why{display:none}.moods{gap:6px}.moods button{min-height:44px;padding:0 13px}}</style></head>
<body><div class="art" id="art"></div>
<div class="reading br" id="clockbox" hidden><time id="time"></time></div><div class="reading tl" id="tempbox" hidden><span id="temp"></span></div>
<div class="info"><span><b>heartbeat</b>&nbsp; live test</span><span id="status"></span></div><p class="why" id="why"></p>
<div class="moods" id="moods" role="group" aria-label="Mood for the next picture"></div><p class="next" id="next" role="status"></p><p class="trouble" id="trouble" role="status"></p>
<div class="wait" id="wait">Reading the weather and preparing the first picture…</div>
<script>
const $=id=>document.getElementById(id);let shown='',temp=null,wake=0;const preloaded=new Set();
// The clock follows this computer's own time, so it changes exactly with the desktop clock.
const clock=()=>{const n=new Date();$('time').textContent=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');};
setInterval(clock,250);clock();
// Click anywhere (or press F) to fill the whole screen; Escape leaves full screen.
const full=()=>{if(document.fullscreenElement)return;const el=document.documentElement;(el.requestFullscreen||el.webkitRequestFullscreen)?.call(el)?.catch?.(()=>{});};
addEventListener('click',e=>{if(!e.target.closest('.moods'))full();});addEventListener('keydown',e=>{if((e.key==='f'||e.key==='F')&&!e.target.closest('.moods'))full();});
const awake=()=>{document.body.classList.add('awake');clearTimeout(wake);wake=setTimeout(()=>document.body.classList.remove('awake'),4000);};
for(const name of ['pointermove','pointerdown','keydown','touchstart'])addEventListener(name,awake,{passive:true});
// Mood chips. Choosing one guides the NEXT picture; the one on screen stays.
let mood='',chips=false;
async function choose(id){if(id===mood)return;const before=mood;paint(id);try{const r=await fetch('/mood',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mood:id})});if(!r.ok)throw 0;}catch{paint(before);$('next').textContent='The mood could not be changed. Try again.';}}
function paint(id){mood=id;for(const b of $('moods').children)b.setAttribute('aria-pressed',String(b.dataset.mood===id));}
function build(s){if(!chips){chips=true;for(const m of s.moods){const b=document.createElement('button'),dot=document.createElement('i');b.type='button';b.dataset.mood=m.id;dot.style.background=m.colour;b.append(dot,m.label);b.addEventListener('click',()=>choose(m.id));$('moods').append(b);}}
  if(s.mood!==mood)paint(s.mood);const label=s.moods.find(m=>m.id===s.mood).label;$('next').textContent=s.done?'':s.preparing&&s.preparing!==s.mood?'Mood: '+label+' (the picture after next will follow it)':'Mood for the next picture: '+label;}
// Put the reading where the picture is calmest, and pick light or dark ink for that spot.
function placement(img){
  if(innerHeight>innerWidth)return {clock:{corner:'br',dark:false},temp:{corner:'tl',dark:false}};
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
  const frameEl=document.createElement('div'),back=document.createElement('img');frameEl.className='frame';const fade=Math.max(300,Math.min(10000,frame.fadeMs||2400));frameEl.style.transitionDuration=fade+'ms';back.className='back';back.src=img.src;back.alt='';img.className='main';img.alt='';frameEl.append(back,img);
  art.querySelectorAll('.frame').forEach(f=>f.classList.remove('on'));art.append(frameEl);requestAnimationFrame(()=>frameEl.classList.add('on'));
  setTimeout(()=>[...art.querySelectorAll('.frame')].slice(0,-1).forEach(f=>f.remove()),fade+600);
  for(const [box,place] of boxes){const first=box.hidden;box.classList.add('moving');setTimeout(()=>{box.className='reading '+place.corner+(place.dark?' dark':'');box.hidden=false;},first?0:1200);}
  temp=frame.temperature;$('temp').textContent=temp==null?'':Math.round(temp)+'°';$('why').textContent=frame.title+' · '+frame.reason+(frame.words&&frame.words.length?' · Words: '+frame.words.join(', '):'');$('wait').hidden=true;
}
async function tick(){let s;try{s=await (await fetch('/state',{cache:'no-store'})).json();}catch{return;}
  build(s);
  const due=s.frames.filter(f=>f.file&&f.showAt&&f.showAt<=Date.now()).at(-1),ready=s.frames.filter(f=>f.file).length;
  const left=s.done?'finished':s.nextAt?'next in '+Math.max(0,Math.round((s.nextAt-Date.now())/1000))+'s':'preparing';
  const failed=s.frames.filter(f=>f.error);
  $('status').textContent=s.place+' · '+ready+' of '+s.count+' ready'+(failed.length?' · '+failed.length+' skipped':'')+' · '+left;
  $('trouble').textContent=failed.length?(s.stopped?s.stopped+' ':'')+'Last skipped picture: '+failed.at(-1).error:'';
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
  if (url.pathname === '/mood' && request.method === 'POST') {
    // Changing the mood never starts extra work or spends credits; it only guides pictures not yet begun.
    // Same-origin only, a tiny body, and an allowlisted value.
    let origin = ''; try { origin = new URL(request.headers.origin || '').host; } catch { /* rejected below */ }
    if (!origin || origin !== request.headers.host) { response.writeHead(403); response.end(); return; }
    let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 200) { response.writeHead(413); response.end(); return; } }
    let mood: unknown; try { mood = (JSON.parse(body) as { mood?: unknown }).mood; } catch { mood = undefined; }
    if (typeof mood !== 'string' || !(MOOD_IDS as readonly string[]).includes(mood)) { response.writeHead(400); response.end(); return; }
    if (state.mood !== mood) { state.mood = mood as MoodId; console.log(`   Mood changed to ${mood}; the next picture not yet started will follow it.`); }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ mood: state.mood })); return;
  }
  const image = /^\/img\/(\d{2}\.jpg)$/.exec(url.pathname);
  if (image) { try { response.writeHead(200, { 'Content-Type': 'image/jpeg' }); response.end(await readFile(path.join(outDir, image[1]))); } catch { response.writeHead(404); response.end(); } return; }
  response.writeHead(404); response.end();
});
server.listen(port, '127.0.0.1');
console.log(`Heartbeat live test: ${place.name}, ${count} pictures, one every ${everyMinutes} min, painter ${model}, mood ${state.mood}.`);
if (!azure) console.log(`Kie credits at start: ${state.startCredits ?? 'unknown'}`);
else console.log('Azure FLUX: about $0.04 of Azure credit per picture.');
console.log(`Open http://127.0.0.1:${port}/ and leave it on screen. Press Ctrl+C to stop early.`);

// Prepare ahead: each picture is made shortly before it is due, while the previous one is on
// screen, then shown exactly on schedule (or as soon as it is ready, if it runs late).
let lastShown = 0;
for (let n = 1; n <= count; n++) {
  if (lastShown) await new Promise(resolve => setTimeout(resolve, Math.max(0, lastShown + everyMinutes * 60000 - leadMs - Date.now())));
  await attempt(n);
  state.preparing = '';
  const frame = state.frames.at(-1)!;
  // A failed picture gives up its slot; the next one is prepared for the following slot.
  if (!frame.file) {
    // Two failures in a row: stop instead of spending more credits on the same problem.
    if (state.frames.at(-2)?.error) { state.stopped = 'Stopped early after two pictures in a row could not be made, to protect your credits.'; console.log(`\n${state.stopped}`); break; }
    if (lastShown) { lastShown += everyMinutes * 60000; state.nextAt = lastShown + everyMinutes * 60000; }
    continue;
  }
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
if (azure) console.log(`\nDone: ${made} of ${count} pictures made (about ${(made * 0.04).toFixed(2)} dollars of Azure credit).`);
else console.log(`\nDone: ${made} of ${count} pictures made. Kie credits now:${state.endCredits ?? 'unknown'}${state.startCredits != null && state.endCredits != null ? ` (used ${(state.startCredits - state.endCredits).toFixed(1)})` : ''}.`);
console.log(`Pictures and the director's notes are in ${path.relative(root, outDir)}/. The page stays open; press Ctrl+C to close it.`);
