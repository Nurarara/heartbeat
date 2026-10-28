import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import nodeCrypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fixture} from './product-fixture.mjs';
import {passwordHash,passwordMatches,passwordNeedsRehash,PASSWORD_ITERATIONS,session,trustedActor} from '../lib/product/auth.ts';
import {configurationErrors,operatorStudyAllowed,authorizeWeatherRequest} from '../lib/product/configuration.ts';
import {hash} from '../lib/product/core.ts';
import {createWeatherAdapter,WeatherConfigurationError} from '../lib/server/weather.ts';
import {presentationPolicy} from '../lib/product/profiles.ts';
import {validateReleaseConfiguration,validateReleaseBuild} from '../scripts/release-config.mjs';
import {assertExactRevision,assertStagingQualification} from '../scripts/release-preflight.mjs';

const password='a long test password',salt='a'.repeat(32);
const old=`pbkdf2.100000.${salt}.${pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex')}`;
const began=performance.now(),modern=await passwordHash(password,salt),hashMilliseconds=performance.now()-began;
assert.match(modern,new RegExp(`^pbkdf2-sha256\\.v1\\.${PASSWORD_ITERATIONS}\\.`));
assert.equal(modern.split('.').at(-1),pbkdf2Sync(password,salt,PASSWORD_ITERATIONS,32,'sha256').toString('hex'),'The JS implementation matches independent native PBKDF2-SHA256 output.');
const deriveBits=crypto.subtle.deriveBits,nativeDerive=nodeCrypto.pbkdf2;
try{crypto.subtle.deriveBits=async()=>{throw new DOMException('Pbkdf2 iteration count exceeds the hosted runtime cap.','NotSupportedError');};nodeCrypto.pbkdf2=(...args)=>queueMicrotask(()=>args.at(-1)(new DOMException('Pbkdf2 iteration count exceeds the hosted runtime cap.','NotSupportedError')));syncBuiltinESMExports();assert.equal(await passwordHash(password,salt),modern,'Strong hashing retains all iterations when native and WebCrypto derivation are unsupported.');}finally{crypto.subtle.deriveBits=deriveBits;nodeCrypto.pbkdf2=nativeDerive;syncBuiltinESMExports();}
assert.equal(await passwordMatches(password,old),true);
assert.equal(await passwordMatches(password,modern),true);
assert.equal(await passwordMatches('wrong password',modern),false);
assert.equal(passwordNeedsRehash(old),true);assert.equal(passwordNeedsRehash(modern),false);
for(const stored of [old.replace('.100000.','.999999999.'),modern.replace('.v1.','.v2.'),modern.replace(salt,'../salt'),modern+'.extra'])assert.equal(await passwordMatches(password,stored),false);
await assert.rejects(()=>passwordHash(password,'invalid-salt'),/salt/);
const forwarded=new Request('https://heartbeat.example',{headers:{'CF-Connecting-IP':'8.8.8.8','X-Forwarded-For':'9.9.9.9'}});
assert.equal(trustedActor(forwarded,{}),'unverified-origin');
assert.equal(trustedActor(forwarded,{HEARTBEAT_TRUST_CLOUDFLARE_IP:'true'}),'8.8.8.8');

