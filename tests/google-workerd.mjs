// Actual Workerd, D1 and JWT verification; all Google traffic is mocked.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {SignJWT,exportJWK,generateKeyPair} from 'jose';

const {privateKey,publicKey}=await generateKeyPair('RS256',{modulusLength:2048,extractable:true}),jwk={...await exportJWK(publicKey),kid:'workerd-key',alg:'RS256',use:'sig'};
const client='workerd-fixture.apps.googleusercontent.com';
const source=`import {productService} from './lib/product/service.ts';
let idToken='';
export default {async fetch(request,env){
 const url=new URL(request.url);if(url.pathname==='/__fixture'){idToken=await request.text();return new Response('ok');}
 const fetcher=async(input,options)=>{
  if(String(input)==='https://oauth2.googleapis.com/token')return Response.json({id_token:idToken});
  if(String(input)==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[${JSON.stringify(jwk)}]});
  throw new Error('Unexpected network request');
 };
 return productService({DB:env.DB,HEARTBEAT_APP_MODE:'production',HEARTBEAT_APP_ORIGIN:'https://heartbeat.test',HEARTBEAT_GOOGLE_CLIENT_ID:${JSON.stringify(client)},HEARTBEAT_GOOGLE_CLIENT_SECRET:'fixture-secret'},{fetcher}).handle(request);
}};`;
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',format:'esm',target:'es2022',external:['node:crypto'],write:false,logLevel:'silent'});
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler/package.json')),{Miniflare}=wranglerRequire('miniflare');
const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],script:bundle.outputFiles[0].text,outboundService:()=>{throw Error('Outbound network is forbidden in OAuth tests');}});
const sqlite=new DatabaseSync(':memory:');
try{
 for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())sqlite.exec(readFileSync(`drizzle/${file}`,'utf8'));
 const database=await mf.getD1Database('DB');
 for(const row of sqlite.prepare("SELECT sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name").all())await database.prepare(row.sql).run();
 await database.prepare('INSERT INTO heartbeat_schema(version,applied_at) VALUES (14,?)').bind(Date.now()).run();
 const start=await mf.dispatchFetch('https://heartbeat.test/api/product/auth/google/start?next=%2Fonboarding%3Fplan%3Dstudio&plan=studio',{redirect:'manual'});assert.equal(start.status,302);
 const authorization=new URL(start.headers.get('location')),state=authorization.searchParams.get('state'),nonce=authorization.searchParams.get('nonce');
 const stateCookie=start.headers.getSetCookie()[0].split(';')[0],now=Math.floor(Date.now()/1000);
 const token=await new SignJWT({sub:'workerd-google-subject',email:'workerd-test@gmail.com',email_verified:true,nonce}).setProtectedHeader({alg:'RS256',kid:'workerd-key'}).setIssuer('https://accounts.google.com').setAudience(client).setIssuedAt(now).setExpirationTime(now+600).sign(privateKey);
 await mf.dispatchFetch('https://heartbeat.test/__fixture',{method:'POST',body:token});
 const callback=await mf.dispatchFetch(`https://heartbeat.test/api/product/auth/google/callback?state=${state}&code=fixture`,{redirect:'manual',headers:{cookie:stateCookie}});
 assert.equal(callback.status,302);assert.equal(callback.headers.get('location'),'/onboarding?plan=studio');
 const account=callback.headers.getSetCookie().find(value=>value.startsWith('__Host-heartbeat_account='));assert.ok(account,'Workerd emits the account session alongside the expired OAuth cookie');
 const session=await mf.dispatchFetch('https://heartbeat.test/api/product/auth/session',{headers:{cookie:account.split(';')[0]}}),data=await session.json();assert.equal(data.user.email,'workerd-test@gmail.com');assert.equal(data.user.verified,true);assert.equal(data.googleLinked,true);
 console.log('Passed actual Workerd/D1 Google OAuth redirect, signed JWT verification, cookie delivery and authenticated session. Google endpoints mocked; no real accounts or external network.');
}finally{sqlite.close();await mf.dispose();}
