"use client";
import { useEffect } from "react";
/**
 * When Heartbeat is opened from the Home Screen (iPhone, iPad, Android) or is full-screen, keep the
 * screen on like a picture frame. The browser releases it automatically when the page is hidden.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    type Sentinel = { release(): Promise<void>; released: boolean };
    const nav = navigator as Navigator & { wakeLock: { request(type: "screen"): Promise<Sentinel> } };
    let lock: Sentinel | null = null, active = true;
    const frameMode = () => window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || !!document.fullscreenElement || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const want = async () => {
      if (!active || document.hidden || !frameMode() || (lock && !lock.released)) return;
      try { lock = await nav.wakeLock.request("screen"); } catch { /* not allowed right now (for example low battery) */ }
    };
    void want();
    const again = () => { void want(); };
    document.addEventListener("visibilitychange", again); document.addEventListener("fullscreenchange", again);
    return () => { active = false; document.removeEventListener("visibilitychange", again); document.removeEventListener("fullscreenchange", again); void lock?.release().catch(() => {}); };
  }, [enabled]);
}
