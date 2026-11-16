import type { creativePacket } from './creative.ts';
import type {ScreenFraming} from './screen-profile.ts';

type CreativePacket=ReturnType<typeof creativePacket>;
export type DirectorPacket = Omit<CreativePacket,'context'> & {context:CreativePacket['context']&{framing?:ScreenFraming}};
export type ModelDirection = { action: 'HOLD' | 'REIMAGINE'; title: string; reason: string; prompt: string; lighting: 'dark' | 'soft' | 'daylight'; themeIds: string[];
  /** Ids of the randomly drawn words the scene really uses. Present only when the packet carried a draw. */
  usedWords?: string[] };
export const DIRECTOR_SYSTEM = `You direct ambient artwork for a room. Interpret the supplied local time, outdoor temperature, calendar and compact memory. Return only the requested JSON. Inspiration is optional: combine, reinterpret or invent beyond it. Never claim unavailable weather, cultural events or the user's activity as facts. A fictional scene can express atmosphere without depicting the user's actual city. Prioritize comfort, composition and semantic variety. If context.framing is supplied, compose for that coarse viewport shape, keeping the important subject within a central crop-safe area. Portrait or ultrawide framing overrides generic wide-screen inspiration. These dimensions describe presentation, not guaranteed image resolution. Do not make a new image merely because a timer ticked or the screen resized. Night requires a mostly dark, restful picture with tiny restrained highlights. No text, UI, logos or generated clock faces. Avoid recent subjects/compositions even if the seed or medium changes. Return a short decision reason, not a chain of thought. Use themeIds only for supplied ingredients actually represented in your proposal. A HOLD uses an empty prompt and no themeIds. A REIMAGINE needs a concrete, self-contained image prompt within rules.maximumPromptCharacters and under 1800 characters.`;
export const DIRECTOR_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['HOLD', 'REIMAGINE'] },
    title: { type: 'string', minLength: 1, maxLength: 140 }, reason: { type: 'string', minLength: 1, maxLength: 500 },
    prompt: { type: 'string', maxLength: 1800 }, lighting: { type: 'string', enum: ['dark', 'soft', 'daylight'] },
    themeIds: { type: 'array', maxItems: 21, uniqueItems: true, items: { type: 'string' } },
  }, required: ['action', 'title', 'reason', 'prompt', 'lighting', 'themeIds'],
};
/** True when the picture must be near-black: local night, a dark mood, or a sun well below the horizon. */
export const requiresDark = (packet: DirectorPacket) => packet.context.phase === 'night' || packet.rules.maximumLighting === 'dark';
/** With a random draw in the packet, the director must also report which drawn words it used. */
export function directorSchema(packet: DirectorPacket) {
  if (!packet.draw?.length) return DIRECTOR_SCHEMA;
  return { ...DIRECTOR_SCHEMA, properties: { ...DIRECTOR_SCHEMA.properties, usedWords: { type: 'array', minItems: 0, maxItems: packet.draw.length, uniqueItems: true, items: { type: 'string', enum: packet.draw.map(word => word.id) } } }, required: [...DIRECTOR_SCHEMA.required, 'usedWords'] };
}
/** Extra director instructions for the ingredient draw, the chosen mood and the real sky. */
export function directorGuidance(packet: DirectorPacket): string {
  const lines: string[] = [];
  if (packet.draw?.length) lines.push(`Random draw: packet.draw holds one randomly drawn word per group (subject, object, place, style, twist, viewpoint, palette). Build the picture from them. A REIMAGINE MUST clearly use at least ${packet.rules.minimumDrawnWords ?? 2} of the drawn words. Three or four that truly belong together make a stronger picture than all of them crowded in; leave out the ones that do not fit. You MAY replace one drawn word if it truly clashes with the moment, the mood or night darkness. Reason about how the words can belong together in one coherent, beautiful scene for this exact moment; never just list them, and prefer the surprising reading over the safe one. The draw takes priority over inspiration. In usedWords, list the exact id of every drawn word your prompt really uses; a HOLD uses an empty usedWords. In reason, say in one plain sentence why this scene suits this time, weather and mood; do not mention the draw or the words.`);
  if (packet.draw?.length && requiresDark(packet)) lines.push('Darkness comes first. Open the prompt by describing a near-black picture, then the scene. Put every drawn style on a black ground (white or silver line on black, chalk on a blackboard, a single dim lamp) and treat any drawn colour as a few small glowing accents, never as a pale or bright background. No white paper, pale mist, bright sky or glowing fog.');
  if (packet.mood) lines.push(`Mood: ${packet.mood.instruction} The mood guides the feeling; the real time, weather and sky still shape the scene, and night darkness always wins over mood.`);
  if (packet.context.sky) lines.push('Sky: context.sky describes the real sun, moon and cloud right now in plain words. Let the light direction, shadow length and sky colour follow it. If the scene has no visible sky (indoors, underwater, deep space), carry its light and colour through instead. Show the moon only as described.');
  if (packet.rules.maximumLighting === 'soft') lines.push('Lighting now must be "soft" or "dark", never "daylight": keep the picture dim and low-key.');
  else if (packet.rules.maximumLighting === 'dark' && packet.context.phase !== 'night') lines.push('Lighting now must be "dark": a near-black, restful picture with tiny highlights, as at night.');
  return lines.join('\n');
}
const isText = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0) && !/[\u0000-\u001f\u007f]/.test(value);
/** Strict application validation still runs when a provider offers JSON mode. */
export function parseModelDirection(value: unknown, packet: DirectorPacket, mustReimagine = false): ModelDirection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid director response.');
  const data = value as Record<string, unknown>;
  const drawn = packet.draw?.length ? packet.draw : null;
  const keys = ['action', 'title', 'reason', 'prompt', 'lighting', 'themeIds', ...(drawn ? ['usedWords'] : [])];
  if (Object.keys(data).some(key => !keys.includes(key)) || !['HOLD', 'REIMAGINE'].includes(String(data.action)) || !isText(data.title, 140) || !isText(data.reason, 500) || !isText(data.prompt, 1800, true) || !['dark', 'soft', 'daylight'].includes(String(data.lighting))) throw new Error('Invalid director response.');
  if (requiresDark(packet) && data.lighting !== 'dark') throw new Error('Nighttime direction must stay dark.');
  if (packet.rules.maximumLighting === 'soft' && data.lighting === 'daylight') throw new Error('This moment needs soft or dark lighting, not daylight.');
  const allowed = new Set(packet.inspiration.flatMap(item => item.themes.map(theme => theme.id)));
  if (!Array.isArray(data.themeIds) || data.themeIds.length > 21 || new Set(data.themeIds).size !== data.themeIds.length || data.themeIds.some(id => typeof id !== 'string' || !allowed.has(id))) throw new Error('Unknown director themes.');
  if (data.action === 'HOLD' && (mustReimagine || data.prompt !== '' || data.themeIds.length)) throw new Error('Invalid hold decision.');
  if (data.action === 'REIMAGINE' && (!data.prompt.trim()||data.prompt.length>packet.rules.maximumPromptCharacters)) throw new Error('A new scene needs a prompt within the framing budget.');
  let usedWords: string[] | undefined;
  if (drawn) {
    const ids = new Set(drawn.map(word => word.id)), used = data.usedWords;
    if (!Array.isArray(used) || used.length > drawn.length || new Set(used).size !== used.length || used.some(id => typeof id !== 'string' || !ids.has(id))) throw new Error('Unknown drawn words.');
    if (data.action === 'HOLD' && used.length) throw new Error('Invalid hold decision.');
    if (data.action === 'REIMAGINE' && used.length < (packet.rules.minimumDrawnWords ?? 2)) throw new Error('A new scene must use at least two drawn words.');
    usedWords = used as string[];
  }
  return { action: data.action as ModelDirection['action'], title: data.title, reason: data.reason, prompt: data.prompt, lighting: data.lighting as ModelDirection['lighting'], themeIds: data.themeIds as string[], ...(usedWords ? { usedWords } : {}) };
}

