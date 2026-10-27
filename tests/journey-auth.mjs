// Email adapter contract and real SQLite token lifecycle; no email is sent.
import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';

const f=await fixture({production:true,env:{HEARTBEAT_EMAIL_API_KEY:'fixture-email-key',HEARTBEAT_EMAIL_FROM:'Heartbeat <hello@heartbeat.example>'}});
const link=()=>new URL(f.emails.at(-1).text.match(/https:\/\/\S+/)[0]);
try{
 const response=await f.call('auth/register',{email:'journey@example.test',password:'a sufficiently long test password',continuation:'/onboarding?plan=atelier'});
 assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie').split(';')[0];
 assert.equal(link().origin,'https://heartbeat.example');assert.equal(link().pathname,'/auth');assert.equal(link().searchParams.get('next'),'/onboarding?plan=atelier');
 const verification=link().searchParams.get('verify');assert.match(verification,/^[a-f0-9]{64}$/);
 const initial=await (await f.call('auth/session',undefined,{cookie})).json();assert.equal(initial.user.verified,false);assert.equal(initial.access.eligible,false,'A retained paid-plan intent cannot bypass email verification');
 assert.equal((await f.call('auth/resend',{continuation:'https://evil.test/collect'},{cookie})).status,200);assert.equal(link().searchParams.get('next'),'/onboarding','An external continuation is replaced on the server');
 assert.equal((await f.call('auth/resend',{continuation:'/app?tab=account'},{cookie})).status,200);assert.equal(link().searchParams.get('next'),'/app?tab=account','Explicit account management can resume in the studio');
 assert.equal((await f.call('auth/forgot',{email:'journey@example.test',continuation:'//evil.test/collect'})).status,200);assert.equal(link().searchParams.get('next'),'/onboarding');assert.ok(link().searchParams.get('reset'));
 assert.equal((await f.call('auth/verify',{token:verification})).status,200);assert.equal((await f.call('auth/verify',{token:verification})).status,400,'Adding a continuation preserves one-use verification semantics');
 const verified=await (await f.call('auth/session',undefined,{cookie})).json();assert.equal(verified.user.verified,true);assert.equal(verified.access.plan,'trial','Verification does not activate a paid plan');
 assert.equal((await f.call('auth/forgot',{email:'journey@example.test',continuation:'/onboarding?plan=studio'})).status,200);assert.equal(link().searchParams.get('next'),'/onboarding?plan=studio');
 const reset=link().searchParams.get('reset');assert.equal((await f.call('auth/reset',{token:reset,password:'a different sufficiently long password'})).status,200);assert.equal((await (await f.call('auth/session',undefined,{cookie})).json()).user,null,'Password-reset continuation does not weaken credential revocation');
 assert.equal(f.emails.length,5);assert.ok(f.emails.every(message=>message.to[0]==='journey@example.test'));
 console.log('Passed email journey contracts: registration/resend/reset carry only safe internal destinations, malicious continuations are replaced, paid intent preserves verification/entitlement gates, one-use tokens and reset session revocation remain intact. SQLite real; delivery mocked.');
}finally{f.close();}
