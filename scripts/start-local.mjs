// Built-app preview only: local persistence, no deployment or cloud resources.
import './sites-env.mjs';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
if(!existsSync('dist/server/wrangler.json'))throw new Error('Run npm run build first.');
if(!existsSync('.dev.vars'))throw new Error('Run npm run ai:prepare and npm run product:prepare first.');
// Wrangler resolves relative env files during more than one startup phase.
// An absolute path consistently loads the root file beside package.json.
const child=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--env-file',path.resolve('.dev.vars'),'--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--port','5173','--inspector-port','0',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Could not start the local preview.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