const f=await fixture({production:true,env:{HEARTBEAT_EMAIL_API_KEY:'mock-email-key',HEARTBEAT_EMAIL_FROM:'Heartbeat <hello@example.test>'}});
try{
 const a=await f.register('security@example.test');
 f.sqlite.prepare('UPDATE hb_users SET password_hash=? WHERE id=?').run(old,a.data.user.id);
 const login=await f.call('auth/login',{email:'security@example.test',password});assert.equal(login.status,200);
 const hash=f.sqlite.prepare('SELECT password_hash FROM hb_users WHERE id=?').get(a.data.user.id).password_hash;
 assert.equal(passwordNeedsRehash(hash),false,'Legacy passwords upgrade only after a successful login.');
 const user=f.sqlite.prepare('SELECT * FROM hb_users WHERE id=?').get(a.data.user.id);
 const pairing=await (await f.call('device/start',{})).json();
 assert.equal((await f.call('device/approve',{code:pairing.code},{cookie:a.cookie})).status,200);
 const deviceHeaders={Authorization:`Bearer ${pairing.token}`};
 assert.equal((await f.call('device/status',undefined,{headers:deviceHeaders})).status,200);
 await f.call('auth/forgot',{email:user.email});const firstReset=f.emails.at(-1).text.match(/reset=([a-f0-9]{64})/)[1];
 await f.call('auth/forgot',{email:user.email});const siblingReset=f.emails.at(-1).text.match(/reset=([a-f0-9]{64})/)[1];
 assert.notEqual(firstReset,siblingReset);
 assert.equal((await f.call('auth/reset',{token:firstReset,password:'another long password'})).status,200);
 assert.equal((await f.call('auth/reset',{token:firstReset,password:'an attacker password'})).status,400);
 assert.equal((await f.call('auth/reset',{token:siblingReset,password:'an attacker password'})).status,400);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM hb_tokens WHERE user_id=? AND kind='reset'").get(user.id).n,0);
 assert.equal((await f.call('library',undefined,{cookie:a.cookie})).status,401);
 assert.equal((await f.call('device/status',undefined,{headers:deviceHeaders})).status,401);
 await assert.rejects(()=>session(new Request(f.env.HEARTBEAT_APP_ORIGIN),f.env,user,f.now()),/account changed/,'A login that read the old epoch cannot issue a session after reset.');
 const fresh=await f.call('auth/login',{email:user.email,password:'another long password'});assert.equal(fresh.status,200);
 const cookie=fresh.headers.get('set-cookie').split(';')[0];
 assert.equal((await f.call('auth/disconnect-all',{}, {cookie})).status,200);
 assert.equal((await f.call('library',undefined,{cookie})).status,401);
 f.sqlite.prepare("UPDATE hb_users SET lifecycle='deleting' WHERE id=?").run(user.id);
 assert.equal((await f.call('auth/login',{email:user.email,password:'another long password'})).status,401);
}finally{f.close();}

