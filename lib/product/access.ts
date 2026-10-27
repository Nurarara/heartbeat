import { authenticate, type Auth } from './auth.ts';
import { db, localDevelopment, PLANS, type PlanId, type ProductEnv } from './core.ts';
import {usageForAccount} from './usage.ts';
export type AccountAccess = { userId:string;expires:number;eligible:boolean;reason:string;plan:PlanId;allowance:number;baseAllowance?:number;allowanceAdjustment?:number;periodStart:number;periodEnd:number;used:number;cadence:number };
export async function accessFor(auth:Pick<Auth,'user'|'expires'>,env:ProductEnv,now:number,local=false):Promise<AccountAccess> {
  const billing=await db(env).prepare('SELECT * FROM hb_billing WHERE user_id=?').bind(auth.user.id).first<{plan:string;status:string;period_start:number;period_end:number;review_required:number}>();
  const paid=!!billing&&!billing.review_required&&['active','trialing'].includes(billing.status)&&billing.period_end>now&&['studio','atelier'].includes(billing.plan);
  const plan:PlanId=paid?billing!.plan as PlanId:'trial', selected=PLANS[plan], periodStart=paid?billing!.period_start:auth.user.created_at, periodEnd=paid?billing!.period_end:8640000000000000;
  const {used,allowance_adjustment}=await usageForAccount(env,auth.user.id,periodStart,periodEnd),allowance=Math.max(0,selected.allowance+allowance_adjustment);
  const verified=(!!auth.user.verified||local)&&!billing?.review_required&&(auth.user.lifecycle??'active')==='active';
  return {userId:auth.user.id,expires:auth.expires,eligible:verified&&used<allowance,reason:billing?.review_required?'Your billing account needs review. Contact support before creating more pictures.':!verified?'Verify your email to start creating.':used>=allowance?'Your picture allowance is used. Your current artwork stays available.':'Your creative space is ready.',plan,allowance,baseAllowance:selected.allowance,allowanceAdjustment:allowance_adjustment,periodStart,periodEnd,used,cadence:selected.cadence};
}
export async function accountAccess(request:Request,env:ProductEnv,now:number) { const auth=await authenticate(request,env,now);return auth?accessFor(auth,env,now,localDevelopment(request,env)):null; }
