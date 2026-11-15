// Preloaded by tests/mood-picker.mjs so scripts/live-test.mts runs with no network and no credits.
import { readFileSync } from 'node:fs';
const picture = readFileSync(new URL('../../public/showcase/harbour.jpg', import.meta.url)), real = globalThis.fetch;
let polls = 0, scenes = 0;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('http://127.0.0.1')) return real(url, init);
  if (url.includes('api.open-meteo.com')) { const now = Math.floor(Date.now() / 1000); return Response.json({ current: { time: now, temperature_2m: 9, weather_code: 2, is_day: 1, cloud_cover: 40 }, daily: { sunrise: [now - 20000], sunset: [now + 20000] } }); }
  if (url.includes('api.cloudflare.com')) {
    const packet = JSON.parse(JSON.parse(init.body).messages[1].content), words = packet.draw.slice(0, 3);
    return Response.json({ success: true, result: { response: { action: 'REIMAGINE', title: `Mock scene ${++scenes}`, reason: 'A mocked decision.', prompt: `A dark quiet scene with ${words.map(word => word.label).join(', ')}.`, lighting: 'dark', themeIds: [], usedWords: words.map(word => word.id) } } });
  }
  if (url.includes('/chat/credit')) return Response.json({ code: 200, data: 70 });
  if (url.includes('/jobs/createTask')) return Response.json({ code: 200, data: { taskId: 'mock_task' } });
  if (url.includes('/jobs/recordInfo')) return Response.json({ code: 200, data: { state: polls++ % 2 ? 'success' : 'generating', resultJson: JSON.stringify({ resultUrls: ['https://files.example.test/picture.jpg'] }) } });
  if (url.includes('files.example.test')) return new Response(picture);
  throw new Error(`Unexpected request in the live-test mock: ${new URL(url).host}`);
};
