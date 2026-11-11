import {db,ProductError,type ProductEnv} from './core.ts';
import {currentUsageEntitlementSQL,usageForAccount} from './usage.ts';

export type PictureAllowanceAdjustmentInput={requestId:string;userId:string;periodStart:number;periodEnd:number;delta:number;actor:string;reason:string;now?:number};
type Adjustment={request_id:string;owner:string;period_key:string;period_start:number;period_end:number;delta:number;base_allowance:number;allowance_before:number;allowance_after:number;reserved:number;committed:number;actor:string;reason:string;created_at:number};
type Entitlement={owner:string;period_start:number;period_end:number;base_allowance:number;financial_review:number};
const MAX_ADJUSTMENT=100000,MAX_DATE=8640000000000000;
function normalize(input:PictureAllowanceAdjustmentInput){
 if(typeof input.requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(input.requestId))throw new ProductError('Supply a unique adjustment request ID between 8 and 128 characters.');
 if(typeof input.userId!=='string'||!input.userId.trim()||input.userId.length>100)throw new ProductError('Supply the account ID.');
 if(!Number.isSafeInteger(input.periodStart)||!Number.isSafeInteger(input.periodEnd)||input.periodStart<0||input.periodEnd<=input.periodStart||input.periodEnd>MAX_DATE)throw new ProductError('Supply the exact current account period.');
 if(!Number.isSafeInteger(input.delta)||input.delta===0||Math.abs(input.delta)>MAX_ADJUSTMENT)throw new ProductError('The picture adjustment must be a nonzero integer between -100000 and 100000.');
 if(typeof input.actor!=='string'||!input.actor.trim()||input.actor.length>100||typeof input.reason!=='string'||input.reason.trim().length<8||input.reason.length>1000)throw new ProductError('Supply the operator identity and a reason between 8 and 1000 characters.');
 const now=input.now??Date.now();if(!Number.isSafeInteger(now)||now<0||now>MAX_DATE)throw new ProductError('Invalid adjustment time.');
 return {...input,userId:input.userId.trim(),actor:input.actor.trim(),reason:input.reason.trim(),now};
}
function sameRequest(row:Adjustment,input:ReturnType<typeof normalize>){return row.owner===input.userId&&row.period_start===input.periodStart&&row.period_end===input.periodEnd&&row.delta===input.delta&&row.actor===input.actor&&row.reason===input.reason;}
function result(row:Adjustment,replayed:boolean){return {requestId:row.request_id,userId:row.owner,periodStart:row.period_start,periodEnd:row.period_end,delta:row.delta,baseAllowance:row.base_allowance,allowanceAdjustment:row.allowance_after,allowance:row.base_allowance+row.allowance_after,reserved:row.reserved,committed:row.committed,used:row.reserved+row.committed,actor:row.actor,reason:row.reason,createdAt:row.created_at,replayed};}

/**
 * Internal domain operation. Only the separately authenticated operator route
 * exposes it. Grants/withdrawals change this period's allowance, never the
 * immutable record of successful pictures or any provider-cost estimate.
 */
export async function adjustPictureAllowance(env:ProductEnv,raw:PictureAllowanceAdjustmentInput){
 const input=normalize(raw),database=db(env),key=`${input.periodStart}:${input.periodEnd}`;
 const read=()=>database.prepare('SELECT * FROM hb_usage_adjustments WHERE request_id=?').bind(input.requestId).first<Adjustment>();
 const existing=await read();if(existing){if(!sameRequest(existing,input))throw new ProductError('This adjustment request ID already has different details.',409);return result(existing,true);}
 const entitlement=await database.prepare(currentUsageEntitlementSQL).bind(input.now,input.userId).first<Entitlement>();
 if(!entitlement)throw new ProductError('Picture allowance adjustments require an active account.',409);
 if(entitlement.financial_review)throw new ProductError('Resolve the account billing review before adjusting picture allowance.',409);
 if(entitlement.period_start!==input.periodStart||entitlement.period_end!==input.periodEnd)throw new ProductError('The account period changed. Refresh it before making an adjustment.',409);
 await usageForAccount(env,input.userId,input.periodStart,input.periodEnd);
 const changed=await database.batch([
  database.prepare(`UPDATE hb_usage_periods SET allowance_adjustment=allowance_adjustment+?,adjustment_claim=? WHERE owner=? AND period_key=? AND allowance_adjustment+? BETWEEN -${MAX_ADJUSTMENT} AND ${MAX_ADJUSTMENT} AND ?+allowance_adjustment+?>=reserved+committed AND NOT EXISTS(SELECT 1 FROM hb_usage_adjustments WHERE request_id=?) AND EXISTS(SELECT 1 FROM (${currentUsageEntitlementSQL}) e WHERE e.owner=hb_usage_periods.owner AND e.period_start=hb_usage_periods.period_start AND e.period_end=hb_usage_periods.period_end AND e.base_allowance=? AND e.financial_review=0)`).bind(input.delta,input.requestId,input.userId,key,input.delta,entitlement.base_allowance,input.delta,input.requestId,input.now,input.userId,entitlement.base_allowance),
  database.prepare('INSERT OR IGNORE INTO hb_usage_adjustments(request_id,owner,period_key,period_start,period_end,delta,base_allowance,allowance_before,allowance_after,reserved,committed,actor,reason,created_at) SELECT ?,owner,period_key,period_start,period_end,?,?,allowance_adjustment-?,allowance_adjustment,reserved,committed,?,?,? FROM hb_usage_periods WHERE owner=? AND period_key=? AND adjustment_claim=?').bind(input.requestId,input.delta,entitlement.base_allowance,input.delta,input.actor,input.reason,input.now,input.userId,key,input.requestId),
  database.prepare("INSERT OR IGNORE INTO hb_operator_audit(id,actor,action,target,reason,created_at) SELECT ?,actor,'adjust_picture_allowance',owner,reason,created_at FROM hb_usage_adjustments WHERE request_id=?").bind(`picture-credit:${input.requestId}`,input.requestId),
 ]);
 const recorded=await read();if(!recorded)throw new ProductError('The account period or available allowance changed. Refresh it before making an adjustment.',409);
 if(!sameRequest(recorded,input))throw new ProductError('This adjustment request ID already has different details.',409);
 return result(recorded,changed[0].meta.changes===0);
}
