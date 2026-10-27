"use client";
import {useEffect,useState} from 'react';
import {framingKey,screenFraming,type ScreenFraming} from '@/lib/screen-profile';

export type ScreenIdentity={worldId:string;surfaceId:string;surfaceVersion:number};
type Profile={worldId:string;surfaceId:string;surface:{version:number}};

/** Publish framing, never an image request. Changes inside the same coarse class stay local. */
export function useScreenProfile(enabled:boolean,initial?:ScreenIdentity):boolean {
  const [settled,setSettled]=useState(false);
  const worldId=initial?.worldId,surfaceId=initial?.surfaceId,initialVersion=initial?.surfaceVersion;
  useEffect(()=>{
    if(!enabled)return;
    let active=true,inFlight=false,identity=worldId&&surfaceId&&Number.isSafeInteger(initialVersion)?{worldId,surfaceId,surfaceVersion:initialVersion!}:null;
    let lastKey='',timer:ReturnType<typeof setTimeout>|null=null;
    const abort=new AbortController();
    const readyFallback=setTimeout(()=>{if(active)setSettled(true);},6500);
    const current=()=>screenFraming(Math.round(document.documentElement.clientWidth||window.innerWidth),Math.round(document.documentElement.clientHeight||window.innerHeight));
    async function loadIdentity(){
      const response=await fetch('/api/product/preferences',{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(6000)])});
      if(!response.ok)throw new Error('Screen settings unavailable');
      const profile=await response.json() as Profile;
      if(identity&&(profile.worldId!==identity.worldId||profile.surfaceId!==identity.surfaceId))throw new Error('Screen owner changed');
      identity={worldId:profile.worldId,surfaceId:profile.surfaceId,surfaceVersion:profile.surface.version};
      if(!identity.worldId||!identity.surfaceId||!Number.isSafeInteger(identity.surfaceVersion))throw new Error('Invalid screen settings');
    }
    async function publish(framing:ScreenFraming){
      if(!active||inFlight||document.hidden||framingKey(framing)===lastKey)return;
      inFlight=true;
      try {
        if(!identity)await loadIdentity();
        if(!active)return;
        for(let attempt=0;attempt<2;attempt++){
          const response=await fetch('/api/product/surface',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...identity,expectedVersion:identity!.surfaceVersion,width:framing.width,height:framing.height}),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(6000)])});
          if(!active)return;
          if(response.status===409&&attempt===0){await loadIdentity();continue;}
          if(!response.ok)throw new Error('Screen framing could not sync');
          const result=await response.json() as {surfaceVersion:number};
          if(!Number.isSafeInteger(result.surfaceVersion))throw new Error('Invalid screen framing');
          identity!.surfaceVersion=result.surfaceVersion;lastKey=framingKey(framing);break;
        }
      } catch { /* A bounded failed sync keeps the saved framing; the preview remains available. */ }
      finally {
        inFlight=false;
        if(active){clearTimeout(readyFallback);setSettled(true);const latest=current();if(latest&&framingKey(latest)!==framingKey(framing))schedule();}
      }
    }
    function schedule(){
      if(timer)clearTimeout(timer);
      const framing=current();if(!framing||document.hidden||framingKey(framing)===lastKey)return;
      timer=setTimeout(()=>{timer=null;const latest=current();if(latest)void publish(latest);},450);
    }
    // Initial geometry can inform the first accepted job without waiting for a resize.
    const first=current();if(first)void publish(first);else queueMicrotask(()=>{if(active)setSettled(true);});
    window.addEventListener('resize',schedule);window.addEventListener('orientationchange',schedule);document.addEventListener('fullscreenchange',schedule);document.addEventListener('visibilitychange',schedule);
    return()=>{active=false;abort.abort();clearTimeout(readyFallback);if(timer)clearTimeout(timer);window.removeEventListener('resize',schedule);window.removeEventListener('orientationchange',schedule);document.removeEventListener('fullscreenchange',schedule);document.removeEventListener('visibilitychange',schedule);};
  },[enabled,worldId,surfaceId,initialVersion]);
  return !enabled||settled;
}
