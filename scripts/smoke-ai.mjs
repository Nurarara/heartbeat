// Explicit live test: at most one reserved director/image attempt, through normal protections.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.HEARTBEAT_TEST_URL || 'http://localhost:5173';
const places = {
  london: { latitude: 51.5085, longitude: -.1257, timezone: 'Europe/London' },
  tokyo: { latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo' },
};
const city = process.argv[2] || 'london';
if (!Object.hasOwn(places, city)) throw new Error('Choose london or tokyo. No generation was requested.');
const status = await fetch(`${origin}/api/ai/status`, { signal: AbortSignal.timeout(15000) });
if (!status.ok || !(await status.json()).configured) throw new Error('Complete .dev.vars setup and restart npm run dev first. No generation was requested.');
const file = await readFile('.dev.vars', 'utf8');
const accessKey = file.match(/^HEARTBEAT_AI_ACCESS_KEY\s*=\s*["']?([^\r\n"']+)["']?\s*$/m)?.[1]?.trim();
if (!accessKey || accessKey === 'GENERATED_BY_LOCAL_SETUP') throw new Error('The local display access key is missing.');
const login = await fetch(`${origin}/api/ai/session`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey }), signal: AbortSignal.timeout(15000) });
if (!login.ok) throw new Error(`Display session could not be opened (HTTP ${login.status}). No generation requested.`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Display session cookie was missing.');
const requestId = crypto.randomUUID();
const response = await fetch(`${origin}/api/ai/prepare`, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, location: places[city], force: true }), signal: AbortSignal.timeout(210000) });
const result = await response.json();
if (!response.ok || result.status !== 'ready' || !result.candidate?.direction?.artwork) throw new Error(result.reason || result.error || 'The preparation did not return a ready picture. No automatic retry was made.');
const image = await fetch(`${origin}${result.candidate.direction.artwork.url}`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(15000) });
if (!image.ok || image.headers.get('content-type') !== 'image/jpeg') throw new Error('Private artwork retrieval failed.');
const bytes = new Uint8Array(await image.arrayBuffer());
if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new Error('Artwork JPEG header was invalid.');
await mkdir('outputs', { recursive: true });
const destination = `outputs/live-ai-${result.candidate.id}.jpg`;
await writeFile(destination, bytes);
await writeFile(`outputs/live-ai-${result.candidate.id}.json`, JSON.stringify({ city, testedAt: new Date().toISOString(), title: result.candidate.direction.artwork.title, reason: result.candidate.direction.reason, phase: result.candidate.direction.phase, imageBytes: bytes.length, scope: 'Live provider roundtrip. This CLI did not display or acknowledge the image.' }, null, 2));
console.log(`Live generation and private retrieval passed. Image saved to ${destination}. One preparation attempt was reserved; no display ACK or automatic retry was sent.`);
