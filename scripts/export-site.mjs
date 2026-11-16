// Builds the public early-access site (landing, prepared demo and the city/mood preview) as a
// static folder for free hosting such as Cloudflare Pages. No account, AI or database routes.
// The only outbound requests are the visitor's city search and current temperature (Open-Meteo).
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {DEMO_SCENES} from '../lib/demo-scenes.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Heartbeat — a screen with a pulse</title><meta name="description" content="AI art for your screen that follows the time, weather and mood where you are."><meta name="theme-color" content="#09121a"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/site.css"></head><body><div id="root"></div><script type="module" src="/site.js"></script></body></html>`;
export const SITE_HEADERS={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src https://geocoding-api.open-meteo.com https://api.open-meteo.com; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
/** Every file the site needs, keyed by its public path. */
export async function siteFiles(){
 const bundle=await build({entryPoints:[path.join(root,'components/early-site-entry.tsx')],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:path.join(root,'.sites-runtime/site/site.js'),write:false,minify:true,define:{'process.env.NODE_ENV':'"production"'},tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'});
 const js=bundle.outputFiles.find(file=>file.path.endsWith('.js')),css=bundle.outputFiles.find(file=>file.path.endsWith('.css'));
 if(!js||!css)throw new Error('Could not build the site.');
 const files=new Map([['/',{type:'text/html; charset=utf-8',bytes:Buffer.from(html)}],['/site.js',{type:'text/javascript; charset=utf-8',bytes:js.contents}],['/site.css',{type:'text/css; charset=utf-8',bytes:Buffer.concat([Buffer.from('@font-face{font-family:Manrope;src:url(/fonts/manrope.ttf) format("truetype");font-display:swap}html,body{margin:0;padding:0;background:#09121a}\n'),css.contents])}],['/fonts/manrope.ttf',{type:'font/ttf',bytes:await readFile(path.join(root,'public/fonts/manrope.ttf'))}],['/favicon.svg',{type:'image/svg+xml',bytes:await readFile(path.join(root,'public/favicon.svg'))}]]);
 for(const scene of DEMO_SCENES){if(!/^\/demo\/art\/[a-z0-9-]+\.webp$/.test(scene.image)||files.has(scene.image))throw new Error('Invalid artwork manifest.');files.set(scene.image,{type:'image/webp',bytes:await readFile(path.join(root,'public',scene.image.slice(1)))});}
 return files;
}
export async function exportSite(outDir){
 const files=await siteFiles();
 await rm(outDir,{recursive:true,force:true});
 for(const [name,file] of files){const target=path.join(outDir,name==='/'?'index.html':name.slice(1));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.bytes);}
 await writeFile(path.join(outDir,'_headers'),`/*\n${Object.entries(SITE_HEADERS).map(([key,value])=>`  ${key}: ${value}`).join('\n')}\n`);
 return files.size;
}
/** Local preview with the same headers the hosted site sends. */
export async function createSitePreview(){
 const files=await siteFiles();
 return createServer((request,response)=>{
  const headers={...SITE_HEADERS,'Cache-Control':'no-store'};
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405,{...headers,Allow:'GET, HEAD'});response.end();return;}
  let pathname;try{pathname=new URL(request.url,'http://127.0.0.1').pathname;}catch{response.writeHead(400,headers);response.end();return;}
  const file=files.get(pathname);if(!file){response.writeHead(404,{...headers,'Content-Type':'text/plain; charset=utf-8'});response.end('Not found');return;}
  response.writeHead(200,{...headers,'Content-Type':file.type,'Content-Length':file.bytes.length});response.end(request.method==='HEAD'?undefined:file.bytes);
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv[2]==='--preview'){const port=Number(process.env.HEARTBEAT_SITE_PREVIEW_PORT||4175),server=await createSitePreview();server.listen(port,'127.0.0.1',()=>console.log(`Heartbeat site preview: http://127.0.0.1:${port}/`));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));}
 else{const out=path.resolve(process.argv[2]||path.join(root,'outputs/heartbeat-site'));const count=await exportSite(out);console.log(`Exported ${count} site files to ${out}. Upload this folder to Cloudflare Pages.`);}
}
