import { THEME_LIBRARY, type ThemeCategory, type ThemeEntry } from './creative-library.ts';
import type { SceneId } from './ambient-director.ts';
import { weatherInspiration, type WeatherCue } from './weather-mood.ts';

export type CreativeContext = { phase: 'morning' | 'day' | 'dusk' | 'night'; season: string; temperature: number | null; weekday: string; festive: boolean; localDate?: string; localTime?: string; weather?: WeatherCue; preferredStyle?:string };
export type CreativeProposal = {
  version: 1; id: string; fingerprint: string; title: string; prompt: string;
  themes: { id: string; category: ThemeCategory; label: string }[];
  fallbackScene: SceneId; lighting: 'dark' | 'soft' | 'daylight';
  source: 'local-sampler' | 'ai-director'; score: number;
};
export type CreativeMemory = {
  version: 1; displayed: number;
  usage: Record<string, { count: number; lastAt: number }>;
  recent: { fingerprint: string; at: number }[];
  coverage: number[];
  feedback: Record<string, { more: number; less: number }>;
};
const CATEGORIES: ThemeCategory[] = ['place', 'subject', 'activity', 'object', 'material', 'style', 'viewpoint'];
const SCENES: SceneId[] = ['room', 'city', 'cosmos', 'meadow', 'lake', 'coast'];
const IDS = new Set([...THEME_LIBRARY.map(item => item.id), ...SCENES.map(scene => `scene:${scene}`)]);
const MAX_COUNT = 1_000_000_000;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;
export const emptyCreativeMemory = (): CreativeMemory => ({ version: 1, displayed: 0, usage: {}, recent: [], coverage: [], feedback: {} });

/** Long-term memory stores bounded counters and compact concepts, never a growing conversation. */
export function parseCreativeMemory(value: unknown, now: number): CreativeMemory | null {
  if (!record(value) || value.version !== 1 || !count(value.displayed) || !record(value.usage) || !record(value.feedback) || !Array.isArray(value.recent) || value.recent.length > 64) return null;
  if (!Number.isFinite(now) || Object.keys(value.usage).length > IDS.size || Object.keys(value.feedback).length > THEME_LIBRARY.length) return null;
  const coverage = value.coverage === undefined ? [] : value.coverage;
  if (!Array.isArray(coverage) || ![0, 2048].includes(coverage.length) || coverage.some(item => !count(item))) return null;
  const usage: CreativeMemory['usage'] = {}, feedback: CreativeMemory['feedback'] = {};
  for (const [id, item] of Object.entries(value.usage)) {
    if (!IDS.has(id) || !record(item) || !count(item.count) || !item.count || typeof item.lastAt !== 'number' || !Number.isFinite(item.lastAt) || item.lastAt < 0 || item.lastAt > now) return null;
    usage[id] = { count: item.count, lastAt: item.lastAt };
  }
  for (const [id, item] of Object.entries(value.feedback)) {
    if (!IDS.has(id) || id.startsWith('scene:') || !record(item) || !count(item.more) || !count(item.less)) return null;
    feedback[id] = { more: item.more, less: item.less };
  }
  const recent: CreativeMemory['recent'] = [];
  for (const item of value.recent) {
    if (!record(item) || typeof item.fingerprint !== 'string' || !/^[a-z0-9|\-]{1,400}$/.test(item.fingerprint) || typeof item.at !== 'number' || !Number.isFinite(item.at) || item.at < 0 || item.at > now || recent.length && item.at < recent.at(-1)!.at) return null;
    recent.push({ fingerprint: item.fingerprint, at: item.at });
  }
  return { version: 1, displayed: value.displayed, usage, recent, coverage: [...coverage], feedback };
}

function baseAt(memory: CreativeMemory | undefined, at: number): CreativeMemory {
  if (!Number.isFinite(at) || at < 0) throw new RangeError('A creative memory update needs a valid timestamp.');
  const source = memory || emptyCreativeMemory();
  return { ...source, usage: Object.fromEntries(Object.entries(source.usage).map(([id, item]) => [id, { ...item, lastAt: Math.min(at, item.lastAt) }])), recent: source.recent.filter(item => item.at <= at), feedback: { ...source.feedback } };
}

