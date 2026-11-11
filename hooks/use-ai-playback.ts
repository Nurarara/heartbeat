"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { parseStoryMemory, type CreativeDirection, type StoryMemory } from '@/lib/ambient-director';
import type { AmbientPreferences } from '@/lib/ambient';
import type { AICandidate, AIResult, AIStatus } from '@/lib/ai/types';

const REQUEST_KEY = 'heartbeat.ai-request.v1';
const OFF: AIStatus = { configured: false, authorized: false, available: false, reason: 'AI setup has not been enabled. Free artwork is available.' };
type Recovery = {id:string;key:string};
function savedRequest(key:string|undefined):Recovery|null {
  try {const value=JSON.parse(localStorage.getItem(REQUEST_KEY)||'null');return value?.key===key&&typeof value.id==='string'&&/^[a-f0-9-]{36}$/.test(value.id)?value:null;}catch{return null;}
}
type Inputs = { base: CreativeDirection | null; memory: StoryMemory | null; preferences: AmbientPreferences | null; at: number; paused: boolean; visible: boolean; accept: (direction: CreativeDirection, expectedId: string) => boolean; reject: (id: string) => void; localCanDisplay: (direction: CreativeDirection) => boolean };

export function useAIPlayback(inputs: Inputs, customer = false) {
  const lifetime=useRef({active:false,controller:new AbortController()});
  useEffect(()=>{const scope={active:true,controller:new AbortController()};lifetime.current=scope;return()=>{scope.active=false;scope.controller.abort();};},[]);
  const [connection, setConnection] = useState<AIStatus>(OFF), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [nextAt, setNextAt] = useState(0), [queued, setQueued] = useState<{ candidate: AICandidate; expectedId: string } | null>(null);
  const [badRestore, setBadRestore] = useState('');
  const [waiting,setWaiting]=useState(false);
  const [recoveryAt,setRecoveryAt]=useState(0);
  const recovery=useRef<Recovery|null>(null),readyRequest=useRef<{attemptId:string;requestId:string}|null>(null);
  const clearRecovery=useCallback(()=>{const id=recovery.current?.id;recovery.current=null;readyRequest.current=null;setWaiting(false);try{const stored=JSON.parse(localStorage.getItem(REQUEST_KEY)||'null');if(id&&stored?.id===id)localStorage.removeItem(REQUEST_KEY);}catch{/* Browser storage is optional. */}},[]);
  const latest = useRef(inputs), inFlight = useRef(false), attempted = useRef({ id: '', at: 0 }), acked = useRef(new Set<string>());
  useLayoutEffect(() => { latest.current = inputs; }, [inputs]);
  const refresh = useCallback(async () => {
    const scope=lifetime.current;if(!scope.active)return;
    try {
      const response = await fetch('/api/ai/status', { cache: 'no-store', signal: AbortSignal.any([scope.controller.signal,AbortSignal.timeout(10000)]) });
      if (!response.ok) throw new Error('AI setup/storage needs checking.');
      const status = await response.json() as AIStatus;
      if (typeof status.configured !== 'boolean' || typeof status.authorized !== 'boolean') throw new Error('Invalid status');
      if(scope.active){setConnection(status); setNextAt(value => Math.max(value, status.nextAt || 0));}
    } catch { if(scope.active)setConnection({ ...OFF, reason: 'AI connection is unavailable. Free artwork is available.' }); }
  }, []);
  useEffect(() => {
    void refresh();
    const resume = () => { if (!document.hidden) void refresh(); };
    const timer = setInterval(resume, 60000); document.addEventListener('visibilitychange', resume);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [refresh]);
  const discovered=useRef(false);
  useEffect(()=>{
    if(!customer||!connection.authorized||!inputs.base||discovered.current)return;
    const scope=lifetime.current,key=inputs.base.locationKey;
    discovered.current=true;
    fetch('/api/product/generation',{cache:'no-store',signal:scope.controller.signal}).then(r=>r.json() as Promise<AIResult & {requestId?:string}>).then(value=>{
      if(!scope.active||latest.current.base?.locationKey!==key)return;
      const id=value.requestId||value.candidate?.requestId;
      if(typeof id==='string'&&['pending','ready'].includes(value.status)&&!recovery.current){recovery.current={id,key};setWaiting(true);setRecoveryAt(0);setNextAt(0);}
    }).catch(()=>{if(scope.active)discovered.current=false;});
  },[customer,connection.authorized,inputs.base]);
  const unlock = useCallback(async (accessKey: string) => {
    const scope=lifetime.current;if(!scope.active)return false;
    const response = await fetch('/api/ai/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey }), signal: AbortSignal.any([scope.controller.signal,AbortSignal.timeout(10000)]) });
    const data = await response.json() as { error?: string };
    if(!scope.active)return false;
    if (!response.ok) { setMessage(data.error || 'AI session could not be unlocked.'); return false; }
    setMessage('AI connected. The first picture will prepare in the background.'); await refresh(); return true;
  }, [refresh]);
  const minute = Math.floor(inputs.at / (customer ? 5000 : 60000)), baseId = inputs.base?.id, locationKey = inputs.base?.locationKey;
  useEffect(() => {
    const state = latest.current, base = state.base;
    const pending=recovery.current?.key===base?.locationKey?recovery.current:savedRequest(base?.locationKey);
    const hasRecovery=!!pending;
    if(pending&&readyRequest.current?.requestId===pending.id)return;
    // Already-funded jobs have their own polling clock. Generation cooldowns,
    // exhausted capacity and a restored picture must never prevent retrieval.
    if (!base || !state.preferences || !connection.authorized || !connection.available && !hasRecovery || state.paused || !state.visible || document.hidden || inFlight.current || (!hasRecovery && !!base.artwork) || state.at < (hasRecovery?recoveryAt:nextAt) || queued) return;
    if (!hasRecovery && attempted.current.id === base.id && state.at - attempted.current.at < 3600000) return;
    inFlight.current = true; setBusy(true); attempted.current = { id: base.id, at: state.at };
    const scope=lifetime.current;
    const expectedId = base.id, key = base.locationKey;
    async function prepare() {
      let requestId = '', recovering = false, received = false;
      try {
        if(pending){requestId=pending.id;recovering=true;}
        if (!requestId) requestId = crypto.randomUUID();
        recovery.current={id:requestId,key};
        setWaiting(true);
        try { localStorage.setItem(REQUEST_KEY, JSON.stringify({ id: requestId, key })); } catch { /* No persistent recovery in this browser. */ }
        const response = recovering
          ? await fetch(`${customer ? '/api/product/generation' : '/api/ai/attempt'}?requestId=${requestId}`, { cache: 'no-store', signal: AbortSignal.any([scope.controller.signal,AbortSignal.timeout(15000)]) })
          : await fetch(customer ? '/api/product/generation' : '/api/ai/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, location: state.preferences!.location, memory: state.memory ? JSON.stringify(state.memory) : null, festive: state.preferences!.festiveTouches === true, style: state.preferences!.style, force: !state.memory?.history.some(item => item.direction.artwork) }), signal: AbortSignal.any([scope.controller.signal,AbortSignal.timeout(210000)]) });
        const result = await response.json() as AIResult & { error?: string };
        if(!scope.active)return;
        received = true;
        if (!response.ok && response.status !== 429) {
          if (response.status === 404 || response.status === 401) clearRecovery();
          throw new Error(result.error || 'AI preparation is unavailable.');
        }
        setNextAt(Math.max(latest.current.at + (result.status === 'pending' ? customer ? 5000 : 60000 : 600000), result.nextAt || 0));
        if(result.status==='pending')setRecoveryAt(latest.current.at+(customer?Math.max(5000,Math.min(60000,(result as AIResult & {retryAfter?:number}).retryAfter! *1000||5000))+Math.floor(Math.random()*1500):60000));
        if (result.status === 'ready' && result.candidate) {
          const candidate = result.candidate, current = latest.current;
          if (!current.preferences || candidate.locationKey !== key || candidate.createdAt > current.at + 300000 || candidate.createdAt < current.at - 24 * 3600000) throw new Error('The prepared picture is no longer current.');
          const checked = parseStoryMemory(JSON.stringify({ version: 1, locationKey: key, history: [{ direction: candidate.direction, at: candidate.createdAt }] }), current.preferences.location, Math.max(current.at, candidate.createdAt));
          if (!checked?.history[0]?.direction.artwork || checked.history[0].direction.artwork.attemptId !== candidate.id) throw new Error('The prepared picture was invalid.');
          readyRequest.current={attemptId:candidate.id,requestId};
          setQueued({ candidate: { ...candidate, direction: checked.history[0].direction }, expectedId });
          setMessage('A new picture is ready.');
        } else {
          if (result.status !== 'pending') clearRecovery();
          if (result.status === 'pending') attempted.current = { id: '', at: 0 };
          setMessage(result.reason || (result.status === 'held' ? 'The director chose to hold this moment.' : 'The current artwork is kept.'));
        }
      } catch (error) {
        if(!scope.active)return;
        // Never reissue a possibly charged POST. Recovery polls the same request ID.
        if (received) clearRecovery();
        else attempted.current = { id: '', at: 0 };
        setRecoveryAt(latest.current.at+600000);
        setMessage(error instanceof Error ? error.message : 'The current artwork is kept.'); setNextAt(latest.current.at + 600000);
      } finally { if(scope.active){inFlight.current = false; setBusy(false); void refresh();} }
    }
    void prepare();
  }, [baseId, locationKey, minute, inputs.paused, inputs.visible, connection.authorized, connection.available, nextAt, recoveryAt, queued, refresh, clearRecovery,customer]);
  useEffect(() => {
    if (!queued || inputs.paused || !inputs.visible || document.hidden) return;
    const scope=lifetime.current;let canceled=false;
    queueMicrotask(()=>{
      if(canceled||!scope.active)return;
      const state = latest.current;
      if (state.base?.id === queued.expectedId && state.base.locationKey === queued.candidate.locationKey) state.accept(queued.candidate.direction, queued.expectedId);
      else clearRecovery();
      setQueued(value=>value===queued?null:value);
    });
    return()=>{canceled=true;};
  }, [queued, inputs.paused, inputs.visible, baseId,clearRecovery]);
  const ackTimers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const ackFlights=useRef(new Map<string,typeof lifetime.current>());
  useEffect(()=>()=>{ackTimers.current.forEach(timer=>clearTimeout(timer));ackTimers.current.clear();ackFlights.current.clear();},[]);
  const onDisplayed = useCallback((direction: CreativeDirection) => {
    const id = direction.artwork?.attemptId;
    const scope=lifetime.current;
    if (!scope.active || !id || acked.current.has(id)) return;
    if(ackTimers.current.has(id)||ackFlights.current.has(id))return;
    let retries=0;
    async function acknowledge() {
      if(!scope.active)return;ackFlights.current.set(id!,scope);
      try {
        const response = await fetch(customer?'/api/product/display':'/api/ai/display', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id,eventId:`browser:${id}` }), signal: AbortSignal.any([scope.controller.signal,AbortSignal.timeout(10000)]) });
        if(!scope.active)return;
        if(!response.ok){if([400,401,403,404].includes(response.status)){acked.current.add(id!);return;}throw new Error('Display acknowledgement delayed');}
        if (response.ok) { ackTimers.current.delete(id!);acked.current.add(id!); const ready=readyRequest.current;if(ready&&ready.attemptId===id&&ready.requestId===recovery.current?.id)clearRecovery(); }
      } catch {if(scope.active&&retries<5){const delay=[1000,5000,15000,60000,300000][retries++];ackTimers.current.set(id!,setTimeout(()=>{ackTimers.current.delete(id!);void acknowledge();},delay));}}
      finally{if(ackFlights.current.get(id!)===scope)ackFlights.current.delete(id!);}
    }
    void acknowledge();
  }, [clearRecovery,customer]);
  const onFailure = useCallback((direction: CreativeDirection) => {
    if (!direction.artwork) return;
    setBadRestore(direction.id); setMessage('The generated picture could not be displayed. Your current artwork is kept.');
    setNextAt(latest.current.at + 3600000); latest.current.reject(direction.id);
    clearRecovery();
  }, [clearRecovery]);
  const committed = inputs.memory?.history.at(-1)?.direction;
  const preserve = committed?.artwork && committed.id !== badRestore && committed.locationKey === inputs.base?.locationKey && (inputs.base.phase !== 'night' || committed.phase === 'night');
  const displayDirection = inputs.base?.artwork ? inputs.base : preserve ? committed : inputs.base;
  const canDisplay = useCallback((direction: CreativeDirection) => {
    const state = latest.current;
    if (state.paused || document.hidden || direction.locationKey !== state.base?.locationKey || state.base.phase === 'night' && direction.phase !== 'night') return false;
    if (direction.artwork && direction.id === state.memory?.history.at(-1)?.direction.id) return true;
    return state.localCanDisplay(direction);
  }, []);
  return { connection, busy, message, nextAt, waiting, refresh, unlock, displayDirection, onDisplayed, onFailure, canDisplay };
}
