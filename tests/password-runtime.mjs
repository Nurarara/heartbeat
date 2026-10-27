// Node 22+, repository root: node --experimental-strip-types tests/password-runtime.mjs
// Actual auth module, Node reference bytes and true Workerd. No network or secrets.
import assert from 'node:assert/strict';
import nodeCrypto,{pbkdf2Sync} from 'node:crypto';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {performance} from 'node:perf_hooks';
import {build} from 'esbuild';
import {passwordHash,passwordMatches,PASSWORD_ITERATIONS} from '../lib/product/auth.ts';

const password='a deliberately fake runtime test password',salt='a'.repeat(32);
const expected=pbkdf2Sync(password,salt,600000,32,'sha256').toString('hex');
const expectedStored=`pbkdf2-sha256.v1.600000.${salt}.${expected}`;
assert.equal(PASSWORD_ITERATIONS,600000);
const native=nodeCrypto.pbkdf2,deriveBits=crypto.subtle.deriveBits;
const calls=[];let mode='native',nativeBuffer;
nodeCrypto.pbkdf2=(...args)=>{
 const callback=args.at(-1);calls.push({iterations:args[2],length:args[3],digest:args[4]});
 if(mode==='cap')return queueMicrotask(()=>callback(new DOMException('Pbkdf2 failed: iteration count cannot exceed 100000.','NotSupportedError')));
 if(mode==='not-implemented'){const error=new Error('[unenv] crypto.pbkdf2 is not implemented yet!');error.code='ERR_METHOD_NOT_IMPLEMENTED';throw error;}
 if(mode==='unexpected')return queueMicrotask(()=>callback(new Error('Unrelated native failure')));
 if(mode==='invalid-input')return queueMicrotask(()=>callback(new TypeError('The password argument is invalid')));
 native(...args.slice(0,-1),(error,result)=>{nativeBuffer=result;callback(error,result);});
};
syncBuiltinESMExports();
try{
 const start=performance.now();assert.equal(await passwordHash(password,salt),expectedStored);const nativeMs=Math.round(performance.now()-start);
 assert.equal(calls.length,1);assert.deepEqual(calls[0],{iterations:600000,length:32,digest:'sha256'});assert.ok(nativeBuffer.every(value=>value===0),'The completed native byte buffer is cleared');
 crypto.subtle.deriveBits=async()=>{throw new DOMException('WebCrypto unavailable.','NotSupportedError');};
 mode='cap';const fallbackStart=performance.now();assert.equal(await passwordHash(password,salt),expectedStored,'A native cap falls back to full-strength compatible JS bytes');const fallbackMs=Math.round(performance.now()-fallbackStart);
 mode='not-implemented';assert.equal(await passwordHash(password,salt),expectedStored,'A synchronous unsupported-native error uses the same-strength fallback');
 const legacy=`pbkdf2.100000.${salt}.${pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')}`;mode='native';assert.equal(await passwordMatches(password,legacy),true,'Legacy stored work factors remain readable');
 mode='unexpected';await assert.rejects(()=>passwordHash(password,salt),/Unrelated native failure/,'An unrelated failure must not silently enter a CPU-heavy fallback');
 mode='invalid-input';await assert.rejects(()=>passwordHash(password,salt),/password argument is invalid/);
 assert.ok(calls.every(call=>[100000,600000].includes(call.iterations)));assert.ok(calls.filter(call=>call.iterations===600000).length>=5,'Modern derivation never retries a lower iteration count');
 console.log(`Passed Node native/reference compatibility, zeroed native output, full-600k unsupported/cap fallback with WebCrypto unavailable, legacy 100k reads and unexpected-error propagation. Local sample: native ${nativeMs}ms, JS fallback ${fallbackMs}ms.`);
}finally{nodeCrypto.pbkdf2=native;syncBuiltinESMExports();crypto.subtle.deriveBits=deriveBits;}

const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=wranglerRequire('miniflare');
const output=await build({stdin:{contents:`
import {passwordHash} from './lib/product/auth.ts';
export default {async fetch(request){
 globalThis.__passwordNativeMode=new URL(request.url).pathname.slice(1);globalThis.__passwordNativeCalls=[];
 try{const encoded=await passwordHash(${JSON.stringify(password)},${JSON.stringify(salt)});return Response.json({ok:true,encoded,calls:globalThis.__passwordNativeCalls});}
 catch(error){return Response.json({ok:false,message:error.message,calls:globalThis.__passwordNativeCalls});}
}};`,resolveDir:process.cwd(),loader:'ts'},plugins:[{name:'native-support-probe',setup(b){
 b.onResolve({filter:/^node:crypto$/},args=>args.namespace==='password-native-probe'?{path:'node:crypto',external:true}:{path:'password-native-probe',namespace:'password-native-probe'});
 b.onLoad({filter:/.*/,namespace:'password-native-probe'},()=>({contents:`import {pbkdf2 as actual} from 'node:crypto';export function pbkdf2(...args){globalThis.__passwordNativeCalls.push({iterations:args[2],length:args[3],digest:args[4]});const mode=globalThis.__passwordNativeMode;if(mode==='cap')return queueMicrotask(()=>args.at(-1)(new DOMException('Pbkdf2 failed: iteration count cannot exceed 100000.','NotSupportedError')));if(mode==='unexpected')return queueMicrotask(()=>args.at(-1)(new Error('Unrelated native failure')));return actual(...args);}`,loader:'js'}));
 }}],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,logLevel:'silent'});
const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],script:output.outputFiles[0].text,outboundService:()=>{throw new Error('Network is forbidden in password tests');}});
try{
 const measurements=[];
 for(const mode of ['native','cap','unexpected']){
  const start=performance.now(),response=await mf.dispatchFetch(`http://password.test/${mode}`),result=await response.json();measurements.push({mode,elapsedMs:Math.round(performance.now()-start)});
  assert.deepEqual(result.calls,[{iterations:600000,length:32,digest:'sha256'}]);
  if(mode==='unexpected'){assert.equal(result.ok,false);assert.equal(result.message,'Unrelated native failure');}
  else {assert.equal(result.ok,true);assert.equal(result.encoded,expectedStored,'Actual Workerd native and cap-fallback paths retain the Node-compatible stored format');}
 }
 console.log(`Passed actual Workerd native-600k reference bytes, simulated hosted-cap fallback at full 600k and unrelated-error propagation. Local dispatch timings ${JSON.stringify(measurements)}. Hosted CPU, runtime compatibility and sustained-load qualification remain required.`);
}finally{await mf.dispose();}
