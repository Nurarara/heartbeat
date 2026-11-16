import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INGREDIENTS, INGREDIENT_GROUPS, drawIngredients, ingredientWeight, validateIngredients, findTheme } from '../lib/ingredients.ts';
import { MOODS, MOOD_IDS, parseMood } from '../lib/moods.ts';
import { creativePacket, emptyCreativeMemory, parseCreativeMemory, rememberCreativeDisplay, recordCreativeFeedback, directorFingerprint } from '../lib/creative.ts';
import { parseModelDirection, directorGuidance, directorSchema, finalImagePrompt, imageLead, requiresDark, withScreenFraming, DIRECTOR_SCHEMA } from '../lib/director-contract.ts';
import { parseStoryMemory, rememberMoment, planMoment } from '../lib/ambient-director.ts';
import { cloudflareProvider, ProviderFailure } from '../lib/ai/cloudflare.ts';
import { kieImageProvider, fitPrompt, KIE_MODELS } from '../lib/ai/kie.ts';
import { dimForNight, lightProblem, nightQuality } from '../lib/ai/night-quality.ts';
import { skyCue } from '../lib/sky.ts';
import { parsePreferences, withMood } from '../lib/ambient.ts';

const HOUR = 3_600_000, at = Date.parse('2026-06-21T12:00:00Z');
const london = { name: 'London', country: 'United Kingdom', timezone: 'Europe/London', latitude: 51.5074, longitude: -0.1278 };
const day = { phase: 'day', season: 'summer', temperature: 22, weekday: 'Sunday', festive: false }, night = { ...day, phase: 'night', temperature: 9 };

// --- The library: big, varied and well-formed.
assert.equal(validateIngredients(), true);
assert.deepEqual([...new Set(INGREDIENTS.map(item => item.category))], [...INGREDIENT_GROUPS]);
for (const group of INGREDIENT_GROUPS) assert.ok(INGREDIENTS.filter(item => item.category === group).length >= 45, `${group} has about 50 words`);
for (const label of ['a fountain pen', 'inside a black hole', 'a moon of Jupiter', 'pencil drawing', 'upside-down gravity', 'shades of black']) assert.ok(INGREDIENTS.some(item => item.label === label), label);
assert.equal(new Set(INGREDIENTS.map(item => item.id)).size, INGREDIENTS.length);
assert.equal(findTheme('w-place-inside-a-black-hole').category, 'place'); assert.equal(findTheme('place-japanese-home').category, 'place'); assert.equal(findTheme('nope'), undefined);

// --- Draws: one word per group; random, but the same seed and time repeat exactly.
const first = drawIngredients(undefined, 42, at);
assert.deepEqual(first.map(word => word.group), [...INGREDIENT_GROUPS]);
assert.deepEqual(drawIngredients(undefined, 42, at), first, 'Same seed, same draw');
assert.notDeepEqual(drawIngredients(undefined, 43, at), first, 'A different seed draws differently');
const seen = new Set(); for (let seed = 1; seed <= 400; seed++) for (const word of drawIngredients(undefined, seed, at)) seen.add(word.id);
assert.ok(seen.size > 300, `400 draws reach most of the library (${seen.size} of ${INGREDIENTS.length})`);
assert.ok(new Set(Array.from({ length: 200 }, (_, seed) => drawIngredients(undefined, seed + 1, at).map(word => word.id).join('|'))).size === 200, 'No two of 200 draws are the same combination');

