// Server adapter only. Never import this module into a client component.
// It is not exposed by a public route or activated by the default local display.
import { DIRECTOR_SCHEMA, DIRECTOR_SYSTEM, finalImagePrompt, parseModelDirection, type DirectorPacket, type ModelDirection } from '../director-contract.ts';
import { nightQuality } from './night-quality.ts';

type Config = { accountId: string; apiToken: string; directorModel: string; imageModel: string };
type Fetch = typeof fetch;
export class ProviderFailure extends Error {
  kind: 'configuration' | 'quota' | 'capacity' | 'upstream' | 'invalid-output';
  retryable: boolean;
  status?: number;
  code?: number;
  hints?: string[];
  constructor(kind: ProviderFailure['kind'], retryable: boolean, status?: number, code?: number) { super(`Cloudflare ${kind}.`); this.kind = kind; this.retryable = retryable; this.status = status; this.code = code; }
}
function modelPath(model: string) {
  if (!/^@(cf|hf)\/[a-zA-Z0-9_./-]{1,140}$/.test(model) || model.split('/').includes('..')) throw new ProviderFailure('configuration', false);
  return model;
}
async function boundedJson(response: Response, maximum: number): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderFailure('invalid-output', false);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new ProviderFailure('invalid-output', false); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid envelope');
    return data as Record<string, unknown>;
  } catch (error) { if (error instanceof ProviderFailure) throw error; throw new ProviderFailure('invalid-output', false); }
  finally { reader.releaseLock(); }
}
function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 20 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new ProviderFailure('invalid-output', false);
  let at = 2;
  while (at + 4 < bytes.length) {
    if (bytes[at++] !== 255) throw new ProviderFailure('invalid-output', false);
    while (bytes[at] === 255) at++;
    const marker = bytes[at++];
    if (marker === 218 || marker === 217) break;
    if (marker === 1 || marker >= 208 && marker <= 215) continue;
    const size = bytes[at] * 256 + bytes[at + 1];
    if (size < 2 || at + size > bytes.length) break;
    if ([192, 193, 194].includes(marker) && size >= 8) {
      const height = bytes[at + 3] * 256 + bytes[at + 4], width = bytes[at + 5] * 256 + bytes[at + 6];
      if (width < 512 || height < 512 || width > 4096 || height > 4096) break;
      return { width, height };
    }
    at += size;
  }
  throw new ProviderFailure('invalid-output', false);
}

