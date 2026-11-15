// Moods guide the feeling of a picture. They never replace the moment (time, weather,
// sky) and never override night darkness.
export const MOOD_IDS = ['auto', 'calm', 'sleep', 'cosy', 'focus', 'playful', 'dreamy', 'romantic'] as const;
export type MoodId = typeof MOOD_IDS[number];
export type Mood = {
  id: MoodId; label: string;
  /** Dot colour for the picker chip. */
  colour: string;
  /** One short instruction for the director. Empty for auto. */
  instruction: string;
  /** Multipliers for ingredient tags when drawing a palette or a twist. 0 forbids a tag. */
  palette: Record<string, number>; twist: Record<string, number>;
  /** The brightest lighting this mood allows at any time of day. */
  lighting: 'any' | 'soft' | 'dark';
  /** Upper bound on the picture's mean brightness (0 to 1). */
  brightnessCeiling: number;
  /** How slowly the next picture fades in, in milliseconds. */
  crossfadeMs: number;
};

export const MOODS: Record<MoodId, Mood> = {
  auto: { id: 'auto', label: 'Auto', colour: '#c9ccd0', instruction: '', palette: {}, twist: {}, lighting: 'any', brightnessCeiling: 1, crossfadeMs: 2400 },
  calm: { id: 'calm', label: 'Calm', colour: '#7fa8d6', instruction: 'Calm: slow, peaceful and spacious. Soft light, a quiet subject, gentle colours and nothing dramatic.', palette: { soft: 3, muted: 2, cool: 1.5 }, twist: { gentle: 3, energetic: 0 }, lighting: 'any', brightnessCeiling: 1, crossfadeMs: 3200 },
  sleep: { id: 'sleep', label: 'Sleep', colour: '#3a4670', instruction: 'Sleep: winding down into darkness. A near-black picture with tiny dim highlights and complete stillness; nothing stimulating.', palette: { dark: 4, bright: 0 }, twist: { gentle: 3, energetic: 0 }, lighting: 'dark', brightnessCeiling: .32, crossfadeMs: 6000 },
  cosy: { id: 'cosy', label: 'Cosy', colour: '#d89a5b', instruction: 'Cosy: sheltered warmth, like a blanket and a hot drink. Warm lamps, snug interiors or sheltered corners and soft textures.', palette: { warm: 3, soft: 1.5 }, twist: { gentle: 2, energetic: .3 }, lighting: 'any', brightnessCeiling: 1, crossfadeMs: 3000 },
  focus: { id: 'focus', label: 'Focus', colour: '#5f9d8a', instruction: 'Focus: a calm background for working. Low detail, simple shapes, plenty of empty space and no busy or attention-grabbing subject.', palette: { muted: 3, cool: 1.5 }, twist: { gentle: 2, energetic: 0 }, lighting: 'any', brightnessCeiling: 1, crossfadeMs: 3500 },
  playful: { id: 'playful', label: 'Playful', colour: '#f6b44b', instruction: 'Playful: whimsical and smile-making. Characterful creatures, gentle humour and bright accents (still dark at night).', palette: { bright: 2.5, warm: 1.5 }, twist: { energetic: 3, surreal: 1.5 }, lighting: 'any', brightnessCeiling: 1, crossfadeMs: 1800 },
  dreamy: { id: 'dreamy', label: 'Dreamy', colour: '#b48ad9', instruction: 'Dreamy: surreal and otherworldly. Impossible places, floating things and a soft glow.', palette: { purple: 2.5, soft: 2, cool: 1.5 }, twist: { surreal: 4, energetic: .5 }, lighting: 'any', brightnessCeiling: 1, crossfadeMs: 3600 },
  romantic: { id: 'romantic', label: 'Romantic', colour: '#b0386a', instruction: 'Romantic: dim and intimate. Deep reds and purples, candlelight, silk and soft shadow. Atmosphere only: tasteful, with no people in intimate poses.', palette: { red: 4, purple: 3, dark: 2, warm: 1.5, bright: 0 }, twist: { gentle: 2.5, energetic: 0 }, lighting: 'soft', brightnessCeiling: .5, crossfadeMs: 4500 },
};

/** Unknown or missing values mean auto; stored data is never trusted. */
export function parseMood(value: unknown): MoodId {
  return typeof value === 'string' && (MOOD_IDS as readonly string[]).includes(value) ? value as MoodId : 'auto';
}
