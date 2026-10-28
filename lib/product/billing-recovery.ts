import { db, hash, json, ProductError, randomToken, readText, type ProductEnv } from './core.ts';
import { stripeClient, verifyStripeSignature, billingReady, priceCatalog, STRIPE_API_VERSION, type StripeObject } from './billing.ts';
import type { User } from './auth.ts';
type BillingRow = {
    user_id: string;
    customer_id: string;
    subscription_id: string | null;
    status: string;
    review_required: number;
};
type CheckoutRow = {
    id: string;
    price_id: string;
    status: string;
    session_id: string | null;
    created_at: number;
    expires_at: number;
};
type InboxRow = {
    id: string;
    type: string;
    payload: string;
    attempts: number;
};
type StripeEvent = {
    id: string;
    type: string;
    api_version?: string | null;
    livemode?: boolean;
    data?: {
        object?: StripeObject & {
            charge?: unknown;
        };
    };
};
const LEASE = 120000;
const liveStatuses = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'];
const supported = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed']);
const ref = (v: unknown): string | null => typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v && typeof v.id === 'string' ? v.id : null;
const clock = (now: number) => { const start = performance.now(); return () => now + Math.ceil(performance.now() - start); };
const limit = (n?: number) => Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n!))) : 20;
const accountFence = "EXISTS(SELECT 1 FROM hb_billing b JOIN hb_users u ON u.id=b.user_id WHERE b.user_id=? AND b.lock=? AND b.lock_until>? AND u.lifecycle='active')";
const checkoutFence = "EXISTS(SELECT 1 FROM hb_billing b JOIN hb_users u ON u.id=b.user_id WHERE b.user_id=? AND b.checkout_lock=? AND b.checkout_lock_until>? AND u.lifecycle='active')";
export async function receiveBillingEvent(request: Request, env: ProductEnv, now: number) {
    if (!env.STRIPE_WEBHOOK_SECRET)
        throw new ProductError('Billing events are not configured.', 503);
    const raw = await readText(request, 262144);
    await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET, now);
    let event: StripeEvent;
    try {
        event = JSON.parse(raw);
    }
    catch {
        throw new ProductError('Invalid billing event.');
    }
    if (!event || typeof event.id !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(event.id))
        throw new ProductError('Invalid billing event.');
    if (!supported.has(event.type))
        return json({ received: true });
    const object = event.data?.object;
    if (!object || typeof object !== 'object')
        throw new ProductError('Invalid billing object.');
    // Keep only the references required for reconciliation, not card data or a
    // private provider payload. A hash detects conflicting event-ID replays.
    const payload = JSON.stringify({ customer: ref(object.customer), charge: ref(object.charge), payment_intent: ref(object.payment_intent), object_id: ref(object.id) });
    // Stripe may change delivery-envelope fields on replay. Compare immutable
    // reconciliation references, not pending_webhooks or a reserialization.
    const digest = await hash(JSON.stringify({ type: event.type, api_version: event.api_version ?? null, livemode: event.livemode ?? null, payload }));
    const expected = event.type.startsWith('checkout.') ? 'checkout.session' : event.type.startsWith('customer.subscription.') ? 'subscription' : event.type.startsWith('invoice.') ? 'invoice' : event.type.startsWith('charge.dispute.') ? 'dispute' : 'charge';
    const mismatch = event.api_version !== STRIPE_API_VERSION ? 'api_version_mismatch' : typeof event.livemode !== 'boolean' || event.livemode !== /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '') ? 'livemode_mismatch' : object.object !== expected ? 'object_contract_mismatch' : null;
    await db(env).prepare('INSERT OR IGNORE INTO hb_billing_inbox(id,type,api_version,payload,payload_hash,status,received_at,next_attempt_at,last_error) VALUES (?,?,?,?,?,?,?,?,?)').bind(event.id, event.type, event.api_version || null, payload, digest, mismatch ? 'failed' : 'pending', now, now, mismatch).run();
    // Recheck after INSERT OR IGNORE as two deliveries can race on the same ID.
    const stored = await db(env).prepare('SELECT payload_hash FROM hb_billing_inbox WHERE id=?').bind(event.id).first<{
        payload_hash: string;
    }>();
    if (!stored)
        throw new ProductError('Billing receipt could not be stored.', 503);
    if (stored.payload_hash !== digest)
        throw new ProductError('Billing event conflicts with its earlier receipt.', 409);
    return json({ received: true });
}
async function reconcileUser(env: ProductEnv, userId: string, now: number, fetcher: typeof fetch = fetch, review?: {
    eventId: string;
    reason: string;
}, resolution?: {
    actor: string;
    reason: string;
    eventId: string;
}) {
    const database = db(env), at = clock(now), account = await database.prepare("SELECT b.* FROM hb_billing b JOIN hb_users u ON u.id=b.user_id WHERE b.user_id=? AND u.lifecycle='active'").bind(userId).first<BillingRow>();
    if (!account?.customer_id)
        return { reconciled: false };
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_STUDIO_PRICE_ID || !env.STRIPE_ATELIER_PRICE_ID || env.STRIPE_STUDIO_PRICE_ID === env.STRIPE_ATELIER_PRICE_ID)
        throw new ProductError('Billing reconciliation is not configured.', 503);
    const lease = randomToken(), started = at();
    const claimed = await database.prepare("UPDATE hb_billing SET lock=?,lock_until=? WHERE user_id=? AND lock_until<=? AND EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='active')").bind(lease, started + LEASE, userId, started, userId).run();
    if (claimed.meta.changes !== 1)
        throw new ProductError('Billing reconciliation is busy.', 503);
    try {
        // Record financial review before a provider read so an outage cannot bypass it.
        if (review)
            await recordReview(env, userId, lease, at(), review);
        const remote = await stripeClient(env, fetcher)(`subscriptions?customer=${encodeURIComponent(account.customer_id)}&status=all&limit=100`);
        if (!Array.isArray(remote.data) || remote.has_more !== false || remote.data.some(s => !s || !/^sub_[A-Za-z0-9]+$/.test(s.id || '') || typeof s.status !== 'string' || ref(s.customer) && ref(s.customer) !== account.customer_id))
            throw new ProductError('Subscription reconciliation needs review.', 503);
        const candidates = remote.data.filter(s => liveStatuses.includes(s.status || ''));
        if (candidates.length > 1)
            await recordReview(env, userId, lease, at(), { eventId: `multiple:${userId}`, reason: 'multiple_subscriptions' }, true);
        const s = candidates.length === 1 ? candidates[0] : remote.data.find(s => s.id === account.subscription_id), items = s?.items?.data;
        const price = Array.isArray(items) && items.length === 1 ? ref(items[0].price) : null, plan = price && price === env.STRIPE_STUDIO_PRICE_ID ? 'studio' : price && price === env.STRIPE_ATELIER_PRICE_ID ? 'atelier' : 'trial';
        const start = Number(items?.[0]?.current_period_start ?? s?.current_period_start) * 1000, end = Number(items?.[0]?.current_period_end ?? s?.current_period_end) * 1000, valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start;
        const invalidContract = candidates.length === 1 && (plan === 'trial' || !valid || items?.[0]?.quantity !== undefined && items[0].quantity !== 1);
        if (invalidContract)
            await recordReview(env, userId, lease, at(), { eventId: `contract:${userId}`, reason: 'subscription_contract_review' }, true);
        if (resolution && (candidates.length > 1 || invalidContract))
            throw new ProductError('Resolve the provider subscription conflict before clearing its review.', 409);
        const finished = at(), committed = await database.prepare(`UPDATE hb_billing SET subscription_id=?,plan=?,status=?,period_start=?,period_end=?,last_reconciled=?,next_reconcile_at=?,reconcile_failures=0,reconcile_error=NULL WHERE user_id=? AND ${accountFence}`).bind(s?.id || null, plan, s?.status || 'canceled', valid ? start : 0, valid ? end : 0, finished, finished + 900000, userId, userId, lease, finished).run();
        if (committed.meta.changes !== 1)
            throw new ProductError('Billing lease expired.', 503);
        if (resolution) {
            const id = crypto.randomUUID(), done = at(), args = [userId, lease, done], changes = await database.batch([
                database.prepare(`INSERT INTO hb_billing_audit(id,user_id,actor,action,reason,event_id,created_at) SELECT ?,?,?, 'resolve_review',?,?,? WHERE ${accountFence} AND EXISTS(SELECT 1 FROM hb_billing_reviews WHERE user_id=? AND event_id=? AND resolved_at IS NULL)`).bind(id, userId, resolution.actor, resolution.reason, resolution.eventId, done, ...args, userId, resolution.eventId),
                database.prepare(`UPDATE hb_billing_reviews SET resolved_at=?,resolved_by=?,resolution=? WHERE user_id=? AND event_id=? AND resolved_at IS NULL AND EXISTS(SELECT 1 FROM hb_billing_audit WHERE id=?) AND ${accountFence}`).bind(done, resolution.actor, resolution.reason, userId, resolution.eventId, id, ...args),
                database.prepare(`UPDATE hb_billing SET review_required=CASE WHEN EXISTS(SELECT 1 FROM hb_billing_reviews WHERE user_id=hb_billing.user_id AND resolved_at IS NULL) THEN 1 ELSE 0 END,review_reason=(SELECT reason FROM hb_billing_reviews WHERE user_id=hb_billing.user_id AND resolved_at IS NULL ORDER BY opened_at DESC,event_id DESC LIMIT 1),review_event_id=(SELECT event_id FROM hb_billing_reviews WHERE user_id=hb_billing.user_id AND resolved_at IS NULL ORDER BY opened_at DESC,event_id DESC LIMIT 1) WHERE user_id=? AND EXISTS(SELECT 1 FROM hb_billing_audit WHERE id=?) AND ${accountFence}`).bind(userId, id, ...args),
            ]);
            return { reconciled: true, resolved: changes[1].meta.changes === 1 };
        }
        return { reconciled: true };
    }
    catch (error) {
        const finished = at();
        await database.prepare(`UPDATE hb_billing SET reconcile_failures=reconcile_failures+1,reconcile_error='provider_or_storage',next_reconcile_at=? WHERE user_id=? AND ${accountFence}`).bind(finished + 60000, userId, userId, lease, finished).run();
        throw error;
    }
    finally {
        await database.prepare('UPDATE hb_billing SET lock=NULL,lock_until=0 WHERE user_id=? AND lock=?').bind(userId, lease).run();
    }
}
async function recordReview(env: ProductEnv, userId: string, lease: string, now: number, review: {
    eventId: string;
    reason: string;
}, reopen = false) {
    const database = db(env), args = [userId, lease, now], results = await database.batch([
        database.prepare(`INSERT OR IGNORE INTO hb_billing_reviews(event_id,user_id,reason,opened_at) SELECT ?,?,?,? WHERE ${accountFence}`).bind(review.eventId, userId, review.reason, now, ...args),
        ...(reopen ? [database.prepare(`UPDATE hb_billing_reviews SET resolved_at=NULL,resolved_by=NULL,resolution=NULL,opened_at=? WHERE event_id=? AND user_id=? AND resolved_at IS NOT NULL AND ${accountFence}`).bind(now, review.eventId, userId, ...args)] : []),
        database.prepare(`INSERT OR IGNORE INTO hb_billing_audit(id,user_id,actor,action,reason,event_id,created_at) SELECT ?,?,'stripe','open_review',?,?,? WHERE ${accountFence} AND EXISTS(SELECT 1 FROM hb_billing_reviews WHERE event_id=? AND user_id=? AND opened_at=? AND resolved_at IS NULL)`).bind(`opened:${review.eventId}:${reopen ? now : 'event'}`, userId, review.reason, review.eventId, now, ...args, review.eventId, userId, now),
        database.prepare(`UPDATE hb_billing SET review_required=CASE WHEN EXISTS(SELECT 1 FROM hb_billing_reviews WHERE user_id=hb_billing.user_id AND resolved_at IS NULL) THEN 1 ELSE 0 END,review_reason=(SELECT reason FROM hb_billing_reviews WHERE user_id=hb_billing.user_id AND resolved_at IS NULL ORDER BY opened_at DESC,event_id DESC LIMIT 1),review_event_id=(SELECT event_id FROM hb_billing_reviews WHERE user_id=hb_billing.user_id AND resolved_at IS NULL ORDER BY opened_at DESC,event_id DESC LIMIT 1) WHERE user_id=? AND ${accountFence}`).bind(userId, ...args),
    ]);
    if (results.at(-1)!.meta.changes !== 1)
        throw new ProductError('Billing lease expired.', 503);
}
export async function processBillingInbox(env: ProductEnv, options: {
    now?: number;
    fetcher?: typeof fetch;
    limit?: number;
} = {}) {
    const at = clock(options.now ?? Date.now()), now = at(), database = db(env), fetcher = options.fetcher || fetch, rows = await database.prepare("SELECT * FROM hb_billing_inbox WHERE status IN ('pending','retry','processing') AND next_attempt_at<=? AND lock_until<=? ORDER BY received_at,id LIMIT ?").bind(now, now, limit(options.limit)).all<InboxRow>();
    let processed = 0;
    for (const event of rows.results) {
        const lease = randomToken(), started = at();
        const claim = await database.prepare("UPDATE hb_billing_inbox SET status='processing',lock=?,lock_until=?,attempts=attempts+1 WHERE id=? AND next_attempt_at<=? AND lock_until<=? AND status IN ('pending','retry','processing')").bind(lease, started + LEASE, event.id, started, started).run();
        if (claim.meta.changes !== 1)
            continue;
        try {
            const payload = JSON.parse(event.payload), stripe = stripeClient(env, fetcher);
            let customer = ref(payload.customer);
            if (!customer && payload.charge) {
                if (!/^ch_[A-Za-z0-9]+$/.test(payload.charge))
                    throw new ProductError('Invalid charge reference.');
                const charge = await stripe(`charges/${payload.charge}`);
                if (charge.id !== payload.charge || charge.object !== 'charge')
                    throw new ProductError('Invalid charge response.');
                customer = ref(charge.customer);
                payload.payment_intent ||= ref(charge.payment_intent);
            }
            if (!customer && payload.payment_intent) {
                if (!/^pi_[A-Za-z0-9]+$/.test(payload.payment_intent))
                    throw new ProductError('Invalid payment reference.');
                const payment = await stripe(`payment_intents/${payload.payment_intent}`);
                if (payment.id !== payload.payment_intent || payment.object !== 'payment_intent')
                    throw new ProductError('Invalid payment response.');
                customer = ref(payment.customer);
            }
            if (!customer || !/^cus_[A-Za-z0-9]+$/.test(customer))
                throw new ProductError('Billing event needs customer resolution.', 503);
            const account = await database.prepare("SELECT b.user_id FROM hb_billing b JOIN hb_users u ON u.id=b.user_id WHERE b.customer_id=? AND u.lifecycle='active'").bind(customer).first<{
                user_id: string;
            }>();
            if (!account)
                throw new ProductError('Billing customer is not mapped yet.', 503);
            const result = await reconcileUser(env, account.user_id, at(), fetcher, ['charge.refunded', 'charge.dispute.created'].includes(event.type) ? { eventId: event.id, reason: event.type } : undefined);
            if (!result.reconciled)
                throw new ProductError('Billing account is unavailable.', 503);
            const finished = at(), committed = await database.batch([
                database.prepare("INSERT OR IGNORE INTO hb_events(id,processed_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM hb_billing_inbox WHERE id=? AND lock=? AND lock_until>? AND status='processing')").bind(event.id, finished, event.id, lease, finished),
                database.prepare("UPDATE hb_billing_inbox SET status='processed',processed_at=?,customer_id=?,lock=NULL,lock_until=0,last_error=NULL WHERE id=? AND lock=? AND lock_until>? AND status='processing'").bind(finished, customer, event.id, lease, finished),
            ]);
            if (committed[1].meta.changes !== 1)
                throw new ProductError('Billing event lease expired.', 503);
            processed++;
        }
        catch {
            const finished = at(), attempt = Number(event.attempts) + 1;
            await database.prepare("UPDATE hb_billing_inbox SET status=?,next_attempt_at=?,last_error='reconciliation_failed',lock=NULL,lock_until=0 WHERE id=? AND lock=? AND lock_until>? AND status='processing'").bind(attempt >= 12 ? 'failed' : 'retry', finished + Math.min(3600000, 5000 * 2 ** Math.min(attempt, 9)), event.id, lease, finished).run();
        }
    }
    return { processed };
}
export async function reconcileBilling(env: ProductEnv, options: {
    now?: number;
    fetcher?: typeof fetch;
    limit?: number;
} = {}) {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_STUDIO_PRICE_ID || !env.STRIPE_ATELIER_PRICE_ID)
        return { reconciled: 0 };
    const at = clock(options.now ?? Date.now()), rows = await db(env).prepare("SELECT b.user_id FROM hb_billing b JOIN hb_users u ON u.id=b.user_id WHERE b.customer_id IS NOT NULL AND b.next_reconcile_at<=? AND u.lifecycle='active' ORDER BY b.next_reconcile_at,b.user_id LIMIT ?").bind(at(), limit(options.limit)).all<{
        user_id: string;
    }>();
    let reconciled = 0;
    for (const row of rows.results)
        try {
            if ((await reconcileUser(env, row.user_id, at(), options.fetcher)).reconciled)
                reconciled++;
        }
        catch { /* Retained entitlement expires at its existing period; retry metadata is durable. */ }
    return { reconciled };
}
export async function recoverBilling(user: User, env: ProductEnv, now: number, fetcher: typeof fetch = fetch) { return reconcileUser(env, user.id, now, fetcher); }
/** Server-only; authorize an operator before calling. Incompatible contracts stay quarantined. */
export async function retryBillingEvent(env: ProductEnv, input: {
    eventId: string;
    actor: string;
    reason: string;
    now?: number;
}) {
    if (typeof input.actor !== 'string' || input.actor.trim().length < 3 || input.actor.length > 160 || typeof input.reason !== 'string' || input.reason.trim().length < 8 || input.reason.length > 2000 || typeof input.eventId !== 'string' || !/^evt_[A-Za-z0-9]+$/.test(input.eventId))
        throw new ProductError('An event, operator identity and explanation are required.');
    const database = db(env), now = input.now ?? Date.now(), id = crypto.randomUUID(), allowed = "status='failed' AND lock_until<=? AND api_version=? AND COALESCE(last_error,'') NOT IN ('api_version_mismatch','livemode_mismatch','object_contract_mismatch')";
    const result = await database.batch([
        database.prepare(`INSERT INTO hb_billing_audit(id,user_id,actor,action,reason,event_id,created_at) SELECT ?,COALESCE((SELECT user_id FROM hb_billing WHERE customer_id=hb_billing_inbox.customer_id),'unmapped'),?,'retry_event',?,id,? FROM hb_billing_inbox WHERE id=? AND ${allowed}`).bind(id, input.actor.trim(), input.reason.trim(), now, input.eventId, now, STRIPE_API_VERSION),
        database.prepare(`UPDATE hb_billing_inbox SET status='pending',attempts=0,next_attempt_at=?,last_error=NULL,lock=NULL,lock_until=0 WHERE id=? AND ${allowed} AND EXISTS(SELECT 1 FROM hb_billing_audit WHERE id=?)`).bind(now, input.eventId, now, STRIPE_API_VERSION, id),
    ]);
    return { retried: result[1].meta.changes === 1 };
}
export async function createCheckoutIntent(user: User, plan: unknown, env: ProductEnv, now: number, fetcher: typeof fetch = fetch) {
    if (!billingReady(env))
        throw new ProductError('Subscriptions are not open yet.', 503);
    if (!user.verified)
        throw new ProductError('Verify your email before subscribing.', 403);
    if (plan !== 'studio' && plan !== 'atelier')
        throw new ProductError('Choose a valid plan.');
    await priceCatalog(env, fetcher);
    const database = db(env), stripe = stripeClient(env, fetcher), price = plan === 'studio' ? env.STRIPE_STUDIO_PRICE_ID! : env.STRIPE_ATELIER_PRICE_ID!;
    await database.prepare("INSERT OR IGNORE INTO hb_billing(user_id) SELECT id FROM hb_users WHERE id=? AND lifecycle='active'").bind(user.id).run();
    return withCheckoutLease(env, user.id, now, async (claim, at) => {
        const written = (result: D1Result) => { if (result.meta.changes !== 1)
            throw new ProductError('Checkout lease expired. Retry your existing checkout.', 503); };
        let account = await database.prepare('SELECT * FROM hb_billing WHERE user_id=?').bind(user.id).first<BillingRow>();
        if (account?.review_required)
            throw new ProductError('Your billing account needs review before another checkout.', 409);
        if (account?.customer_id)
            await reconcileUser(env, user.id, at(), fetcher);
        account = await database.prepare('SELECT * FROM hb_billing WHERE user_id=?').bind(user.id).first<BillingRow>();
        if (account?.review_required)
            throw new ProductError('Your billing account needs review before another checkout.', 409);
        if (account?.subscription_id && liveStatuses.includes(account.status))
            throw new ProductError('Manage your existing subscription in Account & billing.', 409);
        if (!account?.customer_id) {
            const c = await stripe('customers', { email: user.email, 'metadata[heartbeat_user]': user.id }, `heartbeat-customer-${user.id}`);
            if (typeof c.id !== 'string' || !/^cus_[A-Za-z0-9]+$/.test(c.id))
                throw new ProductError('Billing customer could not be prepared.', 503);
            written(await database.prepare(`UPDATE hb_billing SET customer_id=? WHERE user_id=? AND customer_id IS NULL AND ${checkoutFence}`).bind(c.id, user.id, user.id, claim, at()).run());
            account = await database.prepare('SELECT * FROM hb_billing WHERE user_id=?').bind(user.id).first<BillingRow>();
        }
        let pending = await database.prepare("SELECT * FROM hb_checkout WHERE user_id=? AND status IN ('creating','open','confirming')").bind(user.id).first<CheckoutRow>();
        if (pending?.session_id) {
            const remote = await stripe(`checkout/sessions/${encodeURIComponent(pending.session_id)}`);
            validateCheckout(remote, account!.customer_id, user.id, pending.session_id);
            if (remote.status === 'complete') {
                written(await database.prepare(`UPDATE hb_checkout SET status='confirming' WHERE id=? AND ${checkoutFence}`).bind(pending.id, user.id, claim, at()).run());
                await reconcileUser(env, user.id, at(), fetcher);
                const confirmed = await database.prepare('SELECT subscription_id,status FROM hb_billing WHERE user_id=?').bind(user.id).first<Pick<BillingRow, 'subscription_id' | 'status'>>();
                // A completed checkout whose subscription has not appeared must continue to
                // block a second purchase. Only a verified terminal linked subscription ends it.
                if (ref(remote.subscription) && ref(remote.subscription) === confirmed?.subscription_id && !liveStatuses.includes(confirmed.status))
                    written(await database.prepare(`UPDATE hb_checkout SET status='complete' WHERE id=? AND ${checkoutFence}`).bind(pending.id, user.id, claim, at()).run());
                throw new ProductError('Your payment is confirming. Do not start another checkout.', 409);
            }
            if (remote.status === 'expired') {
                written(await database.prepare(`UPDATE hb_checkout SET status='expired' WHERE id=? AND ${checkoutFence}`).bind(pending.id, user.id, claim, at()).run());
                pending = null;
            }
            else {
                if (pending.price_id !== price)
                    throw new ProductError('Finish or cancel your existing checkout before choosing another plan.', 409);
                return { url: checkoutURL(remote.url) };
            }
        }
        if (pending?.status === 'creating' && at() - pending.created_at > 23 * 3600000)
            throw new ProductError('An old ambiguous checkout needs operator reconciliation.', 409);
        if (pending && pending.price_id !== price)
            throw new ProductError('Finish or cancel your existing checkout before choosing another plan.', 409);
        const id = pending?.id || crypto.randomUUID(), created = pending?.created_at ?? at(), expires = pending?.expires_at || Math.floor(created / 1000) * 1000 + 3600000;
        if (!pending)
            written(await database.prepare(`INSERT INTO hb_checkout(id,user_id,price_id,status,created_at,expires_at) SELECT ?,?,?,'creating',?,? WHERE ${checkoutFence}`).bind(id, user.id, price, created, expires, user.id, claim, at()).run());
        // Retry an ambiguous creation with its exact original request and key.
        const origin = new URL(env.HEARTBEAT_APP_ORIGIN!).origin, remote = await stripe('checkout/sessions', { mode: 'subscription', customer: account!.customer_id, 'line_items[0][price]': price, 'line_items[0][quantity]': '1', client_reference_id: user.id, 'subscription_data[metadata][heartbeat_user]': user.id, expires_at: String(Math.floor(expires / 1000)), success_url: `${origin}/onboarding?billing=success&plan=${plan}`, cancel_url: `${origin}/onboarding?billing=cancelled&plan=${plan}` }, `heartbeat-checkout-${id}`);
        validateCheckout(remote, account!.customer_id, user.id);
        if (Number(remote.expires_at) * 1000 !== expires)
            throw new ProductError('Checkout expiration could not be verified.', 503);
        const url = remote.status === 'open' ? checkoutURL(remote.url) : null;
        written(await database.prepare(`UPDATE hb_checkout SET session_id=?,url=?,status=?,expires_at=? WHERE id=? AND status='creating' AND ${checkoutFence}`).bind(remote.id, url, remote.status === 'complete' ? 'confirming' : remote.status, expires, id, user.id, claim, at()).run());
        if (!url) {
            await reconcileUser(env, user.id, at(), fetcher);
            throw new ProductError('Your checkout has finished. Check Billing before starting another.', 409);
        }
        return { url };
    });
}
async function withCheckoutLease<T>(env: ProductEnv, userId: string, now: number, work: (claim: string, at: () => number) => Promise<T>) { const database = db(env), at = clock(now), claim = randomToken(), started = at(); if ((await database.prepare("UPDATE hb_billing SET checkout_lock=?,checkout_lock_until=? WHERE user_id=? AND checkout_lock_until<=? AND EXISTS(SELECT 1 FROM hb_users WHERE id=? AND lifecycle='active')").bind(claim, started + LEASE, userId, started, userId).run()).meta.changes !== 1)
    throw new ProductError('Checkout is already being prepared or the account is unavailable.', 409); try {
    return await work(claim, at);
}
finally {
    await database.prepare('UPDATE hb_billing SET checkout_lock=NULL,checkout_lock_until=0 WHERE user_id=? AND checkout_lock=?').bind(userId, claim).run();
} }
function validateCheckout(remote: StripeObject, customer: string, userId: string, sessionId?: string) { if (!remote || typeof remote.id !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(remote.id) || sessionId && remote.id !== sessionId || ref(remote.customer) !== customer || remote.mode !== 'subscription' || remote.client_reference_id !== userId || !['open', 'complete', 'expired'].includes(remote.status || ''))
    throw new ProductError('Checkout ownership could not be verified.', 503); }
