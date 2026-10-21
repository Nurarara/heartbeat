export type ProductEnv = { DB?: D1Database; BUCKET?: R2Bucket; HEARTBEAT_APP_ORIGIN?: string; HEARTBEAT_APP_MODE?: string; HEARTBEAT_AI_ENABLED?: string; HEARTBEAT_EMAIL_API_KEY?: string; HEARTBEAT_EMAIL_FROM?: string; STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; STRIPE_STUDIO_PRICE_ID?: string; STRIPE_ATELIER_PRICE_ID?: string; HEARTBEAT_BILLING_ENABLED?: string; ARTWORK_WORKFLOW?: { create(input: { id: string; params: { jobId: string } }): Promise<unknown>; get(id: string): Promise<{ status(): Promise<{ status: string }> }> } };
export class ProductError extends Error { status:number; constructor(message: string, status = 400) { super(message); this.status=status; } }
export const json = (data: unknown, status = 200, headers: Record<string,string> = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
export function db(env: ProductEnv) { if (!env.DB) throw new ProductError('Account storage is not configured.', 503); return env.DB; }
export function checkOrigin(request: Request, env: ProductEnv) {
  const url = new URL(request.url); let configured: URL;
  try { configured = new URL(env.HEARTBEAT_APP_ORIGIN || 'http://localhost:5173'); } catch { throw new ProductError('Application address is not configured.', 503); }
  const loopback = (host: string) => ['localhost','127.0.0.1','[::1]'].includes(host);
  const local = configured.protocol === 'http:' && url.protocol === 'http:' && configured.port === url.port && loopback(configured.hostname) && loopback(url.hostname);
  if (request.headers.get('origin') !== url.origin || url.origin !== configured.origin && !local) throw new ProductError('Open Heartbeat at its application address and try again.', 403);
}
export function localDevelopment(request: Request, env: ProductEnv) { const u = new URL(request.url); return env.HEARTBEAT_APP_MODE === 'development' && u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname); }
export async function readJSON(request: Request, limit = 20000): Promise<Record<string,unknown>> {
  const raw = await readText(request, limit); try { const value = JSON.parse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw 0; return value; } catch { throw new ProductError('Please check the submitted details.'); }
}
export async function readText(request: Request, limit: number) {
  const reader = request.body?.getReader(); if (!reader) throw new ProductError('Request body is missing.');
  let size = 0, text = ''; const decoder = new TextDecoder();
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > limit) { await reader.cancel(); throw new ProductError('The request is too large.',413); } text += decoder.decode(item.value,{stream:true}); } return text + decoder.decode(); } finally { reader.releaseLock(); }
}
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), v => v.toString(16).padStart(2,'0')).join('');
export async function hash(text: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), v => v.toString(16).padStart(2,'0')).join(''); }
export async function rate(env: ProductEnv, key: string, now: number, maximum: number, window = 600000) {
  const slot = Math.floor(now/window), identifier = await hash(`${key}:${slot}`);
  const result = await db(env).prepare('INSERT INTO hb_rate(key,used,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET used=used+1 WHERE used < ? RETURNING used').bind(identifier,(slot+1)*window,maximum).first();
  if (!result) throw new ProductError('Too many attempts. Please try again shortly.',429);
}
export const PLANS = {
  trial: { id:'trial', name:'Trial', allowance:3, cadence:3600000, description:'Three original pictures to find your atmosphere.' },
  studio: { id:'studio', name:'Studio', allowance:120, cadence:1800000, description:'An everyday rhythm of original artwork.' },
  atelier: { id:'atelier', name:'Atelier', allowance:360, cadence:600000, description:'More room to explore your visual world.' },
} as const;
export type PlanId = keyof typeof PLANS;
