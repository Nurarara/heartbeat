// Private beta, self-hosted: bring this computer's local database up to date.
// Works on a fresh machine (applies every migration) and on an existing local
// database (applies only the missing ones, after a backup copy). Run after `npm run build`.
import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync,mkdirSync,cpSync} from 'node:fs';

if(!existsSync('dist/server/wrangler.json')){console.error('Run `npm run build` first.');process.exit(1);}
function d1(args){
 const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--json',...args],{encoding:'utf8',timeout:180000,windowsHide:true});
 if(r.status!==0){console.error(r.stderr||r.stdout);throw new Error('Local database update failed. Nothing in the cloud was changed.');}
 return JSON.parse(r.stdout).flatMap(v=>v.results||[]);
}
const tables=new Set(d1(['--command',"SELECT name FROM sqlite_master WHERE type='table'"]).map(t=>t.name));
const files=readdirSync('drizzle').filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort();
let pending;
if(!tables.has('hb_users')&&!tables.has('generations')){pending=files;console.log('New database: creating all tables.');}
else if(tables.has('heartbeat_schema')){
 const version=Number(d1(['--command','SELECT MAX(version) AS v FROM heartbeat_schema'])[0]?.v||0);
 pending=files.filter(f=>Number(f.slice(0,4))>version);
 if(pending.length&&existsSync('.wrangler/state/v3/d1')){const copy=`outputs/backups/d1-before-beta-${Date.now()}`;mkdirSync('outputs/backups',{recursive:true});cpSync('.wrangler/state/v3/d1',copy,{recursive:true});console.log(`Backed up the local database to ${copy}.`);}
}else{console.error('This local database is older than the beta expects. Run `npm run ai:prepare` and `node scripts/prepare-product.mjs` once, then run this again.');process.exit(1);}
for(const file of pending){d1(['--file',`drizzle/${file}`]);console.log(`Applied ${file}.`);}
console.log(pending.length?'Database is ready.':'Database was already up to date.');
