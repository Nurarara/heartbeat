"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { buildArtwork } from "@/public/prototype/artwork.mjs";
import type { CreativeDirection } from "@/lib/ambient-director";
import { acceptableNightLight } from "@/lib/artwork-quality";

type Props = { direction: CreativeDirection; paused: boolean; reducedMotion: boolean; visible?: boolean; retryToken?: number; onError: (direction: CreativeDirection) => void; onDisplayed?: (direction: CreativeDirection) => void; canDisplay?: (direction: CreativeDirection) => boolean };

/** The current decoded image stays mounted until its decoded replacement is ready. */
export function AmbientArt({ direction, paused, reducedMotion, visible = true, retryToken = 0, onError, onDisplayed, canDisplay }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef<{ element: HTMLDivElement; url: string; id: string } | null>(null);
  const urls = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const sequence = useRef(0);
  const displayState = useRef({ paused, visible });
  const deferred = useRef<{ element: HTMLDivElement; spec: CreativeDirection } | null>(null);
  const directionRef = useRef(direction);
  const onErrorRef = useRef(onError);
  const displayedRef = useRef(onDisplayed);
  const canDisplayRef = useRef(canDisplay);
  useLayoutEffect(() => {
    directionRef.current = direction; onErrorRef.current = onError;
    displayedRef.current = onDisplayed; canDisplayRef.current = canDisplay;
    displayState.current = { paused, visible };
  }, [direction, onError, onDisplayed, canDisplay, paused, visible]);
  const signature = direction.id;

  useEffect(() => {
    if (!visible || document.hidden || paused && current.current) return;
    if (current.current?.id === signature) return;
    let cancelled = false, committed = false;
    const spec = directionRef.current;
    const frame = ++sequence.current;
    let url: string | null = null;
    async function prepare() {
      try {
        if (spec.artwork) url = spec.artwork.url;
        else {
          const { markup } = buildArtwork(spec.recipe, frame, { phase: spec.phase, season: spec.season, snowing: false });
          url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
          urls.current.add(url);
        }
        const image = new Image();
        image.src = url;
        image.alt = ({ room: "An illustrated Japanese room with a sleeping figure and a landscape window", city: "A quiet illustrated street with warm windows", cosmos: "A dark galaxy and a distant planet", meadow: "Distant dogs chasing a ball in a wide field beside one tree", lake: "A quiet illustrated lake with reeds, hills and a small boat", coast: "A quiet coast with a lighthouse and distant warm windows" })[spec.scene];
        image.className = "hb-art-image";
        if (spec.artwork) image.alt = spec.artwork.title;
        image.draggable = false;
        await image.decode();
        if (spec.artwork && spec.phase === 'night' && typeof CanvasRenderingContext2D !== 'undefined') {
          const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 20;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context) {
            const ratio = window.innerWidth / Math.max(1, window.innerHeight);
            const width = Math.min(image.naturalWidth, image.naturalHeight * ratio), height = width / ratio;
            context.drawImage(image, (image.naturalWidth - width) / 2, (image.naturalHeight - height) / 2, width, height, 0, 0, 32, 20);
            if (!acceptableNightLight(context.getImageData(0, 0, 32, 20).data)) throw new Error('Night picture was too bright.');
          }
        }
        if (cancelled || !host.current || document.hidden || canDisplayRef.current && !canDisplayRef.current(spec)) return;
        const element = document.createElement("div");
        element.className = "hb-art-frame";
        element.dataset.scene = spec.scene;
        element.dataset.momentId = spec.id;
        element.appendChild(image);
        const previous = current.current;
        if (previous) previous.element.setAttribute("aria-hidden", "true");
        host.current.appendChild(element);
        element.getBoundingClientRect();
        element.classList.add("is-visible");
        current.current = { element, url: url!, id: spec.id };
        committed = true;
        const delay = reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1850;
        const timer = setTimeout(() => {
          if (previous) { previous.element.remove(); URL.revokeObjectURL(previous.url); urls.current.delete(previous.url); }
          if (current.current?.element === element) {
            if (!document.hidden && displayState.current.visible && !displayState.current.paused && (!canDisplayRef.current || canDisplayRef.current(spec))) displayedRef.current?.(spec);
            else deferred.current = { element, spec };
          }
          timers.current.delete(timer);
        }, delay);
        timers.current.add(timer);
      } catch { if (!cancelled) onErrorRef.current(spec); }
      finally { if (!committed && url) { URL.revokeObjectURL(url); urls.current.delete(url); } }
    }
    void prepare();
    return () => { cancelled = true; };
  }, [signature, paused, reducedMotion, visible, retryToken]);

  useEffect(() => {
    const pending = deferred.current;
    if (!pending || paused || !visible || document.hidden) return;
    deferred.current = null;
    if (pending.element === current.current?.element && (!canDisplayRef.current || canDisplayRef.current(pending.spec))) displayedRef.current?.(pending.spec);
  }, [paused, visible, signature]);

  useEffect(() => () => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current.clear();
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    current.current?.element.remove();
    current.current = null;
    deferred.current = null;
  }, []);

  return <div ref={host} className="hb-artwork" aria-live="off" />;
}
