import { json, runtime, sessionId } from "@/lib/server";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const worldId = sessionId(request);
  if (!worldId || !/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Artwork not found." }, 404);
  const object = await runtime().BUCKET?.get(`${worldId}/${id}.webp`); if (!object) return json({ error: "Artwork not found." }, 404);
  return new Response(object.body, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" } });
}
