import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deflateSync, crc32 } from 'node:zlib';
import jpeg from 'jpeg-js';
import { kieImageProvider, fitPrompt, KIE_MODELS } from '../lib/ai/kie.ts';
import { ProviderFailure } from '../lib/ai/cloudflare.ts';
import { decodePng } from '../lib/ai/png.ts';
import { creativePacket } from '../lib/creative.ts';

const night = creativePacket({ phase: 'night', season: 'autumn', temperature: 7, weekday: 'Thursday', festive: false }, undefined, 42, Date.now(), []);
const day = creativePacket({ phase: 'day', season: 'summer', temperature: 24, weekday: 'Sunday', festive: false }, undefined, 42, Date.now(), []);
const direction = { action: 'REIMAGINE', title: 'Quiet stars', reason: 'A dark screen suits the evening.', prompt: 'A restrained dark star field with faint points of light.', lighting: 'dark', themeIds: [] };
const dark = await readFile('public/showcase/harbour.jpg'), bright = await readFile('public/showcase/orchard.jpg');

function png(width, height, rgba, filter = 0) {
  const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = filter;
    for (let x = 0; x < width * 4; x++) {
      const value = rgba[y * width * 4 + x], left = x >= 4 ? rgba[y * width * 4 + x - 4] : 0;
      raw[y * (width * 4 + 1) + 1 + x] = filter === 1 ? (value - left) & 255 : value;
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function mock({ states = ['queuing', 'success'], image = dark, create = { code: 200, msg: 'success', data: { taskId: 'task_z-image_1' } }, createStatus = 200, fail = {} } = {}) {
  const calls = []; let polls = 0;
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), ...options });
    if (String(url).endsWith('/jobs/createTask')) return Response.json(create, { status: createStatus });
    if (String(url).includes('/jobs/recordInfo')) {
      const state = states[Math.min(polls++, states.length - 1)];
      return Response.json({ code: 200, msg: 'success', data: { taskId: 'task_z-image_1', state, resultJson: state === 'success' ? JSON.stringify({ resultUrls: ['https://tempfile.example.test/art.png'] }) : '', ...fail } });
    }
    if (String(url).startsWith('https://tempfile.example.test/')) return new Response(image);
    return new Response('unexpected', { status: 500 });
  };
  return { calls, fetcher };
}
const instant = { sleep: async () => {}, pollMs: 0 };

// Happy path: submit once, poll, download JPEG, keep dimensions.
{
  const { calls, fetcher } = mock({ states: ['waiting', 'queuing', 'generating', 'success'] });
  const result = await kieImageProvider({ apiKey: 'test-only-placeholder' }, fetcher, instant).generate(direction, night);
  assert.equal(result.mime, 'image/jpeg');
  assert.equal(result.width, 1024);
  const created = calls.filter(call => call.url.endsWith('/jobs/createTask'));
  assert.equal(created.length, 1, 'A paid task is submitted exactly once');
  const sent = JSON.parse(created[0].body);
  assert.equal(sent.model, 'z-image');
  assert.deepEqual(Object.keys(sent.input).sort(), ['aspect_ratio', 'nsfw_checker', 'prompt']);
  assert.equal(sent.input.aspect_ratio, '16:9');
  assert.match(sent.input.prompt, /Near-black/);
  assert.equal(created[0].headers.Authorization, 'Bearer test-only-placeholder');
  assert.equal(calls.filter(call => call.url.includes('recordInfo')).length, 4);
  const download = calls.find(call => call.url.startsWith('https://tempfile.example.test/'));
  assert.equal(download.headers, undefined, 'The API key is never sent to the result host');
}

// Seedream asks for JPEG at 1K.
{
  const { calls, fetcher } = mock();
  await kieImageProvider({ apiKey: 'k', model: 'seedream/5-5-text-to-image' }, fetcher, instant).generate(direction, night);
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.model, 'seedream/5-5-text-to-image');
  assert.deepEqual(sent.input, { ...sent.input, size: '1K', output_format: 'jpeg', aspect_ratio: '16:9' });
}

// PNG output is converted to JPEG, and filters decode correctly.
{
  const { width, height, data } = jpeg.decode(dark, { useTArray: true, formatAsRGBA: true });
  for (const filter of [0, 1]) {
    const encoded = png(width, height, data, filter);
    const decoded = await decodePng(new Uint8Array(encoded));
    assert.equal(decoded.width, width);
    assert.deepEqual(decoded.data.subarray(0, 4000), data.subarray(0, 4000));
    const { fetcher } = mock({ image: encoded });
    const result = await kieImageProvider({ apiKey: 'k' }, fetcher, instant).generate(direction, night);
    assert.equal(result.bytes[0], 255); assert.equal(result.bytes[1], 216);
    assert.equal(result.width, width);
  }
  await assert.rejects(decodePng(new Uint8Array(png(4000, 4000, new Uint8Array(4000 * 4000 * 4)))), /out of range/);
}

