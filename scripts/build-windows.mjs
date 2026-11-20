// Builds the Windows app (clients/windows/Heartbeat.cs).
//   npm run windows:build         a release into public/downloads/: compiled, self-tested and signed with Heartbeat's
//                                 release key. Without the key it stops before touching public/downloads, so an
//                                 unsigned build can never replace the published one (installed apps would refuse it).
//   npm run windows:build -- --dev   a test build into outputs/windows-dev/ (unsigned; never published).
// On Windows it uses the C# compiler that ships with .NET Framework 4 (nothing to install).
// Elsewhere it uses Mono's `mcs` against the .NET Framework 4.8 reference assemblies.
import {copyFileSync,existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import path from 'node:path';

const dev=process.argv.includes('--dev');
const source='clients/windows/Heartbeat.cs',publishDir='public/downloads',work=dev?'outputs/windows-dev':'outputs/windows-release';
const text=readFileSync(source,'utf8');
const version=/const string Version = "(\d+\.\d+\.\d+)"/.exec(text)?.[1];
if(!version)throw new Error('Could not read the app version from Heartbeat.cs.');

// A release needs the private release key, and it must be the one built into the app. Checked before anything is built.
let key=null;
if(!dev){
 const keyFile=process.env.HEARTBEAT_WINDOWS_RELEASE_KEY||'.release/windows-release-key.pem';
 if(!existsSync(keyFile))throw new Error(`The release key was not found at ${keyFile}. Put the key file there (see clients/windows/README.md), or run "npm run windows:build -- --dev" for an unsigned test build. Nothing in ${publishDir} was changed.`);
 key=createPrivateKey(readFileSync(keyFile));
 const modulus=Buffer.from(createPublicKey(key).export({format:'jwk'}).n,'base64url').toString('base64');
 const embedded=/const string Modulus = "([A-Za-z0-9+/=]+)";/.exec(text)?.[1];
 if(modulus!==embedded)throw new Error(`${keyFile} is not the release key built into Heartbeat.cs, so it can't sign this update. Nothing in ${publishDir} was changed.`);
}

// Build into a work folder first; public/downloads is only touched once everything has passed.
rmSync(work,{recursive:true,force:true});mkdirSync(work,{recursive:true});
const exe=path.join(work,'Heartbeat.exe');
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
// Self-tests: the parts that need no screen or network (including the release-signature checks).
const test=spawnSync(process.platform==='win32'?path.resolve(exe):'mono',process.platform==='win32'?['--self-test']:[exe,'--self-test'],{encoding:'utf8',windowsHide:true,timeout:30000});
if(test.status!==0){process.stderr.write((test.stdout||'')+(test.stderr||test.error?.message||''));throw new Error('Windows app self-tests failed.');}

const bytes=readFileSync(exe),sha256=createHash('sha256').update(bytes).digest('hex');
// Installed apps read this once a day and update themselves when the version is newer, but only when these details
// carry a valid signature from Heartbeat's release key (kept off the server, never committed).
const manifest={version,url:'/downloads/Heartbeat.exe',sha256,size:bytes.length,builtAt:new Date().toISOString()};
if(key){
 const message=Buffer.from(['heartbeat-windows-release/1',manifest.version,manifest.url,manifest.sha256,String(manifest.size)].join('\n'));
 manifest.signature=sign('sha256',message,key).toString('base64');
 if(!verify('sha256',message,createPublicKey(key),Buffer.from(manifest.signature,'base64')))throw new Error('The new signature did not verify. Nothing was published.');
}
writeFileSync(path.join(work,'windows.json'),JSON.stringify(manifest,null,2)+'\n');

if(dev){
 console.log(`Built an unsigned test build of Heartbeat for Windows ${version} → ${exe} (${Math.round(bytes.length/1024)} KB). Self-tests passed. Not published.`);
}else{
 // Publish: the program first, then the manifest that points to it (each swapped in whole).
 mkdirSync(publishDir,{recursive:true});
 for(const name of ['Heartbeat.exe','windows.json']){const target=path.join(publishDir,name),temp=`${target}.new`;copyFileSync(path.join(work,name),temp);renameSync(temp,target);}
 rmSync(work,{recursive:true,force:true});
 console.log(`Built Heartbeat for Windows ${version} → ${path.join(publishDir,'Heartbeat.exe')} (${Math.round(bytes.length/1024)} KB). Self-tests passed. Signed with the release key.`);
 console.log('Next: npm run beta:serve (rebuilds the site so the download and update are served).');
}
