// Server-only adapter. Browser-safe parsing lives in ../context.ts; no provider
// credential or configurable upstream URL is ever returned to clients.
import {contextPlace,locationResults} from '../context.ts';
import type {Context,Place} from '../world.ts';
import type {ProductEnv} from '../product/core.ts';
export class WeatherConfigurationError extends Error {readonly status?:number;constructor(message:string,status?:number){super(message);this.status=status;}}
export class WeatherUnavailableError extends Error {
 readonly category:'http'|'timeout'|'network'|'unavailable';readonly status?:number;
 constructor(category:'http'|'timeout'|'network'|'unavailable'='unavailable',status?:number){super('Weather provider is temporarily unavailable.');this.category=category;this.status=status;}
}
export type WeatherContext = Context & {provenance:{version:1;provider:string;attribution:string;endpointHost:string;freshness:'fresh'|'stale';locationGrid:'0.001deg'}};
type Entry={expires:number;fetchedAt:number;value:unknown};
const cache=new Map<string,Entry>(),pending=new Map<string,Promise<Entry>>();
const circuits=new Map<string,{failures:number;until:number}>();
const MAX_ENTRIES=512,FRESH_TTL=300000,STALE_TTL=900000,OBSERVATION_MAX_AGE=5400000;
function boundedSet<T>(map:Map<string,T>,key:string,value:T){if(map.size>=MAX_ENTRIES&&!map.has(key))map.delete(map.keys().next().value!);map.set(key,value);}
function endpoint(env:ProductEnv,kind:'forecast'|'search'){
 const provider=env.HEARTBEAT_WEATHER_PROVIDER||'open-meteo-free';
 if(!['open-meteo-free','open-meteo-commercial'].includes(provider))throw new WeatherConfigurationError('Weather provider is not supported.');
 const commercial=provider==='open-meteo-commercial',hosted=['staging','production'].includes(env.HEARTBEAT_DEPLOYMENT_ENV||'')||env.HEARTBEAT_APP_MODE==='production';
 if(hosted&&(!commercial||!env.HEARTBEAT_WEATHER_API_KEY?.trim()))throw new WeatherConfigurationError('Commercial weather must be configured before hosted use.');
 if(commercial&&!env.HEARTBEAT_WEATHER_API_KEY?.trim())throw new WeatherConfigurationError('Commercial weather credentials are missing.');
 const fallback=kind==='forecast'?(commercial?'https://customer-api.open-meteo.com/v1/forecast':'https://api.open-meteo.com/v1/forecast'):(commercial?'https://customer-geocoding-api.open-meteo.com/v1/search':'https://geocoding-api.open-meteo.com/v1/search');
 let u:URL;try{u=new URL((kind==='forecast'?env.HEARTBEAT_WEATHER_FORECAST_URL:env.HEARTBEAT_WEATHER_GEOCODING_URL)||fallback);}catch{throw new WeatherConfigurationError('Weather endpoint is invalid.');}
 const known=commercial?['customer-api.open-meteo.com','customer-geocoding-api.open-meteo.com']:['api.open-meteo.com','geocoding-api.open-meteo.com'];
 const hosts=new Set([...known,...(env.HEARTBEAT_WEATHER_ALLOWED_HOSTS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean)]);
 const privateHost=u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.hostname.includes(':')||/^\d+(\.\d+){3}$/.test(u.hostname);
 if(u.protocol!=='https:'||u.port||u.username||u.password||privateHost||!hosts.has(u.hostname)||u.search||u.hash)throw new WeatherConfigurationError('Weather endpoint is not an approved HTTPS origin.');
 if(commercial)u.searchParams.set('apikey',env.HEARTBEAT_WEATHER_API_KEY!);
 return u;
}
async function boundedJSON(response:Response){
 if(Number(response.headers.get('content-length'))>150000)throw new Error('Weather response exceeded the limit.');
 const reader=response.body?.getReader();if(!reader)throw new Error('Weather response was empty.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>150000){await reader.cancel();throw new Error('Weather response exceeded the limit.');}chunks.push(next.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
function observation(value:unknown){
 const d=value as {current?:{time?:unknown;temperature_2m?:unknown;weather_code?:unknown;is_day?:unknown};daily?:{sunrise?:unknown[];sunset?:unknown[]}}|null;
 const c=d?.current,observedAt=typeof c?.time==='number'?c.time*1000:NaN;
 if(!c||!Number.isFinite(observedAt)||observedAt<=0||observedAt>=8640000000000000)throw new Error('Weather response was invalid.');
 const solar=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v*1000<8640000000000000?new Date(v*1000).toISOString():undefined;
 return {temperature:typeof c.temperature_2m==='number'&&Number.isFinite(c.temperature_2m)&&c.temperature_2m>=-90&&c.temperature_2m<=65?c.temperature_2m:null,observedAt,weatherCode:typeof c.weather_code==='number'&&Number.isInteger(c.weather_code)?c.weather_code:null,isDay:c.is_day===1?true:c.is_day===0?false:null,sunrise:solar(d?.daily?.sunrise?.[0]),sunset:solar(d?.daily?.sunset?.[0])};
}
async function waitForCaller<T>(work:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return work;if(signal.aborted)throw new DOMException('Request cancelled.','AbortError');
 return new Promise<T>((resolve,reject)=>{const aborted=()=>reject(new DOMException('Request cancelled.','AbortError'));signal.addEventListener('abort',aborted,{once:true});work.then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));});
}
export function createWeatherAdapter(env:ProductEnv,deps:{fetcher?:typeof fetch;now?:()=>number;sleep?:(ms:number)=>Promise<void>}={}){
 const fetcher=deps.fetcher||fetch,now=deps.now||Date.now,sleep=deps.sleep||((ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
 const attribution=env.HEARTBEAT_WEATHER_ATTRIBUTION||'Weather by Open-Meteo; location data by GeoNames';
 let scope:Promise<string>|undefined;
 const configScope=()=>scope??=(async()=>{const config=[env.HEARTBEAT_WEATHER_PROVIDER||'open-meteo-free',env.HEARTBEAT_WEATHER_API_KEY||'',env.HEARTBEAT_WEATHER_FORECAST_URL||'',env.HEARTBEAT_WEATHER_GEOCODING_URL||''].join('|');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(config))),v=>v.toString(16).padStart(2,'0')).join('');})();
 async function get(kind:'forecast'|'search',params:URLSearchParams,ttl:number,signal?:AbortSignal):Promise<{entry:Entry;stale:boolean;host:string}>{
  if(signal?.aborted)throw new DOMException('Request cancelled.','AbortError');
  const url=endpoint(env,kind);for(const [k,v] of params)url.searchParams.set(k,v);
  const namespace=await configScope(),key=`${namespace}:${url.origin}${url.pathname}:${kind}:${params.toString()}`,circuitKey=`${namespace}:${url.origin}`;
  const saved=cache.get(key);if(saved&&saved.expires>now())return {entry:saved,stale:false,host:url.hostname};
  const fallback=(reason?:unknown)=>{if(reason instanceof WeatherConfigurationError)throw reason;if(kind==='forecast'&&saved&&now()-saved.fetchedAt<=STALE_TTL){const c=observation(saved.value);if(now()-c.observedAt<=OBSERVATION_MAX_AGE&&c.observedAt-now()<=300000)return {entry:saved,stale:true,host:url.hostname};}throw reason instanceof WeatherUnavailableError?reason:new WeatherUnavailableError();};
  const inflight=pending.get(key);if(inflight){try{return {entry:await waitForCaller(inflight,signal),stale:false,host:url.hostname};}catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw error;return fallback(error);}}
  const circuit=circuits.get(circuitKey);if(circuit&&circuit.until>now())return fallback();
  // Per-isolate backpressure bounds in-flight bodies and sockets. Hosted edge
  // and actor rate controls are still required; this is not a global quota.
  if(pending.size>=16)return fallback();
  const work=(async()=>{try{
   let value:unknown;
   for(let attempt=0;attempt<2;attempt++){
    try{const r=await fetcher(url.href,{signal:AbortSignal.timeout(6000),redirect:'manual'});if(!r.ok){await r.body?.cancel().catch(()=>{});if([400,401,403,404].includes(r.status))throw new WeatherConfigurationError('Weather provider rejected its configuration. Contact the operator.',r.status);throw new WeatherUnavailableError('http',r.status);}value=await boundedJSON(r);if(kind==='forecast')observation(value);else if(!value||typeof value!=='object'||(value as {error?:unknown}).error)throw new Error('Location response was invalid.');break;}
    catch(error){if(error instanceof WeatherConfigurationError||attempt===1)throw error;await sleep(150);}
   }
   const entry={value,fetchedAt:now(),expires:now()+ttl};boundedSet(cache,key,entry);circuits.delete(circuitKey);return entry;
  }catch(error){if(error instanceof WeatherConfigurationError)throw error;const failures=(circuits.get(circuitKey)?.failures||0)+1;boundedSet(circuits,circuitKey,{failures,until:failures>=3?now()+60000:0});const failure=error instanceof WeatherUnavailableError?error:new WeatherUnavailableError(error instanceof DOMException&&error.name==='TimeoutError'?'timeout':'network');console.warn('Heartbeat weather dependency unavailable',{kind,category:failure.category,status:failure.status,errorType:error instanceof Error?error.name:'unknown'});throw failure;}
  finally{pending.delete(key);}})();pending.set(key,work);
  try{return {entry:await waitForCaller(work,signal),stale:false,host:url.hostname};}catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw error;return fallback(error);}
 }
 return {
  async search(query:string,signal?:AbortSignal){const normalized=query.trim().slice(0,100).toLowerCase();if(normalized.length<2)return [];return locationResults((await get('search',new URLSearchParams({name:normalized,count:'7',language:'en',format:'json'}),3600000,signal)).entry.value);},
  async collect(place:Place,signal?:AbortSignal):Promise<WeatherContext>{
   contextPlace(new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),timezone:place.timezone}));
   // A roughly 100m grid keeps sharing conservative near coasts/hills. Include
   // timezone, units, fields and provider configuration in the cache identity.
   const params=new URLSearchParams({latitude:place.latitude.toFixed(3),longitude:place.longitude.toFixed(3),current:'temperature_2m,weather_code,is_day',daily:'sunrise,sunset',timezone:place.timezone,forecast_days:'1',timeformat:'unixtime',temperature_unit:'celsius'});
   const result=await get('forecast',params,FRESH_TTL,signal),c=observation(result.entry.value),stale=result.stale||now()-c.observedAt>OBSERVATION_MAX_AGE||c.observedAt-now()>300000;
   return {...c,fetchedAt:result.entry.fetchedAt,stale,provenance:{version:1,provider:env.HEARTBEAT_WEATHER_PROVIDER||'open-meteo-free',attribution,endpointHost:result.host,freshness:stale?'stale':'fresh',locationGrid:'0.001deg'}};
  },
  attribution,
 };
}
