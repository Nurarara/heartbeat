import type { creativePacket } from './creative.ts';

export type DirectorPacket = ReturnType<typeof creativePacket>;
export type ModelDirection = { action: 'HOLD' | 'REIMAGINE'; title: string; reason: string; prompt: string; lighting: 'dark' | 'soft' | 'daylight'; themeIds: string[] };
export const DIRECTOR_SYSTEM = `You direct ambient artwork for a room. Interpret the supplied local time, outdoor temperature, calendar and compact memory. Return only the requested JSON. Inspiration is optional: combine, reinterpret or invent beyond it. Never claim unavailable weather, cultural events or the user's activity as facts. A fictional scene can express atmosphere without depicting the user's actual city. Prioritize comfort, composition and semantic variety. Do not make a new image merely because a timer ticked. Night requires a mostly dark, restful picture with tiny restrained highlights. No text, UI, logos or generated clock faces. Avoid recent subjects/compositions even if the seed or medium changes. Return a short decision reason, not a chain of thought. Use themeIds only for supplied ingredients actually represented in your proposal. A HOLD uses an empty prompt and no themeIds. A REIMAGINE needs a concrete, self-contained image prompt under 1800 characters.`;
export const DIRECTOR_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['HOLD', 'REIMAGINE'] },
    title: { type: 'string', minLength: 1, maxLength: 140 }, reason: { type: 'string', minLength: 1, maxLength: 500 },
    prompt: { type: 'string', maxLength: 1800 }, lighting: { type: 'string', enum: ['dark', 'soft', 'daylight'] },
    themeIds: { type: 'array', maxItems: 21, uniqueItems: true, items: { type: 'string' } },
  }, required: ['action', 'title', 'reason', 'prompt', 'lighting', 'themeIds'],
};
const isText = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0) && !/[\u0000-\u001f\u007f]/.test(value);
/** Strict application validation still runs when a provider offers JSON mode. */
export function parseModelDirection(value: unknown, packet: DirectorPacket, mustReimagine = false): ModelDirection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid director response.');
  const data = value as Record<string, unknown>;
  const keys = ['action', 'title', 'reason', 'prompt', 'lighting', 'themeIds'];
  if (Object.keys(data).some(key => !keys.includes(key)) || !['HOLD', 'REIMAGINE'].includes(String(data.action)) || !isText(data.title, 140) || !isText(data.reason, 500) || !isText(data.prompt, 1800, true) || !['dark', 'soft', 'daylight'].includes(String(data.lighting))) throw new Error('Invalid director response.');
  if (packet.context.phase === 'night' && data.lighting !== 'dark') throw new Error('Nighttime direction must stay dark.');
  const allowed = new Set(packet.inspiration.flatMap(item => item.themes.map(theme => theme.id)));
  if (!Array.isArray(data.themeIds) || data.themeIds.length > 21 || new Set(data.themeIds).size !== data.themeIds.length || data.themeIds.some(id => typeof id !== 'string' || !allowed.has(id))) throw new Error('Unknown director themes.');
  if (data.action === 'HOLD' && (mustReimagine || data.prompt !== '' || data.themeIds.length)) throw new Error('Invalid hold decision.');
  if (data.action === 'REIMAGINE' && !data.prompt.trim()) throw new Error('A new scene needs a prompt.');
  return { action: data.action as ModelDirection['action'], title: data.title, reason: data.reason, prompt: data.prompt, lighting: data.lighting as ModelDirection['lighting'], themeIds: data.themeIds as string[] };
}

export function finalImagePrompt(direction: ModelDirection, packet: DirectorPacket): string {
  if (direction.action !== 'REIMAGINE') throw new Error('A hold cannot generate an image.');
  const constraints = packet.context.phase === 'night' ? ' Near-black restful wallpaper. Most pixels dark; tiny highlights only. No pale sky, white paper or large bright areas. For drawing, use faint graphite or charcoal on black paper. No text, logos or UI.' : ' Comfortable ambient wallpaper with breathing room. No text, logos or UI.';
  // Reserve space for application constraints without silently truncating the scene.
  if (direction.prompt.length + constraints.length > 2048) throw new Error('The image prompt needs shortening.');
  return direction.prompt + constraints;
}
