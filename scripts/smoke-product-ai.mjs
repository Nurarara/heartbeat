// Explicit, local-only, one live paid attempt maximum. No retries of generation POST.
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
if(!process.argv.includes('--live-ai'))throw new Error('Pass --live-ai deliberately. This test may use one real preparation attempt.');
const origin='http://localhost:5173';let cookie='',created=false,requestId=crypto.randomUUID();const address=`workflow-qa-${crypto.randomUUID()}@example.test`,password=crypto.randomUUID()+crypto.randomUUID();
async function api(path,body){return fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});}
try {
 const local=await (await api('/api/product/auth/session')).json();assert.equal(local.local,true,'This test is local development only.');
 const signup=await api('/api/product/auth/register',{email:address,password});assert.equal(signup.status,200);created=true;cookie=signup.headers.get('set-cookie').split(';')[0];
 const status=await (await api('/api/ai/status')).json();if(!status.available||status.remaining<2)throw new Error('Insufficient operating allowance; preserving the remaining attempt. No generation requested.');
 const preferences={version:1,location:{name:'London',country:'United Kingdom',timezone:'Europe/London',latitude:51.5085,longitude:-.1257},seed:42,unit:'c',reducedMotion:true,style:'pencil'};
 assert.equal((await api('/api/product/preferences',{preferences})).status,200);
 const prepared=await api('/api/product/generation',{requestId,location:preferences.location,force:true,style:'pencil'});const first=await prepared.json();assert.equal(prepared.status,202,first.error||first.reason);
 console.log('One background job queued. Polling its stored result; the generation POST will not be repeated.');
 let result=first;const deadline=Date.now()+240000;
 while(result.status==='pending'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,3000));const r=await api(`/api/product/generation?requestId=${requestId}`);result=await r.json();}
 assert.equal(result.status,'ready',result.reason||result.error||'The job did not finish within the test window.');
 const image=await api(result.candidate.direction.artwork.url);assert.equal(image.status,200);const bytes=new Uint8Array(await image.arrayBuffer());assert.ok(bytes.length>10000);
 await mkdir('outputs',{recursive:true});await writeFile('outputs/product-workflow-live.jpg',bytes);await writeFile('outputs/product-workflow-live.json',JSON.stringify({testedAt:new Date().toISOString(),status:'ready',title:result.candidate.direction.artwork.title,phase:result.candidate.direction.phase,reason:result.candidate.direction.reason,prompt:result.candidate.direction.artwork.proposal.prompt,imageBytes:bytes.length,scope:'Real local Workflow emulator + Cloudflare provider + account-owned private R2 retrieval. No browser display ACK.'},null,2));
 console.log('Live customer account → durable background job → AI director → generated JPEG → private retrieval passed. Picture saved to outputs/product-workflow-live.jpg. One operating attempt used.');
}finally{if(created){const removed=await api('/api/product/account/delete',{password});if(removed.status!==200)console.log('Disposable QA account cleanup deferred because its background work is still in progress. No second inference request was made.');}}
