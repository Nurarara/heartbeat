// Actual account playback with queued jobs, full generation cooldown and exhausted capacity.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {planMoment} from '../lib/ambient-director.ts';
import {proposeCreativeMoment} from '../lib/creative.ts';
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:5173',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','localStorage'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:dom.window[key],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:true});globalThis.Image=function(){const i=document.createElement('img');i.decode=()=>Promise.resolve();return i;};
const preferences={version:1,location:{name:'London',country:'UK',latitude:51.5,longitude:-.12,timezone:'UTC'},unit:'c',seed:42,reducedMotion:true};
let at=Date.parse('2026-10-21T12:00:00Z'),capture,posts=0,polls=0,acks=0,requestId,startedAt,blockedStorage=false,loseResponse=false,ready;
function candidate(){const d=planMoment(preferences.location,null,startedAt,null,43).direction,id=crypto.randomUUID();const proposal=proposeCreativeMoment({phase:d.phase,season:d.season,temperature:null,weekday:d.brief.weekday,festive:false},undefined,44,startedAt);proposal.source='ai-director';d.id=`generated-${id}`;d.artwork={attemptId:id,url:`/api/ai/art/${id}`,title:'A new account picture',proposal};return {id,requestId,locationKey:d.locationKey,createdAt:startedAt,direction:d};}
globalThis.fetch=async(url,options={})=>{
 if(url==='/api/ai/status')return Response.json({configured:true,authorized:true,available:posts===0||loseResponse,account:true,nextAt:startedAt?startedAt+3600000:0,reason:'Account ready'});
 if(url==='/api/product/generation'){posts++;startedAt=at;requestId=JSON.parse(options.body).requestId;ready=candidate();if(loseResponse)throw new Error('Lost paid response');return Response.json({status:'pending',nextAt:at+5000},{status:202});}
 if(String(url).startsWith('/api/product/generation?')){polls++;assert.equal(new URL(url,'http://localhost').searchParams.get('requestId'),requestId);return Response.json(polls===1?{status:'pending',nextAt:at+5000}:{status:'ready',candidate:ready,nextAt:startedAt+3600000});}
 if(url==='/api/ai/display'){acks++;return Response.json({displayed:true});}
 throw new Error(`Unexpected request ${url}`);
};
const out=await build({stdin:{contents:`import React from 'react';import {useAmbientDirector} from './hooks/use-ambient-director';import {useAIPlayback} from './hooks/use-ai-playback';import {AmbientArt} from './components/ambient-art';export default function Harness(p){const local=useAmbientDirector(p.preferences,null,p.at,false,()=>{});const ai=useAIPlayback({base:local.direction,memory:local.memory,preferences:p.preferences,at:p.at,paused:false,visible:true,accept:local.acceptGenerated,reject:local.rejectGenerated,localCanDisplay:local.canDisplay},true);p.capture({local,ai});return ai.displayDirection?<AmbientArt direction={ai.displayDirection} paused={false} reducedMotion={true} visible={true} onError={ai.onFailure} onDisplayed={d=>{local.onDisplayed(d);ai.onDisplayed(d)}} canDisplay={ai.canDisplay}/>:null}`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,tsconfig:'tsconfig.json',logLevel:'silent'});
const artifact=new URL('../.sites-runtime/tests/product-playback.cjs',import.meta.url);await mkdir(new URL('../.sites-runtime/tests/',import.meta.url),{recursive:true});await writeFile(artifact,out.outputFiles[0].contents);
const Harness=createRequire(import.meta.url)(fileURLToPath(artifact)).default,React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');let root;
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,30));});
async function render(){await act(async()=>root.render(React.createElement(Harness,{preferences,at,capture:v=>capture=v})));await settle();}
async function mount(){root=createRoot(document.getElementById('app'));await render();await settle();}
async function unmount(){await act(async()=>root.unmount());await settle();}
const originalStorage=globalThis.localStorage;
try{
 await mount();assert.equal(posts,1);assert.equal(capture.ai.connection.available,false);assert.ok(capture.ai.nextAt>=startedAt+3600000);
 at+=5000;await render();assert.equal(polls,1,'Pending work polls in five seconds despite hour-long generation cooldown and full capacity');
 at+=5000;await render();await settle();assert.equal(polls,2);assert.equal(posts,1);assert.equal(acks,1);assert.equal(capture.local.memory.history.at(-1).direction.artwork.attemptId,ready.id);assert.equal(localStorage.getItem('heartbeat.ai-request.v1'),null);
 await unmount();localStorage.clear();posts=0;polls=1;acks=0;startedAt=0;loseResponse=true;at+=7200000;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Blocked storage');}});blockedStorage=true;
 await mount();assert.equal(posts,1);assert.match(capture.ai.message,/Lost paid response/);loseResponse=false;await act(async()=>capture.ai.refresh());
 at+=600000;await render();await settle();assert.equal(posts,1,'Lost response with blocked storage must not create another paid POST');assert.equal(polls,2);assert.equal(acks,1);assert.equal(capture.local.memory.history.at(-1).direction.artwork.attemptId,ready.id);await unmount();
 console.log('Passed actual account queue playback: five-second recovery independent of subscription cooldown/full capacity, decoded display ACK, request cleanup, and lost-response recovery without storage or a second paid request. Provider/network mocked.');
}finally{if(blockedStorage)Object.defineProperty(globalThis,'localStorage',{value:originalStorage,configurable:true});try{await act(async()=>root.unmount());}catch{}dom.window.close();}
