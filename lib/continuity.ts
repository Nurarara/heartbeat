import type { Context, Frame } from './world';
import type { ArtDirection, WorldBible } from './story';

export const SAMPLE_BIBLE:WorldBible={setting:'A London window nook overlooking familiar rooftops.',composition:'Fixed wide camera. Central sash window, desk and floral ceramic lamp on the left, window seat and plants on the right.',inhabitants:['The same sleeping cream cat with brown ears and tail'],objects:['Floral lamp','Blue floral mug','Books and wooden desk','Floral pillows','Rust knitted throw','Window frame and houseplants'],style:'Hand-painted cosy anime illustration',palette:'Warm wood and amber interiors against changing exterior light',invariants:['Exact camera and window geometry','Cat identity and position','Furniture, skyline, books, plants and cushions']};
export type Beat = {time:string;temperature:number;weatherCode:number;scene:'morning'|'rain'|'night';label:string};
export const CONTINUITY_BEATS:Beat[]=[
  {time:'09:00',temperature:24,weatherCode:0,scene:'morning',label:'Warm daylight'},
  {time:'09:10',temperature:24,weatherCode:0,scene:'morning',label:'Nothing meaningful changes'},
  {time:'18:40',temperature:11,weatherCode:61,scene:'rain',label:'Rain arrives as daylight fades'},
  {time:'18:50',temperature:11,weatherCode:61,scene:'rain',label:'The rain continues'},
  {time:'23:00',temperature:8,weatherCode:3,scene:'night',label:'A colder, quieter night'},
  {time:'23:10',temperature:8,weatherCode:3,scene:'night',label:'Let the world rest'},
];
export function sampleContext(beat:Beat):{at:number;context:Context}{
  const [h,m]=beat.time.split(':').map(Number),at=Date.UTC(2026,9,8,h-1,m);
  return {at,context:{temperature:beat.temperature,observedAt:at,fetchedAt:at,weatherCode:beat.weatherCode,isDay:h>=7&&h<19,sunrise:'2026-10-08T05:45:00Z',sunset:'2026-10-08T17:45:00Z'}};
}
export function sampleFrame(beat:Beat):Frame{
  const {at,context}=sampleContext(beat);
  const states={
    morning:{title:'Let the daylight in',reason:'Warm outdoor conditions and morning daylight make the room feel airy. The lamp can stay off; the cat remains settled in its familiar place.',changes:['Let natural daylight illuminate the same room','Switch the existing lamp off'],light:'Morning sunlight; lamp off',weather:'Clear warm daylight outside',shelter:'No blanket needed over the cat',activity:'Cat rests in the same nook',url:'/art/morning.webp'},
    rain:{title:'A little shelter from the evening',reason:'Rain begins as the outdoor air cools and daylight fades. Keep the room and cat; let raindrops and the warm lamp make the interior feel sheltered.',changes:['Rain gathers on the exterior window panes','The existing lamp now warms the room'],light:'Warm lamplight against fading blue exterior light',weather:'Rain outside, dry room inside',shelter:'Cat remains safely indoors',activity:'Same sleeping cat',url:'/art/rain.webp'},
    night:{title:'The room settles around its cat',reason:'The rain has eased, but the outside air is colder and it is late. Retain the warm lamp and the aftermath of rain; tuck the existing throw around the same cat.',changes:['Exterior settles into a darker cloudy night after rain','Existing knitted throw is tucked around the cat'],light:'Existing lamp retained; dark cloudy exterior',weather:'Clouds and residual droplets after rain; no invented moon',shelter:'Existing blanket around the cat',activity:'Cat still asleep in the same place',url:'/art/cold-night.webp'},
  }[beat.scene];
  const direction:ArtDirection={action:'REIMAGINE',title:states.title,reason:states.reason,preserve:SAMPLE_BIBLE.invariants,changes:states.changes,bible:SAMPLE_BIBLE,state:{light:states.light,weather:states.weather,shelter:states.shelter,activity:states.activity},prompt:`Preserve the same window nook, cat, camera and all recurring objects. ${states.changes.join('. ')}. No text or UI.`};
  return {id:`sample-${beat.scene}`,url:states.url,title:states.title,reason:states.reason,phase:beat.scene,generatedAt:Date.UTC(2026,9,8),targetAt:at,context,preserve:direction.preserve,changes:direction.changes,source:'preview',direction};
}
