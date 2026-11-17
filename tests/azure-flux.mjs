import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { azureFluxProvider, azureFluxConfigured, azureFluxEndpoint, fluxSize } from '../lib/ai/azure-flux.ts';
import { ProviderFailure } from '../lib/ai/cloudflare.ts';
import { creativePacket } from '../lib/creative.ts';

const ENDPOINT = 'https://heartbeat-ai.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro';
const night = creativePacket({ phase: 'night', season: 'autumn', temperature: 7, weekday: 'Thursday', festive: false }, undefined, 42, Date.now(), []);
const day = creativePacket({ phase: 'day', season: 'summer', temperature: 24, weekday: 'Sunday', festive: false }, undefined, 42, Date.now(), []);
const direction = { action: 'REIMAGINE', title: 'Quiet stars', reason: 'A dark screen suits the evening.', prompt: 'A restrained dark star field with faint points of light.', lighting: 'dark', themeIds: [] };
const dark = await readFile('public/showcase/harbour.jpg'), bright = await readFile('public/showcase/orchard.jpg');

function mock({ image = dark, status = 200, body } = {}) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), ...options });
    if (status !== 200) return new Response(body || 'error', { status });
    return Response.json(body || { created: 1, data: [{ b64_json: Buffer.from(image).toString('base64') }], request_meta: { cost: 3 } });
  };
  return { calls, fetcher };
}

// Endpoint and configuration checks.
assert.ok(azureFluxEndpoint(ENDPOINT));
assert.equal(azureFluxEndpoint('http://heartbeat-ai.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro'), null);
assert.equal(azureFluxEndpoint(`${ENDPOINT}?api-version=preview`), null);
assert.equal(azureFluxEndpoint('https://evil.example.com/providers/blackforestlabs/v1/flux-2-pro'), null);
assert.equal(azureFluxConfigured({ AZURE_IMAGE_ENDPOINT: ENDPOINT, AZURE_IMAGE_KEY: 'k' }), true);
assert.equal(azureFluxConfigured({ AZURE_IMAGE_ENDPOINT: ENDPOINT }), false);
assert.equal(azureFluxConfigured({ AZURE_IMAGE_ENDPOINT: ENDPOINT, AZURE_IMAGE_KEY: 'k', AZURE_IMAGE_MODEL: 'gpt-image' }), false);
assert.throws(() => azureFluxProvider({ endpoint: ENDPOINT, apiKey: '' }), ProviderFailure);
assert.throws(() => azureFluxProvider({ endpoint: 'https://example.com/x', apiKey: 'k' }), ProviderFailure);

// Sizes follow the screen shape, in multiples of 16.
assert.deepEqual(fluxSize(night), { width: 1344, height: 768 });
assert.deepEqual(fluxSize({ ...night, context: { ...night.context, framing: { aspect: 'portrait' } } }), { width: 768, height: 1344 });
for (const aspect of ['portrait', 'square', 'landscape', 'ultrawide']) { const s = fluxSize({ ...night, context: { ...night.context, framing: { aspect } } }); assert.equal(s.width % 16 + s.height % 16, 0); }

// Happy path: one request, the key in the api-key header, a JPEG back with dimensions.
{
  const { calls, fetcher } = mock();
  const image = await azureFluxProvider({ endpoint: ENDPOINT, apiKey: 'secret' }, fetcher).generate(direction, night);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${ENDPOINT}?api-version=preview`);
  assert.equal(calls[0].headers['api-key'], 'secret');
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.model, 'FLUX.2-pro'); assert.equal(sent.output_format, 'jpeg'); assert.equal(sent.width, 1344);
  assert.ok(sent.prompt.startsWith('Very dark night picture'));
  assert.equal(image.mime, 'image/jpeg'); assert.ok(image.width > 0 && image.height > 0); assert.equal(image.dimmed, undefined);
}

// Night pictures that come back bright are rejected, or dimmed when asked.
{
  await assert.rejects(azureFluxProvider({ endpoint: ENDPOINT, apiKey: 'k' }, mock({ image: bright }).fetcher).generate(direction, night), error => error.kind === 'invalid-output' && error.hints.includes('night-light'));
  const rescued = await azureFluxProvider({ endpoint: ENDPOINT, apiKey: 'k', dimTooBright: true }, mock({ image: bright }).fetcher).generate(direction, night);
  assert.equal(rescued.dimmed, true);
  const daytime = await azureFluxProvider({ endpoint: ENDPOINT, apiKey: 'k' }, mock({ image: bright }).fetcher).generate({ ...direction, lighting: 'soft' }, day);
  assert.equal(daytime.dimmed, undefined);
}

// Errors map to provider failures and never leak upstream text.
{
  const run = options => azureFluxProvider({ endpoint: ENDPOINT, apiKey: 'k' }, mock(options).fetcher).generate(direction, night);
  await assert.rejects(run({ status: 401, body: 'Access denied due to invalid subscription key' }), error => error.kind === 'configuration' && !error.retryable && !String(error.message).includes('subscription'));
  await assert.rejects(run({ status: 429, body: 'Rate limit' }), error => error.kind === 'capacity' && error.retryable);
  await assert.rejects(run({ status: 429, body: 'Quota exceeded for this subscription' }), error => error.kind === 'quota' && !error.retryable);
  await assert.rejects(run({ status: 400, body: '{"error":{"code":"content_filter"}}' }), error => error.kind === 'configuration' && error.hints.includes('content'));
  await assert.rejects(run({ status: 503 }), error => error.kind === 'upstream' && error.retryable);
  await assert.rejects(run({ body: { data: [] } }), error => error.kind === 'invalid-output');
  await assert.rejects(run({ body: { data: [{ b64_json: 'not base64!' }] } }), error => error.kind === 'invalid-output');
  await assert.rejects(run({ body: { data: [{ b64_json: Buffer.from('plain text, not an image').toString('base64') }] } }), error => error.kind === 'invalid-output');
  await assert.rejects(azureFluxProvider({ endpoint: ENDPOINT, apiKey: 'k' }, async () => { throw new Error('offline'); }).generate(direction, night), error => error.kind === 'upstream' && error.retryable);
}

console.log('azure flux provider: ok');
