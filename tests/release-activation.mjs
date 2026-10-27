import assert from 'node:assert/strict';
import {validateReleaseSecrets} from '../scripts/release-config.mjs';
const values=Object.fromEntries(['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','HEARTBEAT_RUNTIME_AI_TOKEN','HEARTBEAT_WEATHER_API_KEY','HEARTBEAT_EMAIL_API_KEY','HEARTBEAT_EMAIL_FROM','HEARTBEAT_OPERATOR_KEY'].map(key=>[key,'fixture']));
assert.doesNotThrow(()=>validateReleaseSecrets({billingEnabled:false},'staging',values));
assert.throws(()=>validateReleaseSecrets({billingEnabled:false},'staging',{...values,HEARTBEAT_GOOGLE_CLIENT_ID:'fixture-client'}),/both client ID and secret/);
assert.doesNotThrow(()=>validateReleaseSecrets({billingEnabled:false},'staging',{...values,HEARTBEAT_GOOGLE_CLIENT_ID:'fixture-client',HEARTBEAT_GOOGLE_CLIENT_SECRET:'fixture-secret'}));
assert.throws(()=>validateReleaseSecrets({billingEnabled:true},'staging',values),/complete/);
const stripe={...values,STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'fixture-webhook',STRIPE_STUDIO_PRICE_ID:'price_studio',STRIPE_ATELIER_PRICE_ID:'price_atelier'};
assert.doesNotThrow(()=>validateReleaseSecrets({billingEnabled:true},'staging',stripe));
assert.throws(()=>validateReleaseSecrets({billingEnabled:true},'production',stripe),/live/);
for(const key of ['sk_live_fixture','rk_live_fixture']){assert.throws(()=>validateReleaseSecrets({billingEnabled:false},'staging',{...stripe,STRIPE_SECRET_KEY:key}),/live/);assert.doesNotThrow(()=>validateReleaseSecrets({billingEnabled:true},'production',{...stripe,STRIPE_SECRET_KEY:key}));}
assert.throws(()=>validateReleaseSecrets({billingEnabled:true},'staging',{...stripe,STRIPE_ATELIER_PRICE_ID:'price_studio'}),/distinct/);
console.log('Passed explicit billing activation, sandbox/live credential isolation, required secrets and distinct Price settings. No Stripe requests.');
