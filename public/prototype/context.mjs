/** Small, explicit prototype policy. This is a local rule engine, not an AI director. */
export const PRESETS = {
  sunday: { hour: 13 + 20 / 60, temperature: 26, date: '2026-06-21', theme: 'auto', festive: false },
  festive: { hour: 18 + 40 / 60, temperature: 4, date: '2026-12-20', theme: 'auto', festive: true },
  midnight: { hour: 23 + 15 / 60, temperature: 9, date: '2026-10-18', theme: 'auto', festive: false },
};
export function normalizeRecipe(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const clamp = (value, low, high, fallback) => Number.isFinite(Number(value)) ? Math.max(low, Math.min(high, Number(value))) : fallback;
  const parsedDate = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? Date.parse(`${input.date}T12:00:00Z`) : NaN;
  const date = Number.isFinite(parsedDate) && new Date(parsedDate).toISOString().slice(0, 10) === input.date ? input.date : PRESETS.sunday.date;
  return { version: 1, seed: Math.floor(clamp(input.seed, 1, 4294967295, 731921)), hour: clamp(input.hour, 0, 23.983333, PRESETS.sunday.hour), temperature: clamp(input.temperature, -90, 65, 26), date, theme: ['auto', 'room', 'city', 'cosmos', 'meadow', 'lake', 'coast'].includes(input.theme) ? input.theme : 'auto', festive: input.festive === true };
}
export function directScene(input) {
  const recipe = normalizeRecipe(input);
  const night = recipe.hour >= 21 || recipe.hour < 6;
  const scene = recipe.theme !== 'auto' ? recipe.theme : night ? 'cosmos' : recipe.festive ? 'city' : 'room';
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${recipe.date}T12:00:00Z`));
  const weekend = ['Saturday', 'Sunday'].includes(weekday);
  const captions = {
    room: { title: weekend ? 'No particular place to be.' : 'A little space in the day.', subtitle: recipe.temperature >= 22 ? 'Open windows. Slow afternoons.' : 'A quiet corner, a little warmth.', reason: `${weekday} at ${formatHour(recipe.hour)}, ${recipe.temperature}°C. ${weekend ? 'An unhurried weekend' : 'A quiet daytime pause'} suggests a sheltered, ${recipe.temperature >= 22 ? 'airy' : 'warm'} illustration.` },
    city: { title: 'The long way home.', subtitle: 'A few lights against the blue.', reason: `${weekday} at ${formatHour(recipe.hour)}, ${recipe.temperature}°C. ${recipe.festive ? 'Festive cues are explicitly enabled for this study; warm windows and' : 'The city illustration uses warm windows and'} ${recipe.temperature < 5 ? 'wintry details' : 'a quiet street'} to create an inviting atmosphere.` },
    cosmos: { title: 'Let the world get quiet.', subtitle: 'Nothing to do. Nowhere to go.', reason: `${night ? `${formatHour(recipe.hour)} suggests a restful palette.` : 'The universe illustration is manually selected.'} A dark cosmic composition keeps bright areas small. ${night ? 'This is a nighttime suggestion, not sleep detection.' : 'Its palette remains intentionally dark during daytime previews.'}` },
    meadow: { title: 'A whole afternoon ahead.', subtitle: 'One tree. A little room to run.', reason: `${weekday} at ${formatHour(recipe.hour)}, ${recipe.temperature}°C. An open field and distant dogs at play make space for a slower pace.` },
    lake: { title: 'Somewhere by the water.', subtitle: 'Let the day find its own pace.', reason: `A quiet waterside composition at ${formatHour(recipe.hour)}. The illustration suggests a pause without claiming actual local lake conditions.` },
    coast: { title: 'A light along the shore.', subtitle: 'The quiet beyond the windows.', reason: `A sheltered coast at ${formatHour(recipe.hour)}. Small lights and a broad horizon create an unhurried atmosphere.` },
  };
  return { recipe, scene, weekday, ...captions[scene], overridden: recipe.theme !== 'auto' };
}
export function formatHour(hour) {
  const minutes = Math.round(hour * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
