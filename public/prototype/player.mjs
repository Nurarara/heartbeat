import { formatHour, normalizeRecipe, PRESETS } from './context.mjs';
import { buildArtwork } from './artwork.mjs';

const $ = selector => document.querySelector(selector);
const ambient = $('#ambient'), artwork = $('#artwork');
const labels = { room: ['01', 'AN UNHURRIED AFTERNOON'], city: ['02', 'LIGHTS ALONG THE WAY'], cosmos: ['03', 'AFTER THE WORLD SETTLES'], meadow: ['04', 'A LITTLE ROOM TO RUN'], lake: ['05', 'BESIDE THE WATER'], coast: ['06', 'THE QUIET SHORE'] };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let recipe = normalizeRecipe({ ...PRESETS.sunday, seed: 731921 });
let revision = 0, currentLayer = null, idleTimer, renderTimer, evolveTimer;
let transitioning = false, lastPointer = null, keyboardMode = false;
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;

// URL recipes let a composition be revisited without cookies, accounts or storage.
try {
  const query = new URLSearchParams(location.search);
  if (query.has('seed')) recipe = normalizeRecipe({ ...recipe, ...Object.fromEntries(query), festive: query.get('festive') === 'true' });
} catch { /* The default composition is always available. */ }

function showStatus(message) { $('#status').textContent = message; }
function panelsOpen() { return !$('#context-panel').hidden || !$('#about').hidden; }
function reveal() {
  ambient.classList.remove('is-quiet');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!panelsOpen() && !document.hidden && !(keyboardMode && ambient.contains(document.activeElement))) ambient.classList.add('is-quiet');
  }, 6500);
}
function setPanel(id, open, restoreFocus = true) {
  const panel = $(`#${id}`), toggle = $(id === 'about' ? '#about-toggle' : '#settings-toggle');
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) {
    const other = id === 'about' ? 'context-panel' : 'about';
    $(`#${other}`).hidden = true;
    $(other === 'about' ? '#about-toggle' : '#settings-toggle').setAttribute('aria-expanded', 'false');
    panel.querySelector('button, input, select')?.focus({ preventScroll: true });
  } else if (restoreFocus) toggle.focus({ preventScroll: true });
  reveal();
}
function updateLabels(direction) {
  const recipe = direction.recipe;
  $('#clock').textContent = formatHour(recipe.hour);
  $('#clock').dateTime = formatHour(recipe.hour);
  $('#temperature').replaceChildren(document.createTextNode(String(recipe.temperature)), Object.assign(document.createElement('span'), { textContent: '°' }));
  $('#scene-number').textContent = labels[direction.scene][0];
  $('#scene-category').textContent = labels[direction.scene][1];
  $('#scene-title').textContent = direction.title;
  $('#scene-subtitle').textContent = direction.subtitle;
  $('#hour').value = String(Math.round(recipe.hour * 60));
  $('#hour-value').textContent = formatHour(recipe.hour);
  $('#temp').value = String(recipe.temperature);
  $('#temp-value').textContent = `${recipe.temperature}°C`;
  $('#date').value = recipe.date;
  $('#theme').value = recipe.theme;
  $('#festive').checked = recipe.festive;
  $('#reason').textContent = direction.reason + (direction.overridden ? ' Artwork is manually selected.' : '');
  for (const button of document.querySelectorAll('[data-preset]')) {
    const preset = PRESETS[button.dataset.preset];
    const active = Object.keys(preset).every(key => Math.abs(Number(recipe[key]) - Number(preset[key])) < .001 || recipe[key] === preset[key]);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}
function storeRecipe(recipe) {
  try {
    const query = new URLSearchParams(Object.entries(recipe).filter(([key]) => key !== 'version').map(([key, value]) => [key, String(value)]));
    history.replaceState(null, '', `${location.pathname}?${query}`);
  } catch { /* Rendering also works in a browser with restricted history access. */ }
}
async function render() {
  const rev = ++revision;
  const { direction, markup } = buildArtwork(recipe, rev);
  const { seed } = direction.recipe;
  let objectUrl;
  try {
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
    if (parsed.querySelector('parsererror')) throw new Error('The scene could not be drawn.');
    objectUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    const image = new Image(); image.src = objectUrl;
    await image.decode();
    if (rev !== revision) return;
    const layer = document.createElement('div'); layer.className = 'art-frame'; layer.dataset.scene = direction.scene; layer.dataset.seed = String(seed);
    // All markup is built by the three local renderers with validated numeric inputs.
    // No downloaded HTML, arbitrary JSON markup, or model code is executed here.
    layer.innerHTML = markup;
    const previous = currentLayer; currentLayer = layer;
    if (previous) previous.setAttribute('aria-hidden', 'true');
    artwork.append(layer);
    // Force the transparent state to be laid out before revealing the decoded scene.
    layer.getBoundingClientRect();
    layer.classList.add('visible');
    transitioning = true;
    setTimeout(() => { previous?.remove(); if (currentLayer === layer) transitioning = false; }, reducedMotion.matches ? 0 : 1850);
    updateLabels(direction); storeRecipe(direction.recipe);
    showStatus(`${direction.title} ${direction.weekday}, ${formatHour(direction.recipe.hour)}, ${direction.recipe.temperature} degrees Celsius. New composition ready.`);
  } catch (error) {
    showStatus(`${error instanceof Error ? error.message : 'The scene could not be prepared.'} Your current artwork is kept.`);
    if (!currentLayer) $('#scene-subtitle').textContent = 'This scene could not load. Try another moment below.';
  } finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
}
function change(values, debounce = false, silent = false) {
  revision++; // Invalidate any decoding scene immediately, including during debounce.
  recipe = normalizeRecipe({ ...recipe, ...values });
  clearTimeout(renderTimer);
  if (debounce) renderTimer = setTimeout(render, 160);
  else void render();
  if (!silent) reveal();
}

$('#settings-toggle').addEventListener('click', () => setPanel('context-panel', $('#context-panel').hidden));
$('#about-toggle').addEventListener('click', () => setPanel('about', $('#about').hidden));
$('#close-settings').addEventListener('click', () => setPanel('context-panel', false));
$('#close-about').addEventListener('click', () => setPanel('about', false));
for (const button of document.querySelectorAll('[data-preset]')) button.addEventListener('click', () => change({ ...PRESETS[button.dataset.preset], seed: newSeed() }));
$('#hour').addEventListener('input', event => {
  $('#hour-value').textContent = formatHour(Number(event.target.value) / 60);
  change({ hour: Number(event.target.value) / 60 }, true);
});
$('#temp').addEventListener('input', event => {
  $('#temp-value').textContent = `${event.target.value}°C`;
  change({ temperature: Number(event.target.value) }, true);
});
$('#date').addEventListener('change', event => change({ date: event.target.value }));
$('#theme').addEventListener('change', event => change({ theme: event.target.value }));
$('#festive').addEventListener('change', event => change({ festive: event.target.checked }));
$('#new-scene').addEventListener('click', () => change({ seed: newSeed() }));
$('#auto-evolve').addEventListener('change', event => {
  clearInterval(evolveTimer);
  if (event.target.checked) evolveTimer = setInterval(() => {
    if (!document.hidden && !panelsOpen() && !transitioning) change({ seed: newSeed() }, false, true);
  }, 90000);
});
$('#export').addEventListener('click', () => {
  const data = { ...recipe, renderer: 'heartbeat-svg-study-v1', context: 'simulated', locationLabel: 'London' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `heartbeat-${recipe.seed}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showStatus('Scene recipe saved. Its seed and context reproduce this composition.');
});
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await ambient.requestFullscreen();
  } catch { showStatus('Fullscreen is unavailable in this browser view.'); }
}
$('#fullscreen').addEventListener('click', fullscreen);
document.addEventListener('fullscreenchange', () => {
  $('#fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
});
document.addEventListener('pointermove', event => {
  // Only actual pointer movement reveals chrome; an idle mouse must not block it.
  if (!lastPointer || event.clientX !== lastPointer[0] || event.clientY !== lastPointer[1]) reveal();
  lastPointer = [event.clientX, event.clientY];
});
document.addEventListener('pointerdown', () => { keyboardMode = false; reveal(); });
document.addEventListener('focusin', reveal);
document.addEventListener('focusout', reveal);
document.addEventListener('keydown', event => {
  keyboardMode = true;
  reveal();
  if (event.key === 'Escape') { if (!$('#context-panel').hidden) setPanel('context-panel', false); if (!$('#about').hidden) setPanel('about', false); }
  if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(event.target.tagName)) return;
  if (event.key.toLowerCase() === 'n') change({ seed: newSeed() });
  if (event.key.toLowerCase() === 'f') void fullscreen();
  if (event.key.toLowerCase() === 's') setPanel('context-panel', $('#context-panel').hidden);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) reveal(); });
void render(); reveal();
