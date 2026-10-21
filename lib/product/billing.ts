import { db, hash, json, ProductError, randomToken, readText, type ProductEnv } from './core.ts';
import type { User } from './auth.ts';
type StripeObject = Record<string,any>;
export function billingReady(env:ProductEnv) {return env.HEARTBEAT_BILLING_ENABLED==='true'&&!!env.STRIPE_SECRET_KEY&&!!env.STRIPE_WEBHOOK_SECRET&&!!env.STRIPE_STUDIO_PRICE_ID&&!!env.STRIPE_ATELIER_PRICE_ID;}
export async function priceCatalog(env:ProductEnv,fetcher:typeof fetch=fetch) {
 if(!billingReady(env))return {};
 if(env.STRIPE_STUDIO_PRICE_ID===env.STRIPE_ATELIER_PRICE_ID)throw new ProductError('Memberships require distinct Stripe prices.',503);
 const stripe=stripeClient(env,fetcher),result:Record<string,{unitAmount:number;currency:string}>={};
 for(const [plan,id] of [['studio',env.STRIPE_STUDIO_PRICE_ID],['atelier',env.STRIPE_ATELIER_PRICE_ID]]) {
  if(!id||!/^price_[a-zA-Z0-9]+$/.test(id))throw new ProductError('Membership pricing is not configured correctly.',503);
  const price=await stripe(`prices/${id}`);
  if(price.active!==true||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1||!Number.isSafeInteger(price.unit_amount)||price.unit_amount<0||!['gbp','usd','eur'].includes(price.currency))throw new ProductError('Membership prices must be active monthly GBP, USD or EUR prices.',503);
  result[plan!]={unitAmount:price.unit_amount,currency:price.currency};
 }
 return result;
}
export function stripeClient(env:ProductEnv,fetcher:typeof fetch=fetch) {
  return async (path:string,values?:Record<string,string>,key?:string):Promise<StripeObject> => {
    if(!env.STRIPE_SECRET_KEY)throw new ProductError('Subscriptions are not available yet.',503);
    const response=await fetcher(`https://api.stripe.com/v1/${path}`,{method:values?'POST':'GET',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,...(values?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},...(values?{body:new URLSearchParams(values)}:{}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new ProductError('Billing is temporarily unavailable. Your access has not changed.',503);
    return response.json();
  };
}
export async function checkout(user:User,plan:unknown,env:ProductEnv,now:number,fetcher:typeof fetch=fetch) {
  if(!billingReady(env))throw new ProductError('Subscriptions are not open yet. Your trial remains available.',503);
  if(!user.verified)throw new ProductError('Verify your email before subscribing.',403);
  if(plan!=='studio'&&plan!=='atelier')throw new ProductError('Choose a valid plan.');
  await priceCatalog(env,fetcher);
  const stripe=stripeClient(env,fetcher), price=plan==='studio'?env.STRIPE_STUDIO_PRICE_ID!:env.STRIPE_ATELIER_PRICE_ID!;
  await db(env).prepare('INSERT OR IGNORE INTO hb_billing(user_id) VALUES (?)').bind(user.id).run();
  let billing=await db(env).prepare('SELECT * FROM hb_billing WHERE user_id=?').bind(user.id).first<StripeObject>();
  if(billing?.subscription_id&&['active','trialing','past_due','unpaid','incomplete','paused'].includes(billing.status))throw new ProductError('Manage your existing subscription from Account → Billing.',409);
  if(!billing?.customer_id) {
    const customer=await stripe('customers',{email:user.email,'metadata[heartbeat_user]':user.id},`heartbeat-customer-${user.id}`);
    if(typeof customer.id!=='string'||!/^cus_[A-Za-z0-9]+$/.test(customer.id))throw new ProductError('Billing customer could not be prepared.',503);
    await db(env).prepare('UPDATE hb_billing SET customer_id=? WHERE user_id=? AND customer_id IS NULL').bind(customer.id,user.id).run();
    billing=await db(env).prepare('SELECT * FROM hb_billing WHERE user_id=?').bind(user.id).first<StripeObject>();
  }
  const identity=await hash(`${user.id}:${price}:${Math.floor(now/1800000)}`);
  await db(env).prepare('INSERT OR IGNORE INTO hb_checkout(id,user_id,price_id,created_at) VALUES (?,?,?,?)').bind(identity,user.id,price,now).run();
  const stored=await db(env).prepare('SELECT url FROM hb_checkout WHERE id=? AND user_id=?').bind(identity,user.id).first<{url:string|null}>();
  if(stored?.url)return {url:stored.url};
  const origin=new URL(env.HEARTBEAT_APP_ORIGIN!).origin;
  const result=await stripe('checkout/sessions',{mode:'subscription',customer:billing!.customer_id,'line_items[0][price]':price,'line_items[0][quantity]':'1',client_reference_id:user.id,'subscription_data[metadata][heartbeat_user]':user.id,success_url:`${origin}/app?billing=success`,cancel_url:`${origin}/pricing?billing=cancelled`},`heartbeat-checkout-${identity}`);
  if(typeof result.url!=='string'||new URL(result.url).hostname!=='checkout.stripe.com')throw new ProductError('Checkout could not be opened.',503);
  await db(env).prepare('UPDATE hb_checkout SET url=? WHERE id=? AND user_id=?').bind(result.url,identity,user.id).run();
  return {url:result.url};
}
export async function portal(user:User,env:ProductEnv,fetcher:typeof fetch=fetch) {
  if(!billingReady(env))throw new ProductError('Billing management is not configured yet.',503);
  const row=await db(env).prepare('SELECT customer_id FROM hb_billing WHERE user_id=?').bind(user.id).first<{customer_id:string|null}>();
  if(!row?.customer_id)throw new ProductError('There is no subscription to manage yet.',409);
  const result=await stripeClient(env,fetcher)('billing_portal/sessions',{customer:row.customer_id,return_url:`${new URL(env.HEARTBEAT_APP_ORIGIN!).origin}/app?tab=account`});
  if(typeof result.url!=='string'||new URL(result.url).hostname!=='billing.stripe.com')throw new ProductError('Billing management could not be opened.',503);
  return {url:result.url};
}
export async function verifyStripeSignature(raw:string,header:string|null,secret:string,now:number) {
  const parts=header?.split(',').map(p=>p.split('='));const timestamp=parts?.find(p=>p[0]==='t')?.[1];const signatures=parts?.filter(p=>p[0]==='v1').map(p=>p[1])||[];
  if(!timestamp||!/^\d{10}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)throw new ProductError('Invalid billing signature.',400);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=new TextEncoder().encode(`${timestamp}.${raw}`);
  for(const signature of signatures)if(/^[a-f0-9]{64}$/.test(signature)&&await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g)!,h=>parseInt(h,16)),bytes))return;
  throw new ProductError('Invalid billing signature.',400);
}
export async function webhook(request:Request,env:ProductEnv,now:number,fetcher:typeof fetch=fetch) {
  const executionStart=performance.now();
  if(!env.STRIPE_WEBHOOK_SECRET)throw new ProductError('Billing events are not configured.',503);
  const raw=await readText(request,262144);await verifyStripeSignature(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET,now);
  let event:StripeObject;try{event=JSON.parse(raw);}catch{throw new ProductError('Invalid billing event.');}
  if(typeof event.id!=='string'||!/^evt_[A-Za-z0-9]+$/.test(event.id))throw new ProductError('Invalid billing event.');
  if(await db(env).prepare('SELECT id FROM hb_events WHERE id=?').bind(event.id).first())return json({received:true});
  const supported=['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','charge.refunded','charge.dispute.created'];
  if(!supported.includes(event.type))return json({received:true});
  const object=event.data?.object, customer=typeof object?.customer==='string'?object.customer:object?.customer?.id;
  if(typeof customer!=='string'||!/^cus_[A-Za-z0-9]+$/.test(customer))throw new ProductError('Billing event has no customer.');
  const account=await db(env).prepare('SELECT * FROM hb_billing WHERE customer_id=?').bind(customer).first<StripeObject>();
  if(!account)return json({received:true});
  const claim=randomToken();
  const lock=await db(env).prepare('UPDATE hb_billing SET lock=?,lock_until=? WHERE user_id=? AND lock_until<=?').bind(claim,now+60000,account.user_id,now).run();
  if(lock.meta.changes!==1)throw new ProductError('Billing reconciliation is busy. Retry this event.',503);
  try {
    if(await db(env).prepare('SELECT id FROM hb_events WHERE id=?').bind(event.id).first())return json({received:true});
    // Read current Stripe state under a fenced account lease. Arrival/event timestamps
    // are not an ordering guarantee, and old payloads must never revive canceled access.
    const stripe=stripeClient(env,fetcher);
    const subscriptions=await stripe(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`);
    if(!Array.isArray(subscriptions.data)||subscriptions.has_more)throw new ProductError('Subscription reconciliation needs review.',503);
    const candidates=subscriptions.data.filter((s:StripeObject)=>['active','trialing','past_due','unpaid','incomplete','paused'].includes(s.status));
    if(candidates.length>1)throw new ProductError('Multiple subscriptions need billing review.',503);
    const subscription=candidates[0]||subscriptions.data.find((s:StripeObject)=>s.id===account.subscription_id);
    const items=subscription?.items?.data, price=Array.isArray(items)&&items.length===1?items[0].price?.id:null;
    const plan=price&&price===env.STRIPE_STUDIO_PRICE_ID?'studio':price&&price===env.STRIPE_ATELIER_PRICE_ID?'atelier':'trial';
    const start=Number(subscription?.current_period_start??items?.[0]?.current_period_start)*1000,end=Number(subscription?.current_period_end??items?.[0]?.current_period_end)*1000;
    const validPeriod=Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>start;
    const status=['charge.refunded','charge.dispute.created'].includes(event.type)?'review':subscription?.status||'canceled';
    const finishedAt=now+Math.ceil(performance.now()-executionStart);
    const changes=await db(env).batch([
      db(env).prepare('UPDATE hb_billing SET subscription_id=?,plan=?,status=?,period_start=?,period_end=?,review_required=MAX(review_required,?) WHERE user_id=? AND lock=? AND lock_until>?').bind(subscription?.id||null,plan,status,validPeriod?start:0,validPeriod?end:0,['charge.refunded','charge.dispute.created'].includes(event.type)?1:0,account.user_id,claim,finishedAt),
      db(env).prepare('INSERT OR IGNORE INTO hb_events(id,processed_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM hb_billing WHERE user_id=? AND lock=? AND lock_until>?)').bind(event.id,now,account.user_id,claim,finishedAt),
    ]);
    if(changes[0].meta.changes!==1||changes[1].meta.changes!==1)throw new ProductError('Billing lease expired. Retry this event.',503);
    return json({received:true});
  } finally {await db(env).prepare('UPDATE hb_billing SET lock=NULL,lock_until=0 WHERE user_id=? AND lock=?').bind(account.user_id,claim).run();}
}