const london={name:'London',country:'United Kingdom',latitude:51.5085,longitude:-0.1257,timezone:'Europe/London'};
let now=Date.parse('2026-10-23T12:00:00Z'),calls=0,fail=false,seen=[];
const payload=()=>({current:{time:Math.floor(now/1000),temperature_2m:7,weather_code:63,is_day:1},daily:{sunrise:[Math.floor(now/1000)-3600],sunset:[Math.floor(now/1000)+3600]}});
const env={HEARTBEAT_APP_MODE:'production',HEARTBEAT_WEATHER_PROVIDER:'open-meteo-commercial',HEARTBEAT_WEATHER_API_KEY:'mock-weather-unique-primary'};
const weather=createWeatherAdapter(env,{now:()=>now,sleep:async()=>{},fetcher:async(url,options)=>{calls++;seen.push({url:String(url),options});if(fail)return new Response('',{status:503});await Promise.resolve();return Response.json(payload());}});
const observations=await Promise.all(Array.from({length:20},()=>weather.collect(london)));
assert.equal(calls,1,'Concurrent matching observations share a bounded upstream request.');
assert.ok(observations.every(c=>c.temperature===7&&!c.stale));
const fetchedAt=observations[0].fetchedAt;now+=120000;
assert.equal((await weather.collect(london)).fetchedAt,fetchedAt,'Cache reads preserve actual retrieval time.');assert.equal(calls,1);
assert.equal(seen[0].options.redirect,'manual');assert.equal(new URL(seen[0].url).hostname,'customer-api.open-meteo.com');
assert.equal(new URL(seen[0].url).searchParams.get('latitude'),'51.508');
assert.equal(JSON.stringify(observations[0]).includes(env.HEARTBEAT_WEATHER_API_KEY),false);
assert.equal(observations[0].provenance.provider,'open-meteo-commercial');
now+=240000;fail=true;
const stale=await weather.collect(london);assert.equal(stale.stale,true);assert.equal(stale.provenance.freshness,'stale');assert.equal(stale.fetchedAt,fetchedAt);assert.equal(calls,3,'Only one bounded GET retry is allowed.');
await weather.collect(london);await weather.collect(london);const openedAt=calls;
await weather.collect(london);assert.equal(calls,openedAt,'Circuit opens after repeated upstream failure.');
now=fetchedAt+16*60000;await assert.rejects(()=>weather.collect(london),/temporarily unavailable/,'Expired fallback must not pretend to be current weather.');
let alternateCalls=0;
const alternate=createWeatherAdapter({...env,HEARTBEAT_WEATHER_API_KEY:'mock-weather-unique-alternate'},{now:()=>now,sleep:async()=>{},fetcher:async()=>{alternateCalls++;return Response.json(payload());}});
await alternate.collect(london);assert.equal(alternateCalls,1,'Separately credentialed adapters do not share cached observations or open circuits.');
let searchUrl;
const geocoder=createWeatherAdapter({...env,HEARTBEAT_WEATHER_API_KEY:'mock-weather-geocoder'},{sleep:async()=>{},fetcher:async url=>{searchUrl=new URL(url);return Response.json({results:[london]});}});
assert.equal((await geocoder.search(' LONDON '))[0].name,'London');assert.equal(searchUrl.hostname,'customer-geocoding-api.open-meteo.com');assert.equal(searchUrl.searchParams.get('apikey'),'mock-weather-geocoder');
for(const config of [{HEARTBEAT_APP_MODE:'production'},{...env,HEARTBEAT_WEATHER_FORECAST_URL:'http://customer-api.open-meteo.com/v1/forecast'},{...env,HEARTBEAT_WEATHER_FORECAST_URL:'https://customer-api.open-meteo.com.evil.test/v1/forecast'},{...env,HEARTBEAT_WEATHER_FORECAST_URL:'https://localhost/v1/forecast',HEARTBEAT_WEATHER_ALLOWED_HOSTS:'localhost'},{...env,HEARTBEAT_WEATHER_FORECAST_URL:'https://api.open-meteo.com/v1/forecast'}]){
 await assert.rejects(()=>createWeatherAdapter(config,{fetcher:async()=>{throw new Error('Must not contact an invalid upstream.');}}).collect(london),WeatherConfigurationError);
}
let unknownNow=Date.parse('2026-10-23T13:00:00Z');
const unknown=createWeatherAdapter({...env,HEARTBEAT_WEATHER_API_KEY:'mock-weather-unknown'},{now:()=>unknownNow,fetcher:async()=>Response.json({current:{time:unknownNow/1000,temperature_2m:null,is_day:null},daily:{sunrise:[Infinity]}})});
const missing=await unknown.collect(london);assert.equal(missing.temperature,null);assert.equal(missing.isDay,null);assert.equal(missing.sunrise,undefined);
unknownNow+=91*60000;
const oldWeather=createWeatherAdapter({...env,HEARTBEAT_WEATHER_API_KEY:'mock-weather-old'},{now:()=>unknownNow,fetcher:async()=>Response.json({current:{time:(unknownNow-91*60000)/1000,temperature_2m:8}})});
assert.equal((await oldWeather.collect(london)).stale,true);
const oversized=createWeatherAdapter({...env,HEARTBEAT_WEATHER_API_KEY:'mock-weather-large'},{sleep:async()=>{},fetcher:async()=>new Response('x'.repeat(150001))});await assert.rejects(()=>oversized.collect(london),/temporarily unavailable/);
const cancelled=new AbortController();cancelled.abort();await assert.rejects(()=>alternate.collect(london,cancelled.signal),{name:'AbortError'});
let releaseFetch,startedFetch;const started=new Promise(resolve=>startedFetch=resolve),waiting=new Promise(resolve=>releaseFetch=resolve);let sharedCalls=0;
const shared=createWeatherAdapter({...env,HEARTBEAT_WEATHER_API_KEY:'mock-weather-abort-sharing'},{now:()=>now,fetcher:async()=>{sharedCalls++;startedFetch();await waiting;return Response.json(payload());}});
const firstController=new AbortController(),first=shared.collect(london,firstController.signal),firstRejected=assert.rejects(first,{name:'AbortError'}),second=shared.collect(london);
await started;firstController.abort();releaseFetch();await firstRejected;assert.equal((await second).temperature,7);assert.equal(sharedCalls,1,'One browser cancelling must not abort another caller sharing the observation.');

