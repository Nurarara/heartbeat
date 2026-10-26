import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';
import {planMoment} from '../lib/ambient-director.ts';
import {proposeCreativeMoment} from '../lib/creative.ts';
import {profileFor,acknowledgeDisplay} from '../lib/product/profiles.ts';
import {beginAccountDeletion,processAccountDeletions} from '../lib/product/lifecycle.ts';
import {retainAssets,runMaintenance} from '../lib/product/operations.ts';
import {aiService} from '../lib/ai/service.ts';
import {reserveUsage,reserveProviderOperation} from '../lib/product/usage.ts';
import {settleUnknownArtworkJob} from '../lib/product/jobs.ts';
const preferences={version:1,location:{name:'London',country:'UK',latitude:51.5,longitude:-.12,timezone:'Europe/London'},seed:42,unit:'c',reducedMotion:true};
async function setup(){const f=await fixture(),user=await f.register();assert.equal((await f.call('preferences',{preferences},{cookie:user.cookie})).status,200);return {...f,user,profile:await profileFor(f.env,user.data.user.id,{},f.now())};}
function seed(f,{owner=f.user.data.user.id,profile=f.profile,age=8*86400000,state='ready'}={}){
 const id=crypto.randomUUID(),requestId=crypto.randomUUID(),key=`heartbeat-ai/${owner}/${id}.jpg`,createdAt=f.now()-age;
 const direction=planMoment(preferences.location,null,f.now(),null,42).direction;
 const proposal=proposeCreativeMoment({phase:direction.phase,season:direction.season,temperature:null,weekday:direction.brief.weekday,festive:false},undefined,42,f.now());proposal.source='ai-director';direction.id=`generated-${id}`;direction.artwork={attemptId:id,url:`/api/ai/art/${id}`,title:'A quiet scene',proposal};
 const candidate={id,requestId,createdAt:f.now(),locationKey:direction.locationKey,direction};
 f.objects.set(key,new Uint8Array([255,216,1,255,217]));
 f.sqlite.prepare("INSERT INTO ai_attempts(id,owner,request_id,claim,day,status,location_key,created_at,candidate,art_key) VALUES (?,?,?,'claim','2026-10-21','ready',?,?,?,?)").run(id,owner,requestId,direction.locationKey,createdAt,JSON.stringify(candidate),key);
 f.sqlite.prepare("INSERT INTO hb_assets(id,job_id,owner,world_id,surface_id,art_key,image_hash,mime,width,height,validation_version,state,created_at,updated_at) VALUES (?,?,?,?,?,?,'test-hash','image/jpeg',1024,1024,1,?,?,?)").run(id,'legacy-'+id,owner,profile.worldId,profile.surfaceId,key,state,createdAt,createdAt);
 return {id,key,createdAt,candidate};
}
// Intercept a specific asynchronous SQL boundary while retaining the fixture's
// real SQLite statements and transactional batch implementation.
function intercept(f,match,method,callback){
 const original=f.env.DB.prepare;let fired=false;
 f.env.DB.prepare=sql=>{
  const wrap=statement=>({...statement,bind:(...args)=>wrap(statement.bind(...args)),[method]:async(...args)=>{
   if(method==='all'){const result=await statement[method](...args);if(!fired&&match(sql)){fired=true;await callback(sql);}return result;}
   if(!fired&&match(sql)){fired=true;await callback(sql);}return statement[method](...args);
  }});
  return match(sql)?wrap(original(sql)):original(sql);
 };
 return {fired:()=>fired,restore:()=>{f.env.DB.prepare=original;}};
}
for(const protection of ['current','favourite']){
 const f=await setup();try{
  const a=seed(f),hook=intercept(f,sql=>sql.startsWith('SELECT * FROM hb_assets a'),'all',()=>{
   if(protection==='current')f.sqlite.prepare('UPDATE hb_surfaces SET current_asset_id=? WHERE id=?').run(a.id,f.profile.surfaceId);
   else f.sqlite.prepare('INSERT INTO hb_likes(id,user_id,attempt_id) VALUES (?,?,?)').run(crypto.randomUUID(),f.user.data.user.id,a.id);
  });
  const result=await retainAssets(f.env,f.now());assert.equal(hook.fired(),true);assert.equal(result.deleted,0);assert.equal(f.objects.has(a.key),true);assert.equal(f.sqlite.prepare('SELECT state FROM hb_assets WHERE id=?').get(a.id).state,'ready',`The claim must recheck a newly protected ${protection} asset.`);
 }finally{f.close();}
}
// A deleting manifest is unavailable to both acknowledgment and collection
// mutation. Neither operation may resurrect protection after cleanup has won.
{
 const f=await setup();try{
  const a=seed(f,{age:0});f.sqlite.prepare("UPDATE hb_assets SET state='deleting' WHERE id=?").run(a.id);
  await assert.rejects(()=>acknowledgeDisplay(f.env,f.user.data.user.id,{id:a.id,eventId:'after-delete-claim'},f.now()),/changed|not found|being removed/);
  const response=await f.call('favourite',{id:a.id,favourite:true},{cookie:f.user.cookie});assert.ok([404,409].includes(response.status));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_likes').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_display_events').get().n,0);assert.equal(f.sqlite.prepare('SELECT current_asset_id FROM hb_surfaces WHERE id=?').get(f.profile.surfaceId).current_asset_id,null);
 }finally{f.close();}
}
// A deletion claim fences both private delivery paths while R2 still holds the
// object and prevents a companion from discovering it as a ready candidate.
{
 const f=await setup();try{
  const a=seed(f,{age:0}),browser=aiService(f.env,{now:f.now});
  const pairing=await (await f.call('device/start',{name:'Retention test companion'})).json();assert.equal((await f.call('device/approve',{code:pairing.code},{cookie:f.user.cookie})).status,200);
  const device={headers:{Authorization:`Bearer ${pairing.token}`}},read=()=>browser.handle(new Request(`${f.env.HEARTBEAT_APP_ORIGIN}/api/ai/art/${a.id}`,{headers:{Cookie:f.user.cookie}}));
  assert.equal((await read()).status,200);assert.equal((await f.call(`device/art/${a.id}`,undefined,device)).status,200);assert.equal((await (await f.call('device/status',undefined,device)).json()).picture.id,a.id);
  f.sqlite.prepare("UPDATE hb_assets SET state='deleting' WHERE id=?").run(a.id);
  assert.equal(f.objects.has(a.key),true,'The object deliberately still exists while private delivery is fenced.');
  assert.equal((await read()).status,404);assert.equal((await f.call(`device/art/${a.id}`,undefined,device)).status,404);assert.equal((await (await f.call('device/status',undefined,device)).json()).picture,null);
  const library=await (await f.call('library',undefined,{cookie:f.user.cookie})).json();assert.equal(library.pictures.some(picture=>picture.id===a.id),false,'The collection must hide a claimed manifest before storage deletion finishes.');
 }finally{f.close();}
}
// Cleanup can win after display validation and before the event's atomic CAS.
{
 const f=await setup();try{
  const a=seed(f,{age:0}),batch=f.env.DB.batch;let claimed=false;
  f.env.DB.batch=async statements=>{if(!claimed){claimed=true;f.sqlite.prepare("UPDATE hb_assets SET state='deleting' WHERE id=?").run(a.id);}return batch(statements);};
  await assert.rejects(()=>acknowledgeDisplay(f.env,f.user.data.user.id,{id:a.id,eventId:'claim-between-validation-and-ack'},f.now()),/changed/);
  assert.equal(claimed,true);assert.equal(f.sqlite.prepare('SELECT memory_version FROM hb_worlds WHERE id=?').get(f.profile.worldId).memory_version,1,'Only initial preferences may have changed the memory version.');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_display_events').get().n,0);
 }finally{f.close();}
}
// Favourite validation and insertion also need the same transactional guard.
{
 const f=await setup();try{
  const a=seed(f,{age:0}),hook=intercept(f,sql=>sql.startsWith('INSERT OR IGNORE INTO hb_likes'),'run',()=>f.sqlite.prepare("UPDATE hb_assets SET state='deleting' WHERE id=?").run(a.id));
  assert.equal((await f.call('favourite',{id:a.id,favourite:true},{cookie:f.user.cookie})).status,409);assert.equal(hook.fired(),true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_likes').get().n,0);
 }finally{f.close();}
}
// Retry deletion immediately, including an asset staged for a revoked account;
// the normal seven-day retention window must not delay a failed delete retry.
for(const revoked of [false,true]){
 const f=await setup();try{
  const owner=revoked?'deleted-test-owner':f.user.data.user.id,a=seed(f,{owner,age:0,state:'deleting'}),remove=f.env.BUCKET.delete;let failures=1;
  f.env.BUCKET.delete=async key=>{if(failures-- >0)throw new Error('temporary_storage_failure');return remove(key);};
  assert.equal((await retainAssets(f.env,f.now())).deleted,0);assert.equal(f.objects.has(a.key),true);assert.equal(f.sqlite.prepare('SELECT state FROM hb_assets WHERE id=?').get(a.id).state,'deleting');
  assert.equal((await retainAssets(f.env,f.now())).deleted,1);assert.equal(f.objects.has(a.key),false);assert.equal(f.sqlite.prepare('SELECT art_key FROM ai_attempts WHERE id=?').get(a.id).art_key,null);
 }finally{f.close();}
}
// Revocation can leave an unresolved provider ledger while storage cleanup is
// already claimed. That ledger must not prevent retrying the private deletion.
{
 const f=await setup();try{
  const a=seed(f,{age:0,state:'deleting'}),jobId='legacy-'+a.id;
  f.sqlite.prepare("INSERT INTO hb_jobs(id,owner,request_id,input,status,created_at,updated_at) VALUES (?,?,?,'{}','outcome_unknown',?,?)").run(jobId,f.user.data.user.id,crypto.randomUUID(),f.now(),f.now());
  assert.equal((await retainAssets(f.env,f.now())).deleted,1);assert.equal(f.objects.has(a.key),false);assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs WHERE id=?').get(jobId).status,'outcome_unknown','Storage cleanup must preserve the unresolved financial record.');
 }finally{f.close();}
}
// One persistently failing storage object must not monopolize a bounded batch.
{
 const f=await setup();try{
  const blocked=seed(f,{age:9*86400000,state:'deleting'}),next=seed(f,{age:8*86400000}),remove=f.env.BUCKET.delete;
  f.env.BUCKET.delete=async key=>{if(key===blocked.key)throw new Error('persistent_storage_failure');return remove(key);};
  assert.equal((await retainAssets(f.env,f.now(),1)).deleted,0);assert.equal((await retainAssets(f.env,f.now(),1)).deleted,1);assert.equal(f.objects.has(blocked.key),true);assert.equal(f.objects.has(next.key),false);
 }finally{f.close();}
}
// A completed deletion retains enough tombstone metadata to remove an R2 object
// which reappears after a slow original put finishes.
{
 const f=await setup();try{
  const a=seed(f,{age:0});await beginAccountDeletion(f.env,f.user.data.user.id,f.now());assert.equal((await processAccountDeletions(f.env,f.now())).completed,1);assert.equal(f.objects.has(a.key),false);
  f.objects.set(a.key,new Uint8Array([255,216,2,255,217]));f.advance(60001);await retainAssets(f.env,f.now());assert.equal(f.objects.has(a.key),false);assert.equal(f.sqlite.prepare('SELECT state FROM hb_deletions').get().state,'completed');assert.match(f.sqlite.prepare('SELECT owner FROM hb_assets WHERE id=?').get(a.id).owner,/^deleted-/);assert.equal((await f.call('library',undefined,{cookie:f.user.cookie})).status,401);
 }finally{f.close();}
}
// A blocked billing domain cannot prevent other maintenance domains progressing.
// An outcome already unknown before deletion remains settleable after private
// account data is removed. Deletion releases picture credit but retains the
// unresolved operating estimate until an audited conservative settlement.
{
 const f=await setup();try{
  const owner=f.user.data.user.id,id=crypto.randomUUID();f.env.HEARTBEAT_DIRECTOR_ESTIMATE_MICROS='100';f.env.HEARTBEAT_DAILY_BUDGET_MICROS='1000';
  f.sqlite.prepare("INSERT INTO hb_jobs(id,owner,request_id,input,status,created_at,updated_at) VALUES (?,?,?,'{}','outcome_unknown',?,?)").run(id,owner,crypto.randomUUID(),f.now(),f.now());
  await reserveUsage(f.env,id,{userId:owner,allowance:3,periodStart:f.now(),periodEnd:8640000000000000},f.now());await reserveProviderOperation(f.env,id,'director','mock-director',f.now());f.sqlite.prepare("UPDATE hb_provider_operations SET state='unknown',submitted_at=? WHERE job_id=?").run(f.now(),id);
  await beginAccountDeletion(f.env,owner,f.now());assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs WHERE id=?').get(id).status,'outcome_unknown');assert.equal((await processAccountDeletions(f.env,f.now())).completed,1);
  const tombstone=f.sqlite.prepare('SELECT owner,status FROM hb_jobs WHERE id=?').get(id);assert.match(tombstone.owner,/^deleted-/);assert.equal(tombstone.status,'outcome_unknown');assert.equal(f.sqlite.prepare('SELECT reserved FROM hb_usage_periods').get().reserved,0);assert.equal(f.sqlite.prepare('SELECT reserved_micros FROM hb_operating_days').get().reserved_micros,100);
  await settleUnknownArtworkJob(f.env,{jobId:id,actor:'test-operator',reason:'Deleted account provider outcome conservatively reviewed',now:f.now()});assert.equal(f.sqlite.prepare('SELECT reserved_micros FROM hb_operating_days').get().reserved_micros,0);assert.equal(f.sqlite.prepare('SELECT spent_micros FROM hb_operating_days').get().spent_micros,100);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_operator_audit').get().n,1);
 }finally{f.close();}
}
// A blocked billing domain cannot prevent other maintenance domains progressing.
// Rejecting that domain is reported after independent deletion/retention finish.
{
 const f=await setup();try{
  seed(f,{age:0});await beginAccountDeletion(f.env,f.user.data.user.id,f.now());
  const b=await f.register('retention@example.test');await f.call('preferences',{preferences},{cookie:b.cookie});const p=await profileFor(f.env,b.data.user.id,{},f.now()),old=seed(f,{owner:b.data.user.id,profile:p});
  let rejectBilling,entered=false;const blocked=new Promise((_,reject)=>{rejectBilling=reject;});
  const original=f.env.DB.prepare;f.env.DB.prepare=sql=>{
   const wrap=statement=>({...statement,bind:(...args)=>wrap(statement.bind(...args)),all:async()=>{entered=true;return blocked;}});
   return sql.startsWith('SELECT * FROM hb_billing_inbox')?wrap(original(sql)):original(sql);
  };
  const running=runMaintenance(f.env,f.now(),async()=>{throw new Error('No external network in this test');});
  for(let tick=0;tick<1000&&(f.objects.has(old.key)||f.sqlite.prepare('SELECT id FROM hb_users WHERE id=?').get(f.user.data.user.id));tick++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(entered,true);assert.equal(f.objects.has(old.key),false);assert.equal(f.sqlite.prepare('SELECT id FROM hb_users WHERE id=?').get(f.user.data.user.id),undefined);
  rejectBilling(new Error('injected_billing_storage_outage'));const result=await running;assert.equal(result.billingInbox.error,'maintenance_domain_failed');assert.equal(result.deletions.completed,1);assert.equal(result.retention.deleted,1);
 }finally{f.close();}
}
// A timestamp alone cannot paginate a collection containing several pictures
// prepared at the same instant. The ID tiebreaker must preserve every owned row.
{
 const f=await setup();try{
  const expected=Array.from({length:53},()=>seed(f,{age:0}).id).sort().reverse();
  const b=await f.register('foreign@example.test');await f.call('preferences',{preferences},{cookie:b.cookie});seed(f,{owner:b.data.user.id,profile:await profileFor(f.env,b.data.user.id,{},f.now()),age:0});
  let cursor=null;const received=[];for(let page=0;page<20;page++){
   const response=await f.call(`library?limit=7${cursor?'&cursor='+encodeURIComponent(cursor):''}`,undefined,{cookie:f.user.cookie});assert.equal(response.status,200);const value=await response.json();received.push(...value.pictures.map(p=>p.id));cursor=value.nextCursor;if(!cursor)break;
  }
  assert.deepEqual(received,expected);assert.equal(new Set(received).size,53);
 }finally{f.close();}
}
console.log('Passed real-SQLite retention claim races, display/favourite and private browser/device delivery guards, immediate/fair deletion retry, revoked manifests and late-object resweep, independent maintenance failure handling, and tied-timestamp owner-scoped collection pagination. Storage and billing mocked; no external calls.');
