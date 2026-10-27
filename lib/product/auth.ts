import { db, hash, json, localDevelopment, ProductError, randomToken, rate, type ProductEnv } from './core.ts';
import {pbkdf2Async} from '@noble/hashes/pbkdf2.js';
import {sha256} from '@noble/hashes/sha2.js';
import {pbkdf2 as nativePbkdf2} from 'node:crypto';
import {safeContinuation} from '../customer-journey.ts';
export type User = { id:string; email:string; verified:number; created_at:number; password_hash:string; lifecycle?:string; credential_epoch?:number };
export type Auth = { user:User; expires:number; method:'password'|'google'; authenticatedAt:number };
const COOKIE = 'heartbeat_account';
export const publicUser = (user:User) => ({ id:user.id,email:user.email,verified:!!user.verified,hasPassword:user.password_hash!=='google-only' });
export function email(value: unknown) { if(typeof value!=='string')throw new ProductError('Enter a valid email address.');const normalized=value.trim().toLowerCase();if(normalized.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw new ProductError('Enter a valid email address.');return normalized; }
export function password(value: unknown): asserts value is string { if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw new ProductError('Use a password between 12 and 128 characters.'); }
export const PASSWORD_ITERATIONS = 600000;
const SUPPORTED_ITERATIONS = new Set([100000, PASSWORD_ITERATIONS]);
type PasswordParameters = { iterations:number; salt:string; digest:string; legacy:boolean };
function passwordParameters(stored:string):PasswordParameters|null {
  const parts=stored.split('.');
  const legacy=parts.length===4&&parts[0]==='pbkdf2';
  const modern=parts.length===5&&parts[0]==='pbkdf2-sha256'&&parts[1]==='v1';
  if(!legacy&&!modern)return null;
  const offset=legacy?1:2, iterations=Number(parts[offset]),salt=parts[offset+1],digest=parts[offset+2];
  // Only explicitly supported work factors are accepted. Stored data must not
  // turn a login into an arbitrary-cost password-hashing operation.
  if(!SUPPORTED_ITERATIONS.has(iterations)||String(iterations)!==parts[offset]||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(digest))return null;
  return {iterations,salt,digest,legacy};
}
function unsupportedPasswordDerivation(error:unknown):boolean {
  if(!(error instanceof Error))return false;
  if(error.name==='NotSupportedError')return true;
  const code=(error as Error&{code?:string}).code;
  if(code&&['ERR_METHOD_NOT_IMPLEMENTED','ERR_NOT_IMPLEMENTED','ERR_NOT_SUPPORTED','ERR_CRYPTO_UNSUPPORTED_OPERATION'].includes(code))return true;
  return /pbkdf2.*(?:not implemented|not supported|unsupported)|(?:not implemented|not supported|unsupported).*pbkdf2|iteration(?:s| count)?.*(?:exceed|maximum|upper limit|greater than|<=\s*100000)/i.test(error.message);
}
async function passwordDigest(value:string,salt:string,iterations:number) {
  let result:Uint8Array;
  try {
    // Native async PBKDF2 avoids the JS hot loop when the runtime supports the
    // configured work factor. The stored algorithm, bytes and iterations stay
    // identical; unexpected native errors are surfaced instead of hidden.
    result=await new Promise<Uint8Array>((resolve,reject)=>nativePbkdf2(value,salt,iterations,32,'sha256',(error,bytes)=>error?reject(error):resolve(bytes)));
  }catch(error){
    if(!unsupportedPasswordDerivation(error))throw error;
    // Some hosted runtimes impose a 100k native/WebCrypto cap. The pure-JS
    // implementation still performs the full requested 600k (or legacy 100k),
    // never the WebCrypto wrapper or a lower work factor. Hosted CPU and load
    // qualification remain necessary even though local native hashing is faster.
    result=await pbkdf2Async(sha256,value,salt,{c:iterations,dkLen:32,asyncTick:8});
  }
  try{return Array.from(result,v=>v.toString(16).padStart(2,'0')).join('');}finally{result.fill(0);}
}
export async function passwordHash(value:string, salt = randomToken().slice(0,32)) {
  if(!/^[a-f0-9]{32}$/.test(salt))throw new Error('Invalid password salt.');
  return `pbkdf2-sha256.v1.${PASSWORD_ITERATIONS}.${salt}.${await passwordDigest(value,salt,PASSWORD_ITERATIONS)}`;
}
export const passwordNeedsRehash = (stored:string) => {const parameters=passwordParameters(stored);return !parameters||parameters.legacy||parameters.iterations!==PASSWORD_ITERATIONS;};
export async function passwordMatches(value:string, stored:string) {
  const parameters=passwordParameters(stored);
  const expected=await passwordDigest(value,parameters?.salt||'0'.repeat(32),parameters?.iterations||PASSWORD_ITERATIONS);
  const actual=parameters?.digest||'0'.repeat(64);
  let diff=0;for(let i=0;i<actual.length;i++)diff|=expected.charCodeAt(i)^actual.charCodeAt(i);
  return !!parameters&&diff===0;
}
export async function authenticate(request:Request, env:ProductEnv, now=Date.now()):Promise<Auth|null> {
  const cookieName=new URL(request.url).protocol==='https:'?'__Host-heartbeat_account':COOKIE;
  const token=request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`))?.[1]; if(!token)return null;
  const row=await db(env).prepare("SELECT u.*,s.expires,s.auth_method,s.authenticated_at FROM hb_sessions s JOIN hb_users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>? AND u.lifecycle='active' AND s.credential_epoch=u.credential_epoch").bind(await hash(token),now).first<User & {expires:number;auth_method:'password'|'google';authenticated_at:number}>();
  return row?{user:row,expires:row.expires,method:row.auth_method,authenticatedAt:row.authenticated_at}:null;
}
export async function requireAuth(request:Request,env:ProductEnv,now=Date.now()) { const result=await authenticate(request,env,now);if(!result)throw new ProductError('Sign in to continue.',401);return result; }
export async function session(request:Request,env:ProductEnv,user:User,now:number,method:'password'|'google'='password') {
  const token=randomToken(),expires=now+30*86400000;
  const result=await db(env).prepare("INSERT INTO hb_sessions(hash,user_id,expires,credential_epoch,auth_method,authenticated_at) SELECT ?,id,?,credential_epoch,?,? FROM hb_users WHERE id=? AND lifecycle='active' AND credential_epoch=?").bind(await hash(token),expires,method,now,user.id,user.credential_epoch||0).run();
  if(!result.meta.changes)throw new ProductError('Your account changed. Sign in again.',401);
  const secure=new URL(request.url).protocol==='https:';
  return json({user:publicUser(user),local:localDevelopment(request,env)},200,{'Set-Cookie':`${secure?'__Host-heartbeat_account':COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure?'; Secure':''}`});
}
export async function revoke(request:Request,env:ProductEnv) { const secure=new URL(request.url).protocol==='https:',name=secure?'__Host-heartbeat_account':COOKIE;const token=request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})(?:;|$)`))?.[1];if(token)await db(env).prepare('DELETE FROM hb_sessions WHERE hash=?').bind(await hash(token)).run();return json({signedOut:true},200,{'Set-Cookie':`${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`}); }
export async function sendToken(env:ProductEnv,user:User,kind:'verify'|'reset',now:number,fetcher:typeof fetch=fetch,continuation?:string) {
  if(!env.HEARTBEAT_EMAIL_API_KEY||!env.HEARTBEAT_EMAIL_FROM)throw new ProductError('Email delivery is not configured yet.',503);
  await rate(env,'mail:global',now,100,60000);
  await rate(env,`mail:${kind}:${user.id}`,now,3);
  const token=randomToken(); await db(env).prepare('INSERT INTO hb_tokens(hash,user_id,kind,expires) VALUES (?,?,?,?)').bind(await hash(token),user.id,kind,now+30*60000).run();
  const link=new URL('/auth',env.HEARTBEAT_APP_ORIGIN);link.searchParams.set(kind,token);
  if(continuation)link.searchParams.set('next',safeContinuation(continuation));
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.HEARTBEAT_EMAIL_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.HEARTBEAT_EMAIL_FROM,to:[user.email],subject:kind==='verify'?'Welcome to Heartbeat — verify your email':'Reset your Heartbeat password',text:`${kind==='verify'?'Verify your email':'Reset your password'}: ${link.href}\nThis link expires in 30 minutes. If you did not request this, ignore it.`}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new ProductError('Email could not be delivered. Please try again later.',503);
}
export function trustedActor(request:Request,env:ProductEnv) {
  // A client-controlled forwarded header is not a trustworthy actor identity.
  // Set this only when the origin is reachable exclusively through Cloudflare.
  const trusted=(env as ProductEnv & {HEARTBEAT_TRUST_CLOUDFLARE_IP?:string}).HEARTBEAT_TRUST_CLOUDFLARE_IP==='true';
  return trusted ? (request.headers.get('cf-connecting-ip')||'unknown-proxy').slice(0,100) : 'unverified-origin';
}
export async function authRate(request:Request,env:ProductEnv,now:number,address:string) {
  await rate(env,'auth-hash:global',now,120,60000);
  await rate(env,`auth-ip:${trustedActor(request,env)}`,now,30);
  await rate(env,`auth-email:${address}`,now,8);
}
