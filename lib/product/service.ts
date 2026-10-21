import { authenticate, authRate, email, password, passwordHash, passwordMatches, publicUser, requireAuth, revoke, sendToken, session, type User } from './auth.ts';
import { accessFor } from './access.ts';
import { billingReady, checkout, portal, webhook, priceCatalog } from './billing.ts';
import { checkOrigin, db, hash, json, localDevelopment, PLANS, ProductError, randomToken, rate, readJSON } from './core.ts';
import { generation, type JobEnv } from './jobs.ts';
import { parsePreferences } from '../ambient.ts';
import { parseStoryMemory } from '../ambient-director.ts';
import { deviceRoute } from './devices.ts';

export function productService(env:JobEnv,deps:{now?:()=>number;fetcher?:typeof fetch}={}) {
 const clock=deps.now||Date.now,fetcher=deps.fetcher||fetch;
 async function handle(request:Request):Promise<Response> {
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/product\/?/,'');const now=clock();
  try {
   if(path==='webhook'&&request.method==='POST')return await webhook(request,env,now,fetcher);
   if(request.method!=='GET')checkOrigin(request,env);
   if(path.startsWith('device/')&&!['device/approve','device/revoke'].includes(path)) {const device=await deviceRoute(request,env,path,now);if(device)return device;}
   if(path==='plans'&&request.method==='GET') {if(billingReady(env))await rate(env,`prices:${request.headers.get('cf-connecting-ip')||'local'}`,now,20,60000);return json({plans:Object.values(PLANS),billingReady:billingReady(env),prices:await priceCatalog(env,fetcher)});}
   if(path==='auth/session'&&request.method==='GET') {const auth=await authenticate(request,env,now);return json(auth?{user:publicUser(auth.user),access:await accessFor(auth,env,now,localDevelopment(request,env)),local:localDevelopment(request,env),billingReady:billingReady(env)}:{user:null,local:localDevelopment(request,env)});}
   if(['auth/register','auth/login','auth/forgot'].includes(path)&&request.method==='POST') {
    const input=await readJSON(request,4096),address=email(input.email);await authRate(request,env,now,address);
    if(path==='auth/register') {
     password(input.password);
     const local=localDevelopment(request,env);
     if(!local&&(!env.HEARTBEAT_EMAIL_API_KEY||!env.HEARTBEAT_EMAIL_FROM))throw new ProductError('Account registration opens when email verification is configured.',503);
     if(await db(env).prepare('SELECT id FROM hb_users WHERE email=?').bind(address).first())throw new ProductError('An account cannot be created with these details. Try signing in or resetting your password.',409);
     const user:User={id:crypto.randomUUID(),email:address,password_hash:await passwordHash(input.password),verified:0,created_at:now};
     try {await db(env).batch([db(env).prepare('INSERT INTO hb_users(id,email,password_hash,verified,created_at) VALUES (?,?,?,?,?)').bind(user.id,address,user.password_hash,0,now),db(env).prepare('INSERT INTO hb_billing(user_id) VALUES (?)').bind(user.id)]);}catch{throw new ProductError('An account cannot be created with these details. Try signing in.',409);}
     if(!local)try{await sendToken(env,user,'verify',now,fetcher);}catch{/* Account remains usable for resending verification; generation stays locked. */}
     return await session(request,env,user,now);
    }
    const user=await db(env).prepare('SELECT * FROM hb_users WHERE email=?').bind(address).first<User>();
    if(path==='auth/forgot') {if(user)try{await sendToken(env,user,'reset',now,fetcher);}catch{/* Do not disclose whether the address exists. */}return json({message:'If an account exists and email delivery is available, a reset link is on its way.'});}
    if(typeof input.password!=='string'||input.password.length>128)throw new ProductError('Email or password did not match.',401);
    const matches=await passwordMatches(input.password,user?.password_hash||'missing-account');if(!user||!matches)throw new ProductError('Email or password did not match.',401);
    return await session(request,env,user,now);
   }
   if(['auth/verify','auth/reset'].includes(path)&&request.method==='POST') {
    const input=await readJSON(request,4096);if(typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))throw new ProductError('This link is invalid or expired.');
    const kind=path==='auth/verify'?'verify':'reset',tokenHash=await hash(input.token);
    const token=await db(env).prepare('SELECT user_id FROM hb_tokens WHERE hash=? AND kind=? AND expires>?').bind(tokenHash,kind,now).first<{user_id:string}>();if(!token)throw new ProductError('This link is invalid or expired.');
    let encoded='';if(kind==='reset'){password(input.password);encoded=await passwordHash(input.password);}
    // Mutation and one-use token consumption are a single transaction. Every mutation
    // is conditional on the token still existing, so concurrent reuse cannot win twice.
    const mutations=kind==='verify'?[db(env).prepare('UPDATE hb_users SET verified=1 WHERE id=? AND EXISTS(SELECT 1 FROM hb_tokens WHERE hash=?)').bind(token.user_id,tokenHash)]:[db(env).prepare('UPDATE hb_users SET password_hash=? WHERE id=? AND EXISTS(SELECT 1 FROM hb_tokens WHERE hash=?)').bind(encoded,token.user_id,tokenHash),db(env).prepare('DELETE FROM hb_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM hb_tokens WHERE hash=?)').bind(token.user_id,tokenHash)];
    await db(env).batch([...mutations,db(env).prepare('DELETE FROM hb_tokens WHERE hash=?').bind(tokenHash)]);
    return json({message:kind==='verify'?'Email verified. You can start creating.':'Password updated. Sign in with your new password.'});
   }
   if(path==='auth/logout'&&request.method==='POST')return await revoke(request,env);
   const auth=await requireAuth(request,env,now),user=auth.user;
   if(path==='auth/resend'&&request.method==='POST') {await rate(env,`verify:${user.id}`,now,2);await sendToken(env,user,'verify',now,fetcher);return json({message:'Verification email sent.'});}
   if(path==='preferences') {
    if(request.method==='GET') {const row=await db(env).prepare('SELECT preferences,memory FROM hb_profiles WHERE user_id=?').bind(user.id).first<{preferences:string|null;memory:string|null}>();return json({preferences:row?.preferences?JSON.parse(row.preferences):null,memory:row?.memory?JSON.parse(row.memory):null});}
    if(request.method==='POST') {const input=await readJSON(request,170000),preferences=parsePreferences(JSON.stringify(input.preferences));if(!preferences)throw new ProductError('Choose a valid city and display preferences.');let memory=input.memory?parseStoryMemory(JSON.stringify(input.memory),preferences.location,now):null;if(input.memory===undefined){const stored=await db(env).prepare('SELECT memory FROM hb_profiles WHERE user_id=?').bind(user.id).first<{memory:string|null}>();memory=parseStoryMemory(stored?.memory||null,preferences.location,now);}if(input.memory&&!memory)throw new ProductError('The picture history could not be saved.');await db(env).prepare('INSERT INTO hb_profiles(user_id,preferences,memory,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET preferences=excluded.preferences,memory=excluded.memory,updated_at=excluded.updated_at').bind(user.id,JSON.stringify(preferences),memory?JSON.stringify(memory):null,now).run();return json({saved:true});}
   }
   if(path==='library'&&request.method==='GET') {
    const rows=await db(env).prepare("SELECT a.id,a.candidate,a.created_at,CASE WHEN l.id IS NULL THEN 0 ELSE 1 END AS liked FROM ai_attempts a LEFT JOIN hb_likes l ON l.attempt_id=a.id AND l.user_id=a.owner WHERE a.owner=? AND a.art_key IS NOT NULL AND a.status IN ('ready','displayed') ORDER BY a.created_at DESC LIMIT 200").bind(user.id).all<{id:string;candidate:string;created_at:number;liked:number}>();
    return json({pictures:rows.results.map(row=>{const c=JSON.parse(row.candidate);return {id:row.id,title:c.direction.artwork.title,url:`/api/ai/art/${row.id}`,phase:c.direction.phase,reason:c.direction.reason,createdAt:row.created_at,favourite:!!row.liked};})});
   }
   if(path==='favourite'&&request.method==='POST') {const input=await readJSON(request,512);if(typeof input.id!=='string'||typeof input.favourite!=='boolean')throw new ProductError('Choose a valid picture.');const art=await db(env).prepare("SELECT id FROM ai_attempts WHERE id=? AND owner=? AND art_key IS NOT NULL AND status IN ('ready','displayed')").bind(input.id,user.id).first();if(!art)throw new ProductError('Picture not found.',404);if(input.favourite){const saved=await db(env).prepare('INSERT OR IGNORE INTO hb_likes(id,user_id,attempt_id) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM hb_likes WHERE user_id=?)<100').bind(crypto.randomUUID(),user.id,input.id,user.id).run();if(saved.meta.changes!==1&&!await db(env).prepare('SELECT id FROM hb_likes WHERE user_id=? AND attempt_id=?').bind(user.id,input.id).first())throw new ProductError('Your collection holds up to 100 favourites. Remove one before saving another.',409);}else await db(env).prepare('DELETE FROM hb_likes WHERE user_id=? AND attempt_id=?').bind(user.id,input.id).run();return json({saved:true});}
   if(path==='checkout'&&request.method==='POST') {await rate(env,`checkout:${user.id}`,now,5);return json(await checkout(user,(await readJSON(request,512)).plan,env,now,fetcher));}
   if(path==='portal'&&request.method==='POST')return json(await portal(user,env,fetcher));
   if(path==='generation'&&['GET','POST'].includes(request.method)) {if(request.method==='POST')await rate(env,`generation:${user.id}`,now,5,60000);return await generation(request,env,user,request.method==='POST'?await readJSON(request,160000):null,now);}
   if(path==='device/approve'&&request.method==='POST') {const input=await readJSON(request,512);if(typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw new ProductError('Enter the six-digit code from the desktop app.');await rate(env,`pair:${user.id}`,now,8);const approved=await db(env).prepare('UPDATE hb_devices SET owner=?,expires=? WHERE code_hash=? AND owner IS NULL AND expires>?').bind(user.id,now+30*86400000,await hash(input.code),now).run();if(approved.meta.changes!==1)throw new ProductError('Code expired or already used. Request a new code in the desktop app.');return json({paired:true});}
   if(path==='devices'&&request.method==='GET') {const rows=await db(env).prepare('SELECT id,created_at,expires FROM hb_devices WHERE owner=? AND expires>?').bind(user.id,now).all();return json({devices:rows.results});}
   if(path==='device/revoke'&&request.method==='POST') {const input=await readJSON(request,512);await db(env).prepare('DELETE FROM hb_devices WHERE id=? AND owner=?').bind(input.id,user.id).run();return json({revoked:true});}
   if(path==='account/delete'&&request.method==='POST') {
    const input=await readJSON(request,1024);if(typeof input.password!=='string'||!await passwordMatches(input.password,user.password_hash))throw new ProductError('Confirm your password to delete your account.',403);
    const billing=await db(env).prepare('SELECT subscription_id,status FROM hb_billing WHERE user_id=?').bind(user.id).first<{subscription_id:string|null;status:string}>();if(billing?.subscription_id&&billing.status!=='canceled')throw new ProductError('Cancel your subscription in Billing before deleting your account.',409);
    const running=await db(env).prepare("SELECT id FROM hb_jobs WHERE owner=? AND status IN ('queued','running') AND created_at>?").bind(user.id,now-6*60000).first();if(running)throw new ProductError('Wait for your current picture preparation to finish, then try again.',409);
    const artifacts=await db(env).prepare('SELECT art_key FROM ai_attempts WHERE owner=? AND art_key IS NOT NULL').bind(user.id).all<{art_key:string}>();for(const art of artifacts.results)await env.BUCKET?.delete(art.art_key);
    await db(env).batch([db(env).prepare('DELETE FROM hb_sessions WHERE user_id=?').bind(user.id),db(env).prepare('DELETE FROM hb_tokens WHERE user_id=?').bind(user.id),db(env).prepare('DELETE FROM hb_profiles WHERE user_id=?').bind(user.id),db(env).prepare('DELETE FROM hb_likes WHERE user_id=?').bind(user.id),db(env).prepare('DELETE FROM hb_devices WHERE owner=?').bind(user.id),db(env).prepare('DELETE FROM hb_checkout WHERE user_id=?').bind(user.id),db(env).prepare('DELETE FROM hb_jobs WHERE owner=?').bind(user.id),db(env).prepare('UPDATE ai_attempts SET owner=?,candidate=NULL,art_key=NULL,image_hash=NULL,status=\'expired\' WHERE owner=?').bind(`deleted-${await hash(user.id)}`,user.id),db(env).prepare('DELETE FROM ai_sessions WHERE id=?').bind(user.id),db(env).prepare('DELETE FROM hb_billing WHERE user_id=?').bind(user.id),db(env).prepare('DELETE FROM hb_users WHERE id=?').bind(user.id)]);
    return await revoke(request,env);
   }
   throw new ProductError('This page could not be found.',404);
  }catch(error) {return json({error:error instanceof ProductError?error.message:'Something went wrong. Please try again.'},error instanceof ProductError?error.status:503);}
 }
 return {handle};
}
