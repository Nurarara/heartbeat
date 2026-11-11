import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './product-fixture.mjs';
import {issueRecoveryLink,localOrigin} from '../scripts/local-account-recovery.mjs';
const f=await fixture();
try{
 const user=await f.register('local-owner@example.test');
 const unavailable=await f.call('auth/forgot',{email:'local-owner@example.test'});assert.equal(unavailable.status,503);assert.match((await unavailable.json()).error,/not configured/);
 const link=new URL(await issueRecoveryLink(' LOCAL-OWNER@example.test ','http://localhost:5173',async sql=>!!f.sqlite.prepare(sql).get(),f.now()));
 assert.equal(link.origin,'http://localhost:5173');const token=link.searchParams.get('reset');assert.match(token,/^[a-f0-9]{64}$/);assert.ok(f.sqlite.prepare('SELECT hash FROM hb_tokens WHERE hash=?').get(createHash('sha256').update(token).digest('hex')));
 assert.equal((await f.call('auth/reset',{token,password:'a brand new secure password'})).status,200);assert.equal((await f.call('auth/reset',{token,password:'a brand new secure password'})).status,400);
 assert.equal((await (await f.call('auth/session',undefined,{cookie:user.cookie})).json()).user,null);assert.equal((await f.call('auth/login',{email:'  LOCAL-OWNER@example.test  ',password:'a brand new secure password'})).status,200);
 assert.throws(()=>localOrigin('https://example.com'),/loopback/);assert.throws(()=>localOrigin('http://localhost.evil.test:5173'),/loopback/);
 await assert.rejects(()=>issueRecoveryLink("nobody'OR'1'='1'--@example.test",'http://localhost:5173',async sql=>!!f.sqlite.prepare(sql).get(),f.now()),/No active local account/);
 console.log('Passed honest missing-email status, local-only recovery link, SQL quoting, one-use reset and existing-session revocation. SQLite real; no email or network used.');
}finally{f.close();}
