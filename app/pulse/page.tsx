'use client';
import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, Play, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { interpretPulse, type Pulse } from '@/lib/pulse';
import { DEFAULT_PROFILE, type Profile } from '@/lib/world';
import { pulseStyle, PulseReading } from '@/components/pulse-study';
import './study.css';

function localTimestamp(profile: Profile, hour: number, minute: number) {
  const format = new Intl.DateTimeFormat('en-GB',{timeZone:profile.location.timezone,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'});
  const parts = (at: number) => Object.fromEntries(format.formatToParts(at).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
  const today=parts(Date.now()); const desired=Date.UTC(today.year,today.month-1,today.day,hour,minute); let at=desired;
  for(let i=0;i<3;i++){const p=parts(at);at+=desired-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);}
  return at;
}
export default function PulseLaboratory() {
  const [profile,setProfile]=useState<Profile>(DEFAULT_PROFILE);
  const [time,setTime]=useState('09:00');const [temperature,setTemperature]=useState(23);const [weather,setWeather]=useState('0');
  const [pulse,setPulse]=useState<Pulse|null>(null);const previous=useRef<Pulse|null>(null);
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{fetch('/api/world',{cache:'no-store'}).then(r=>r.json()).then((d:any)=>{if(d.world?.profile){setProfile(d.world.profile);previous.current=null;setPulse(null);}}).catch(()=>{});},[]);
  function beat(t=time,temp=temperature,code=weather){
    const [h,m]=t.split(':').map(Number);const at=localTimestamp(profile,h,m);
    const sunrise=localTimestamp(profile,6,45),sunset=localTimestamp(profile,18,45);
    const next=interpretPulse(profile,{temperature:temp,observedAt:at,fetchedAt:at,weatherCode:Number(code),isDay:at>=sunrise&&at<sunset,sunrise:new Date(sunrise).toISOString(),sunset:new Date(sunset).toISOString()},at,previous.current);
    previous.current=next;setPulse(next);
  }
  function scenario(t:string,temp:number,code:string){setTime(t);setTemperature(temp);setWeather(code);beat(t,temp,code);}
  function reset(){previous.current=null;setPulse(null);}
  return <main className="pulse-lab">
    <header className="study-header"><a href="/"><ArrowLeft size={17}/>Back to your world</a><span><Activity size={18}/>Heartbeat study</span><strong>Simulated conditions</strong></header>
    <div className="study-layout">
      <section className="study-world" style={pulseStyle(pulse)} aria-label="Reference artwork with responsive lighting and movement">
        <div className={`artwork ${reduced?'reduce-motion':''}`}><img className="art-layer" src="/art/twilight.webp" alt="The same London window nook and cream cat, used as a reference for light and movement"/><div className="environment-tint"/><div className="ambient-light"/><div className="ambient-dust"/><div className="art-shade"/></div>
        <div className="study-world-heading"><span>One world. A different atmosphere.</span><strong>{pulse?.mood.title||'Waiting for a heartbeat'}</strong></div>
        <div className="study-overlays"><div><strong>{pulse ? new Intl.DateTimeFormat('en-GB',{timeZone:profile.location.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(pulse.at) : '—:—'}</strong><span>{profile.location.name} · simulated local time</span></div><div><strong>{pulse ? `${pulse.context?.temperature ?? '—'}°C`:'—°C'}</strong><span>Simulated outdoor temperature</span></div></div>
        <p className="study-limit">Reference artwork held. This study changes light and tempo; new scene details require live AI generation.</p>
      </section>
      <section className="study-panel">
        <p className="eyebrow">TEST THE CORE BEHAVIOUR</p><h1>Environmental heartbeat</h1><p className="study-intro">Change the conditions. Apply a beat. See what changes, what stays, and why.</p>
        <a className="pulse-test-link" href="/story">Watch this world evolve through a day</a><div className="study-scenarios"><button onClick={()=>scenario('09:00',24,'0')}>Warm morning</button><button onClick={()=>scenario('23:00',8,'3')}>Cold night</button><button onClick={()=>scenario('18:40',11,'61')}>Rain at dusk</button><button onClick={()=>{const p=previous.current;if(!p)return;const next=interpretPulse(profile,p.context,p.at,p);previous.current=next;setPulse(next);}} disabled={!pulse}>Same conditions</button></div>
        <div className="study-inputs"><label>Local time · {profile.location.name}<Input type="time" value={time} onChange={e=>setTime(e.target.value)} aria-label="Simulated local time"/></label><label>Outdoor temperature<Input type="number" min={-40} max={50} value={temperature} onChange={e=>{const n=Number(e.target.value);setTemperature(Math.max(-40,Math.min(50,n)));}} aria-label="Simulated temperature"/></label></div>
        <label className="study-weather">Weather<Select value={weather} onValueChange={setWeather}><SelectTrigger aria-label="Simulated weather"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">Clear</SelectItem><SelectItem value="3">Cloudy</SelectItem><SelectItem value="61">Rain</SelectItem><SelectItem value="95">Thunderstorm</SelectItem><SelectItem value="71">Snow</SelectItem></SelectContent></Select></label>
        <p className="study-source">Sunrise 06:45 / sunset 18:45 are simulated here. Your saved world and real weather are untouched.</p>
        <div className="study-actions"><button className="primary-button" disabled={!/^\d\d:\d\d$/.test(time)} onClick={()=>beat()}><Play size={16}/>Apply heartbeat</button><button className="reset-study" onClick={reset} aria-label="Reset study"><RotateCcw size={17}/></button></div>
        <label className="study-reduced"><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/>Reduce motion</label>
        <PulseReading pulse={pulse}/>
        <p className="study-source">Rule-based interpretation is active. An AI director and fresh image generation are not connected.</p>
      </section>
    </div>
  </main>;
}
