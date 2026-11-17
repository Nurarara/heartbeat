// Android app → public/downloads/Heartbeat.apk + android.json (the update notice installed apps read).
//   npm run android:build      build here (needs the Android SDK and the signing key, see clients/android/README.md)
//   npm run android:publish    publish an APK you already have at public/downloads/Heartbeat.apk (or path=<file>)
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';

const mode=process.argv[2]==='publish'?'publish':'build',args=new Map(process.argv.slice(3).map(a=>a.replace(/^-+/,'').split('=')));
const gradleFile=readFileSync('clients/android/app/build.gradle.kts','utf8');
const versionCode=Number(/versionCode = (\d+)/.exec(gradleFile)?.[1]),versionName=/versionName = "([^"]+)"/.exec(gradleFile)?.[1];
const out='public/downloads/Heartbeat.apk';mkdirSync('public/downloads',{recursive:true});
function vars(){const env={};try{for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){const m=/^\s*(HEARTBEAT_ANDROID_[A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);if(m)env[m[1]]=m[2];}}catch{}return env;}
if(mode==='build'){
 const env={...process.env,...vars()};
 if(!env.HEARTBEAT_ANDROID_KEYSTORE)throw new Error('Add HEARTBEAT_ANDROID_KEYSTORE and HEARTBEAT_ANDROID_KEYSTORE_PASSWORD to .dev.vars (see clients/android/README.md).');
 const gradlew=process.platform==='win32'?'gradlew.bat':'./gradlew';
 const r=spawnSync(gradlew,['--no-daemon','-q','assembleRelease','bundleRelease'],{cwd:'clients/android',env,stdio:'inherit',shell:process.platform==='win32'});
 if(r.status!==0)process.exit(r.status||1);
 copyFileSync('clients/android/app/build/outputs/apk/release/app-release.apk',out);
}else{
 const source=args.get('path')||out;
 if(!existsSync(source))throw new Error(`No APK at ${source}. Save Heartbeat.apk there first.`);
 if(path.resolve(source)!==path.resolve(out))copyFileSync(source,out);
}
const bytes=readFileSync(out);
if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('That file is not an Android app (APK).');
writeFileSync('public/downloads/android.json',JSON.stringify({versionCode,versionName,url:'/downloads/Heartbeat.apk',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length},null,2)+'\n');
if(mode==='build')console.log('Play Store bundle: clients/android/app/build/outputs/bundle/release/app-release.aab (see docs/play-store.md).');
console.log(`Android ${versionName} (${versionCode}) ready at ${out} (${Math.round(bytes.length/1024)} KB). Restart with npm run beta:serve to serve it.`);
