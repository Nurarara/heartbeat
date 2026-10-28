/** Coarse CSS viewport classes only: no monitor inventory or physical-pixel fingerprint. */
export type ScreenFraming = {
  width:number;
  height:number;
  aspect:'portrait'|'square'|'landscape'|'ultrawide';
  resolutionClass:'compact'|'standard'|'large';
};
export function screenFraming(width:number,height:number):ScreenFraming|null {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<160||height<160||width>8192||height>8192)return null;
  const ratio=width/height,aspect=ratio<.85?'portrait':ratio<=1.2?'square':ratio<=2.05?'landscape':'ultrawide';
  const longest=Math.max(width,height),resolutionClass=longest<=1000?'compact':longest<=1920?'standard':'large';
  const dimensions={
    portrait:{compact:[450,800],standard:[720,1280],large:[1440,2560]},
    square:{compact:[640,640],standard:[1280,1280],large:[2560,2560]},
    landscape:{compact:[800,450],standard:[1600,900],large:[2560,1440]},
    ultrawide:{compact:[960,400],standard:[1920,800],large:[3440,1440]},
  }[aspect][resolutionClass];
  return {width:dimensions[0],height:dimensions[1],aspect,resolutionClass};
}
export function framingKey(value:ScreenFraming):string {return `${value.aspect}:${value.resolutionClass}`;}
