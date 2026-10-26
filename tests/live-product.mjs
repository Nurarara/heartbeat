// Local HTTP journey only. Never calls generation, email delivery or payment APIs.
import assert from 'node:assert/strict';
const origin=process.env.HEARTBEAT_TEST_URL||'http://localhost:5173';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))throw new Error('This disposable-account test is local-only.');
let cookie='',created=false;const address=`qa-${crypto.randomUUID()}@example.test`,password=crypto.randomUUID()+crypto.randomUUID();
async function call(path,body){const r=await fetch(`${origin}/api/product/${path}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});return r;}
try {
 const guest=await (await call('auth/session')).json();assert.equal(guest.local,true,'Run product:prepare and restart the local server first');
 for(const route of ['/','/auth','/pricing','/app','/display','/privacy','/terms','/desktop-guide']){const r=await fetch(origin+route,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,route);}
 for(const route of ['/local-study','/story','/pulse','/api/world','/api/heartbeat','/prototype/index.html']){const r=await fetch(origin+route,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,process.env.HEARTBEAT_TEST_LEGACY_ROUTES==='true'?200:404,route);}
 const signup=await call('auth/register',{email:address,password});assert.equal(signup.status,200);cookie=signup.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);created=true;
 assert.equal((await (await call('auth/session')).json()).user.email,address);
 const preferences={version:1,location:{name:'London',country:'United Kingdom',timezone:'Europe/London',latitude:51.5,longitude:-.12},unit:'c',seed:42,reducedMotion:true,style:'pencil'};
 assert.equal((await call('preferences',{preferences})).status,200);assert.deepEqual((await (await call('preferences')).json()).preferences,preferences);
 assert.deepEqual((await (await call('library')).json()).pictures,[]);
 assert.equal((await call('checkout',{plan:'studio'})).status,503,'Unconfigured checkout stays closed');
 console.log('Passed live HTTP landing/auth/studio/display/legal/desktop routes, account registration/session, preference persistence, empty private library and disabled billing. No generation, email or payment requested. Disposable account is revoked in cleanup; private deletion resumes in the background.');
}finally{if(created){const removed=await call('account/delete',{password});assert.equal(removed.status,200,'Disposable test account cleanup');}}
