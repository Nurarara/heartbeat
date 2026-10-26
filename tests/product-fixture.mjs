import { DatabaseSync } from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import {productService} from '../lib/product/service.ts';
export async function fixture(options={}) {
 const sqlite=new DatabaseSync(':memory:');for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(await readFile(`drizzle/${file}`,'utf8'));
 function prepare(sql,args=[]) {const statement=sqlite.prepare(sql);const sync=()=>{const r=statement.run(...args);return {success:true,meta:{changes:Number(r.changes)}};};return {bind:(...values)=>prepare(sql,values),first:async()=>statement.get(...args)||null,all:async()=>({results:statement.all(...args)}),run:async()=>sync(),sync};}
 const DB={prepare,batch:async statements=>{sqlite.exec('BEGIN');try{const r=statements.map(s=>s.sync());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const objects=new Map(),calls=[],emails=[];let at=Date.parse('2026-10-21T12:00:00Z');
 const env={DB,BUCKET:{put:async(k,b)=>objects.set(k,b),get:async k=>objects.has(k)?{body:new Response(objects.get(k)).body}:null,delete:async k=>objects.delete(k)},HEARTBEAT_APP_ORIGIN:options.production?'https://heartbeat.example':'http://localhost:5173',HEARTBEAT_APP_MODE:options.production?'production':'development',HEARTBEAT_AI_ENABLED:'true',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'fake-provider-token',HEARTBEAT_AI_ACCESS_KEY:'fake-operator-key-'.repeat(4),HEARTBEAT_AI_DAILY_LIMIT:'100',...options.env};
 const fetcher=options.fetcher||(async(url,options)=>{if(String(url)==='https://api.resend.com/emails'){emails.push(JSON.parse(options.body));return Response.json({id:'mock-email'});}throw new Error('Unexpected external request');});
 const service=productService(env,{now:()=>at,fetcher});
 async function call(path,body,config={}) {const origin=config.urlOrigin||env.HEARTBEAT_APP_ORIGIN;return service.handle(new Request(`${origin}/api/product/${path}`,{method:config.method||(body===undefined?'GET':'POST'),headers:{Origin:config.origin||origin,'Content-Type':'application/json',...(config.cookie?{Cookie:config.cookie}:{}),...config.headers},...(body===undefined?{}:{body:JSON.stringify(body)})}));}
 async function register(address='alice@example.test') {const response=await call('auth/register',{email:address,password:'a long test password'});if(response.status!==200)throw new Error(`Registration failed: ${await response.text()}`);return {cookie:response.headers.get('set-cookie').split(';')[0],data:await response.json()};}
 return {sqlite,env,objects,calls,emails,service,call,register,fetcher,now:()=>at,advance:ms=>at+=ms,close:()=>sqlite.close()};
}
