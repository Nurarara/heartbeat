import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';
import {screenFraming,framingKey} from '../lib/screen-profile.ts';
import {resolveArtworkInput,updateSurfaceProfile} from '../lib/product/profiles.ts';
import {advanceArtworkJob} from '../lib/product/jobs.ts';
import {creativePacket} from '../lib/creative.ts';
import {withScreenFraming,finalImagePrompt,parseModelDirection} from '../lib/director-contract.ts';

assert.equal(screenFraming(0,900),null);assert.equal(screenFraming(900.1,900),null);assert.equal(screenFraming(900,8193),null);assert.equal(screenFraming(Infinity,900),null);
assert.deepEqual(screenFraming(390,844),screenFraming(430,932),'Phone viewports share a coarse presentation class');
assert.equal(framingKey(screenFraming(3440,1440)),'ultrawide:large');
assert.equal(framingKey(screenFraming(1366,768)),'landscape:standard');
const f=await fixture(),preferences={version:1,location:{name:'London',country:'United Kingdom',latitude:51.5,longitude:-.12,timezone:'Europe/London'},seed:42,unit:'c',reducedMotion:true};
try{
 const a=await f.register('screen-a@example.test'),b=await f.register('screen-b@example.test');
 await f.call('preferences',{preferences},{cookie:a.cookie});
 const profile=await (await f.call('preferences',undefined,{cookie:a.cookie})).json();
 const input={worldId:profile.worldId,surfaceId:profile.surfaceId,expectedVersion:profile.surface.version,width:3440,height:1440};
 assert.equal((await f.call('surface',input)).status,401);
 assert.equal((await f.call('surface',input,{cookie:b.cookie})).status,404,'Another account cannot choose this surface');
 assert.equal((await f.call('surface',input,{cookie:a.cookie,origin:'https://evil.test'})).status,403);
 for(const [width,height] of [[159,900],[8193,900],[1000.5,900],['1600',900],[1600,null]])assert.equal((await f.call('surface',{...input,width,height},{cookie:a.cookie})).status,400);
 assert.equal((await f.call('surface',{...input,expectedVersion:undefined},{cookie:a.cookie})).status,409);
 let response=await f.call('surface',input,{cookie:a.cookie});assert.equal(response.status,200);let result=await response.json();assert.equal(result.changed,true);assert.equal(result.surfaceVersion,2);assert.deepEqual(result.framing,screenFraming(3440,1440));
 const total=()=>f.sqlite.prepare('SELECT total_changes() n').get().n;
 const before=total();response=await f.call('surface',{...input,expectedVersion:2,width:3840,height:1600},{cookie:a.cookie});result=await response.json();assert.equal(result.changed,false);assert.equal(total(),before,'An unchanged coarse class does not write even a rate-limit row');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_jobs').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_usage_reservations').get().n,0,'Viewport changes do not reserve pictures or start inference');
 assert.equal((await f.call('surface',{...input,width:390,height:844},{cookie:a.cookie})).status,409,'Stale surface versions cannot overwrite another display');
 const canonical=await resolveArtworkInput(f.env,a.data.user.id,{},f.now());assert.deepEqual(canonical.framing,screenFraming(3440,1440));assert.equal(canonical.surfaceVersion,2);
 // Snapshot one normal accepted request, then resize before its context stage.
 f.env.ARTWORK_WORKFLOW={create:async()=>{},get:async()=>({status:async()=>({status:'running'})})};
 const requestId=crypto.randomUUID();assert.equal((await f.call('generation',{requestId,force:true,framing:{width:390,height:844}},{cookie:a.cookie})).status,202);
 const job=f.sqlite.prepare('SELECT id,input FROM hb_jobs WHERE request_id=?').get(requestId);assert.deepEqual(JSON.parse(job.input).framing,canonical.framing,'Generation ignores browser-supplied framing and snapshots the canonical surface');
 response=await f.call('surface',{...input,expectedVersion:2,width:390,height:844},{cookie:a.cookie});assert.equal(response.status,200);
 const dependencies={now:f.now,context:async()=>({temperature:8,weatherCode:3,observedAt:f.now(),fetchedAt:f.now(),isDay:true}),provider:()=>{throw new Error('Must not call inference in context test');}};
 await advanceArtworkJob(f.env,job.id,dependencies);await advanceArtworkJob(f.env,job.id,dependencies);
 const prepared=f.sqlite.prepare('SELECT context,status FROM hb_jobs WHERE id=?').get(job.id);assert.equal(prepared.status,'context_ready');const context=JSON.parse(prepared.context);assert.deepEqual(context.packet.context.framing,canonical.framing,'A resize cannot mutate an already accepted job');assert.equal(context.versions.surface,2);assert.equal(context.versions.prompt,2);
 const versionNow=f.sqlite.prepare('SELECT version FROM hb_surfaces WHERE id=?').get(profile.surfaceId).version;
 const races=await Promise.all([f.call('surface',{...input,expectedVersion:versionNow,width:1600,height:900},{cookie:a.cookie}),f.call('surface',{...input,expectedVersion:versionNow,width:1280,height:1280},{cookie:a.cookie})]);assert.deepEqual(races.map(value=>value.status).sort(),[200,409]);
 const saved=f.sqlite.prepare('SELECT width,height,version FROM hb_surfaces WHERE id=?').get(profile.surfaceId);
 const originalPrepare=f.env.DB.prepare;let reset=false;
 f.env.DB.prepare=sql=>{if(!reset&&sql.startsWith('UPDATE hb_surfaces SET width=')){reset=true;f.sqlite.prepare('UPDATE hb_users SET credential_epoch=credential_epoch+1 WHERE id=?').run(a.data.user.id);}return originalPrepare(sql);};
 try{await assert.rejects(()=>updateSurfaceProfile(f.env,a.data.user.id,{...input,expectedVersion:saved.version,width:3440,height:1440},f.now(),0),/account or screen changed/);}finally{f.env.DB.prepare=originalPrepare;}
 assert.equal(reset,true);assert.deepEqual(f.sqlite.prepare('SELECT width,height,version FROM hb_surfaces WHERE id=?').get(profile.surfaceId),saved,'A reset between authorization and mutation fences the surface write');
 assert.equal((await f.call('surface',{...input,expectedVersion:saved.version},{cookie:a.cookie})).status,401,'Revoked sessions cannot update geometry');
 assert.equal(f.objects.size,0,'Framing/context tests never create image objects');
}finally{f.close();}

