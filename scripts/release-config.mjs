import {readFileSync} from 'node:fs';
export function validateReleaseConfiguration(all,name){
 if(!['staging','production'].includes(name))throw new Error('Select staging or production.');
 const selected=all[name],other=all[name==='staging'?'production':'staging'];
 if(!selected||!other)throw new Error('Both release environments must be configured.');
 if(typeof selected.billingEnabled!=='boolean')throw new Error('Set an explicit reviewed billing activation flag.');
 for(const key of ['name','origin','databaseId','databaseName','bucketName','workflowName'])if(typeof selected[key]!=='string'||!selected[key].trim()||selected[key].toLowerCase()===String(other[key]).toLowerCase())throw new Error(`Release isolation is missing: ${key}`);
 if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(selected.databaseId)||selected.databaseId==='00000000-0000-4000-8000-000000000000')throw new Error('Provision and configure an isolated D1 database first.');
 const origin=new URL(selected.origin);if(origin.protocol!=='https:'||origin.username||origin.password||origin.hostname.endsWith('.invalid')||['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Configure the real HTTPS application origin first.');
 if(origin.origin===new URL(other.origin).origin)throw new Error('Staging and production origins must be different.');
 for(const key of ['dailyAttemptLimit','dailyBudgetMicros','directorEstimateMicros','imageEstimateMicros','providerConcurrency'])if(!Number.isSafeInteger(selected[key])||selected[key]<=0)throw new Error(`Approve an explicit operating setting: ${key}`);
 return selected;
}
export function validateReleaseBuild(config,selected,target){
 if(config?.name!==selected.name||config?.vars?.HEARTBEAT_DEPLOYMENT_ENV!==target||config?.vars?.HEARTBEAT_APP_MODE!=='production'||config?.vars?.HEARTBEAT_APP_ORIGIN!==selected.origin||config?.vars?.HEARTBEAT_BILLING_ENABLED!==String(selected.billingEnabled))throw new Error('Built release configuration does not match the approved environment.');
 for(const [setting,key] of Object.entries({dailyAttemptLimit:'HEARTBEAT_AI_DAILY_LIMIT',dailyBudgetMicros:'HEARTBEAT_DAILY_BUDGET_MICROS',directorEstimateMicros:'HEARTBEAT_DIRECTOR_ESTIMATE_MICROS',imageEstimateMicros:'HEARTBEAT_IMAGE_ESTIMATE_MICROS',providerConcurrency:'HEARTBEAT_PROVIDER_CONCURRENCY'}))if(Number(config.vars[key])!==selected[setting])throw new Error('Built operating limits do not match the approved environment.');
 const database=config.d1_databases?.find(b=>b.binding==='DB'),bucket=config.r2_buckets?.find(b=>b.binding==='BUCKET'),workflow=config.workflows?.find(b=>b.binding==='ARTWORK_WORKFLOW');
 if(database?.database_id!==selected.databaseId||database?.database_name!==selected.databaseName||bucket?.bucket_name!==selected.bucketName||workflow?.name!==selected.workflowName||workflow?.class_name!=='HeartbeatWorkflow')throw new Error('Built release resource isolation is inconsistent. Nothing deployed.');
}
export function validateReleaseSecrets(selected,target,values){
 const required=['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','HEARTBEAT_RUNTIME_AI_TOKEN','HEARTBEAT_WEATHER_API_KEY','HEARTBEAT_EMAIL_API_KEY','HEARTBEAT_EMAIL_FROM','HEARTBEAT_OPERATOR_KEY'];
 if(required.some(key=>!values[key]))throw new Error('Required release credentials/settings are missing. Nothing deployed.');
 if(!!values.HEARTBEAT_GOOGLE_CLIENT_ID!==!!values.HEARTBEAT_GOOGLE_CLIENT_SECRET)throw new Error('Google sign-in requires both client ID and secret.');
 if(target==='staging'&&/^(?:sk|rk)_live_/.test(values.STRIPE_SECRET_KEY||''))throw new Error('Staging cannot use live Stripe credentials.');
 if(selected.billingEnabled){
  if(['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_STUDIO_PRICE_ID','STRIPE_ATELIER_PRICE_ID'].some(key=>!values[key])||values.STRIPE_STUDIO_PRICE_ID===values.STRIPE_ATELIER_PRICE_ID)throw new Error('Billing activation requires complete distinct Stripe settings.');
  if(target==='production'&&!/^(?:sk|rk)_live_/.test(values.STRIPE_SECRET_KEY))throw new Error('Production billing activation requires an explicitly configured live Stripe key.');
 }
}
export function releaseConfiguration(name){return validateReleaseConfiguration(JSON.parse(readFileSync(new URL('../config/environments.json',import.meta.url),'utf8')),name);}
if(process.argv[1]?.endsWith('release-config.mjs')){releaseConfiguration(process.argv[2]);console.log('Release environment isolation and budget configuration passed. No resources changed.');}
