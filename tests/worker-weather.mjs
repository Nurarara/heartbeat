// Node 22+, from the repository root: node tests/worker-weather.mjs
// Uses the lockfile-pinned Miniflare bundled with Wrangler. No install, account,
// .dev.vars access or live network: outboundService intercepts every request.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

const require=createRequire(import.meta.url);
const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=wranglerRequire('miniflare');
const fixedNow=Date.parse('2026-10-27T12:00:00Z');
const fixtureKey='fixture-commercial-weather-key';
const requests=[];
const output=await build({stdin:{contents:`
import {createWeatherAdapter,WeatherConfigurationError,WeatherUnavailableError} from './lib/server/weather.ts';
const now=${fixedNow};
const london={name:'London',country:'United Kingdom',latitude:51.501,longitude:-.125,timezone:'Europe/London'};
export default {async fetch(request){
 const mode=new URL(request.url).pathname.slice(1);
 const commercial=mode!=='free'&&mode!=='free-production';
 const env={HEARTBEAT_APP_MODE:mode==='free'?'development':'production',HEARTBEAT_WEATHER_PROVIDER:commercial?'open-meteo-commercial':'open-meteo-free',...(commercial&&mode!=='missing-key'?{HEARTBEAT_WEATHER_API_KEY:${JSON.stringify(fixtureKey)}}:{})};
 const adapter=createWeatherAdapter(env,{now:()=>now,sleep:async()=>{}});
 try{
  if(mode==='redirect-forecast'){await adapter.collect({...london,latitude:1.111});return Response.json({unexpected:true});}
  if(mode==='redirect-search'){await adapter.search('redirect');return Response.json({unexpected:true});}
  if(mode.startsWith('reject-forecast-')){await adapter.collect({...london,latitude:Number('2.'+mode.split('-').at(-1))});return Response.json({unexpected:true});}
  if(mode.startsWith('reject-search-')){await adapter.search('reject'+mode.split('-').at(-1));return Response.json({unexpected:true});}
  const locations=await adapter.search('london');
  const context=await adapter.collect(london);
  return Response.json({locations,context});
 }catch(error){return Response.json({configuration:error instanceof WeatherConfigurationError,unavailable:error instanceof WeatherUnavailableError,category:error.category,status:error.status}, {status:503});}
}};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,logLevel:'silent'});

const allowed=new Set(['api.open-meteo.com','geocoding-api.open-meteo.com','customer-api.open-meteo.com','customer-geocoding-api.open-meteo.com']);
const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],script:output.outputFiles[0].text,outboundService:async request=>{
 const url=new URL(request.url);requests.push({host:url.hostname,path:url.pathname,params:Object.fromEntries(url.searchParams),redirect:request.redirect});
 // Returning a normal-looking forbidden response makes an accidental redirect
 // follow visible in the request log; no host is ever contacted externally.
 if(!allowed.has(url.hostname))return Response.json({error:'forbidden mock destination'},{status:502});
 const rejected=url.searchParams.get('latitude')?.match(/^2\.(400|401|403|404)$/)||url.searchParams.get('name')?.match(/^reject(400|401|403|404)$/);
 if(rejected)return Response.json({error:'fixture provider rejected configuration'},{status:Number(rejected[1])});
 if(url.searchParams.get('latitude')==='1.111'||url.searchParams.get('name')==='redirect')return new Response(null,{status:302,headers:{Location:`https://forbidden.example/collect-weather-key?apikey=${fixtureKey}`}});
 if(url.pathname==='/v1/search')return Response.json({results:[{name:'London',country:'United Kingdom',latitude:51.501,longitude:-.125,timezone:'Europe/London'}]});
 if(url.pathname==='/v1/forecast')return Response.json({current:{time:fixedNow/1000,temperature_2m:7,weather_code:61,is_day:1},daily:{sunrise:[fixedNow/1000-18000],sunset:[fixedNow/1000+14400]}});
 return Response.json({error:'unexpected mock path'},{status:404});
}});
try{
 const call=async path=>{const response=await mf.dispatchFetch(`http://worker.test/${path}`);return {status:response.status,body:await response.json()};};
 const free=await call('free');assert.equal(free.status,200,'The actual adapter must work with Workerd fetch and timeout signals');assert.equal(free.body.locations[0].name,'London');assert.equal(free.body.context.temperature,7);assert.equal(free.body.context.weatherCode,61);assert.equal(free.body.context.provenance.provider,'open-meteo-free');assert.equal(free.body.context.stale,false);
 const commercial=await call('commercial');assert.equal(commercial.status,200);assert.equal(commercial.body.locations[0].timezone,'Europe/London');assert.equal(commercial.body.context.provenance.provider,'open-meteo-commercial');
 const successful=requests.slice();assert.equal(successful.length,4,'Both adapter operations reach the mocked transport in the actual Worker runtime');
 for(const request of successful){const paid=request.host.startsWith('customer-');assert.equal(request.params.apikey,paid?fixtureKey:undefined,'Only the configured commercial endpoint receives its fixture key');}
 for(const path of ['redirect-forecast','redirect-search']){
  const before=requests.length;const result=await call(path);assert.equal(result.status,503);assert.equal(result.body.unavailable,true);assert.equal(result.body.configuration,false);assert.equal(result.body.category,'http');assert.equal(result.body.status,302);assert.equal(requests.length-before,2,'The bounded retry repeats only the same approved endpoint');
  assert.ok(requests.slice(before).every(request=>request.host.startsWith('customer-')&&request.params.apikey===fixtureKey));
 }
 assert.ok(requests.every(request=>allowed.has(request.host)),'Redirect destinations are never followed, so commercial keys cannot cross to another host');
 for(const kind of ['forecast','search'])for(const status of [400,401,403,404]){
  const before=requests.length,result=await call(`reject-${kind}-${status}`);assert.equal(result.status,503);assert.equal(result.body.configuration,true);assert.equal(result.body.unavailable,false);assert.equal(result.body.status,status);assert.equal(requests.length-before,1,'Permanent provider rejection is not retried or downgraded to transient weather');assert.ok(!JSON.stringify(result.body).includes(fixtureKey));
 }
 const beforeConfiguration=requests.length;
 for(const path of ['missing-key','free-production']){const result=await call(path);assert.equal(result.status,503);assert.equal(result.body.configuration,true);assert.equal(result.body.unavailable,false);}
 assert.equal(requests.length,beforeConfiguration,'Invalid commercial configuration fails before outbound requests');
 assert.ok(!JSON.stringify([free.body,commercial.body]).includes(fixtureKey),'Public successful weather results do not expose credentials');
 console.log('Passed actual Workerd weather adapter: free/commercial forecast and geocoding, timeout-signal compatibility, manual redirect rejection without cross-host key exposure, bounded retries and configuration failures. Outbound network fully mocked; no accounts or live providers.');
}finally{await mf.dispose();}
