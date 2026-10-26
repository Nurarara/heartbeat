// Actual SQLite transactions and account policy; no inference/payment calls.
import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';
import {adjustPictureAllowance} from '../lib/product/adjustments.ts';
import {accessFor} from '../lib/product/access.ts';
import {reserveUsage,settleUsage,usageForAccount} from '../lib/product/usage.ts';
import {beginAccountDeletion,processAccountDeletions} from '../lib/product/lifecycle.ts';

async function setup({paid=false,verified=true}={}){
 const f=await fixture(),owner=crypto.randomUUID();
 f.sqlite.prepare('INSERT INTO hb_users(id,email,password_hash,verified,created_at) VALUES (?,?,?,?,?)').run(owner,`${owner}@example.test`,'not-used-by-this-domain-test',verified?1:0,f.now());
 if(paid)f.sqlite.prepare("INSERT INTO hb_billing(user_id,plan,status,period_start,period_end) VALUES (?,'studio','active',?,?)").run(owner,f.now(),f.now()+30*86400000);
 const user=()=>f.sqlite.prepare('SELECT * FROM hb_users WHERE id=?').get(owner);
 const access=()=>accessFor({user:user(),expires:f.now()+60000},f.env,f.now());
 const initial=await access();
 const adjustment=(delta,overrides={})=>adjustPictureAllowance(f.env,{requestId:crypto.randomUUID(),userId:owner,periodStart:initial.periodStart,periodEnd:initial.periodEnd,delta,actor:'test-operator',reason:'Support adjustment after reviewing picture history',now:f.now(),...overrides});
 const job=()=>{const id=crypto.randomUUID();f.sqlite.prepare("INSERT INTO hb_jobs(id,owner,request_id,input,status,created_at,updated_at) VALUES (?,?,?,'{}','accepted',?,?)").run(id,owner,crypto.randomUUID(),f.now(),f.now());return id;};
 return {...f,owner,user,access,initial,adjustment,job};
}
function balanced(f){
 for(const p of f.sqlite.prepare('SELECT * FROM hb_usage_periods').all()){
  const usage=f.sqlite.prepare('SELECT COALESCE(SUM(reserved_delta),0) reserved,COALESCE(SUM(committed_delta),0) committed FROM hb_usage_ledger WHERE owner=? AND period_key=?').get(p.owner,p.period_key);
  const adjustments=f.sqlite.prepare('SELECT COALESCE(SUM(delta),0) value FROM hb_usage_adjustments WHERE owner=? AND period_key=?').get(p.owner,p.period_key);
  assert.equal(p.reserved,usage.reserved);assert.equal(p.committed,usage.committed);assert.equal(p.allowance_adjustment,adjustments.value);assert.ok(p.reserved>=0&&p.committed>=0);
 }
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_cost_ledger').get().n,0,'Picture support adjustments never invent provider actual costs.');
}

{
 const f=await setup();try{
  const operatorKey='fixture-separate-operator-key-'.repeat(2);f.env.HEARTBEAT_OPERATOR_KEY=operatorKey;
  const body={requestId:crypto.randomUUID(),userId:f.owner,periodStart:f.initial.periodStart,periodEnd:f.initial.periodEnd,delta:2,actor:'endpoint-test-operator',reason:'Verified support grant through the operator endpoint'};
  assert.equal((await f.call('ops/adjust-pictures',body)).status,401);
  assert.equal((await f.call('ops/adjust-pictures',body,{headers:{Authorization:`Bearer ${f.env.HEARTBEAT_AI_ACCESS_KEY}`}})).status,401,'The customer/local AI key does not confer operator access.');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_usage_adjustments').get().n,0);
  const headers={Authorization:`Bearer ${operatorKey}`},response=await f.call('ops/adjust-pictures',body,{headers});assert.equal(response.status,200);assert.equal((await response.json()).allowance,5);
  const replay=await f.call('ops/adjust-pictures',body,{headers});assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
  assert.equal((await f.call('ops/adjust-pictures',{...body,delta:1},{headers})).status,409);
  assert.equal((await f.call('ops/adjust-pictures',{...body,requestId:crypto.randomUUID(),delta:'2'},{headers})).status,400);
  assert.equal((await f.call('ops/adjust-pictures',{...body,requestId:crypto.randomUUID()},{headers,urlOrigin:'http://remote.example.test'})).status,403,'Operator credentials require HTTPS or local loopback.');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_usage_adjustments').get().n,1);balanced(f);
 }finally{f.close();}
}

