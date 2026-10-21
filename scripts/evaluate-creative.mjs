// Offline planning evaluation. No real model/image calls or user memory changes.
import { mkdir, writeFile } from 'node:fs/promises';
import { creativePacket, proposeCreativeMoment, rememberCreativeDisplay } from '../lib/creative.ts';
import { THEME_LIBRARY } from '../lib/creative-library.ts';

const at = Date.parse('2026-12-20T12:00:00Z');
const scenarios = [
  { label: 'Warm Sunday afternoon', phase: 'day', temperature: 27, weekday: 'Sunday', season: 'summer' },
  { label: 'Cold weekday morning', phase: 'morning', temperature: 4, weekday: 'Monday', season: 'winter' },
  { label: 'Quiet evening', phase: 'dusk', temperature: 12, weekday: 'Thursday', season: 'autumn' },
  { label: 'Restful night', phase: 'night', temperature: 20, weekday: 'Saturday', season: 'summer' },
  { label: 'Missing outdoor temperature', phase: 'morning', temperature: null, weekday: 'Tuesday', season: 'spring' },
  { label: 'Tropical night', phase: 'night', temperature: 28, weekday: 'Wednesday', season: 'tropical' },
];
const reviews = [], metrics = [];
for (const guided of [false, true]) {
  let memory;
  const fingerprints = new Set(), entries = new Set(); let recentRepeats = 0, largestPacket = 0;
  for (let step = 0; step < 240; step++) {
    const scenario = scenarios[step % scenarios.length];
    const context = { phase: scenario.phase, temperature: scenario.temperature, weekday: scenario.weekday, season: scenario.season, festive: false };
    const time = at + step * 3600000, seed = step * 3571 + 42;
    const proposal = proposeCreativeMoment(context, memory, seed, time, { guided });
    if (memory?.recent.some(item => item.fingerprint === proposal.fingerprint)) recentRepeats++;
    fingerprints.add(proposal.fingerprint); proposal.themes.forEach(theme => entries.add(theme.id));
    if (step < 24) {
      const pair = reviews[step] || { id: step, context: scenario, choices: [] };
      pair.choices.push({ method: guided ? 'guided' : 'uniform', title: proposal.title, prompt: proposal.prompt, themes: proposal.themes });
      reviews[step] = pair;
    }
    memory = rememberCreativeDisplay(memory, proposal.fallbackScene, time, proposal);
    largestPacket = Math.max(largestPacket, JSON.stringify(creativePacket(context, memory, seed, time, [])).length);
  }
  metrics.push({ method: guided ? 'guided' : 'uniform', simulatedProposals: 240, semanticCompositions: fingerprints.size, recentRepeats, ingredientsUsed: entries.size, boundedMemoryCharacters: JSON.stringify(memory).length, largestPacketCharacters: largestPacket });
}
// Alternate A/B positions; a stable review ID allows exported feedback to be joined.
reviews.forEach((pair, index) => { if (index % 2) pair.choices.reverse(); });
const summary = { scope: 'Offline proposal simulation only. No real model calls, images or aesthetic-quality measurements.', libraryEntries: THEME_LIBRARY.length, metrics };
await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
await writeFile(new URL('../outputs/creative-evaluation.json', import.meta.url), JSON.stringify(summary, null, 2));
const safeData = JSON.stringify(reviews).replace(/</g, '\\u003c');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Heartbeat — brief review</title><style>body{font:16px/1.6 system-ui;max-width:1100px;margin:40px auto;padding:0 22px;background:#11212c;color:#ece6d8}h1{font:36px Georgia}article{margin:40px 0;border-top:1px solid #73828b;padding-top:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.choice{background:#1c303d;border-radius:12px;padding:20px}button,select{font:inherit;color:inherit;background:#29414e;border:1px solid #71848e;border-radius:6px;padding:8px}label{display:block;margin:12px 0}small{color:#c2c8bf}.method{display:none}body.reveal .method{display:block}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Which idea belongs in the room?</h1><p>Planning briefs only. No images or live AI were generated. Compare fit, atmosphere and freshness; visual beauty still needs actual image review.</p><p>Uniform sampling and context/memory-guided sampling use the same library. This measures planning policy, not one AI model against another.</p><button id="export">Export ratings</button> <button id="reveal">Reveal methods</button><p id="status" role="status"></p><main></main><script type="application/json" id="data">${safeData}</script><script>
const data=JSON.parse(document.getElementById('data').textContent);let ratings={};try{ratings=JSON.parse(localStorage.getItem('heartbeat.brief-review.v1')||'{}')}catch{}
const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e};
for(const row of data){const article=make('article');article.append(make('h2',row.context.label+' · pair '+(row.id+1)));const grid=make('div');grid.className='pair';row.choices.forEach((choice,index)=>{const card=make('section');card.className='choice';card.append(make('h3',index?'B':'A'),make('p',choice.title),make('p',choice.prompt));const method=make('p','Method: '+choice.method);method.className='method';card.append(method);for(const criterion of ['Context fit','Restful atmosphere','Fresh idea']){const key=row.id+':'+choice.method+':'+criterion;const label=make('label',criterion+' '),select=make('select');select.setAttribute('aria-label','Pair '+(row.id+1)+' '+(index?'B':'A')+' '+criterion);for(let n=0;n<=5;n++){const option=make('option',n?String(n):'Not rated');option.value=String(n);select.append(option)}select.value=String(ratings[key]||0);select.onchange=()=>{ratings[key]=Number(select.value);try{localStorage.setItem('heartbeat.brief-review.v1',JSON.stringify(ratings))}catch{document.getElementById('status').textContent='Browser storage unavailable; export before closing.'}};label.append(select);card.append(label)}grid.append(card)});article.append(grid);document.querySelector('main').append(article)}
document.getElementById('reveal').onclick=()=>document.body.classList.toggle('reveal');document.getElementById('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,scope:'briefs-only',ratings},null,2)],{type:'application/json'}));const link=make('a');link.href=url;link.download='heartbeat-brief-ratings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
</script></html>`;
await writeFile(new URL('../outputs/creative-review.html', import.meta.url), html);
console.log(JSON.stringify(summary, null, 2));
console.log('Open outputs/creative-review.html to compare 24 pairs and export human ratings.');
