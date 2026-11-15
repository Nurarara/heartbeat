// The ingredient engine: one random word from each group, every picture. The director must
// weave at least two of them into a scene that still fits the real moment.
// Deliberately wild. Only light safety filters apply; no compatibility rules.
// No real people, brands, logos or text.
import { THEME_LIBRARY, type ThemeEntry } from './creative-library.ts';
import { MOODS, type MoodId } from './moods.ts';
import type { CreativeMemory } from './creative.ts';

export const INGREDIENT_GROUPS = ['subject', 'object', 'place', 'style', 'twist', 'viewpoint', 'palette'] as const;
export type IngredientGroup = typeof INGREDIENT_GROUPS[number];
export type Ingredient = { id: string; category: IngredientGroup; label: string; tags: string[] };
export type DrawnWord = { id: string; group: IngredientGroup; label: string };
export const MINIMUM_DRAWN_WORDS = 2;

// Each row is "label" or "label | tag tag". Tags: palettes use dark, bright, warm, cool,
// soft, muted, red, purple; twists use gentle, surreal, energetic.
const WORDS: Record<IngredientGroup, string[]> = {
  subject: [
    'a red fox', 'a hedgehog postman', 'an old astronaut', 'twin robots', 'a lighthouse keeper', 'a sleepy owl', 'a tiny dragon', 'a flock of paper cranes',
    'a snail with a house-shaped shell', 'a tortoise carrying a garden on its back', 'a whale', 'a jellyfish', 'a tabby cat', 'a shepherd dog', 'a pair of swans',
    'a clockwork bird', 'a young gardener', 'a night-shift baker', 'a deep-sea diver', 'a kite flyer', 'a beekeeper', 'a wandering musician', 'a snow hare',
    'a family of otters', 'a heron', 'a moth', 'a koi fish', 'an elderly tailor', 'a child in a yellow raincoat', 'a mountain goat', 'a swarm of fireflies',
    'a polar bear', 'a raccoon', 'a stargazer with a telescope', 'a ferry captain', 'a robot gardener', 'a scarecrow', 'a seal', 'a barn owl', 'a street painter',
    'a giant friendly octopus', 'a penguin', 'a deer', 'a little ghost made of mist', 'a frog in a raincoat', 'a bumblebee', 'a hot-air balloonist', 'a crow',
    'a sleeping giant made of hills', 'a pair of old friends',
  ],
  object: [
    'a fountain pen', 'a teacup', 'a paper boat', 'an old radio', 'a brass key', 'a lantern', 'an umbrella', 'a compass', 'a music box', 'a kite', 'a bicycle',
    'a sewing machine', 'a telescope', 'a ladder', 'a snow globe', 'a candle', 'a kettle', 'a pair of boots', 'a suitcase', 'a red balloon', 'a rowing boat',
    'a glass bottle with a tiny ship inside', 'a woven basket', 'a spinning top', 'a violin', 'a small bell', 'a hammock', 'a watering can',
    'a birdcage with its door open', 'a rocking chair', 'a paper aeroplane', 'a wind chime', 'a hand mirror', 'a ball of wool', 'a chess piece', 'a seashell',
    'a feather', 'a paintbrush', 'a clay pot', 'a loaf of bread', 'a pine cone', 'a glass marble', 'a string of fairy lights', 'a fishing net', 'a long scarf',
    'an origami star', 'a door standing on its own', 'a garden swing', 'a spiral staircase', 'a paper lantern',
  ],
  place: [
    'outer space', 'a moon of Jupiter', 'inside a black hole', 'a park bench', 'a rooftop', 'under the sea', 'a lighthouse', 'a greenhouse', 'a night market',
    'a mountain pass', 'a desert dune', 'a bamboo forest', 'a frozen lake', 'a floating island', 'the inside of a teapot', 'a train carriage', 'a library',
    'a cliff edge', 'a rice terrace', 'a canal', 'a cave of crystals', 'the top of the clouds', 'a harbour', 'a meadow', 'a tree house', 'an underground platform',
    'an attic', 'a stone bridge', 'an orchard', 'the rim of a volcano', 'a coral reef', 'a snowy cabin', 'an abandoned funfair', 'a bathhouse', 'a kitchen',
    'the rings of Saturn', 'a field of windmills', 'a tidal pool', 'a monastery courtyard', 'a launderette', 'a rainforest canopy', 'a salt flat', 'the deck of a ship',
    'a planetarium', 'a garden maze', 'a bus stop', 'a wheat field', 'an iceberg', 'the tail of a comet', 'inside a snow globe',
  ],
  style: [
    'pencil drawing', 'anime', 'claymation', 'oil painting', 'cinematic photograph', 'woodblock print', 'pixel art', 'watercolour', 'gouache', 'charcoal',
    'ink wash', 'soft pastel', 'linocut', 'paper cut-out collage', 'stained glass', 'embroidery', 'low-poly 3D', 'isometric diorama', 'felt and wool stop-motion',
    'screen-print poster art without lettering', 'art nouveau', 'impressionist painting', 'pointillism', 'chalk on a blackboard', 'cyanotype', 'risograph print',
    'picture-book illustration', 'cardboard stop-motion', 'blown-glass sculpture', 'ceramic tile mosaic', 'botanical illustration', 'blueprint line art',
    'long-exposure photograph', 'tilt-shift miniature', 'film noir', 'fresco', 'scratchboard', 'wax crayon', 'retro-futurist airbrush', 'ukiyo-e', 'macro photograph',
    'double exposure', 'shadow-puppet silhouette', 'neon line art', 'oil pastel', 'etching', 'matte painting', 'folded-paper sculpture', 'storybook watercolour and ink',
    'folk art',
  ],
  twist: [
    'upside-down gravity | surreal', 'everything is made of glass | surreal', 'giant-sized | surreal', 'raining stars | surreal gentle', 'miniature scale | surreal',
    'fish swimming through the air | surreal', 'frozen in time | surreal gentle', 'made of folded paper | surreal', 'flowers growing from unexpected places | gentle',
    'floating a little above the ground | surreal gentle', 'lit only by fireflies | gentle', 'seen as a reflection in a puddle | gentle', 'held inside a bottle | surreal',
    'clouds resting at ground level | gentle surreal', 'two moons in the sky | surreal', 'knitted from yarn | surreal', 'everything asleep | gentle',
    'shadows with a life of their own | surreal', 'overgrown with moss | gentle', 'carried by balloons | surreal energetic', 'tiny doors everywhere | surreal',
    'all four seasons at once | surreal', 'a river of light | surreal gentle', 'the wind made visible | gentle', 'everything in mid-leap | energetic',
    'a small parade | energetic', 'a burst of petals like fireworks | energetic', 'dancing | energetic', 'a race | energetic', 'snow falling upward | surreal gentle',
    'made of smoke and mist | surreal gentle', 'the sky is an ocean | surreal', 'the ground is a mirror | surreal gentle', 'a festival of floating lanterns | gentle',
    'melting like candle wax | surreal', 'woven from threads of light | surreal gentle', 'tied together with red string | surreal', 'a doorway into another season | surreal',
    'toys come to life | surreal energetic', 'constellations come down to visit | surreal gentle', 'softly bioluminescent | gentle surreal',
    'shrunk to the size of an insect | surreal', 'a sleeping city | gentle', 'fading echoes of itself | surreal', 'half-finished like a sketch | gentle',
    'balanced impossibly | surreal', 'slowly orbiting each other | surreal gentle', 'a sudden gust of wind | energetic', 'juggling | energetic', 'growing out of a book | surreal',
  ],
  viewpoint: [
    'extreme close-up', 'seen from far away', 'seen from below', 'through a window', 'bird\'s-eye view', 'from behind the subject', 'reflected in still water',
    'through a keyhole', 'wide panorama', 'over the shoulder', 'worm\'s-eye view', 'cross-section cutaway', 'silhouette against the sky', 'framed by branches',
    'through rain on glass', 'symmetrical and centred', 'a tiny subject in a vast space', 'looking straight down', 'from inside looking out', 'tilted angle',
    'through fog', 'split view above and below water', 'down a long corridor', 'in a hand mirror', 'three-quarter isometric view', 'through tall grass',
    'at ground level', 'framed by a doorway', 'one distant lit window', 'shallow depth of field', 'from a moving train window', 'spiral composition',
    'diagonal composition', 'low horizon and a huge sky', 'high horizon and a deep foreground', 'a foreground frame of leaves', 'through the circle of a telescope',
    'fisheye view', 'side-on profile', 'from the top of a staircase', 'glimpsed between two buildings', 'empty space on the left', 'empty space on the right',
    'one sharp detail with the scene blurred behind', 'layered planes of depth', 'peeking over an edge', 'from across the water', 'through a lantern\'s glow',
    'head-on at eye level', 'from high on a hillside',
  ],
  palette: [
    'shades of black | dark', 'sunset orange | warm bright', 'sea-glass green | cool soft', 'monochrome blue | cool', 'charcoal and gold | dark warm',
    'deep indigo and silver | dark cool', 'candlelight amber on black | dark warm', 'dusty rose | warm muted soft red', 'lilac and peach | soft purple',
    'forest green and mist | muted cool', 'burgundy and plum | dark red purple', 'crimson and violet | dark red purple', 'midnight teal | dark cool',
    'cream and terracotta | warm bright', 'lemon and sky blue | bright', 'sepia | warm muted', 'black with one red accent | dark red', 'moonlit grey-blue | dark cool',
    'honey and brown | warm muted', 'mint and coral | bright', 'storm grey | muted cool', 'fog white and pale grey | bright muted', 'rust and ochre | warm muted',
    'ice blue and white | bright cool', 'magenta glow in darkness | dark purple', 'pastel rainbow | bright soft', 'olive and mustard | muted warm',
    'navy and brass | dark warm', 'peach and lavender | soft purple warm', 'emerald and black | dark cool', 'cherry-blossom pink | bright soft red',
    'sand and turquoise | bright', 'graphite greys | muted dark', 'ember red in darkness | dark red warm', 'aubergine and candle gold | dark purple warm',
    'wine red and soft pink | red warm', 'cobalt and white | bright cool', 'copper and verdigris | muted warm', 'twilight violet | dark purple',
    'butter yellow | bright warm', 'slate and moss | muted cool', 'starlight white on deep black | dark cool', 'apricot haze | warm soft', 'seafoam and pearl | soft cool',
    'chocolate and cream | warm muted', 'rose gold and shadow | dark warm red', 'green aurora on black | dark cool', 'ink black on paper white | bright',
    'smoky blue | muted cool soft', 'saffron and maroon | warm red',
  ],
};

