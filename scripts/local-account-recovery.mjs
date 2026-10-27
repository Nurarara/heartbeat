// Local operator recovery: issues an ordinary one-use reset link, never a remote reset.
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export function localOrigin(value){
 const url=new URL(value);if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Local account recovery requires an HTTP loopback origin.');return url.origin;
}
export async function issueRecoveryLink(address,origin,execute,now=Date.now()){
 const normalized=typeof address==='string'?address.trim().toLowerCase():'';
 if(normalized.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw Error('Enter a valid email address.');
 const safeOrigin=localOrigin(origin),token=randomBytes(32).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
 const escaped=normalized.replaceAll("'","''");
 const sql=`INSERT INTO hb_tokens(hash,user_id,kind,expires) SELECT '${digest}',id,'reset',${Math.floor(now+1800000)} FROM hb_users WHERE email='${escaped}' AND lifecycle='active' RETURNING user_id;`;
 if(!await execute(sql))throw Error('No active local account matched that email address.');
 const link=new URL('/auth',safeOrigin);link.searchParams.set('reset',token);return link.href;
}
export async function executeLocalRecoverySQL(sql){
 const directory=path.resolve('.sites-runtime');mkdirSync(directory,{recursive:true});const file=path.join(directory,`recovery-${randomUUID()}.sql`);
 try{
  writeFileSync(file,sql,{flag:'wx',mode:0o600});
  const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--json','--file',file],{encoding:'utf8',timeout:60000,windowsHide:true});
  if(result.status!==0)throw Error('Could not access the local account database. Run npm run build and npm run product:prepare first.');
  const data=JSON.parse(result.stdout);return data.some(item=>Array.isArray(item.results)&&item.results.length>0);
 }finally{try{unlinkSync(file);}catch{}}
}
async function main(){
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Run this command in an interactive terminal.');
 const values={};for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){const match=line.match(/^([A-Z_]+)=(.*)$/);if(match)values[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
 if(values.HEARTBEAT_APP_MODE!=='development'||['staging','production'].includes(values.HEARTBEAT_DEPLOYMENT_ENV))throw Error('This command only works with the local development account database.');
 const origin=localOrigin(values.HEARTBEAT_APP_ORIGIN||'http://localhost:5173');
 const rl=createInterface({input:process.stdin,output:process.stdout});let address;try{address=await rl.question('Email used for your local Heartbeat account: ');}finally{rl.close();}
 const link=await issueRecoveryLink(address,origin,executeLocalRecoverySQL);
 console.log('\nOpen this private, one-use link in your browser within 30 minutes:');console.log(link);console.log('Choose a new Heartbeat password on the page. Do not share the link.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error instanceof Error?error.message:'Local account recovery failed.');process.exitCode=1;});
