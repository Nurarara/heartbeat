// Server adapter only. Never import this module into a client component.
// FLUX.2 on Microsoft Foundry paints the picture; the Cloudflare director still decides what to paint.
// Billed to the Azure subscription ("Direct from Azure"), so Azure credits pay for it.
import { finalImagePrompt, requiresDark, type DirectorPacket, type ModelDirection } from '../director-contract.ts';
import { jpegDimensions, ProviderFailure } from './cloudflare.ts';
import { asJpeg, bytesOf } from './kie.ts';
import { dimForNight, lightProblem } from './night-quality.ts';

type Fetch = typeof fetch;
type Config = {
  /** The deployment's endpoint from the Foundry portal, for example
   * https://<resource>.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro */
  endpoint: string; apiKey: string; model?: string;
  /** When a picture that must be dark comes back too bright, dim it instead of discarding a paid picture. */
  dimTooBright?: boolean;
};
export const AZURE_FLUX_MODELS = ['FLUX.2-pro', 'FLUX.2-flex'] as const;
export const DEFAULT_AZURE_FLUX_MODEL = 'FLUX.2-pro';
const HINTS = ['quota', 'content', 'filter', 'safety', 'moderat', 'prompt', 'size', 'deployment', 'timeout'];

/** Accepts only an https Foundry/Azure AI endpoint for a Black Forest Labs deployment. */
export function azureFluxEndpoint(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 300 || !URL.canParse(value)) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  if (!/^[a-z0-9-]{2,64}\.(services\.ai\.azure\.com|cognitiveservices\.azure\.com|openai\.azure\.com)$/.test(url.hostname)) return null;
  if (!/^\/providers\/blackforestlabs\/v1\/[a-z0-9.-]{2,40}$/.test(url.pathname)) return null;
  return url;
}
export const azureFluxConfigured = (env: { AZURE_IMAGE_ENDPOINT?: string; AZURE_IMAGE_KEY?: string; AZURE_IMAGE_MODEL?: string }) =>
  !!env.AZURE_IMAGE_KEY?.trim() && !!azureFluxEndpoint(env.AZURE_IMAGE_ENDPOINT) && (!env.AZURE_IMAGE_MODEL || (AZURE_FLUX_MODELS as readonly string[]).includes(env.AZURE_IMAGE_MODEL));

/** About one megapixel in the screen's shape; FLUX.2 wants sides that are multiples of 16. */
export function fluxSize(packet: DirectorPacket): { width: number; height: number } {
  const aspect = packet.context.framing?.aspect;
  return aspect === 'portrait' ? { width: 768, height: 1344 } : aspect === 'ultrawide' ? { width: 1536, height: 640 } : aspect === 'square' ? { width: 1024, height: 1024 } : { width: 1344, height: 768 };
}

function failure(kind: ProviderFailure['kind'], retryable: boolean, status?: number, text = '') {
  const error = new ProviderFailure(kind, retryable, status);
  // Fixed vocabulary only; upstream text can echo the prompt.
  const lower = text.toLowerCase(); error.hints = HINTS.filter(word => lower.includes(word));
  return error;
}

/** Requires an explicitly supplied server key. One request per picture; it never retries a paid call on its own. */
export function azureFluxProvider(config: Config, fetcher: Fetch = fetch) {
  const endpoint = azureFluxEndpoint(config.endpoint), model = config.model || DEFAULT_AZURE_FLUX_MODEL;
  if (!endpoint || !(AZURE_FLUX_MODELS as readonly string[]).includes(model) || !config.apiKey?.trim() || config.apiKey.length > 4096 || /\s/.test(config.apiKey)) throw new ProviderFailure('configuration', false);
  endpoint.searchParams.set('api-version', 'preview');
  return {
    model,
    async generate(direction: ModelDirection, packet: DirectorPacket, signal?: AbortSignal) {
      const prompt = finalImagePrompt(direction, packet), size = fluxSize(packet);
      let response: Response;
      try {
        response = await fetcher(endpoint.href, {
          method: 'POST', headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, ...size, output_format: 'jpeg' }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
        });
      } catch { throw new ProviderFailure('upstream', true); }
      if (!response.ok) {
        let text = ''; try { text = new TextDecoder().decode(await bytesOf(response, 20000)); } catch { /* status is enough */ }
        const status = response.status;
        if (status === 429) throw failure(/quota|insufficient|credit|exceed/i.test(text) ? 'quota' : 'capacity', !/quota|insufficient|credit/i.test(text), status, text);
        if ([400, 401, 403, 404, 422].includes(status)) throw failure('configuration', false, status, text);
        throw failure('upstream', status >= 500 || status === 408, status, text);
      }
      let data: unknown;
      try { data = JSON.parse(new TextDecoder().decode(await bytesOf(response, 30_000_000))); } catch { throw new ProviderFailure('invalid-output', false); }
      const encoded = (data as { data?: { b64_json?: unknown }[] } | null)?.data?.[0]?.b64_json;
      if (typeof encoded !== 'string' || encoded.length > 28_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4) throw new ProviderFailure('invalid-output', false);
      let bytes = await asJpeg(Uint8Array.from(atob(encoded), character => character.charCodeAt(0))), dimmed = false;
      const dimensions = jpegDimensions(bytes);
      const light = lightProblem(bytes, requiresDark(packet), packet.rules.maximumMeanLight);
      if (light) {
        const rescued = config.dimTooBright ? dimForNight(bytes, requiresDark(packet), packet.rules.maximumMeanLight) : null;
        if (!rescued) { const dim = new ProviderFailure('invalid-output', false); dim.hints = [light]; throw dim; }
        bytes = rescued; dimmed = true;
      }
      return { bytes, mime: 'image/jpeg' as const, ...dimensions, ...(dimmed ? { dimmed: true } : {}) };
    },
  };
}
