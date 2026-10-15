import { db, decode, failure, guard, json, row } from "@/lib/server";
import { rememberFrame } from "@/lib/story";
export async function POST(request: Request) {
  try { guard(request); const r = await row(request); if (!r) return json({ error: "Your world is not available." }, 400); const w = decode(r); const input = await request.json() as any;
    if (w.displayed.id === input.frameId) return json({ world: w });
    if (!w.pending || w.pending.id !== input.frameId || w.version !== input.version) return json({ error: "The prepared scene changed. Keeping your current artwork." }, 409);
    const f = w.pending;
    if (f.source === "live" && Date.now() - f.generatedAt > 1800000) {
      await db().prepare("UPDATE worlds SET pending = NULL, status = 'idle' WHERE id = ? AND version = ? AND pending = ?").bind(r.id, w.version, r.pending).run();
      return json({ error: "That scene waited too long. Preparing a fresher moment." }, 409);
    }
    const memory=rememberFrame(w.memory || null,f);
    const result = await db().prepare("UPDATE worlds SET displayed = ?, anchor = CASE WHEN ? = 'live' AND anchor IS NULL THEN ? ELSE anchor END, memory = ?, pending = NULL, moments = moments + ?, status = 'idle', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND pending = ?").bind(JSON.stringify(f), f.source, JSON.stringify(f),memory ? JSON.stringify(memory):null, f.source === "live" ? 1 : 0, Date.now(), r.id, w.version, r.pending).run();
    if (!result.meta.changes) return json({ error: "This scene changed in another tab. Your artwork is kept." }, 409);
    return json({ world: decode((await db().prepare("SELECT * FROM worlds WHERE id = ?").bind(r.id).first<Record<string, unknown>>())!) });
  } catch (e) { return failure(e); }
}
