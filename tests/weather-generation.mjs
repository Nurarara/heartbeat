import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';
import {runArtworkJob} from '../lib/product/jobs.ts';
import {WeatherUnavailableError,WeatherConfigurationError} from '../lib/server/weather.ts';
const f=await fixture();let calls=0,packet;
f.env.ARTWORK_WORKFLOW={create:async()=>({}),get:async()=>({status:async()=>({status:'running'})})};
try{
 const owner=await f.register();const preferences={version:1,location:{name:'London',country:'United Kingdom',latitude:51.5,longitude:-.12,timezone:'Europe/London'},seed:42,unit:'c',reducedMotion:true};
 assert.equal((await f.call('preferences',{preferences},{cookie:owner.cookie})).status,200);
 const provider=()=>({direct:async value=>{calls++;packet=value;return {action:'REIMAGINE',title:'A little room for the day',reason:'Local time and season guide this scene; weather is unavailable.',prompt:'A quiet distant landscape with generous framing.',lighting:value.context.phase==='night'?'dark':'daylight',themeIds:[]};},generate:async()=>({bytes:new Uint8Array([255,216,calls,255,217]),mime:'image/jpeg',width:1024,height:1024})});
 for(const error of [new WeatherUnavailableError('timeout'),new WeatherConfigurationError('Commercial configuration is missing.'),new Error('Unexpected context bug')]){
  const requestId=crypto.randomUUID();assert.equal((await f.call('generation',{requestId,force:true},{cookie:owner.cookie})).status,202);const job=f.sqlite.prepare('SELECT * FROM hb_jobs WHERE request_id=?').get(requestId),before=calls;
  await runArtworkJob(f.env,job.id,{now:f.now,context:async()=>{throw error;},provider});const result=f.sqlite.prepare('SELECT * FROM hb_jobs WHERE id=?').get(job.id);
  if(error instanceof WeatherUnavailableError){assert.equal(result.status,'ready');assert.equal(calls,before+1);const context=JSON.parse(result.context);assert.equal(context.snapshot,null);assert.equal(packet.context.temperature,null);assert.equal(packet.context.weather.condition,'unknown');assert.equal(packet.context.weather.code,null);assert.equal(JSON.parse(result.result).candidate.id,job.id);}
  else {assert.equal(result.status,'failed');assert.equal(calls,before,'Configuration and unexpected context failures never purchase inference.');}
  f.advance(3600000);
 }
 const usage=await (await f.call('auth/session',undefined,{cookie:owner.cookie})).json();assert.equal(usage.access.used,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_usage_reservations WHERE state='reserved'").get().n,0);
 console.log('Passed weather-outage fallback with honest unknown context, available time/season generation, fail-closed configuration/unexpected errors and correct picture settlement. SQLite real; provider mocked.');
}finally{f.close();}
