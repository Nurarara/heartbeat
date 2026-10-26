// Actual CustomerDisplay orchestration with deferred, deliberately reordered requests.
// LiveHeartbeat is a mount probe; no artwork generation, provider calls or browser automation.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:5173/display',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
for(const key of ['window','document','HTMLElement','localStorage','location','history'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:dom.window[key],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.identityMounts=[];globalThis.identityUnmounts=[];
let mode='deferred',sessions=[],profiles=[],calls=[];
const preferences=(owner='A',version=1)=>({version:1,location:{name:`${owner} city ${version}`,country:'UK',latitude:51.5,longitude:-.12,timezone:'UTC'},unit:'c',seed:42,reducedMotion:true});
const session=(owner,version=1)=>({user:owner?{id:owner}:null,profileVersion:version});
const profile=(owner,version=1)=>({preferences:preferences(owner,version),memory:null,version,surface:{owner_id:owner}});
globalThis.fetch=async(url,options={})=>{calls.push({url,options});if(mode!=='deferred')throw new Error('Unexpected fixture mode');return new Promise(resolve=>{const queue=url==='/api/product/auth/session'?sessions:url==='/api/product/preferences'?profiles:null;assert.ok(queue,`Unexpected request ${url}`);queue.push(value=>resolve(Response.json(value)));});};
const output=await build({stdin:{contents:"export {CustomerDisplay} from './components/customer-app';",resolveDir:process.cwd(),loader:'tsx'},plugins:[{name:'identity-probe',setup(b){b.onResolve({filter:/^@\/app\/live-heartbeat$/},()=>({path:'identity-probe',namespace:'identity-probe'}));b.onLoad({filter:/.*/,namespace:'identity-probe'},()=>({contents:"import React,{useEffect} from 'react';export default function Probe(p){useEffect(()=>{globalThis.identityMounts.push(p.initialPreferences.location.name);return()=>{globalThis.identityUnmounts.push(p.initialPreferences.location.name);};},[]);return React.createElement('div',{'data-identity':p.initialPreferences.location.name,'data-version':p.initialPreferencesVersion},p.initialPreferences.location.name);}",loader:'jsx',resolveDir:process.cwd()}));}}],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,tsconfig:'tsconfig.json',logLevel:'silent'});
const artifact=new URL('../.sites-runtime/tests/account-identity.cjs',import.meta.url);await mkdir(new URL('../.sites-runtime/tests/',import.meta.url),{recursive:true});await writeFile(artifact,output.outputFiles[0].contents);
const {CustomerDisplay}=createRequire(import.meta.url)(fileURLToPath(artifact)),React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');let root;
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
const shown=()=>document.querySelector('[data-identity]')?.getAttribute('data-identity')??null;
async function resolve(queue,value){assert.ok(queue.length,'Expected a pending request');await act(async()=>queue.shift()(value));await settle();}
async function event(type,key){await act(async()=>{const target=type==='visibilitychange'?document:window;target.dispatchEvent(type==='storage'?new dom.window.StorageEvent('storage',{key}):new dom.window.Event(type));});await settle();}
async function mount(){await act(async()=>{root=createRoot(document.getElementById('app'));root.render(React.createElement(CustomerDisplay));});await settle();}
async function unmount(){await act(async()=>root.unmount());await settle();}
const originalStorage=globalThis.localStorage;
try{
 await mount();await resolve(sessions,session('A'));assert.equal(profiles.length,1);
 await event('storage','heartbeat.account.owner');await resolve(profiles,profile('A'));assert.equal(shown(),null,'Superseded profile cannot render after another-tab account change');assert.deepEqual(globalThis.identityMounts,[]);await resolve(sessions,session('B'));await resolve(profiles,profile('B'));assert.equal(shown(),'B city 1');assert.equal(localStorage.getItem('heartbeat.account.owner'),'B');
 await event('focus');assert.equal(shown(),null,'Refocus clears the old owner before session revalidation');await resolve(sessions,session('B',2));await resolve(profiles,profile('B',2));assert.equal(shown(),'B city 2');assert.ok(globalThis.identityUnmounts.includes('B city 1'));
 // A periodic check with unchanged owner but newer preference version must
 // remount the inner display, whose server-version refs are initialized once.
 const nativeInterval=globalThis.setInterval,nativeClear=globalThis.clearInterval;await unmount();let poll;
 globalThis.setInterval=(fn,ms,...args)=>ms===60000?(poll=fn,999999):nativeInterval(fn,ms,...args);globalThis.clearInterval=id=>id===999999?undefined:nativeClear(id);
 try{await mount();await resolve(sessions,session('B',2));await resolve(profiles,profile('B',2));const mounts=globalThis.identityMounts.length;await act(async()=>poll());await resolve(sessions,session('B',3));await resolve(profiles,profile('B',3));assert.equal(shown(),'B city 3');assert.equal(globalThis.identityMounts.length,mounts+1,'Canonical preference version remounts the initialized display');await act(async()=>poll());await resolve(sessions,session('B',3));assert.equal(profiles.length,0,'Unchanged canonical preferences avoid another profile read');await unmount();}finally{globalThis.setInterval=nativeInterval;globalThis.clearInterval=nativeClear;}
 // Storage can be unavailable and cookies can change between the two GETs.
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Storage unavailable');}});
 await mount();await resolve(sessions,session('A'));await resolve(profiles,profile('B'));assert.equal(shown(),null,'A profile received under a different cookie cannot be labeled with the earlier session owner');assert.match(document.body.textContent,/account changed/);await event('focus');await resolve(sessions,session('B'));await resolve(profiles,profile('B'));assert.equal(shown(),'B city 1','Canonical profiles still work without local storage');
 Object.defineProperty(document,'hidden',{value:true,configurable:true});await event('storage',null);assert.equal(shown(),null,'Account storage invalidation unmounts even while the tab is hidden');assert.equal(sessions.length,0);Object.defineProperty(document,'hidden',{value:false,configurable:true});await event('visibilitychange');await resolve(sessions,session(null));assert.equal(shown(),null,'Logged-out session cannot restore a previous account display');await unmount();
 Object.defineProperty(globalThis,'localStorage',{value:originalStorage,configurable:true});await mount();await resolve(sessions,session('A'));await unmount();await resolve(profiles,profile('A'));assert.equal(shown(),null,'An unmounted request cannot render or alter account storage');
 assert.ok(calls.every(c=>c.url==='/api/product/auth/session'||c.url==='/api/product/preferences'),'Identity checks never request inference or billing');
 console.log('Passed actual CustomerDisplay identity regressions: superseded responses, focus/logout/hidden invalidation, canonical version remount and unchanged-version read avoidance, blocked storage, mixed-session profile rejection and late unmounted response isolation. DOM simulated; network mocked.');
}finally{Object.defineProperty(globalThis,'localStorage',{value:originalStorage,configurable:true});try{await act(async()=>root.unmount());}catch{}dom.window.close();}
