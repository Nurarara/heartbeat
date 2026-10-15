/** Structural check before storage; browser decode remains the final playback check. */
export function validateArtwork(bytes:Uint8Array){
  const tag=(at:number)=>String.fromCharCode(...bytes.slice(at,at+4));
  if(bytes.length<32 || bytes.length>16000000 || tag(0)!=='RIFF' || tag(8)!=='WEBP')throw new Error('Image format was invalid.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(4,true)+8!==bytes.length)throw new Error('Image container was truncated.');
  let width=0,height=0;
  for(let at=12;at+8<=bytes.length;){
    const kind=tag(at),length=view.getUint32(at+4,true),p=at+8;
    if(p+length>bytes.length)throw new Error('Image container was truncated.');
    if(kind==='VP8X' && length>=10){if(bytes[p]&2)throw new Error('Animated artwork is not supported.');width=1+bytes[p+4]+(bytes[p+5]<<8)+(bytes[p+6]<<16);height=1+bytes[p+7]+(bytes[p+8]<<8)+(bytes[p+9]<<16);break;}
    if(kind==='VP8 ' && length>=10 && bytes[p+3]===157 && bytes[p+4]===1 && bytes[p+5]===42){width=view.getUint16(p+6,true)&16383;height=view.getUint16(p+8,true)&16383;break;}
    if(kind==='VP8L' && length>=5 && bytes[p]===47){const bits=view.getUint32(p+1,true);width=1+(bits&16383);height=1+((bits>>>14)&16383);break;}
    at=p+length+(length&1);
  }
  if(width<512 || height<512 || width>4096 || height>4096 || width/height<1.2 || width/height>2.1)throw new Error('Artwork dimensions were unsuitable for this landscape world.');
  return {width,height};
}