// --- Recently used words are down-weighted (bounded creative memory, no growing history).
const fox = INGREDIENTS.find(item => item.label === 'a red fox'), frequency = (memory, id, when) => { let hits = 0; for (let seed = 1; seed <= 3000; seed++) if (drawIngredients(memory, seed, when).some(word => word.id === id)) hits++; return hits; };
let memory = emptyCreativeMemory();
const proposalOf = ids => ({ version: 1, id: 'idea-test', fingerprint: directorFingerprint(ids.map(findTheme), 'a brief'), title: 'T', prompt: 'P', themes: ids.map(id => { const theme = findTheme(id); return { id: theme.id, category: theme.category, label: theme.label }; }), fallbackScene: 'room', lighting: 'daylight', source: 'ai-director', score: 0 });
for (let i = 0; i < 3; i++) memory = rememberCreativeDisplay(memory, undefined, at - HOUR + i, proposalOf([fox.id]));
assert.equal(memory.usage[fox.id].count, 3);
const fresh = frequency(undefined, fox.id, at), recent = frequency(memory, fox.id, at), later = frequency(memory, fox.id, at + 48 * HOUR);
assert.ok(fresh > 35 && fresh < 90, `an unused word appears about once in 50 draws (${fresh}/3000)`);
assert.ok(recent < fresh / 4, `a word used in the last day is strongly down-weighted (${recent} vs ${fresh})`);
assert.ok(later > recent && later < fresh, `the effect fades after a day but frequent words stay rarer (${later})`);
assert.ok(ingredientWeight(fox, memory, at) < ingredientWeight(fox, undefined, at) / 8);
// Taste feedback shifts the odds too, and unknown words are refused.
const liked = recordCreativeFeedback(undefined, proposalOf([fox.id]), 'more'), disliked = recordCreativeFeedback(undefined, proposalOf([fox.id]), 'less');
assert.ok(ingredientWeight(fox, liked, at) > 1 && ingredientWeight(fox, disliked, at) < 1);
// Memory stays bounded however many different words are shown, and still parses.
let busy = emptyCreativeMemory();
for (let i = 0; i < INGREDIENTS.length; i += 5) busy = rememberCreativeDisplay(busy, undefined, at + i, proposalOf(INGREDIENTS.slice(i, i + 5).map(item => item.id)));
assert.equal(Object.keys(busy.usage).length, 120, 'Only the 120 most recently used words are remembered');
assert.ok(busy.usage[INGREDIENTS.at(-1).id] && !busy.usage[INGREDIENTS[0].id], 'The oldest words are the ones forgotten');
assert.deepEqual(parseCreativeMemory(JSON.parse(JSON.stringify(busy)), at + 1000).usage, busy.usage);
assert.equal(parseCreativeMemory({ ...emptyCreativeMemory(), usage: { 'w-place-not-real': { count: 1, lastAt: 1 } } }, at), null);

// --- Light safety filters only: darkness forbids bright palettes; Sleep forbids high-energy twists.
const tagsOf = id => INGREDIENTS.find(item => item.id === id).tags, drawn = (options, group) => Array.from({ length: 500 }, (_, seed) => drawIngredients(undefined, seed + 1, at, options).find(word => word.group === group).id);
assert.ok(drawn({}, 'palette').some(id => tagsOf(id).includes('bright')), 'Daytime may draw bright palettes');
assert.ok(drawn({ dark: true }, 'palette').every(id => !tagsOf(id).includes('bright')), 'Night never draws a bright palette');
assert.ok(drawn({ dark: true }, 'palette').every(id => tagsOf(id).includes('dark')), 'Darkness draws only dark palettes: pale ones make night pictures too bright');
assert.ok(new Set(drawn({ dark: true }, 'palette')).size >= 12, 'There is still real variety among dark palettes');
assert.ok(drawn({}, 'twist').some(id => tagsOf(id).includes('energetic')));
assert.ok(drawn({ mood: 'sleep', dark: true }, 'twist').every(id => !tagsOf(id).includes('energetic')), 'Sleep never draws a high-energy twist');
const share = (ids, tag) => ids.filter(id => tagsOf(id).includes(tag)).length / ids.length;
assert.ok(share(drawn({ mood: 'romantic' }, 'palette'), 'red') > 2 * share(drawn({}, 'palette'), 'red'), 'Romantic leans to reds');
assert.ok(share(drawn({ mood: 'dreamy' }, 'twist'), 'surreal') > share(drawn({}, 'twist'), 'surreal'), 'Dreamy leans to surreal twists');
assert.ok(share(drawn({ mood: 'playful' }, 'twist'), 'energetic') > 2 * share(drawn({}, 'twist'), 'energetic'), 'Playful leans to energetic twists');
// No strict compatibility rules: every place can meet every style, subject and object.
assert.ok(new Set(Array.from({ length: 3000 }, (_, seed) => { const words = drawIngredients(undefined, seed + 1, at); return `${words[2].id}|${words[3].id}`; })).size > 1500);

