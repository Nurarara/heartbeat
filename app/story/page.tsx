'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Activity, ArrowLeft, Play, Pause, RotateCcw, Info, X } from 'lucide-react';
import { CONTINUITY_BEATS, SAMPLE_BIBLE, sampleContext, sampleFrame, type Beat } from '@/lib/continuity';
import { interpretPulse, type Pulse } from '@/lib/pulse';
import { rememberFrame, type WorldMemory } from '@/lib/story';
import { DEFAULT_PROFILE, type Frame } from '@/lib/world';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import './story.css';

export default function ContinuityStudy(){
  const [current,setCurrent]=useState(()=>sampleFrame(CONTINUITY_BEATS[0]));
  const currentRef=useRef(current),[next,setNext]=useState<Frame|null>(null),[fading,setFading]=useState(false);
  const [beat,setBeat]=useState(CONTINUITY_BEATS[0]),[pulse,setPulse]=useState<Pulse|null>(null),pulseRef=useRef<Pulse|null>(null);
  const [memory,setMemory]=useState<WorldMemory|null>(null),memoryRef=useRef<WorldMemory|null>(null);
  const [running,setRunning]=useState(false),[busy,setBusy]=useState(false),[inspecting,setInspecting]=useState(false),[error,setError]=useState('');
  const [progress,setProgress]=useState(-1),[prepared,setPrepared]=useState(false);
  const images=useRef(new Map<string,Promise<void>>()),revision=useRef(0),fadeTimer=useRef<ReturnType<typeof setTimeout>|null>(null),playTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const busyRef=useRef(false),mounted=useRef(true),runningRef=useRef(false);
  const load=useCallback((url:string)=>{let task=images.current.get(url);if(!task){const image=new Image();image.src=url;task=image.decode().then(()=>{}).catch(e=>{images.current.delete(url);throw e;});images.current.set(url,task);}return task;},[]);
  const apply=useCallback(async (b:Beat,reset=false)=>{
    if(busyRef.current)return false;
    busyRef.current=true;setBusy(true);setError('');const rev=revision.current;
    try{
      const f=sampleFrame(b);await load(f.url);if(!mounted.current || rev!==revision.current)return false;
      const {at,context}=sampleContext(b),restarting=reset || at<(pulseRef.current?.at || 0),previous=restarting?null:pulseRef.current;
      const p=interpretPulse(DEFAULT_PROFILE,context,at,previous);
      const commit=()=>{
        if(!mounted.current || rev!==revision.current)return;
        const m=rememberFrame(restarting?null:memoryRef.current,f);memoryRef.current=m;setMemory(m);currentRef.current=f;setCurrent(f);setNext(null);setFading(false);
        pulseRef.current=p;setPulse(p);setBeat(b);busyRef.current=false;setBusy(false);
      };
      if(f.id===currentRef.current.id){commit();return true;}
      setNext(f);setFading(true);
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      await new Promise<void>(resolve=>{fadeTimer.current=setTimeout(()=>{commit();resolve();},reduced?50:2800);});
      return true;
    }catch{if(mounted.current){setError('This scene could not be prepared. The current world stays visible.');busyRef.current=false;setBusy(false);}return false;}
  },[load]);
  useEffect(()=>{
    mounted.current=true;void apply(CONTINUITY_BEATS[0],true);
    // Decode the next two reference-edited scenes while the first stays visible.
    void Promise.all([load('/art/rain.webp'),load('/art/cold-night.webp')]).then(()=>{if(mounted.current)setPrepared(true);}).catch(()=>{});
    return ()=>{mounted.current=false;revision.current++;busyRef.current=false;runningRef.current=false;if(fadeTimer.current)clearTimeout(fadeTimer.current);if(playTimer.current)clearTimeout(playTimer.current);};
  },[apply,load]);
  function stop(){runningRef.current=false;setRunning(false);if(playTimer.current)clearTimeout(playTimer.current);}
  async function play(){
    if(busyRef.current)return;stop();runningRef.current=true;setRunning(true);setProgress(0);
    if(!await apply(CONTINUITY_BEATS[0],true)){stop();return;}
    let i=0;
    const advance=()=>{playTimer.current=setTimeout(async()=>{
      if(!mounted.current || !runningRef.current)return;
      if(document.hidden){advance();return;}
      i++;if(i>=CONTINUITY_BEATS.length){stop();return;}
      setProgress(i);if(!await apply(CONTINUITY_BEATS[i])){stop();return;}
      if(i===CONTINUITY_BEATS.length-1){stop();return;}advance();
    },10000);};advance();
  }
  const style={'--scene-light':1,'--scene-saturation':1,'--scene-cool':0,'--lamp-warmth':beat.scene==='morning'?0:.38,'--world-drift':`${pulse?.effects.driftSeconds || 60}s`,'--world-breath':`${pulse?.effects.breathSeconds || 13}s`} as CSSProperties;
  return <main className="story-display" style={style}>
    <div className="artwork"><img className="art-layer" data-frame-id={current.id} src={current.url} alt="The same London window nook, ceramic lamp, cream cat, floral cushions and knitted throw" fetchPriority="high"/>{next&&<img className={`art-layer next-layer ${fading?'visible':''}`} src={next.url} alt=""/>}<div className="ambient-light"/><div className="ambient-dust"/><div className="art-shade"/></div>
    <header className="story-header"><a href="/"><ArrowLeft size={17}/>Your display</a><span><Activity size={18}/>One world, through a day</span><button onClick={()=>setInspecting(true)} aria-label="Why this changed"><Info size={18}/></button></header>
    <div className="story-context"><div><strong>{beat.time}</strong><span>Thursday 8 October · simulated London</span></div><div><strong>{beat.temperature}°C</strong><span>Simulated outdoors</span></div></div>
    <section className="story-bottom">
      <div className="story-title"><p>{current.title}</p><span>{fading?'The same world is changing…':busy?'Preparing in the background…':pulse?.action==='HOLD'?'Stable conditions. This moment stays.':beat.scene==='morning'?'Daylight takes over. The lamp stays off.':beat.scene==='rain'?'Rain outside. A warmer room inside.':'The lamp stays on. The cat keeps its blanket.'}</span></div>
      <nav className="story-controls" aria-label="Continuity study controls"><button className="story-play" disabled={busy} onClick={running?stop:play}>{running?<Pause size={16}/>:<Play size={16}/>} {running?'Pause the day':'Play a day in 60 seconds'}</button><div className="story-chapters">{[{index:0,name:'Morning'},{index:2,name:'Rain'},{index:4,name:'Night'}].map(s=><button key={s.index} disabled={busy} aria-pressed={beat.scene===CONTINUITY_BEATS[s.index].scene} onClick={()=>{stop();setProgress(s.index);void apply(CONTINUITY_BEATS[s.index]);}}>{s.name}</button>)}</div><button className="story-reset" disabled={busy} aria-label="Restart study" onClick={()=>{stop();setProgress(-1);void apply(CONTINUITY_BEATS[0],true);}}><RotateCcw size={16}/></button></nav>
      <p className="story-source">Pre-generated AI scenes · simulated conditions · {prepared?'next scenes prepared':'preparing next scenes'}{progress>=0?` · beat ${progress+1} of 6`:''}</p>
    </section>
    {error&&<div className="notice" role="status">{error}</div>}
    <Dialog open={inspecting} onOpenChange={setInspecting}><DialogContent className="story-inspector" showCloseButton={false}><DialogClose asChild><button className="story-close" aria-label="Close explanation"><X size={20}/></button></DialogClose><p className="eyebrow">CONTINUITY PROOF</p><DialogTitle>The environment changes.<br/>The world remembers.</DialogTitle><DialogDescription>{pulse?.action==='HOLD'?pulse.reason:current.reason}</DialogDescription><div className="story-decision"><strong>{pulse?.action || 'REIMAGINE'}</strong><span>{pulse?.action==='HOLD'?'No image replacement':current.direction?.changes.join(' · ')}</span></div><h2>Always preserved</h2><ul>{SAMPLE_BIBLE.invariants.map(x=><li key={x}>{x}</li>)}</ul><h2>What actually happened</h2><ol>{memory?.history.map(h=><li key={h.frameId}><strong>{h.title}</strong><span>{h.changes.join(' · ')}</span></li>)}</ol><p className="story-boundary">These three scenes were generated ahead of time from one reference. Playback and hold decisions run here; this page does not generate fresh images or read live weather. The main display uses your real local context. Autonomous new artwork still needs a connected generation service.</p><a href="/pulse">Test other environmental conditions</a></DialogContent></Dialog>
  </main>;
}
