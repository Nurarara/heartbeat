import {db,PLANS,ProductError,type ProductEnv} from './core.ts';
import type {AccountAccess} from './access.ts';
const periodKey=(start:number,end:number)=>`${start}:${end}`;
// Bind clock then owner. Both reservation and operator adjustments use the
// current database entitlement inside their transaction, rather than trusting
// an access snapshot read before a concurrent plan/period change.
export const currentUsageEntitlementSQL=`SELECT id AS owner,
 CASE WHEN paid=1 THEN billing_start ELSE created_at END AS period_start,
 CASE WHEN paid=1 THEN billing_end ELSE 8640000000000000 END AS period_end,
 CASE WHEN paid=1 AND plan='studio' THEN ${PLANS.studio.allowance} WHEN paid=1 AND plan='atelier' THEN ${PLANS.atelier.allowance} ELSE ${PLANS.trial.allowance} END AS base_allowance,
 financial_review FROM (
 SELECT u.id,u.created_at,b.plan,b.period_start AS billing_start,b.period_end AS billing_end,COALESCE(b.review_required,0) AS financial_review,
 CASE WHEN COALESCE(b.review_required,0)=0 AND b.status IN ('active','trialing') AND b.period_end>? AND b.plan IN ('studio','atelier') THEN 1 ELSE 0 END AS paid
 FROM hb_users u LEFT JOIN hb_billing b ON b.user_id=u.id WHERE u.id=? AND u.lifecycle='active')`;
