// Real SQLite transactions and deterministic interruption points. No paid calls.
import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';
import {acceptArtworkRequest,advanceArtworkJob,runArtworkJob,repairArtworkJobs,dispatchArtworkOutbox,settleUnknownArtworkJob} from '../lib/product/jobs.ts';
import {reserveUsage,settleUsage,usageForAccount,reserveOperatingAttempt} from '../lib/product/usage.ts';
import {ProviderFailure} from '../lib/ai/cloudflare.ts';
import {processAccountDeletions} from '../lib/product/lifecycle.ts';
const preferences={version:1,location:{name:'London',country:'United Kingdom',latitude:51.5,longitude:-.12,timezone:'Europe/London'},seed:42,unit:'c',reducedMotion:true};
async function setup(extra={}){
 const f=await fixture({env:{HEARTBEAT_DIRECTOR_ESTIMATE_MICROS:'100',HEARTBEAT_IMAGE_ESTIMATE_MICROS:'900',HEARTBEAT_DAILY_BUDGET_MICROS:'10000',...extra}});
 const instances=new Map();let starts=0,restarts=0;
 f.env.ARTWORK_WORKFLOW={create:async({id})=>{starts++;instances.set(id,'running');},get:async id=>{if(!instances.has(id))throw new Error('not_found');return {status:async()=>({status:instances.get(id)}),restart:async()=>{restarts++;instances.set(id,'running');}};}};
 const user=await f.register();assert.equal((await f.call('preferences',{preferences},{cookie:user.cookie})).status,200);
 let director=0,images=0;
 const deps={now:f.now,context:async()=>({temperature:7,weatherCode:63,observedAt:f.now(),fetchedAt:f.now(),isDay:true}),provider:()=>({direct:async()=>{director++;return {action:'REIMAGINE',title:'Rain-softened water',reason:'Rain calls for subdued light.',prompt:'A quiet rain-softened lake.',lighting:'daylight',themeIds:[]};},generate:async()=>({bytes:new Uint8Array([255,216,++images,255,217]),mime:'image/jpeg',width:1024,height:1024})})};
 async function accept(){const requestId=crypto.randomUUID(),r=await f.call('generation',{requestId,force:true},{cookie:user.cookie});assert.equal(r.status,202,await r.text());return f.sqlite.prepare('SELECT * FROM hb_jobs WHERE request_id=?').get(requestId);}
 return {...f,user,deps,accept,instances,calls:()=>({director,images,starts,restarts})};
}
function assertCounters(f){
 for(const p of f.sqlite.prepare('SELECT * FROM hb_usage_periods').all()){
  const sums=f.sqlite.prepare('SELECT COALESCE(SUM(reserved_delta),0) reserved,COALESCE(SUM(committed_delta),0) committed FROM hb_usage_ledger WHERE owner=? AND period_key=?').get(p.owner,p.period_key);
  assert.equal(p.reserved,sums.reserved);assert.equal(p.committed,sums.committed);assert.ok(p.reserved>=0&&p.committed>=0);
 }
 for(const p of f.sqlite.prepare('SELECT * FROM hb_operating_days').all()){
  const sums=f.sqlite.prepare('SELECT COALESCE(SUM(l.reserved_delta),0) reserved,COALESCE(SUM(l.spent_delta),0) spent FROM hb_cost_ledger l JOIN hb_provider_operations o ON o.id=l.operation_id WHERE o.day=?').get(p.day);
  assert.equal(p.reserved_micros,sums.reserved);assert.equal(p.spent_micros,sums.spent);
 }
}
// A configuration label must not grant email-verification bypass on a hosted
// address. Both admission and a previously accepted stage enforce this rule.
for(const origin of ['https://heartbeat.example','http://heartbeat.example','https://localhost:5173']){
 const f=await setup();try{
  const job=await f.accept();f.env.HEARTBEAT_APP_ORIGIN=origin;const user=f.sqlite.prepare('SELECT * FROM hb_users WHERE id=?').get(f.user.data.user.id);
  await assert.rejects(()=>acceptArtworkRequest(f.env,user,{requestId:crypto.randomUUID(),force:true},f.now()),/Verify your email/);
  await runArtworkJob(f.env,job.id,f.deps);assert.equal(f.calls().director,0);assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs WHERE id=?').get(job.id).status,'failed');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_usage_reservations').get().n,0);
 }finally{f.close();}
}
for(const boundary of ['context_read','before_director_submit','before_director','after_director','before_image_submit','before_image','after_image','asset_manifest','asset_put','ready_write','usage_commit']){
 const f=await setup();try{
  const job=await f.accept();let crashed=false;
  await assert.rejects(()=>runArtworkJob(f.env,job.id,{...f.deps,fault:name=>{if(name===boundary&&!crashed){crashed=true;throw new Error(`crash_${boundary}`);}}}),new RegExp(`crash_${boundary}`));
  const before=f.calls();await repairArtworkJobs(f.env,f.now());await runArtworkJob(f.env,job.id,f.deps);await runArtworkJob(f.env,job.id,f.deps);
  const saved=f.sqlite.prepare('SELECT * FROM hb_jobs WHERE id=?').get(job.id);
  if(['before_director','after_director','before_image','after_image','asset_manifest'].includes(boundary)){
   assert.equal(saved.status,'outcome_unknown',boundary);assert.equal(f.calls().director,before.director);assert.equal(f.calls().images,before.images);
   assert.equal(f.sqlite.prepare('SELECT reserved FROM hb_usage_periods WHERE owner=?').get(f.user.data.user.id).reserved,1,'Unknown outcomes keep the picture reservation.');
   assert.ok(f.sqlite.prepare('SELECT SUM(reserved_micros) n FROM hb_operating_days').get().n>0,'Unknown provider cost remains reserved.');
  }else{
   assert.equal(saved.status,'ready',boundary);assert.equal(f.calls().director,1);assert.equal(f.calls().images,1);
   assert.equal(f.sqlite.prepare('SELECT committed FROM hb_usage_periods WHERE owner=?').get(f.user.data.user.id).committed,1);
   assert.equal(f.sqlite.prepare('SELECT SUM(reserved_micros) n FROM hb_operating_days').get().n,0,'Recovered assets settle their operation cost.');
   assert.equal(f.sqlite.prepare('SELECT SUM(spent_micros) n FROM hb_operating_days').get().n,1000);
  }
  assertCounters(f);
 }finally{f.close();}
}
// Having a fault callback installed must not turn an ordinary network failure into
// a synthetic crash that escapes Workflow reconciliation.
{
 const f=await setup();try{
  const job=await f.accept();let calls=0;
  const deps={...f.deps,fault:()=>{},provider:()=>({direct:async()=>{calls++;throw new Error('network_timeout');},generate:async()=>{throw new Error('must_not_generate');}})};
  await runArtworkJob(f.env,job.id,deps);await runArtworkJob(f.env,job.id,deps);
  assert.equal(calls,1);assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs').get().status,'outcome_unknown');
  await settleUnknownArtworkJob(f.env,{jobId:job.id,actor:'test-operator',reason:'Conservative settlement after provider review',now:f.now()});
  await assert.rejects(()=>settleUnknownArtworkJob(f.env,{jobId:job.id,actor:'test-operator',reason:'Duplicate settlement is denied',now:f.now()}),/Only unknown/);
  assert.equal(f.sqlite.prepare('SELECT committed+reserved n FROM hb_usage_periods').get().n,0);assert.equal(f.sqlite.prepare('SELECT spent_micros FROM hb_operating_days').get().spent_micros,100);assertCounters(f);
 }finally{f.close();}
}
// The operator and a stored-asset recovery choose one irreversible outcome. A
// stale recovery cannot make a picture ready after its credit was released.
{
 const f=await setup();try{
  const job=await f.accept();await assert.rejects(()=>runArtworkJob(f.env,job.id,{...f.deps,fault:name=>{if(name==='asset_put')throw new Error('pause_stored_asset');}}),/pause_stored_asset/);
  f.sqlite.prepare("UPDATE hb_jobs SET status='outcome_unknown' WHERE id=?").run(job.id);
  const get=f.env.BUCKET.get;let release,entered=false;const gate=new Promise(resolve=>{release=resolve;});f.env.BUCKET.get=async key=>{entered=true;await gate;return get(key);};
  const recovery=advanceArtworkJob(f.env,job.id,f.deps);for(let tick=0;tick<1000&&!entered;tick++)await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,true);
  await settleUnknownArtworkJob(f.env,{jobId:job.id,actor:'test-operator',reason:'Conservative decision before stored-asset recovery',now:f.now()});release();await recovery;
  assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs WHERE id=?').get(job.id).status,'failed');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_assets WHERE state='ready'").get().n,0);assert.equal(f.sqlite.prepare('SELECT reserved+committed n FROM hb_usage_periods').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_operator_audit').get().n,1);assertCounters(f);
 }finally{f.close();}
}
// A terminal settlement decision and its audit survive a crash before either
// ledger is reconciled, and bounded maintenance completes that exact decision.
{
 const f=await setup();try{
  const job=await f.accept();await runArtworkJob(f.env,job.id,{...f.deps,provider:()=>({direct:async()=>{throw new Error('ambiguous_timeout');},generate:async()=>{throw new Error('must_not_generate');}})});
  const batch=f.env.DB.batch;let interrupted=false;f.env.DB.batch=async statements=>{const result=await batch(statements);if(!interrupted){interrupted=true;throw new Error('crash_after_operator_decision');}return result;};
  await assert.rejects(()=>settleUnknownArtworkJob(f.env,{jobId:job.id,actor:'test-operator',reason:'Audited conservative settlement survives interruption',now:f.now()}),/crash_after_operator_decision/);f.env.DB.batch=batch;
  assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs WHERE id=?').get(job.id).status,'failed');assert.equal(f.sqlite.prepare('SELECT reserved FROM hb_usage_periods').get().reserved,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_operator_audit').get().n,1);
  await repairArtworkJobs(f.env,f.now());await repairArtworkJobs(f.env,f.now());assert.equal(f.sqlite.prepare('SELECT reserved+committed n FROM hb_usage_periods').get().n,0);assert.equal(f.sqlite.prepare('SELECT reserved_micros FROM hb_operating_days').get().reserved_micros,0);assert.equal(f.sqlite.prepare('SELECT spent_micros FROM hb_operating_days').get().spent_micros,100);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_operator_audit').get().n,1);assertCounters(f);
 }finally{f.close();}
}
// Two operators racing the same unresolved request create one decision/audit.
{
 const f=await setup();try{
  const job=await f.accept();await runArtworkJob(f.env,job.id,{...f.deps,provider:()=>({direct:async()=>{throw new Error('ambiguous_timeout');},generate:async()=>{throw new Error('must_not_generate');}})});
  f.sqlite.prepare('UPDATE hb_jobs SET lease=?,lease_until=? WHERE id=?').run('active-recovery',f.now()+1000,job.id);
  await assert.rejects(()=>settleUnknownArtworkJob(f.env,{jobId:job.id,actor:'test-operator',reason:'An active recovery must retain its decision lease',now:f.now()}),/being recovered/);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_operator_audit').get().n,0);assert.equal(f.sqlite.prepare('SELECT reserved FROM hb_usage_periods').get().reserved,1);
  f.sqlite.prepare('UPDATE hb_jobs SET lease=NULL,lease_until=0 WHERE id=?').run(job.id);
  const decisions=await Promise.allSettled(['one','two'].map(actor=>settleUnknownArtworkJob(f.env,{jobId:job.id,actor,reason:'Concurrent conservative provider review decision',now:f.now()})));
  assert.equal(decisions.filter(d=>d.status==='fulfilled').length,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_operator_audit').get().n,1);assert.equal(f.sqlite.prepare('SELECT spent_micros FROM hb_operating_days').get().spent_micros,100);assertCounters(f);
 }finally{f.close();}
}
// A corrupted staging object must never become ready, even though R2 returned it.
{
 const f=await setup();try{
  const job=await f.accept();await assert.rejects(()=>runArtworkJob(f.env,job.id,{...f.deps,fault:name=>{if(name==='asset_put')throw new Error('interrupt');}}),/interrupt/);
  for(const key of f.objects.keys())f.objects.set(key,new Uint8Array([255,216,99,255,217]));
  await repairArtworkJobs(f.env,f.now());assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs').get().status,'outcome_unknown');assert.equal(f.calls().images,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_assets WHERE state='ready'").get().n,0);assertCounters(f);
 }finally{f.close();}
}
// An exact duplicate is a known rejected output, rather than an ambiguous
// provider outcome requiring manual support to restore the picture credit.
{
 const f=await setup();try{
  const first=await f.accept();await runArtworkJob(f.env,first.id,f.deps);f.advance(3600001);
  const duplicate=await f.accept();await runArtworkJob(f.env,duplicate.id,{...f.deps,provider:()=>({...f.deps.provider(),generate:async()=>({bytes:new Uint8Array([255,216,1,255,217]),mime:'image/jpeg',width:1024,height:1024})})});
  assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs WHERE id=?').get(duplicate.id).status,'failed');assert.equal(f.sqlite.prepare('SELECT reserved FROM hb_usage_periods').get().reserved,0);assert.equal(f.sqlite.prepare('SELECT committed FROM hb_usage_periods').get().committed,1);assert.equal(f.sqlite.prepare('SELECT spent_micros FROM hb_operating_days').get().spent_micros,2000);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_assets WHERE state='ready'").get().n,1);assertCounters(f);
 }finally{f.close();}
}
// Only one last picture credit can be reserved, despite concurrent distinct jobs.
{
 const f=await setup();try{
  const owner=f.user.data.user.id,start=f.user.data.user.created_at||f.now(),end=8640000000000000;
  const access={userId:owner,expires:f.now()+10000,eligible:true,reason:'ready',plan:'trial',allowance:1,periodStart:start,periodEnd:end,used:0,cadence:0};
  const jobs=Array.from({length:12},()=>crypto.randomUUID());for(const id of jobs)f.sqlite.prepare("INSERT INTO hb_jobs(id,owner,request_id,input,status,created_at,updated_at) VALUES (?,?,?,'{}','accepted',?,?)").run(id,owner,crypto.randomUUID(),f.now(),f.now());
  const attempts=await Promise.allSettled(jobs.map(id=>reserveUsage(f.env,id,access,f.now())));assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
  const held=f.sqlite.prepare('SELECT job_id FROM hb_usage_reservations').get().job_id;
  await Promise.all(Array.from({length:8},()=>settleUsage(f.env,held,'commit',f.now())));await settleUsage(f.env,held,'release',f.now());
  assert.equal((await usageForAccount(f.env,owner,start,end)).used,1);assertCounters(f);
 }finally{f.close();}
}
// Distinct accounts contend for bounded live provider slots. Losing requests stay
// queued and cannot start inference by holding an old reserved operation.
{
 const f=await setup({HEARTBEAT_PROVIDER_CONCURRENCY:'2'});try{
  const users=[f.user];for(let i=0;i<3;i++){const u=await f.register(`burst${i}@example.test`);await f.call('preferences',{preferences},{cookie:u.cookie});users.push(u);}
  const jobs=[];for(const u of users){const id=crypto.randomUUID();assert.equal((await f.call('generation',{requestId:id,force:true},{cookie:u.cookie})).status,202);jobs.push(f.sqlite.prepare('SELECT * FROM hb_jobs WHERE request_id=?').get(id));}
  for(const job of jobs){await advanceArtworkJob(f.env,job.id,f.deps);await advanceArtworkJob(f.env,job.id,f.deps);}
  let live=0,maximum=0,entered=0;let release;const barrier=new Promise(resolve=>{release=resolve;});
  const deps={...f.deps,provider:()=>({direct:async()=>{entered++;maximum=Math.max(maximum,++live);await barrier;live--;return {action:'REIMAGINE',title:'Quiet lake',reason:'Soft rain.',prompt:'A calm lake.',lighting:'daylight',themeIds:[]};},generate:async()=>{throw new Error('not_this_stage');}})};
  const running=jobs.map(job=>advanceArtworkJob(f.env,job.id,deps));for(let tick=0;tick<200&&entered<2;tick++)await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,2);assert.equal(maximum,2);release();await Promise.all(running);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_jobs WHERE status='context_ready'").get().n,2);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_provider_slots WHERE operation_id IS NOT NULL').get().n,0);
  // Admission is a durable independent cap, including prior director work.
  f.env.HEARTBEAT_AI_DAILY_LIMIT='2';const others=jobs.filter(job=>f.sqlite.prepare('SELECT status FROM hb_jobs WHERE id=?').get(job.id).status==='context_ready');
  await assert.rejects(()=>reserveOperatingAttempt(f.env,crypto.randomUUID(),f.now()),/Daily operating capacity/);assert.equal(f.sqlite.prepare('SELECT attempts FROM hb_operating_days').get().attempts,4,'All four accepted director admissions remain counted even while two wait for capacity.');
  assert.equal(others.length,2);assertCounters(f);
 }finally{f.close();}
}
// Credential revocation immediately before submission fences external calls.
{
 const f=await setup();try{
  const job=await f.accept();let revoked=false;
  await runArtworkJob(f.env,job.id,{...f.deps,fault:name=>{if(name==='before_director_submit'&&!revoked){revoked=true;f.sqlite.prepare('UPDATE hb_users SET credential_epoch=credential_epoch+1 WHERE id=?').run(f.user.data.user.id);}}});
  await runArtworkJob(f.env,job.id,f.deps);assert.equal(f.calls().director,0);assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs').get().status,'canceled');assert.equal(f.sqlite.prepare('SELECT SUM(reserved_micros) n FROM hb_operating_days').get().n,0);assertCounters(f);
 }finally{f.close();}
}
// Revocation during an in-flight call keeps an operator-settleable unknown
// outcome instead of trapping a monetary reservation on a canceled job forever.
{
 const f=await setup();try{
  const job=await f.accept();let release,entered=false;const gate=new Promise(resolve=>{release=resolve;});
  const running=runArtworkJob(f.env,job.id,{...f.deps,provider:()=>({...f.deps.provider(),direct:async()=>{entered=true;await gate;return {action:'REIMAGINE',title:'Quiet lake',reason:'Soft rain.',prompt:'A calm lake.',lighting:'daylight',themeIds:[]};}})});
  for(let tick=0;tick<1000&&!entered;tick++)await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,true);f.sqlite.prepare('UPDATE hb_users SET credential_epoch=credential_epoch+1 WHERE id=?').run(f.user.data.user.id);release();await running;await runArtworkJob(f.env,job.id,f.deps);
  assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs WHERE id=?').get(job.id).status,'outcome_unknown');assert.equal(f.sqlite.prepare('SELECT reserved FROM hb_usage_periods').get().reserved,1);
  await settleUnknownArtworkJob(f.env,{jobId:job.id,actor:'test-operator',reason:'Credential revocation reviewed with conservative cost',now:f.now()});assert.equal(f.sqlite.prepare('SELECT reserved_micros FROM hb_operating_days').get().reserved_micros,0);assert.equal(f.sqlite.prepare('SELECT spent_micros FROM hb_operating_days').get().spent_micros,100);assertCounters(f);
 }finally{f.close();}
}
// A reserved image operation never carries an expired provider slot into a
// later stage; capacity is checked again immediately before the actual call.
{
 const f=await setup({HEARTBEAT_PROVIDER_CONCURRENCY:'1'});try{
  const job=await f.accept();await assert.rejects(()=>runArtworkJob(f.env,job.id,{...f.deps,fault:name=>{if(name==='before_image_submit')throw new Error('pause_image');}}),/pause_image/);
  f.sqlite.prepare('UPDATE hb_provider_slots SET operation_id=?,job_id=?,lease_until=? WHERE slot=0').run('other:director','other',f.now()+240000);
  await runArtworkJob(f.env,job.id,f.deps);assert.equal(f.calls().images,0);assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs').get().status,'provider_submitted');
  f.advance(240001);await runArtworkJob(f.env,job.id,f.deps);assert.equal(f.calls().images,1);assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs').get().status,'ready');assertCounters(f);
 }finally{f.close();}
}
// A disabled/tiny spend ceiling queues safely and eventually releases the
// customer reservation; a provider call never starts to discover the budget.
{
 const f=await setup({HEARTBEAT_DAILY_BUDGET_MICROS:'99'});try{
  const job=await f.accept();await runArtworkJob(f.env,job.id,f.deps);assert.equal(f.calls().director,0);assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs').get().status,'context_ready');
  f.advance(1800001);await runArtworkJob(f.env,job.id,f.deps);assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs').get().status,'failed');assert.equal(f.sqlite.prepare('SELECT reserved+committed n FROM hb_usage_periods').get().n,0);assertCounters(f);
 }finally{f.close();}
}
// Even a storage operation finishing after the account's final deletion sweep
// cannot recreate an orphan silently under an already-deleted manifest.
{
 const f=await setup();try{
  const job=await f.accept(),put=f.env.BUCKET.put;let entered=false,release;const gate=new Promise(resolve=>{release=resolve;});f.env.BUCKET.put=async(...args)=>{entered=true;await gate;return put(...args);};
  const running=runArtworkJob(f.env,job.id,f.deps);for(let tick=0;tick<200&&!entered;tick++)await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,true);
  assert.equal((await f.call('account/delete',{password:'a long test password'},{cookie:f.user.cookie})).status,200);f.advance(300000);await processAccountDeletions(f.env,f.now());release();await running;
  assert.equal(f.objects.size,0);assert.equal(f.sqlite.prepare('SELECT id FROM hb_users WHERE id=?').get(f.user.data.user.id),undefined);
 }finally{f.close();}
}
// A queued Workflow which terminated before its next stage is restarted by ID.
{
 const f=await setup();try{
  const job=await f.accept();f.instances.set(job.id,'errored');f.advance(61000);await repairArtworkJobs(f.env,f.now());await dispatchArtworkOutbox(f.env,f.now());assert.equal(f.calls().starts,1);assert.equal(f.calls().restarts,1);
 }finally{f.close();}
}
// A successfully prepared asset remains owned, but an outdated preference
// version must not be presented automatically by a polling old browser.
{
 const f=await setup();try{
  const job=await f.accept();await runArtworkJob(f.env,job.id,f.deps);f.sqlite.prepare('UPDATE hb_worlds SET preferences_version=preferences_version+1 WHERE owner_id=?').run(f.user.data.user.id);
  const result=await (await f.call(`generation?requestId=${job.request_id}`,undefined,{cookie:f.user.cookie})).json();assert.equal(result.status,'held');assert.equal(result.jobState,'stale');assert.equal(f.sqlite.prepare('SELECT committed FROM hb_usage_periods').get().committed,1);
 }finally{f.close();}
}
// Migration keeps interrupted legacy work reserved, while a matching completed
// legacy attempt is counted exactly once as a prepared picture.
{
 const f=await setup();try{
  const owner=f.user.data.user.id;f.sqlite.prepare('DELETE FROM hb_usage_periods').run();
  for(const completed of [false,true]){
   const id=crypto.randomUUID(),requestId=crypto.randomUUID();f.sqlite.prepare("INSERT INTO hb_jobs(id,owner,request_id,input,status,error_category,created_at,updated_at) VALUES (?,?,?,'{}','outcome_unknown','legacy_interrupted',?,?)").run(id,owner,requestId,f.now(),f.now());
   f.sqlite.prepare('INSERT INTO ai_attempts(id,owner,request_id,claim,day,status,location_key,created_at) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),owner,requestId,'legacy','2026-10-21',completed?'ready':'generating','legacy-place',f.now());
  }
  const usage=await usageForAccount(f.env,owner,f.now(),8640000000000000);assert.equal(usage.reserved,1);assert.equal(usage.committed,1);assert.equal(usage.used,2);
  assert.equal((await usageForAccount(f.env,owner,f.now(),8640000000000000)).used,2);assertCounters(f);
 }finally{f.close();}
}
// Emergency attempts cannot be reset by a new request ID or duplicate delivery.
{
 const f=await setup({HEARTBEAT_AI_DAILY_LIMIT:'2'});try{
  const owner=f.user.data.user.id,jobs=Array.from({length:12},()=>crypto.randomUUID());for(const id of jobs)f.sqlite.prepare("INSERT INTO hb_jobs(id,owner,request_id,input,status,created_at,updated_at) VALUES (?,?,?,'{}','accepted',?,?)").run(id,owner,crypto.randomUUID(),f.now(),f.now());
  const admitted=await Promise.allSettled(jobs.map(id=>reserveOperatingAttempt(f.env,id,f.now())));assert.equal(admitted.filter(r=>r.status==='fulfilled').length,2);
  const id=f.sqlite.prepare("SELECT job_id FROM hb_provider_operations WHERE kind='admission' LIMIT 1").get().job_id;await reserveOperatingAttempt(f.env,id,f.now());assert.equal(f.sqlite.prepare('SELECT attempts FROM hb_operating_days').get().attempts,2);assertCounters(f);
 }finally{f.close();}
}
// Image validation failures open their own circuit: successful director calls
// cannot keep clearing the image provider's failure history.
{
 const f=await setup();try{
  const users=[f.user];for(let i=0;i<3;i++){const u=await f.register(`circuit${i}@example.test`);await f.call('preferences',{preferences},{cookie:u.cookie});users.push(u);}
  let rejected=0;const deps={...f.deps,provider:()=>({...f.deps.provider(),generate:async()=>{rejected++;throw new ProviderFailure('invalid-output',false);}})};
  for(const u of users){const requestId=crypto.randomUUID();assert.equal((await f.call('generation',{requestId,force:true},{cookie:u.cookie})).status,202);const job=f.sqlite.prepare('SELECT id FROM hb_jobs WHERE request_id=?').get(requestId);await runArtworkJob(f.env,job.id,deps);}
  assert.equal(rejected,3);assert.ok(f.sqlite.prepare('SELECT open_until FROM hb_provider_health WHERE provider=?').get('cloudflare:image').open_until>f.now());assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_jobs WHERE status='directed'").get().n,1);assertCounters(f);
 }finally{f.close();}
}
// An unsent reservation from yesterday cannot bypass today's monetary ceiling.
{
 const f=await setup();try{
  f.advance(12*3600000-1000);const job=await f.accept();await assert.rejects(()=>runArtworkJob(f.env,job.id,{...f.deps,fault:name=>{if(name==='before_director_submit')throw new Error('midnight_pause');}}),/midnight_pause/);
  f.advance(2000);await runArtworkJob(f.env,job.id,f.deps);assert.equal(f.calls().director,0);assert.equal(f.sqlite.prepare('SELECT status FROM hb_jobs').get().status,'failed');assert.equal(f.sqlite.prepare('SELECT SUM(reserved_micros) n FROM hb_operating_days').get().n,0);assertCounters(f);
 }finally{f.close();}
}
console.log('Passed staged crash replay, ambiguous outcomes/no blind retry, fenced/recoverable operator settlement, manifest hash integrity, separate picture/cost settlement, concurrent last credit, provider burst limits, in-flight revocation, configured-loopback dev access, stable Workflow restart and stale-result presentation policy. Providers/R2 mocked; SQLite real; no paid calls.');