const preferences={version:1,location:london,seed:42,unit:'c',reducedMotion:true};
const surface={policy_version:1,width:1920,height:1080,quiet_start:22,quiet_end:6};
assert.equal(presentationPolicy(preferences,surface,Date.parse('2026-10-25T00:30:00Z')).night,true);
assert.equal(presentationPolicy(preferences,surface,Date.parse('2026-10-25T01:30:00Z')).night,true,'Both repeated DST hours remain quiet.');
assert.equal(presentationPolicy({...preferences,location:{...london,timezone:'Pacific/Auckland',latitude:-36.8485,longitude:174.7633}},surface,Date.parse('2026-10-23T12:00:00Z')).night,true,'Selected city policy does not use the machine timezone.');

assert.deepEqual(configurationErrors({HEARTBEAT_APP_MODE:'development'}),[]);
for(const origin of ['http://localhost:5173','http://127.0.0.1:5173','http://[::1]:5173']){
 assert.deepEqual(configurationErrors({HEARTBEAT_APP_MODE:'development',HEARTBEAT_APP_ORIGIN:origin}),[]);
 await authorizeWeatherRequest(new Request(`${origin}/api/context`),{HEARTBEAT_APP_MODE:'development',HEARTBEAT_APP_ORIGIN:origin},'context');
}
for(const origin of ['https://localhost:5173','https://heartbeat.example','http://heartbeat.example','http://localhost.evil.test:5173','http://user@localhost:5173','http://localhost:5173/nested']){
 assert.ok(configurationErrors({HEARTBEAT_APP_MODE:'development',HEARTBEAT_APP_ORIGIN:origin}).includes('development_requires_http_loopback_origin'));
 await assert.rejects(()=>authorizeWeatherRequest(new Request('http://localhost:5173/api/context'),{HEARTBEAT_APP_MODE:'development',HEARTBEAT_APP_ORIGIN:origin},'context'),e=>e.status===503);
}
for(const url of ['https://localhost:5173/api/context','https://heartbeat.example/api/context','http://heartbeat.example/api/context'])await assert.rejects(()=>authorizeWeatherRequest(new Request(url),{HEARTBEAT_APP_MODE:'development'},'context'),e=>e.status===401,'The prototype bypass follows the request boundary, not just a mode flag.');

