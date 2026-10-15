import assert from 'node:assert/strict';
import fs from 'node:fs';
import { directionSchema, rememberFrame } from '../lib/story.ts';
import { CONTINUITY_BEATS, SAMPLE_BIBLE, sampleContext, sampleFrame } from '../lib/continuity.ts';
import { interpretPulse } from '../lib/pulse.ts';
import { DEFAULT_PROFILE } from '../lib/world.ts';
import { validateArtwork } from '../lib/image-check.ts';
let memory=null,previous=null;const actions=[];
for(const beat of CONTINUITY_BEATS){
 const {at,context}=sampleContext(beat),pulse=interpretPulse(DEFAULT_PROFILE,context,at,previous);previous=pulse;actions.push(pulse.action);
 const frame=sampleFrame(beat);directionSchema.parse(frame.direction);memory=rememberFrame(memory,frame);
}
assert.deepEqual(actions,['REIMAGINE','HOLD','REIMAGINE','HOLD','REIMAGINE','HOLD']);
assert.equal(memory.history.length,3);assert.equal(memory.state.shelter,'Existing blanket around the cat');assert.deepEqual(memory.bible,SAMPLE_BIBLE);
const frame=sampleFrame(CONTINUITY_BEATS[4]);assert.equal(rememberFrame(memory,frame),memory);
const changed={...frame,id:'next-new-frame',direction:{...frame.direction,bible:{...SAMPLE_BIBLE,setting:'A different place'}}};
assert.equal(rememberFrame(memory,changed).bible.setting,SAMPLE_BIBLE.setting);
for(let i=0;i<12;i++)memory=rememberFrame(memory,{...frame,id:`later-${i}`});assert.equal(memory.history.length,8);
assert.equal(rememberFrame(null,{...frame,direction:undefined}),null);
assert.equal(directionSchema.safeParse({...frame.direction,changes:['a','b','c']}).success,false);
assert.equal(directionSchema.safeParse({...frame.direction,prompt:null}).success,false);
assert.equal(directionSchema.safeParse({...frame.direction,action:'HOLD',changes:[],prompt:null}).success,true);
for(const path of ['public/art/morning.webp','public/art/rain.webp','public/art/cold-night.webp']){const bytes=new Uint8Array(fs.readFileSync(path));const size=validateArtwork(bytes);assert.equal(size.width,1672);assert.equal(size.height,941);assert.throws(()=>validateArtwork(bytes.subarray(0,bytes.length-1)));}
assert.throws(()=>validateArtwork(new Uint8Array(200)));
console.log('Passed six-beat holds/evolutions, persistent identity, commit idempotence, bounded memory, structured instructions, and image container/dimension checks.');