/** Image models weigh the start of a prompt most, so darkness is stated first as well as last. */
const DARK_LEAD='Very dark night picture, almost entirely black, low-key lighting and deep shadow. ';
export const imageLead=(packet:DirectorPacket)=>requiresDark(packet)?DARK_LEAD:'';
function imageConstraints(packet:DirectorPacket):string {
  const constraints = requiresDark(packet) ? ' Near-black restful wallpaper. Most pixels dark; tiny highlights only. No pale sky, white paper or large bright areas. For drawing, use faint graphite or charcoal on black paper. No text, logos or UI.'
    : packet.rules.maximumLighting === 'soft' ? ' Dim, low-key ambient wallpaper: deep shade and rich colour, only small soft light sources. No bright sky or large pale areas. No text, logos or UI.'
    : ' Comfortable ambient wallpaper with breathing room. No text, logos or UI.';
  const framing=packet.context.framing;
  if(!framing)return constraints;
  const shape=framing.aspect==='portrait'?'a tall portrait crop':framing.aspect==='ultrawide'?'an ultrawide panoramic crop':framing.aspect==='square'?'a near-square crop':'a landscape crop';
  return `${constraints} Compose for ${shape}; keep the main subject central, with generous space around it and no essential details at the edges.`;
}
/** Framing is persisted job input; it does not grant resolution, funding or a refresh. */
export function withScreenFraming(packet:CreativePacket,framing:ScreenFraming|null|undefined):DirectorPacket {
  if(!framing)return packet;
  const result:DirectorPacket={...packet,context:{...packet.context,framing},rules:{...packet.rules}};
  result.rules.maximumPromptCharacters=Math.min(packet.rules.maximumPromptCharacters,2048-imageConstraints(result).length-imageLead(result).length);
  return result;
}
export function finalImagePrompt(direction: ModelDirection, packet: DirectorPacket): string {
  if (direction.action !== 'REIMAGINE') throw new Error('A hold cannot generate an image.');
  const constraints=imageConstraints(packet);
  // Reserve space for application constraints without silently truncating the scene.
  if (direction.prompt.length + constraints.length > 2048) throw new Error('The image prompt needs shortening.');
  // The lead is dropped rather than failing a prompt planned before it existed.
  const lead=imageLead(packet);
  return (direction.prompt.length + constraints.length + lead.length > 2048 ? '' : lead) + direction.prompt + constraints;
}
