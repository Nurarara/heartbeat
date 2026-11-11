"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, MapPin } from 'lucide-react';
import { Brand, productAPI } from './product-shell';
import { CustomerDisplay } from './customer-app';
import { authDestination, onboardingDestination, readJourney, type JourneyPlan } from '@/lib/customer-journey';
import { localClock, type AmbientPreferences } from '@/lib/ambient';
import type { Place } from '@/lib/world';

type Account = {user:{id:string;email:string;verified:boolean};local:boolean;billingReady:boolean;access:{plan:string;eligible:boolean;reason:string;allowance:number;used:number}};
type Profile = {preferences:AmbientPreferences|null;version:number;worldId?:string;surfaceId?:string;surface?:{owner_id:string}};
type Step = 'city'|'style'|'ready';
type Style = NonNullable<AmbientPreferences['style']>;
const styles: {id:Style;title:string;description:string}[] = [
  {id:'surprise',title:'Surprise me',description:'Let the moment choose. Keep exploring.'},
  {id:'anime',title:'Anime illustration',description:'Drawn worlds, expressive light.'},
  {id:'watercolour',title:'Watercolour',description:'Soft edges, colour that breathes.'},
  {id:'cinematic',title:'Cinematic',description:'Light, atmosphere and a wider story.'},
  {id:'pencil',title:'Pencil drawing',description:'Quiet textures and considered detail.'},
  {id:'photographic',title:'Photographic',description:'A sense of being somewhere.'},
];

