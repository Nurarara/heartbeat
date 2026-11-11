// Server adapter only. Never import this module into a client component.
// Kie.ai paints the picture; the Cloudflare director still decides what to paint.
import jpeg from 'jpeg-js';
import { finalImagePrompt, type DirectorPacket, type ModelDirection } from '../director-contract.ts';
import { boundedJson, jpegDimensions, ProviderFailure } from './cloudflare.ts';
import { nightQuality } from './night-quality.ts';
import { decodePng, isPng } from './png.ts';

type Fetch = typeof fetch;
type ModelSpec = { promptLimit: number; input: (prompt: string) => Record<string, unknown> };

/** Only models whose request schema has been read and tested. Credits are per image at 1 credit = $0.005. */
export const KIE_MODELS: Record<string, ModelSpec> = {
  // ~0.8 credits. Returns PNG; converted to JPEG below.
  'z-image': { promptLimit: 1000, input: prompt => ({ prompt, aspect_ratio: '16:9', nsfw_checker: true }) },
  // ~3.6 credits at 1K. Returns JPEG directly.
  'seedream/5-5-text-to-image': { promptLimit: 5000, input: prompt => ({ prompt, aspect_ratio: '16:9', size: '1K', output_format: 'jpeg' }) },
};
export const DEFAULT_KIE_MODEL = 'z-image';

type Config = { apiKey: string; model?: string };
type Options = { sleep?: (ms: number, signal?: AbortSignal) => Promise<void>; pollMs?: number; deadlineMs?: number; now?: () => number };
const API = 'https://api.kie.ai/api/v1';
const HINTS = ['credit', 'balance', 'insufficient', 'nsfw', 'sensitive', 'prompt', 'model', 'aspect', 'size', 'timeout'];

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new ProviderFailure('upstream', true));
  const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
  const stop = () => { clearTimeout(timer); reject(new ProviderFailure('upstream', true)); };
  signal?.addEventListener('abort', stop, { once: true });
});

/** Keep the application's comfort constraints intact; shorten the scene at a sentence or word boundary if a model has a smaller prompt limit. */
export function fitPrompt(direction: ModelDirection, packet: DirectorPacket, limit: number): string {
  const full = finalImagePrompt(direction, packet);
  if (full.length <= limit) return full;
  const constraints = full.slice(direction.prompt.length), room = limit - constraints.length;
  if (room < 80) throw new ProviderFailure('configuration', false);
  const scene = direction.prompt.slice(0, room), sentence = scene.lastIndexOf('. ');
  const cut = sentence >= room * .5 ? scene.slice(0, sentence + 1) : scene.slice(0, Math.max(scene.lastIndexOf(' '), 1)).replace(/[,;:\s]+$/, '') + '.';
  return cut + constraints;
}

function failure(kind: ProviderFailure['kind'], retryable: boolean, status?: number, code?: number, text = '') {
  const error = new ProviderFailure(kind, retryable, status, code);
  // Fixed vocabulary only; upstream text can echo the prompt.
  const lower = text.toLowerCase(); error.hints = HINTS.filter(word => lower.includes(word));
  return error;
}

function classify(status: number, code: number | undefined, text: string): ProviderFailure {
  const value = code ?? status;
  if (value === 402) return failure('quota', false, status, code, text);
  if (value === 429) return failure('capacity', true, status, code, text);
  if ([400, 401, 403, 404, 422].includes(value)) return failure('configuration', false, status, code, text);
  return failure('upstream', value >= 500 || value === 408, status, code, text);
}

async function bytesOf(response: Response, maximum: number): Promise<Uint8Array> {
  const reader = response.body?.getReader(); if (!reader) throw new ProviderFailure('invalid-output', false);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new ProviderFailure('invalid-output', false); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/** Converts provider output to the JPEG the rest of Heartbeat stores, checks and serves. */
async function asJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] === 255 && bytes[1] === 216) return bytes;
  if (!isPng(bytes)) throw new ProviderFailure('invalid-output', false);
  try {
    const image = await decodePng(bytes);
    return new Uint8Array(jpeg.encode({ data: image.data, width: image.width, height: image.height }, 90).data);
  } catch { throw new ProviderFailure('invalid-output', false); }
}

