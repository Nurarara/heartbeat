import { accessFor } from './access.ts';
import type { User } from './auth.ts';
import { db, hash, json, localDevelopment, ProductError, randomToken, rate } from './core.ts';
import { generation, type JobEnv } from './jobs.ts';
export async function deviceRoute(request:Request,env:JobEnv,path:string,now:number):Promise<Response|null> {
 if(path==='device/start'&&request.method==='POST') {
  await rate(env,`device-start:${request.headers.get('cf-connecting-ip')||'local'}`,now,10);
  for(let tries=0;tries<4;tries++) {
   const id=crypto.randomUUID(),secret=randomToken(),code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
   try {await db(env).prepare('INSERT INTO hb_devices(id,secret_hash,code_hash,expires,created_at) VALUES (?,?,?,?,?)').bind(id,await hash(secret),await hash(code),now+10*60000,now).run();return json({deviceId:id,token:secret,code,expiresAt:now+10*60000});}catch{if(tries===3)throw new ProductError('Pairing could not start. Try again shortly.',503);}
  }
 }
 if(!['device/status','device/refresh'].includes(path)&&!path.startsWith('device/art/'))return null;
 const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)throw new ProductError('Pair this desktop again.',401);
 const device=await db(env).prepare('SELECT id,owner,expires FROM hb_devices WHERE secret_hash=? AND expires>?').bind(await hash(token),now).first<{id:string;owner:string|null;expires:number}>();if(!device)throw new ProductError('Pairing expired or the device was disconnected.',401);
 if(!device.owner)return json({paired:false});
 const user=await db(env).prepare('SELECT * FROM hb_users WHERE id=?').bind(device.owner).first<User>();if(!user)throw new ProductError('The account is unavailable.',401);
 if(path==='device/refresh'&&request.method==='POST') {
  await rate(env,`device-refresh:${user.id}`,now,4,60000);
  const profile=await db(env).prepare('SELECT preferences,memory FROM hb_profiles WHERE user_id=?').bind(user.id).first<{preferences:string;memory:string|null}>();if(!profile?.preferences)throw new ProductError('Choose a city in your studio first.',409);
  const preferences=JSON.parse(profile.preferences),access=await accessFor({user,expires:device.expires},env,now,localDevelopment(request,env));
  const requestId=await hash(`${user.id}:${Math.floor(now/600000)}`),uuid=`${requestId.slice(0,8)}-${requestId.slice(8,12)}-${requestId.slice(12,16)}-${requestId.slice(16,20)}-${requestId.slice(20,32)}`;
  return generation(request,env,user,{requestId:uuid,location:preferences.location,memory:profile.memory,festive:preferences.festiveTouches===true,force:!profile.memory},now,access);
 }
 if(path.startsWith('device/art/')&&request.method==='GET') {
  const id=path.slice('device/art/'.length);if(!/^[a-f0-9-]{36}$/.test(id))throw new ProductError('Picture not found.',404);
  const row=await db(env).prepare("SELECT art_key FROM ai_attempts WHERE id=? AND owner=? AND art_key IS NOT NULL AND status IN ('ready','displayed')").bind(id,user.id).first<{art_key:string}>();if(!row)throw new ProductError('Picture not found.',404);
  const art=await env.BUCKET?.get(row.art_key);if(!art)throw new ProductError('Picture not found.',404);
  return new Response(art.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(path==='device/status'&&request.method==='GET') {
  const result=await db(env).prepare("SELECT id,candidate FROM ai_attempts WHERE owner=? AND art_key IS NOT NULL AND status IN ('ready','displayed') ORDER BY created_at DESC LIMIT 1").bind(user.id).first<{id:string;candidate:string}>();
  const candidate=result?JSON.parse(result.candidate):null;
  return json({paired:true,picture:result?{id:result.id,title:candidate.direction.artwork.title,url:`/api/product/device/art/${result.id}`,phase:candidate.direction.phase}:null});
 }
 throw new ProductError('Device action not found.',404);
}
