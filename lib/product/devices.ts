import { accessFor } from './access.ts';
import type { User } from './auth.ts';
import { db, hash, json, localDevelopment, ProductError, randomToken, rate,readJSON } from './core.ts';
import {profileFor,presentationPolicy,acknowledgeDisplay} from './profiles.ts';
import {trustedActor} from './auth.ts';
import { generation, type JobEnv } from './jobs.ts';
export async function deviceRoute(request:Request,env:JobEnv,path:string,now:number):Promise<Response|null> {
 if(path==='device/start'&&request.method==='POST') {
  await rate(env,'device-start:global',now,100,60000);await rate(env,`device-start:${trustedActor(request,env)}`,now,10);
  const input=await readJSON(request,1024),name=typeof input.name==='string'?input.name.trim().slice(0,60):'Windows companion';if(!name||/[\u0000-\u001f]/.test(name))throw new ProductError('Choose a valid device name.');
  await db(env).prepare("DELETE FROM hb_devices WHERE owner IS NULL AND expires<=?").bind(now).run();
  for(let tries=0;tries<4;tries++) {
   const id=crypto.randomUUID(),secret=randomToken(),code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
   try {await db(env).prepare('INSERT INTO hb_devices(id,secret_hash,code_hash,expires,created_at,name) VALUES (?,?,?,?,?,?)').bind(id,await hash(secret),await hash(code),now+10*60000,now,name).run();return json({deviceId:id,token:secret,code,name,expiresAt:now+10*60000});}catch{if(tries===3)throw new ProductError('Pairing could not start. Try again shortly.',503);}
  }
 }
 if(!['device/status','device/refresh','device/display','device/disconnect'].includes(path)&&!path.startsWith('device/art/'))return null;
 const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)throw new ProductError('Pair this desktop again.',401);
 const device=await db(env).prepare('SELECT id,owner,expires,surface_id,credential_epoch FROM hb_devices WHERE secret_hash=? AND expires>?').bind(await hash(token),now).first<{id:string;owner:string|null;expires:number;surface_id:string|null;credential_epoch:number}>();if(!device)throw new ProductError('Pairing expired or the device was disconnected.',401);
 if(!device.owner)return json({paired:false});
 const user=await db(env).prepare("SELECT * FROM hb_users WHERE id=? AND lifecycle='active' AND credential_epoch=?").bind(device.owner,device.credential_epoch).first<User>();if(!user)throw new ProductError('The account is unavailable. Pair again.',401);
 if(path==='device/disconnect'&&request.method==='POST'){await db(env).prepare('DELETE FROM hb_devices WHERE id=?').bind(device.id).run();return json({disconnected:true});}
 const profile=await profileFor(env,user.id,device.surface_id?{surfaceId:device.surface_id}:{},now);
 if(path==='device/display'&&request.method==='POST')return json(await acknowledgeDisplay(env,user.id,{...await readJSON(request,2048),surfaceId:profile.surfaceId},now));
 if(path==='device/refresh'&&request.method==='POST') {
  await rate(env,`device-refresh:${user.id}`,now,4,60000);
  if(!profile.preferences)throw new ProductError('Choose a city in your studio first.',409);
  const access=await accessFor({user,expires:device.expires},env,now,localDevelopment(request,env));
  const requestId=await hash(`${user.id}:${Math.floor(now/600000)}`),uuid=`${requestId.slice(0,8)}-${requestId.slice(8,12)}-${requestId.slice(12,16)}-${requestId.slice(16,20)}-${requestId.slice(20,32)}`;
  return generation(request,env,user,{requestId:uuid,surfaceId:profile.surfaceId,force:!profile.memory},now,access);
 }
 if(path.startsWith('device/art/')&&request.method==='GET') {
  const id=path.slice('device/art/'.length);if(!/^[a-f0-9-]{36}$/.test(id))throw new ProductError('Picture not found.',404);
  const row=await db(env).prepare("SELECT a.art_key FROM ai_attempts a JOIN hb_assets m ON m.id=a.id AND m.owner=a.owner AND m.art_key=a.art_key AND m.state='ready' WHERE a.id=? AND a.owner=? AND a.art_key IS NOT NULL AND a.status IN ('ready','displayed')").bind(id,user.id).first<{art_key:string}>();if(!row)throw new ProductError('Picture not found.',404);
  const art=await env.BUCKET?.get(row.art_key);if(!art)throw new ProductError('Picture not found.',404);
  return new Response(art.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(path==='device/status'&&request.method==='GET') {
  const result=await db(env).prepare("SELECT a.id,a.candidate FROM ai_attempts a JOIN hb_assets m ON m.id=a.id AND m.owner=a.owner AND m.art_key=a.art_key AND m.state='ready' LEFT JOIN hb_jobs j ON j.owner=a.owner AND j.request_id=a.request_id WHERE a.owner=? AND a.art_key IS NOT NULL AND a.status IN ('ready','displayed') AND (j.surface_id=? OR j.surface_id IS NULL) ORDER BY a.created_at DESC LIMIT 1").bind(user.id,profile.surfaceId).first<{id:string;candidate:string}>();
  const candidate=result?JSON.parse(result.candidate):null;
  return json({paired:true,accountId:user.id,worldId:profile.worldId,surfaceId:profile.surfaceId,policy:profile.preferences?presentationPolicy(profile.preferences,profile.surface,now):null,picture:result?{id:result.id,title:candidate.direction.artwork.title,url:`/api/product/device/art/${result.id}`,phase:candidate.direction.phase}:null});
 }
 throw new ProductError('Device action not found.',404);
}
