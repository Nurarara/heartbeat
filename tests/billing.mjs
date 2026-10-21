import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';
import {webhook,priceCatalog} from '../lib/product/billing.ts';
let current=[],remoteEffects=0,holdFetch,releaseFetch;const idempotency=new Map(),requests=[];
const f=await fixture({env:{HEARTBEAT_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_STUDIO_PRICE_ID:'price_studio',STRIPE_ATELIER_PRICE_ID:'price_atelier'},fetcher:async(url,options)=>{
 const path=new URL(url).pathname;requests.push({path,body:options.body,key:options.headers['Idempotency-Key']});
 if(path.startsWith('/v1/prices/'))return Response.json({active:true,unit_amount:path.endsWith('atelier')?1600:800,currency:'gbp',recurring:{interval:'month',interval_count:1}});
 if(path==='/v1/subscriptions'){if(holdFetch)await new Promise(r=>releaseFetch=r);return Response.json({data:current,has_more:false});}
 if(path==='/v1/billing_portal/sessions')return Response.json({url:'https://billing.stripe.com/p/session/fixture'});
 const key=options.headers['Idempotency-Key'];if(!idempotency.has(key)){remoteEffects++;idempotency.set(key,path==='/v1/customers'?{id:'cus_Account1'}:{url:'https://checkout.stripe.com/c/pay_fixture'});}return Response.json(idempotency.get(key));
}});
async function signed(id,type='customer.subscription.updated',object={customer:'cus_Account1'},timestamp=Math.floor(f.now()/1000)) {
 const body=JSON.stringify({id,type,created:Math.floor(f.now()/1000),data:{object}});const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${body}`))),v=>v.toString(16).padStart(2,'0')).join('');
 return new Request(`${f.env.HEARTBEAT_APP_ORIGIN}/api/product/webhook`,{method:'POST',headers:{'Stripe-Signature':`t=${timestamp},v1=${signature}`},body});
}
const delivery=async(...args)=>f.service.handle(await signed(...args));
try {
 await assert.rejects(()=>priceCatalog({...f.env,STRIPE_ATELIER_PRICE_ID:f.env.STRIPE_STUDIO_PRICE_ID}),/distinct Stripe prices/);
 const a=await f.register();f.sqlite.prepare('UPDATE hb_users SET verified=1 WHERE id=?').run(a.data.user.id);const cookie=a.cookie;
 const catalog=await (await f.call('plans')).json();assert.equal(catalog.prices.studio.unitAmount,800);assert.equal(catalog.prices.studio.currency,'gbp');
 assert.equal((await f.call('checkout',{plan:'trial'},{cookie})).status,400);
 assert.equal((await f.call('checkout',{plan:'atelier',customer:'cus_Attacker',price:'price_cheaper'},{origin:'https://attacker.test',cookie})).status,403);
 const first=await f.call('checkout',{plan:'studio',customer:'cus_Attacker',price:'price_cheaper'},{cookie});assert.equal(first.status,200);const url=(await first.json()).url;
 const second=await f.call('checkout',{plan:'studio'},{cookie});assert.equal((await second.json()).url,url);assert.equal(remoteEffects,2,'One customer and one checkout are created');
 const form=new URLSearchParams(requests.find(r=>r.path==='/v1/checkout/sessions').body);assert.equal(form.get('customer'),'cus_Account1');assert.equal(form.get('line_items[0][price]'),'price_studio');assert.match(form.get('success_url'),/^http:\/\/localhost:5173\/app/);
 let session=await (await f.call('auth/session',undefined,{cookie})).json();assert.equal(session.access.plan,'trial','Checkout creation/success redirect cannot grant access');
 assert.equal((await f.call('portal',{}, {cookie})).status,200);
 const portal=new URLSearchParams(requests.find(r=>r.path==='/v1/billing_portal/sessions').body);assert.equal(portal.get('customer'),'cus_Account1');
 assert.equal((await f.service.handle(new Request('http://localhost:5173/api/product/webhook',{method:'POST',body:'{}'}))).status,400);
 assert.equal((await delivery('evt_Expired','customer.subscription.updated',{customer:'cus_Account1'},Math.floor(f.now()/1000)-301)).status,400);
 current=[{id:'sub_One',status:'active',current_period_start:f.now()/1000-60,current_period_end:f.now()/1000+86400*30,items:{data:[{price:{id:'price_studio'}}]}}];
 assert.equal((await delivery('evt_Paid')).status,200);session=await (await f.call('auth/session',undefined,{cookie})).json();assert.equal(session.access.plan,'studio');assert.equal(session.access.allowance,120);
 assert.equal((await delivery('evt_Paid')).status,200);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM hb_events').get().n,1);
 assert.equal((await f.call('checkout',{plan:'atelier'},{cookie})).status,409,'An existing subscriber is routed to manage billing');
 current[0].status='canceled';assert.equal((await delivery('evt_OldPayload','customer.subscription.created',{customer:'cus_Account1',status:'active'})).status,200);session=await (await f.call('auth/session',undefined,{cookie})).json();assert.equal(session.access.plan,'trial','An old payload cannot revive canceled access');
 // Events sharing a second remain distinct; current state, not timestamp order, wins.
 current[0].status='active';current[0].items.data[0].price.id='price_atelier';assert.equal((await delivery('evt_SameSecond')).status,200);assert.equal((await (await f.call('auth/session',undefined,{cookie})).json()).access.plan,'atelier');
 holdFetch=true;const firstConcurrent=delivery('evt_ConcurrentA');while(!releaseFetch)await new Promise(r=>setImmediate(r));const secondConcurrent=await delivery('evt_ConcurrentB');assert.equal(secondConcurrent.status,503);holdFetch=false;releaseFetch();assert.equal((await firstConcurrent).status,200);assert.equal((await delivery('evt_ConcurrentB')).status,200);
 // Failed storage must not acknowledge or mark an event processed.
 const realBatch=f.env.DB.batch;let fail=true;f.env.DB.batch=async statements=>{if(fail){fail=false;throw new Error('Mock transactional failure');}return realBatch(statements);};
 assert.equal((await delivery('evt_Retry')).status,503);assert.equal(f.sqlite.prepare('SELECT id FROM hb_events WHERE id=?').get('evt_Retry'),undefined);assert.equal((await delivery('evt_Retry')).status,200);f.env.DB.batch=realBatch;
 current[0].items.data[0].price.id='price_Unknown';await delivery('evt_UnknownPrice');assert.equal((await (await f.call('auth/session',undefined,{cookie})).json()).access.plan,'trial');
 current[0].items.data[0].price.id='price_studio';await delivery('evt_Refund','charge.refunded');await delivery('evt_AfterRefund');const review=await (await f.call('auth/session',undefined,{cookie})).json();assert.equal(review.access.eligible,false);assert.equal(review.access.plan,'trial');assert.equal(f.sqlite.prepare('SELECT review_required FROM hb_billing').get().review_required,1);
 console.log('Passed server-owned checkout/customer/price selection, durable idempotency, authenticated portal, signed/timely webhooks, duplicate/same-second/out-of-order events, concurrent reconciliation fencing, rollback/retry, unknown price rejection and persistent refund review. Stripe HTTP mocked; no payment taken.');
}finally{f.close();}
