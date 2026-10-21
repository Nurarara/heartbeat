import assert from 'node:assert/strict';
import { directScene, formatHour, normalizeRecipe, PRESETS } from '../public/prototype/context.mjs';
import { buildArtwork } from '../public/prototype/artwork.mjs';

// Night boundaries and the order of night/festive/manual decisions matter for comfort.
assert.equal(directScene({ ...PRESETS.sunday, hour: 20.99 }).scene, 'room');
assert.equal(directScene({ ...PRESETS.sunday, hour: 21 }).scene, 'cosmos');
assert.equal(directScene({ ...PRESETS.festive, hour: 2 }).scene, 'cosmos');
assert.equal(directScene({ ...PRESETS.sunday, hour: 5.99 }).scene, 'cosmos');
assert.equal(directScene({ ...PRESETS.sunday, hour: 6 }).scene, 'room');
assert.equal(directScene(PRESETS.festive).scene, 'city');
assert.equal(directScene({ ...PRESETS.midnight, theme: 'room' }).scene, 'room');
assert.equal(directScene(PRESETS.sunday).weekday, 'Sunday');
assert.equal(directScene({ ...PRESETS.sunday, date: '2026-06-22' }).weekday, 'Monday');
assert.equal(normalizeRecipe({ date: '2026-02-31' }).date, PRESETS.sunday.date);
assert.equal(normalizeRecipe({ date: '2028-02-29' }).date, '2028-02-29');
assert.equal(normalizeRecipe({ hour: 100, temperature: -200, seed: -2, theme: '<script>' }).temperature, -90);
assert.equal(normalizeRecipe(null).theme, 'auto');
assert.equal(formatHour(normalizeRecipe({ hour: 24 }).hour), '23:59');
assert.equal(formatHour(13 + 20 / 60), '13:20');
assert.ok(!directScene({ ...PRESETS.sunday, theme: 'city', festive: false }).reason.includes('explicitly enabled'));

const ids = markup => [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const themes = ['room', 'city', 'cosmos', 'meadow', 'lake', 'coast'];
for (const theme of themes) {
  const base = { ...PRESETS.sunday, theme, seed: 42 };
  const first = buildArtwork(base, 1).markup;
  assert.equal(first, buildArtwork(base, 1).markup, `${theme}: same recipe reproduces the artwork`);
  assert.notEqual(first, buildArtwork({ ...base, seed: 99 }, 1).markup, `${theme}: seed changes artwork`);
  assert.notEqual(first, buildArtwork({ ...base, temperature: -2, hour: 23 }, 1).markup, `${theme}: context affects artwork`);
  const frameIds = ids(first);
  assert.equal(new Set(frameIds).size, frameIds.length, `${theme}: no duplicate IDs within a frame`);
  for (const match of first.matchAll(/url\(#([^)]*)\)/g)) assert.ok(frameIds.includes(match[1]), `${theme}: local SVG reference resolves`);
  const secondIds = new Set(ids(buildArtwork(base, 2).markup));
  assert.ok(frameIds.every(id => !secondIds.has(id)), `${theme}: overlapping frames have independent SVG IDs`);
  assert.ok(!/<(?:script|foreignObject|image)\b|(?:href|src)\s*=|\b(?:NaN|undefined|Infinity)\b/.test(first), `${theme}: no executable markup, external assets or non-finite coordinates`);
}
console.log('Passed nighttime/context policy, weekday/date validation, deterministic artwork, variation, and safe independent SVG frames.');