export default function Onboarding() {
  const shell = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const [account,setAccount] = useState<Account|null>(null), [preferences,setPreferences] = useState<AmbientPreferences|null>(null);
  const [version,setVersion] = useState(0), [step,setStep] = useState<Step>('city'), [plan,setPlan] = useState<JourneyPlan>('trial');
  const [city,setCity] = useState<Place|null>(null), [style,setStyle] = useState<Style>('surprise');
  const [query,setQuery] = useState(''), [results,setResults] = useState<Place[]>([]), [searching,setSearching] = useState(false), [searchError,setSearchError] = useState(''), [searchRevision,setSearchRevision] = useState(0);
  const [busy,setBusy] = useState(false), [loaded,setLoaded] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const [fullscreen,setFullscreen] = useState(false), [entered,setEntered] = useState(false), [paymentPending,setPaymentPending] = useState(false), [paymentTimedOut,setPaymentTimedOut] = useState(false), [paymentRevision,setPaymentRevision] = useState(0);
  const [previewAt]=useState(()=>Date.now());
  const mounted = useRef(true);
  const profileIdentity=useRef<{worldId?:string;surfaceId?:string}>({});
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const refreshAccount = useCallback(async()=>{
    const value = await productAPI<Account>('auth/session');
    if(!value.user)throw new Error('Your session ended. Sign in again to continue.');
    if(mounted.current)setAccount(value);
    return value;
  },[]);

  useEffect(()=>{
    let active=true;
    const intent=readJourney(location.search);
    const pending=new URLSearchParams(location.search).get('billing')==='success';
    queueMicrotask(()=>{if(active){setPlan(intent.plan);setPaymentPending(pending);}});
    async function load(){
      try {
        const value=await productAPI<Account>('auth/session');
        if(!active)return;
        if(!value.user){location.replace(authDestination('login',onboardingDestination(intent.plan),intent.plan));return;}
        const profile=await productAPI<Profile>('preferences');
        if(!active)return;
        if(profile.surface?.owner_id&&profile.surface.owner_id!==value.user.id)throw new Error('Your account changed while loading. Reload to reconnect.');
        profileIdentity.current={worldId:profile.worldId,surfaceId:profile.surfaceId};
        setAccount(value);setVersion(profile.version);setPreferences(profile.preferences);
        if(profile.preferences){setCity(profile.preferences.location);setQuery(profile.preferences.location.name);setStyle(profile.preferences.style||'surprise');setStep('ready');}
        setLoaded(true);
      } catch(reason) {if(active){setError((reason as Error).message);setLoaded(true);}}
    }
    void load();return()=>{active=false;};
  },[]);

  useLayoutEffect(()=>{
    if(!loaded||entered)return;
    heading.current?.focus({preventScroll:true});
    window.scrollTo({top:0,left:0,behavior:'auto'});
  },[step,loaded,entered]);
  useEffect(()=>{
    if(step!=='city'||query.trim().length<2||city&&query===city.name)return;
    const abort=new AbortController();let active=true;
    const timer=setTimeout(async()=>{
      setSearching(true);setSearchError('');
      try {
        const response=await fetch(`/api/locations?q=${encodeURIComponent(query.trim())}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)]),cache:'no-store'});
        if(!response.ok)throw new Error('City search is unavailable. Try again in a moment.');
        const value=await response.json() as {locations:Place[]};
        if(active){setResults(value.locations||[]);if(!value.locations?.length)setSearchError('No matching city. Try a nearby city or add the country.');}
      } catch(reason) {if(active&&!abort.signal.aborted){setResults([]);setSearchError((reason as Error).message);}}
      finally {if(active)setSearching(false);}
    },250);
    return()=>{active=false;clearTimeout(timer);abort.abort();};
  },[query,step,city,searchRevision]);

  const paymentAccountId=account?.user.id;
  useEffect(()=>{
    if(!paymentPending||!paymentAccountId)return;
    let active=true,inFlight=false;const started=Date.now();queueMicrotask(()=>{if(active)setPaymentTimedOut(false);});
    async function check(){
      if(inFlight)return;inFlight=true;
      try {
        const current=await productAPI<Account>('auth/session');
        if(!active)return;
        if(!current.user)throw new Error('Your session ended. Sign in again to check your payment.');
        setAccount(current);
        if(current.access.plan!=='trial'){
          setPaymentPending(false);setPlan(current.access.plan==='atelier'?'atelier':'studio');setNotice('Your membership is ready. Make yourself at home.');
          history.replaceState(null,'',onboardingDestination(current.access.plan==='atelier'?'atelier':'studio'));
          return;
        }
        if(Date.now()-started>=60000){setPaymentTimedOut(true);clearInterval(timer);}
      } catch(reason){if(active)setError((reason as Error).message);}
      finally{inFlight=false;}
    }
    void productAPI('billing/recover',{}).catch(()=>{}).finally(()=>{if(active)void check();});
    const timer=setInterval(()=>void check(),5000);
    return()=>{active=false;clearInterval(timer);};
    // A settled session response should not restart the bounded polling window.
  },[paymentPending,paymentAccountId,paymentRevision]);

  async function savePreferences(){
    if(!city||busy)return;
    setBusy(true);setError('');setNotice('');
    const next:AmbientPreferences={version:1,location:city,style,unit:preferences?.unit||'c',seed:preferences?.seed||crypto.getRandomValues(new Uint32Array(1))[0]||1,reducedMotion:preferences?.reducedMotion??window.matchMedia('(prefers-reduced-motion: reduce)').matches,...(preferences?.festiveTouches!==undefined?{festiveTouches:preferences.festiveTouches}:{})};
    try {
      const response=await fetch('/api/product/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preferences:next,expectedVersion:version,...profileIdentity.current}),signal:AbortSignal.timeout(20000)});
      const value=await response.json() as Profile&{error?:string};
      if(!response.ok){
        if(response.status===409){
          const current=await productAPI<Profile>('preferences');
          if(current.surface?.owner_id&&current.surface.owner_id!==account?.user.id)throw new Error('Your account changed while saving. Reload to reconnect.');
          profileIdentity.current={worldId:current.worldId,surfaceId:current.surfaceId};
          if(mounted.current){setPreferences(current.preferences);setVersion(current.version);setCity(current.preferences?.location||city);setQuery(current.preferences?.location.name||city.name);setStyle(current.preferences?.style||'surprise');setNotice('Settings changed on another screen. We loaded the latest version; review it before continuing.');}
        } else throw new Error(value.error||'Your atmosphere could not be saved. Please try again.');
        return;
      }
      if(mounted.current){setPreferences(value.preferences);setVersion(value.version);setStep('ready');}
    } catch(reason){if(mounted.current)setError((reason as Error).message);}
    finally{if(mounted.current)setBusy(false);}
  }

  async function verifyEmail(){
    setBusy(true);setError('');
    try{const result=await productAPI<{message:string}>('auth/resend',{continuation:onboardingDestination(plan)});setNotice(result.message);}
    catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
  }
  async function checkVerification(){
    setBusy(true);setError('');
    try{const value=await refreshAccount();setNotice(value.user.verified?'Your email is verified. You can enter your world.':value.local?'Your email is not verified yet. The local demo can still continue.':'Your email has not been verified yet. Open the link in your inbox, then check again.');}
    catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
  }
  async function checkout(){
    setBusy(true);setError('');
    try{const result=await productAPI<{url:string}>('checkout',{plan});location.assign(result.url);}
    catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
  }
  function trial(){setPlan('trial');setNotice('You are continuing with your existing trial allowance.');setError('');history.replaceState(null,'',onboardingDestination('trial'));}
  function enter(){
    if(!preferences||!account||!account.user.verified&&!account.local||paymentPending)return;
    if(plan!=='trial'&&account.access.plan!==plan)return;
    setNotice('');
    if(fullscreen&&shell.current?.requestFullscreen){
      try {void shell.current.requestFullscreen().catch(()=>setNotice('Fullscreen is unavailable here. Your world still fills the browser window.'));}catch{setNotice('Fullscreen is unavailable here. Your world still fills the browser window.');}
    }else if(fullscreen)setNotice('Fullscreen is unavailable here. Your world still fills the browser window.');
    setEntered(true);history.replaceState(null,'','/display');
  }
  useEffect(()=>{
    if(!entered||!notice)return;
    const timer=setTimeout(()=>setNotice(''),7000);
    return()=>clearTimeout(timer);
  },[entered,notice]);

  const number=step==='city'?1:step==='style'?2:3;
  const verified=!!account&&(account.user.verified||account.local);
  const needsPayment=plan!=='trial'&&account?.access.plan!==plan;
  const phase=city?localClock(city,previewAt).hour:null;
  const illustration=phase!==null&&(phase<6||phase>=21)?'/showcase/night-world.png':'/showcase/rain-world.png';
  const searchStatus=searching?'Finding your city…':searchError||(city?`${city.name}, ${city.country} selected.`:'Search for your city, then choose a matching place.');
  return <div ref={shell} className={`hp-world-shell${entered?' is-entered':''}`}>
    {entered?<><CustomerDisplay/>{notice&&<p className="hp-world-notice" role="status">{notice}</p>}</>:<main className="hp-site hp-onboarding">
      <aside className="hp-onboarding-art" aria-label="Illustrative artwork preview"><img src={illustration} alt="An illustrative quiet world"/><div><p>Time to make a little room.</p><span>Illustrative preview · Your original is prepared after you enter.</span></div></aside>
      <section className="hp-onboarding-panel">
        <header className="hp-onboarding-header"><Brand/><a href="/app">Your studio <ArrowRight size={15}/></a></header>
        {!loaded?<div className="hp-onboarding-content"><h1 ref={heading} tabIndex={-1}>Finding your space…</h1></div>:!account?<div className="hp-onboarding-content"><h1 ref={heading} tabIndex={-1}>Let’s reconnect.</h1><p className="hp-onboarding-error" role="alert">{error||'Sign in to create your world.'}</p><a className="hp-button" href={authDestination('login',onboardingDestination(plan),plan)}>Sign in <ArrowRight size={16}/></a></div>:<>
          <nav className="hp-onboarding-progress" aria-label="Your setup"><ol>{['Your place','Your art','Your world'].map((label,index)=><li key={label} aria-current={number===index+1?'step':undefined}><span>{number>index+1?<Check size={14}/>:index+1}</span>{label}</li>)}</ol><span>Step {number} of 3</span></nav>
          <div className="hp-onboarding-content">
            {step==='city'?<><h1 ref={heading} tabIndex={-1}>Where’s your world?</h1><p>Your city sets the time, weather and rhythm. A city is enough.</p><label className="hp-field" htmlFor="onboarding-city">Your city<input id="onboarding-city" type="search" autoComplete="off" value={query} placeholder="London, Kyoto, somewhere else…" onChange={event=>{setQuery(event.target.value);setCity(null);setError('');setResults([]);setSearchError('');setSearching(false);}} aria-describedby="onboarding-search-status"/></label><div id="onboarding-search-status" className="hp-onboarding-search-status" role="status">{searchStatus}</div>{searchError&&<button className="hp-link-button" onClick={()=>setSearchRevision(value=>value+1)}>Try city search again</button>}<ul className="hp-city-results">{results.map(place=><li key={`${place.latitude}:${place.longitude}:${place.timezone}`}><button onClick={()=>{setCity(place);setQuery(place.name);setResults([]);setSearchError('');}}><span>{place.name}<small>{place.admin1?`${place.admin1}, `:''}{place.country}</small></span><ArrowRight size={18}/></button></li>)}</ul><div className="hp-onboarding-actions"><button className="hp-button" disabled={!city||searching} onClick={()=>setStep('style')}>Continue <ArrowRight size={17}/></button></div></>:step==='style'?<><h1 ref={heading} tabIndex={-1}>What feels like you?</h1><p>A starting point, never a limit. You can change it any time.</p><fieldset className="hp-onboarding-style-list"><legend className="hp-sr-only">Choose your art preference</legend>{styles.map(option=><label key={option.id} className="hp-onboarding-style" data-selected={style===option.id}><input type="radio" name="art-style" value={option.id} checked={style===option.id} onChange={()=>setStyle(option.id)}/><span><strong>{option.title}</strong><small>{option.description}</small></span>{style===option.id&&<Check size={18} aria-hidden="true"/>}</label>)}</fieldset><div className="hp-onboarding-actions"><button className="hp-link-button" disabled={busy} onClick={()=>setStep('city')}><ArrowLeft size={15}/> Back</button><button className="hp-button" disabled={busy} onClick={()=>void savePreferences()}>{busy?'Saving your atmosphere…':'Continue'}<ArrowRight size={17}/></button></div></>:<><h1 ref={heading} tabIndex={-1}>{paymentPending?'Making room for you.':'Your world is waiting.'}</h1><p>{paymentPending?'We’re checking your payment with the server. Your access changes only after it is confirmed.':'A quiet first scene appears right away. Your original artwork follows in the background.'}</p><dl className="hp-onboarding-summary"><div><dt>Your place</dt><dd><MapPin size={15}/>{city?.name}, {city?.country}</dd></div><div><dt>Your art</dt><dd>{styles.find(option=>option.id===style)?.title}</dd></div><div><dt>Your membership</dt><dd>{plan==='trial'?account.access.plan==='trial'?'Free trial':account.access.plan:plan}{needsPayment?' · not activated':''}</dd></div></dl><button className="hp-link-button" disabled={busy||paymentPending} onClick={()=>setStep('style')}>Change your atmosphere</button>
              {!verified?<section className="hp-onboarding-verification"><h2>One small step: your email.</h2><p>Open the verification link sent to {account.user.email}. Your place and art preference are saved.</p><div className="hp-onboarding-actions"><button className="hp-button" disabled={busy} onClick={()=>void checkVerification()}>I’ve verified my email <ArrowRight size={16}/></button><button className="hp-link-button" disabled={busy} onClick={()=>void verifyEmail()}>Resend email</button></div></section>:paymentPending?<section className="hp-onboarding-payment" role="status"><p>{paymentTimedOut?'Confirmation is taking longer. Check again before starting another checkout.':'Waiting for payment confirmation…'}</p>{paymentTimedOut&&<button className="hp-button hp-outline" onClick={()=>{setError('');setPaymentRevision(value=>value+1);}}>Check membership again</button>}<a href="/app?tab=account">Account & billing</a></section>:needsPayment?<section className="hp-onboarding-payment">{account.billingReady?<><p>Your atmosphere is saved. Continue to secure checkout for {plan}.</p><button className="hp-button" disabled={busy} onClick={()=>void checkout()}>{busy?'Opening checkout…':'Continue to checkout'}<ArrowRight size={17}/></button></>:<><h2>Paid memberships aren’t open yet.</h2><p>Your {plan} choice is saved in this journey. No payment has been taken. You can try your world with the free trial instead.</p></>}<button className="hp-link-button" disabled={busy} onClick={trial}>Continue with the free trial</button></section>:<><label className="hp-onboarding-fullscreen"><input type="checkbox" checked={fullscreen} onChange={event=>setFullscreen(event.target.checked)}/><span>Enter fullscreen<small>You can leave any time with Escape.</small></span></label><div className="hp-onboarding-actions"><button className="hp-button" onClick={enter}>Enter my world <ArrowRight size={18}/></button></div></>}
            </>}
            {notice&&<p className="hp-onboarding-notice" role="status">{notice}</p>}{error&&<p className="hp-onboarding-error" role="alert">{error}</p>}
          </div>
        </>}
        <footer className="hp-onboarding-footer"><span>Night comfort stays on.</span><a href="/privacy">Your privacy</a></footer>
      </section>
    </main>}
  </div>;
}
