// Local setup only. Preserves secrets, operating limits and existing data.
import {readFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
function query(args){const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--json',...args],{encoding:'utf8',timeout:120000,windowsHide:true});if(r.status!==0)throw new Error('Local account migration failed. No cloud resources were changed.');return JSON.parse(r.stdout).flatMap(v=>v.results||[]);}
const tables=query(['--command',"SELECT name FROM sqlite_master WHERE type='table' AND name='hb_users'"]);
if(!tables.length)query(['--file','drizzle/0006_tense_phil_sheldon.sql']);
const columns=query(['--command','PRAGMA table_info(hb_billing)']);
if(!columns.some(c=>c.name==='review_required'))query(['--file','drizzle/0007_cold_omega_sentinel.sql']);
const vars=readFileSync('.dev.vars','utf8');
if(!/^HEARTBEAT_APP_MODE\s*=/m.test(vars))appendFileSync('.dev.vars','\n# Development accounts are allowed only on loopback. Use production for deployment.\nHEARTBEAT_APP_MODE=development\n');
if(!/^HEARTBEAT_BILLING_ENABLED\s*=/m.test(vars))appendFileSync('.dev.vars','HEARTBEAT_BILLING_ENABLED=false\n');
console.log('Local account tables are ready. Existing credentials, attempt limits and artwork were preserved. Development mode is local-only; live billing remains separately configured. Restart npm run dev.');
