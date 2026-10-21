/** Provisional screen-comfort guard, not a judgement of artistic quality. */
export function imageLight(pixels: Uint8ClampedArray) {
  if (!pixels.length || pixels.length % 4) throw new Error('Invalid image sample.');
  let sum = 0, bright = 0;
  for (let at = 0; at < pixels.length; at += 4) {
    const value = (.2126 * pixels[at] + .7152 * pixels[at + 1] + .0722 * pixels[at + 2]) / 255;
    sum += value; if (value > .8) bright++;
  }
  return { mean: sum / (pixels.length / 4), brightFraction: bright / (pixels.length / 4) };
}
export function acceptableNightLight(pixels: Uint8ClampedArray) {
  const light = imageLight(pixels);
  return light.mean <= .32 && light.brightFraction <= .12;
}
