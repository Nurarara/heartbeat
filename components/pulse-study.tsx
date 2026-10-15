'use client';
import type { CSSProperties } from 'react';
import type { Pulse } from '@/lib/pulse';
export function pulseStyle(pulse: Pulse | null): CSSProperties {
  return { '--scene-light': pulse?.effects.brightness || 1, '--scene-saturation':pulse?.effects.saturation || 1, '--scene-cool':pulse?.effects.cool || 0, '--lamp-warmth':pulse?.effects.lamp || .5, '--world-drift':`${pulse?.effects.driftSeconds || 45}s`, '--world-breath':`${pulse?.effects.breathSeconds || 10}s` } as CSSProperties;
}
export function PulseReading({ pulse }: { pulse: Pulse | null }) {
  if (!pulse) return <p className="settings-footnote">Waiting for the first environmental observation.</p>;
  return <div className="pulse-reading">
    <div className="pulse-decision"><span>{pulse.action === 'HOLD' ? 'Hold this moment' : pulse.action === 'ANIMATE' ? 'Adjust light and movement' : 'A new scene is justified'}</span><small>Rule-based interpreter</small></div>
    <h3>{pulse.mood.title}</h3><p>{pulse.reason}</p>
    <dl className="pulse-signals"><div><dt>Local light</dt><dd>{pulse.environment.phase} {pulse.environment.phaseSource === 'clock' && '(approximate)'}</dd></div><div><dt>Outdoors</dt><dd>{pulse.context?.temperature == null ? 'Unavailable' : `${pulse.context.temperature}°C · ${pulse.environment.weather}`}</dd></div><div><dt>Movement</dt><dd>{Math.round(pulse.mood.energy*100)} / 100</dd></div><div><dt>Warmth</dt><dd>{Math.round(pulse.mood.warmth*100)} / 100</dd></div></dl>
    <h4>Direction for this world</h4><ul>{pulse.instructions.map(x => <li key={x}>{x}</li>)}</ul>
    {!!pulse.recentEvents.length && <><h4>Recent changes</h4><ul>{pulse.recentEvents.slice(-3).reverse().map((e,i)=><li key={`${e.at}-${i}`}>{e.description}</li>)}</ul></>}
  </div>;
}
