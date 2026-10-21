import assert from 'node:assert/strict';
import { THEME_LIBRARY } from '../lib/creative-library.ts';
import { creativePacket, emptyCreativeMemory, parseCreativeMemory, proposeCreativeMoment, recordCreativeFeedback, rememberCreativeDisplay, validateThemeLibrary } from '../lib/creative.ts';
import { finalImagePrompt, parseModelDirection } from '../lib/director-contract.ts';

const now = Date.parse('2026-10-15T08:00:00Z');
const context = { phase: 'morning', season: 'autumn', temperature: 5, weekday: 'Thursday', festive: false };
assert.equal(validateThemeLibrary(), true);
assert.ok(THEME_LIBRARY.length >= 70);
assert.equal(validateThemeLibrary([...THEME_LIBRARY, THEME_LIBRARY[0]]), false);
const idea = proposeCreativeMoment(context, undefined, 42, now);
assert.deepEqual(proposeCreativeMoment(context, undefined, 42, now), idea);
assert.equal(idea.themes.length, 7);
assert.ok(idea.prompt.length < 2048);
assert.match(idea.prompt, /fictional scene ideas/);
assert.equal(emptyCreativeMemory().displayed, 0, 'Planning is not display');
let memory = emptyCreativeMemory();
const concepts = new Set();
for (let step = 0; step < 500; step++) {
  const at = now + step * 3600000;
  const phase = ['morning', 'day', 'dusk', 'night'][step % 4];
  const local = { ...context, phase, temperature: step % 7 === 0 ? null : step % 3 ? 5 : 29 };
  const proposal = proposeCreativeMoment(local, memory, step + 42, at);
  const tags = new Set();
  for (const theme of proposal.themes) {
    const entry = THEME_LIBRARY.find(item => item.id === theme.id);
    assert.ok(entry);
    assert.ok(!entry.requires || entry.requires.every(tag => tags.has(tag)), entry.id);
    assert.ok(!entry.excludes || !entry.excludes.some(tag => tags.has(tag)), entry.id);
    assert.ok(!entry.phases || entry.phases.includes(phase), entry.id);
    entry.tags.forEach(tag => tags.add(tag));
  }
  if (phase === 'night') { assert.equal(proposal.lighting, 'dark'); assert.match(proposal.prompt, /most of the image dark/); }
  if (local.temperature === null) assert.match(proposal.prompt, /temperature is unavailable/);
  assert.ok(!memory.recent.some(item => item.fingerprint === proposal.fingerprint), 'Recent semantic composition is avoided');
  assert.ok(proposal.prompt.length <= 2048);
  concepts.add(proposal.fingerprint);
  memory = rememberCreativeDisplay(memory, proposal.fallbackScene, at, proposal);
  assert.ok(memory.recent.length <= 64);
  assert.ok(Object.keys(memory.usage).length <= THEME_LIBRARY.length + 6);
  assert.deepEqual(parseCreativeMemory(JSON.parse(JSON.stringify(memory)), at), memory);
}
assert.ok(concepts.size > 450);
assert.equal(memory.displayed, 500);
const restored = JSON.stringify(memory);
const feedback = recordCreativeFeedback(memory, idea, 'less');
assert.equal(feedback.displayed, memory.displayed);
assert.equal(feedback.recent.length, memory.recent.length);
assert.equal(JSON.stringify(memory), restored, 'Feedback does not mutate old memory');
assert.equal(feedback.feedback[idea.themes[0].id].less, 1);
const svg = rememberCreativeDisplay(undefined, 'room', now);
assert.equal(svg.usage['scene:room'].count, 1);
assert.equal(svg.recent.length, 0, 'SVG fallback cannot claim an unrendered idea was displayed');
assert.equal(Object.keys(svg.usage).length, 1);
assert.equal(parseCreativeMemory({ ...svg, usage: { unknown: { count: 1, lastAt: now } } }, now), null);
assert.equal(parseCreativeMemory({ ...svg, displayed: -1 }, now), null);
assert.equal(parseCreativeMemory({ ...svg, recent: Array(65).fill({ fingerprint: 'x', at: now }) }, now), null);
const corrected = rememberCreativeDisplay(memory, 'coast', now - 1000);
assert.deepEqual(parseCreativeMemory(corrected, now - 1000), corrected);

const packet = creativePacket({ ...context, phase: 'night' }, memory, 42, now + 501 * 3600000, ['room', 'city']);
assert.ok(JSON.stringify(packet).length < 24000);
assert.equal(packet.memory.recentConcepts.length, 8);
assert.equal(packet.memory.frequent.length, 12);
const direction = { action: 'REIMAGINE', title: 'A dark coastal pause', reason: 'A restful view suits local night.', prompt: 'A dark coast with distant warm windows and ample open space.', lighting: 'dark', themeIds: packet.inspiration[0].themes.map(item => item.id) };
assert.deepEqual(parseModelDirection(direction, packet), direction);
assert.match(finalImagePrompt(direction, packet), /Near-black restful wallpaper/);
assert.throws(() => parseModelDirection({ ...direction, lighting: 'daylight' }, packet));
assert.throws(() => parseModelDirection({ ...direction, themeIds: ['made-up'] }, packet));
assert.throws(() => parseModelDirection({ ...direction, extra: true }, packet));
assert.throws(() => parseModelDirection({ ...direction, prompt: 'x'.repeat(2049) }, packet));
const hold = { ...direction, action: 'HOLD', prompt: '', themeIds: [] };
assert.equal(parseModelDirection(hold, packet).action, 'HOLD');
assert.throws(() => parseModelDirection(hold, packet, true));
assert.throws(() => finalImagePrompt(hold, packet));
console.log(`Passed ${THEME_LIBRARY.length} library entries, 500 compatible sampled scenes (${concepts.size} semantic compositions), bounded long-term memory, honest SVG history, preference feedback and model contracts.`);
