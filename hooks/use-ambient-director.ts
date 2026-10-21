"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseStoryMemory, planMoment, rememberMoment, type CreativeDirection, type StoryMemory } from "@/lib/ambient-director";
import type { AmbientPreferences } from "@/lib/ambient";
import type { Context } from "@/lib/world";
import { parseCreativeMemory, proposeCreativeMoment, recordCreativeFeedback, type CreativeProposal } from "@/lib/creative";
import { weatherCue } from "@/lib/weather-mood";

const MEMORY_KEY = "heartbeat.story.v1";
const CREATIVE_KEY = "heartbeat.creative.v1";
type Playback = { key: string; memory: StoryMemory | null; direction: CreativeDirection; pending: boolean; failures: number; retryToken: number };

function saveMemory(memory: StoryMemory, onFailure: () => void) {
  try {
    if (memory.creative) localStorage.setItem(CREATIVE_KEY, JSON.stringify(memory.creative));
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch { onFailure(); }
}

/** Plans may be discarded. Only a fully displayed frame is allowed into history. */
export function useAmbientDirector(preferences: AmbientPreferences | null, context: Context | null, at: number, paused: boolean, onStorageFailure: () => void, initialMemory?: StoryMemory | null) {
  const key = preferences ? `${preferences.location.latitude},${preferences.location.longitude}:${preferences.location.timezone}` : "";
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [visible, setVisible] = useState(true);
  const [manual, setManual] = useState(0);
  const consumedManual = useRef(0);
  const active = useRef(playback);
  const current = useRef({ preferences, context, at, paused, key });
  const storageFailure = useRef(onStorageFailure);
  // Event/decoder callbacks must see committed props, never an abandoned render.
  useLayoutEffect(() => {
    active.current = playback; current.current = { preferences, context, at, paused, key };
    storageFailure.current = onStorageFailure;
  }, [playback, preferences, context, at, paused, key, onStorageFailure]);

  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    visibility(); document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  useEffect(() => {
    const latest = current.current;
    if (!latest.preferences || !key) { setPlayback(null); return; }
    let memory: StoryMemory | null = null;
    try {
      // Account-owned server memory is authoritative, including an empty history.
      memory = parseStoryMemory(initialMemory === undefined ? localStorage.getItem(MEMORY_KEY) : JSON.stringify(initialMemory), latest.preferences.location, latest.at);
      const raw = initialMemory === undefined ? localStorage.getItem(CREATIVE_KEY) : null;
      const creative = raw && raw.length < 80000 ? parseCreativeMemory(JSON.parse(raw), latest.at) : null;
      if (creative && creative.displayed >= (memory?.creative?.displayed || 0)) memory = { ...(memory || { version: 1, locationKey: key, history: [] }), creative };
    }
    catch { storageFailure.current(); }
    const result = planMoment(latest.preferences.location, latest.context, latest.at, memory, latest.preferences.seed, { festive: latest.preferences.festiveTouches });
    setPlayback({ key, memory, direction: result.direction, pending: result.action === "REIMAGINE", failures: 0, retryToken: 0 });
    consumedManual.current = manual;
    // A city change starts a separate world. Preference toggles are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const minute = Math.floor(at / 60000);
  const observation = context?.fetchedAt || 0;
  useEffect(() => {
    const latest = current.current, state = active.current;
    if (!latest.preferences || !state || state.key !== latest.key || latest.paused || !visible || document.hidden) return;
    const forced = manual !== consumedManual.current;
    const result = planMoment(latest.preferences.location, latest.context, latest.at, state.memory, forced ? manual : latest.preferences.seed, { force: forced, festive: latest.preferences.festiveTouches });
    const actualPhase = planMoment(latest.preferences.location, latest.context, latest.at, null, latest.preferences.seed).direction.phase;
    // Do not replace a preparing candidate on every clock tick. Darkness is an
    // exception: a pending bright picture must never win after the local night starts.
    const urgentDarkness = actualPhase === "night" && state.direction.phase !== "night";
    if (state.pending && !forced && !urgentDarkness) return;
    if (forced) consumedManual.current = manual;
    if (result.action === "HOLD" && result.direction.id === state.direction.id) return;
    setPlayback({ ...state, direction: result.direction, pending: result.action === "REIMAGINE", failures: 0, retryToken: 0 });
  }, [key, minute, observation, preferences?.festiveTouches, manual, paused, visible, playback?.key]);

  // Failed decoding retries the exact same candidate, with bounded backoff. Hidden
  // tabs and pause defer this work instead of consuming a backlog of missed frames.
  useEffect(() => {
    if (!playback?.failures || playback.failures > 3 || paused || !visible) return;
    const id = playback.direction.id;
    const timer = setTimeout(() => {
      setPlayback(value => value?.direction.id === id ? { ...value, retryToken: value.retryToken + 1 } : value);
    }, [5000, 15000, 60000][playback.failures - 1]);
    return () => clearTimeout(timer);
  }, [playback?.direction.id, playback?.failures, paused, visible]);

  const onDisplayed = useCallback((direction: CreativeDirection) => {
    const latest = current.current, state = active.current;
    if (!state || state.key !== latest.key || direction.locationKey !== latest.key || direction.id !== state.direction.id) return;
    const memory = rememberMoment(state.memory, direction, latest.at);
    active.current = { ...state, memory, pending: false, failures: 0 };
    setPlayback(active.current);
    saveMemory(memory, storageFailure.current);
  }, []);
  const onFailure = useCallback((direction: CreativeDirection) => {
    setPlayback(value => value?.direction.id === direction.id ? { ...value, pending: true, failures: value.failures + 1 } : value);
  }, []);
  const canDisplay = useCallback((direction: CreativeDirection) => {
    const latest = current.current, state = active.current;
    if (!latest.preferences || latest.paused || document.hidden || state?.key !== latest.key || state.direction.id !== direction.id) return false;
    const safety = planMoment(latest.preferences.location, latest.context, latest.at, null, latest.preferences.seed, { festive: latest.preferences.festiveTouches });
    return safety.direction.phase !== "night" || direction.phase === "night";
  }, []);
  const requestMoment = useCallback(() => setManual(crypto.getRandomValues(new Uint32Array(1))[0] || 1), []);
  const previewIdea = useCallback(() => {
    const latest = current.current, state = active.current;
    if (!latest.preferences || state?.key !== latest.key) return null;
    const fresh = planMoment(latest.preferences.location, latest.context, latest.at, state.memory, latest.preferences.seed, { force: true, festive: latest.preferences.festiveTouches }).direction;
    return proposeCreativeMoment({ phase: fresh.phase, season: fresh.season, temperature: fresh.brief.temperature, weekday: fresh.brief.weekday, festive: fresh.recipe.festive, weather: weatherCue(latest.context, latest.at) }, state.memory?.creative, crypto.getRandomValues(new Uint32Array(1))[0], latest.at);
  }, []);
  const feedback = useCallback((proposal: CreativeProposal, preference: 'more' | 'less') => {
    const state = active.current;
    if (!state || state.key !== current.current.key) return;
    const memory: StoryMemory = { ...(state.memory || { version: 1, locationKey: state.key, history: [] }), creative: recordCreativeFeedback(state.memory?.creative, proposal, preference) };
    active.current = { ...state, memory }; setPlayback(active.current);
    saveMemory(memory, storageFailure.current);
  }, []);
  const resetMemory = useCallback(() => {
    const latest = current.current, state = active.current;
    if (!latest.preferences || state?.key !== latest.key) return;
    // Forget creative history after planning; keep already observed evening
    // darkness for this replacement even when the weather has since gone stale.
    const result = planMoment(latest.preferences.location, latest.context, latest.at, state.memory, crypto.getRandomValues(new Uint32Array(1))[0] || 1, { force: true, festive: latest.preferences.festiveTouches });
    active.current = { ...state, memory: null, direction: result.direction, pending: true, failures: 0, retryToken: 0 };
    setPlayback(active.current);
    try { localStorage.removeItem(MEMORY_KEY); localStorage.removeItem(CREATIVE_KEY); } catch { storageFailure.current(); }
  }, []);
  const acceptGenerated = useCallback((direction: CreativeDirection, expectedId: string) => {
    const latest = current.current, state = active.current;
    if (!state || state.key !== latest.key || direction.locationKey !== latest.key || state.direction.id !== expectedId || latest.paused || document.hidden) return false;
    const safety = planMoment(latest.preferences!.location, latest.context, latest.at, state.memory, latest.preferences!.seed, { force: true }).direction;
    if (safety.phase === 'night' && direction.phase !== 'night') return false;
    active.current = { ...state, direction, pending: true, failures: 0, retryToken: 0 }; setPlayback(active.current); return true;
  }, []);
  const rejectGenerated = useCallback((id: string) => {
    const state = active.current;
    if (!state || state.direction.id !== id || !state.direction.artwork) return;
    const direction = { ...state.direction, id: `fallback-${state.direction.artwork.attemptId}` };
    delete direction.artwork;
    active.current = { ...state, direction, pending: true, failures: 0, retryToken: 0 }; setPlayback(active.current);
  }, []);
  return { direction: playback?.key === key ? playback.direction : null, memory: playback?.key === key ? playback.memory : null, visible, failed: !!playback?.failures && playback.key === key, retryToken: playback?.retryToken || 0, onDisplayed, onFailure, canDisplay, requestMoment, previewIdea, feedback, resetMemory, acceptGenerated, rejectGenerated };
}