// Bundle the actual route handlers with only the Workers env import replaced.
// Authentication, persisted admission and upstream parsing remain real code.
const routesBuild=await build({stdin:{contents:"export {GET as contextRoute} from './app/api/context/route';export {GET as locationsRoute} from './app/api/locations/route';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,tsconfig:'tsconfig.json',logLevel:'silent',plugins:[{name:'mock-workers-env',setup(build){build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture-env'}));build.onLoad({filter:/.*/,namespace:'fixture-env'},()=>({contents:'export const env=globalThis.__heartbeatWeatherRouteEnv;'}));}}]});
const weatherFixture=await fixture({production:true,env:{HEARTBEAT_EMAIL_API_KEY:'mock-email-key',HEARTBEAT_EMAIL_FROM:'Heartbeat <hello@example.test>',HEARTBEAT_WEATHER_PROVIDER:'open-meteo-commercial',HEARTBEAT_WEATHER_API_KEY:'mock-weather-route-boundary'}});
globalThis.__heartbeatWeatherRouteEnv=weatherFixture.env;
const routes=await import(`data:text/javascript;base64,${Buffer.from(routesBuild.outputFiles[0].contents).toString('base64')}`),originalFetch=globalThis.fetch,originalNow=Date.now;
let routeCalls=0;
try{
 Date.now=()=>weatherFixture.now();
 globalThis.fetch=async url=>{routeCalls++;return String(url).includes('geocoding')?Response.json({results:[london]}):Response.json({current:{time:weatherFixture.now()/1000,temperature_2m:7,weather_code:63,is_day:1}});};
 const query='latitude=51.5085&longitude=-0.1257&timezone=Europe%2FLondon&name=London&country=United%20Kingdom';
 const contextUrl=`https://heartbeat.example/api/context?${query}`,searchUrl='https://heartbeat.example/api/locations?q=London';
 for(const [handler,url] of [[routes.contextRoute,contextUrl],[routes.locationsRoute,searchUrl]])assert.equal((await handler(new Request(url))).status,401);
 assert.equal((await routes.locationsRoute(new Request('https://heartbeat.example/api/locations?q=L'))).status,401,'A short search does not bypass hosted authentication.');
 assert.equal(routeCalls,0,'Anonymous hosted requests never reach the metered provider.');
 const owner=await weatherFixture.register('weather-boundary@example.test'),headers={cookie:owner.cookie};
 assert.equal((await routes.contextRoute(new Request(contextUrl,{headers}))).status,200);
 assert.equal((await routes.locationsRoute(new Request(searchUrl,{headers}))).status,200);
 assert.equal(routeCalls,2);
 for(let i=1;i<24;i++)await authorizeWeatherRequest(new Request(contextUrl,{headers}),weatherFixture.env,'context',weatherFixture.now());
 const denied=await routes.contextRoute(new Request(contextUrl,{headers}));assert.equal(denied.status,429);assert.equal(denied.headers.get('cache-control'),'private, no-store');assert.equal(routeCalls,2,'An exhausted account cannot use cache hits to bypass admission.');
 for(let i=1;i<60;i++)await authorizeWeatherRequest(new Request(searchUrl,{headers}),weatherFixture.env,'search',weatherFixture.now());
 assert.equal((await routes.locationsRoute(new Request(searchUrl,{headers}))).status,429,'Search and context have independent account limits.');
 weatherFixture.advance(60000);
 assert.equal((await routes.contextRoute(new Request(contextUrl,{headers}))).status,200,'The next admission window recovers.');
 const globalKey=await hash(`weather:global:${Math.floor(weatherFixture.now()/60000)}`);
 weatherFixture.sqlite.prepare('UPDATE hb_rate SET used=1000 WHERE key=?').run(globalKey);
 assert.equal((await routes.locationsRoute(new Request(searchUrl,{headers}))).status,429,'Global persisted admission bounds aggregate metered demand.');
 weatherFixture.sqlite.prepare("UPDATE hb_users SET lifecycle='deleting' WHERE id=?").run(owner.data.user.id);
 assert.equal((await routes.contextRoute(new Request(contextUrl,{headers}))).status,401,'An otherwise valid cookie cannot authorize an inactive account.');
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;delete globalThis.__heartbeatWeatherRouteEnv;weatherFixture.close();}
const invalid=configurationErrors({HEARTBEAT_DEPLOYMENT_ENV:'production',HEARTBEAT_APP_MODE:'development',HEARTBEAT_APP_ORIGIN:'http://localhost:5173',HEARTBEAT_LEGACY_ROUTES_ENABLED:'true'});
for(const code of ['hosted_requires_production_policy','invalid_hosted_origin','missing_hosted_bindings','commercial_weather_required','legacy_routes_forbidden_hosted'])assert.ok(invalid.includes(code));
assert.equal(operatorStudyAllowed(new Request('http://localhost:5173'),{HEARTBEAT_APP_MODE:'development',HEARTBEAT_LEGACY_ROUTES_ENABLED:'true'}),true);
assert.equal(operatorStudyAllowed(new Request('http://localhost:5173'),{HEARTBEAT_APP_MODE:'development',HEARTBEAT_APP_ORIGIN:'https://heartbeat.example',HEARTBEAT_LEGACY_ROUTES_ENABLED:'true'}),false);
assert.equal(operatorStudyAllowed(new Request('https://heartbeat.example'),{HEARTBEAT_APP_MODE:'production',HEARTBEAT_LEGACY_ROUTES_ENABLED:'true'}),false);
for(const name of ['staging','production','arbitrary'])assert.throws(()=>validateReleaseConfiguration({staging:{name:'placeholder'},production:{name:'placeholder'}},name),'Placeholder resources/budgets must prevent release.');
const staging={billingEnabled:false,name:'heartbeat-staging',origin:'https://staging.example.test',databaseName:'heartbeat-staging',databaseId:'11111111-1111-4111-8111-111111111111',bucketName:'heartbeat-staging-art',workflowName:'heartbeat-staging-artwork',dailyAttemptLimit:3,dailyBudgetMicros:1000000,directorEstimateMicros:100,imageEstimateMicros:1000,providerConcurrency:2};
const production={...staging,name:'heartbeat-production',origin:'https://app.example.test',databaseName:'heartbeat-production',databaseId:'22222222-2222-4222-8222-222222222222',bucketName:'heartbeat-production-art',workflowName:'heartbeat-production-artwork'};
assert.equal(validateReleaseConfiguration({staging,production},'staging'),staging);
const built={name:staging.name,vars:{HEARTBEAT_DEPLOYMENT_ENV:'staging',HEARTBEAT_APP_MODE:'production',HEARTBEAT_APP_ORIGIN:staging.origin,HEARTBEAT_BILLING_ENABLED:'false',HEARTBEAT_AI_DAILY_LIMIT:'3',HEARTBEAT_DAILY_BUDGET_MICROS:'1000000',HEARTBEAT_DIRECTOR_ESTIMATE_MICROS:'100',HEARTBEAT_IMAGE_ESTIMATE_MICROS:'1000',HEARTBEAT_PROVIDER_CONCURRENCY:'2'},d1_databases:[{binding:'DB',database_id:staging.databaseId,database_name:staging.databaseName}],r2_buckets:[{binding:'BUCKET',bucket_name:staging.bucketName}],workflows:[{binding:'ARTWORK_WORKFLOW',name:staging.workflowName,class_name:'HeartbeatWorkflow'}]};
assert.doesNotThrow(()=>validateReleaseBuild(built,staging,'staging'));assert.throws(()=>validateReleaseBuild(built,production,'production'));
assert.throws(()=>validateReleaseConfiguration({staging:{...staging,origin:'https://APP.example.test/'},production},'staging'));
const sha='a'.repeat(40),staged={head_sha:sha,conclusion:'success',event:'workflow_dispatch',path:'.github/workflows/release.yml',display_title:`Qualified staging release ${sha}`};
assert.doesNotThrow(()=>assertExactRevision(sha,sha));assert.throws(()=>assertExactRevision('main',sha));assert.throws(()=>assertExactRevision(sha,'b'.repeat(40)));
assert.doesNotThrow(()=>assertStagingQualification(staged,sha));
for(const patch of [{head_sha:'b'.repeat(40)},{conclusion:'failure'},{event:'pull_request'},{display_title:`Qualified production release ${sha}`}])assert.throws(()=>assertStagingQualification({...staged,...patch},sha));
const release=await readFile('.github/workflows/release.yml','utf8');assert.match(release,/environment: \$\{\{ inputs.environment \}\}/);
console.log(`Passed legacy password verification/rehash, bounded formats, reset replay and sibling/device/session revocation, credential epoch race fence, actor trust, commercial weather isolation/deduplication/TTL/circuit/size/redirect checks, actual hosted route authentication/account and global admission, loopback-only prototype policy, DST and city-night policy, and fail-closed environment/release placeholders. Local PBKDF2-600000 sample: ${Math.round(hashMilliseconds)}ms; hosted CPU qualification remains required. No provider/email/payment or native settings used.`);