/** Requires an explicitly supplied server key. Submits once and never resubmits a paid task on its own. */
export function kieImageProvider(config: Config, fetcher: Fetch = fetch, options: Options = {}) {
  const model = config.model || DEFAULT_KIE_MODEL, spec = KIE_MODELS[model];
  if (!spec || !config.apiKey?.trim() || config.apiKey.length > 4096 || /\s/.test(config.apiKey)) throw new ProviderFailure('configuration', false);
  const sleep = options.sleep || wait, pollMs = options.pollMs ?? 3000, deadlineMs = options.deadlineMs ?? 150000, now = options.now || Date.now;
  const headers = { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };

  async function call(path: string, init: RequestInit, signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(30000);
    let response: Response;
    try { response = await fetcher(`${API}${path}`, { ...init, headers, signal: signal ? AbortSignal.any([signal, timeout]) : timeout }); }
    catch { throw new ProviderFailure('upstream', true); }
    let data: Record<string, unknown>;
    try { data = await boundedJson(response, 256000); }
    catch (error) { if (response.ok) throw error; data = {}; }
    const code = Number.isSafeInteger(data.code) ? data.code as number : undefined;
    if (!response.ok || code !== 200) throw classify(response.status, response.ok ? code : undefined, String(data.msg || ''));
    if (!data.data || typeof data.data !== 'object' || Array.isArray(data.data)) throw new ProviderFailure('invalid-output', false);
    return data.data as Record<string, unknown>;
  }

  return {
    model,
    async generate(direction: ModelDirection, packet: DirectorPacket, signal?: AbortSignal) {
      const prompt = fitPrompt(direction, packet, spec.promptLimit);
      const created = await call('/jobs/createTask', { method: 'POST', body: JSON.stringify({ model, input: spec.input(prompt) }) }, signal);
      const taskId = created.taskId;
      if (typeof taskId !== 'string' || !/^[A-Za-z0-9_.-]{1,200}$/.test(taskId)) throw new ProviderFailure('invalid-output', false);
      const started = now();
      let url: string | undefined;
      while (!url) {
        await sleep(pollMs, signal);
        const record = await call(`/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { method: 'GET' }, signal);
        if (record.state === 'success') {
          let parsed: unknown;
          try { parsed = typeof record.resultJson === 'string' ? JSON.parse(record.resultJson) : record.resultJson; } catch { throw new ProviderFailure('invalid-output', false); }
          const first = (parsed as { resultUrls?: unknown } | null)?.resultUrls;
          const candidate = Array.isArray(first) ? first[0] : undefined;
          if (typeof candidate !== 'string' || candidate.length > 2048 || !URL.canParse(candidate) || new URL(candidate).protocol !== 'https:') throw new ProviderFailure('invalid-output', false);
          url = candidate;
        } else if (record.state === 'fail') {
          throw failure('upstream', false, undefined, Number.isSafeInteger(Number(record.failCode)) ? Number(record.failCode) : undefined, String(record.failMsg || ''));
        } else if (!['waiting', 'queuing', 'generating'].includes(String(record.state))) {
          throw new ProviderFailure('invalid-output', false);
        } else if (now() - started > deadlineMs) {
          const late = new ProviderFailure('upstream', true); late.hints = ['timeout']; throw late;
        }
      }
      // The result host is not Kie's API: never send the key there.
      let download: Response;
      try { download = await fetcher(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000), redirect: 'follow' }); }
      catch { throw new ProviderFailure('upstream', true); }
      if (!download.ok) throw new ProviderFailure('upstream', download.status >= 500, download.status);
      const bytes = await asJpeg(await bytesOf(download, 15_000_000));
      const dimensions = jpegDimensions(bytes);
      if (packet.context.phase === 'night') {
        try { if (!nightQuality(bytes).acceptable) throw new Error('Night art was too bright.'); }
        catch { const dark = new ProviderFailure('invalid-output', false); dark.hints = ['night-light']; throw dark; }
      }
      return { bytes, mime: 'image/jpeg' as const, ...dimensions };
    },
  };
}
