// Builds the Windows app (clients/windows/Heartbeat.cs) into public/downloads/, ready to download and to update itself.
// On Windows it uses the C# compiler that ships with .NET Framework 4 (nothing to install).
// Elsewhere it uses Mono's `mcs` if present (useful for checking; the result runs on Windows too).
import {existsSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import path from 'node:path';

const source='clients/windows/Heartbeat.cs',outDir='public/downloads',exe=path.join(outDir,'Heartbeat.exe');
const version=/const string Version = "(\d+\.\d+\.\d+)"/.exec(readFileSync(source,'utf8'))?.[1];
if(!version)throw new Error('Could not read the app version from Heartbeat.cs.');
mkdirSync(outDir,{recursive:true});rmSync(exe,{force:true});
const refs=['System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Net.Http.dll','System.Web.Extensions.dll','System.Security.dll','Microsoft.CSharp.dll','System.Numerics.dll'];
let result;
if(process.platform==='win32'){
 const csc=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
 if(!existsSync(csc))throw new Error('The .NET Framework 4 C# compiler was not found. It ships with Windows 10 and 11; check Windows Features → .NET Framework 4.8.');
 result=spawnSync(csc,['/nologo','/target:winexe','/platform:anycpu','/optimize+',`/out:${path.resolve(exe)}`,...refs.map(r=>`/reference:${r}`),path.resolve(source)],{encoding:'utf8',windowsHide:true});
}else{
 // Compile against the .NET Framework 4.8 reference assemblies, never Mono's own library: Mono has extra overloads
 // (for example String.TrimEnd(char)) that Windows doesn't, and an app bound to them crashes on Windows.
 const api='/usr/lib/mono/4.8-api';
 if(!existsSync(path.join(api,'mscorlib.dll')))throw new Error('Install Mono with the .NET 4.8 reference assemblies (mono-devel), or build on Windows.');
 result=spawnSync('mcs',['-langversion:5','-target:winexe','-optimize+','-nostdlib',`-r:${path.join(api,'mscorlib.dll')}`,`-out:${exe}`,...refs.map(r=>`-r:${path.join(api,r)}`),source],{encoding:'utf8'});
 if(result.error)throw new Error('Build on Windows (or install Mono for a check build).');
}
if(result.status!==0){process.stderr.write(result.stdout+result.stderr);process.exit(1);}
// Self-tests: the parts that need no screen or network.
const test=spawnSync(process.platform==='win32'?path.resolve(exe):'mono',process.platform==='win32'?['--self-test']:[exe,'--self-test'],{encoding:'utf8',windowsHide:true,timeout:30000});
if(test.status!==0){process.stderr.write((test.stdout||'')+(test.stderr||test.error?.message||''));throw new Error('Windows app self-tests failed.');}
const bytes=readFileSync(exe),sha256=createHash('sha256').update(bytes).digest('hex');
// Installed apps read this once a day and update themselves when the version is newer, but only when these details
// carry a valid signature from Heartbeat's release key (kept off the server, never committed). Without the key the
// manifest is written unsigned and installed apps simply don't update.
const manifest={version,url:'/downloads/Heartbeat.exe',sha256,size:bytes.length,builtAt:new Date().toISOString()};
const keyFile=process.env.HEARTBEAT_WINDOWS_RELEASE_KEY||'.release/windows-release-key.pem';
let signed=false;
if(existsSync(keyFile)){
 const key=createPrivateKey(readFileSync(keyFile));
 const modulus=Buffer.from(createPublicKey(key).export({format:'jwk'}).n,'base64url').toString('base64');
 const embedded=/const string Modulus = "([A-Za-z0-9+/=]+)";/.exec(readFileSync(source,'utf8'))?.[1];
 if(modulus!==embedded)throw new Error(`${keyFile} is not the release key built into Heartbeat.cs, so it can't sign this update.`);
 const message=['heartbeat-windows-release/1',manifest.version,manifest.url,manifest.sha256,String(manifest.size)].join('\n');
 manifest.signature=sign('sha256',Buffer.from(message),key).toString('base64');signed=true;
}
writeFileSync(path.join(outDir,'windows.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Built Heartbeat for Windows ${version} → ${exe} (${Math.round(bytes.length/1024)} KB). Self-tests passed.`);
console.log(signed?'Update signed with the release key.':`Not signed: ${keyFile} was not found, so installed apps won't take this update. New downloads still work.`);
console.log('Next: npm run beta:serve (rebuilds the site so the download and update are served).');
