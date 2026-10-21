import { directScene } from './context.mjs';
import { renderRoom } from './scenes/room.mjs';
import { renderCity } from './scenes/city.mjs';
import { renderCosmos } from './scenes/cosmos.mjs';
import { renderMeadow } from './scenes/meadow.mjs';
import { renderLake } from './scenes/lake.mjs';
import { renderCoast } from './scenes/coast.mjs';

const renderers = { room: renderRoom, city: renderCity, cosmos: renderCosmos, meadow: renderMeadow, lake: renderLake, coast: renderCoast };
const descriptions = {
  room: 'An illustrated Japanese room with a wind chime, landscape window and sleeping figure',
  city: 'An illustrated city street with warm shop windows, lamps and seasonal details',
  cosmos: 'A dark star field, a distant galaxy, and a quiet planet',
  meadow: 'A broad field with one tree and distant dogs chasing a ball',
  lake: 'A quiet lake with distant hills, reeds and a small boat',
  coast: 'A quiet coast with a lighthouse and warm distant windows',
};
/** @param {object} input @param {number} frameNumber @param {{phase?: string, season?: string, snowing?: boolean}} environment */
export function buildArtwork(input, frameNumber = 0, environment = {}) {
  const direction = directScene(input);
  const suffix = `-frame-${Number.isSafeInteger(frameNumber) && frameNumber >= 0 ? frameNumber : 0}`;
  // Context changes reuse the seed. Namespace each mounted frame independently so
  // overlapping SVGs never resolve their gradients/filters against the old frame.
  const phase = ['morning', 'day', 'dusk', 'night'].includes(environment.phase || '') ? environment.phase : '';
  const season = ['spring', 'summer', 'autumn', 'winter', 'tropical'].includes(environment.season || '') ? environment.season : 'summer';
  const options = { ...direction.recipe, phase, season, ...(typeof environment.snowing === 'boolean' ? { snowing: environment.snowing } : {}) };
  const inner = renderers[direction.scene](options)
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${id}${suffix}"`)
    .replace(/url\(#([^)]*)\)/g, (_, id) => `url(#${id}${suffix})`);
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${descriptions[direction.scene]}">${inner}</svg>`;
  return { direction, markup };
}
