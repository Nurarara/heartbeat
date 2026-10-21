import { aiService, type AIEnvironment } from '../ai/service.ts';
import { accessFor } from './access.ts';
import { db, json, ProductError, type ProductEnv } from './core.ts';
import type { User } from './auth.ts';
import type { AccountAccess } from './access.ts';
type Job = {id:string;owner:string;request_id:string;input:string;status:string;result:string|null;created_at:number};
export type JobEnv = ProductEnv & AIEnvironment;
export async function runArtworkJob(env:JobEnv,jobId:string,dependencies:Parameters<typeof aiService>[1]={}) {
  const now=dependencies.now||Date.now;
  const job=await db(env).prepare('SELECT * FROM hb_jobs WHERE id=?').bind(jobId).first<Job>();
  if(!job||job.status!=='queued')return {completed:false};
  const claim=await db(env).prepare("UPDATE hb_jobs SET status='running',updated_at=? WHERE id=? AND status='queued'").bind(Date.now(),jobId).run();
  if(claim.meta.changes!==1)return {completed:false};
  try {
    const user=await db(env).prepare('SELECT * FROM hb_users WHERE id=?').bind(job.owner).first<User>();
    if(!user)throw new Error('Account no longer exists');
    const origin=env.HEARTBEAT_APP_ORIGIN||'http://localhost:5173';
    const local=env.HEARTBEAT_APP_MODE==='development'&&['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname);
    const response=await aiService(env,{...dependencies,account:async()=>accessFor({user,expires:now()+86400000},env,now(),local)}).handle(new Request(`${origin}/api/ai/prepare`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:job.input}));
    const result=await response.json();
    await db(env).prepare('UPDATE hb_jobs SET status=?,result=?,updated_at=? WHERE id=? AND owner=?').bind('done',JSON.stringify(result),Date.now(),jobId,job.owner).run();
    return {completed:true};
  } catch {
    await db(env).prepare("UPDATE hb_jobs SET status='failed',result=?,updated_at=? WHERE id=? AND owner=?").bind(JSON.stringify({status:'failed',reason:'This picture could not be prepared. Your current artwork is kept.'}),Date.now(),jobId,job.owner).run();
    return {completed:false};
  }
}
export async function generation(request:Request,env:JobEnv,user:User,input:Record<string,unknown>|null,now:number,override?:AccountAccess) {
  const id=input?.requestId||new URL(request.url).searchParams.get('requestId');
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new ProductError('Invalid picture request.');
  const prior=await db(env).prepare('SELECT * FROM hb_jobs WHERE owner=? AND request_id=?').bind(user.id,id).first<Job>();
  if(prior) {
    if(prior.result)return json(JSON.parse(prior.result));
    if(now-prior.created_at>6*60000)return json({status:'failed',reason:'The background job was interrupted. It will not be charged again automatically.'});
    return json({status:'pending',nextAt:now+5000});
  }
  if(!input)throw new ProductError('Picture request not found.',404);
  const status=await (await aiService(env,override?{account:async()=>override}:{}).handle(new Request(`${new URL(request.url).origin}/api/ai/status`,{headers:request.headers}))).json() as {available?:boolean;reason?:string};
  if(!status.available)return json({status:'held',reason:status.reason||'Generation is unavailable.',nextAt:now+600000},429);
  if(!env.ARTWORK_WORKFLOW)throw new ProductError('Background generation is not configured yet. Free artwork is available.',503);
  const jobId=crypto.randomUUID();
  await db(env).prepare('INSERT OR IGNORE INTO hb_jobs(id,owner,request_id,input,status,created_at,updated_at) VALUES (?,?,?,?,\'queued\',?,?)').bind(jobId,user.id,id,JSON.stringify(input),now,now).run();
  const stored=await db(env).prepare('SELECT id FROM hb_jobs WHERE owner=? AND request_id=?').bind(user.id,id).first<{id:string}>();
  if(stored?.id===jobId) {
    try {await env.ARTWORK_WORKFLOW.create({id:jobId,params:{jobId}});}
    catch {try {await env.ARTWORK_WORKFLOW.get(jobId).then(instance=>instance.status());}catch {await db(env).prepare("UPDATE hb_jobs SET status='failed',result=? WHERE id=? AND status='queued'").bind(JSON.stringify({status:'failed',reason:'Background generation could not start. Please try again later.'}),jobId).run();throw new ProductError('Background generation could not start.',503);}}
  }
  return json({status:'pending',nextAt:now+5000},202);
}
