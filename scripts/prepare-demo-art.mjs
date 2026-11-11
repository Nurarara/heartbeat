// Optional asset preparation using the sharp codec already installed with Wrangler.
// Originals remain unchanged; the committed WebP files need no runtime codec.
import {createRequire} from 'node:module';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const packageDirectory=readdirSync('node_modules/.pnpm').find(name=>name.startsWith('sharp@'));
if(!packageDirectory)throw new Error('The existing local sharp codec is unavailable. The committed demo assets still work.');
const require=createRequire(import.meta.url),sharp=require(path.resolve('node_modules/.pnpm',packageDirectory,'node_modules/sharp'));
const inputs=readdirSync('public/demo/art').filter(file=>file.endsWith('.png')).sort();
if(inputs.length!==10)throw new Error('Expected the ten original prepared artworks.');
const results=[];
for(const file of inputs){const source=path.join('public/demo/art',file),output=source.replace(/\.png$/,'.webp');const info=await sharp(source).webp({quality:86,effort:5}).toFile(output);results.push({source,output,width:info.width,height:info.height,originalBytes:readFileSync(source).length,deliveryBytes:info.size});}
writeFileSync('docs/demo-art-delivery.json',JSON.stringify({method:'WebP quality86, unchanged dimensions; originals retained',images:results},null,2)+'\n');
console.log(JSON.stringify({images:results.length,originalBytes:results.reduce((n,r)=>n+r.originalBytes,0),deliveryBytes:results.reduce((n,r)=>n+r.deliveryBytes,0)}));