const slug = (label: string) => label.toLowerCase().replace(/^(an?|the) /, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/, '');
export const INGREDIENTS: readonly Ingredient[] = INGREDIENT_GROUPS.flatMap(group => WORDS[group].map(row => {
  const [label, tags = ''] = row.split(' | ');
  return { id: `w-${group}-${slug(label)}`, category: group, label, tags: tags.split(' ').filter(Boolean) };
}));
const BY_ID = new Map<string, Ingredient>(INGREDIENTS.map(item => [item.id, item]));
export const isIngredientId = (id: string) => BY_ID.has(id);

/** Old theme-library entries and new ingredient words share one lookup for stored artwork. */
export function findTheme(id: unknown): Pick<ThemeEntry, 'id' | 'label' | 'category'> | undefined {
  return typeof id === 'string' ? BY_ID.get(id) || THEME_LIBRARY.find(theme => theme.id === id) : undefined;
}

export function validateIngredients(library: readonly Ingredient[] = INGREDIENTS): boolean {
  const ids = new Set<string>();
  for (const item of library) {
    if (!/^w-[a-z]+-[a-z0-9-]{1,48}$/.test(item.id) || ids.has(item.id) || !INGREDIENT_GROUPS.includes(item.category) || !item.label.trim() || item.label.length > 80 || THEME_LIBRARY.some(theme => theme.id === item.id)) return false;
    ids.add(item.id);
  }
  return INGREDIENT_GROUPS.every(group => library.filter(item => item.category === group).length >= 40);
}

