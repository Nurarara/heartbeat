import { collectContext } from "@/lib/context";
import { failure, json, row, decode } from "@/lib/server";
import { LONDON } from "@/lib/world";
export async function GET(request: Request) { try { const r = await row(request); return json({ context: await collectContext(r ? decode(r).profile.location : LONDON), serverTime: Date.now() }); } catch (e) { return failure(e); } }
