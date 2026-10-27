// Real SQLite and JWT signatures, mocked Google HTTPS endpoints; no provider or email network calls.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SignJWT,exportJWK,generateKeyPair} from 'jose';
import {fixture} from './product-fixture.mjs';

const clientId='fixture.apps.googleusercontent.com',clientSecret='fixture-client-secret';
const {privateKey,publicKey}=await generateKeyPair('RS256',{modulusLength:2048,extractable:true}),otherKey=(await generateKeyPair('RS256',{modulusLength:2048})).privateKey;
const jwk={...await exportJWK(publicKey),kid:'fixture-key',alg:'RS256',use:'sig'};
let context,identity={sub:'google-person-1',email:'new-person@gmail.com',email_verified:true},variant='valid',providerCalls=[];
const fetcher=async(url,options={})=>{
 providerCalls.push(String(url));
 if(String(url)==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[jwk]});
 if(String(url)!=='https://oauth2.googleapis.com/token')throw Error('Unexpected provider request');
 assert.equal(options.redirect,'manual');const body=new URLSearchParams(options.body);assert.equal(body.get('client_id'),clientId);assert.equal(body.get('client_secret'),clientSecret);assert.equal(body.get('redirect_uri'),'https://heartbeat.example/api/product/auth/google/callback');
 assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'),context.challenge,'The exchange proves the original PKCE verifier');
 const seconds=Math.floor(context.now/1000),claims={...identity,nonce:variant==='nonce'?'wrong':context.nonce};
 if(variant==='unverified')claims.email_verified=false;
 if(variant==='presenter')claims.azp='different-client.apps.googleusercontent.com';
 const jwt=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'fixture-key'}).setIssuer(variant==='issuer'?'https://evil.example':'https://accounts.google.com').setAudience(variant==='audience'?'wrong.apps.googleusercontent.com':clientId).setIssuedAt(seconds).setExpirationTime(variant==='expired'?seconds-120:seconds+600).sign(variant==='signature'?otherKey:privateKey);
 return Response.json({id_token:jwt,access_token:'ignored-fixture-token'});
};
const f=await fixture({production:true,env:{HEARTBEAT_EMAIL_API_KEY:'fixture-mail',HEARTBEAT_EMAIL_FROM:'Heartbeat <hello@example.test>',HEARTBEAT_GOOGLE_CLIENT_ID:clientId,HEARTBEAT_GOOGLE_CLIENT_SECRET:clientSecret},fetcher});
function responseCookies(response){return response.headers.getSetCookie();}
function accountCookie(response){const value=responseCookies(response).find(cookie=>cookie.startsWith('__Host-heartbeat_account='));assert.ok(value,'Google return issues a secure account cookie');return value.split(';')[0];}
async function start(account='',next='/onboarding?plan=studio'){
 const response=await f.call(`auth/google/start?${new URLSearchParams({next,plan:'studio'})}`,undefined,{cookie:account});assert.equal(response.status,302);const url=new URL(response.headers.get('location'));
 assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('scope'),'openid email');
 const state=url.searchParams.get('state'),stateCookie=responseCookies(response)[0].split(';')[0];assert.match(responseCookies(response)[0],/HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
 context={nonce:url.searchParams.get('nonce'),challenge:url.searchParams.get('code_challenge'),state,stateCookie,now:f.now(),account};return context;
}
async function finish(c=context,cookie=c.stateCookie){return f.call(`auth/google/callback?${new URLSearchParams({state:c.state,code:'fixture-authorization-code'})}`,undefined,{cookie:[cookie,c.account].filter(Boolean).join('; ')});}
try{
 const methods=await (await f.call('auth/session')).json();assert.equal(methods.googleAvailable,true);
 const first=await start();const wrongCookie=await finish(first,'__Host-heartbeat_google='+('f'.repeat(64)));assert.match(wrongCookie.headers.get('location'),/google=expired/);assert.equal(providerCalls.length,0,'Wrong browser state never reaches Google');
 const good=await finish(first);assert.equal(good.headers.get('location'),'/onboarding?plan=studio');const googleCookie=accountCookie(good);assert.ok(responseCookies(good).some(cookie=>/heartbeat_google=;.*Max-Age=0/.test(cookie)));
 const profile=await (await f.call('auth/session',undefined,{cookie:googleCookie})).json();assert.equal(profile.user.email,identity.email);assert.equal(profile.user.verified,true);assert.equal(profile.user.hasPassword,false);assert.equal(profile.googleLinked,true);
 const replay=await finish(first);assert.match(replay.headers.get('location'),/google=expired/,'State is consumed before token exchange');
 assert.equal((await f.call('account/password',{newPassword:'new heartbeats password long enough'},{cookie:googleCookie})).status,200,'A fresh Google session can set the first password');
 assert.equal((await (await f.call('auth/session',undefined,{cookie:googleCookie})).json()).user,null,'Setting a password revokes the Google session');
 assert.equal((await f.call('auth/login',{email:identity.email,password:'new heartbeats password long enough'})).status,200);
 for(const invalid of ['nonce','issuer','audience','expired','unverified','signature','presenter']){variant=invalid;identity={sub:`bad-${invalid}`,email:`${invalid}@gmail.com`,email_verified:true};const s=await start();const result=await finish(s);assert.match(result.headers.get('location'),/google=failed/,invalid);assert.equal(f.sqlite.prepare('SELECT id FROM hb_users WHERE email=?').get(identity.email),undefined,`${invalid} claims cannot create an account`);}variant='valid';
 const existing=await f.register('existing@gmail.com');identity={sub:'google-existing',email:'existing@gmail.com',email_verified:true};let s=await start();let result=await finish(s);assert.match(result.headers.get('location'),/google=existing_account/,'An unverified existing password account is never silently linked');
 assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM hb_google_identities WHERE subject=?').get(identity.sub).n,0);
 s=await start(existing.cookie,'/app?tab=account');result=await finish(s);assert.equal(result.headers.get('location'),'/app?tab=account');const linkedCookie=accountCookie(result);const linked=await (await f.call('auth/session',undefined,{cookie:linkedCookie})).json();assert.equal(linked.user.id,existing.data.user.id);assert.equal(linked.user.verified,true);assert.equal(linked.googleLinked,true);assert.equal(linked.user.hasPassword,true);
 s=await start();result=await finish(s);assert.equal((await (await f.call('auth/session',undefined,{cookie:accountCookie(result)})).json()).user.id,existing.data.user.id,'Later Google logins use the stable Google subject');
 identity={sub:'google-third-party',email:'third-party@example.test',email_verified:true};s=await start();result=await finish(s);const third=await (await f.call('auth/session',undefined,{cookie:accountCookie(result)})).json();assert.equal(third.user.verified,false,'Google is not automatically authoritative for an unrelated email domain');
 const crossOrigin=await f.call('account/password',{currentPassword:'a long test password',newPassword:'a replacement password long enough'},{cookie:existing.cookie,origin:'https://evil.example'});assert.equal(crossOrigin.status,403);
 const old=await f.call('account/password',{currentPassword:'wrong',newPassword:'a replacement password long enough'},{cookie:existing.cookie});assert.equal(old.status,403);
 const changed=await f.call('account/password',{currentPassword:'a long test password',newPassword:'a replacement password long enough'},{cookie:existing.cookie});assert.equal(changed.status,200);assert.equal((await (await f.call('auth/session',undefined,{cookie:linkedCookie})).json()).user,null,'Password changes revoke all sessions');
 assert.equal((await f.call('auth/login',{email:'existing@gmail.com',password:'a long test password'})).status,401);assert.equal((await f.call('auth/login',{email:'existing@gmail.com',password:'a replacement password long enough'})).status,200);
 identity={sub:'google-freshness',email:'freshness@gmail.com',email_verified:true};s=await start();result=await finish(s);const staleCookie=accountCookie(result);f.advance(301000);
 assert.equal((await f.call('account/password',{newPassword:'another new secure password'},{cookie:staleCookie})).status,403,'An old Google session cannot silently set a first password');
 s=await start(staleCookie,'/app?tab=account');result=await finish(s);assert.equal((await f.call('account/password',{newPassword:'another new secure password'},{cookie:accountCookie(result)})).status,200,'A fresh Google reauthentication can set a first password');
 console.log('Passed Google signed-ID-token authentication, nonce/state/PKCE checks, replay and claim rejection, safe existing-account linking, Google-only password setup, third-party email trust and password-change revocation. SQLite real; Google HTTP mocked.');
}finally{f.close();}
