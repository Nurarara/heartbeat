// Runs the private beta on this computer for app.heartbeatart.co.uk (or any HTTPS address).
// Cloudflare Tunnel forwards the public address to http://localhost:<port>; nothing else is exposed.
//   npm run beta:serve            build, update the database, start
//   npm run beta:serve -- nobuild (or `npm run beta:serve nobuild`) skip the build
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,copyFileSync,existsSync} from 'node:fs';

const PORT=Number(process.env.HEARTBEAT_BETA_PORT||8787);
const args=new Set(process.argv.slice(2).map(a=>a.replace(/^-+/,'')));
function vars(){const env={};try{for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);if(m)env[m[1]]=m[2].replace(/^["']|["']$/g,'');}}catch{/* checked below */}return env;}
const env=vars(),problems=[];
const need=(key,ok=v=>!!v,why='')=>{if(!ok(env[key]))problems.push(`${key}${why?` (${why})`:''}`);};
need('HEARTBEAT_APP_ORIGIN',v=>/^https:\/\/[a-z0-9.-]+\/?$/.test(v||''),'e.g. https://app.heartbeatart.co.uk');
need('HEARTBEAT_APP_MODE',v=>v==='production','must be production');
need('HEARTBEAT_SELF_HOSTED',v=>v==='true','must be true');
need('HEARTBEAT_BETA',v=>v==='true','must be true');
need('HEARTBEAT_OWNER_EMAIL',v=>/@/.test(v||''),'the email you sign in with');
need('HEARTBEAT_EMAIL_API_KEY',undefined,'Resend API key');
need('HEARTBEAT_EMAIL_FROM',v=>/@/.test(v||''),'e.g. Heartbeat <hello@heartbeatart.co.uk>');
need('HEARTBEAT_OPERATOR_KEY',v=>(v||'').length>=32,'at least 32 random characters');
need('HEARTBEAT_DAILY_BUDGET_MICROS',v=>Number(v)>0,'5000000 = $5 a day');
need('HEARTBEAT_IMAGE_ESTIMATE_MICROS',v=>Number(v)>0);need('HEARTBEAT_DIRECTOR_ESTIMATE_MICROS',v=>Number(v)>0);
if(env.HEARTBEAT_AI_ENABLED==='true'){need('CLOUDFLARE_ACCOUNT_ID');need('CLOUDFLARE_API_TOKEN');if(env.HEARTBEAT_IMAGE_PROVIDER==='azure'){need('AZURE_IMAGE_ENDPOINT');need('AZURE_IMAGE_KEY');}}
if(problems.length){console.error('Fix these lines in .dev.vars first (see docs/private-beta.md):\n  '+problems.join('\n  '));process.exit(1);}
const host=new URL(env.HEARTBEAT_APP_ORIGIN).hostname;

function run(file,list){const r=spawnSync(process.execPath,[file,...list],{stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);}
if(!args.has('nobuild')){console.log('Building Heartbeat…');run('scripts/run-framework.mjs',['build']);}
if(!existsSync('dist/server/wrangler.json')){console.error('No build found. Run without nobuild.');process.exit(1);}
// The built server reads its settings from beside its own config.
copyFileSync('.dev.vars','dist/server/.dev.vars');
run('scripts/beta-setup.mjs',[]);

console.log(`\nStarting Heartbeat on http://localhost:${PORT} for https://${host} …`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--port',String(PORT),'--strictPort'],{stdio:'inherit',windowsHide:true,env:{...process.env,HEARTBEAT_PUBLIC_HOST:host}});
// Hosted Cloudflare runs maintenance every minute (finishing pictures, cleanup). Do the same here.
const timer=setInterval(async()=>{
 try{const r=await fetch(`http://127.0.0.1:${PORT}/api/product/ops/maintenance`,{method:'POST',headers:{Authorization:`Bearer ${env.HEARTBEAT_OPERATOR_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({actor:'beta-serve',reason:'Every-minute maintenance on the self-hosted beta'})});if(!r.ok&&r.status!==503)console.warn(`Maintenance returned ${r.status}`);}
 catch{/* server still starting */}
},60000);
setTimeout(()=>console.log(`\nReady. Open https://${host}/auth on any device (the tunnel must be running).\nYour dashboard: https://${host}/admin\nPress Ctrl+C to stop.\n`),15000);
const stop=()=>{clearInterval(timer);server.kill();process.exit(0);};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
server.on('exit',code=>{clearInterval(timer);console.log(`Heartbeat stopped (${code}).`);process.exit(code||0);});
