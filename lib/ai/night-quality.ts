import jpeg from 'jpeg-js';
import { acceptableNightLight, imageLight } from '../artwork-quality.ts';
/** Bounded, server-side decoding. Night art must pass wide, portrait and full-frame samples. */
export function nightQuality(bytes:Uint8Array) {
 const decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:4,maxMemoryUsageInMB:48});
 if(decoded.width<512||decoded.height<512)throw new Error('Picture is too small.');
 const samples=[16/9,9/16,decoded.width/decoded.height].map(ratio=>{
  const width=Math.min(decoded.width,decoded.height*ratio),height=Math.min(decoded.height,decoded.width/ratio),left=(decoded.width-width)/2,top=(decoded.height-height)/2;
  const pixels=new Uint8ClampedArray(32*20*4);
  for(let y=0;y<20;y++)for(let x=0;x<32;x++){
   const sx=Math.min(decoded.width-1,Math.floor(left+(x+.5)*width/32)),sy=Math.min(decoded.height-1,Math.floor(top+(y+.5)*height/20)),source=(sy*decoded.width+sx)*4,target=(y*32+x)*4;
   pixels.set(decoded.data.subarray(source,source+4),target);
  }
  return {ratio,...imageLight(pixels),acceptable:acceptableNightLight(pixels)};
 });
 return {acceptable:samples.every(s=>s.acceptable),samples};
}
