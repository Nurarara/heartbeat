"use client";
import { MOOD_IDS, MOODS, type MoodId } from "@/lib/moods";

/** A row of mood chips. Choosing one guides the NEXT picture; the current picture stays. */
export function MoodPicker({ value, onChoose, disabled = false }: { value: MoodId; onChoose: (mood: MoodId) => void; disabled?: boolean }) {
  return <div className="hb-moods" role="group" aria-label="Mood for your next picture">
    {MOOD_IDS.map(id => <button key={id} type="button" disabled={disabled} aria-pressed={id === value} onClick={() => { if (id !== value) onChoose(id); }}>
      <i aria-hidden="true" style={{ background: MOODS[id].colour }} />{MOODS[id].label}
    </button>)}
  </div>;
}