for(const phase of ['day','night'])for(const dimensions of [[390,844],[3440,1440],[1280,1280],[1600,900]]){
 const packet=withScreenFraming(creativePacket({phase,season:'autumn',temperature:8,weekday:'Monday',festive:false},undefined,42,Date.now(),[]),screenFraming(...dimensions));
 const direction={action:'REIMAGINE',title:'A quiet composition',reason:'Room for the selected viewport.',prompt:'x'.repeat(packet.rules.maximumPromptCharacters),lighting:phase==='night'?'dark':'daylight',themeIds:[]};
 parseModelDirection(direction,packet,true);assert.ok(finalImagePrompt(direction,packet).length<=2048,'Framing constraints reserve their own prompt budget');
 if(packet.rules.maximumPromptCharacters<1800)assert.throws(()=>parseModelDirection({...direction,prompt:direction.prompt+'x'},packet,true),/framing budget/);
 const prompt=finalImagePrompt({...direction,prompt:'A distant figure in a quiet landscape.'},packet);assert.match(prompt,/main subject central/);assert.doesNotMatch(prompt,/4K|3840|native resolution/);
}
console.log('Passed viewport framing: bounded validation, authentication/origin/owner isolation, unchanged zero-write idempotence, CAS races, credential-reset fencing, canonical immutable job framing/provenance, no resize funding or inference, and crop-safe prompt budgets across day/night shapes. SQLite real; providers mocked.');
