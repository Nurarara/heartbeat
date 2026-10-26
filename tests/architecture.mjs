import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';
import {advanceArtworkJob,runArtworkJob,repairArtworkJobs,dispatchArtworkOutbox} from '../lib/product/jobs.ts';
import {processAccountDeletions} from '../lib/product/lifecycle.ts';
import {profileFor,acknowledgeDisplay,updatePreferences} from '../lib/product/profiles.ts';
import {aiService} from '../lib/ai/service.ts';
const preferences={version:1,location:{name:'London',country:'United Kingdom',latitude:51.5,longitude:-.12,timezone:'Europe/London'},seed:42,unit:'c',reducedMotion:true};
const f=await fixture();let director=0,images=0;const instances=new Set();
f.env.ARTWORK_WORKFLOW={create:async({id})=>{instances.add(id);},get:async(id)=>{if(!instances.has(id))throw new Error('not_found');return {status:async()=>({status:'running'})};}};
const deps={now:f.now,context:async()=>({temperature:7,weatherCode:63,observedAt:f.now(),fetchedAt:f.now(),isDay:true}),provider:()=>({direct:async()=>{director++;return {action:'REIMAGINE',title:'Rain-softened water',reason:'Rain calls for subdued light.',prompt:'A quiet rain-softened lake.',lighting:'daylight',themeIds:[]};},generate:async()=>({bytes:new Uint8Array([255,216,++images,255,217]),mime:'image/jpeg',width:1024,height:1024})})};
try{
 const a=await f.register(),b=await f.register('bob@example.test');
 assert.equal((await f.call('preferences',{preferences},{cookie:a.cookie})).status,200);
 const initial=await (await f.call('preferences',undefined,{cookie:a.cookie})).json();assert.equal(initial.version,1);
 const competing=await Promise.all([f.call('preferences',{preferences:{...preferences,unit:'f'},expectedVersion:1},{cookie:a.cookie}),f.call('preferences',{preferences:{...preferences,style:'pencil'},expectedVersion:1},{cookie:a.cookie})]);assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
 assert.equal((await f.call('preferences',{preferences,memory:null,expectedVersion:2},{cookie:a.cookie})).status,409);
 await assert.rejects(()=>profileFor(f.env,b.data.user.id,{surfaceId:initial.surfaceId},f.now()),/not found/);
 const requestId=crypto.randomUUID();const responses=await Promise.all([1,2,3].map(()=>f.call('generation',{requestId,force:true,memory:'forged',location:{latitude:99}},{cookie:a.cookie})));assert.ok(responses.every(r=>r.status===202));
 assert.equal(instances.size,1);const job=f.sqlite.prepare('SELECT * FROM hb_jobs').get();assert.equal(JSON.parse(job.input).location.latitude,51.5);assert.equal(JSON.parse(job.input).memory,null);
 await Promise.all([runArtworkJob(f.env,job.id,deps),runArtworkJob(f.env,job.id,deps)]);
 let done=await (await f.call(`generation?requestId=${requestId}`,undefined,{cookie:a.cookie})).json();assert.equal(done.status,'ready');assert.equal(director,1);assert.equal(images,1);
 await runArtworkJob(f.env,job.id,deps);assert.equal(images,1);
 assert.equal((await (await f.call('auth/session',undefined,{cookie:a.cookie})).json()).access.used,1);
 assert.equal((await (await f.call('generation',undefined,{cookie:a.cookie})).json()).candidate.id,job.id,'Server discovery does not depend on local storage.');
 const ack=await acknowledgeDisplay(f.env,a.data.user.id,{id:job.id,eventId:'first-display'},f.now());assert.equal(ack.displayed,true);
 const again=await acknowledgeDisplay(f.env,a.data.user.id,{id:job.id,eventId:'first-display'},f.now());assert.equal(again.duplicate,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_display_events').get().n,1);
 assert.equal((await profileFor(f.env,a.data.user.id,{},f.now())).memory.history.length,1);
 const readAI=aiService(f.env),call=(path,body)=>readAI.handle(new Request(`${f.env.HEARTBEAT_APP_ORIGIN}/api/ai/${path}`,{method:body?'POST':'GET',headers:{Origin:f.env.HEARTBEAT_APP_ORIGIN,Cookie:a.cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 assert.equal((await call('prepare',{requestId:crypto.randomUUID(),location:preferences.location})).status,403);
 f.advance(3600000);
 const next=crypto.randomUUID();await f.call('generation',{requestId:next,force:true},{cookie:a.cookie});const second=f.sqlite.prepare('SELECT * FROM hb_jobs WHERE request_id=?').get(next);
 let interrupted=false;try{await runArtworkJob(f.env,second.id,{...deps,fault:boundary=>{if(boundary==='asset_put'&&!interrupted){interrupted=true;throw new Error('injected_crash');}}});}catch(e){assert.match(e.message,/injected_crash/);}
 assert.equal(images,2);await repairArtworkJobs(f.env,f.now());done=await (await f.call(`generation?requestId=${next}`,undefined,{cookie:a.cookie})).json();assert.equal(done.status,'ready');assert.equal(images,2,'An R2 success is recovered without another paid call.');
 assert.equal((await (await f.call('auth/session',undefined,{cookie:a.cookie})).json()).access.used,2);
 f.sqlite.prepare("UPDATE hb_artwork_outbox SET state='pending'").run();await dispatchArtworkOutbox(f.env,f.now());assert.equal(instances.size,2);
 const del=await f.call('account/delete',{password:'a long test password'},{cookie:a.cookie});assert.equal(del.status,200);assert.equal((await f.call('library',undefined,{cookie:a.cookie})).status,401);
 f.advance(300000);await processAccountDeletions(f.env,f.now());assert.equal(f.sqlite.prepare('SELECT id FROM hb_users WHERE id=?').get(a.data.user.id),undefined);assert.equal(f.objects.size,0);
 console.log('Passed canonical preferences/CAS, owner isolation, deduplicated durable dispatch, stage execution, server job discovery, append-only display memory, blocked direct preparation, R2 crash repair, unique picture settlement and recoverable account deletion.');
}finally{f.close();}
