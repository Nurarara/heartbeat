import { interpretPulse } from './pulse';
import { directionSchema, DIRECTOR_SYSTEM, type ArtDirection } from './story';
import { db, runtime } from './server';
import { localParts, type Context, type Frame, type World } from './world';
import { validateArtwork } from './image-check';

function encode(bytes:Uint8Array) { let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary); }
export async function generateFrame(worldId:string,world:World,context:Context,targetAt:number,reason:string,anchorRaw:string|null,force=false):Promise<{frame:Frame|null;direction:ArtDirection}> {
  const e=runtime();if(!e.OPENAI_API_KEY || !e.BUCKET)throw new Error('Generation is not connected.');
  const id=crypto.randomUUID(),imageModel=e.HEARTBEAT_IMAGE_MODEL || 'gpt-image-2';
  await db().prepare("INSERT INTO generations (id, world_id, status, model, created_at) VALUES (?, ?, 'started', ?, ?)").bind(id,worldId,imageModel,Date.now()).run();
  const headers={Authorization:`Bearer ${e.OPENAI_API_KEY}`};
  try {
    const initial=!anchorRaw && !world.memory;
    const references:{role:string;frame:Frame;bytes:Uint8Array}[]=[];
    if(!initial){
      const candidates=[{role:'Current displayed world',frame:world.displayed},...(anchorRaw ? [{role:'Canonical identity anchor',frame:JSON.parse(anchorRaw) as Frame}]:[])];
      const seen=new Set<string>();
      for(const entry of candidates){if(entry.frame.source!=='live' || seen.has(entry.frame.id))continue;seen.add(entry.frame.id);const obj=await e.BUCKET.get(`${worldId}/${entry.frame.id}.webp`);if(!obj)throw new Error('World reference is unavailable.');const bytes=new Uint8Array(await obj.arrayBuffer());if(bytes.length>16000000)throw new Error('World reference is too large.');references.push({...entry,bytes});}
      if(!references.length)throw new Error('A persistent world needs its reference artwork.');
    }
    const content:any[]=[{type:'text',text:JSON.stringify({initial,force,profile:world.profile,previous:initial?null:world.displayed,lockedMemory:world.memory || null,canonical:anchorRaw?JSON.parse(anchorRaw):null,context,targetLocalTime:new Intl.DateTimeFormat('en-GB',{timeZone:world.profile.location.timezone,dateStyle:'full',timeStyle:'short'}).format(targetAt),reason,environmentalBrief:interpretPulse(world.profile,context,targetAt,world.pulse || null)})}];
    for(const ref of references)content.push({type:'text',text:ref.role},{type:'image_url',image_url:{url:`data:image/webp;base64,${encode(ref.bytes)}`,detail:'high'}});
    const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{...headers,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model:e.HEARTBEAT_DIRECTOR_MODEL || 'gpt-4.1-mini',max_tokens:2400,response_format:{type:'json_object'},messages:[{role:'system',content:DIRECTOR_SYSTEM},{role:'user',content}]})});
    if(!response.ok)throw new Error(`Art director returned ${response.status}`);
    const directed=await response.json() as any;
    const direction=directionSchema.parse(JSON.parse(directed.choices?.[0]?.message?.content || '{}'));
    if(world.memory)direction.bible=world.memory.bible; // The model cannot rewrite established identity.
    if((initial || force) && direction.action!=='REIMAGINE')throw new Error('The requested scene was not directed.');
    if(direction.action!=='REIMAGINE'){
      await db().prepare("UPDATE generations SET status = 'held', usage = ? WHERE id = ?").bind(JSON.stringify({director:directed.usage,decision:direction.action}),id).run();
      return {frame:null,direction};
    }
    const identity=direction.bible;
    const prompt=`${direction.prompt}\nLOCKED WORLD: ${JSON.stringify(identity)}\nPRESERVE: ${direction.preserve.join('; ')}.\nOnly these changes: ${direction.changes.join('; ')}. No rendered text or UI.`;
    const size=imageModel==='gpt-image-1.5' || imageModel==='gpt-image-1' ? '1536x1024':'1536x864';
    let imageResponse:Response;
    if(!initial){
      const form=new FormData();form.set('model',imageModel);form.set('prompt',prompt);form.set('size',size);form.set('quality','medium');form.set('output_format','webp');
      if(imageModel==='gpt-image-1.5' || imageModel==='gpt-image-1')form.set('input_fidelity','high');
      for(const ref of references)form.append('image[]',new Blob([ref.bytes as BlobPart],{type:'image/webp'}),`${ref.frame.id}.webp`);
      imageResponse=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers,body:form,signal:AbortSignal.timeout(180000)});
    }else imageResponse=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{...headers,'Content-Type':'application/json'},signal:AbortSignal.timeout(180000),body:JSON.stringify({model:imageModel,prompt,size,quality:'medium',output_format:'webp',n:1})});
    if(!imageResponse.ok)throw new Error(`Image generation returned ${imageResponse.status}`);
    const image=await imageResponse.json() as any,b64=image.data?.[0]?.b64_json;
    if(typeof b64!=='string' || b64.length>22000000 || b64.length<1000)throw new Error('Image output was invalid.');
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));validateArtwork(bytes);
    await e.BUCKET.put(`${worldId}/${id}.webp`,bytes,{httpMetadata:{contentType:'image/webp'}});
    await db().prepare("UPDATE generations SET status = 'ready', usage = ? WHERE id = ?").bind(JSON.stringify({director:directed.usage,image:image.usage,decision:direction.action}),id).run();
    return {direction,frame:{id,url:`/api/art/${id}`,title:direction.title,reason:direction.reason,preserve:direction.preserve,changes:direction.changes,direction,generatedAt:Date.now(),targetAt,context,phase:localParts(world.profile.location,targetAt).phase,source:'live'}};
  }catch(error){await db().prepare("UPDATE generations SET status = 'failed' WHERE id = ?").bind(id).run().catch(()=>{});throw error;}
}
