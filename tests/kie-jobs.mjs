import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';
import {runArtworkJob} from '../lib/product/jobs.ts';
import {configurationErrors} from '../lib/product/configuration.ts';

// The durable customer job uses Kie to paint when selected; the Cloudflare director still directs.
const preferences={version:1,location:{name:'London',country:'United Kingdom',latitude:51.5,longitude:-.12,timezone:'Europe/London'},seed:42,unit:'c',reducedMotion:true};
const f=await fixture();const instances=new Set();let kieCalls=0,kieConfig;
Object.assign(f.env,{HEARTBEAT_IMAGE_PROVIDER:'kie',KIE_API_KEY:'fake-kie-key',HEARTBEAT_KIE_MODEL:'z-image'});
f.env.ARTWORK_WORKFLOW={create:async({id})=>{instances.add(id);},get:async()=>({status:async()=>({status:'running'})})};
const deps={now:f.now,context:async()=>({temperature:9,weatherCode:61,observedAt:f.now(),fetchedAt:f.now(),isDay:true}),
 provider:()=>({direct:async()=>({action:'REIMAGINE',title:'Fox on the rooftops',reason:'Drizzle at dusk.',prompt:'A fox under an umbrella on rainy rooftops.',lighting:'daylight',themeIds:[]}),generate:async()=>{throw new Error('Cloudflare must not paint when Kie is selected');}}),
 kie:config=>{kieConfig=config;return {generate:async()=>{kieCalls++;return {bytes:new Uint8Array([255,216,9,255,217]),mime:'image/jpeg',width:1280,height:720};}};}};
try{
 const a=await f.register();
 assert.equal((await f.call('preferences',{preferences},{cookie:a.cookie})).status,200);
 const requestId=crypto.randomUUID();
 assert.equal((await f.call('generation',{requestId,force:true},{cookie:a.cookie})).status,202);
 const job=f.sqlite.prepare('SELECT * FROM hb_jobs').get();
 await runArtworkJob(f.env,job.id,deps);
 const done=await (await f.call(`generation?requestId=${requestId}`,undefined,{cookie:a.cookie})).json();
 assert.equal(done.status,'ready');assert.equal(kieCalls,1);
 assert.deepEqual(kieConfig,{apiKey:'fake-kie-key',model:'z-image'});
 assert.equal(f.sqlite.prepare("SELECT model FROM hb_provider_operations WHERE kind='image'").get().model,'kie:z-image','The operating ledger records which painter was used');
 await runArtworkJob(f.env,job.id,deps);assert.equal(kieCalls,1,'A finished job never asks Kie again');
 // Without a key, generation is refused before any provider work.
 const keyless=await fixture();Object.assign(keyless.env,{HEARTBEAT_IMAGE_PROVIDER:'kie',KIE_API_KEY:''});keyless.env.ARTWORK_WORKFLOW=f.env.ARTWORK_WORKFLOW;
 const b=await keyless.register();await keyless.call('preferences',{preferences},{cookie:b.cookie});
 assert.equal((await keyless.call('generation',{requestId:crypto.randomUUID(),force:true},{cookie:b.cookie})).status,503);
 keyless.sqlite.close();
 // Hosted configuration accepts Kie only with a key and a tested model.
 const hosted={HEARTBEAT_DEPLOYMENT_ENV:'staging',HEARTBEAT_APP_MODE:'production',HEARTBEAT_APP_ORIGIN:'https://heartbeat.example',HEARTBEAT_AI_ENABLED:'true',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'t',HEARTBEAT_DIRECTOR_MODEL:'@cf/meta/llama-3.3-70b-instruct-fp8-fast'};
 assert.ok(configurationErrors({...hosted,HEARTBEAT_IMAGE_MODEL:'@cf/black-forest-labs/flux-1-schnell'}).every(e=>e!=='unsupported_models'));
 assert.ok(configurationErrors({...hosted,HEARTBEAT_IMAGE_PROVIDER:'kie',KIE_API_KEY:'k',HEARTBEAT_KIE_MODEL:'seedream/5-5-text-to-image'}).every(e=>e!=='unsupported_models'));
 assert.ok(configurationErrors({...hosted,HEARTBEAT_IMAGE_PROVIDER:'kie'}).includes('unsupported_models'));
 assert.ok(configurationErrors({...hosted,HEARTBEAT_IMAGE_PROVIDER:'kie',KIE_API_KEY:'k',HEARTBEAT_KIE_MODEL:'nano-banana-pro'}).includes('unsupported_models'));
 console.log('Passed Kie painter in durable customer jobs and hosted configuration. SQLite real; Kie and Cloudflare mocked.');
}finally{f.sqlite.close();}
