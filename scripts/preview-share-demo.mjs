// Isolated, read-only demo preview. This server has no account, AI or database routes.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {DEMO_SCENES} from '../lib/demo-scenes.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Heartbeat — prepared artwork demo</title><link rel="stylesheet" href="/demo.css"></head><body><div id="root"></div><script type="module" src="/demo.js"></script></body></html>`;
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
export async function createDemoPreview(){
 const bundle=await build({entryPoints:[path.join(root,'components/shareable-demo.tsx')],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:path.join(root,'.sites-runtime/demo-share/demo.js'),write:false,minify:true,define:{'process.env.NODE_ENV':'"production"'},tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'});
 const js=bundle.outputFiles.find(file=>file.path.endsWith('.js')),css=bundle.outputFiles.find(file=>file.path.endsWith('.css'));
 if(!js||!css||DEMO_SCENES.length!==10)throw new Error('Could not prepare the isolated demo assets.');
 const files=new Map([['/',{type:'text/html; charset=utf-8',bytes:Buffer.from(html)}],['/demo.js',{type:'text/javascript; charset=utf-8',bytes:js.contents}],['/demo.css',{type:'text/css; charset=utf-8',bytes:Buffer.concat([Buffer.from('@font-face{font-family:Manrope;src:url(/fonts/manrope.ttf) format("truetype");font-display:swap}html,body{margin:0;padding:0}\n'),css.contents])}],['/fonts/manrope.ttf',{type:'font/ttf',bytes:await readFile(path.join(root,'public/fonts/manrope.ttf'))}]]);
 for(const scene of DEMO_SCENES){if(!/^\/demo\/art\/[a-z0-9-]+\.webp$/.test(scene.image)||files.has(scene.image))throw new Error('Invalid demo artwork manifest.');files.set(scene.image,{type:'image/webp',bytes:await readFile(path.join(root,'public',scene.image.slice(1)))});}
 return createServer((request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405,{...headers,Allow:'GET, HEAD'});response.end();return;}
  let pathname;try{pathname=new URL(request.url,'http://127.0.0.1').pathname;}catch{response.writeHead(400,headers);response.end();return;}
  const file=files.get(pathname);if(!file){response.writeHead(404,{...headers,'Content-Type':'text/plain; charset=utf-8'});response.end('Not found');return;}
  response.writeHead(200,{...headers,'Content-Type':file.type,'Content-Length':file.bytes.length});response.end(request.method==='HEAD'?undefined:file.bytes);
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const port=Number(process.env.HEARTBEAT_DEMO_PREVIEW_PORT||4174);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Choose a valid demo preview port.');
 const server=await createDemoPreview();server.listen(port,'127.0.0.1',()=>console.log(`Isolated Heartbeat demo: http://127.0.0.1:${port}/ (loopback only; no account or AI routes).`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
