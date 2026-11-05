import assert from 'node:assert/strict';
import {fixture} from './product-fixture.mjs';
import {checkout,portal,priceCatalog,STRIPE_API_VERSION} from '../lib/product/billing.ts';
import {processBillingInbox,reconcileBilling,recoverBilling,cancelPendingCheckout,resolveBillingReview,retryBillingEvent} from '../lib/product/billing-recovery.ts';
import {beginAccountDeletion} from '../lib/product/lifecycle.ts';

async function harness(){
 const state={current:[],requests:[],effects:0,sessions:new Map(),idempotency:new Map(),charges:new Map(),payments:new Map(),hook:null};let f;
 const fetcher=async(url,options)=>{
  const u=new URL(url),path=u.pathname,form=new URLSearchParams(options.body),key=options.headers['Idempotency-Key'];state.requests.push({path,method:options.method,body:options.body,key});assert.equal(options.headers['Stripe-Version'],STRIPE_API_VERSION);
  const override=await state.hook?.({url:u,path,options,form,key});if(override)return override;
  if(path.startsWith('/v1/prices/'))return Response.json({id:path.split('/').at(-1),active:true,unit_amount:path.endsWith('atelier')?1600:800,currency:'gbp',recurring:{interval:'month',interval_count:1}});
  if(path==='/v1/subscriptions')return Response.json({object:'list',data:state.current,has_more:false});
  if(path==='/v1/billing_portal/sessions')return Response.json({url:'https://billing.stripe.com/p/session/fixture'});
  if(path.startsWith('/v1/charges/'))return Response.json(state.charges.get(path.split('/').at(-1))||{});
  if(path.startsWith('/v1/payment_intents/'))return Response.json(state.payments.get(path.split('/').at(-1))||{});
  if(path.startsWith('/v1/checkout/sessions/cs_')){const id=path.split('/')[4],session=state.sessions.get(id);assert.ok(session,`Mock session ${id} must exist`);if(path.endsWith('/expire'))session.status='expired';return Response.json(session);}
  if(state.idempotency.has(key)){assert.equal(state.idempotency.get(key).body,String(options.body),'Ambiguous retries preserve the exact request');return Response.json(state.idempotency.get(key).value);}
  state.effects++;let value;
  if(path==='/v1/customers')value={id:`cus_Account${state.effects}`,object:'customer'};
  else if(path==='/v1/checkout/sessions'){value={id:`cs_test_${state.effects}`,object:'checkout.session',mode:'subscription',customer:form.get('customer'),client_reference_id:form.get('client_reference_id'),status:'open',url:`https://checkout.stripe.com/c/pay_${state.effects}`,expires_at:Number(form.get('expires_at'))};state.sessions.set(value.id,value);}
  else throw new Error(`Unexpected Stripe request ${path}`);
  state.idempotency.set(key,{body:String(options.body),value});return Response.json(value);
 };
 f=await fixture({env:{HEARTBEAT_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_STUDIO_PRICE_ID:'price_studio',STRIPE_ATELIER_PRICE_ID:'price_atelier'},fetcher});
 const account=await f.register();f.sqlite.prepare('UPDATE hb_users SET verified=1 WHERE id=?').run(account.data.user.id);const user=f.sqlite.prepare('SELECT * FROM hb_users WHERE id=?').get(account.data.user.id);
 async function signed(id,type='customer.subscription.updated',fields={},extra={}){
  const object=type.startsWith('checkout.')?'checkout.session':type.startsWith('customer.subscription.')?'subscription':type.startsWith('invoice.')?'invoice':type.startsWith('charge.dispute.')?'dispute':'charge';
  const prefix={subscription:'sub_','checkout.session':'cs_test_',invoice:'in_',dispute:'du_',charge:'ch_'}[object];
  const customer=f.sqlite.prepare('SELECT customer_id FROM hb_billing WHERE user_id=?').get(user.id).customer_id;
  const event={id,object:'event',api_version:STRIPE_API_VERSION,livemode:false,type,created:Math.floor(f.now()/1000),data:{object:{id:`${prefix}Fixture`,object,customer,...fields}},...extra};
  const body=JSON.stringify(event),timestamp=Math.floor(f.now()/1000),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(f.env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${body}`))),v=>v.toString(16).padStart(2,'0')).join('');
  return new Request(`${f.env.HEARTBEAT_APP_ORIGIN}/api/product/webhook`,{method:'POST',headers:{'Stripe-Signature':`t=${timestamp}, v1=${signature}`},body});
 }
 const receipt=async(...args)=>f.service.handle(await signed(...args));
 const process=options=>processBillingInbox(f.env,{now:f.now(),fetcher,...options});
 const delivery=async(...args)=>{const response=await receipt(...args);if(response.ok)await process();return response;};
 const billing=()=>f.sqlite.prepare('SELECT * FROM hb_billing WHERE user_id=?').get(user.id);
 const access=async()=>(await (await f.call('auth/session',undefined,{cookie:account.cookie})).json()).access;
 const subscription=(price='price_studio',status='active',id='sub_One')=>({id,object:'subscription',customer:billing().customer_id,status,items:{data:[{id:'si_One',object:'subscription_item',quantity:1,price:{id:price,object:'price'},current_period_start:Math.floor(f.now()/1000)-60,current_period_end:Math.floor(f.now()/1000)+86400*30}]}});
 return {f,state,fetcher,user,account,receipt,delivery,process,billing,access,subscription,close:f.close};
}

// Checkout is an account-owned durable intent, not a price/time-bucket request.
{
 const h=await harness(),{f,state,user,account,fetcher}=h;
 try{
  await assert.rejects(()=>priceCatalog({...f.env,STRIPE_ATELIER_PRICE_ID:f.env.STRIPE_STUDIO_PRICE_ID}),/distinct/);
  assert.equal((await f.call('checkout',{plan:'atelier'},{origin:'https://attacker.test',cookie:account.cookie})).status,403);
  const first=await checkout(user,'studio',f.env,f.now(),fetcher);assert.equal(state.effects,2);
  assert.equal((await checkout(user,'studio',f.env,f.now(),fetcher)).url,first.url);assert.equal(state.effects,2);
  await assert.rejects(()=>checkout(user,'atelier',f.env,f.now(),fetcher),/existing checkout/);
  f.advance(31*60000);assert.equal((await checkout(user,'studio',f.env,f.now(),fetcher)).url,first.url,'Crossing old 30-minute buckets preserves one intent');
  const rows=f.sqlite.prepare("SELECT * FROM hb_checkout WHERE status='open'").all();assert.equal(rows.length,1);assert.ok(rows[0].session_id);assert.ok(rows[0].expires_at>f.now());
  const form=new URLSearchParams(state.requests.find(r=>r.path==='/v1/checkout/sessions').body);assert.equal(form.get('customer'),h.billing().customer_id);assert.equal(form.get('client_reference_id'),user.id);assert.equal(form.get('line_items[0][price]'),'price_studio');assert.equal(form.get('expires_at'),String(rows[0].expires_at/1000));
  assert.equal((await h.access()).plan,'trial','A checkout or return URL cannot grant membership');
  const session=state.sessions.get(rows[0].session_id);session.customer='cus_Attacker';await assert.rejects(()=>checkout(user,'studio',f.env,f.now(),fetcher),/ownership/);await assert.rejects(()=>cancelPendingCheckout(user,f.env,f.now(),fetcher),/ownership/);session.customer=h.billing().customer_id;
  session.client_reference_id='another-user';await assert.rejects(()=>checkout(user,'studio',f.env,f.now(),fetcher),/ownership/);session.client_reference_id=user.id;
  await portal(user,f.env,fetcher);assert.equal(new URLSearchParams(state.requests.find(r=>r.path==='/v1/billing_portal/sessions').body).get('customer'),h.billing().customer_id);
  await cancelPendingCheckout(user,f.env,f.now(),fetcher);assert.equal(session.status,'expired');assert.equal(f.sqlite.prepare('SELECT status FROM hb_checkout WHERE id=?').get(rows[0].id).status,'expired');
  const next=await checkout(user,'atelier',f.env,f.now(),fetcher);assert.notEqual(next.url,first.url);assert.equal(state.effects,3,'Old remote session is expired before another intent is created');
  // A canceled subscription does not mark a new open checkout complete.
  state.current=[h.subscription('price_studio','canceled')];await recoverBilling(user,f.env,f.now(),fetcher);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_checkout WHERE status='open'").get().n,1);
  state.current=[h.subscription()];await assert.rejects(()=>checkout(user,'studio',f.env,f.now(),fetcher),/existing subscription/);assert.equal((await h.access()).plan,'studio','Missing webhook can be recovered before another purchase');
  assert.equal((await f.call('ops/resolve-billing',{actor:'customer',reason:'Please clear this review',userId:user.id,expectedReviewEventId:'evt_Fake'},{cookie:account.cookie})).status,401,'Customer sessions cannot operate billing review');
 }finally{h.close();}
}

// Raw receipt is durable before ACK; processing is asynchronous and recoverable.
{
 const h=await harness(),{f,state,user,fetcher}=h;
 try{
  await checkout(user,'studio',f.env,f.now(),fetcher);state.current=[h.subscription()];
  const before=state.requests.length;assert.equal((await h.receipt('evt_Paid')).status,200);assert.equal(state.requests.length,before,'No Stripe request is made before acknowledgement');assert.equal((await h.access()).plan,'trial');
  assert.equal(f.sqlite.prepare("SELECT status FROM hb_billing_inbox WHERE id='evt_Paid'").get().status,'pending');await h.process();assert.equal((await h.access()).plan,'studio');
  await h.receipt('evt_Paid','customer.subscription.updated',{}, {pending_webhooks:99});await h.process();assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_events').get().n,1,'Volatile delivery-envelope fields do not conflict');
  assert.equal((await h.receipt('evt_Paid','customer.subscription.updated',{customer:'cus_Another'})).status,409,'Same ID cannot change its customer reference');
  const rawPrepare=f.env.DB.prepare;f.env.DB.prepare=sql=>{if(sql.startsWith('INSERT OR IGNORE INTO hb_billing_inbox'))return {bind:()=>({run:async()=>{throw new Error('Disk unavailable');}})};return rawPrepare(sql);};
  assert.equal((await h.receipt('evt_NoStorage')).status,503);f.env.DB.prepare=rawPrepare;assert.equal(f.sqlite.prepare("SELECT id FROM hb_billing_inbox WHERE id='evt_NoStorage'").get(),undefined);
  assert.equal((await f.service.handle(new Request(`${f.env.HEARTBEAT_APP_ORIGIN}/api/product/webhook`,{method:'POST',body:'{}'}))).status,400);
  for(const [id,extra,error] of [['evt_Version',{api_version:'2024-01-01'},'api_version_mismatch'],['evt_Mode',{livemode:true},'livemode_mismatch'],['evt_NoVersion',{api_version:null},'api_version_mismatch']]){await h.receipt(id,'invoice.paid',{},extra);const row=f.sqlite.prepare('SELECT * FROM hb_billing_inbox WHERE id=?').get(id);assert.equal(row.status,'failed');assert.equal(row.last_error,error);}
  await h.receipt('evt_Contract','charge.dispute.created',{object:'charge'});assert.equal(f.sqlite.prepare("SELECT last_error FROM hb_billing_inbox WHERE id='evt_Contract'").get().last_error,'object_contract_mismatch');
  const missingBefore=state.requests.length;await h.receipt('evt_Unmapped','invoice.paid',{customer:'cus_NotMapped'});await h.process();assert.equal(f.sqlite.prepare("SELECT status FROM hb_billing_inbox WHERE id='evt_Unmapped'").get().status,'retry');assert.equal(state.requests.length,missingBefore,'Unknown customers remain durable without accessing another account');
  // An interrupted final commit leaves no processed-event tombstone.
  await h.receipt('evt_Rollback');const batch=f.env.DB.batch;let fail=true;f.env.DB.batch=async statements=>{if(fail){fail=false;throw new Error('Transactional write failed');}return batch(statements);};await h.process();f.env.DB.batch=batch;assert.equal(f.sqlite.prepare("SELECT id FROM hb_events WHERE id='evt_Rollback'").get(),undefined);assert.equal(f.sqlite.prepare("SELECT status FROM hb_billing_inbox WHERE id='evt_Rollback'").get().status,'retry');f.advance(60000);await h.process();assert.equal(f.sqlite.prepare("SELECT status FROM hb_billing_inbox WHERE id='evt_Rollback'").get().status,'processed');
  // Current Stripe state, not webhook payload order, controls cancellation/changes.
  state.current[0].status='canceled';await h.delivery('evt_Old','customer.subscription.created',{status:'active'});assert.equal((await h.access()).plan,'trial');state.current=[h.subscription('price_atelier')];await h.delivery('evt_New');assert.equal((await h.access()).plan,'atelier');
  state.hook=({path})=>path==='/v1/subscriptions'?new Response('{}',{status:503}):null;await h.receipt('evt_Outage');await h.process();assert.equal((await h.access()).plan,'atelier','Transient provider failure retains previously confirmed membership');assert.equal(h.billing().reconcile_failures,1);assert.equal(f.sqlite.prepare("SELECT status FROM hb_billing_inbox WHERE id='evt_Outage'").get().status,'retry');state.hook=null;
  // Scheduled repair does not depend on a browser or delivered webhook.
  f.advance(16*60000);state.current=[h.subscription('price_studio')];assert.equal((await reconcileBilling(f.env,{now:f.now(),fetcher,limit:1})).reconciled,1);assert.equal((await h.access()).plan,'studio');assert.equal((await reconcileBilling(f.env,{now:f.now(),fetcher,limit:0})).reconciled,0);
  const privateFields=JSON.stringify({address:'secret address',card:'secret card',receipt_url:'https://private.test'});await h.receipt('evt_Minimal','invoice.paid',{metadata:JSON.parse(privateFields)});const stored=f.sqlite.prepare("SELECT payload FROM hb_billing_inbox WHERE id='evt_Minimal'").get().payload;assert.ok(!stored.includes('secret'));assert.ok(!stored.includes('private.test'));
 }finally{h.close();}
}

// Real dispute objects reference charges/PaymentIntents, not a direct customer.
{
 const h=await harness(),{f,state,user,fetcher}=h;
 try{
  await checkout(user,'studio',f.env,f.now(),fetcher);state.current=[h.subscription()];await h.delivery('evt_Start');
  state.charges.set('ch_Disputed',{id:'ch_Disputed',object:'charge',customer:{id:h.billing().customer_id}});
  await h.delivery('evt_Dispute','charge.dispute.created',{id:'du_Disputed',customer:null,charge:'ch_Disputed',payment_intent:null});assert.equal(h.billing().review_required,1);assert.equal(f.sqlite.prepare("SELECT status FROM hb_billing_inbox WHERE id='evt_Dispute'").get().status,'processed');assert.equal((await h.access()).eligible,false);
  state.payments.set('pi_Disputed',{id:'pi_Disputed',object:'payment_intent',customer:h.billing().customer_id});await h.delivery('evt_PaymentDispute','charge.dispute.created',{id:'du_Payment',customer:null,charge:null,payment_intent:'pi_Disputed'});
  state.charges.set('ch_Fallback',{id:'ch_Fallback',object:'charge',customer:null,payment_intent:'pi_Disputed'});await h.delivery('evt_Fallback','charge.dispute.created',{id:'du_Fallback',customer:null,charge:'ch_Fallback'});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_billing_reviews WHERE resolved_at IS NULL").get().n,3);
  const resolve=event=>resolveBillingReview(f.env,{userId:user.id,actor:'operator@example.test',reason:'Reviewed provider evidence and restored access',expectedReviewEventId:event,now:f.now(),fetcher});
  assert.equal((await resolve('evt_Dispute')).resolved,true);assert.equal(h.billing().review_required,1,'Resolving one review cannot clear two others');assert.equal((await resolve('evt_Dispute')).resolved,false,'Resolution replay has no duplicate audit');assert.equal((await resolve('evt_Unknown')).resolved,false);
  await resolve('evt_PaymentDispute');await resolve('evt_Fallback');assert.equal(h.billing().review_required,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_billing_audit WHERE action='resolve_review'").get().n,3);assert.equal((await h.access()).plan,'studio');
  // Replay after audited resolution cannot reopen an already resolved review.
  await h.receipt('evt_Dispute','charge.dispute.created',{id:'du_Disputed',customer:null,charge:'ch_Disputed',payment_intent:null});await h.process();assert.equal(h.billing().review_required,0);
  state.hook=({path})=>path==='/v1/subscriptions'?new Response('{}',{status:503}):null;await h.receipt('evt_Refund','charge.refunded');await h.process();assert.equal(h.billing().review_required,1,'Refund hold is durable even when current subscription lookup fails');state.hook=null;f.advance(60000);await h.process();await resolve('evt_Refund');
  state.current=[h.subscription(),h.subscription('price_atelier','active','sub_Two')];await recoverBilling(user,f.env,f.now(),fetcher);await assert.rejects(()=>resolve(`multiple:${user.id}`),/provider subscription conflict/);assert.equal(h.billing().review_required,1);state.current=[h.subscription()];assert.equal((await resolve(`multiple:${user.id}`)).resolved,true);
  f.advance(1000);state.current=[h.subscription(),h.subscription('price_atelier','active','sub_Two')];await recoverBilling(user,f.env,f.now(),fetcher);assert.equal(h.billing().review_required,1,'A recurring provider conflict reopens its review and retains the previous resolution audit');state.current=[h.subscription()];await resolve(`multiple:${user.id}`);
  state.current=[h.subscription('price_Unknown')];await recoverBilling(user,f.env,f.now(),fetcher);assert.equal((await h.access()).plan,'trial');await assert.rejects(()=>resolve(`contract:${user.id}`),/provider subscription conflict/);state.current=[h.subscription()];await resolve(`contract:${user.id}`);assert.equal(h.billing().review_required,0);
 }finally{h.close();}
}

// Lease loss and ambiguous external responses are tested without real waiting or payments.
{
 const h=await harness(),{f,state,user,fetcher}=h;
 try{
  // Lost creation storage retains one intent and replays the exact provider key.
  const prepare=f.env.DB.prepare;let fail=true;f.env.DB.prepare=sql=>{if(sql.startsWith('UPDATE hb_checkout SET session_id=')&&fail){fail=false;return {bind:()=>({run:async()=>{throw new Error('Lost storage response');}})};}return prepare(sql);};
  await assert.rejects(()=>checkout(user,'studio',f.env,f.now(),fetcher),/Lost storage response/);f.env.DB.prepare=prepare;const created=state.effects;await checkout(user,'studio',f.env,f.now(),fetcher);assert.equal(state.effects,created);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_checkout').get().n,1);
  // Parallel cross-plan calls serialize even before the first provider response.
  await cancelPendingCheckout(user,f.env,f.now(),fetcher);let release,started;const entered=new Promise(r=>started=r);state.hook=async({path,options})=>{if(path==='/v1/checkout/sessions'&&options.method==='POST'){started();await new Promise(r=>release=r);}return null;};
  const first=checkout(user,'studio',f.env,f.now(),fetcher);await entered;await assert.rejects(()=>checkout(user,'atelier',f.env,f.now(),fetcher),/already being prepared/);release();await first;state.hook=null;assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_checkout WHERE status IN ('creating','open','confirming')").get().n,1);
  const awaiting=f.sqlite.prepare("SELECT * FROM hb_checkout WHERE status='open'").get(),remote=state.sessions.get(awaiting.session_id),effects=state.effects;remote.status='complete';remote.subscription='sub_One';
  await assert.rejects(()=>checkout(user,'studio',f.env,f.now(),fetcher),/payment is confirming/);await assert.rejects(()=>checkout(user,'studio',f.env,f.now(),fetcher),/payment is confirming/);assert.equal(state.effects,effects,'A complete checkout with a not-yet-visible subscription cannot create another membership');assert.equal(f.sqlite.prepare('SELECT status FROM hb_checkout WHERE id=?').get(awaiting.id).status,'confirming');
  state.current=[h.subscription()];await h.delivery('evt_Initial');
  const previous=h.billing().plan;state.current=[h.subscription('price_atelier')];state.hook=({path})=>{if(path==='/v1/subscriptions')f.sqlite.prepare('UPDATE hb_billing SET lock_until=0 WHERE user_id=?').run(user.id);return null;};await assert.rejects(()=>recoverBilling(user,f.env,f.now(),fetcher),/lease expired/);assert.equal(h.billing().plan,previous,'Expired account lease cannot overwrite entitlement');state.hook=null;
  await h.receipt('evt_ExpiredInbox');state.hook=({path})=>{if(path==='/v1/subscriptions')f.sqlite.prepare("UPDATE hb_billing_inbox SET lock_until=0 WHERE id='evt_ExpiredInbox'").run();return null;};await h.process();assert.equal(f.sqlite.prepare("SELECT id FROM hb_events WHERE id='evt_ExpiredInbox'").get(),undefined,'Expired inbox lease cannot create a processed tombstone');assert.equal(f.sqlite.prepare("SELECT status FROM hb_billing_inbox WHERE id='evt_ExpiredInbox'").get().status,'processing');state.hook=null;await h.process();assert.equal(f.sqlite.prepare("SELECT status FROM hb_billing_inbox WHERE id='evt_ExpiredInbox'").get().status,'processed');
  await h.receipt('evt_DeadLetter','invoice.paid',{customer:'cus_Unmapped'});f.sqlite.prepare("UPDATE hb_billing_inbox SET attempts=11 WHERE id='evt_DeadLetter'").run();await h.process();assert.equal(f.sqlite.prepare("SELECT status FROM hb_billing_inbox WHERE id='evt_DeadLetter'").get().status,'failed');
  const retryInput={eventId:'evt_DeadLetter',actor:'support@example.test',reason:'Verified customer mapping and request another bounded retry',now:f.now()};assert.equal((await retryBillingEvent(f.env,retryInput)).retried,true);assert.equal((await retryBillingEvent(f.env,retryInput)).retried,false);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_billing_audit WHERE action='retry_event'").get().n,1);
  await h.receipt('evt_Quarantined','invoice.paid',{}, {api_version:'2020-01-01'});assert.equal((await retryBillingEvent(f.env,{...retryInput,eventId:'evt_Quarantined'})).retried,false,'Operator retry cannot bypass a provider contract quarantine');
  // Advance the worker's monotonic clock beyond its lease without sleeping.
  const original=Object.getOwnPropertyDescriptor(performance,'now');let elapsed=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>elapsed});
  try{state.current=[h.subscription('price_studio')];const saved=h.billing().plan;state.hook=({path})=>{if(path==='/v1/subscriptions')elapsed+=121000;return null;};await assert.rejects(()=>recoverBilling(user,f.env,f.now(),fetcher),/lease expired/);assert.equal(h.billing().plan,saved,'Elapsed execution time, not request-start time, governs lease expiry');}finally{if(original)Object.defineProperty(performance,'now',original);else Reflect.deleteProperty(performance,'now');state.hook=null;}
  f.sqlite.prepare("UPDATE hb_users SET lifecycle='deleting' WHERE id=?").run(user.id);assert.equal((await recoverBilling(user,f.env,f.now(),fetcher)).reconciled,false);await assert.rejects(()=>cancelPendingCheckout(user,f.env,f.now(),fetcher),/account is unavailable/);
 }finally{h.close();}
}
// Deletion and checkout serialize in both orders, including the customer-creation gap.
{
 const h=await harness(),{f,state,user,fetcher,account}=h;
 try{
  await checkout(user,'studio',f.env,f.now(),fetcher);
  await assert.rejects(()=>beginAccountDeletion(f.env,user.id,f.now()),error=>error.status===409,'A payable open session blocks account deletion');
  assert.equal(f.sqlite.prepare('SELECT lifecycle FROM hb_users WHERE id=?').get(user.id).lifecycle,'active');assert.equal((await (await f.call('auth/session',undefined,{cookie:account.cookie})).json()).user.id,user.id,'A rejected deletion does not revoke a valid account session');
  await cancelPendingCheckout(user,f.env,f.now(),fetcher);assert.equal((await beginAccountDeletion(f.env,user.id,f.now())).status,'deleting','Deletion can proceed after confirmed remote expiration');
  const before=state.requests.filter(r=>r.method==='POST').length;await assert.rejects(()=>checkout(user,'studio',f.env,f.now(),fetcher),error=>error.status===409);assert.equal(state.requests.filter(r=>r.method==='POST').length,before,'Deletion winning the lifecycle race prevents all Stripe customer/session creation');
 }finally{h.close();}
}
{
 const h=await harness(),{f,state,user,fetcher}=h;
 try{
  let release,started;const entered=new Promise(r=>started=r);state.hook=async({path})=>{if(path==='/v1/customers'){started();await new Promise(r=>release=r);}return null;};
  const pending=checkout(user,'studio',f.env,f.now(),fetcher);await entered;assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM hb_checkout').get().n,0,'Lease is tested before any pending row exists');
  await assert.rejects(()=>beginAccountDeletion(f.env,user.id,f.now()),error=>error.status===409,'Checkout lease blocks deletion before intent persistence');release();await pending;state.hook=null;
  await cancelPendingCheckout(user,f.env,f.now(),fetcher);
  let finishReconciliation,startReconciliation;const reconciliationStarted=new Promise(r=>startReconciliation=r);state.hook=async({path})=>{if(path==='/v1/subscriptions'){startReconciliation();await new Promise(r=>finishReconciliation=r);}return null;};
  const reconciling=recoverBilling(user,f.env,f.now(),fetcher);await reconciliationStarted;await assert.rejects(()=>beginAccountDeletion(f.env,user.id,f.now()),error=>error.status===409,'A live billing reconciliation lease also fences deletion');finishReconciliation();await reconciling;state.hook=null;
  assert.equal((await beginAccountDeletion(f.env,user.id,f.now())).status,'deleting');
 }finally{h.close();}
}
console.log('Passed durable billing receipt/async recovery, pinned real Stripe event contracts, charge/PaymentIntent dispute adapters, one pending checkout across plans, exact ambiguous retries, account ownership, scheduled repair without browser, preserved paid state during failures, fenced inbox/account leases, dead letters, audited multi-review resolution and checkout/deletion races in both orders. Real SQLite; Stripe HTTP mocked, no payment taken.');
