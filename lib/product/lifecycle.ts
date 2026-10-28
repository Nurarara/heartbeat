import {settleUsage,settleProviderOperation} from './usage.ts';
import {db,hash,ProductError,type ProductEnv} from './core.ts';
export async function beginAccountDeletion(env:ProductEnv,owner:string,now:number){
 const database=db(env),billing=await database.prepare('SELECT subscription_id,status FROM hb_billing WHERE user_id=?').bind(owner).first<{subscription_id:string|null;status:string}>();
 if(billing?.subscription_id&&billing.status!=='canceled')throw new ProductError('Cancel your subscription in Billing before deleting your account.',409);
 const id=`delete-${owner}`;
 const changed=await database.batch([
  database.prepare("UPDATE hb_users SET lifecycle='deleting',credential_epoch=credential_epoch+1 WHERE id=? AND lifecycle='active' AND NOT EXISTS(SELECT 1 FROM hb_checkout WHERE user_id=? AND status IN ('creating','open','confirming')) AND NOT EXISTS(SELECT 1 FROM hb_billing WHERE user_id=? AND ((subscription_id IS NOT NULL AND status!='canceled') OR checkout_lock_until>? OR lock_until>?))").bind(owner,owner,owner,now,now),
  database.prepare("INSERT OR IGNORE INTO hb_deletions(id,owner,state,next_attempt_at,created_at) SELECT ?,?,'pending',?,? WHERE EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='deleting')").bind(id,owner,now,now,owner),
  database.prepare("DELETE FROM hb_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='deleting')").bind(owner,owner),
  database.prepare("DELETE FROM hb_tokens WHERE user_id=? AND EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='deleting')").bind(owner,owner),
  database.prepare("DELETE FROM hb_devices WHERE owner=? AND EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='deleting')").bind(owner,owner),
  database.prepare("UPDATE hb_jobs SET status=CASE WHEN status='outcome_unknown' THEN status ELSE 'canceled' END,error_category='account_deleting',result=? WHERE owner=? AND status NOT IN ('ready','done','held','failed') AND EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='deleting')").bind(JSON.stringify({status:'failed',reason:'Account deletion requested.'}),owner,owner),
 ]);
 if(!changed[0].meta.changes&&!await database.prepare('SELECT id FROM hb_deletions WHERE id=?').bind(id).first())throw new ProductError('Finish or cancel your pending checkout and let billing confirmation finish before deleting your account.',409);
 return {deletionId:id,status:'deleting',message:'Your account is disconnected. Private data deletion will resume safely in the background.'};
}
export async function processAccountDeletions(env:ProductEnv,now=Date.now(),limit=10){
 const database=db(env),rows=await database.prepare("SELECT * FROM hb_deletions WHERE state!='completed' AND next_attempt_at<=? ORDER BY created_at LIMIT ?").bind(now,Math.min(limit,50)).all<{id:string;owner:string}>();let completed=0;
 for(const row of rows.results){try{
  // A bounded drain window prevents an already submitted provider response from
  // landing after the last storage sweep. All finalization also checks lifecycle.
  if(await database.prepare('SELECT id FROM hb_jobs WHERE owner=? AND lease_until>? LIMIT 1').bind(row.owner,now).first()){await database.prepare('UPDATE hb_deletions SET next_attempt_at=? WHERE id=?').bind(now+60000,row.id).run();continue;}
  const reservations=await database.prepare("SELECT job_id FROM hb_usage_reservations WHERE owner=? AND state='reserved' LIMIT 100").bind(row.owner).all<{job_id:string}>();
  for(const reservation of reservations.results)await settleUsage(env,reservation.job_id,'release',now);
  if(reservations.results.length===100){await database.prepare('UPDATE hb_deletions SET next_attempt_at=? WHERE id=?').bind(now,row.id).run();continue;}
  const operations=await database.prepare("SELECT p.id,p.job_id,p.state FROM hb_provider_operations p JOIN hb_jobs j ON j.id=p.job_id WHERE j.owner=? AND p.state IN ('reserved','submitted') LIMIT 100").bind(row.owner).all<{id:string;job_id:string;state:string}>();
  for(const op of operations.results){await settleProviderOperation(env,op.id,op.state==='submitted'?'unknown':'failed',now,'account_deleting');if(op.state==='submitted')await database.prepare("UPDATE hb_jobs SET status='outcome_unknown',error_category='revoked_unknown' WHERE id=?").bind(op.job_id).run();}
  if(operations.results.length===100){await database.prepare('UPDATE hb_deletions SET next_attempt_at=? WHERE id=?').bind(now,row.id).run();continue;}
  const keys=await database.prepare('SELECT art_key FROM hb_assets WHERE owner=? AND state!=\'deleted\' UNION SELECT art_key FROM ai_attempts WHERE owner=? AND art_key IS NOT NULL LIMIT 32').bind(row.owner,row.owner).all<{art_key:string}>();
  if(keys.results.length&&!env.BUCKET)throw new Error('storage_unavailable');
  for(const {art_key:key} of keys.results){await env.BUCKET!.delete(key);await database.batch([database.prepare("UPDATE hb_assets SET state='deleted',updated_at=? WHERE owner=? AND art_key=?").bind(now,row.owner,key),database.prepare("UPDATE ai_attempts SET art_key=NULL,candidate=NULL,image_hash=NULL WHERE owner=? AND art_key=?").bind(row.owner,key)]);}
  if(keys.results.length===32){await database.prepare('UPDATE hb_deletions SET next_attempt_at=? WHERE id=?').bind(now,row.id).run();continue;}
  const tombstone=`deleted-${await hash(row.owner)}`;
  await database.batch([
   ...['hb_likes','hb_profiles','hb_checkout','hb_billing','hb_google_identities'].map(table=>database.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(row.owner)),
   database.prepare('DELETE FROM hb_google_states WHERE owner_id=?').bind(row.owner),
   database.prepare('DELETE FROM hb_display_events WHERE owner_id=?').bind(row.owner),database.prepare('DELETE FROM hb_surfaces WHERE owner_id=?').bind(row.owner),database.prepare('DELETE FROM hb_worlds WHERE owner_id=?').bind(row.owner),
   ...['hb_usage_periods','hb_usage_reservations','hb_usage_ledger'].map(table=>database.prepare(`UPDATE ${table} SET owner=? WHERE owner=?`).bind(tombstone,row.owner)),
   database.prepare("UPDATE hb_usage_adjustments SET owner=?,reason='Account deleted; adjustment retained for accounting.' WHERE owner=?").bind(tombstone,row.owner),
   database.prepare("UPDATE hb_operator_audit SET target=?,actor=CASE WHEN actor=? THEN ? ELSE actor END,reason='Account deleted; audit retained for accounting.' WHERE target=?").bind(tombstone,row.owner,tombstone,row.owner),
   database.prepare("UPDATE hb_jobs SET owner=?,input='{}',context=NULL,direction=NULL,result=NULL WHERE owner=?").bind(tombstone,row.owner),
   database.prepare("UPDATE ai_attempts SET owner=?,candidate=NULL,art_key=NULL,image_hash=NULL,status='expired' WHERE owner=?").bind(tombstone,row.owner),database.prepare('DELETE FROM ai_sessions WHERE id=?').bind(row.owner),
   database.prepare('UPDATE hb_assets SET owner=? WHERE owner=?').bind(tombstone,row.owner),database.prepare("DELETE FROM hb_users WHERE id=? AND lifecycle='deleting'").bind(row.owner),
   database.prepare("UPDATE hb_deletions SET state='completed',completed_at=?,last_error=NULL WHERE id=?").bind(now,row.id),
  ]);completed++;
 }catch{await database.prepare("UPDATE hb_deletions SET attempts=attempts+1,next_attempt_at=?,last_error='deletion_retry' WHERE id=?").bind(now+60000,row.id).run();}}
 return {completed};
}
