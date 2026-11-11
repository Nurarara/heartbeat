import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {DEMO_SCENES,DEMO_INTERVAL_MS} from '../lib/demo-scenes.ts';
assert.equal(DEMO_INTERVAL_MS,10000);assert.equal(DEMO_SCENES.length,10);
const hashes=new Set();for(const scene of DEMO_SCENES){const bytes=await readFile('public'+scene.image);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');hashes.add(createHash('sha256').update(bytes).digest('hex'));}assert.equal(hashes.size,10,'All ten delivered artworks are distinct files.');
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:5173/demo',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLImageElement'])globalThis[name]=name==='window'?dom.window:dom.window[name];
globalThis.self=dom.window;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;let hidden=false,network=0,fullscreen=0;
Object.defineProperty(document,'hidden',{get:()=>hidden});globalThis.fetch=async()=>{network++;throw new Error('The recording demo must not call APIs.');};
HTMLElement.prototype.requestFullscreen=async function(){fullscreen++;};
globalThis.Image=function(){const image=document.createElement('img');image.decode=()=>Promise.resolve();return image;};
let at=0,id=0;const timers=new Map(),realTimeout=globalThis.setTimeout,realClear=globalThis.clearTimeout;
globalThis.setTimeout=(callback,delay=0)=>{const key=++id;timers.set(key,{at:at+delay,callback});return key;};globalThis.clearTimeout=key=>timers.delete(key);
dom.window.setTimeout=globalThis.setTimeout;dom.window.clearTimeout=globalThis.clearTimeout;
const result=await build({entryPoints:['components/recording-demo.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},write:false,tsconfig:'tsconfig.json',logLevel:'silent'});
await mkdir('.sites-runtime/tests',{recursive:true});await writeFile('.sites-runtime/tests/recording-demo.cjs',result.outputFiles[0].contents);
const Demo=createRequire(import.meta.url)('../.sites-runtime/tests/recording-demo.cjs').default;
const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('app'));
const click=async(selector)=>{const element=document.querySelector(selector);assert.ok(element,selector);await act(async()=>element.click());};
const current=()=>document.querySelector('.hd-art>.hd-image-layer:not(.hd-previous)>.hd-image')?.getAttribute('src');
async function advance(milliseconds){const end=at+milliseconds;while(true){const due=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;at=due[1].at;timers.delete(due[0]);await act(async()=>due[1].callback());}at=end;await act(async()=>{});}
try{
 await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Demo))));
 assert.equal(document.querySelector('.hd-primary').disabled,false,'All images decode before entering.');await click('.hd-primary');assert.equal(fullscreen,1);
 const seen=[current()];await advance(9999);assert.equal(current(),seen[0]);await advance(1);assert.equal(current(),DEMO_SCENES[1].image);assert.ok(document.querySelector('.hd-previous'),'Previous frame remains during crossfade.');seen.push(current());
 for(let i=2;i<10;i++){await advance(10000);seen.push(current());}assert.equal(new Set(seen).size,10);await advance(10000);assert.equal(current(),DEMO_SCENES[0].image,'The loop wraps only after all ten scenes.');
 await click('[aria-label="Pause demo"]');const paused=current();await advance(30000);assert.equal(current(),paused);await click('[aria-label="Resume demo"]');await advance(10000);assert.notEqual(current(),paused);
 hidden=true;await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));const held=current();await advance(60000);assert.equal(current(),held);hidden=false;await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')));await advance(10000);assert.notEqual(current(),held,'Hidden return resumes without a burst of skipped scenes.');
 await click('[aria-label="Restart demo"]');assert.equal(current(),DEMO_SCENES[0].image);await advance(5000);await click('[aria-label="Restart demo"]');await advance(9999);assert.equal(current(),DEMO_SCENES[0].image);await advance(1);assert.equal(current(),DEMO_SCENES[1].image,'Restart resets the full ten-second timer.');
 await click('.hd-options button:first-child');assert.equal(document.querySelector('.hd-readings'),null);await click('.hd-options button:last-child');assert.equal(document.querySelector('main').dataset.fit,'whole');
 assert.match(document.querySelector('.hd-permanent-label').textContent,/prepared artwork/);assert.equal(network,0,'Playback never requests accounts, weather, billing or inference.');
 await act(async()=>root.unmount());assert.equal(timers.size,0,'All playback timers are canceled on unmount.');
 console.log('Passed ten actual unique WebP assets, predecode, exact10-second cadence, smooth-frame retention, full-loop ordering, pause/visibility/restart, fullscreen activation, fit/captions, zeroAPI calls and StrictMode cleanup. DOM/time/decode simulated.');
}finally{globalThis.setTimeout=realTimeout;globalThis.clearTimeout=realClear;dom.window.close();}