/** Requires explicitly supplied server credentials. No environment discovery, implicit retries or spending. */
export function cloudflareProvider(config: Config, fetcher: Fetch = fetch) {
  if (!/^[a-f0-9]{32}$/i.test(config.accountId) || !config.apiToken.trim() || config.apiToken.length > 4096) throw new ProviderFailure('configuration', false);
  const director = modelPath(config.directorModel), image = modelPath(config.imageModel);
  if (image !== '@cf/black-forest-labs/flux-1-schnell') throw new ProviderFailure('configuration', false);
  async function run(model: string, body: object, limit: number, signal?: AbortSignal) {
    const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${model}`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
    });
    let data: Record<string, unknown>;
    try { data = await boundedJson(response, limit); }
    catch (error) { if (response.ok) throw error; data = {}; }
    if (!response.ok || data.success !== true) {
      const errors = Array.isArray(data.errors) ? data.errors as { code?: number }[] : [];
      const code = Number.isSafeInteger(errors[0]?.code) ? errors[0].code : undefined;
      const errorText = JSON.stringify(data.errors || []).toLowerCase();
      if (code === 8007 && /json|schema/.test(errorText)) throw new ProviderFailure('invalid-output', false, response.status, code);
      if (response.status === 429 && code === 3036) throw new ProviderFailure('quota', false, response.status, code);
      if (response.status === 429) throw new ProviderFailure('capacity', true, response.status, code);
      if ([400, 401, 403, 404].includes(response.status)) {
        const failure = new ProviderFailure('configuration', false, response.status, code);
        // Fixed vocabulary only; upstream error text can echo submitted content.
        failure.hints = ['schema', 'json', 'uniqueitems', 'maxlength', 'minlength', 'permission', 'authentication', 'paid', 'terms', 'model', 'account', 'queue', 'unsupported', 'invalid'].filter(word => errorText.includes(word));
        throw failure;
      }
      throw new ProviderFailure('upstream', response.status >= 500 || response.status === 408, response.status, code);
    }
    if (!data.result || typeof data.result !== 'object' || Array.isArray(data.result)) throw new ProviderFailure('invalid-output', false);
    return data.result as Record<string, unknown>;
  }
  return {
    async direct(packet: DirectorPacket, options: { signal?: AbortSignal; mustReimagine?: boolean } = {}): Promise<ModelDirection> {
      const content = JSON.stringify(packet);
      if (content.length > 24000) throw new Error('Director context is too large.');
      // Avoid the provider's constrained-schema compiler; validate the full contract locally.
      const system = `${DIRECTOR_SYSTEM}\nRespect context.preferredStyle when supplied, while still varying subjects and composition. Use context.weather to shape atmosphere and lighting. Rain, fog or overcast conditions call for subdued light, softened distance or sheltered comfort rather than defaulting to a bright summer sky. Express this creatively across varied subjects and places; do not repeat the same rainy window. Unknown weather stays unknown. Nighttime darkness always takes priority. For themeIds use exact supplied theme id values only, without duplicates; use an empty array if unsure.\nReturn a JSON object matching this schema: ${JSON.stringify(DIRECTOR_SCHEMA)}${options.mustReimagine ? '\nThis request requires REIMAGINE; HOLD is not permitted.' : ''}`;
      const result = await run(director, { messages: [{ role: 'system', content: system }, { role: 'user', content }], max_tokens: 900, temperature: .8, stream: false, response_format: { type: 'json_object' } }, 128000, options.signal);
      let value: unknown = result.response;
      try {
        if (typeof value === 'string') value = JSON.parse(value);
        // Theme IDs are optional bookkeeping, not part of the image prompt. Discard
        // unrecognized or repeated labels rather than losing a valid scene; never
        // invent memory entries. Keep malformed arrays and HOLD decisions strict.
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const candidate = value as Record<string, unknown>;
          if (candidate.action === 'REIMAGINE' && Array.isArray(candidate.themeIds) && candidate.themeIds.length <= 21 && candidate.themeIds.every(id => typeof id === 'string')) {
            const allowed = new Set(packet.inspiration.flatMap(item => item.themes.map(theme => theme.id)));
            value = { ...candidate, themeIds: [...new Set(candidate.themeIds.filter(id => allowed.has(id)))] };
          }
        }
        return parseModelDirection(value, packet, options.mustReimagine);
      }
      catch (error) {
        const failure=new ProviderFailure('invalid-output',false);
        const explanation=error instanceof Error?error.message.toLowerCase():'';
        failure.hints=[typeof value==='string'?'director-json':'director-contract',...['theme','framing','night','hold','response'].filter(word=>explanation.includes(word))];
        const candidate=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
        console.warn('Heartbeat director validation rejected',{hints:failure.hints,titleLength:typeof candidate?.title==='string'?candidate.title.length:null,reasonLength:typeof candidate?.reason==='string'?candidate.reason.length:null,promptLength:typeof candidate?.prompt==='string'?candidate.prompt.length:null,promptLimit:packet.rules.maximumPromptCharacters,themeCount:Array.isArray(candidate?.themeIds)?candidate.themeIds.length:null});
        throw failure;
      }
    },
    async generate(direction: ModelDirection, packet: DirectorPacket, signal?: AbortSignal) {
      // FLUX schnell documents prompt/steps. Seed and landscape dimensions are not promised.
      const prompt = finalImagePrompt(direction, packet);
      const result = await run(image, { prompt, steps: 4 }, 12_000_000, signal);
      if (typeof result.image !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.image) || result.image.length > 11_000_000 || result.image.length % 4 !== 0) throw new ProviderFailure('invalid-output', false);
      const raw = atob(result.image), bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
      const dimensions = jpegDimensions(bytes);
      if(packet.context.phase==='night') {
        try {if(!nightQuality(bytes).acceptable)throw new Error('Night art was too bright.');}
        catch {const failure=new ProviderFailure('invalid-output',false);failure.hints=['night-light'];throw failure;}
      }
      return { bytes, mime: 'image/jpeg' as const, ...dimensions };
    },
  };
}
