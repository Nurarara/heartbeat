import { collectContext } from "@/lib/context";
import { db, decode, failure, guard, json, row, runtime } from "@/lib/server";
import { interpretPulse } from "@/lib/pulse";
import { generateFrame } from "@/lib/generation";
export async function POST(request: Request) {
  let acquired: { id: string; version: number } | null = null;
  try {
    guard(request); const r = await row(request); if (!r) return json({ error: "Create your world first." }, 400);
    const w = decode(r); const id = r.id as string; const input = await request.json() as any;
    if (!w.profile.live || !runtime().OPENAI_API_KEY) {
      if (w.pending?.source === 'preview') {
        await db().prepare("UPDATE worlds SET pending = NULL, status = 'idle' WHERE id = ? AND version = ? AND pending = ?").bind(id,w.version,JSON.stringify(w.pending)).run();
        w.pending = null;
      }
      return json({ world:w, pulse:w.pulse, reason:`${w.pulse?.reason || "Waiting for environmental context."} Live AI reimagining is disconnected; the reference artwork is held.` });
    }
    if (w.pending) return json({ world: w, frame: w.pending });
    const now = Date.now();
    if (Number(r.lease) > now - 300000) return json({ world: w, reason: "A scene is already being prepared." });
    const targetAt = Number.isFinite(input.targetAt) ? Math.min(Math.max(input.targetAt, now), now + 600000) : now + w.profile.cadence * 1000;
    let context = null; try { context = await collectContext(w.profile.location); } catch {}
    // Compare with the context of the actual displayed artwork, not the last check.
    const previous = w.displayed.context ? interpretPulse(w.profile,w.displayed.context,w.displayed.targetAt) : null;
    const pulse = interpretPulse(w.profile,context,targetAt,previous);
    const choice = { action: input.force === true || !w.profile.adaptive || w.displayed.source !== 'live' ? 'REIMAGINE' : pulse.action, reason:pulse.reason };
    if (choice.action !== 'REIMAGINE') return json({world:w,pulse,reason:choice.reason});
    if (!context || context.stale) return json({ world: w, reason: "Fresh local context is needed before reimagining." });
    const day = new Date(now).toISOString().slice(0, 10);
    const lock = await db().prepare("UPDATE worlds SET lease = ?, status = 'generating', attempts = CASE WHEN day = ? THEN attempts + 1 ELSE 1 END, day = ?, last_error = NULL WHERE id = ? AND version = ? AND lease < ? AND pending IS NULL AND (day != ? OR attempts < 24)").bind(now, day, day, id, w.version, now - 300000, day).run();
    if (!lock.meta.changes) return json({ world: w, reason: "Your daily generation limit is reached, or a scene is already being prepared." });
    acquired = { id, version: w.version };
    const generated = await generateFrame(id, w, context, targetAt, choice.reason, r.anchor as string | null,input.force===true);
    const frame=generated.frame;
    if(!frame){
      await db().prepare("UPDATE worlds SET lease = 0, status = 'idle' WHERE id = ? AND version = ?").bind(id,w.version).run();
      const fresh=decode((await db().prepare("SELECT * FROM worlds WHERE id = ?").bind(id).first<Record<string,unknown>>())!);
      return json({world:fresh,pulse,reason:generated.direction.reason,direction:generated.direction});
    }
    const result = await db().prepare("UPDATE worlds SET pending = ?, lease = 0, status = 'ready', updated_at = ? WHERE id = ? AND version = ?").bind(JSON.stringify(frame), Date.now(), id, w.version).run();
    const fresh = decode((await db().prepare("SELECT * FROM worlds WHERE id = ?").bind(id).first<Record<string, unknown>>())!);
    return json({ world: fresh, frame: result.meta.changes ? frame : fresh.pending });
  } catch (error) {
    if (acquired) await db().prepare("UPDATE worlds SET status = 'idle', lease = 0, last_error = ? WHERE id = ? AND version = ?").bind("The next scene could not be prepared. Your current artwork is kept.", acquired.id, acquired.version).run().catch(() => {});
    return failure(error);
  }
}
