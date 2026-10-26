// Local setup only. Preserves secrets, operating limits and existing data.
import {readFileSync,appendFileSync,mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
function query(args){const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--json',...args],{encoding:'utf8',timeout:120000,windowsHide:true});if(r.status!==0)throw new Error('Local account migration failed. No cloud resources were changed.');return JSON.parse(r.stdout).flatMap(v=>v.results||[]);}
const tables=query(['--command',"SELECT name FROM sqlite_master WHERE type='table' AND name='hb_users'"]);
if(!tables.length)query(['--file','drizzle/0006_tense_phil_sheldon.sql']);
const columns=query(['--command','PRAGMA table_info(hb_billing)']);
if(!columns.some(c=>c.name==='review_required'))query(['--file','drizzle/0007_cold_omega_sentinel.sql']);
const additions=[
 ['hb_users','lifecycle','0008_authoritative_state.sql'],
 ['hb_sessions','credential_epoch','0009_security_context.sql'],
 ['hb_billing_inbox',null,'0010_billing_recovery.sql'],
 ['hb_assets',null,'0011_runtime_recovery.sql'],
 ['heartbeat_schema',null,'0012_read_and_repair_indexes.sql'],
 ['hb_usage_adjustments',null,'0013_usage_adjustments.sql'],
];
let backedUp=false;
function backupLocalDatabase(){
 // Wrangler 4.92 export has no --persist-to flag: it resolves storage beside
 // its config. Use a minimal temporary config at the workspace root so the
 // export reads the same .wrangler/state as execute, never dist/server state.
 const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
 const temporary=`.heartbeat-local-backup-${randomUUID()}.json`,backup=`outputs/backups/pre-architecture-${Date.now()}.sql`;
 const countsSQL='SELECT (SELECT COUNT(*) FROM hb_users) AS users,(SELECT COUNT(*) FROM ai_attempts) AS attempts,(SELECT COUNT(*) FROM ai_attempts WHERE art_key IS NOT NULL) AS artwork,(SELECT COUNT(*) FROM hb_jobs) AS jobs';
 const expected=query(['--command',countsSQL])[0];
 mkdirSync('outputs/backups',{recursive:true});
 writeFileSync(temporary,JSON.stringify({name:'heartbeat-local-backup',compatibility_date:config.compatibility_date,d1_databases:config.d1_databases}),{flag:'wx',mode:0o600});
 try{
  const exported=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','export','DB','--local','--config',temporary,'--output',backup],{encoding:'utf8',timeout:120000,windowsHide:true});
  if(exported.status!==0)throw new Error('Local backup failed. Architecture migrations were not started.');
  const restored=new DatabaseSync(':memory:');
  try{
   restored.exec(readFileSync(backup,'utf8'));
   const actual=restored.prepare(countsSQL).get();
   if(Object.keys(expected).some(key=>Number(actual[key])!==Number(expected[key]))||restored.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('Local backup validation failed. Stop local servers before retrying. Architecture migrations were not started.');
  }finally{restored.close();}
 }finally{unlinkSync(temporary);}
 console.log('Saved and restore-checked a private local database backup under ignored outputs/backups.');
}
for(const [table,column,file] of additions){
 const present=column?query(['--command',`PRAGMA table_info(${table})`]).some(c=>c.name===column):query(['--command',`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`]).length>0;
 if(present)continue;
 if(!backedUp){
  backupLocalDatabase();backedUp=true;
 }
 query(['--file',`drizzle/${file}`]);console.log(`Applied local migration ${file}.`);
}
const vars=readFileSync('.dev.vars','utf8');
if(!/^HEARTBEAT_APP_MODE\s*=/m.test(vars))appendFileSync('.dev.vars','\n# Development accounts are allowed only on loopback. Use production for deployment.\nHEARTBEAT_APP_MODE=development\n');
if(!/^HEARTBEAT_BILLING_ENABLED\s*=/m.test(vars))appendFileSync('.dev.vars','HEARTBEAT_BILLING_ENABLED=false\n');
console.log('Local account tables are ready. Existing credentials, attempt limits and artwork were preserved. Development mode is local-only; live billing remains separately configured. Restart npm run dev.');