// --- The packet: a draw, the mood and the sky travel to the director; the old packet is unchanged.
const plain = creativePacket(day, undefined, 7, at, []);
assert.equal(plain.draw, undefined); assert.equal(plain.mood, undefined); assert.equal(plain.inspiration.length, 3); assert.equal(directorSchema(plain), DIRECTOR_SCHEMA); assert.equal(directorGuidance(plain), '');
const packet = creativePacket({ ...day, mood: 'dreamy', sky: skyCue(london, at, 20) }, undefined, 7, at, [], [], { ingredients: true });
assert.equal(packet.draw.length, 7); assert.equal(packet.rules.minimumDrawnWords, 2); assert.equal(packet.mood.id, 'dreamy'); assert.equal(packet.context.sky.stage, 'high-sun'); assert.equal(packet.inspiration.length, 1);
assert.deepEqual(creativePacket({ ...day, mood: 'dreamy' }, undefined, 7, at, [], [], { ingredients: true }).draw, packet.draw, 'Reproducible through the packet');
assert.ok(JSON.stringify(packet).length < 12000, 'The packet stays small');

// --- The director contract: at least two drawn words, and it must say which.
const used = packet.draw.map(word => word.id), direction = { action: 'REIMAGINE', title: 'A scene', reason: 'It fits.', prompt: 'A picture built from the drawn words.', lighting: 'daylight', themeIds: [] };
assert.deepEqual(parseModelDirection({ ...direction, usedWords: used.slice(0, 2) }, packet).usedWords, used.slice(0, 2));
assert.equal(parseModelDirection({ ...direction, usedWords: used }, packet).usedWords.length, 7);
assert.throws(() => parseModelDirection({ ...direction, usedWords: used.slice(0, 1) }, packet), /at least two drawn words/);
assert.throws(() => parseModelDirection({ ...direction, usedWords: [] }, packet), /at least two drawn words/);
assert.throws(() => parseModelDirection(direction, packet), /Unknown drawn words/, 'The director must say which words it used');
assert.throws(() => parseModelDirection({ ...direction, usedWords: [used[0], 'w-place-outer-space-x'] }, packet), /Unknown drawn words/);
assert.throws(() => parseModelDirection({ ...direction, usedWords: [used[0], used[0]] }, packet), /Unknown drawn words/, 'Repeats do not count twice');
const other = INGREDIENTS.find(item => !used.includes(item.id)).id;
assert.throws(() => parseModelDirection({ ...direction, usedWords: [used[0], other] }, packet), /Unknown drawn words/, 'Only words from this draw count');
assert.deepEqual(parseModelDirection({ action: 'HOLD', title: 'Hold', reason: 'Steady.', prompt: '', lighting: 'daylight', themeIds: [], usedWords: [] }, packet).usedWords, []);
assert.throws(() => parseModelDirection({ action: 'HOLD', title: 'Hold', reason: 'Steady.', prompt: '', lighting: 'daylight', themeIds: [], usedWords: used.slice(0, 2) }, packet), /hold/);
assert.throws(() => parseModelDirection({ ...direction, usedWords: used.slice(0, 2) }, plain), /Invalid director response/, 'Packets without a draw keep the old strict contract');
assert.deepEqual(Object.keys(parseModelDirection(direction, plain)), ['action', 'title', 'reason', 'prompt', 'lighting', 'themeIds']);
const schema = directorSchema(packet);
assert.deepEqual(schema.required.at(-1), 'usedWords'); assert.deepEqual(schema.properties.usedWords.items.enum, used);

