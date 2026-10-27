// Only invoked by an explicitly approved GitHub environment release. Never run
// during build, dev, tests or source publication. No secrets are printed/written.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {releaseConfiguration,validateReleaseBuild,validateReleaseSecrets} from './release-config.mjs';
const target=process.env.HEARTBEAT_DEPLOYMENT_ENV,selected=releaseConfiguration(target);
if(process.env.GITHUB_ACTIONS!=='true'||!/^[a-f0-9]{40}$/.test(process.env.HEARTBEAT_RELEASE_VERIFIED_SHA||'')||process.env.HEARTBEAT_RELEASE_VERIFIED_SHA!==process.env.GITHUB_SHA)throw new Error('Run the protected, exact-revision release workflow. Nothing deployed.');
const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true});if(head.status!==0||head.stdout.trim()!==process.env.HEARTBEAT_RELEASE_VERIFIED_SHA)throw new Error('Release checkout changed after qualification. Nothing deployed.');
if(process.platform!=='linux')throw new Error('Use the qualified Ubuntu release runner. Nothing deployed.');
validateReleaseBuild(JSON.parse(readFileSync('dist/server/wrangler.json','utf8')),selected,target);
validateReleaseSecrets(selected,target,process.env);
function wrangler(args,input){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args,'--config','dist/server/wrangler.json'],{input,encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Release command failed. Inspect the target service through authenticated operator tools; credentials are redacted.');}
const values={CLOUDFLARE_ACCOUNT_ID:process.env.CLOUDFLARE_ACCOUNT_ID,CLOUDFLARE_API_TOKEN:process.env.HEARTBEAT_RUNTIME_AI_TOKEN};
for(const key of ['HEARTBEAT_WEATHER_API_KEY','HEARTBEAT_EMAIL_API_KEY','HEARTBEAT_EMAIL_FROM','HEARTBEAT_OPERATOR_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_STUDIO_PRICE_ID','STRIPE_ATELIER_PRICE_ID'])if(process.env[key])values[key]=process.env[key];
// Additive migrations precede code activation. Backwards compatibility and a
// tested rollback version remain human acceptance gates. Wrangler 4.92 accepts
// --secrets-file; on the Ubuntu runner /dev/stdin supplies the JSON without a
// persistent secret file. Code and secrets are uploaded in the same deployment.
wrangler(['d1','migrations','apply','DB','--remote']);
wrangler(['deploy','--secrets-file','/dev/stdin','--message',`Heartbeat ${process.env.HEARTBEAT_RELEASE_VERIFIED_SHA}`],JSON.stringify(values));
console.log(`Release uploaded. Billing is ${selected.billingEnabled?'enabled by the reviewed configuration':'disabled'}. Verify hosted acceptance and the recorded rollback version.`);