/** Call once after display. Free SVGs record their real family, not an unrendered proposal. */
export function rememberCreativeDisplay(memory: CreativeMemory | undefined, scene: SceneId | undefined, at: number, realized?: CreativeProposal): CreativeMemory {
  const next = baseAt(memory, at);
  next.displayed = Math.min(MAX_COUNT, next.displayed + 1);
  const ids = [...(scene ? [`scene:${scene}`] : []), ...(realized?.themes.map(theme => theme.id) || [])];
  for (const id of new Set(ids)) {
    if (!IDS.has(id)) throw new Error('Unknown creative theme.');
    next.usage[id] = { count: Math.min(MAX_COUNT, (next.usage[id]?.count || 0) + 1), lastAt: at };
  }
  if (realized) {
    next.recent = [...next.recent, { fingerprint: realized.fingerprint, at }].slice(-64);
    // A fixed-size approximate count sketch remembers coverage beyond recent
    // records. Collisions are possible; this is a diversity hint, not proof of uniqueness.
    next.coverage = next.coverage.length ? [...next.coverage] : Array(2048).fill(0);
    const bucket = hash(realized.fingerprint) % 2048;
    next.coverage[bucket] = Math.min(MAX_COUNT, next.coverage[bucket] + 1);
  }
  return next;
}

/** Feedback expresses taste about a proposal; it never claims that proposal was displayed. */
export function recordCreativeFeedback(memory: CreativeMemory | undefined, proposal: CreativeProposal, preference: 'more' | 'less'): CreativeMemory {
  const next = { ...(memory || emptyCreativeMemory()), feedback: { ...memory?.feedback } };
  for (const theme of proposal.themes) {
    if (!IDS.has(theme.id) || theme.id.startsWith('scene:')) throw new Error('Unknown creative theme.');
    const value = next.feedback[theme.id] || { more: 0, less: 0 };
    next.feedback[theme.id] = { ...value, [preference]: Math.min(MAX_COUNT, value[preference] + 1) };
  }
  return next;
}

function hash(value: string): number {
  let number = 2166136261;
  for (const character of value) number = Math.imul(number ^ character.charCodeAt(0), 16777619);
  return number >>> 0;
}
function random(seed: number) {
  let value = seed || 1;
  return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 0x1_0000_0000; };
}
function fits(entry: ThemeEntry, context: CreativeContext, tags: Set<string>) {
  return (!entry.phases || entry.phases.includes(context.phase))
    && (!entry.requires || entry.requires.every(tag => tags.has(tag)))
    && (!entry.excludes || !entry.excludes.some(tag => tags.has(tag)));
}
function weight(entry: ThemeEntry, context: CreativeContext, memory: CreativeMemory, at: number, guided: boolean) {
  if (!guided) return 1;
  let value = 1;
  const usage = memory.usage[entry.id];
  if (usage) value /= (1 + Math.log2(1 + usage.count)) * (at - usage.lastAt < 24 * 3_600_000 ? 3 : 1);
  if (entry.fallbackScene) value /= 1 + Math.log2(1 + (memory.usage[`scene:${entry.fallbackScene}`]?.count || 0)) / 3;
  if (entry.temperature) value *= context.temperature === null ? .7 : (entry.temperature === 'cold' ? context.temperature < 10 : context.temperature >= 22) ? 2.5 : .3;
  const taste = memory.feedback[entry.id];
  if (taste) value *= Math.max(.25, Math.min(3, (1 + taste.more / 4) / (1 + taste.less / 4)));
  return value;
}

export function validateThemeLibrary(library: readonly ThemeEntry[] = THEME_LIBRARY): boolean {
  const ids = new Set<string>();
  for (const item of library) {
    if (!/^[a-z][a-z0-9-]{1,80}$/.test(item.id) || ids.has(item.id) || !CATEGORIES.includes(item.category) || !item.label.trim() || item.label.length > 140 || !Array.isArray(item.tags) || item.fallbackScene && !SCENES.includes(item.fallbackScene)) return false;
    ids.add(item.id);
  }
  return CATEGORIES.every(category => library.some(item => item.category === category));
}

