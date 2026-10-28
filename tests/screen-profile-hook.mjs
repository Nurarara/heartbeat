// Actual hook in a simulated DOM; mock metadata only, never inference requests.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM,VirtualConsole} from 'jsdom';
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:5173/display',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
for(const key of ['window','document','HTMLElement'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const requests=[];let version=1,mode='ok',resolvePost;
globalThis.fetch=async(url,options={})=>{
 const body=options.body?JSON.parse(options.body):null;requests.push({url,body,signal:options.signal});
 if(url==='/api/product/preferences')return Response.json({worldId:'world-owner',surfaceId:'surface-owner',surface:{version}});
 assert.equal(url,'/api/product/surface','Hook can only publish presentation metadata');
 if(mode==='deferred')return new Promise(resolve=>{resolvePost=()=>resolve(Response.json({surfaceVersion:++version}));});
 if(mode==='fail')return Response.json({error:'Unavailable'},{status:503});
 if(mode==='conflict'){mode='ok';version=22;return Response.json({error:'Screen changed'},{status:409});}
 if(mode==='hang')return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 assert.equal(body.expectedVersion,version);return Response.json({surfaceVersion:++version});
};
const output=await build({stdin:{contents:"export {useScreenProfile} from './hooks/use-screen-profile';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,tsconfig:'tsconfig.json',logLevel:'silent'});
const artifact=new URL('../.sites-runtime/tests/screen-profile-hook.cjs',import.meta.url);await mkdir(new URL('../.sites-runtime/tests/',import.meta.url),{recursive:true});await writeFile(artifact,output.outputFiles[0].contents);
const {useScreenProfile}=createRequire(import.meta.url)(fileURLToPath(artifact)),React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');let root;
const settle=(ms=15)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
function Harness({enabled=true,initial}){const ready=useScreenProfile(enabled,initial);return React.createElement('span',{'data-ready':String(ready)},ready?'Ready':'Measuring');}
const identity=()=>({worldId:'world-owner',surfaceId:'surface-owner',surfaceVersion:version});
const ready=()=>document.querySelector('[data-ready]').dataset.ready==='true';
const posts=()=>requests.filter(request=>request.url==='/api/product/surface');
function size(width,height){Object.defineProperty(window,'innerWidth',{value:width,configurable:true});Object.defineProperty(window,'innerHeight',{value:height,configurable:true});}
async function mount(props={}){await act(async()=>{root=createRoot(document.getElementById('app'));root.render(React.createElement(Harness,props));});await settle();}
async function resize(width,height){size(width,height);await act(async()=>window.dispatchEvent(new dom.window.Event('resize')));}
async function unmount(){await act(async()=>root.unmount());await settle();}
try{
 size(1440,900);mode='deferred';await mount({initial:identity()});assert.equal(ready(),false,'First prepare waits for its initial coarse screen sync');assert.equal(requests.length,1,'Canonical identity avoids another profile read');await act(async()=>resolvePost());await settle();assert.equal(ready(),true);assert.deepEqual([posts()[0].body.width,posts()[0].body.height],[1600,900]);
 const count=posts().length;for(let i=0;i<15;i++)await resize(1440+i*5,900);await settle(500);assert.equal(posts().length,count,'Resizes inside one coarse class stay local');
 mode='ok';for(let i=0;i<6;i++)await resize(3300+i*28,1440);await settle(500);assert.equal(posts().length,count+1,'A resize burst publishes once after settling');assert.deepEqual([posts().at(-1).body.width,posts().at(-1).body.height],[3440,1440]);
 const beforeUnmount=posts().length;await resize(390,844);await unmount();await settle(500);assert.equal(posts().length,beforeUnmount,'Unmount cancels pending resize work');await resize(1280,1280);await settle(500);assert.equal(posts().length,beforeUnmount,'Unmount removes viewport listeners');
 mode='fail';size(1366,768);await mount({initial:identity()});assert.equal(ready(),true,'A failed metadata sync keeps the display usable');await unmount();
 mode='conflict';await mount({initial:identity()});assert.equal(ready(),true);assert.equal(posts().at(-1).body.expectedVersion,22,'A conflict reloads the owned surface before one retry');assert.ok(requests.some(request=>request.url==='/api/product/preferences'));await unmount();
 const nativeTimeout=globalThis.setTimeout;let fallback;
 globalThis.setTimeout=(fn,delay,...args)=>delay===6500?(fallback=fn,888888):nativeTimeout(fn,delay,...args);
 const nativeClear=globalThis.clearTimeout;globalThis.clearTimeout=id=>id===888888?undefined:nativeClear(id);
 try{mode='hang';await mount({initial:identity()});assert.equal(ready(),false);await act(async()=>fallback());assert.equal(ready(),true,'A bounded fail-open deadline never strands the first original behind metadata');const signal=posts().at(-1).signal;await unmount();assert.equal(signal.aborted,true,'Unmount aborts in-flight metadata');}finally{globalThis.setTimeout=nativeTimeout;globalThis.clearTimeout=nativeClear;}
 const before=posts().length;await mount({enabled:false});assert.equal(ready(),true);assert.equal(posts().length,before,'Local-only displays do not publish account metadata');await unmount();
 assert.ok(requests.every(request=>!String(request.url).includes('generation')&&!String(request.url).includes('checkout')));
 console.log('Passed screen hook: initial bounded readiness, identity read avoidance, coarse resize suppression, debounce, CAS reload/retry, graceful metadata failure, pending-work/listener/AbortController cleanup and no generation/payment calls. React DOM simulated; network mocked.');
}finally{try{await act(async()=>root.unmount());}catch{}dom.window.close();}
