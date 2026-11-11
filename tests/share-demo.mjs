// Verify the separately served demo cannot reach the real application's routes or files.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {existsSync,readFileSync} from 'node:fs';
import {createDemoPreview} from '../scripts/preview-share-demo.mjs';
import {DEMO_SCENES} from '../lib/demo-scenes.ts';

const server=await createDemoPreview();server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
try{
 const home=await fetch(origin);assert.equal(home.status,200);assert.match(home.headers.get('content-security-policy'),/connect-src 'none'/);assert.equal(home.headers.get('set-cookie'),null);assert.match(await home.text(),/prepared artwork demo/);
 for(const asset of ['/demo.js','/demo.css','/fonts/manrope.ttf',...DEMO_SCENES.map(scene=>scene.image)])assert.equal((await fetch(origin+asset)).status,200,asset);
 const bundle=await (await fetch(origin+'/demo.js')).text();
 if(existsSync('.dev.vars'))for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i<0||!/(TOKEN|SECRET|PASSWORD|ACCESS_KEY|API_KEY)/i.test(line.slice(0,i)))continue;const value=line.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2');if(value.length>=16)assert.ok(!bundle.includes(value),'The demo bundle must not include configured local secrets');}
 for(const forbidden of ['/auth','/api/product/auth/session','/api/product/generation','/api/ai/status','/.dev.vars','/%2e%2e/.dev.vars','/demo/art/not-in-manifest.webp'])assert.equal((await fetch(origin+forbidden)).status,404,forbidden);
 const post=await fetch(origin+'/api/product/generation',{method:'POST'});assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD');
 const head=await fetch(origin+'/demo.js',{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
 console.log('Passed isolated demo allowlist, all fifteen artwork assets, no account/AI/private-file routes, read-only methods and no outbound connections.');
}finally{server.close();await once(server,'close');}
