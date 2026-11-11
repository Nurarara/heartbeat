import assert from 'node:assert/strict';
import {createWeatherAdapter} from '../lib/server/weather.ts';
import {configurationErrors} from '../lib/product/configuration.ts';

const now=Date.parse('2026-11-05T12:00:00Z');
const fixture={latitude:51.5,longitude:-0.12,resolvedAddress:'London, England, United Kingdom',timezone:'Europe/London',currentConditions:{datetimeEpoch:now/1000,temp:7,icon:'rain',sunriseEpoch:now/1000-3600,sunsetEpoch:now/1000+3600}};
const requests=[];
const env={HEARTBEAT_APP_MODE:'production',HEARTBEAT_DEPLOYMENT_ENV:'staging',HEARTBEAT_APP_ORIGIN:'https://example.test',HEARTBEAT_WEATHER_PROVIDER:'visual-crossing-free',DB:{},BUCKET:{},ARTWORK_WORKFLOW:{}};
const weather=createWeatherAdapter(env,{now:()=>now,fetcher:async(url,options)=>{requests.push({url:new URL(url),options});return Response.json(fixture);}});
assert.deepEqual(configurationErrors(env),[]);
const places=await weather.search('London');
assert.deepEqual(places,[{latitude:51.5,longitude:-0.12,timezone:'Europe/London',name:'London',country:'United Kingdom',admin1:'England'}]);
const context=await weather.collect(places[0]);
assert.equal(context.temperature,7);assert.equal(context.weatherCode,61);assert.equal(context.isDay,true);assert.equal(context.stale,false);
assert.equal(context.provenance.provider,'visual-crossing-free');assert.match(context.provenance.attribution,/Visual Crossing/);
assert.equal(requests.length,2);
for(const {url,options} of requests){assert.equal(url.hostname,'weather.visualcrossing.com');assert.equal(url.searchParams.has('key'),false);assert.equal(options.redirect,'manual');}
await weather.collect(places[0]);assert.equal(requests.length,2,'Repeated observations use the bounded cache');
const unknown=createWeatherAdapter(env,{now:()=>now,fetcher:async()=>Response.json({...fixture,latitude:52,currentConditions:{...fixture.currentConditions,icon:'new-unknown-icon'}})});
assert.equal((await unknown.collect({...places[0],latitude:52})).weatherCode,null);
const bad=createWeatherAdapter({...env,HEARTBEAT_WEATHER_FORECAST_URL:'https://attacker.example/private'},{now:()=>now});
await assert.rejects(()=>bad.collect(places[0]),/approved HTTPS origin/);
console.log('Visual Crossing translation, hosted policy, bounded cache, unknown icons and provider endpoint boundaries passed.');
