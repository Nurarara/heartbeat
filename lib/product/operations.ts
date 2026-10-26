import {db,hash,json,ProductError,readJSON,type ProductEnv} from './core.ts';
import {dispatchArtworkOutbox,repairArtworkJobs,settleUnknownArtworkJob} from './jobs.ts';
import {processBillingInbox,reconcileBilling,resolveBillingReview,retryBillingEvent} from './billing-recovery.ts';
import {processAccountDeletions} from './lifecycle.ts';
import {adjustPictureAllowance} from './adjustments.ts';
export async function retainAssets(env:ProductEnv,now=Date.now(),limit=20){
 const database=db(env),assets=await database.prepare("SELECT * FROM hb_assets a WHERE (a.state='deleting' OR (((a.state='staged' AND a.updated_at<? AND NOT EXISTS(SELECT 1 FROM hb_jobs j WHERE j.id=a.job_id AND j.status NOT IN ('failed','held','canceled'))) OR (a.state='ready' AND a.created_at<?)) AND NOT EXISTS(SELECT 1 FROM hb_jobs j WHERE j.id=a.job_id AND j.status NOT IN ('ready','done','held','failed','canceled')))) AND NOT EXISTS(SELECT 1 FROM hb_likes l WHERE l.user_id=a.owner AND l.attempt_id=a.id) AND NOT EXISTS(SELECT 1 FROM hb_surfaces s WHERE s.current_asset_id=a.id) ORDER BY a.updated_at,a.id LIMIT ?").bind(now-3600000,now-7*86400000,Math.min(limit,100)).all<{id:string;art_key:string}>();let deleted=0;
 for(const a of assets.results){if(!env.BUCKET)break;
  const claim=await database.prepare("UPDATE hb_assets SET state='deleting',updated_at=? WHERE id=? AND (state='deleting' OR (state IN ('ready','staged') AND NOT EXISTS(SELECT 1 FROM hb_jobs WHERE id=hb_assets.job_id AND status NOT IN ('ready','done','held','failed','canceled')))) AND NOT EXISTS(SELECT 1 FROM hb_likes WHERE user_id=hb_assets.owner AND attempt_id=hb_assets.id) AND NOT EXISTS(SELECT 1 FROM hb_surfaces WHERE current_asset_id=hb_assets.id)").bind(now,a.id).run();if(!claim.meta.changes)continue;
  try{await env.BUCKET.delete(a.art_key);await database.batch([database.prepare("UPDATE hb_assets SET state='deleted',updated_at=? WHERE id=?").bind(now,a.id),database.prepare("UPDATE ai_attempts SET art_key=NULL WHERE id=?").bind(a.id)]);deleted++;}catch{/* Retry the deleting manifest on the next pass. */}}
 // A provider/storage response can outlive a revoked account's lease. Retained
 // tombstone manifests let bounded repair remove any late reappearing object.
 const revoked=await database.prepare("SELECT id,art_key FROM hb_assets WHERE owner LIKE 'deleted-%' AND updated_at<? ORDER BY updated_at LIMIT ?").bind(now-60000,Math.min(limit,100)).all<{id:string;art_key:string}>();
 for(const a of revoked.results){if(!env.BUCKET)break;try{await env.BUCKET.delete(a.art_key);await database.prepare("UPDATE hb_assets SET state='deleted',updated_at=? WHERE id=?").bind(now,a.id).run();}catch{await database.prepare('UPDATE hb_assets SET updated_at=? WHERE id=?').bind(now,a.id).run();/* Rotate failed tombstones without starving other cleanup. */}}
 for(const [table,column] of [['hb_sessions','expires'],['hb_tokens','expires'],['hb_rate','reset_at']] as const)await database.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${column}<=? LIMIT 200)`).bind(now).run();
 await database.prepare('DELETE FROM hb_devices WHERE rowid IN (SELECT rowid FROM hb_devices WHERE expires<=? LIMIT 100)').bind(now).run();
 await database.prepare("UPDATE hb_billing_inbox SET payload='{}' WHERE id IN (SELECT id FROM hb_billing_inbox WHERE status='processed' AND processed_at<? AND payload!='{}' LIMIT 100)").bind(now-30*86400000).run();
 return {deleted};
}
export async function operationalStatus(env:ProductEnv,now=Date.now()){
 const database=db(env);
 const jobs=await database.prepare('SELECT status,COUNT(*) AS count,MIN(created_at) AS oldest FROM hb_jobs GROUP BY status').all();
 const outbox=await database.prepare("SELECT COUNT(*) AS pending,MIN(created_at) AS oldest FROM hb_artwork_outbox WHERE state!='confirmed'").first();
 const inbox=await database.prepare("SELECT status,COUNT(*) AS count,MIN(received_at) AS oldest FROM hb_billing_inbox WHERE status!='processed' GROUP BY status").all();
 const spend=await database.prepare('SELECT day,attempts,reserved_micros,spent_micros FROM hb_operating_days WHERE day=?').bind(new Date(now).toISOString().slice(0,10)).first();
 const unknown=await database.prepare("SELECT COUNT(*) AS count FROM hb_provider_operations WHERE state IN ('unknown','submitted') AND submitted_at<?").bind(now-240000).first<{count:number}>();
 const deletions=await database.prepare("SELECT state,COUNT(*) AS count FROM hb_deletions WHERE state!='completed' GROUP BY state").all();
 return {at:now,jobs:jobs.results,outbox,inbox:inbox.results,spend,deletions:deletions.results,alerts:{unknownProviderOperations:!!unknown?.count,unknownOutcomes:jobs.results.some((j:Record<string,unknown>)=>j.status==='outcome_unknown'),staleDispatch:!!outbox&&Number(outbox.oldest)>0&&now-Number(outbox.oldest)>120000,billingErrors:inbox.results.some((i:Record<string,unknown>)=>i.status==='failed')}};
}
export async function runMaintenance(env:ProductEnv,now=Date.now(),fetcher:typeof fetch=fetch){
 const tasks={dispatch:()=>dispatchArtworkOutbox(env,now,20),artwork:()=>repairArtworkJobs(env,now,20),billingInbox:()=>processBillingInbox(env,{now,fetcher,limit:20}),billing:()=>reconcileBilling(env,{now,fetcher,limit:20}),deletions:()=>processAccountDeletions(env,now,10),retention:()=>retainAssets(env,now,20)};
 const names=Object.keys(tasks) as (keyof typeof tasks)[],settled=await Promise.allSettled(names.map(name=>tasks[name]()));
 const results=Object.fromEntries(settled.map((r,i)=>[names[i],r.status==='fulfilled'?r.value:{error:'maintenance_domain_failed'}]));
 const failed=settled.flatMap((r,i)=>r.status==='rejected'?[names[i]]:[]);if(failed.length)console.warn('Heartbeat maintenance domain failures',{domains:failed});
 const status=await operationalStatus(env,now);if(Object.values(status.alerts).some(Boolean))console.warn('Heartbeat operational alert',status.alerts);
 return results;
}
export async function operatorRoute(request:Request,env:ProductEnv,now=Date.now()){
 const configured=env.HEARTBEAT_OPERATOR_KEY,token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(!configured||configured.length<32||!token||await hash(token)!==await hash(configured))throw new ProductError('Operator authorization required.',401);
 if(new URL(request.url).protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname))throw new ProductError('A secure operator connection is required.',403);
 const action=new URL(request.url).pathname.split('/').at(-1);if(request.method==='GET'&&action==='status')return json(await operationalStatus(env,now));
 const input=await readJSON(request,4096);if(typeof input.actor!=='string'||input.actor.length>100||typeof input.reason!=='string'||input.reason.trim().length<8)throw new ProductError('Supply the operator identity and reason.');
 if(action==='adjust-pictures'){
  if(typeof input.requestId!=='string'||typeof input.userId!=='string'||typeof input.periodStart!=='number'||typeof input.periodEnd!=='number'||typeof input.delta!=='number')throw new ProductError('Supply the request ID, account, exact period and integer picture adjustment.');
  return json(await adjustPictureAllowance(env,{requestId:input.requestId,userId:input.userId,periodStart:input.periodStart,periodEnd:input.periodEnd,delta:input.delta,actor:input.actor,reason:input.reason,now}));
 }
 if(action==='settle-unknown'&&typeof input.jobId==='string'){await settleUnknownArtworkJob(env,{jobId:input.jobId,actor:input.actor,reason:input.reason,now});return json({settled:true});}
 if(action==='resolve-billing'&&typeof input.userId==='string'&&typeof input.expectedReviewEventId==='string')return json(await resolveBillingReview(env,{userId:input.userId,actor:input.actor,reason:input.reason,expectedReviewEventId:input.expectedReviewEventId,now}));
 if(action==='retry-billing'&&typeof input.eventId==='string')return json(await retryBillingEvent(env,{eventId:input.eventId,actor:input.actor,reason:input.reason,now}));
 if(action==='maintenance'){await db(env).prepare('INSERT INTO hb_operator_audit(id,actor,action,target,reason,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),input.actor,'maintenance','bounded_batch',input.reason,now).run();return json(await runMaintenance(env,now));}
 throw new ProductError('Unknown operator action.',404);
}
