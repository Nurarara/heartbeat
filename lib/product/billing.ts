import { createCheckoutIntent, receiveBillingEvent } from './billing-recovery.ts';
import { db, ProductError, type ProductEnv } from './core.ts';
import type { User } from './auth.ts';
/** Optional wire fields are checked by each adapter before they affect access. */
export type StripeObject = {
    id?: string;
    object?: string;
    url?: string;
    active?: boolean;
    unit_amount?: number;
    currency?: string;
    recurring?: {
        interval?: string;
        interval_count?: number;
    };
    customer?: unknown;
    payment_intent?: unknown;
    mode?: string;
    client_reference_id?: string;
    status?: string;
    subscription?: unknown;
    expires_at?: number;
    has_more?: boolean;
    data?: StripeObject[];
    items?: {
        data?: StripeObject[];
    };
    price?: unknown;
    quantity?: number;
    current_period_start?: number;
    current_period_end?: number;
};
export const STRIPE_API_VERSION = '2025-03-31.basil';
export function billingReady(env: ProductEnv) { return env.HEARTBEAT_BILLING_ENABLED === 'true' && !!env.STRIPE_SECRET_KEY && !!env.STRIPE_WEBHOOK_SECRET && !!env.STRIPE_STUDIO_PRICE_ID && !!env.STRIPE_ATELIER_PRICE_ID; }
export async function priceCatalog(env: ProductEnv, fetcher: typeof fetch = fetch) {
    if (!billingReady(env))
        return {};
    if (env.STRIPE_STUDIO_PRICE_ID === env.STRIPE_ATELIER_PRICE_ID)
        throw new ProductError('Memberships require distinct Stripe prices.', 503);
    const stripe = stripeClient(env, fetcher), result: Record<string, {
        unitAmount: number;
        currency: string;
    }> = {};
    for (const [plan, id] of [['studio', env.STRIPE_STUDIO_PRICE_ID], ['atelier', env.STRIPE_ATELIER_PRICE_ID]]) {
        if (!id || !/^price_[a-zA-Z0-9]+$/.test(id))
            throw new ProductError('Membership pricing is not configured correctly.', 503);
        const price = await stripe(`prices/${id}`);
        if (price.active !== true || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1 || typeof price.unit_amount !== 'number' || !Number.isSafeInteger(price.unit_amount) || price.unit_amount < 0 || typeof price.currency !== 'string' || !['gbp', 'usd', 'eur'].includes(price.currency))
            throw new ProductError('Membership prices must be active monthly GBP, USD or EUR prices.', 503);
        result[plan!] = { unitAmount: price.unit_amount, currency: price.currency };
    }
    return result;
}
export function stripeClient(env: ProductEnv, fetcher: typeof fetch = fetch) {
    return async (path: string, values?: Record<string, string>, key?: string): Promise<StripeObject> => {
        if (!env.STRIPE_SECRET_KEY)
            throw new ProductError('Subscriptions are not available yet.', 503);
        const response = await fetcher(`https://api.stripe.com/v1/${path}`, { method: values ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': STRIPE_API_VERSION, ...(values ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(values ? { body: new URLSearchParams(values) } : {}), signal: AbortSignal.timeout(15000) });
        if (!response.ok)
            throw new ProductError('Billing is temporarily unavailable. Your access has not changed.', 503);
        const value = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new ProductError('Billing response could not be verified. Your access has not changed.', 503);
        return value;
    };
}
export async function checkout(user: User, plan: unknown, env: ProductEnv, now: number, fetcher: typeof fetch = fetch) { return createCheckoutIntent(user, plan, env, now, fetcher); }
export async function portal(user: User, env: ProductEnv, fetcher: typeof fetch = fetch) {
    if (!billingReady(env))
        throw new ProductError('Billing management is not configured yet.', 503);
    const row = await db(env).prepare("SELECT b.customer_id FROM hb_billing b JOIN hb_users u ON u.id=b.user_id WHERE b.user_id=? AND u.lifecycle='active'").bind(user.id).first<{
        customer_id: string | null;
    }>();
    if (!row?.customer_id)
        throw new ProductError('There is no subscription to manage yet.', 409);
    const result = await stripeClient(env, fetcher)('billing_portal/sessions', { customer: row.customer_id, return_url: `${new URL(env.HEARTBEAT_APP_ORIGIN!).origin}/app?tab=account` });
    let valid = false;
    try {
        const url = new URL(result.url || '');
        valid = url.protocol === 'https:' && url.hostname === 'billing.stripe.com' && !url.username && !url.password && (!url.port || url.port === '443');
    }
    catch { /* Invalid response. */ }
    if (!valid)
        throw new ProductError('Billing management could not be opened.', 503);
    return { url: result.url };
}
export async function verifyStripeSignature(raw: string, header: string | null, secret: string, now: number) {
    const parts = header?.split(',').map(p => p.trim().split('='));
    const timestamp = parts?.find(p => p[0] === 't')?.[1];
    const signatures = parts?.filter(p => p[0] === 'v1').map(p => p[1]) || [];
    if (!timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300)
        throw new ProductError('Invalid billing signature.', 400);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const bytes = new TextEncoder().encode(`${timestamp}.${raw}`);
    for (const signature of signatures)
        if (/^[a-f0-9]{64}$/.test(signature) && await crypto.subtle.verify('HMAC', key, Uint8Array.from(signature.match(/../g)!, h => parseInt(h, 16)), bytes))
            return;
    throw new ProductError('Invalid billing signature.', 400);
}
export async function webhook(request: Request, env: ProductEnv, now: number, fetcher?: typeof fetch) { void fetcher; return receiveBillingEvent(request, env, now); }