// --- Every mood changes the director's instructions; auto adds none.
const guidanceFor = mood => directorGuidance(creativePacket({ ...day, mood }, undefined, 7, at, [], [], { ingredients: true }));
assert.doesNotMatch(guidanceFor('auto'), /Mood:/); assert.match(guidanceFor('auto'), /MUST clearly use at least 2 of the drawn words/); assert.match(guidanceFor('auto'), /MAY replace one drawn word/);
const texts = new Set();
for (const id of MOOD_IDS.filter(id => id !== 'auto')) { const text = guidanceFor(id); assert.ok(text.includes(`Mood: ${MOODS[id].instruction}`), id); assert.match(text, /night darkness always wins over mood/); texts.add(text); }
assert.equal(texts.size, 7, 'Seven moods, seven different instruction sets');
for (const id of MOOD_IDS) { const mood = MOODS[id]; assert.ok(mood.label && /^#[0-9a-f]{6}$/.test(mood.colour) && mood.crossfadeMs >= 1000 && mood.brightnessCeiling > 0 && mood.brightnessCeiling <= 1, id); }
assert.ok(MOODS.sleep.crossfadeMs > MOODS.romantic.crossfadeMs && MOODS.romantic.crossfadeMs > MOODS.auto.crossfadeMs && MOODS.playful.crossfadeMs < MOODS.auto.crossfadeMs, 'Fade speed follows the mood');
assert.equal(parseMood('romantic'), 'romantic'); assert.equal(parseMood('RAGE'), 'auto'); assert.equal(parseMood(undefined), 'auto'); assert.equal(parseMood(7), 'auto');
assert.match(directorGuidance(packet), /Sky: context\.sky describes the real sun, moon and cloud/);

// --- Brightness limits: Sleep is dark all day; Romantic is dim; night always wins.
const sleep = creativePacket({ ...day, mood: 'sleep' }, undefined, 7, at, [], [], { ingredients: true }), romantic = creativePacket({ ...day, mood: 'romantic' }, undefined, 7, at, [], [], { ingredients: true });
const two = p => ({ usedWords: p.draw.slice(0, 2).map(word => word.id) });
assert.equal(requiresDark(sleep), true); assert.equal(sleep.rules.requiredLighting, 'dark');
assert.throws(() => parseModelDirection({ ...direction, ...two(sleep) }, sleep), /must stay dark/);
assert.equal(parseModelDirection({ ...direction, lighting: 'dark', ...two(sleep) }, sleep).lighting, 'dark');
assert.match(finalImagePrompt({ ...direction, lighting: 'dark' }, sleep), /Near-black restful wallpaper/);
assert.equal(requiresDark(romantic), false); assert.equal(romantic.rules.maximumLighting, 'soft'); assert.equal(romantic.rules.maximumMeanLight, .5);
assert.throws(() => parseModelDirection({ ...direction, ...two(romantic) }, romantic), /soft or dark lighting/);
assert.equal(parseModelDirection({ ...direction, lighting: 'soft', ...two(romantic) }, romantic).lighting, 'soft');
assert.match(finalImagePrompt({ ...direction, lighting: 'soft' }, romantic), /Dim, low-key ambient wallpaper/);
assert.match(directorGuidance(romantic), /must be "soft" or "dark", never "daylight"/); assert.match(directorGuidance(sleep), /must be "dark"/);
const playfulNight = creativePacket({ ...night, mood: 'playful' }, undefined, 7, at, [], [], { ingredients: true });
assert.equal(requiresDark(playfulNight), true, 'Night darkness wins over a bright mood');
assert.throws(() => parseModelDirection({ ...direction, ...two(playfulNight) }, playfulNight), /must stay dark/);
assert.ok(playfulNight.draw.every(word => !tagsOf(word.id).includes('bright')));
// Twilight from the real sky dims a daytime phase, then darkens it.
const twilight = creativePacket({ ...day, phase: 'dusk', sky: skyCue(london, Date.parse('2026-06-21T20:35:00Z')) }, undefined, 7, at, [], [], { ingredients: true });
assert.equal(twilight.rules.maximumLighting, 'soft'); assert.equal(twilight.rules.maximumMeanLight, .62);
assert.equal(requiresDark(creativePacket({ ...day, phase: 'dusk', sky: skyCue(london, Date.parse('2026-06-21T21:40:00Z')) }, undefined, 7, at, [])), true);
assert.equal(creativePacket({ ...day, sky: skyCue(london, at) }, undefined, 7, at, []).rules.maximumLighting, undefined);
// The pixel check that enforces it: real JPEGs, a bright orchard and a dark harbour.
const bright = new Uint8Array(await readFile('public/showcase/orchard.jpg')), dim = new Uint8Array(await readFile('public/showcase/harbour.jpg'));
assert.equal(lightProblem(bright, false), null, 'An ordinary day has no brightness limit');
assert.equal(lightProblem(bright, true), 'night-light'); assert.equal(lightProblem(dim, true), null);
assert.equal(lightProblem(bright, false, .5), 'mood-light'); assert.equal(lightProblem(dim, false, .5), null);
assert.equal(lightProblem(new Uint8Array([1, 2, 3]), false, .5), 'mood-light', 'An unreadable picture never passes a limit');
const painted = packetFor => kieImageProvider({ apiKey: 'k' }, async url => String(url).includes('createTask') ? Response.json({ code: 200, data: { taskId: 't1' } }) : String(url).includes('recordInfo') ? Response.json({ code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://files.example.test/a.jpg'] }) } }) : new Response(bright), { sleep: async () => {}, pollMs: 0 }).generate({ ...direction, lighting: packetFor === sleep ? 'dark' : 'soft' }, packetFor);
await assert.rejects(painted(sleep), error => error instanceof ProviderFailure && error.hints.includes('night-light'), 'Sleep rejects a bright picture even at midday');
await assert.rejects(painted(romantic), error => error.hints.includes('mood-light'));
assert.equal((await kieImageProvider({ apiKey: 'k' }, async url => String(url).includes('createTask') ? Response.json({ code: 200, data: { taskId: 't1' } }) : String(url).includes('recordInfo') ? Response.json({ code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://files.example.test/a.jpg'] }) } }) : new Response(dim), { sleep: async () => {}, pollMs: 0 }).generate({ ...direction, lighting: 'soft' }, romantic)).mime, 'image/jpeg');
// Darkness is stated first in the image prompt as well as last, and the director is told how to keep drawn words dark.
const nightPacket = creativePacket({ ...night, mood: 'dreamy' }, undefined, 7, at, [], [], { ingredients: true }), darkDirection = { ...direction, lighting: 'dark' };
assert.match(finalImagePrompt(darkDirection, nightPacket), /^Very dark night picture, almost entirely black.*A picture built from the drawn words\. Near-black restful wallpaper/);
assert.equal(imageLead(packet), ''); assert.doesNotMatch(finalImagePrompt(direction, packet), /Very dark/);
assert.match(directorGuidance(nightPacket), /Darkness comes first\. Open the prompt by describing a near-black picture/); assert.doesNotMatch(directorGuidance(packet), /Darkness comes first/);
assert.match(directorGuidance(packet), /Three or four that truly belong together/); assert.match(directorGuidance(packet), /do not mention the draw or the words/);
// The longest prompt the director may write always fits, on every screen shape, with the lead included.
for (const framing of [undefined, { width: 390, height: 844, aspect: 'portrait' }, { width: 3440, height: 1440, aspect: 'ultrawide' }]) {
  const framed = withScreenFraming(nightPacket, framing), longest = finalImagePrompt({ ...darkDirection, prompt: 'x'.repeat(framed.rules.maximumPromptCharacters) }, framed);
  assert.ok(longest.length <= 2048 && longest.startsWith('Very dark night picture'), `budget for ${framing?.aspect || 'default'}`);
}
assert.ok(finalImagePrompt({ ...darkDirection, prompt: 'x'.repeat(1800) }, { ...nightPacket, rules: { ...nightPacket.rules, maximumPromptCharacters: 1800 } }).startsWith('x'), 'A prompt planned before the lead existed still works');
const nightFit = fitPrompt({ ...darkDirection, prompt: 'A lantern-lit harbour at midnight with faint reflections. '.repeat(25).trim() }, nightPacket, KIE_MODELS['z-image'].promptLimit);
assert.ok(nightFit.length <= 1000 && nightFit.startsWith('Very dark night picture') && /reflections\. Near-black restful wallpaper/.test(nightFit), 'Z-Image prompts keep both the lead and the closing constraints');
// A paid picture that comes back too bright can be dimmed instead of thrown away (opt-in).
const rescued = dimForNight(bright, true);
assert.ok(rescued && rescued[0] === 255 && rescued[1] === 216, 'The dimmed picture is a JPEG'); assert.equal(lightProblem(rescued, true), null);
assert.ok(nightQuality(rescued).samples.every(sample => sample.acceptable && sample.mean < .25));
assert.equal(lightProblem(dimForNight(bright, false, .5), false, .5), null, 'A dim mood limit can be met the same way');
assert.equal(dimForNight(new Uint8Array([1, 2, 3]), true), null, 'An unreadable picture cannot be rescued');
const kieWith = options => kieImageProvider({ apiKey: 'k', ...options }, async url => String(url).includes('createTask') ? Response.json({ code: 200, data: { taskId: 't1' } }) : String(url).includes('recordInfo') ? Response.json({ code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://files.example.test/a.jpg'] }) } }) : new Response(bright), { sleep: async () => {}, pollMs: 0 });
const kept = await kieWith({ dimTooBright: true }).generate(darkDirection, nightPacket);
assert.equal(kept.dimmed, true); assert.equal(lightProblem(kept.bytes, true), null); assert.equal(kept.width, 1024);
await assert.rejects(kieWith({}).generate(darkDirection, nightPacket), error => error.hints.includes('night-light'), 'Without the option a too-bright night picture is still rejected');
const dimKept = await kieImageProvider({ apiKey: 'k', dimTooBright: true }, async url => String(url).includes('createTask') ? Response.json({ code: 200, data: { taskId: 't1' } }) : String(url).includes('recordInfo') ? Response.json({ code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://files.example.test/a.jpg'] }) } }) : new Response(dim), { sleep: async () => {}, pollMs: 0 }).generate(darkDirection, nightPacket);
assert.equal('dimmed' in dimKept, false, 'A picture that is already dark enough is left untouched');
// Prompts still fit the smallest image model, constraints intact.
const long = { ...direction, lighting: 'soft', prompt: 'A velvet theatre of candle smoke and plum shadow. '.repeat(30).trim() };
const fitted = fitPrompt(long, romantic, KIE_MODELS['z-image'].promptLimit); assert.ok(fitted.length <= 1000); assert.match(fitted, /Dim, low-key ambient wallpaper/);

// --- The real Cloudflare adapter: instructions sent, bookkeeping cleaned, contract enforced. Network mocked.
const calls = []; let answer;
const provider = cloudflareProvider({ accountId: 'a'.repeat(32), apiToken: 'test-only', directorModel: '@cf/test/text', imageModel: '@cf/black-forest-labs/flux-1-schnell' }, async (url, options) => { calls.push(JSON.parse(options.body)); return Response.json({ success: true, result: { response: answer } }); });
answer = { ...direction, usedWords: [used[0], 'made-up-word', used[1], used[0]] };
assert.deepEqual((await provider.direct(packet)).usedWords, [used[0], used[1]], 'Unknown and repeated ids are dropped, real ones kept');
const system = calls[0].messages[0].content;
assert.match(system, /MUST clearly use at least 2 of the drawn words/); assert.ok(system.includes(MOODS.dreamy.instruction)); assert.match(system, /"usedWords"/); assert.ok(system.includes(used[3]));
assert.ok(JSON.parse(calls[0].messages[1].content).draw.length === 7 && JSON.parse(calls[0].messages[1].content).context.sky.sun);
answer = { ...direction, usedWords: [used[0], 'made-up-word'] };
await assert.rejects(provider.direct(packet), error => error instanceof ProviderFailure && error.kind === 'invalid-output' && error.hints.includes('words'), 'One real word is not enough');
answer = JSON.stringify({ ...direction, usedWords: used.slice(2, 5) });
assert.equal((await provider.direct(packet)).usedWords.length, 3);

// --- Shown pictures remember their words: stored, validated on reload, and down-weighted next time.
const baseline = planMoment(london, null, at, null, 99, { force: true }).direction, id = '11111111-2222-4333-8444-555555555555';
const themes = used.slice(0, 3).map(findTheme), proposal = { ...packet.inspiration[0], source: 'ai-director', id: `idea-${id}`, fingerprint: directorFingerprint(themes, direction.prompt), title: direction.title, prompt: direction.prompt, themes: themes.map(({ id: themeId, label, category }) => ({ id: themeId, label, category })), lighting: 'daylight' };
const story = rememberMoment(null, { ...baseline, id: `generated-${id}`, reason: 'It fits.', artwork: { attemptId: id, url: `/api/ai/art/${id}`, title: direction.title, proposal } }, at);
const reloaded = parseStoryMemory(JSON.stringify(story), london, at + 1000);
assert.ok(reloaded, 'A picture built from drawn words survives a reload');
assert.deepEqual(reloaded.history[0].direction.artwork.proposal.themes.map(theme => theme.id), used.slice(0, 3));
assert.equal(reloaded.creative.usage[used[0]].count, 1);
const tampered = JSON.parse(JSON.stringify(story)); tampered.history[0].direction.artwork.proposal.themes[0].label = 'something else';
assert.equal(parseStoryMemory(JSON.stringify(tampered), london, at + 1000), null, 'A stored word must match the library exactly');
const next = creativePacket({ ...day, mood: 'dreamy' }, reloaded.creative, 7, at + 1000, [], [], { ingredients: true });
assert.ok(ingredientWeight(INGREDIENTS.find(item => item.id === used[0]), reloaded.creative, at + 1000, { mood: 'dreamy' }) < ingredientWeight(INGREDIENTS.find(item => item.id === used[0]), undefined, at + 1000, { mood: 'dreamy' }) / 4);
assert.equal(next.draw.length, 7);

// --- Mood is a saved preference; auto is simply no mood, so older records stay valid.
const prefs = { version: 1, location: london, seed: 42, unit: 'c', reducedMotion: false };
assert.equal(parsePreferences(JSON.stringify(prefs)).mood, undefined);
assert.equal(parsePreferences(JSON.stringify({ ...prefs, mood: 'cosy' })).mood, 'cosy');
assert.equal(parsePreferences(JSON.stringify({ ...prefs, mood: 'auto' })).mood, undefined);
assert.equal(parsePreferences(JSON.stringify({ ...prefs, mood: 'furious' })), null, 'Unknown moods are refused, not guessed');
assert.deepEqual(withMood({ ...prefs, mood: 'cosy' }, 'auto'), prefs); assert.equal(withMood(prefs, 'focus').mood, 'focus');
console.log('Passed ingredient engine and moods: 350 words in 7 groups, seeded reproducible draws, recent-word down-weighting in bounded memory, light safety filters only, director contract requiring two declared drawn words, per-mood instructions and palette/twist weights, Sleep/Romantic/twilight brightness limits with pixel checks, prompt budgets, remembered words and saved mood preference. Providers mocked; no AI calls.');