// Night comfort still applies to Kie pictures; daytime accepts bright art.
{
  const { fetcher } = mock({ image: bright });
  await assert.rejects(kieImageProvider({ apiKey: 'k' }, fetcher, instant).generate(direction, night), error => error instanceof ProviderFailure && error.hints.includes('night-light'));
  const sunny = { ...direction, lighting: 'daylight' };
  assert.equal((await kieImageProvider({ apiKey: 'k' }, mock({ image: bright }).fetcher, instant).generate(sunny, day)).mime, 'image/jpeg');
}

// Long director prompts are shortened for Z-Image but keep the comfort constraints.
{
  const long = { ...direction, prompt: 'A lantern-lit harbour at midnight with faint reflections. '.repeat(30).trim() };
  const fitted = fitPrompt(long, night, KIE_MODELS['z-image'].promptLimit);
  assert.ok(fitted.length <= 1000);
  assert.match(fitted, /Near-black restful wallpaper/);
  assert.match(fitted, /reflections\. Near-black/);
  assert.equal(fitPrompt(long, night, KIE_MODELS['seedream/5-5-text-to-image'].promptLimit).length > 1000, true);
}

// Errors map to the service's existing categories.
{
  await assert.rejects(kieImageProvider({ apiKey: 'k' }, mock({ create: { code: 402, msg: 'Insufficient credits' } }).fetcher, instant).generate(direction, night), error => error.kind === 'quota' && error.hints.includes('credit'));
  await assert.rejects(kieImageProvider({ apiKey: 'k' }, mock({ create: { code: 401, msg: 'Unauthorized' } }).fetcher, instant).generate(direction, night), error => error.kind === 'configuration');
  await assert.rejects(kieImageProvider({ apiKey: 'k' }, mock({ create: {}, createStatus: 429 }).fetcher, instant).generate(direction, night), error => error.kind === 'capacity' && error.retryable);
  const failed = mock({ states: ['generating', 'fail'], fail: { failCode: '500', failMsg: 'NSFW content detected' } });
  await assert.rejects(kieImageProvider({ apiKey: 'k' }, failed.fetcher, instant).generate(direction, night), error => error.kind === 'upstream' && !error.retryable && error.hints.includes('nsfw'));
  assert.equal(failed.calls.filter(call => call.url.endsWith('/jobs/createTask')).length, 1, 'A failed task is not resubmitted');
  let clock = 0;
  const slow = mock({ states: ['generating'] });
  await assert.rejects(kieImageProvider({ apiKey: 'k' }, slow.fetcher, { ...instant, deadlineMs: 10, now: () => (clock += 6) }).generate(direction, night), error => error.retryable && error.hints.includes('timeout'));
  const insecure = async url => String(url).includes('recordInfo') ? Response.json({ code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['http://plain.example.test/a.jpg'] }) } }) : Response.json({ code: 200, data: { taskId: 't1' } });
  await assert.rejects(kieImageProvider({ apiKey: 'k' }, insecure, instant).generate(direction, night), error => error.kind === 'invalid-output');
  const notImage = mock({ image: Buffer.from('<html>not an image</html>') });
  await assert.rejects(kieImageProvider({ apiKey: 'k' }, notImage.fetcher, instant).generate(direction, night), error => error.kind === 'invalid-output');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(kieImageProvider({ apiKey: 'k' }, mock({ states: ['generating'] }).fetcher).generate(direction, night, controller.signal), error => error instanceof ProviderFailure);
}

// Configuration is explicit and allowlisted; holds never spend.
assert.throws(() => kieImageProvider({ apiKey: '' }), error => error.kind === 'configuration');
assert.throws(() => kieImageProvider({ apiKey: 'k', model: 'nano-banana-pro' }), error => error.kind === 'configuration');
{
  const { calls, fetcher } = mock();
  await assert.rejects(kieImageProvider({ apiKey: 'k' }, fetcher, instant).generate({ ...direction, action: 'HOLD', prompt: '', themeIds: [] }, night));
  assert.equal(calls.length, 0, 'A hold never calls Kie');
}
console.log('Kie provider checks passed.');
