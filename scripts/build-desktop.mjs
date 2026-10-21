import {existsSync,mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
if(process.platform!=='win32')throw new Error('Build the Windows companion on Windows. No native settings were changed.');
const compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
if(!existsSync(compiler))throw new Error('The .NET Framework compiler is not installed. No software was installed automatically.');
mkdirSync('outputs/desktop',{recursive:true});
const result=spawnSync(compiler,['/nologo','/target:winexe','/platform:anycpu','/optimize+',`/out:${path.resolve('outputs/desktop/Heartbeat.exe')}`,'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Net.Http.dll','/reference:System.Web.Extensions.dll','/reference:System.Security.dll',path.resolve('desktop/Heartbeat.cs')],{encoding:'utf8',windowsHide:true});
if(result.status!==0){process.stderr.write(result.stdout||result.stderr);process.exit(1);}
copyFileSync('outputs/desktop/Heartbeat.exe','outputs/desktop/Heartbeat.scr');
const tests=spawnSync(path.resolve('outputs/desktop/Heartbeat.exe'),['--self-test'],{encoding:'utf8',windowsHide:true,timeout:20000});
if(tests.status!==0)throw new Error(`Desktop self-tests failed: ${tests.stderr||tests.stdout||tests.error?.message}`);
writeFileSync('outputs/desktop/build-report.json',JSON.stringify({compiled:true,selfTests:true,unsigned:true,changesToWallpaper:false,changesToStartup:false,nativeInteractiveTesting:false,tests:['Allowed server origins','Screensaver invocation arguments','Night brightness guard','Current-user DPAPI token encryption'],remaining:['Pairing against deployed server','Actual wallpaper apply/restore','Multi-monitor and DPI','Screensaver preview/input/lock/sleep','Signing and installer']},null,2));
console.log('Built outputs/desktop/Heartbeat.exe and Heartbeat.scr. Self-tests passed. No wallpaper, startup, installation or screensaver settings changed. Interactive Windows testing remains.');