/** Sample compatible ingredients. A different seed alone is not evidence of visual novelty. */
export function proposeCreativeMoment(context: CreativeContext, memory: CreativeMemory | undefined, seed: number, at: number, options: { guided?: boolean } = {}): CreativeProposal {
  if (!validateThemeLibrary()) throw new Error('The theme library is invalid.');
  const remembered = memory || emptyCreativeMemory(), guided = options.guided !== false;
  const rand = random(hash(`${seed}|${at}|${context.phase}|${context.temperature}|${context.weekday}`));
  const candidates: CreativeProposal[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const tags = new Set<string>(), selected: ThemeEntry[] = [];
    for (const category of CATEGORIES) {
      const eligible = THEME_LIBRARY.filter(entry => entry.category === category && fits(entry, context, tags));
      if (!eligible.length) throw new Error(`No compatible ${category} in the theme library.`);
      const weights = eligible.map(entry => weight(entry, context, remembered, at, guided));
      let pick = rand() * weights.reduce((sum, value) => sum + value, 0);
      const entry = eligible.find((_, index) => { pick -= weights[index]; return pick < 0; }) || eligible[0];
      selected.push(entry); entry.tags.forEach(tag => tags.add(tag));
    }
    const label = (category: ThemeCategory) => selected.find(item => item.category === category)!.label;
    // Material/colour/style changes alone cannot make the same composition novel.
    const fingerprint = selected.filter(item => ['place', 'subject', 'activity', 'viewpoint'].includes(item.category)).map(item => item.id).join('|');
    const repeated = remembered.recent.some(item => item.fingerprint === fingerprint);
    const novelty = selected.reduce((sum, item) => sum + 1 / (1 + (remembered.usage[item.id]?.count || 0)), 0) / selected.length;
    const lighting = context.phase === 'night' ? 'dark' : context.phase === 'dusk' ? 'soft' : 'daylight';
    const thermal = (context.temperature === null ? 'Outdoor temperature is unavailable; do not invent a measured temperature.' : `The selected city's outdoor estimate is ${context.temperature} degrees Celsius; express its feeling subtly.`) + ' ' + weatherInspiration(context.weather);
    const illumination = lighting === 'dark' ? 'Keep most of the image dark and restful, with tiny restrained highlights. No bright sky, large white regions or intense lights.' : lighting === 'soft' ? 'Soft evening light, restrained contrast and subtle warm accents.' : 'Gentle local daylight, balanced exposure and comfortable contrast.';
    const prompt = `Create one coherent ambient wallpaper, composed to work when cropped to a wide screen. Setting: ${label('place')}. Subject: ${label('subject')}. Activity: ${label('activity')}. A supporting detail: ${label('object')}. Material or surface emphasis: ${label('material')}. Medium: ${label('style')}. Viewpoint: ${label('viewpoint')}. ${illumination} ${thermal} Local context: ${context.weekday}, ${context.phase}, ${context.season}. These are fictional scene ideas, not a report of weather or events. ${context.festive ? 'Optional restrained year-end decoration is permitted.' : 'No holiday decorations.'} Keep a calm composition and breathing room for the clock. No text, logos, clock faces or UI.`;
    const coverage = remembered.coverage[hash(fingerprint) % 2048] || 0;
    candidates.push({ version: 1, id: `idea-${hash(`${seed}|${at}|${fingerprint}|${attempt}`).toString(36)}`, fingerprint, title: `${label('place')} — ${label('activity')}`, themes: selected.map(({ id, category, label: title }) => ({ id, category, label: title })), fallbackScene: selected[0].fallbackScene || 'room', lighting, source: 'local-sampler', prompt, score: novelty - (guided && repeated ? 10 : 0) - (guided ? Math.min(5, coverage) * 2 : 0) });
    if (!guided) break;
  }
  return candidates.sort((a, b) => b.score - a.score)[0];
}

/** A small reusable request packet; it contains no running chat transcript or credentials. */
export function creativePacket(context: CreativeContext, memory: CreativeMemory | undefined, seed: number, at: number, recentScenes: SceneId[], recentArtwork: { title: string; summary: string; phase: string }[] = []) {
  const remembered = memory || emptyCreativeMemory();
  return {
    version: 1, context,
    rules: { requiredLighting: context.phase === 'night' ? 'dark' : 'appropriate to local phase', noText: true, maximumPromptCharacters: 1800, memoryCommitsAfterDisplay: true },
    memory: {
      displayed: remembered.displayed, recentScenes: recentScenes.slice(-12),
      recentArtwork: recentArtwork.slice(-6).map(item => ({ title: item.title.slice(0, 140), summary: item.summary.slice(0, 350), phase: item.phase.slice(0, 10) })),
      frequent: Object.entries(remembered.usage).sort((a, b) => b[1].count - a[1].count).slice(0, 12).map(([id, value]) => ({ id, count: value.count })),
      recentConcepts: remembered.recent.slice(-8).map(item => item.fingerprint),
      preferences: Object.entries(remembered.feedback).slice(-16).map(([id, taste]) => ({ id, ...taste })),
    },
    inspiration: [0, 1, 2].map(offset => proposeCreativeMoment(context, memory, seed + offset * 997, at)),
  };
}
