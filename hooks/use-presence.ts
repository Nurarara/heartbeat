"use client";
import { useEffect, useRef } from "react";
/** Tells the server, about once a minute, that this screen is showing Heartbeat. Only visible time counts. */
export function usePresence(enabled: boolean, mood: string) {
  const latest = useRef(mood), send = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const session = crypto.randomUUID();
    const ping = () => { if (document.hidden) return; fetch("/api/product/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session, mood: latest.current }), keepalive: true }).catch(() => {}); };
    send.current = ping; ping();
    const timer = setInterval(ping, 60000);
    const visibility = () => { if (!document.hidden) ping(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { send.current = null; clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [enabled]);
  // A mood change is reported straight away so the dashboard sees it.
  useEffect(() => { if (latest.current === mood) return; latest.current = mood; send.current?.(); }, [mood]);
}
