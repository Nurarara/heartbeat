// Actual customer/local display and server adapter. Every fetch is mocked.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {createWeatherAdapter,WeatherConfigurationError} from '../lib/server/weather.ts';
import {localWeatherFallbackAllowed} from '../lib/context.ts';

for(const host of ['localhost','127.0.0.1','[::1]']){assert.equal(localWeatherFallbackAllowed(false,{protocol:'http:',hostname:host}),true);assert.equal(localWeatherFallbackAllowed(true,{protocol:'http:',hostname:host}),false);assert.equal(localWeatherFallbackAllowed(false,{protocol:'https:',hostname:host}),false);}
for(const host of ['heartbeat.example','localhost.evil.test','127.0.0.1.evil.test'])assert.equal(localWeatherFallbackAllowed(false,{protocol:'http:',hostname:host}),false);
const london={name:'London',country:'United Kingdom',latitude:51.5,longitude:-.12,timezone:'Europe/London'},tokyo={name:'Tokyo',country:'Japan',latitude:35.68,longitude:139.69,timezone:'Asia/Tokyo'};
let now=Date.parse('2026-10-27T12:00:00Z'),reject=false,calls=0,canceled=0,retries=0;
const server=createWeatherAdapter({HEARTBEAT_APP_MODE:'production',HEARTBEAT_WEATHER_PROVIDER:'open-meteo-commercial',HEARTBEAT_WEATHER_API_KEY:'fixture-weather-boundary-key'},{now:()=>now,sleep:async()=>{retries++;},fetcher:async()=>{
 calls++;if(reject)return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('provider error'));},cancel(){canceled++;}}),{status:401});
 return Response.json({current:{time:now/1000,temperature_2m:7,weather_code:3,is_day:1}});
}});
await server.collect(london);now+=6*60000;reject=true;
const rejected=await Promise.allSettled([server.collect(london),server.collect(london)]);
assert.ok(rejected.every(result=>result.status==='rejected'&&result.reason instanceof WeatherConfigurationError),'A provider credential rejection stays a configuration error for every deduplicated caller, even with a usable stale snapshot');
assert.ok(rejected.every(result=>result.reason.status===401&&!result.reason.message.includes('fixture-weather-boundary-key')));assert.equal(calls,2);assert.equal(retries,0);assert.equal(canceled,1,'Rejected response bodies are canceled before failing closed');

const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:5173/display',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
for(const key of ['window','document','HTMLElement','HTMLInputElement','localStorage'])Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:dom.window[key],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
globalThis.Image=function(){const image=document.createElement('img');image.decode=()=>Promise.resolve();return image;};
const requests=[];
globalThis.fetch=async(url,options={})=>{
 const address=new URL(String(url),window.location.href);requests.push(address.href);
 if(address.pathname==='/api/context'||address.pathname==='/api/locations')return Response.json({error:'Provider unavailable'},{status:503});
 if(address.pathname==='/api/ai/status')return Response.json({configured:false,authorized:false,available:false,reason:'Fixture'});
 if(address.pathname==='/api/product/surface')return Response.json({surfaceVersion:1});
 if(address.hostname==='api.open-meteo.com')return Response.json({current:{time:Date.now()/1000,temperature_2m:9,weather_code:3,is_day:1}});
 if(address.hostname==='geocoding-api.open-meteo.com')return Response.json({results:[tokyo]});
 throw new Error(`Unexpected mocked display request ${address.pathname}`);
};
const output=await build({entryPoints:['app/live-heartbeat.tsx'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,tsconfig:'tsconfig.json',logLevel:'silent'});
const artifact=new URL('../.sites-runtime/tests/weather-boundary.cjs',import.meta.url);await mkdir(new URL('../.sites-runtime/tests/',import.meta.url),{recursive:true});await writeFile(artifact,output.outputFiles[0].contents);
const Live=createRequire(import.meta.url)(fileURLToPath(artifact)).default,React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');let root;
const settle=(ms=30)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});
async function type(node,value){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});await settle(350);}
const preferences={version:1,location:london,unit:'c',seed:42,reducedMotion:true};
try{
 for(const [url,customer,allow] of [['http://localhost:5173/display',true,false],['https://heartbeat.example/display',false,false],['http://localhost:5173/local-study',false,true],['http://localhost.evil.test/display',false,false],['https://localhost/display',false,false]]){
  dom.reconfigure({url});localStorage.clear();requests.length=0;
  await act(async()=>{root=createRoot(document.getElementById('app'));root.render(React.createElement(Live,{customer,initialPreferences:preferences,initialSurface:{worldId:'world-owner',surfaceId:'surface-owner',surfaceVersion:1}}));});await settle();
  const settings=document.querySelector('button[aria-label="City and display settings"]');assert.ok(settings);await act(async()=>settings.click());await type(document.querySelector('.hb-panel .hb-city-input'),'Tokyo');
  const freeForecast=requests.some(value=>new URL(value).hostname==='api.open-meteo.com'),freeSearch=requests.some(value=>new URL(value).hostname==='geocoding-api.open-meteo.com');
  assert.equal(freeForecast,allow,`${url} customer=${customer}: forecast fallback boundary`);assert.equal(freeSearch,allow,`${url} customer=${customer}: geocoding fallback boundary`);
  if(!allow){assert.match(document.querySelector('.hb-search-status').textContent,/unavailable/);assert.match(document.querySelector('.hb-temperature').textContent,/Temperature unavailable/);}
  await act(async()=>root.unmount());await settle();
 }
 assert.ok(!requests.some(value=>/generation|checkout/.test(new URL(value).pathname)));
 console.log('Passed customer/hosted forecast and geocoding boundaries, explicit HTTP-loopback-only study fallback, provider configuration failures preserved across stale/deduplicated requests, zero retries, response-body cancellation and no inference/payment. React DOM/HTTP mocked; SQLite not needed.');
}finally{try{await act(async()=>root.unmount());}catch{}dom.window.close();}
