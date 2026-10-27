import {localDevelopment, ProductError, rate, type ProductEnv} from './core.ts';
import {requireAuth} from './auth.ts';
const loopbackHosts=new Set(['localhost','127.0.0.1','[::1]']);
function developmentOriginAllowed(origin:string|undefined){
 if(!origin)return true;
 try{const url=new URL(origin);return url.protocol==='http:'&&loopbackHosts.has(url.hostname)&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash;}catch{return false;}
}
export function configurationErrors(env:ProductEnv){
 const errors:string[]=[];if(env.HEARTBEAT_APP_MODE&&!['development','production'].includes(env.HEARTBEAT_APP_MODE))errors.push('invalid_app_mode');
 if(env.HEARTBEAT_APP_MODE==='development'&&!developmentOriginAllowed(env.HEARTBEAT_APP_ORIGIN))errors.push('development_requires_http_loopback_origin');
 if(env.HEARTBEAT_DEPLOYMENT_ENV&&!['development','staging','production'].includes(env.HEARTBEAT_DEPLOYMENT_ENV))errors.push('invalid_deployment_environment');
 const deployed=env.HEARTBEAT_DEPLOYMENT_ENV==='staging'||env.HEARTBEAT_DEPLOYMENT_ENV==='production';
 if(deployed){
  if(env.HEARTBEAT_APP_MODE!=='production')errors.push('hosted_requires_production_policy');
  try{const u=new URL(env.HEARTBEAT_APP_ORIGIN||'');if(u.protocol!=='https:'||u.username||u.password||u.hostname.endsWith('.invalid')||['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.pathname!=='/'||u.search||u.hash)errors.push('invalid_hosted_origin');}catch{errors.push('missing_hosted_origin');}
  if(!env.DB||!env.BUCKET||!env.ARTWORK_WORKFLOW)errors.push('missing_hosted_bindings');
  if(env.HEARTBEAT_AI_ENABLED==='true'){
   if(!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID||'')||!env.CLOUDFLARE_API_TOKEN)errors.push('missing_ai_credentials');
   if(!env.HEARTBEAT_DIRECTOR_MODEL?.startsWith('@cf/')||env.HEARTBEAT_IMAGE_MODEL!=='@cf/black-forest-labs/flux-1-schnell')errors.push('unsupported_models');
   if(!(Number(env.HEARTBEAT_DAILY_BUDGET_MICROS)>0)||!(Number(env.HEARTBEAT_DIRECTOR_ESTIMATE_MICROS)>0)||!(Number(env.HEARTBEAT_IMAGE_ESTIMATE_MICROS)>0))errors.push('unapproved_operating_budget');
  }
  if(env.HEARTBEAT_WEATHER_PROVIDER!=='open-meteo-commercial'||!env.HEARTBEAT_WEATHER_API_KEY)errors.push('commercial_weather_required');
  if(env.HEARTBEAT_LEGACY_ROUTES_ENABLED==='true')errors.push('legacy_routes_forbidden_hosted');
  if(env.HEARTBEAT_BILLING_ENABLED==='true'&&(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET||!env.STRIPE_STUDIO_PRICE_ID||!env.STRIPE_ATELIER_PRICE_ID||env.STRIPE_STUDIO_PRICE_ID===env.STRIPE_ATELIER_PRICE_ID||!env.HEARTBEAT_EMAIL_API_KEY||!env.HEARTBEAT_EMAIL_FROM))errors.push('billing_configuration_incomplete');
 }
 return errors;
}
export function assertConfiguration(env:ProductEnv){const errors=configurationErrors(env);if(errors.length)throw new Error(`Heartbeat configuration: ${errors.join(',')}`);}
export function operatorStudyAllowed(request:Request,env:ProductEnv){const u=new URL(request.url);return env.HEARTBEAT_APP_MODE==='development'&&developmentOriginAllowed(env.HEARTBEAT_APP_ORIGIN)&&env.HEARTBEAT_LEGACY_ROUTES_ENABLED==='true'&&u.protocol==='http:'&&loopbackHosts.has(u.hostname);}

// Weather is a metered server dependency in hosted environments. Anonymous
// access is reserved for the HTTP loopback prototype, before D1 is configured.
export async function authorizeWeatherRequest(request:Request,env:ProductEnv,kind:'context'|'search',now=Date.now()){
 if(env.HEARTBEAT_APP_MODE==='development'&&!developmentOriginAllowed(env.HEARTBEAT_APP_ORIGIN))throw new ProductError('Application address is not configured safely.',503);
 if(localDevelopment(request,env))return;
 const {user}=await requireAuth(request,env,now);
 await rate(env,`weather:${kind}:user:${user.id}`,now,kind==='context'?24:60,60000);
 await rate(env,'weather:global',now,1000,60000);
}

const verifiedSchemas=new WeakSet<object>();
export async function assertSchema(env:ProductEnv){
 if(!env.DB||verifiedSchemas.has(env.DB))return;
 const row=await env.DB.prepare('SELECT version FROM heartbeat_schema ORDER BY version DESC LIMIT 1').first<{version:number}>();
 if(!row||row.version<14)throw new Error('Apply the reviewed database migrations before running this version.');
 verifiedSchemas.add(env.DB);
}
