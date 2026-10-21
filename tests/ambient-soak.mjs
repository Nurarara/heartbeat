// Accelerated week-long policy/render checks; not a real-time browser soak.
import assert from 'node:assert/strict';
import { planMoment, parseStoryMemory, rememberMoment } from '../lib/ambient-director.ts';
import { localClock } from '../lib/ambient.ts';
import { buildArtwork } from '../public/prototype/artwork.mjs';

const minute = 60000;
const cases = [
  ['London DST end', 51.5, -.12, 'Europe/London', '2026-10-24'],
  ['New York DST end', 40.7, -74, 'America/New_York', '2026-10-31'],
  ['Sydney DST start', -33.86, 151.2, 'Australia/Sydney', '2026-10-03'],
  ['Tropical year-end', 1.35, 103.8, 'Asia/Singapore', '2026-12-28'],
  ['Polar summer', 78.2, 15.6, 'Arctic/Longyearbyen', '2026-06-20'],
  ['Southern summer', -34.6, -58.4, 'America/Argentina/Buenos_Aires', '2026-12-28'],
  ['Leap day', 51.5, -.12, 'Europe/London', '2028-02-27'],
];
let decisions = 0, frames = 0, frameNumber = 0;
for (const [name, latitude, longitude, timezone, date] of cases) {
  const place = { name, country: 'Test place', latitude, longitude, timezone };
  const start = Date.parse(`${date}T00:00:00Z`);
  let memory = null;
  const seen = new Set();
  for (let step = 0; step <= 7 * 24 * 3; step++) {
    const at = start + step * 20 * minute;
    // Include a day without observations, temperature swings and polar daylight.
    const context = step >= 144 && step < 216 ? null : {
      temperature: 15 + 12 * Math.sin(step / 12), observedAt: at, fetchedAt: at,
      isDay: name === 'Polar summer' ? true : null, weatherCode: null,
    };
    const before = memory?.history.at(-1)?.direction;
    const result = planMoment(place, context, at, memory, 456, { festive: true, force: step % 79 === 0 });
    const hour = localClock(place, at).hour;
    if (hour < 6 || hour >= 21) assert.equal(result.direction.phase, 'night', name);
    if (result.direction.phase === 'night') assert.ok(['coast', 'cosmos'].includes(result.direction.scene), name);
    assert.ok(result.nextCheckAt > at, name);
    if (result.action === 'HOLD') assert.equal(result.direction.id, before.id, `${name}: exact hold`);
    else {
      if (before) assert.notEqual(result.direction.scene, before.scene, `${name}: adjacent repetition`);
      assert.ok(!seen.has(result.direction.id), `${name}: duplicate ID`);
      seen.add(result.direction.id);
      const { markup } = buildArtwork(result.direction.recipe, ++frameNumber, { phase: result.direction.phase, season: result.direction.season, snowing: false });
      assert.match(markup, /<svg/);
      assert.doesNotMatch(markup, /\b(?:NaN|Infinity|undefined)\b|<script|https?:\/\/(?!www\.w3\.org)/);
      memory = rememberMoment(memory, result.direction, at);
      assert.ok(memory.history.length <= 12);
      assert.deepEqual(parseStoryMemory(JSON.stringify(memory), place, at), memory, `${name}: reload round-trip`);
      frames++;
    }
    decisions++;
  }
}
console.log(`Passed ${decisions} decisions and ${frames} rendered moments across seven simulated weeks: DST changes, leap day, year-end, hemispheres, tropical/polar context and weather loss.`);
