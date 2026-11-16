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
/** Names the comfort rule a picture breaks, or null. `dark` applies the night rule (also used by dark moods and
 * deep twilight); `ceiling` is a gentler mean-brightness limit for dim moods and civil twilight. */
export function lightProblem(bytes:Uint8Array,dark:boolean,ceiling?:number):'night-light'|'mood-light'|null {
 if(!dark&&!(typeof ceiling==='number'&&ceiling<1))return null;
 try{const quality=nightQuality(bytes);if(dark)return quality.acceptable?null:'night-light';return quality.samples[2].mean<=ceiling!?null:'mood-light';}
 catch{return dark?'night-light':'mood-light';}
}

/** Darkens a picture that broke a brightness limit until it passes, or returns null if it cannot.
 * A gentle tone curve keeps small highlights readable while the whole picture sinks into shadow.
 * The scene is unchanged; only its brightness is. Used instead of discarding a paid picture. */
export function dimForNight(bytes:Uint8Array,dark:boolean,ceiling?:number):Uint8Array|null {
 try{
  const decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:4,maxMemoryUsageInMB:48});
  const gamma=dark?1.5:1.2,curve=Float64Array.from({length:256},(_,value)=>(value/255)**gamma),pixels=decoded.width*decoded.height;
  let sum=0;for(let at=0;at<decoded.data.length;at+=4)sum+=.2126*curve[decoded.data[at]]+.7152*curve[decoded.data[at+1]]+.0722*curve[decoded.data[at+2]];
  const mean=sum/pixels;
  for(const target of dark?[.2,.14,.09]:[(ceiling??1)*.85,(ceiling??1)*.65]){
   const gain=Math.min(1,target/Math.max(mean,.001)),table=Uint8Array.from(curve,value=>Math.round(255*value*gain)),data=new Uint8Array(decoded.data.length);
   for(let at=0;at<data.length;at+=4){data[at]=table[decoded.data[at]];data[at+1]=table[decoded.data[at+1]];data[at+2]=table[decoded.data[at+2]];data[at+3]=255;}
   const dimmed=new Uint8Array(jpeg.encode({data,width:decoded.width,height:decoded.height},88).data);
   if(!lightProblem(dimmed,dark,ceiling))return dimmed;
  }
 }catch{/* An unreadable picture cannot be rescued. */}
 return null;
}