function hash(text: string) { let number = 2166136261; for (let i = 0; i < text.length; i++) number = Math.imul(number ^ text.charCodeAt(i), 16777619); return number >>> 0; }
function random(seed: number) { let value = seed || 1; return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 0x1_0000_0000; }; }

export type DrawOptions = { mood?: MoodId; dark?: boolean };
/** How likely one word is, before the random pick. Exported so tests can check the policy directly. */
export function ingredientWeight(item: Ingredient, memory: CreativeMemory | undefined, at: number, options: DrawOptions = {}): number {
  const mood = MOODS[options.mood || 'auto'];
  let value = 1;
  // Light safety only: darkness forbids bright palettes; a mood may forbid or favour tags.
  if (item.category === 'palette') {
    if (options.dark && item.tags.includes('bright')) return 0;
    for (const tag of item.tags) if (tag in mood.palette) value *= mood.palette[tag];
    if (options.dark && item.tags.includes('dark')) value *= 2;
  }
  if (item.category === 'twist') for (const tag of item.tags) if (tag in mood.twist) value *= mood.twist[tag];
  if (!value) return 0;
  const used = memory?.usage[item.id];
  if (used) value /= (1 + Math.log2(1 + used.count)) * (at - used.lastAt < 24 * 3_600_000 ? 4 : 1);
  const taste = memory?.feedback[item.id];
  if (taste) value *= Math.max(.25, Math.min(3, (1 + taste.more / 4) / (1 + taste.less / 4)));
  return value;
}

/** One word per group. The same seed, time, memory and options always give the same draw. */
export function drawIngredients(memory: CreativeMemory | undefined, seed: number, at: number, options: DrawOptions = {}): DrawnWord[] {
  const rand = random(hash(`draw|${seed}|${at}|${options.mood || 'auto'}|${options.dark ? 1 : 0}`));
  return INGREDIENT_GROUPS.map(group => {
    const pool = INGREDIENTS.filter(item => item.category === group), weights = pool.map(item => ingredientWeight(item, memory, at, options));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let pick = rand() * total;
    const chosen = pool.find((_, index) => { pick -= weights[index]; return pick < 0 && weights[index] > 0; }) || pool.find((_, index) => weights[index] > 0) || pool[0];
    return { id: chosen.id, group, label: chosen.label };
  });
}
