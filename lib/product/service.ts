import { authenticate, authRate, email, password, passwordHash, passwordMatches, passwordNeedsRehash, publicUser, requireAuth, revoke, sendToken, session, type User } from './auth.ts';
import { accessFor } from './access.ts';
import { billingReady, checkout, portal, webhook, priceCatalog } from './billing.ts';
import { checkOrigin, db, hash, json, localDevelopment, PLANS, ProductError, rate, readJSON } from './core.ts';
import { generation, type JobEnv } from './jobs.ts';
import {profileFor,updatePreferences,updateSurfaceProfile,acknowledgeDisplay,ensureDefaultWorld} from './profiles.ts';
import {beginAccountDeletion} from './lifecycle.ts';
import {recoverBilling,cancelPendingCheckout,processBillingInbox} from './billing-recovery.ts';
import { deviceRoute } from './devices.ts';
import {operatorRoute} from './operations.ts';
import {finishGoogle,googleConfigured,startGoogle} from './google-auth.ts';

export function productService(env:JobEnv,deps:{now?:()=>number;fetcher?:typeof fetch;waitUntil?:(work:Promise<unknown>)=>void}={}) {
 const clock=deps.now||Date.now,fetcher=deps.fetcher||fetch;
 async function handle(request:Request):Promise<Response> {
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/product\/?/,'');const now=clock();
  try {
   if(path==='webhook'&&request.method==='POST'){const response=await webhook(request,env,now,fetcher);deps.waitUntil?.(processBillingInbox(env,{now,fetcher}));return response;}
   if(path.startsWith('ops/'))return await operatorRoute(request,env,now);
   if(request.method!=='GET')checkOrigin(request,env);
   if(path.startsWith('device/')&&!['device/approve','device/revoke'].includes(path)) {const device=await deviceRoute(request,env,path,now);if(device)return device;}
   if(path==='plans'&&request.method==='GET') {if(billingReady(env))await rate(env,`prices:${request.headers.get('cf-connecting-ip')||'local'}`,now,20,60000);return json({plans:Object.values(PLANS),billingReady:billingReady(env),prices:await priceCatalog(env,fetcher)});}
   if(path==='auth/google/start'&&request.method==='GET')return await startGoogle(request,env,now);
   if(path==='auth/google/callback'&&request.method==='GET')return await finishGoogle(request,env,now,fetcher);
   if(path==='auth/session'&&request.method==='GET') {const auth=await authenticate(request,env,now);const version=auth?await db(env).prepare('SELECT preferences_version FROM hb_worlds WHERE id=? AND owner_id=?').bind(`world-${auth.user.id}`,auth.user.id).first<{preferences_version:number}>():null;const linked=auth?!!await db(env).prepare('SELECT user_id FROM hb_google_identities WHERE user_id=?').bind(auth.user.id).first():false;return json(auth?{profileVersion:version?.preferences_version??0,user:publicUser(auth.user),access:await accessFor(auth,env,now,localDevelopment(request,env)),local:localDevelopment(request,env),billingReady:billingReady(env),emailAvailable:!!env.HEARTBEAT_EMAIL_API_KEY&&!!env.HEARTBEAT_EMAIL_FROM,googleAvailable:googleConfigured(env),googleLinked:linked}:{user:null,local:localDevelopment(request,env),emailAvailable:!!env.HEARTBEAT_EMAIL_API_KEY&&!!env.HEARTBEAT_EMAIL_FROM,googleAvailable:googleConfigured(env)});}
   if(['auth/register','auth/login','auth/forgot'].includes(path)&&request.method==='POST') {
    const input=await readJSON(request,4096),address=email(input.email);await authRate(request,env,now,address);
    if(path==='auth/register') {
     password(input.password);
     const local=localDevelopment(request,env);
     if(!local&&(!env.HEARTBEAT_EMAIL_API_KEY||!env.HEARTBEAT_EMAIL_FROM))throw new ProductError('Account registration opens when email verification is configured.',503);
     if(await db(env).prepare('SELECT id FROM hb_users WHERE email=?').bind(address).first())throw new ProductError('An account cannot be created with these details. Try signing in or resetting your password.',409);
     const user:User={id:crypto.randomUUID(),email:address,password_hash:await passwordHash(input.password),verified:0,created_at:now};
     try {await db(env).batch([db(env).prepare('INSERT INTO hb_users(id,email,password_hash,verified,created_at) VALUES (?,?,?,?,?)').bind(user.id,address,user.password_hash,0,now),db(env).prepare('INSERT INTO hb_billing(user_id) VALUES (?)').bind(user.id)]);}catch{throw new ProductError('An account cannot be created with these details. Try signing in.',409);}
     await ensureDefaultWorld(env,user.id,now);
     if(!local)try{await sendToken(env,user,'verify',now,fetcher,typeof input.continuation==='string'?input.continuation:undefined);}catch{/* Account remains usable for resending verification; generation stays locked. */}
     return await session(request,env,user,now);
    }
    const user=await db(env).prepare('SELECT * FROM hb_users WHERE email=?').bind(address).first<User>();
    if(path==='auth/forgot') {
     // This check is independent of account existence: do not claim that a
     // message was sent when the operator has not configured email at all.
     if(!env.HEARTBEAT_EMAIL_API_KEY||!env.HEARTBEAT_EMAIL_FROM)throw new ProductError('Password reset email is not configured yet. Contact Heartbeat support or use local account recovery.',503);
     if(user)try{await sendToken(env,user,'reset',now,fetcher,typeof input.continuation==='string'?input.continuation:undefined);}catch{/* Do not disclose whether the address exists. */}
     return json({message:'If an account exists and email delivery is available, a reset link is on its way.'});
    }
    if(typeof input.password!=='string'||input.password.length>128)throw new ProductError('Email or password did not match.',401);
    const matches=await passwordMatches(input.password,user?.password_hash||'missing-account');if(!user||!matches||(user.lifecycle??'active')!=='active')throw new ProductError('Email or password did not match.',401);
    if(passwordNeedsRehash(user.password_hash))await db(env).prepare('UPDATE hb_users SET password_hash=? WHERE id=? AND password_hash=? AND credential_epoch=?').bind(await passwordHash(input.password),user.id,user.password_hash,user.credential_epoch||0).run();
    return await session(request,env,user,now);
   }
   if(['auth/verify','auth/reset'].includes(path)&&request.method==='POST') {
    const input=await readJSON(request,4096);if(typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))throw new ProductError('This link is invalid or expired.');
    const kind=path==='auth/verify'?'verify':'reset',tokenHash=await hash(input.token);
    const token=await db(env).prepare('SELECT user_id FROM hb_tokens WHERE hash=? AND kind=? AND expires>?').bind(tokenHash,kind,now).first<{user_id:string}>();if(!token)throw new ProductError('This link is invalid or expired.');
    let encoded='';if(kind==='reset'){await rate(env,'security-hash:global',now,120,60000);await rate(env,`reset-hash:${token.user_id}`,now,6);password(input.password);encoded=await passwordHash(input.password);}
    // Mutation and one-use token consumption are a single transaction. Every mutation
    // is conditional on the token still existing, so concurrent reuse cannot win twice.
    const exists="EXISTS(SELECT 1 FROM hb_tokens WHERE hash=? AND expires>?)";
    const mutations=kind==='verify'?[db(env).prepare(`UPDATE hb_users SET verified=1 WHERE id=? AND lifecycle='active' AND ${exists}`).bind(token.user_id,tokenHash,now)]:[
      db(env).prepare(`UPDATE hb_users SET password_hash=?,credential_epoch=credential_epoch+1 WHERE id=? AND lifecycle='active' AND ${exists}`).bind(encoded,token.user_id,tokenHash,now),
      db(env).prepare(`DELETE FROM hb_sessions WHERE user_id=? AND ${exists}`).bind(token.user_id,tokenHash,now),
      db(env).prepare(`DELETE FROM hb_devices WHERE owner=? AND ${exists}`).bind(token.user_id,tokenHash,now),
    ];
    const changed=await db(env).batch([...mutations,db(env).prepare(kind==='reset'?"DELETE FROM hb_tokens WHERE user_id=? AND kind='reset' AND EXISTS(SELECT 1 FROM hb_tokens WHERE hash=?)":'DELETE FROM hb_tokens WHERE hash=?').bind(...(kind==='reset'?[token.user_id,tokenHash]:[tokenHash]))]);
    if(changed[0].meta.changes!==1)throw new ProductError('This link is invalid or expired.');
    return json({message:kind==='verify'?'Email verified. You can start creating.':'Password updated. Sign in with your new password.'});
   }
   if(path==='auth/logout'&&request.method==='POST')return await revoke(request,env);
   const auth=await requireAuth(request,env,now),user=auth.user;
   if(path==='account/password'&&request.method==='POST') {
    await rate(env,'security-hash:global',now,120,60000);await rate(env,`password-change:${user.id}`,now,6);
    const input=await readJSON(request,2048);
    const freshGoogle=user.password_hash==='google-only'&&auth.method==='google'&&auth.authenticatedAt<=now&&auth.authenticatedAt>=now-300000;
    if(!freshGoogle&&(typeof input.currentPassword!=='string'||!await passwordMatches(input.currentPassword,user.password_hash)))throw new ProductError(user.password_hash==='google-only'?'Sign out and continue with Google again to set your password.':'Your current Heartbeat password did not match.',403);
    password(input.newPassword);const next=await passwordHash(input.newPassword),epoch=user.credential_epoch||0;
    const database=db(env),fence="EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='active' AND credential_epoch=? AND password_hash=?)";
    const changed=await database.batch([
     database.prepare("UPDATE hb_users SET password_hash=?,credential_epoch=credential_epoch+1 WHERE id=? AND lifecycle='active' AND credential_epoch=? AND password_hash=?").bind(next,user.id,epoch,user.password_hash),
     database.prepare(`DELETE FROM hb_sessions WHERE user_id=? AND ${fence}`).bind(user.id,user.id,epoch+1,next),
     database.prepare(`DELETE FROM hb_devices WHERE owner=? AND ${fence}`).bind(user.id,user.id,epoch+1,next),
     database.prepare(`DELETE FROM hb_tokens WHERE user_id=? AND kind='reset' AND ${fence}`).bind(user.id,user.id,epoch+1,next),
    ]);
    if(changed[0].meta.changes!==1)throw new ProductError('Your account changed. Sign in again before changing your password.',409);
    return await revoke(request,env);
   }
   if(path==='auth/resend'&&request.method==='POST') {await rate(env,`verify:${user.id}`,now,2);const input=await readJSON(request,4096);await sendToken(env,user,'verify',now,fetcher,typeof input.continuation==='string'?input.continuation:undefined);return json({message:'Verification email sent.'});}
   if(path==='preferences') {
    if(request.method==='GET')return json(await profileFor(env,user.id,{},now));
    if(request.method==='POST')return json(await updatePreferences(env,user.id,await readJSON(request,20000),now));
   }
   if(path==='surface'&&request.method==='POST')return json(await updateSurfaceProfile(env,user.id,await readJSON(request,2048),now,user.credential_epoch||0));
   if(path==='display'&&request.method==='POST')return json(await acknowledgeDisplay(env,user.id,await readJSON(request,2048),now));
   if(path==='feedback'&&request.method==='POST'){const input=await readJSON(request,2048);if(input.preference!=='more'&&input.preference!=='less')throw new ProductError('Choose more or less.');return json(await acknowledgeDisplay(env,user.id,input,now,input.preference));}
   if(path==='billing/recover'&&request.method==='POST'){await rate(env,`billing-recover:${user.id}`,now,6,60000);await processBillingInbox(env,{now,fetcher,limit:5});return json(await recoverBilling(user,env,now,fetcher));}
   if(path==='checkout/cancel'&&request.method==='POST')return json(await cancelPendingCheckout(user,env,now,fetcher));
   if(path==='auth/disconnect-all'&&request.method==='POST'){await rate(env,`disconnect:${user.id}`,now,3);await db(env).batch([db(env).prepare('INSERT INTO hb_operator_audit(id,actor,action,target,reason,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,'disconnect_all',user.id,'User requested credential revocation',now),db(env).prepare('UPDATE hb_users SET credential_epoch=credential_epoch+1 WHERE id=?').bind(user.id),db(env).prepare('DELETE FROM hb_sessions WHERE user_id=?').bind(user.id),db(env).prepare('DELETE FROM hb_devices WHERE owner=?').bind(user.id)]);return revoke(request,env);}
   if(path==='library'&&request.method==='GET') {
    const cursor=url.searchParams.get('cursor'),matched=cursor?.match(/^(\d{1,16}):([a-f0-9-]{36})$/);
    if(cursor&&!matched)throw new ProductError('Invalid collection cursor.');
    const before=matched?Number(matched[1]):Number(url.searchParams.get('before'))||8640000000000000,lastId=matched?.[2]||'zzzz',limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||24));
    if(!Number.isSafeInteger(before)||!Number.isInteger(limit))throw new ProductError('Invalid collection page.');
    const rows=await db(env).prepare("SELECT a.id,a.candidate,a.created_at,CASE WHEN l.id IS NULL THEN 0 ELSE 1 END AS liked FROM ai_attempts a JOIN hb_assets m ON m.id=a.id AND m.owner=a.owner AND m.art_key=a.art_key AND m.state='ready' LEFT JOIN hb_likes l ON l.attempt_id=a.id AND l.user_id=a.owner WHERE a.owner=? AND a.art_key IS NOT NULL AND a.status IN ('ready','displayed') AND (a.created_at<? OR (a.created_at=? AND a.id<?)) ORDER BY a.created_at DESC,a.id DESC LIMIT ?").bind(user.id,before,before,lastId,limit+1).all<{id:string;candidate:string;created_at:number;liked:number}>();
    const page=rows.results.slice(0,limit),last=page.at(-1);
    return json({nextCursor:rows.results.length>limit&&last?`${last.created_at}:${last.id}`:null,pictures:page.map(row=>{const c=JSON.parse(row.candidate);return {id:row.id,title:c.direction.artwork.title,url:`/api/ai/art/${row.id}`,phase:c.direction.phase,reason:c.direction.reason,createdAt:row.created_at,favourite:!!row.liked};})});
   }
   if(path==='favourite'&&request.method==='POST') {const input=await readJSON(request,512);if(typeof input.id!=='string'||typeof input.favourite!=='boolean')throw new ProductError('Choose a valid picture.');const art=await db(env).prepare("SELECT id FROM ai_attempts WHERE id=? AND owner=? AND art_key IS NOT NULL AND status IN ('ready','displayed') AND EXISTS(SELECT 1 FROM hb_assets WHERE id=ai_attempts.id AND owner=ai_attempts.owner AND state='ready')").bind(input.id,user.id).first();if(!art)throw new ProductError('Picture not found.',404);if(input.favourite){const saved=await db(env).prepare("INSERT OR IGNORE INTO hb_likes(id,user_id,attempt_id) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM hb_likes WHERE user_id=?)<100 AND EXISTS(SELECT 1 FROM hb_assets WHERE id=? AND owner=? AND state='ready')").bind(crypto.randomUUID(),user.id,input.id,user.id,input.id,user.id).run();if(saved.meta.changes!==1&&!await db(env).prepare('SELECT id FROM hb_likes WHERE user_id=? AND attempt_id=?').bind(user.id,input.id).first())throw new ProductError('Your collection holds up to 100 favourites. Remove one before saving another.',409);}else await db(env).prepare('DELETE FROM hb_likes WHERE user_id=? AND attempt_id=?').bind(user.id,input.id).run();return json({saved:true});}
   if(path==='checkout'&&request.method==='POST') {await rate(env,`checkout:${user.id}`,now,5);return json(await checkout(user,(await readJSON(request,512)).plan,env,now,fetcher));}
   if(path==='portal'&&request.method==='POST')return json(await portal(user,env,fetcher));
   if(path==='generation'&&['GET','POST'].includes(request.method)) {if(request.method==='POST')await rate(env,`generation:${user.id}`,now,5,60000);return await generation(request,env,user,request.method==='POST'?await readJSON(request,160000):null,now);}
   if(path==='device/inspect'&&request.method==='POST'){const input=await readJSON(request,512);if(typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw new ProductError('Enter the six-digit pairing code.');await rate(env,`pair:${user.id}`,now,8);const pending=await db(env).prepare('SELECT name,expires FROM hb_devices WHERE code_hash=? AND owner IS NULL AND expires>?').bind(await hash(input.code),now).first();if(!pending)throw new ProductError('Pairing code is unavailable.');return json({device:pending});}
   if(path==='device/approve'&&request.method==='POST') {await rate(env,'pair-approve:global',now,120,60000);const input=await readJSON(request,512);if(typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw new ProductError('Enter the six-digit code from the desktop app.');await rate(env,`pair:${user.id}`,now,8);const profile=await profileFor(env,user.id,{},now);const approved=await db(env).prepare("UPDATE hb_devices SET owner=?,expires=?,credential_epoch=?,surface_id=?,code_hash='paired-'||id WHERE code_hash=? AND owner IS NULL AND expires>?").bind(user.id,now+30*86400000,user.credential_epoch||0,profile.surfaceId,await hash(input.code),now).run();if(approved.meta.changes!==1)throw new ProductError('Code expired or already used. Request a new code in the desktop app.');return json({paired:true});}
   if(path==='devices'&&request.method==='GET') {const rows=await db(env).prepare('SELECT id,name,created_at,expires FROM hb_devices WHERE owner=? AND expires>?').bind(user.id,now).all();return json({devices:rows.results});}
   if(path==='device/revoke'&&request.method==='POST') {const input=await readJSON(request,512);await db(env).prepare('DELETE FROM hb_devices WHERE id=? AND owner=?').bind(input.id,user.id).run();return json({revoked:true});}
   if(path==='account/delete'&&request.method==='POST') {
    await rate(env,'security-hash:global',now,120,60000);await rate(env,`delete-hash:${user.id}`,now,3);
    const input=await readJSON(request,1024);if(typeof input.password!=='string'||!await passwordMatches(input.password,user.password_hash))throw new ProductError('Confirm your password to delete your account.',403);
    const billing=await db(env).prepare('SELECT subscription_id,status FROM hb_billing WHERE user_id=?').bind(user.id).first<{subscription_id:string|null;status:string}>();if(billing?.subscription_id&&billing.status!=='canceled')throw new ProductError('Cancel your subscription in Billing before deleting your account.',409);
    await beginAccountDeletion(env,user.id,now);
    return await revoke(request,env);
   }
   throw new ProductError('This page could not be found.',404);
  }catch(error) {return json({error:error instanceof ProductError?error.message:'Something went wrong. Please try again.'},error instanceof ProductError?error.status:503);}
 }
 return {handle};
}
