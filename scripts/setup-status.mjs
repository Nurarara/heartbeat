// Local configuration inventory. Never prints credentials or makes API calls.
import {existsSync,readFileSync,readdirSync} from 'node:fs';
const vars={};if(existsSync('.dev.vars'))for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){const match=line.match(/^([A-Z_]+)=(.*)$/);if(match)vars[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
const present=key=>!!vars[key]&&!/^(?:REPLACE|GENERATED|YOUR_|CHANGEME)/i.test(vars[key]);
const groups={
 'Recording demo':{configured:existsSync('public/demo/art')&&readdirSync('public/demo/art').filter(file=>file.endsWith('.webp')).length===10,needs:[]},
 'Live AI configuration':{configured:vars.HEARTBEAT_AI_ENABLED==='true'&&present('CLOUDFLARE_ACCOUNT_ID')&&present('CLOUDFLARE_API_TOKEN'),needs:['HEARTBEAT_AI_ENABLED','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN']},
 'Verification/reset email':{configured:present('HEARTBEAT_EMAIL_API_KEY')&&present('HEARTBEAT_EMAIL_FROM'),needs:['HEARTBEAT_EMAIL_API_KEY','HEARTBEAT_EMAIL_FROM']},
 'Stripe configuration':{configured:['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_STUDIO_PRICE_ID','STRIPE_ATELIER_PRICE_ID'].every(present),needs:['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_STUDIO_PRICE_ID','STRIPE_ATELIER_PRICE_ID']},
 'Billing activation':{configured:vars.HEARTBEAT_BILLING_ENABLED==='true',needs:['HEARTBEAT_BILLING_ENABLED']},
};
console.log('Heartbeat local setup — values are hidden. “Configured” does not mean real-service testing passed.');
for(const [name,state] of Object.entries(groups))console.log(`${state.configured?'CONFIGURED':'PENDING'} · ${name}${state.configured?'':` · check ${state.needs.join(', ')||'prepared image files'}`}`);
const config=JSON.parse(readFileSync('config/environments.json','utf8'));
for(const name of ['staging','production']){const target=config[name],ready=target&&!target.origin?.endsWith('.invalid')&&!String(target.databaseId).startsWith('REPLACE')&&target.dailyBudgetMicros>0;console.log(`${ready?'CONFIGURED':'PENDING'} · ${name} resources and operating budget`);}
console.log('Guide: docs/launch-setup.md · Recording: http://localhost:5173/demo');
