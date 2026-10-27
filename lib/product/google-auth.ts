// Server-side Google OpenID Connect. Credentials and provider tokens never enter the browser.
import {createLocalJWKSet,jwtVerify,type JSONWebKeySet} from 'jose';
import {authenticate,email,session,trustedActor,type User} from './auth.ts';
import {db,hash,localDevelopment,ProductError,randomToken,rate,type ProductEnv} from './core.ts';
import {ensureDefaultWorld,profileFor} from './profiles.ts';
import {afterAuthentication,readJourney,safeJourneyDestination,type JourneyPlan} from '../customer-journey.ts';

const authorizeURL='https://accounts.google.com/o/oauth2/v2/auth';
const tokenURL='https://oauth2.googleapis.com/token';
const keysURL='https://www.googleapis.com/oauth2/v3/certs';
const loops=new Set(['localhost','127.0.0.1','[::1]']);
type State={verifier:string;nonce:string;redirect_uri:string;continuation:string;plan:JourneyPlan;owner_id:string|null;credential_epoch:number|null};
export function googleConfigured(env:ProductEnv){return !!env.HEARTBEAT_GOOGLE_CLIENT_ID?.trim()&&!!env.HEARTBEAT_GOOGLE_CLIENT_SECRET?.trim()&&env.HEARTBEAT_GOOGLE_CLIENT_ID.length<=300&&env.HEARTBEAT_GOOGLE_CLIENT_SECRET.length<=1000;}
function originFor(request:Request,env:ProductEnv){
 const requested=new URL(request.url),configured=new URL(env.HEARTBEAT_APP_ORIGIN||'http://localhost:5173');
 const local=localDevelopment(request,env)&&configured.protocol==='http:'&&loops.has(configured.hostname)&&requested.port===configured.port;
 if(requested.origin!==configured.origin&&!local)throw new ProductError('Open Heartbeat at its application address and try again.',403);
 return requested.origin;
}
function cookieName(request:Request){return new URL(request.url).protocol==='https:'?'__Host-heartbeat_google':'heartbeat_google';}
function cookie(request:Request,value:string,maxAge:number){return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
function redirect(target:string,cookies:string[]=[]){const headers=new Headers({'Location':target,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});for(const value of cookies)headers.append('Set-Cookie',value);return new Response(null,{status:302,headers});}
function b64url(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
async function jsonBounded(response:Response,limit=64000){
 if(!response.ok)throw new Error('provider_unavailable');const reader=response.body?.getReader();if(!reader)throw new Error('provider_unavailable');const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>limit){await reader.cancel();throw new Error('provider_response_too_large');}chunks.push(item.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}return JSON.parse(new TextDecoder().decode(bytes)) as Record<string,unknown>;
}
function authoritative(address:string,hostedDomain:unknown){const domain=address.split('@').at(-1);return domain==='gmail.com'||domain==='googlemail.com'||typeof hostedDomain==='string'&&hostedDomain.toLowerCase()===domain;}
function equalState(a:string,b:string){if(a.length!==64||b.length!==64)return false;let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}

export async function startGoogle(request:Request,env:ProductEnv,now:number){
 if(!googleConfigured(env))throw new ProductError('Google sign-in is not configured yet.',503);
 const origin=originFor(request,env),url=new URL(request.url),journey=readJourney(url.search),next=safeJourneyDestination(journey.next)||`/onboarding?plan=${journey.plan}`;
 await rate(env,'google-start:global',now,120,60000);await rate(env,`google-start:${trustedActor(request,env)}`,now,20);
 const current=await authenticate(request,env,now),state=randomToken(),verifier=randomToken(),nonce=randomToken(),callback=`${origin}/api/product/auth/google/callback`;
 const challenge=b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
 const database=db(env);await database.prepare('DELETE FROM hb_google_states WHERE rowid IN (SELECT rowid FROM hb_google_states WHERE expires<=? LIMIT 100)').bind(now).run();
 await database.prepare('INSERT INTO hb_google_states(state_hash,verifier,nonce,redirect_uri,continuation,plan,owner_id,credential_epoch,expires) VALUES (?,?,?,?,?,?,?,?,?)').bind(await hash(state),verifier,nonce,callback,next,journey.plan,current?.user.id||null,current?.user.credential_epoch??null,now+600000).run();
 const target=new URL(authorizeURL);for(const [key,value] of Object.entries({client_id:env.HEARTBEAT_GOOGLE_CLIENT_ID!.trim(),redirect_uri:callback,response_type:'code',scope:'openid email',state,nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}))target.searchParams.set(key,value);
 return redirect(target.href,[cookie(request,state,600)]);
}

export async function finishGoogle(request:Request,env:ProductEnv,now:number,fetcher:typeof fetch=fetch){
 const clear=cookie(request,'',0),failure=(reason='failed')=>redirect(`/auth?google=${reason}`,[clear]);
 try{
  if(!googleConfigured(env))return failure('unavailable');originFor(request,env);
  const url=new URL(request.url),state=url.searchParams.get('state')||'',storedCookie=request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${cookieName(request)}=([a-f0-9]{64})(?:;|$)`))?.[1]||'';
  if(!/^[a-f0-9]{64}$/.test(state)||!equalState(state,storedCookie))return failure('expired');
  const row=await db(env).prepare('DELETE FROM hb_google_states WHERE state_hash=? AND expires>? RETURNING verifier,nonce,redirect_uri,continuation,plan,owner_id,credential_epoch').bind(await hash(state),now).first<State>();
  if(!row||row.redirect_uri!==`${url.origin}/api/product/auth/google/callback`)return failure('expired');
  const code=url.searchParams.get('code');if(url.searchParams.has('error'))return failure('cancelled');if(!code||code.length>2048)return failure();
  if(row.owner_id){const current=await authenticate(request,env,now);if(!current||current.user.id!==row.owner_id||(current.user.credential_epoch||0)!==row.credential_epoch)return failure('account_changed');}
  const clientId=env.HEARTBEAT_GOOGLE_CLIENT_ID!.trim(),params=new URLSearchParams({client_id:clientId,client_secret:env.HEARTBEAT_GOOGLE_CLIENT_SECRET!.trim(),code,code_verifier:row.verifier,redirect_uri:row.redirect_uri,grant_type:'authorization_code'});
  const response=await fetcher(tokenURL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString(),redirect:'manual',signal:AbortSignal.timeout(12000)});
  const tokens=await jsonBounded(response);if(typeof tokens.id_token!=='string'||tokens.id_token.length>16000)throw new Error('invalid_token');
  const keys=await jsonBounded(await fetcher(keysURL,{redirect:'manual',signal:AbortSignal.timeout(12000)}));
  if(!Array.isArray(keys.keys)||keys.keys.length>20)throw new Error('invalid_keys');
  const {payload}=await jwtVerify(tokens.id_token,createLocalJWKSet(keys as unknown as JSONWebKeySet),{issuer:['https://accounts.google.com','accounts.google.com'],audience:clientId,algorithms:['RS256'],requiredClaims:['iss','aud','sub','exp','iat'],currentDate:new Date(now),clockTolerance:60});
  if(payload.nonce!==row.nonce||typeof payload.iat!=='number'||payload.iat>Math.floor(now/1000)+60||typeof payload.sub!=='string'||!/^[A-Za-z0-9_-]{1,255}$/.test(payload.sub)||payload.email_verified!==true||typeof payload.email!=='string'||payload.azp!==undefined&&payload.azp!==clientId||Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==clientId)throw new Error('invalid_claims');
  const address=email(payload.email),trustedEmail=authoritative(address,payload.hd),database=db(env);
  let user=await database.prepare("SELECT u.* FROM hb_google_identities g JOIN hb_users u ON u.id=g.user_id WHERE g.subject=? AND u.lifecycle='active'").bind(payload.sub).first<User>();
  if(row.owner_id&&user&&user.id!==row.owner_id)return failure('account_changed');
  if(!user){
   user=await database.prepare("SELECT * FROM hb_users WHERE email=? AND lifecycle='active'").bind(address).first<User>();
   if(user){
    if(row.owner_id&&row.owner_id!==user.id)return failure('account_changed');
    if(!row.owner_id&&(!user.verified||!trustedEmail))return failure('existing_account');
    const linked=await database.prepare("INSERT OR IGNORE INTO hb_google_identities(subject,user_id,created_at) SELECT ?,id,? FROM hb_users WHERE id=? AND lifecycle='active' AND credential_epoch=?").bind(payload.sub,now,user.id,user.credential_epoch||0).run();
    if(!linked.meta.changes)return failure('existing_account');
    if(trustedEmail&&!user.verified){await database.prepare("UPDATE hb_users SET verified=1 WHERE id=? AND lifecycle='active' AND credential_epoch=?").bind(user.id,user.credential_epoch||0).run();user={...user,verified:1};}
   }else{
    if(row.owner_id)return failure('account_changed');
    user={id:crypto.randomUUID(),email:address,password_hash:'google-only',verified:trustedEmail?1:0,created_at:now,credential_epoch:0};
    await database.batch([database.prepare('INSERT INTO hb_users(id,email,password_hash,verified,created_at) VALUES (?,?,?,?,?)').bind(user.id,address,user.password_hash,user.verified,now),database.prepare('INSERT INTO hb_billing(user_id) VALUES (?)').bind(user.id),database.prepare('INSERT INTO hb_google_identities(subject,user_id,created_at) VALUES (?,?,?)').bind(payload.sub,user.id,now)]);
    await ensureDefaultWorld(env,user.id,now);
   }
  }
  if(row.owner_id&&user.id!==row.owner_id)return failure('account_changed');
  const profile=await profileFor(env,user.id,{},now),auth=await session(request,env,user,now,'google'),setCookie=auth.headers.get('Set-Cookie');if(!setCookie)throw new Error('session_unavailable');
  const next=afterAuthentication({next:safeJourneyDestination(row.continuation),plan:row.plan},!!profile.preferences);
  return redirect(next,[setCookie,clear]);
 }catch{return failure();}
}
