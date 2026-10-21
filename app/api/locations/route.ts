import { failure, json } from "@/lib/server";
import { searchPlaces } from "@/lib/context";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || ""; if (q.length < 2) return json({ locations: [] });
  try { return json({ locations: await searchPlaces(q, request.signal) }); } catch (e) { return failure(e); }
}
