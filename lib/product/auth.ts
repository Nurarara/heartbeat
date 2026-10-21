import { db, hash, json, localDevelopment, ProductError, randomToken, rate, type ProductEnv } from './core.ts';
export type User = { id:string; email:string; verified:number; created_at:number; password_hash:string };
export type Auth = { user:User; expires:number };
const COOKIE = 'heartbeat_account';
export const publicUser = (user:User) => ({ id:user.id,email:user.email,verified:!!user.verified });
export function email(value: unknown) { if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new ProductError('Enter a valid email address.'); return value.trim().toLowerCase(); }
export function password(value: unknown): asserts value is string { if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw new ProductError('Use a password between 12 and 128 characters.'); }
export async function passwordHash(value:string, salt = randomToken().slice(0,32)) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),'PBKDF2',false,['deriveBits']);
  const result = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256));
  return `pbkdf2.100000.${salt}.${Array.from(result,v=>v.toString(16).padStart(2,'0')).join('')}`;
}
export async function passwordMatches(value:string, stored:string) { const parts=stored.split('.'); const expected=await passwordHash(value,parts[2] || 'dummy-salt-for-missing-account'); const a=await hash(expected),b=await hash(stored); let diff=0;for(let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0; }
export async function authenticate(request:Request, env:ProductEnv, now=Date.now()):Promise<Auth|null> {
  const cookieName=new URL(request.url).protocol==='https:'?'__Host-heartbeat_account':COOKIE;
  const token=request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`))?.[1]; if(!token)return null;
  const row=await db(env).prepare('SELECT u.*,s.expires FROM hb_sessions s JOIN hb_users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?').bind(await hash(token),now).first<User & {expires:number}>();
  return row?{user:row,expires:row.expires}:null;
}
export async function requireAuth(request:Request,env:ProductEnv,now=Date.now()) { const result=await authenticate(request,env,now);if(!result)throw new ProductError('Sign in to continue.',401);return result; }
export async function session(request:Request,env:ProductEnv,user:User,now:number) {
  const token=randomToken(),expires=now+30*86400000;
  await db(env).prepare('INSERT INTO hb_sessions(hash,user_id,expires) VALUES (?,?,?)').bind(await hash(token),user.id,expires).run();
  const secure=new URL(request.url).protocol==='https:';
  return json({user:publicUser(user),local:localDevelopment(request,env)},200,{'Set-Cookie':`${secure?'__Host-heartbeat_account':COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure?'; Secure':''}`});
}
export async function revoke(request:Request,env:ProductEnv) { const secure=new URL(request.url).protocol==='https:',name=secure?'__Host-heartbeat_account':COOKIE;const token=request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})(?:;|$)`))?.[1];if(token)await db(env).prepare('DELETE FROM hb_sessions WHERE hash=?').bind(await hash(token)).run();return json({signedOut:true},200,{'Set-Cookie':`${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`}); }
export async function sendToken(env:ProductEnv,user:User,kind:'verify'|'reset',now:number,fetcher:typeof fetch=fetch) {
  if(!env.HEARTBEAT_EMAIL_API_KEY||!env.HEARTBEAT_EMAIL_FROM)throw new ProductError('Email delivery is not configured yet.',503);
  const token=randomToken(); await db(env).prepare('INSERT INTO hb_tokens(hash,user_id,kind,expires) VALUES (?,?,?,?)').bind(await hash(token),user.id,kind,now+30*60000).run();
  const link=new URL('/auth',env.HEARTBEAT_APP_ORIGIN);link.searchParams.set(kind,token);
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.HEARTBEAT_EMAIL_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.HEARTBEAT_EMAIL_FROM,to:[user.email],subject:kind==='verify'?'Welcome to Heartbeat — verify your email':'Reset your Heartbeat password',text:`${kind==='verify'?'Verify your email':'Reset your password'}: ${link.href}\nThis link expires in 30 minutes. If you did not request this, ignore it.`}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new ProductError('Email could not be delivered. Please try again later.',503);
}
export async function authRate(request:Request,env:ProductEnv,now:number,address:string) { const ip=request.headers.get('cf-connecting-ip') || 'local';await rate(env,`auth-ip:${ip}`,now,30);await rate(env,`auth-email:${address}`,now,8); }
