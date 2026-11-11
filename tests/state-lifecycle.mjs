import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fixture} from './product-fixture.mjs';
import {planMoment} from '../lib/ambient-director.ts';
import {proposeCreativeMoment} from '../lib/creative.ts';
import {profileFor,acknowledgeDisplay,presentationPolicy} from '../lib/product/profiles.ts';
import {beginAccountDeletion,processAccountDeletions} from '../lib/product/lifecycle.ts';
import {retainAssets,operatorRoute} from '../lib/product/operations.ts';
import {aiService} from '../lib/ai/service.ts';
const preferences={version:1,location:{name:'London',country:'UK',latitude:51.5,longitude:-.12,timezone:'Europe/London'},seed:42,unit:'c',reducedMotion:true};
const f=await fixture();
try{
 const a=await f.register(),b=await f.register('bob@example.test');await f.call('preferences',{preferences},{cookie:a.cookie});
 const owner=a.data.user.id,p=await profileFor(f.env,owner,{},f.now()),id=crypto.randomUUID(),direction=planMoment(preferences.location,null,f.now(),null,42).direction;
 const proposal=proposeCreativeMoment({phase:direction.phase,season:direction.season,temperature:null,weekday:direction.brief.weekday,festive:false},undefined,42,f.now());proposal.source='ai-director';direction.id=`generated-${id}`;direction.artwork={attemptId:id,url:`/api/ai/art/${id}`,title:'A quiet scene',proposal};
 const candidate={id,requestId:crypto.randomUUID(),createdAt:f.now(),locationKey:direction.locationKey,direction};
 const key=`heartbeat-ai/${owner}/${id}.jpg`;f.objects.set(key,new Uint8Array([255,216,1,255,217]));
 f.sqlite.prepare("INSERT INTO ai_attempts(id,owner,request_id,claim,day,status,location_key,created_at,candidate,art_key) VALUES (?,?,?,'claim','2026-10-21','ready',?,?,?,?)").run(id,owner,candidate.requestId,direction.locationKey,f.now(),JSON.stringify(candidate),key);
 f.sqlite.prepare("INSERT INTO hb_assets(id,job_id,owner,world_id,surface_id,art_key,image_hash,mime,width,height,validation_version,state,created_at,updated_at) VALUES (?,?,?,?,?,?,'hash','image/jpeg',1024,1024,1,'ready',?,?)").run(id,'legacy-'+id,owner,p.worldId,p.surfaceId,key,f.now(),f.now());
 const concurrent=await Promise.allSettled([acknowledgeDisplay(f.env,owner,{id,eventId:'one'},f.now()),acknowledgeDisplay(f.env,owner,{id,eventId:'two'},f.now())]);
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_display_events').get().n,1,'A losing CAS must not insert its display event.');
 const retry=concurrent[0].status==='rejected'?'one':'two';await acknowledgeDisplay(f.env,owner,{id,eventId:retry},f.now());assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_display_events').get().n,2);assert.equal((await profileFor(f.env,owner,{},f.now())).memory.history.length,1);
 await assert.rejects(()=>acknowledgeDisplay(f.env,b.data.user.id,{id},f.now()),/city|not found/);
 await assert.rejects(()=>acknowledgeDisplay(f.env,owner,{id,presentationPolicyVersion:999},f.now()),/policy/);
 const atNight=Date.parse('2026-10-21T22:00:00Z');await assert.rejects(()=>acknowledgeDisplay(f.env,owner,{id,eventId:'unsafe-night'},atNight),/night/);
 const policy=presentationPolicy(preferences,p.surface,f.now());assert.ok(policy.safeDayUntil<=f.now()+900000);assert.equal(presentationPolicy(preferences,p.surface,atNight).night,true);
 const disabled=aiService({...f.env,HEARTBEAT_AI_ENABLED:'false'});const read=()=>disabled.handle(new Request(`${f.env.HEARTBEAT_APP_ORIGIN}/api/ai/art/${id}`,{headers:{Cookie:a.cookie}}));assert.equal((await read()).status,200,'Operator suspension of generation must preserve owned image delivery.');
 f.advance(8*86400000);await retainAssets(f.env,f.now());assert.equal(f.objects.has(key),true,'Current surface artwork remains protected during retention.');
 const lookup=f.sqlite.prepare('EXPLAIN QUERY PLAN SELECT id FROM hb_devices WHERE secret_hash=?').all('test');assert.ok(lookup.some(row=>row.detail.includes('hb_devices_secret_hash')));
 await assert.rejects(()=>operatorRoute(new Request(`${f.env.HEARTBEAT_APP_ORIGIN}/api/product/ops/status`),f.env,f.now()),/authorization/);
 // A revoked account is a durable deletion intent even when storage fails.
 const originalDelete=f.env.BUCKET.delete;let fail=true;f.env.BUCKET.delete=async k=>{if(fail){fail=false;throw new Error('storage_down');}return originalDelete(k);};
 await beginAccountDeletion(f.env,owner,f.now());assert.equal((await f.call('library',undefined,{cookie:a.cookie})).status,401);await processAccountDeletions(f.env,f.now());assert.equal(f.sqlite.prepare('SELECT lifecycle FROM hb_users WHERE id=?').get(owner).lifecycle,'deleting');
 f.advance(60000);await processAccountDeletions(f.env,f.now());assert.equal(f.sqlite.prepare('SELECT id FROM hb_users WHERE id=?').get(owner),undefined);assert.equal(f.objects.has(key),false);assert.equal((await read()).status,401);
 console.log('Passed concurrent display-event CAS, retry/ownership, presentation/night policy, read-only private delivery at AI suspension, protected retention, device query index and durable deletion retry.');
}finally{f.close();}
// Upgrade a representative old database instead of only testing a blank schema.
const old=new DatabaseSync(':memory:');const migrations=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();for(const file of migrations.filter(f=>Number(f.slice(0,4))<8))old.exec(readFileSync('drizzle/'+file,'utf8'));
old.prepare("INSERT INTO hb_users(id,email,password_hash,verified,created_at) VALUES ('old','old@example.test','legacy-hash',1,100)").run();old.prepare('INSERT INTO hb_profiles(user_id,preferences,memory,updated_at) VALUES (?,?,NULL,100)').run('old',JSON.stringify(preferences));old.prepare("INSERT INTO hb_jobs(id,owner,request_id,input,status,created_at,updated_at) VALUES ('interrupted','old','request','{}','running',100,100)").run();
for(const file of migrations.filter(f=>Number(f.slice(0,4))>=8))old.exec(readFileSync('drizzle/'+file,'utf8'));
assert.equal(old.prepare('SELECT COUNT(*) n FROM hb_worlds WHERE owner_id=?').get('old').n,1);assert.equal(old.prepare('SELECT COUNT(*) n FROM hb_surfaces WHERE owner_id=?').get('old').n,1);assert.equal(old.prepare('SELECT status FROM hb_jobs WHERE id=?').get('interrupted').status,'outcome_unknown');assert.equal(old.prepare('SELECT lifecycle FROM hb_users WHERE id=?').get('old').lifecycle,'active');old.close();
console.log('Passed additive migration from existing users, profile data and interrupted legacy jobs.');
