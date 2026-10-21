import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';
import {hash} from '../lib/product/core.ts';
import {aiService} from '../lib/ai/service.ts';
import {runArtworkJob} from '../lib/product/jobs.ts';
import {planMoment} from '../lib/ambient-director.ts';
import {proposeCreativeMoment} from '../lib/creative.ts';
const f=await fixture();
const preferences={version:1,location:{name:'London',country:'United Kingdom',latitude:51.5,longitude:-.12,timezone:'Europe/London'},seed:42,unit:'c',reducedMotion:true};
try {
 assert.equal((await f.call('auth/register',{email:'alice@example.test',password:'short'})).status,400);
 assert.equal((await f.call('auth/register',{email:'alice@example.test',password:'a long test password'},{origin:'https://evil.test'})).status,403);
 const alice=await f.register(),bob=await f.register('bob@example.test');
 assert.match(alice.cookie,/heartbeat_account=[a-f0-9]{64}/);assert.ok(!f.sqlite.prepare('SELECT password_hash FROM hb_users WHERE id=?').get(alice.data.user.id).password_hash.includes('long test'));
 assert.equal((await f.call('library')).status,401);assert.equal((await f.call('library',undefined,{cookie:alice.cookie+'forged'})).status,401);
 assert.equal((await f.call('auth/login',{email:'alice@example.test',password:'wrong password'})).status,401);
 assert.equal((await f.call('auth/session',undefined,{cookie:alice.cookie})).status,200);
 assert.equal((await f.call('preferences',{preferences},{cookie:alice.cookie})).status,200);
 assert.equal((await (await f.call('preferences',undefined,{cookie:bob.cookie})).json()).preferences,null);
 assert.equal((await f.call('preferences',{preferences:{...preferences,location:{...preferences.location,latitude:999}}},{cookie:alice.cookie})).status,400);
 assert.equal((await f.call('checkout',{plan:'atelier'},{cookie:alice.cookie})).status,503);
 // Durable job creation is unique across concurrent requests; no inference occurs here.
 let starts=0;f.env.ARTWORK_WORKFLOW={create:async()=>{starts++;},get:async()=>({status:async()=>({status:'running'})})};
 const requestId=crypto.randomUUID();const input={requestId,location:preferences.location,force:true};
 const jobs=await Promise.all(Array.from({length:4},()=>f.call('generation',input,{cookie:alice.cookie})));
 assert.ok(jobs.every(r=>r.status===202));assert.equal(starts,1);
 const job=f.sqlite.prepare('SELECT * FROM hb_jobs WHERE owner=?').get(alice.data.user.id);
 let direct=0,generated=0;
 const dependencies={now:f.now,context:async()=>({temperature:7,weatherCode:63,observedAt:f.now(),fetchedAt:f.now(),isDay:true}),provider:()=>({direct:async packet=>{direct++;assert.equal(packet.context.weather.condition,'rain');return {action:'REIMAGINE',title:'Rain-softened water',reason:'A subdued afternoon calls for soft light.',prompt:'A calm rain-softened lake, subdued light.',lighting:'daylight',themeIds:[]};},generate:async()=>({bytes:new Uint8Array([255,216,++generated,255,217]),mime:'image/jpeg',width:1024,height:1024})})};
 await Promise.all([runArtworkJob(f.env,job.id,dependencies),runArtworkJob(f.env,job.id,dependencies)]);
 assert.equal(direct,1);assert.equal(generated,1);
 const result=await (await f.call(`generation?requestId=${requestId}`,undefined,{cookie:alice.cookie})).json();assert.equal(result.status,'ready');
 await runArtworkJob(f.env,job.id,dependencies);assert.equal(direct,1);
 assert.equal((await f.call(`generation?requestId=${requestId}`,undefined,{cookie:bob.cookie})).status,404);
 const picture=result.candidate;
 assert.equal((await f.call('favourite',{id:picture.id,favourite:true},{cookie:bob.cookie})).status,404);
 assert.equal((await f.call('favourite',{id:picture.id,favourite:true},{cookie:alice.cookie})).status,200);
 assert.equal((await (await f.call('library',undefined,{cookie:alice.cookie})).json()).pictures[0].favourite,true);
 const ai=aiService(f.env,dependencies),aiCall=(path,body,cookie=alice.cookie)=>ai.handle(new Request(`${f.env.HEARTBEAT_APP_ORIGIN}/api/ai/${path}`,{method:body?'POST':'GET',headers:{Origin:f.env.HEARTBEAT_APP_ORIGIN,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 assert.equal((await aiCall(`art/${picture.id}`,null,bob.cookie)).status,404);
 for(let i=0;i<2;i++){f.advance(3600000);assert.equal((await (await aiCall('prepare',{...input,requestId:crypto.randomUUID()})).json()).status,'ready');}
 f.advance(3600000);const quota=await (await aiCall('prepare',{...input,requestId:crypto.randomUUID(),plan:'atelier'})).json();assert.equal(quota.status,'held');assert.equal(direct,3,'Browser plan fields cannot override account allowances');
 const limited=aiService({...f.env,HEARTBEAT_AI_DAILY_LIMIT:'3'},dependencies);
 const statusFor=async cookie=>(await limited.handle(new Request(`${f.env.HEARTBEAT_APP_ORIGIN}/api/ai/status`,{headers:{Cookie:cookie}}))).json();
 const capacity=await statusFor(bob.cookie);assert.equal(capacity.available,false);assert.match(capacity.reason,/Daily generation capacity/);assert.equal(capacity.capacityResetAt,Date.parse('2026-10-22T00:00:00Z'));
 const allowance=await statusFor(alice.cookie);assert.match(allowance.reason,/picture allowance/);assert.equal(allowance.capacityResetAt,undefined,'A shared-cap reset must not promise renewed customer allowance');
 const charlie=await f.register('charlie@example.test');
 const failedService=aiService(f.env,{...dependencies,provider:()=>({direct:async()=>{throw new Error('Mock provider failure');},generate:async()=>{throw new Error('Must not generate');}})});
 const failure=await failedService.handle(new Request(`${f.env.HEARTBEAT_APP_ORIGIN}/api/ai/prepare`,{method:'POST',headers:{Origin:f.env.HEARTBEAT_APP_ORIGIN,Cookie:charlie.cookie,'Content-Type':'application/json'},body:JSON.stringify({...input,requestId:crypto.randomUUID()})}));assert.equal((await failure.json()).status,'failed');
 assert.equal((await (await f.call('auth/session',undefined,{cookie:charlie.cookie})).json()).access.used,0,'A failed preparation spends the operating attempt but returns the customer picture allowance');
 // Device tokens have a narrower scope than account sessions and are revocable.
 const pairing=await (await f.call('device/start',{})).json();assert.match(pairing.code,/^\d{6}$/);
 assert.equal((await (await f.call('device/status',undefined,{headers:{Authorization:`Bearer ${pairing.token}`}})).json()).paired,false);
 assert.equal((await f.call('device/approve',{code:pairing.code},{cookie:alice.cookie})).status,200);
 assert.equal((await f.call('device/approve',{code:pairing.code},{cookie:bob.cookie})).status,400);
 const paired=await (await f.call('device/status',undefined,{headers:{Authorization:`Bearer ${pairing.token}`}})).json();assert.equal(paired.paired,true);
 assert.equal((await f.call('library',undefined,{headers:{Authorization:`Bearer ${pairing.token}`}})).status,401);
 assert.equal((await f.call(`device/art/${picture.id}`,undefined,{headers:{Authorization:`Bearer ${pairing.token}`}})).status,200);
 const bobPair=await (await f.call('device/start',{})).json();await f.call('device/approve',{code:bobPair.code},{cookie:bob.cookie});
 assert.equal((await f.call(`device/art/${picture.id}`,undefined,{headers:{Authorization:`Bearer ${bobPair.token}`}})).status,404);
 await f.call('device/revoke',{id:pairing.deviceId},{cookie:alice.cookie});assert.equal((await f.call('device/status',undefined,{headers:{Authorization:`Bearer ${pairing.token}`}})).status,401);
 for(let i=0;i<99;i++)f.sqlite.prepare('INSERT INTO hb_likes(id,user_id,attempt_id) VALUES (?,?,?)').run(crypto.randomUUID(),alice.data.user.id,crypto.randomUUID());
 const extra=f.sqlite.prepare('SELECT id FROM ai_attempts WHERE owner=? AND id!=? AND art_key IS NOT NULL LIMIT 1').get(alice.data.user.id,picture.id);
 assert.equal((await f.call('favourite',{id:extra.id,favourite:true},{cookie:alice.cookie})).status,409,'Favourite retention has a bounded account allowance');
 assert.equal((await f.call('favourite',{id:picture.id,favourite:false},{cookie:alice.cookie})).status,200);
 assert.equal((await f.call('favourite',{id:extra.id,favourite:true},{cookie:alice.cookie})).status,200);
 await f.call('auth/logout',{}, {cookie:bob.cookie});assert.equal((await (await f.call('auth/session',undefined,{cookie:bob.cookie})).json()).user,null);
 f.advance(31*86400000);assert.equal((await f.call('library',undefined,{cookie:alice.cookie})).status,401);
 console.log('Passed accounts/private library, CSRF and session expiry, password hashing, account isolation, durable job deduplication/recovery, real AI ownership and lifetime quota enforcement, forged plan rejection, and revocable scoped device pairing. SQLite real; provider/workflow/email mocked.');
} finally {f.close();}
// Production verification, password reset and one-use tokens.
const p=await fixture({production:true,env:{HEARTBEAT_EMAIL_API_KEY:'mock-email-key',HEARTBEAT_EMAIL_FROM:'Heartbeat <hello@example.test>'}});
try {
 const a=await p.register('verified@example.test');assert.match(a.cookie,/heartbeat_account=/);
 const account=await (await p.call('auth/session',undefined,{cookie:a.cookie})).json();assert.equal(account.access.eligible,false);assert.equal(account.local,false);
 const verify=p.emails[0].text.match(/verify=([a-f0-9]{64})/)[1];assert.equal((await p.call('auth/verify',{token:verify})).status,200);assert.equal((await p.call('auth/verify',{token:verify})).status,400);
 assert.equal((await (await p.call('auth/session',undefined,{cookie:a.cookie})).json()).user.verified,true);
 await p.call('auth/forgot',{email:'verified@example.test'});const reset=p.emails.at(-1).text.match(/reset=([a-f0-9]{64})/)[1];
 assert.equal((await p.call('auth/reset',{token:reset,password:'another long password'})).status,200);
 assert.equal((await p.call('auth/reset',{token:reset,password:'malicious different password'})).status,400);
 assert.equal((await p.call('library',undefined,{cookie:a.cookie})).status,401);
 assert.equal((await p.call('auth/login',{email:'verified@example.test',password:'a long test password'})).status,401);
 const login=await p.call('auth/login',{email:'verified@example.test',password:'another long password'});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly.*SameSite=Lax.*Secure/);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await p.call('account/delete',{password:'wrong'},{cookie})).status,403);
 assert.equal((await p.call('account/delete',{password:'another long password'},{cookie})).status,200);
 assert.equal(p.sqlite.prepare('SELECT COUNT(*) AS n FROM hb_users').get().n,0);
 console.log('Passed production verification gate, one-use verification/reset links, reset revokes all sessions, HTTPS secure cookies and password-confirmed account deletion. No email sent.');
}finally{p.close();}
