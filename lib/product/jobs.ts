import {db,hash,json,ProductError,type ProductEnv} from './core.ts';
import {accessFor} from './access.ts';
import type {User} from './auth.ts';
import type {AccountAccess} from './access.ts';
import {resolveArtworkInput} from './profiles.ts';
import {cloudflareProvider,ProviderFailure} from '../ai/cloudflare.ts';
import {createWeatherAdapter,WeatherUnavailableError} from '../server/weather.ts';
import {planMoment,parseStoryMemory} from '../ambient-director.ts';
import {creativePacket,type CreativeProposal} from '../creative.ts';
import {withScreenFraming} from '../director-contract.ts';
import {THEME_LIBRARY} from '../creative-library.ts';
import {localClock} from '../ambient.ts';
import {weatherCue} from '../weather-mood.ts';
import type {Context,Place} from '../world.ts';
import type {AICandidate} from '../ai/types.ts';
import {reserveUsage,settleUsage,reserveOperatingAttempt,reserveProviderOperation,submitProviderOperation,settleProviderOperation,positiveSetting} from './usage.ts';

export type JobEnv=ProductEnv;
type Job={id:string;owner:string;owner_epoch:number;request_id:string;input:string;input_hash:string;status:string;error_category:string|null;result:string|null;created_at:number;updated_at:number;stage_version:number;lease:string|null;lease_until:number;context:string|null;direction:string|null;world_id:string|null;surface_id:string|null;deadline:number};
type Dependencies={now?:()=>number;provider?:typeof cloudflareProvider;context?:(place:Place)=>Promise<Context>;fault?:(boundary:string)=>void|Promise<void>};
const terminal=new Set(['ready','done','held','failed','canceled','outcome_unknown']);
class InjectedCrash extends Error {constructor(error:unknown){super(error instanceof Error?error.message:'Injected interruption');this.name='InjectedCrash';}}
class LeaseLost extends Error {}
async function boundary(deps:Dependencies,name:string){try{await deps.fault?.(name);}catch(error){throw new InjectedCrash(error);}}
const providerModels=(env:JobEnv)=>({director:env.HEARTBEAT_DIRECTOR_MODEL||'@cf/meta/llama-3.3-70b-instruct-fp8-fast',image:env.HEARTBEAT_IMAGE_MODEL||'@cf/black-forest-labs/flux-1-schnell'});
function localJobDevelopment(env:JobEnv){try{const origin=new URL(env.HEARTBEAT_APP_ORIGIN||'');return env.HEARTBEAT_APP_MODE==='development'&&origin.protocol==='http:'&&!origin.username&&!origin.password&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname);}catch{return false;}}
function result(job:Job,now:number){if(job.result)return JSON.parse(job.result);if(job.status==='outcome_unknown')return {status:'failed',jobState:'outcome_unknown',jobId:job.id,requestId:job.request_id,reason:'The provider outcome needs reconciliation. This request will not be submitted again automatically.'};const retryAfter=Math.min(30,5*2**Math.min(3,Math.floor(Math.max(0,now-job.updated_at)/60000)));return {status:'pending',jobState:job.status,jobId:job.id,requestId:job.request_id,nextAt:now+retryAfter*1000,retryAfter};}
async function readJob(env:JobEnv,id:string){return db(env).prepare('SELECT * FROM hb_jobs WHERE id=?').bind(id).first<Job>();}
export async function acceptArtworkRequest(env:JobEnv,user:User,input:Record<string,unknown>,now:number){
 if(typeof input.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(input.requestId))throw new ProductError('Invalid picture request.');
 const prior=await db(env).prepare('SELECT * FROM hb_jobs WHERE owner=? AND request_id=?').bind(user.id,input.requestId).first<Job>();
 if(prior){const old=JSON.parse(prior.input);if((input.worldId!==undefined&&input.worldId!==prior.world_id)||(input.surfaceId!==undefined&&input.surfaceId!==prior.surface_id)||old.force!==(input.force===true))throw new ProductError('This request key was used for different input.',409);await dispatchArtworkOutbox(env,now,4);return prior;}
 const normalized=await resolveArtworkInput(env,user.id,input,now),body=JSON.stringify({...normalized,force:input.force===true}),fingerprint=await hash(body);
 if(env.HEARTBEAT_AI_ENABLED!=='true'||!env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID||!env.BUCKET)throw new ProductError('AI setup is not complete. Your current artwork stays.',503);
 if(!env.ARTWORK_WORKFLOW)throw new ProductError('Background generation is not configured.',503);
 const a=await accessFor({user,expires:now+86400000},env,now,localJobDevelopment(env));if(!a.eligible)throw new ProductError(a.reason,429);
 const id=crypto.randomUUID(),database=db(env);
 const inserted=await database.batch([
  database.prepare("INSERT OR IGNORE INTO hb_jobs(id,owner,owner_epoch,request_id,input,input_hash,status,created_at,updated_at,world_id,surface_id,deadline) SELECT ?,?,?,?,?,?,'accepted',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='active' AND credential_epoch=?) AND (SELECT COUNT(*) FROM hb_jobs WHERE owner=? AND status NOT IN ('ready','done','held','failed','canceled','outcome_unknown'))<1").bind(id,user.id,user.credential_epoch||0,input.requestId,body,fingerprint,now,now,normalized.worldId,normalized.surfaceId,now+positiveSetting(env.HEARTBEAT_MAX_QUEUE_AGE_MS,1800000,86400000),user.id,user.credential_epoch||0,user.id),
  database.prepare("INSERT OR IGNORE INTO hb_artwork_outbox(job_id,state,next_attempt_at,created_at,updated_at) SELECT id,'pending',?,?,? FROM hb_jobs WHERE id=?").bind(now,now,now,id),
 ]);
 const saved=await database.prepare('SELECT * FROM hb_jobs WHERE owner=? AND request_id=?').bind(user.id,input.requestId).first<Job>();
 if(!saved)throw new ProductError('A picture is already queued for your account. Wait for that request.',429);
 if(saved.input_hash!==fingerprint)throw new ProductError('This request key was used for different input.',409);
 if(inserted[0].meta.changes)await dispatchArtworkOutbox(env,now,4);
 return saved;
}
export async function dispatchArtworkOutbox(env:JobEnv,now=Date.now(),limit=20){
 if(!env.ARTWORK_WORKFLOW)return {dispatched:0};const database=db(env);
 const rows=await database.prepare("SELECT o.* FROM hb_artwork_outbox o JOIN hb_jobs j ON j.id=o.job_id JOIN hb_users u ON u.id=j.owner WHERE o.state!='confirmed' AND o.next_attempt_at<=? AND u.lifecycle='active' AND u.credential_epoch=j.owner_epoch AND j.status NOT IN ('ready','done','held','failed','canceled','outcome_unknown') ORDER BY o.created_at,o.job_id LIMIT ?").bind(now,Math.min(limit,100)).all<{job_id:string;attempts:number}>();let dispatched=0;
 for(const o of rows.results){
  const locked=await database.prepare("UPDATE hb_artwork_outbox SET state='dispatching',next_attempt_at=? WHERE job_id=? AND state!='confirmed' AND next_attempt_at<=?").bind(now+60000,o.job_id,now).run();if(!locked.meta.changes)continue;
  try{
  // Stable Workflow IDs close the create/ack ambiguity; delivery may repeat.
  let exists=false;try{const instance=await env.ARTWORK_WORKFLOW.get(o.job_id),status=await instance.status();exists=true;if(['errored','terminated','complete'].includes(status.status)){if(!instance.restart)throw new ProductError('Workflow recovery is unavailable.',503);await instance.restart();}}catch(error){if(error instanceof ProductError)throw error;/* No confirmed instance yet. */}
  if(!exists)await env.ARTWORK_WORKFLOW.create({id:o.job_id,params:{jobId:o.job_id}});
  const confirmed=await database.prepare("UPDATE hb_artwork_outbox SET state='confirmed',attempts=attempts+1,last_error=NULL,updated_at=? WHERE job_id=? AND state='dispatching' AND next_attempt_at=?").bind(now,o.job_id,now+60000).run();if(confirmed.meta.changes)dispatched++;
 }catch{await database.prepare("UPDATE hb_artwork_outbox SET state='retry',attempts=attempts+1,next_attempt_at=?,last_error='dispatch_unconfirmed',updated_at=? WHERE job_id=? AND state='dispatching' AND next_attempt_at=?").bind(now+Math.min(300000,1000*2**Math.min(o.attempts,8)),now,o.job_id,now+60000).run();}}
 return {dispatched};
}
async function validOwner(env:JobEnv,job:Job){return db(env).prepare("SELECT * FROM hb_users WHERE id=? AND credential_epoch=? AND lifecycle='active'").bind(job.owner,job.owner_epoch).first<User>();}
async function transition(env:JobEnv,job:Job,claim:string,next:string,values:{context?:string;direction?:string;result?:string;error?:string}={},now=Date.now()){
 const r=await db(env).prepare("UPDATE hb_jobs SET status=?,context=COALESCE(?,context),direction=COALESCE(?,direction),result=COALESCE(?,result),error_category=?,updated_at=?,lease=NULL,lease_until=0,stage_version=stage_version+1 WHERE id=? AND lease=? AND stage_version=? AND lease_until>? AND EXISTS(SELECT 1 FROM hb_users WHERE id=hb_jobs.owner AND lifecycle='active' AND credential_epoch=hb_jobs.owner_epoch)").bind(next,values.context??null,values.direction??null,values.result??null,values.error??null,now,job.id,claim,job.stage_version,now).run();
 if(r.meta.changes!==1)throw new LeaseLost('The job lease or account changed.');
}
type Asset={id:string;art_key:string;image_hash:string;mime:string;state:string;validation_version:number};
async function storedAsset(env:JobEnv,job:Job):Promise<Asset|null>{
 const asset=await db(env).prepare("SELECT * FROM hb_assets WHERE job_id=? AND owner=? AND state IN ('staged','ready')").bind(job.id,job.owner).first<Asset>();if(!asset)return null;
 const object=await env.BUCKET?.get(asset.art_key);if(!object)return null;
 const reader=object.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>12000000){await reader.cancel();return null;}chunks.push(item.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(asset.mime!=='image/jpeg'||asset.validation_version<1||digest!==asset.image_hash||size<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
 return asset;
}
async function assertLease(env:JobEnv,job:Job,claim:string,now:number){const owned=await db(env).prepare("SELECT j.id FROM hb_jobs j JOIN hb_users u ON u.id=j.owner WHERE j.id=? AND j.lease=? AND j.stage_version=? AND j.lease_until>? AND u.lifecycle='active' AND u.credential_epoch=j.owner_epoch").bind(job.id,claim,job.stage_version,now).first();if(!owned)throw new LeaseLost('The job lease or account changed.');}
async function removeRevokedStaging(env:JobEnv,job:Job,now:number){
 const current=await readJob(env,job.id);if(await validOwner(env,job)&&current&&!['failed','canceled','held'].includes(current.status))return;
 // A slow R2 put may return after a deletion sweep. Reopen the manifest's
 // deletion state before attempting cleanup so a failed delete remains durable.
 const asset=await db(env).prepare("SELECT art_key FROM hb_assets WHERE id=? AND state IN ('staged','deleting','deleted')").bind(job.id).first<{art_key:string}>();if(!asset)return;
 await db(env).prepare("UPDATE hb_assets SET state='deleting',updated_at=? WHERE id=? AND state IN ('staged','deleting','deleted')").bind(now,job.id).run();
 try{await env.BUCKET?.delete(asset.art_key);if(env.BUCKET)await db(env).prepare("UPDATE hb_assets SET state='deleted',updated_at=? WHERE id=? AND state='deleting'").bind(now,job.id).run();}catch{/* Scheduled manifest cleanup retries this private object. */}
}
async function reconcileKnownOperations(env:JobEnv,job:Job,now:number){
 if(job.direction)await settleProviderOperation(env,`${job.id}:director`,'succeeded',now);
 if(['asset_stored','ready','done'].includes(job.status))await settleProviderOperation(env,`${job.id}:image`,'succeeded',now);
 if(job.status==='held'){await settleUsage(env,job.id,'release',now);const nextAt=job.result?Number(JSON.parse(job.result).nextAt):0;if(Number.isFinite(nextAt))await db(env).prepare('UPDATE ai_sessions SET next_at=MAX(next_at,?) WHERE id=?').bind(nextAt,job.owner).run();}
 if(['failed','canceled','outcome_unknown'].includes(job.status)){
  const unresolved=await db(env).prepare("SELECT id FROM hb_provider_operations WHERE job_id=? AND state IN ('submitted','unknown')").bind(job.id).all<{id:string}>();
  const operatorSettled=job.status==='failed'&&job.error_category==='operator_settled';
  if(job.status!=='outcome_unknown'&&(!unresolved.results.length||operatorSettled))await settleUsage(env,job.id,'release',now);
  const unused=await db(env).prepare("SELECT id FROM hb_provider_operations WHERE job_id=? AND state='reserved'").bind(job.id).all<{id:string}>();for(const operation of unused.results)await settleProviderOperation(env,operation.id,'failed',now,'unsubmitted_released');
  if(operatorSettled){for(const operation of unresolved.results)await settleProviderOperation(env,operation.id,'failed',now,'operator_conservative_settlement');}
  else if(['canceled','outcome_unknown'].includes(job.status)){for(const operation of unresolved.results)await settleProviderOperation(env,operation.id,'unknown',now,'account_revoked');if(job.status==='canceled'&&unresolved.results.length)await db(env).prepare("UPDATE hb_jobs SET status='outcome_unknown',error_category='revoked_unknown',result=? WHERE id=? AND status='canceled'").bind(JSON.stringify({status:'failed',jobState:'outcome_unknown',reason:'Account access changed during provider work. The outcome needs reconciliation.'}),job.id).run();}
 }
}
async function candidateFor(env:JobEnv,job:Job){
 const saved=await db(env).prepare('SELECT candidate FROM ai_attempts WHERE id=? AND owner=? AND candidate IS NOT NULL').bind(job.id,job.owner).first<{candidate:string}>();if(saved)return JSON.parse(saved.candidate) as AICandidate;
 const c=JSON.parse(job.context!),d=JSON.parse(job.direction!),themes=d.themeIds.map((id:string)=>THEME_LIBRARY.find(t=>t.id===id)).filter(Boolean);
 const fingerprint=themes.filter((t:{category:string})=>['place','subject','activity','viewpoint'].includes(t.category)).map((t:{id:string})=>t.id).sort().join('|')||`invented-${job.id}`;
 const proposal:CreativeProposal={...c.packet.inspiration[0],source:'ai-director',id:`idea-${job.id}`,fingerprint,title:d.title,prompt:d.prompt,themes:themes.map(({id,label,category}:{id:string;label:string;category:CreativeProposal['themes'][number]['category']})=>({id,label,category})),lighting:d.lighting};
 const input=JSON.parse(job.input);return {id:job.id,requestId:job.request_id,worldId:job.world_id,surfaceId:job.surface_id,preferencesVersion:input.preferencesVersion,locationKey:c.baseline.locationKey,createdAt:job.created_at,direction:{...c.baseline,id:`generated-${job.id}`,reason:d.reason,artwork:{attemptId:job.id,url:`/api/ai/art/${job.id}`,title:d.title,proposal}}};
}
export async function advanceArtworkJob(env:JobEnv,jobId:string,deps:Dependencies={}){
 const now=deps.now||Date.now,at=now(),database=db(env);const job=await readJob(env,jobId);if(!job)return {completed:true};
 const recoverUnknown=job.status==='outcome_unknown'&&!!await storedAsset(env,job);
 if(terminal.has(job.status)&&!(job.status==='ready'&&!job.result)&&!recoverUnknown){
  await reconcileKnownOperations(env,job,at);if(['ready','done'].includes(job.status))await settleUsage(env,job.id,'commit',at);
  return {completed:true};
 }
 const user=await validOwner(env,job);if(!user){const canceled=await database.prepare("UPDATE hb_jobs SET status='canceled',result=?,updated_at=?,lease=NULL,lease_until=0,stage_version=stage_version+1 WHERE id=? AND stage_version=? AND NOT EXISTS(SELECT 1 FROM hb_users WHERE id=hb_jobs.owner AND lifecycle='active' AND credential_epoch=hb_jobs.owner_epoch)").bind(JSON.stringify({status:'failed',reason:'Account access changed.'}),at,job.id,job.stage_version).run();if(canceled.meta.changes)await reconcileKnownOperations(env,{...job,status:'canceled'},at);return {completed:true};}
 if(job.lease_until>at)return {completed:false,waiting:true};
 const submitted=await database.prepare("SELECT id FROM hb_provider_operations WHERE job_id=? AND state IN ('submitted','unknown')").bind(job.id).first();
 if(job.deadline&&job.deadline<at&&!submitted&&!['asset_stored','ready'].includes(job.status)){const expired=await database.prepare("UPDATE hb_jobs SET status='failed',error_category='queue_expired',result=?,stage_version=stage_version+1 WHERE id=? AND stage_version=? AND lease_until<=?").bind(JSON.stringify({status:'failed',reason:'The queued picture expired safely. Request a new moment.'}),job.id,job.stage_version,at).run();if(expired.meta.changes)await reconcileKnownOperations(env,{...job,status:'failed'},at);return {completed:true};}
 const claim=crypto.randomUUID(),claimed=await database.prepare("UPDATE hb_jobs SET lease=?,lease_until=?,stage_attempts=stage_attempts+1 WHERE id=? AND stage_version=? AND lease_until<=? AND EXISTS(SELECT 1 FROM hb_users WHERE id=hb_jobs.owner AND lifecycle='active' AND credential_epoch=hb_jobs.owner_epoch)").bind(claim,at+240000,job.id,job.stage_version,at).run();if(!claimed.meta.changes)return {completed:false,waiting:true};
 const input=JSON.parse(job.input),models=providerModels(env),provider=()=> (deps.provider||cloudflareProvider)({accountId:env.CLOUDFLARE_ACCOUNT_ID!,apiToken:env.CLOUDFLARE_API_TOKEN!,directorModel:models.director,imageModel:models.image});
 try{
  // The image/credit writes may have committed before the final job receipt.
  // Recovery takes the same lease as every other transition and validates bytes.
  const ready=await database.prepare("SELECT candidate FROM ai_attempts WHERE id=? AND owner=? AND art_key IS NOT NULL AND status IN ('ready','displayed')").bind(job.id,job.owner).first<{candidate:string}>();
  if(ready){if(!await storedAsset(env,job))throw new ProductError('Stored artwork needs repair.',503);await reconcileKnownOperations(env,{...job,status:'ready'},now());await settleUsage(env,job.id,'commit',now());await transition(env,job,claim,'ready',{result:JSON.stringify({status:'ready',candidate:JSON.parse(ready.candidate)})},now());return {completed:true};}
  if(recoverUnknown){await settleProviderOperation(env,`${job.id}:image`,'succeeded',now());await transition(env,job,claim,'asset_stored',{},now());return {completed:false};}
  if(job.status==='accepted'){
   if(!input.worldId||!input.surfaceId){const canonical=await resolveArtworkInput(env,job.owner,{},at);Object.assign(input,canonical);job.world_id=canonical.worldId;job.surface_id=canonical.surfaceId;const body=JSON.stringify(input);await database.prepare('UPDATE hb_jobs SET input=?,input_hash=?,world_id=?,surface_id=? WHERE id=? AND lease=? AND stage_version=?').bind(body,await hash(body),canonical.worldId,canonical.surfaceId,job.id,claim,job.stage_version).run();}
   const ownReservation=await database.prepare('SELECT job_id,state FROM hb_usage_reservations WHERE job_id=?').bind(job.id).first<{job_id:string;state:string}>();
   const a=await accessFor({user,expires:at+86400000},env,at,localJobDevelopment(env));
   if(!a.eligible&&!ownReservation)throw new ProductError(a.reason,403);
   const cadence=await database.prepare('SELECT next_at FROM ai_sessions WHERE id=?').bind(job.owner).first<{next_at:number}>();if(cadence&&cadence.next_at>at&&!ownReservation)throw new ProductError('Your next picture is queued until its cadence.',429);
   await database.prepare('INSERT OR IGNORE INTO ai_sessions(id,expires) VALUES (?,?)').bind(job.owner,at+30*86400000).run();
   await reserveUsage(env,job.id,a,at);
   if(!ownReservation)await database.prepare('UPDATE ai_sessions SET next_at=? WHERE id=?').bind(at+a.cadence,job.owner).run();await transition(env,job,claim,'reserved',{},now());
  }else if(job.status==='reserved'){
   let context:Context|null;
   try{context=await (deps.context?deps.context(input.location):createWeatherAdapter(env,{now}).collect(input.location));}catch(error){if(!(error instanceof WeatherUnavailableError))throw error;context=null;console.warn('Heartbeat generation proceeding without weather',{jobId:job.id,category:error.category,status:error.status});}
   await boundary(deps,'context_read');
   const memory=parseStoryMemory(input.memory,input.location,at),baseline=planMoment(input.location,context,at,memory,at,{force:true,festive:input.festive}).direction;
   const packet=withScreenFraming(creativePacket({phase:baseline.phase,season:baseline.season,temperature:baseline.brief.temperature,weekday:baseline.brief.weekday,festive:baseline.recipe.festive,localDate:baseline.recipe.date,localTime:localClock(input.location,at).time,weather:weatherCue(context,at),preferredStyle:input.style},memory?.creative,at,at,memory?.history.map(h=>h.direction.scene)||[],memory?.history.map(h=>({title:h.direction.artwork?.title||h.direction.scene,summary:h.direction.artwork?.proposal.prompt||h.direction.brief.activity,phase:h.direction.phase}))||[]),input.framing);
   await transition(env,job,claim,'context_ready',{context:JSON.stringify({snapshot:context,baseline,packet,versions:{schema:1,prompt:2,validation:1,preferences:input.preferencesVersion,memory:input.memoryVersion,surface:input.surfaceVersion,models},capturedAt:at})},now());
  }else if(job.status==='context_ready'){
   const operation=await reserveProviderOperation(env,job.id,'director',models.director,at);if(operation.state!=='reserved')throw new Error('unknown_provider_operation');
   await reserveOperatingAttempt(env,job.id,at);
   await database.prepare("INSERT OR IGNORE INTO ai_attempts(id,owner,request_id,claim,day,status,location_key,created_at) VALUES (?,?,?,?,?,'directing',?,?)").bind(job.id,job.owner,job.request_id,claim,new Date(at).toISOString().slice(0,10),`${input.location.latitude},${input.location.longitude}:${input.location.timezone}`,job.created_at).run();
   await boundary(deps,'before_director_submit');await submitProviderOperation(env,operation.id,job.id,claim,job.stage_version,now());
   await boundary(deps,'before_director');const c=JSON.parse(job.context!),direction=await provider().direct(c.packet,{signal:AbortSignal.timeout(180000),mustReimagine:input.force||!input.memory});await boundary(deps,'after_director');
   await transition(env,job,claim,direction.action==='HOLD'?'held':'directed',{direction:JSON.stringify(direction),...(direction.action==='HOLD'?{result:JSON.stringify({status:'held',reason:'The director kept this moment.',nextAt:at+3600000})}:{})},now());
   await settleProviderOperation(env,operation.id,'succeeded',now());if(direction.action==='HOLD'){await settleUsage(env,job.id,'release',now());await database.prepare("UPDATE ai_attempts SET status='held' WHERE id=?").bind(job.id).run();}
  }else if(job.status==='directed'){
   await reconcileKnownOperations(env,job,at);
   await reserveProviderOperation(env,job.id,'image',models.image,at);await transition(env,job,claim,'provider_submitted',{},at);
  }else if(job.status==='provider_submitted'){
   const asset=await storedAsset(env,job);
   if(asset){await settleProviderOperation(env,`${job.id}:image`,'succeeded',now());await transition(env,job,claim,'asset_stored',{},now());}
   else{
    const operation=await database.prepare('SELECT state FROM hb_provider_operations WHERE id=?').bind(`${job.id}:image`).first<{state:string}>();if(operation?.state!=='reserved')throw new Error('unknown_provider_operation');
    await boundary(deps,'before_image_submit');await submitProviderOperation(env,`${job.id}:image`,job.id,claim,job.stage_version,now());
    await boundary(deps,'before_image');const c=JSON.parse(job.context!),image=await provider().generate(JSON.parse(job.direction!),c.packet,AbortSignal.timeout(180000));await boundary(deps,'after_image');
    const imageHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',image.bytes as BufferSource)),v=>v.toString(16).padStart(2,'0')).join('');
    if(await database.prepare("SELECT id FROM hb_assets WHERE owner=? AND image_hash=? AND state='ready' AND id!=?").bind(job.owner,imageHash,job.id).first())throw new ProviderFailure('invalid-output',false);
    await assertLease(env,job,claim,now());
    const key=`heartbeat-ai/${job.owner}/${job.id}.jpg`;
    await database.prepare("INSERT OR IGNORE INTO hb_assets(id,job_id,owner,world_id,surface_id,art_key,image_hash,mime,width,height,validation_version,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,'staged',?,?)").bind(job.id,job.id,job.owner,job.world_id,job.surface_id,key,imageHash,image.mime,image.width,image.height,at,at).run();
    await boundary(deps,'asset_manifest');await env.BUCKET!.put(key,image.bytes,{httpMetadata:{contentType:'image/jpeg'},customMetadata:{assetId:job.id,owner:job.owner,validationVersion:'1',sha256:imageHash}});await boundary(deps,'asset_put');
    await transition(env,job,claim,'asset_stored',{},now());await settleProviderOperation(env,`${job.id}:image`,'succeeded',now());
   }
  }else if(job.status==='asset_stored'){
   const asset=await storedAsset(env,job);if(!asset)throw new ProductError('Stored artwork needs repair.',503);
   await reconcileKnownOperations(env,job,now());
   const candidate=await candidateFor(env,job);
   const commit=await database.batch([
    database.prepare("UPDATE ai_attempts SET status='ready',candidate=?,art_key=?,image_hash=? WHERE id=? AND EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='active' AND credential_epoch=?) AND EXISTS(SELECT 1 FROM hb_jobs WHERE id=? AND lease=? AND stage_version=? AND lease_until>?)").bind(JSON.stringify(candidate),asset.art_key,asset.image_hash,job.id,job.owner,job.owner_epoch,job.id,claim,job.stage_version,now()),
    database.prepare("UPDATE hb_assets SET state='ready',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM ai_attempts WHERE id=? AND status='ready') AND EXISTS(SELECT 1 FROM hb_jobs WHERE id=? AND lease=? AND stage_version=? AND lease_until>?)").bind(now(),job.id,job.id,job.id,claim,job.stage_version,now()),
   ]);if(!commit[0].meta.changes)throw new ProductError('The account or job changed before completion.',409);
   await boundary(deps,'ready_write');await settleUsage(env,job.id,'commit',now());await boundary(deps,'usage_commit');await transition(env,job,claim,'ready',{result:JSON.stringify({status:'ready',candidate,nextAt:at+600000})},now());
  }
  return {completed:terminal.has((await readJob(env,job.id))!.status)};
 }catch(error){
  if(error instanceof InjectedCrash){await database.prepare('UPDATE hb_jobs SET lease_until=0,lease=NULL WHERE id=? AND lease=?').bind(job.id,claim).run();throw error;}
  if(error instanceof LeaseLost){await removeRevokedStaging(env,job,now());return {completed:false,waiting:true};}
  // A stale executor must not settle or fail a stage now owned by another worker.
  try{await assertLease(env,job,claim,now());}catch{await removeRevokedStaging(env,job,now());return {completed:false,waiting:true};}
  const operations=await database.prepare("SELECT id,state FROM hb_provider_operations WHERE job_id=? AND state='submitted'").bind(job.id).all<{id:string;state:string}>();
  const ambiguous=operations.results.length>0&&!(error instanceof ProviderFailure)||String(error).includes('unknown_provider_operation');
  if(error instanceof ProductError&&[429,503].includes(error.status)&&!operations.results.length){await database.prepare('UPDATE hb_jobs SET lease=NULL,lease_until=0,error_category=?,updated_at=? WHERE id=? AND lease=?').bind(error.status===429?'queued_capacity':'dependency_unavailable',at,job.id,claim).run();return {completed:false,waiting:true};}
  if(error instanceof ProviderFailure)console.warn('Heartbeat artwork provider rejected',{jobId:job.id,stage:job.status,category:error.kind,status:error.status,code:error.code,hints:error.hints});
  for(const op of operations.results)await settleProviderOperation(env,op.id,ambiguous?'unknown':'failed',now(),error instanceof ProviderFailure?error.kind:'interrupted');
  if(!ambiguous)await settleUsage(env,job.id,'release',now());
  const state=ambiguous?'outcome_unknown':'failed';await transition(env,job,claim,state,{error:state,result:JSON.stringify({status:'failed',jobState:state,reason:ambiguous?'The provider outcome is unknown. No automatic repeat will be made.':'This picture could not be prepared. Your current artwork is kept.'})},now());
  if(!ambiguous)await reconcileKnownOperations(env,{...job,status:'failed'},now());
  if(!ambiguous)await database.prepare("UPDATE ai_attempts SET status='failed',error='preparation_failed' WHERE id=? AND status NOT IN ('ready','displayed')").bind(job.id).run();
  return {completed:true};
 }
}
export async function runArtworkJob(env:JobEnv,id:string,deps:Dependencies={}){for(let i=0;i<12;i++){const r=await advanceArtworkJob(env,id,deps);if(r.completed||r.waiting)return r;}return {completed:false};}
export async function repairArtworkJobs(env:JobEnv,now=Date.now(),limit=20,jobId?:string){
 const rows=await db(env).prepare("SELECT id FROM hb_jobs WHERE (status NOT IN ('ready','done','held','failed','canceled') OR (status='ready' AND result IS NULL) OR (status='failed' AND error_category='operator_settled' AND (EXISTS(SELECT 1 FROM hb_provider_operations WHERE job_id=hb_jobs.id AND state IN ('reserved','submitted','unknown')) OR EXISTS(SELECT 1 FROM hb_usage_reservations WHERE job_id=hb_jobs.id AND state='reserved')))) AND lease_until<=? AND (? IS NULL OR id=?) ORDER BY updated_at LIMIT ?").bind(now,jobId||null,jobId||null,Math.min(limit,100)).all<{id:string}>();let repaired=0;
 for(const row of rows.results){const job=await readJob(env,row.id);if(!job)continue;
  if(job.status==='failed'&&job.error_category==='operator_settled'){await reconcileKnownOperations(env,job,now);repaired++;continue;}
  const saved=await db(env).prepare("SELECT candidate FROM ai_attempts WHERE owner=? AND request_id=? AND art_key IS NOT NULL AND status IN ('ready','displayed')").bind(job.owner,job.request_id).first();
  const staged=await storedAsset(env,job);
  if(saved||staged){await runArtworkJob(env,job.id,{now:()=>now});repaired++;}
  else if(job.status==='outcome_unknown')continue;
  else if(['provider_submitted','context_ready'].includes(job.status)&&await db(env).prepare("SELECT id FROM hb_provider_operations WHERE job_id=? AND state='submitted'").bind(job.id).first()){await advanceArtworkJob(env,job.id,{now:()=>now});repaired++;}
  else if(!terminal.has(job.status)&&job.updated_at<=now-60000)await db(env).prepare("UPDATE hb_artwork_outbox SET state='retry',next_attempt_at=?,updated_at=? WHERE job_id=? AND next_attempt_at<=?").bind(now,now,job.id,now).run();
 }
 return {repaired};
}
export async function settleUnknownArtworkJob(env:JobEnv,input:{jobId:string;actor:string;reason:string;now?:number}){
 if(!input.actor.trim()||input.actor.length>100||input.reason.trim().length<8)throw new ProductError('An operator and explanation are required.');const now=input.now??Date.now(),job=await readJob(env,input.jobId);if(job?.status!=='outcome_unknown')throw new ProductError('Only unknown work can be settled.',409);
 // Persist the terminal decision before releasing either ledger. A concurrent
 // stored-asset recovery must lose this same stage/lease comparison, and a crash
 // after the decision can finish settlement through bounded maintenance.
 const claim=crypto.randomUUID(),database=db(env),settled=await database.batch([
  database.prepare("UPDATE hb_jobs SET status='failed',result=?,error_category='operator_settled',updated_at=?,stage_version=stage_version+1,lease=?,lease_until=0 WHERE id=? AND status='outcome_unknown' AND stage_version=? AND lease_until<=?").bind(JSON.stringify({status:'failed',reason:'The interrupted work was settled without another inference call.'}),now,claim,job.id,job.stage_version,now),
  database.prepare("INSERT INTO hb_operator_audit(id,actor,action,target,reason,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM hb_jobs WHERE id=? AND lease=? AND stage_version=? AND error_category='operator_settled')").bind(crypto.randomUUID(),input.actor,'settle_unknown',job.id,input.reason,now,job.id,claim,job.stage_version+1),
 ]);
 if(!settled[0].meta.changes)throw new ProductError('Unknown work changed or is being recovered. Try again after its lease expires.',409);
 await reconcileKnownOperations(env,{...job,status:'failed',error_category:'operator_settled'},now);
 await database.prepare("UPDATE hb_jobs SET lease=NULL WHERE id=? AND lease=? AND error_category='operator_settled'").bind(job.id,claim).run();
}
export async function generation(request:Request,env:JobEnv,user:User,input:Record<string,unknown>|null,now:number,_override?:AccountAccess){
 // Older callers supply an access snapshot; generation always checks current
 // server state instead of trusting a caller-supplied entitlement override.
 void _override;
 if(input){const job=await acceptArtworkRequest(env,user,input,now);return json(await presentationResult(env,job,now),terminal.has(job.status)?200:202,{'Retry-After':'5'});}
 const u=new URL(request.url),id=u.searchParams.get('requestId');
 const job=id?await db(env).prepare('SELECT * FROM hb_jobs WHERE owner=? AND request_id=?').bind(user.id,id).first<Job>():await db(env).prepare('SELECT * FROM hb_jobs WHERE owner=? AND (? IS NULL OR surface_id=?) ORDER BY created_at DESC LIMIT 1').bind(user.id,u.searchParams.get('surfaceId'),u.searchParams.get('surfaceId')).first<Job>();
 if(!job){if(!id)return json({status:'idle'});throw new ProductError('Picture request not found.',404);}
 await repairArtworkJobs(env,now,1,job.id);return json(await presentationResult(env,(await readJob(env,job.id))!,now),200,{'Retry-After':'5'});
}
async function presentationResult(env:JobEnv,job:Job,now:number){
 const value=result(job,now);if(value.status!=='ready')return value;
 if(job.world_id){const world=await db(env).prepare('SELECT preferences_version FROM hb_worlds WHERE id=? AND owner_id=?').bind(job.world_id,job.owner).first<{preferences_version:number}>();const input=JSON.parse(job.input);if(!world||world.preferences_version!==input.preferencesVersion)return {status:'held',jobState:'stale',jobId:job.id,requestId:job.request_id,reason:'Your preferences changed while this picture was prepared. It stays in your library.',nextAt:now+600000};}
 return value;
}