export async function usageForAccount(env:ProductEnv,owner:string,start:number,end:number){
 const key=periodKey(start,end),database=db(env);
 const existing=await database.prepare('SELECT reserved,committed,allowance_adjustment FROM hb_usage_periods WHERE owner=? AND period_key=?').bind(owner,key).first<{reserved:number;committed:number;allowance_adjustment:number}>();if(existing)return {...existing,used:existing.reserved+existing.committed};
 // One-time migration of completed legacy work. New reservations are explicit;
 // mutable asset status is never used to restore a settled picture credit.
 await database.batch([
  database.prepare("INSERT OR IGNORE INTO hb_usage_periods(owner,period_key,period_start,period_end,committed) SELECT ?,?,?,?,COUNT(*) FROM ai_attempts a WHERE owner=? AND created_at>=? AND created_at<? AND status NOT IN ('failed','held','reserved','directing','generating') AND NOT EXISTS(SELECT 1 FROM hb_usage_reservations r WHERE r.job_id=a.id)").bind(owner,key,start,end,owner,start,end),
  database.prepare("INSERT OR IGNORE INTO hb_usage_ledger(id,job_id,owner,period_key,kind,reserved_delta,committed_delta,created_at) SELECT 'legacy:'||a.id||':'||?,'legacy:'||a.id||':'||?,owner,?,'migration_commit',0,1,created_at FROM ai_attempts a WHERE owner=? AND created_at>=? AND created_at<? AND status NOT IN ('failed','held','reserved','directing','generating') AND NOT EXISTS(SELECT 1 FROM hb_usage_reservations r WHERE r.job_id=a.id)").bind(key,key,key,owner,start,end),
  // Old one-step jobs have no recoverable provider receipt. Preserve their
  // unresolved picture credit instead of treating a lease timeout as a refund.
  database.prepare("INSERT OR IGNORE INTO hb_usage_reservations(job_id,owner,period_key,state,created_at,updated_at) SELECT j.id,j.owner,?,'reserved',j.created_at,j.updated_at FROM hb_jobs j WHERE j.owner=? AND j.created_at>=? AND j.created_at<? AND j.status='outcome_unknown' AND j.error_category='legacy_interrupted' AND NOT EXISTS(SELECT 1 FROM ai_attempts a WHERE a.owner=j.owner AND a.request_id=j.request_id AND a.status NOT IN ('failed','held','reserved','directing','generating'))").bind(key,owner,start,end),
  database.prepare("INSERT OR IGNORE INTO hb_usage_ledger(id,job_id,owner,period_key,kind,reserved_delta,committed_delta,created_at) SELECT job_id||':reserve',job_id,owner,period_key,'reserve',1,0,created_at FROM hb_usage_reservations WHERE owner=? AND period_key=? AND state='reserved'").bind(owner,key),
  database.prepare("UPDATE hb_usage_periods SET reserved=(SELECT COUNT(*) FROM hb_usage_reservations WHERE owner=? AND period_key=? AND state='reserved') WHERE owner=? AND period_key=?").bind(owner,key,owner,key),
 ]);
 const r=await database.prepare('SELECT reserved,committed,allowance_adjustment FROM hb_usage_periods WHERE owner=? AND period_key=?').bind(owner,key).first<{reserved:number;committed:number;allowance_adjustment:number}>();
 return {reserved:r?.reserved||0,committed:r?.committed||0,allowance_adjustment:r?.allowance_adjustment||0,used:(r?.reserved||0)+(r?.committed||0)};
}
export async function reserveUsage(env:ProductEnv,jobId:string,a:AccountAccess,now:number){
 await usageForAccount(env,a.userId,a.periodStart,a.periodEnd);const database=db(env),key=periodKey(a.periodStart,a.periodEnd);
 const result=await database.batch([
  database.prepare(`INSERT OR IGNORE INTO hb_usage_reservations(job_id,owner,period_key,state,created_at,updated_at) SELECT ?,?,?,'reserved',?,? WHERE EXISTS(SELECT 1 FROM hb_usage_periods p JOIN (${currentUsageEntitlementSQL}) e ON e.owner=p.owner AND e.period_start=p.period_start AND e.period_end=p.period_end WHERE p.owner=? AND p.period_key=? AND e.financial_review=0 AND p.reserved+p.committed<MIN(?,e.base_allowance)+p.allowance_adjustment) AND EXISTS(SELECT 1 FROM hb_jobs j JOIN hb_users u ON u.id=j.owner WHERE j.id=? AND j.owner=? AND u.lifecycle='active' AND u.credential_epoch=j.owner_epoch)`).bind(jobId,a.userId,key,now,now,now,a.userId,a.userId,key,a.baseAllowance??a.allowance,jobId,a.userId),
  database.prepare("UPDATE hb_usage_periods SET reserved=reserved+1 WHERE owner=? AND period_key=? AND EXISTS(SELECT 1 FROM hb_usage_reservations WHERE job_id=? AND state='reserved') AND NOT EXISTS(SELECT 1 FROM hb_usage_ledger WHERE job_id=? AND kind='reserve')").bind(a.userId,key,jobId,jobId),
  database.prepare("INSERT OR IGNORE INTO hb_usage_ledger(id,job_id,owner,period_key,kind,reserved_delta,committed_delta,created_at) SELECT ?,job_id,owner,period_key,'reserve',1,0,? FROM hb_usage_reservations WHERE job_id=? AND state='reserved'").bind(`${jobId}:reserve`,now,jobId),
 ]);
 if(!result[0].meta.changes){const prior=await database.prepare('SELECT owner,state FROM hb_usage_reservations WHERE job_id=?').bind(jobId).first<{owner:string;state:string}>();if(!prior||prior.owner!==a.userId)throw new ProductError('Your picture allowance is used.',429);if(prior.state==='released')throw new ProductError('This picture reservation has already been released.',409);}
}
export async function settleUsage(env:ProductEnv,jobId:string,kind:'commit'|'release',now:number){
 const database=db(env),committed=kind==='commit'?1:0;
 await database.batch([
  database.prepare("UPDATE hb_usage_periods SET reserved=reserved-1,committed=committed+? WHERE (owner,period_key) IN (SELECT owner,period_key FROM hb_usage_reservations WHERE job_id=? AND state='reserved') AND NOT EXISTS(SELECT 1 FROM hb_usage_ledger WHERE job_id=? AND kind IN ('commit','release'))").bind(committed,jobId,jobId),
  database.prepare("INSERT OR IGNORE INTO hb_usage_ledger(id,job_id,owner,period_key,kind,reserved_delta,committed_delta,created_at) SELECT ?,job_id,owner,period_key,?,-1,?,? FROM hb_usage_reservations WHERE job_id=? AND state='reserved' AND NOT EXISTS(SELECT 1 FROM hb_usage_ledger WHERE job_id=? AND kind IN ('commit','release'))").bind(`${jobId}:${kind}`,kind,committed,now,jobId,jobId),
  database.prepare("UPDATE hb_usage_reservations SET state=?,updated_at=? WHERE job_id=? AND state='reserved' AND EXISTS(SELECT 1 FROM hb_usage_ledger WHERE job_id=? AND kind=?)").bind(kind==='commit'?'committed':'released',now,jobId,jobId,kind),
 ]);
}
export function positiveSetting(value:string|undefined,fallback:number,maximum=1000000000){const n=Number(value??fallback);return Number.isSafeInteger(n)&&n>=0&&n<=maximum?n:fallback;}
export async function reserveOperatingAttempt(env:ProductEnv,jobId:string,now:number){
 const database=db(env),day=new Date(now).toISOString().slice(0,10),limit=positiveSetting(env.HEARTBEAT_AI_DAILY_LIMIT,3,100000),id=`${jobId}:admission`;
 await database.batch([
  database.prepare('INSERT OR IGNORE INTO hb_operating_days(day,attempts) VALUES (?,0)').bind(day),
  database.prepare("INSERT OR IGNORE INTO hb_provider_operations(id,job_id,kind,provider,model,state,estimated_micros,day) SELECT ?,?,'admission','heartbeat','policy-v1','succeeded',0,? WHERE EXISTS(SELECT 1 FROM hb_operating_days WHERE day=? AND attempts<?) AND EXISTS(SELECT 1 FROM hb_jobs j JOIN hb_users u ON u.id=j.owner WHERE j.id=? AND u.lifecycle='active' AND u.credential_epoch=j.owner_epoch)").bind(id,jobId,day,day,limit,jobId),
  database.prepare("UPDATE hb_operating_days SET attempts=attempts+1 WHERE day=? AND EXISTS(SELECT 1 FROM hb_provider_operations WHERE id=?) AND NOT EXISTS(SELECT 1 FROM hb_cost_ledger WHERE operation_id=? AND kind='admit')").bind(day,id,id),
  database.prepare("INSERT OR IGNORE INTO hb_cost_ledger(id,operation_id,job_id,kind,reserved_delta,spent_delta,created_at) SELECT ?,id,job_id,'admit',0,0,? FROM hb_provider_operations WHERE id=?").bind(`${id}:admit`,now,id),
 ]);
 if(!await database.prepare('SELECT id FROM hb_provider_operations WHERE id=?').bind(id).first())throw new ProductError('Daily operating capacity is used. Your picture allowance is separate.',429);
 return day;
}
export async function reserveProviderOperation(env:ProductEnv,jobId:string,kind:'director'|'image',model:string,now:number){
 const database=db(env),id=`${jobId}:${kind}`,day=new Date(now).toISOString().slice(0,10);
 const prior=await database.prepare('SELECT * FROM hb_provider_operations WHERE id=?').bind(id).first<{state:string}>();if(prior)return {id,state:prior.state};
 const estimate=positiveSetting(kind==='director'?env.HEARTBEAT_DIRECTOR_ESTIMATE_MICROS:env.HEARTBEAT_IMAGE_ESTIMATE_MICROS,0),budget=positiveSetting(env.HEARTBEAT_DAILY_BUDGET_MICROS,env.HEARTBEAT_APP_MODE==='production'?0:1000000000);
 const health=await database.prepare("SELECT MAX(open_until) AS open_until FROM hb_provider_health WHERE provider IN ('cloudflare',?)").bind(`cloudflare:${kind}`).first<{open_until:number}>();
 if(health&&health.open_until>now)throw new ProductError('The artwork provider is cooling down. Your current picture stays.',503);
 const changes=await database.batch([
  database.prepare('INSERT OR IGNORE INTO hb_operating_days(day,attempts) VALUES (?,0)').bind(day),
  database.prepare('INSERT OR IGNORE INTO hb_provider_operations(id,job_id,kind,provider,model,state,estimated_micros,day) SELECT ?,?,?,\'cloudflare\',?,\'reserved\',?,? WHERE EXISTS(SELECT 1 FROM hb_operating_days WHERE day=? AND reserved_micros+spent_micros+?<=?) AND EXISTS(SELECT 1 FROM hb_jobs j JOIN hb_users u ON u.id=j.owner WHERE j.id=? AND u.lifecycle=\'active\' AND u.credential_epoch=j.owner_epoch)').bind(id,jobId,kind,model,estimate,day,day,estimate,budget,jobId),
  database.prepare("UPDATE hb_operating_days SET reserved_micros=reserved_micros+? WHERE day=? AND EXISTS(SELECT 1 FROM hb_provider_operations WHERE id=?) AND NOT EXISTS(SELECT 1 FROM hb_cost_ledger WHERE operation_id=? AND kind='reserve')").bind(estimate,day,id,id),
  database.prepare("INSERT OR IGNORE INTO hb_cost_ledger(id,operation_id,job_id,kind,reserved_delta,spent_delta,created_at) SELECT ?,id,job_id,'reserve',estimated_micros,0,? FROM hb_provider_operations WHERE id=?").bind(`${id}:reserve`,now,id),
 ]);
 if(!changes[1].meta.changes){const existing=await database.prepare('SELECT state FROM hb_provider_operations WHERE id=?').bind(id).first<{state:string}>();if(existing)return {id,state:existing.state};throw new ProductError('The operating spend ceiling is reached.',429);}
 return {id,state:'reserved'};
}
/** Capacity is acquired immediately before the external call, never while a stage sleeps. */
export async function submitProviderOperation(env:ProductEnv,id:string,jobId:string,claim:string,version:number,now:number){
 const database=db(env),count=positiveSetting(env.HEARTBEAT_PROVIDER_CONCURRENCY,2,32);
 if(count===0)throw new ProductError('Provider admission is suspended.',429);
 const operation=await database.prepare('SELECT day,kind FROM hb_provider_operations WHERE id=?').bind(id).first<{day:string;kind:string}>();
 if(operation&&operation.day!==new Date(now).toISOString().slice(0,10))throw new ProductError('The operating reservation expired at the day boundary. Request a new moment.',409);
 const health=await database.prepare("SELECT MAX(open_until) AS open_until FROM hb_provider_health WHERE provider IN ('cloudflare',?)").bind(`cloudflare:${operation?.kind}`).first<{open_until:number}>();
 if(health&&health.open_until>now)throw new ProductError('The artwork provider is cooling down. Your current picture stays.',503);
 for(let slot=0;slot<count;slot++)await database.prepare('INSERT OR IGNORE INTO hb_provider_slots(slot) VALUES (?)').bind(slot).run();
 const r=await database.batch([
  database.prepare("UPDATE hb_provider_slots SET job_id=?,operation_id=?,lease_until=? WHERE slot=(SELECT slot FROM hb_provider_slots WHERE slot<? AND lease_until<=? ORDER BY slot LIMIT 1) AND NOT EXISTS(SELECT 1 FROM hb_provider_slots WHERE operation_id=? AND lease_until>?) AND EXISTS(SELECT 1 FROM hb_provider_operations WHERE id=? AND state='reserved') AND EXISTS(SELECT 1 FROM hb_jobs j JOIN hb_users u ON u.id=j.owner WHERE j.id=? AND j.lease=? AND j.stage_version=? AND j.lease_until>? AND u.lifecycle='active' AND u.credential_epoch=j.owner_epoch)").bind(jobId,id,now+240000,count,now,id,now,id,jobId,claim,version,now+180000),
  database.prepare("UPDATE hb_provider_operations SET state='submitted',submitted_at=? WHERE id=? AND state='reserved' AND EXISTS(SELECT 1 FROM hb_provider_slots WHERE operation_id=? AND lease_until>?) AND EXISTS(SELECT 1 FROM hb_jobs j JOIN hb_users u ON u.id=j.owner WHERE j.id=? AND j.lease=? AND j.stage_version=? AND j.lease_until>? AND u.lifecycle='active' AND u.credential_epoch=j.owner_epoch)").bind(now,id,id,now+180000,jobId,claim,version,now+180000),
 ]);
 if(r[1].meta.changes!==1){const operation=await database.prepare('SELECT state FROM hb_provider_operations WHERE id=?').bind(id).first<{state:string}>();if(operation&&operation.state!=='reserved')throw new ProductError('This provider operation already has a submitted outcome.',409);throw new ProductError('Provider slots are busy. Your picture is queued.',429);}
}
export async function settleProviderOperation(env:ProductEnv,id:string,state:'succeeded'|'failed'|'unknown',now:number,category?:string){
 const database=db(env);
 const operation=await database.prepare('SELECT state,kind FROM hb_provider_operations WHERE id=?').bind(id).first<{state:string;kind:string}>();if(!operation||operation.state===state||['succeeded','failed','released'].includes(operation.state))return;
 // Unsubmitted work costs zero. Submitted/unknown work is conservatively settled
 // at its estimate; actual_micros remains NULL until provider billing is available.
 const spent=operation.state==='reserved'?0:1;
 const changes=await database.batch([
  database.prepare("UPDATE hb_operating_days SET reserved_micros=reserved_micros-(SELECT estimated_micros FROM hb_provider_operations WHERE id=?),spent_micros=spent_micros+?*(SELECT estimated_micros FROM hb_provider_operations WHERE id=?) WHERE ?!='unknown' AND day=(SELECT day FROM hb_provider_operations WHERE id=?) AND EXISTS(SELECT 1 FROM hb_provider_operations WHERE id=? AND state=?) AND NOT EXISTS(SELECT 1 FROM hb_cost_ledger WHERE operation_id=? AND kind='settle')").bind(id,spent,id,state,id,id,operation.state,id),
  database.prepare("INSERT OR IGNORE INTO hb_cost_ledger(id,operation_id,job_id,kind,reserved_delta,spent_delta,created_at) SELECT ?,id,job_id,'settle',-estimated_micros,?*estimated_micros,? FROM hb_provider_operations WHERE id=? AND state=? AND ?!='unknown'").bind(`${id}:settle`,spent,now,id,operation.state,state),
  database.prepare('UPDATE hb_provider_operations SET state=?,settled_at=?,error_category=? WHERE id=? AND state=?').bind(state,now,category||null,id,operation.state),
 ]);
 if(!changes[2].meta.changes)return;
 await database.prepare('UPDATE hb_provider_slots SET lease_until=0,job_id=NULL,operation_id=NULL WHERE operation_id=?').bind(id).run();
 const healthKey=`cloudflare:${operation.kind}`;
 if(state==='succeeded')await database.prepare("INSERT INTO hb_provider_health(provider,failures,open_until,updated_at) VALUES (?,0,0,?) ON CONFLICT(provider) DO UPDATE SET failures=0,open_until=0,updated_at=excluded.updated_at").bind(healthKey,now).run();
 else if(operation.state!=='reserved')await database.prepare("INSERT INTO hb_provider_health(provider,failures,open_until,category,updated_at) VALUES (?,1,0,?,?) ON CONFLICT(provider) DO UPDATE SET failures=failures+1,open_until=CASE WHEN failures>=2 THEN ? ELSE open_until END,category=excluded.category,updated_at=excluded.updated_at").bind(healthKey,category||state,now,now+300000).run();
}
