// Check the exact Git index, without printing credential values or matching lines.
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const git=(...args)=>{const r=spawnSync('git',args,{encoding:null,maxBuffer:64*1024*1024,windowsHide:true});if(r.status!==0)throw new Error('Could not inspect the Git index.');return r.stdout;};
const files=git('ls-files','--cached','-z').toString('utf8').split('\0').filter(Boolean),secrets=[];
for(const filename of ['.dev.vars','.env','.env.local'])if(existsSync(filename))for(const line of readFileSync(filename,'utf8').split(/\r?\n/)){
 if(/^\s*#/.test(line)||!line.includes('='))continue;const i=line.indexOf('='),key=line.slice(0,i),value=line.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2');
 if(/TOKEN|SECRET|PASSWORD|ACCESS_KEY|API_KEY/i.test(key)&&value.length>=16&&!/^(REPLACE|GENERATED)/.test(value))secrets.push(Buffer.from(value));
}
const patterns=[/sk_(?:live|test)_[A-Za-z0-9]{16,}/,/rk_(?:live|test)_[A-Za-z0-9]{16,}/,/whsec_[A-Za-z0-9]{20,}/,/sk-proj-[A-Za-z0-9_-]{24,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const findings=[];
for(const file of files){
 if(/(^|\/)(?:\.dev\.vars[^/]*|\.env(?:\.[^/]*)?)$/.test(file)&&!file.endsWith('.env.example')||/\.(?:p12|pfx|pem|sqlite|sqlite3|db)$/.test(file)||/^(?:outputs|\.wrangler|\.sites-runtime)\//.test(file)){findings.push({file,reason:'Private runtime or credential file is tracked'});continue;}
 const bytes=git('show',`:${file}`);
 if(secrets.some(secret=>bytes.includes(secret))){findings.push({file,reason:'Contains a configured local secret'});continue;}
 if(bytes.includes(0))continue;
 if(patterns.some(pattern=>pattern.test(bytes.toString('utf8'))))findings.push({file,reason:'Possible credential or private key'});
}
console.log(JSON.stringify({indexedFiles:files.length,configuredSecretsChecked:secrets.length,findings},null,2));
if(findings.length)process.exitCode=1;
