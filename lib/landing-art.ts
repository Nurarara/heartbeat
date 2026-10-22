export const LANDING_ART = [
  {id:'pulse',image:'/showcase/pulse-organism.png',scene:0,position:'62% center'},
  {id:'rain',image:'/showcase/rain-world.png',scene:0,position:'58% center'},
  {id:'sun',image:'/showcase/sun-world.png',scene:1,position:'center'},
  {id:'night',image:'/showcase/night-world.png',scene:2,position:'center'},
] as const;
export type LandingArt = typeof LANDING_ART[number];
export const LANDING_ART_KEY='heartbeat.landing.last.v1';
export function nextLandingArt(previous:string|null,random:number):LandingArt {
  const choices=LANDING_ART.filter(art=>art.id!==previous);
  return choices[(random>>>0)%choices.length];
}