function checkoutURL(value: unknown) { try {
    const url = new URL(String(value));
    if (url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.username && !url.password && (!url.port || url.port === '443'))
        return url.href;
}
catch { /* Invalid provider response. */ } throw new ProductError('Checkout URL could not be verified.', 503); }
export async function cancelPendingCheckout(user: User, env: ProductEnv, now: number, fetcher: typeof fetch = fetch) { return withCheckoutLease(env, user.id, now, async (claim, at) => { const database = db(env), row = await database.prepare("SELECT * FROM hb_checkout WHERE user_id=? AND status IN ('creating','open','confirming')").bind(user.id).first<CheckoutRow>(); if (!row)
    return { canceled: true }; if (!row.session_id)
    throw new ProductError('Checkout preparation needs reconciliation before cancellation.', 409); const account = await database.prepare('SELECT customer_id FROM hb_billing WHERE user_id=?').bind(user.id).first<Pick<BillingRow, 'customer_id'>>(), stripe = stripeClient(env, fetcher); let remote = await stripe(`checkout/sessions/${encodeURIComponent(row.session_id)}`); validateCheckout(remote, account!.customer_id, user.id, row.session_id); if (remote.status === 'complete') {
    await reconcileUser(env, user.id, at(), fetcher);
    throw new ProductError('Checkout already completed. Manage your subscription in Billing.', 409);
} if (remote.status === 'open') {
    remote = await stripe(`checkout/sessions/${encodeURIComponent(row.session_id)}/expire`, {}, `heartbeat-expire-${row.id}`);
    validateCheckout(remote, account!.customer_id, user.id, row.session_id);
} if (remote.status !== 'expired')
    throw new ProductError('Checkout could not be expired safely.', 409); const result = await database.prepare(`UPDATE hb_checkout SET status='expired',expires_at=? WHERE id=? AND ${checkoutFence}`).bind(at(), row.id, user.id, claim, at()).run(); if (result.meta.changes !== 1)
    throw new ProductError('Checkout lease expired.', 503); return { canceled: true }; }); }
/** Server-only: its route must authenticate an authorized operator first. */
export async function resolveBillingReview(env: ProductEnv, input: {
    userId: string;
    actor: string;
    reason: string;
    expectedReviewEventId: string;
    now?: number;
    fetcher?: typeof fetch;
}) { if (typeof input.actor !== 'string' || input.actor.trim().length < 3 || input.actor.length > 160 || typeof input.reason !== 'string' || input.reason.trim().length < 8 || input.reason.length > 2000 || typeof input.expectedReviewEventId !== 'string' || !input.expectedReviewEventId)
    throw new ProductError('An operator identity and explanation are required.'); const result = await reconcileUser(env, input.userId, input.now ?? Date.now(), input.fetcher, undefined, { actor: input.actor.trim(), reason: input.reason.trim(), eventId: input.expectedReviewEventId }); return { resolved: 'resolved' in result && result.resolved === true }; }
