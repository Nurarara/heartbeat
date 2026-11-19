// Builds the company site for heartbeatart.co.uk as a static folder for free hosting (Cloudflare Pages):
// the living hero, journal, notes, principles, Labs and the prepared demo. Every page is pre-rendered to HTML.
// No accounts, AI, databases or outbound requests: "Make it yours" and "Try Heartbeat" link to the app site.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {DEMO_SCENES} from '../lib/demo-scenes.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const ORIGIN='https://heartbeatart.co.uk';
export const SITE_HEADERS={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
/** Runs before the page paints, so a chosen light or dark theme never flashes the other one. */
const THEME_JS="try{var t=localStorage.getItem('heartbeat-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}";
const FONTS=[['manrope.ttf','font/ttf'],['newsreader-400-normal.woff2','font/woff2'],['newsreader-500-normal.woff2','font/woff2'],['newsreader-400-italic.woff2','font/woff2'],['plex-mono-400.woff2','font/woff2']];
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fileFor=page=>page==='/'?'/index.html':`${page}/index.html`;

function document({title,description,path:page,body,demo=false}){
 const url=ORIGIN+(page==='/'?'/':page);
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`+
  `<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(url)}">`+
  `<meta property="og:type" content="${page.startsWith('/journal/')?'article':'website'}"><meta property="og:site_name" content="Heartbeat"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(url)}"><meta property="og:image" content="${ORIGIN}/demo/art/03-london-rain.webp"><meta name="twitter:card" content="summary_large_image">`+
  `<meta name="theme-color" content="#09121a"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><script src="/theme.js"></script><link rel="stylesheet" href="/site.css"></head>`+
  `<body${demo?' class="hb-demo-page"':''}><div id="root">${body}</div><script type="module" src="/site.js"></script></body></html>`;
}

/** Every file the site needs, keyed by its public path. */
export async function siteFiles(){
 const options={bundle:true,write:false,tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'}};
 const [browser,server]=await Promise.all([
  build({...options,entryPoints:[path.join(root,'components/company-site-entry.tsx')],platform:'browser',format:'esm',target:'es2022',external:['/fonts/*'],outfile:path.join(root,'.sites-runtime/site/site.js'),minify:true}),
  build({...options,entryPoints:[path.join(root,'components/company-site-render.tsx')],platform:'node',format:'esm',target:'node20',outfile:path.join(root,'.sites-runtime/site/render.mjs'),packages:'external',loader:{'.css':'empty'}}),
 ]);
 const js=browser.outputFiles.find(file=>file.path.endsWith('.js')),css=browser.outputFiles.find(file=>file.path.endsWith('.css'));
 if(!js||!css)throw new Error('Could not build the site.');
 // Pre-render each page with the same component the browser hydrates.
 const renderer=path.join(root,'.sites-runtime/site/render.mjs');await mkdir(path.dirname(renderer),{recursive:true});await writeFile(renderer,server.outputFiles[0].contents);
 const {pages,render}=await import(pathToFileURL(renderer).href+'?v='+Date.now());
 const files=new Map();
 for(const page of pages()){const demo=page.path==='/demo';files.set(fileFor(page.path),{type:'text/html; charset=utf-8',bytes:Buffer.from(document({...page,body:demo?'':render(page.path),demo}))});}
 files.set('/404.html',{type:'text/html; charset=utf-8',bytes:Buffer.from(document({title:'Not found · Heartbeat',description:'This page could not be found.',path:'/404',body:render('/404')}))});
 files.set('/site.js',{type:'text/javascript; charset=utf-8',bytes:Buffer.from(js.contents)});
 files.set('/site.css',{type:'text/css; charset=utf-8',bytes:Buffer.from(css.contents)});
 files.set('/theme.js',{type:'text/javascript; charset=utf-8',bytes:Buffer.from(THEME_JS)});
 for(const [name,type] of FONTS)files.set(`/fonts/${name}`,{type,bytes:await readFile(path.join(root,'public/fonts',name))});
 files.set('/favicon.svg',{type:'image/svg+xml',bytes:await readFile(path.join(root,'public/favicon.svg'))});
 files.set('/robots.txt',{type:'text/plain; charset=utf-8',bytes:Buffer.from(`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`)});
 files.set('/sitemap.xml',{type:'application/xml; charset=utf-8',bytes:Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages().map(page=>`  <url><loc>${ORIGIN}${page.path==='/'?'/':page.path}</loc></url>`).join('\n')}\n</urlset>\n`)});
 for(const scene of DEMO_SCENES){if(!/^\/demo\/art\/[a-z0-9-]+\.webp$/.test(scene.image)||files.has(scene.image))throw new Error('Invalid artwork manifest.');files.set(scene.image,{type:'image/webp',bytes:await readFile(path.join(root,'public',scene.image.slice(1)))});}
 return files;
}
export async function exportSite(outDir){
 const files=await siteFiles();
 await rm(outDir,{recursive:true,force:true});
 for(const [name,file] of files){const target=path.join(outDir,name.slice(1));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.bytes);}
 await writeFile(path.join(outDir,'_headers'),`/*\n${Object.entries(SITE_HEADERS).map(([key,value])=>`  ${key}: ${value}`).join('\n')}\n`);
 return files.size;
}
/** Finds the file for a request the way Cloudflare Pages does: /journal serves /journal/index.html. */
export function resolvePath(files,pathname){
 if(files.has(pathname)&&!pathname.endsWith('/'))return {status:200,file:files.get(pathname)};
 const page=(pathname.replace(/\/+$/,'')||'/');const html=fileFor(page);
 if(files.has(html))return {status:200,file:files.get(html)};
 return {status:404,file:files.get('/404.html')};
}
/** Local preview with the same headers the hosted site sends. */
export async function createSitePreview(){
 const files=await siteFiles();
 return createServer((request,response)=>{
  const headers={...SITE_HEADERS,'Cache-Control':'no-store'};
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405,{...headers,Allow:'GET, HEAD'});response.end();return;}
  let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);}catch{response.writeHead(400,headers);response.end();return;}
  const {status,file}=resolvePath(files,pathname);
  response.writeHead(status,{...headers,'Content-Type':file.type,'Content-Length':file.bytes.length});response.end(request.method==='HEAD'?undefined:file.bytes);
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv[2]==='--preview'){const port=Number(process.env.HEARTBEAT_SITE_PREVIEW_PORT||4175),server=await createSitePreview();server.listen(port,'127.0.0.1',()=>console.log(`Heartbeat site preview: http://127.0.0.1:${port}/`));}
 else{const out=path.resolve(process.argv[2]||path.join(root,'outputs/heartbeat-site'));const count=await exportSite(out);console.log(`Exported ${count} site files to ${out}. Upload this folder to Cloudflare Pages.`);}
}