{
 const f=await setup();try{
  const requestId=crypto.randomUUID(),grant=await f.adjustment(2,{requestId});assert.equal(grant.allowance,5);assert.equal(grant.used,0);assert.equal(grant.replayed,false);
  assert.equal((await f.access()).allowance,5);assert.equal((await f.access()).baseAllowance,3);
  const stale=f.initial,jobs=Array.from({length:6},f.job),reservations=await Promise.allSettled(jobs.map(id=>reserveUsage(f.env,id,stale,f.now())));
  assert.equal(reservations.filter(r=>r.status==='fulfilled').length,5,'A grant is immediately enforced from the current DB balance, even with older access snapshots.');
  const first=jobs[reservations.findIndex(r=>r.status==='fulfilled')];await settleUsage(f.env,first,'commit',f.now());
  f.sqlite.prepare("INSERT INTO hb_assets(id,job_id,owner,art_key,image_hash,mime,width,height,validation_version,state,created_at,updated_at) VALUES (?,?,?,'fixture/key','fixture-hash','image/jpeg',1024,1024,1,'ready',?,?)").run(first,first,f.owner,f.now(),f.now());
  f.sqlite.prepare("UPDATE hb_assets SET state='deleted' WHERE id=?").run(first);
  const usage=await usageForAccount(f.env,f.owner,f.initial.periodStart,f.initial.periodEnd);assert.equal(usage.committed,1);assert.equal(usage.used,5,'Storage expiry does not restore successful preparation credits.');
  const replay=await f.adjustment(2,{requestId});assert.deepEqual({...replay,replayed:false},grant,'Replays return the original snapshot, not a fresh balance.');
  for(const patch of [{delta:1},{actor:'different-operator'},{reason:'A different valid support reason'},{periodEnd:f.initial.periodEnd-1},{userId:crypto.randomUUID()}])await assert.rejects(()=>f.adjustment(2,{requestId,...patch}),e=>e.status===409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_usage_adjustments').get().n,1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_operator_audit WHERE action='adjust_picture_allowance'").get().n,1);balanced(f);
 }finally{f.close();}
}
{
 const f=await setup();try{
  const id=crypto.randomUUID(),results=await Promise.all(Array.from({length:12},()=>f.adjustment(1,{requestId:id})));
  assert.equal(results.filter(r=>!r.replayed).length,1);assert.equal((await f.access()).allowance,4);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_operator_audit').get().n,1);
  const conflictId=crypto.randomUUID(),conflicts=await Promise.allSettled([f.adjustment(1,{requestId:conflictId}),f.adjustment(2,{requestId:conflictId})]);assert.equal(conflicts.filter(r=>r.status==='fulfilled').length,1);assert.equal(conflicts.find(r=>r.status==='rejected').reason.status,409);balanced(f);
 }finally{f.close();}
}
{
 const f=await setup();try{
  const committed=f.job(),reserved=f.job();await reserveUsage(f.env,committed,f.initial,f.now());await settleUsage(f.env,committed,'commit',f.now());await reserveUsage(f.env,reserved,f.initial,f.now());
  await assert.rejects(()=>f.adjustment(-2),e=>e.status===409,'Withdrawals cannot remove already used or held allowance.');
  await f.adjustment(-1);assert.equal((await f.access()).allowance,2);assert.equal((await f.access()).eligible,false);
  await assert.rejects(()=>reserveUsage(f.env,f.job(),f.initial,f.now()),e=>e.status===429,'A stale access snapshot cannot bypass a withdrawal.');
  await settleUsage(f.env,reserved,'release',f.now());assert.equal((await f.access()).eligible,true);await reserveUsage(f.env,f.job(),f.initial,f.now());balanced(f);
 }finally{f.close();}
}
for(const first of ['reserve','adjust']){
 const f=await setup();try{
  for(let i=0;i<2;i++){const id=f.job();await reserveUsage(f.env,id,f.initial,f.now());await settleUsage(f.env,id,'commit',f.now());}
  const reserve=()=>reserveUsage(f.env,f.job(),f.initial,f.now()),adjust=()=>f.adjustment(-1);
  const raced=await Promise.allSettled(first==='reserve'?[reserve(),adjust()]:[adjust(),reserve()]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1,'Concurrent last-credit reservation and withdrawal have one winner.');
  const current=await f.access();assert.ok(current.used<=current.allowance);balanced(f);
 }finally{f.close();}
}
{
 const f=await setup();try{
  for(const delta of [0,0.5,NaN,Infinity,100001,-100001,'2',null])await assert.rejects(()=>f.adjustment(delta),e=>e.status===400);
  for(const patch of [{requestId:'short'},{requestId:'invalid/request'},{actor:' '},{reason:'short'},{periodStart:-1},{periodEnd:Infinity},{periodEnd:f.initial.periodStart},{now:NaN}])await assert.rejects(()=>f.adjustment(1,patch),e=>e.status===400);
  await f.adjustment(100000);await assert.rejects(()=>f.adjustment(1),e=>e.status===409,'The cumulative adjustment has a bounded integer range.');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_usage_adjustments').get().n,1);balanced(f);
 }finally{f.close();}
}
{
 const f=await setup();try{
  await f.adjustment(-3);const current=await f.access();assert.equal(current.allowance,0);assert.equal(current.used,0);assert.equal(current.eligible,false);await assert.rejects(()=>reserveUsage(f.env,f.job(),f.initial,f.now()),e=>e.status===429);balanced(f);
 }finally{f.close();}
}
for(const transition of ['deleting','review','renewal','plan']){
 const f=await setup({paid:true});try{
  const batch=f.env.DB.batch;let once=false;f.env.DB.batch=async statements=>{if(!once){once=true;
   if(transition==='deleting')f.sqlite.prepare("UPDATE hb_users SET lifecycle='deleting' WHERE id=?").run(f.owner);
   else if(transition==='review')f.sqlite.prepare('UPDATE hb_billing SET review_required=1 WHERE user_id=?').run(f.owner);
   else if(transition==='renewal')f.sqlite.prepare('UPDATE hb_billing SET period_start=period_start+1000,period_end=period_end+1000 WHERE user_id=?').run(f.owner);
   else f.sqlite.prepare("UPDATE hb_billing SET plan='atelier' WHERE user_id=?").run(f.owner);
  }return batch(statements);};
  await assert.rejects(()=>f.adjustment(2),e=>e.status===409,`${transition} between the initial read and transaction must fence the mutation.`);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_usage_adjustments').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_operator_audit').get().n,0);balanced(f);
 }finally{f.close();}
}
{
 const f=await setup({verified:false});try{await f.adjustment(2);assert.equal((await f.access()).eligible,false,'A credit grant never bypasses email verification.');balanced(f);}finally{f.close();}
}
{
 const f=await setup({paid:true});try{
  const original=await f.adjustment(2),end=f.initial.periodEnd;f.advance(31*86400000);f.sqlite.prepare('UPDATE hb_billing SET period_start=?,period_end=? WHERE user_id=?').run(end,end+30*86400000,f.owner);
  assert.equal((await f.access()).allowance,120,'An adjustment is confined to its original paid period.');
  await assert.rejects(()=>reserveUsage(f.env,f.job(),f.initial,f.now()),e=>e.status===429,'An old access snapshot cannot reserve against a previous billing period.');
  assert.equal((await f.adjustment(2,{requestId:original.requestId})).replayed,true);await assert.rejects(()=>f.adjustment(2),e=>e.status===409);balanced(f);
 }finally{f.close();}
}
{
 const f=await setup();try{
  const privateReason='Private support context that account deletion must remove';await f.adjustment(2,{reason:privateReason});
  const id=f.job();await reserveUsage(f.env,id,await f.access(),f.now());await settleUsage(f.env,id,'commit',f.now());
  await beginAccountDeletion(f.env,f.owner,f.now());await processAccountDeletions(f.env,f.now());
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_users WHERE id=?').get(f.owner).n,0);
  for(const table of ['hb_usage_periods','hb_usage_reservations','hb_usage_ledger','hb_usage_adjustments'])assert.equal(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table} WHERE owner=?`).get(f.owner).n,0,`${table} must retain only the tombstoned owner.`);
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM hb_usage_adjustments').all()).includes(privateReason),false);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_operator_audit WHERE target=? OR reason=?').get(f.owner,privateReason).n,0);balanced(f);
 }finally{f.close();}
}
console.log('Passed audited period-bound picture allowance grants/withdrawals, immutable success history and cost isolation, replay/conflict/concurrent last-credit admission, integer bounds, financial/lifecycle/plan/renewal fences, verification, and deletion anonymization using SQLite transactions. No external requests.');
