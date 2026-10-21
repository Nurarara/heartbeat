/**
 * Curated prompts for the creative director, rather than observations of the user.
 * Selection order is place, subject, activity, object, material, style, viewpoint.
 * `requires` is an AND over tags already selected; `excludes` is an OR.
 * Temperature and phase express suitability, never evidence of weather conditions.
 */
export type ThemeCategory = 'place' | 'subject' | 'activity' | 'object' | 'material' | 'style' | 'viewpoint';

export type ThemeEntry = {
  id: string;
  category: ThemeCategory;
  label: string;
  tags: string[];
  requires?: string[];
  excludes?: string[];
  phases?: ('morning' | 'day' | 'dusk' | 'night')[];
  temperature?: 'cold' | 'warm';
  fallbackScene?: 'room' | 'city' | 'cosmos' | 'meadow' | 'lake' | 'coast';
};

export const THEME_LIBRARY: readonly ThemeEntry[] = [
  // Places establish physical constraints. Quiet interiors and dark skies work at night.
  { id: 'place-japanese-home', category: 'place', label: 'a modest Japanese home with deep window alcoves', tags: ['indoor', 'terrestrial', 'sheltered', 'domestic', 'woodwork'], fallbackScene: 'room' },
  { id: 'place-mountain-greenhouse', category: 'place', label: 'a small greenhouse above a mountain valley', tags: ['indoor', 'terrestrial', 'sheltered', 'plant', 'glass'], temperature: 'cold', fallbackScene: 'room' },
  { id: 'place-attic-studio', category: 'place', label: 'an attic studio with a sloping roof and unfinished sketches', tags: ['indoor', 'terrestrial', 'sheltered', 'studio', 'paper'], fallbackScene: 'room' },
  { id: 'place-reading-carriage', category: 'place', label: 'a quiet old train carriage arranged as a reading room', tags: ['indoor', 'terrestrial', 'sheltered', 'reading', 'furniture'], fallbackScene: 'room' },
  { id: 'place-pottery-workshop', category: 'place', label: 'a pottery workshop with orderly shelves and a low workbench', tags: ['indoor', 'terrestrial', 'sheltered', 'studio', 'ceramic', 'furniture'], fallbackScene: 'room' },
  { id: 'place-night-library', category: 'place', label: 'a library corner lit by one shaded reading lamp', tags: ['indoor', 'terrestrial', 'sheltered', 'reading', 'paper', 'furniture'], phases: ['dusk', 'night'], fallbackScene: 'room' },
  { id: 'place-courtyard-veranda', category: 'place', label: 'a covered veranda looking into a small enclosed courtyard', tags: ['outdoor', 'terrestrial', 'ground', 'sheltered', 'domestic', 'woodwork'], temperature: 'warm', fallbackScene: 'room' },
  { id: 'place-single-tree-field', category: 'place', label: 'a broad field with one spreading tree and a distant footpath', tags: ['outdoor', 'terrestrial', 'ground', 'open', 'plant'], phases: ['morning', 'day', 'dusk'], fallbackScene: 'meadow' },
  { id: 'place-orchard-edge', category: 'place', label: 'the edge of an orchard with generous space between the trees', tags: ['outdoor', 'terrestrial', 'ground', 'plant', 'quiet'], phases: ['morning', 'day', 'dusk'], fallbackScene: 'meadow' },
  { id: 'place-hill-meadow', category: 'place', label: 'a hillside meadow with a long winding path', tags: ['outdoor', 'terrestrial', 'ground', 'open', 'plant'], phases: ['morning', 'day', 'dusk'], fallbackScene: 'meadow' },
  { id: 'place-lakeside-reeds', category: 'place', label: 'a low lakeshore among reeds with distant layered hills', tags: ['outdoor', 'terrestrial', 'ground', 'water', 'plant', 'quiet'], fallbackScene: 'lake' },
  { id: 'place-lake-jetty', category: 'place', label: 'a narrow wooden jetty beside a sheltered lake', tags: ['outdoor', 'terrestrial', 'ground', 'water', 'woodwork', 'quiet'], fallbackScene: 'lake' },
  { id: 'place-canal-corner', category: 'place', label: 'a quiet canal corner with a low stone bridge', tags: ['outdoor', 'terrestrial', 'ground', 'water', 'urban', 'stone'], fallbackScene: 'city' },
  { id: 'place-city-bookshop', category: 'place', label: 'a little bookshop frontage on an otherwise quiet city street', tags: ['outdoor', 'terrestrial', 'ground', 'urban', 'reading'], fallbackScene: 'city' },
  { id: 'place-rooftop-garden', category: 'place', label: 'a sheltered rooftop garden above a layered city skyline', tags: ['outdoor', 'terrestrial', 'ground', 'urban', 'plant', 'sheltered'], fallbackScene: 'city' },
  { id: 'place-tram-stop', category: 'place', label: 'an old tram stop with a bench beneath a deep canopy', tags: ['outdoor', 'terrestrial', 'ground', 'urban', 'sheltered', 'furniture', 'metal'], fallbackScene: 'city' },
  { id: 'place-lighthouse-path', category: 'place', label: 'a winding coastal path below a small lighthouse', tags: ['outdoor', 'terrestrial', 'ground', 'water', 'coast', 'stone'], fallbackScene: 'coast' },
  { id: 'place-harbour-cottages', category: 'place', label: 'a sheltered harbour bordered by a handful of cottages', tags: ['outdoor', 'terrestrial', 'ground', 'water', 'coast', 'domestic'], fallbackScene: 'coast' },
  { id: 'place-dune-hollow', category: 'place', label: 'a protected hollow between low dunes overlooking the sea', tags: ['outdoor', 'terrestrial', 'ground', 'water', 'coast', 'sheltered'], temperature: 'warm', fallbackScene: 'coast' },
  { id: 'place-mountain-observatory', category: 'place', label: 'a quiet observatory terrace above a dark mountain horizon', tags: ['outdoor', 'terrestrial', 'ground', 'open', 'astronomy', 'metal'], phases: ['night'], fallbackScene: 'cosmos' },
  { id: 'place-nebula-expanse', category: 'place', label: 'an imagined expanse of faint nebula filaments and distant stars', tags: ['space', 'open', 'quiet', 'abstract'], phases: ['night'], fallbackScene: 'cosmos' },
  { id: 'place-orbital-garden', category: 'place', label: 'an unoccupied orbital glass garden against deep space', tags: ['space', 'indoor', 'sheltered', 'plant', 'glass', 'speculative'], phases: ['night'], fallbackScene: 'cosmos' },

  // Subjects only enter settings that can support them. Empty is a deliberate option.
  { id: 'subject-solitary-reader', category: 'subject', label: 'a solitary reader in comfortable clothes', tags: ['person', 'reader'], requires: ['terrestrial'] },
  { id: 'subject-resting-adult', category: 'subject', label: 'an adult enjoying an unhurried rest', tags: ['person', 'resting'], requires: ['terrestrial', 'sheltered'] },
  { id: 'subject-gardener', category: 'subject', label: 'a gardener with a small basket', tags: ['person', 'gardener'], requires: ['terrestrial', 'plant'] },
  { id: 'subject-traveller', category: 'subject', label: 'a traveller taking a quiet break', tags: ['person', 'traveller'], requires: ['terrestrial'] },
  { id: 'subject-artist', category: 'subject', label: 'an artist with a compact sketchbook', tags: ['person', 'artist', 'paper'], requires: ['terrestrial'] },
  { id: 'subject-potter', category: 'subject', label: 'a potter wearing a plain work apron', tags: ['person', 'maker'], requires: ['terrestrial', 'ceramic'] },
  { id: 'subject-friends', category: 'subject', label: 'two friends sharing a companionable silence', tags: ['person', 'companions'], requires: ['terrestrial'] },
  { id: 'subject-curled-cat', category: 'subject', label: 'a cat with softly folded paws', tags: ['animal', 'pet', 'cat'], requires: ['terrestrial', 'sheltered'] },
  { id: 'subject-field-dogs', category: 'subject', label: 'two small dogs seen at a distance', tags: ['animal', 'pet', 'dog'], requires: ['outdoor', 'ground'], excludes: ['urban'] },
  { id: 'subject-drowsy-dog', category: 'subject', label: 'a drowsy dog settled close to the ground', tags: ['animal', 'pet', 'dog'], requires: ['terrestrial', 'sheltered'] },
  { id: 'subject-small-birds', category: 'subject', label: 'a few small birds with ample space around them', tags: ['animal', 'bird'], requires: ['outdoor', 'terrestrial'] },
  { id: 'subject-shore-birds', category: 'subject', label: 'a pair of shore birds near the waterline', tags: ['animal', 'bird', 'shore-bird'], requires: ['outdoor', 'water', 'ground'] },
  { id: 'subject-distant-deer', category: 'subject', label: 'a single deer far from the viewpoint', tags: ['animal', 'deer'], requires: ['outdoor', 'ground', 'plant'], excludes: ['urban', 'domestic'] },
  { id: 'subject-empty-place', category: 'subject', label: 'an unoccupied setting with traces of everyday life', tags: ['empty'], requires: ['terrestrial'] },
  { id: 'subject-empty-space', category: 'subject', label: 'no figures, allowing the immense setting to carry the composition', tags: ['empty'], requires: ['space'] },

  // Activities depend on anatomy and setting; none infer what the user is doing.
  { id: 'activity-reading', category: 'activity', label: 'reading with an easy, absorbed posture', tags: ['quiet', 'focused'], requires: ['person'], excludes: ['maker'] },
  { id: 'activity-sketching', category: 'activity', label: 'making a small observational sketch', tags: ['quiet', 'focused', 'paper'], requires: ['person'], excludes: ['resting'] },
  { id: 'activity-napping', category: 'activity', label: 'napping in a supported, comfortable position', tags: ['quiet', 'restful'], requires: ['person', 'sheltered'], excludes: ['maker'] },
  { id: 'activity-warming-hands', category: 'activity', label: 'holding a small warm cup with both hands', tags: ['quiet', 'restful', 'cup'], requires: ['person'], temperature: 'cold' },
  { id: 'activity-sorting-seeds', category: 'activity', label: 'sorting seeds into simple paper packets', tags: ['quiet', 'focused', 'paper'], requires: ['person', 'gardener'] },
  { id: 'activity-shaping-bowl', category: 'activity', label: 'finishing a small clay bowl at the workbench', tags: ['quiet', 'focused', 'ceramic'], requires: ['person', 'maker', 'studio'] },
  { id: 'activity-slow-walk', category: 'activity', label: 'walking slowly along the edge of the scene', tags: ['gentle-motion'], requires: ['person', 'outdoor', 'ground'], excludes: ['resting', 'maker'] },
  { id: 'activity-watching-distance', category: 'activity', label: 'pausing to look into the distance', tags: ['quiet', 'contemplative'], requires: ['person', 'outdoor'] },
  { id: 'activity-pet-rest', category: 'activity', label: 'resting with a loose, natural animal posture', tags: ['quiet', 'restful'], requires: ['animal', 'pet'] },
  { id: 'activity-chasing-ball', category: 'activity', label: 'chasing a ball in a small arc across the field', tags: ['playful', 'gentle-motion', 'ball'], requires: ['animal', 'dog', 'outdoor', 'ground'], excludes: ['urban', 'sheltered'], phases: ['morning', 'day', 'dusk'] },
  { id: 'activity-bird-perching', category: 'activity', label: 'perching quietly with relaxed wings', tags: ['quiet', 'restful'], requires: ['animal', 'bird'] },
  { id: 'activity-bird-gliding', category: 'activity', label: 'gliding far above the landscape with wings extended', tags: ['gentle-motion', 'expansive'], requires: ['animal', 'bird', 'outdoor'], phases: ['morning', 'day', 'dusk'] },
  { id: 'activity-deer-browsing', category: 'activity', label: 'browsing among low plants at the edge of the composition', tags: ['quiet', 'gentle-motion'], requires: ['animal', 'deer', 'plant'] },
  { id: 'activity-unoccupied-stillness', category: 'activity', label: 'stillness held by carefully spaced objects and open areas', tags: ['quiet', 'restful'], requires: ['empty'] },
  { id: 'activity-distant-cosmic-drift', category: 'activity', label: 'a suggestion of slow, immense drift in faint luminous layers', tags: ['quiet', 'expansive'], requires: ['empty', 'space'] },

  // Objects are optional visual anchors; they are not mandatory props for an action.
  { id: 'object-shaded-lamp', category: 'object', label: 'one shaded lamp casting a small pool of light', tags: ['lamp', 'metal'], requires: ['indoor'], phases: ['dusk', 'night'] },
  { id: 'object-wind-chime', category: 'object', label: 'a simple wind chime under the sheltered eaves', tags: ['chime', 'metal'], requires: ['terrestrial', 'sheltered'] },
  { id: 'object-folded-blanket', category: 'object', label: 'a neatly folded blanket with a softened edge', tags: ['fabric'], requires: ['terrestrial', 'sheltered'], temperature: 'cold' },
  { id: 'object-ceramic-teacup', category: 'object', label: 'an understated ceramic teacup on a small tray', tags: ['ceramic', 'cup'], requires: ['terrestrial', 'sheltered'] },
  { id: 'object-empty-chair', category: 'object', label: 'a single well-used chair with generous space around it', tags: ['furniture', 'woodwork'], requires: ['terrestrial', 'ground'] },
  { id: 'object-rowboat', category: 'object', label: 'a small moored rowboat placed off centre', tags: ['boat', 'woodwork'], requires: ['outdoor', 'water'] },
  { id: 'object-distant-buoy', category: 'object', label: 'one modest buoy far out on the water', tags: ['buoy', 'metal'], requires: ['outdoor', 'water'] },
  { id: 'object-paper-lantern', category: 'object', label: 'one low-glow paper lantern beneath a protective canopy', tags: ['paper', 'lantern'], requires: ['terrestrial', 'sheltered'], phases: ['dusk', 'night'] },
  { id: 'object-small-planter', category: 'object', label: 'a small plant in a handmade pot', tags: ['plant', 'ceramic'], requires: ['terrestrial', 'sheltered'] },
  { id: 'object-field-ball', category: 'object', label: 'a small worn ball near the open foreground', tags: ['ball'], requires: ['outdoor', 'ground'], excludes: ['urban', 'water'], phases: ['morning', 'day', 'dusk'] },
  { id: 'object-distant-star-cluster', category: 'object', label: 'a sparse, faint star cluster serving as the focal accent', tags: ['stars', 'luminous'], requires: ['space'], phases: ['night'] },
  { id: 'object-mineral-formation', category: 'object', label: 'a distant abstract mineral formation, clearly imagined', tags: ['stone', 'speculative'], requires: ['space'], phases: ['night'] },

  // Materials describe surfaces already present, or the substrate of the artwork.
  { id: 'material-aged-timber', category: 'material', label: 'subtle grain and wear in aged timber surfaces', tags: ['tactile'], requires: ['woodwork'] },
  { id: 'material-unglazed-clay', category: 'material', label: 'matte unglazed clay with slight handmade irregularities', tags: ['tactile', 'matte'], requires: ['ceramic'] },
  { id: 'material-soft-wool', category: 'material', label: 'soft wool fibres with restrained tactile detail', tags: ['tactile', 'soft'], requires: ['fabric'] },
  { id: 'material-patinated-metal', category: 'material', label: 'quietly patinated metal with muted reflections', tags: ['tactile', 'muted'], requires: ['metal'] },
  { id: 'material-old-stone', category: 'material', label: 'fine irregularities in time-worn stone', tags: ['tactile', 'matte'], requires: ['stone'] },
  { id: 'material-translucent-glass', category: 'material', label: 'thin translucent glass with very soft reflections', tags: ['translucent'], requires: ['glass'] },
  { id: 'material-cotton-paper', category: 'material', label: 'the quiet tooth of cotton drawing paper', tags: ['paper-substrate', 'matte'] },
  { id: 'material-grained-film', category: 'material', label: 'restrained fine film grain across the image', tags: ['film-substrate', 'muted'] },
  { id: 'material-smooth-pigment', category: 'material', label: 'smooth matte pigment with no artificial shine', tags: ['pigment-substrate', 'matte'] },

  // Styles are medium directions, independent of location or implied weather.
  { id: 'style-graphite-study', category: 'style', label: 'a detailed graphite drawing with delicate tonal transitions', tags: ['drawing', 'monochrome', 'pencil'], excludes: ['film-substrate'] },
  { id: 'style-coloured-pencil', category: 'style', label: 'layered coloured pencil with precise but gentle detail', tags: ['drawing', 'pencil'], excludes: ['film-substrate'] },
  { id: 'style-ink-wash', category: 'style', label: 'an ink wash painting with generous breathing room', tags: ['painting', 'ink'], excludes: ['film-substrate'] },
  { id: 'style-watercolour', category: 'style', label: 'transparent watercolour with controlled soft edges', tags: ['painting', 'watercolour'], excludes: ['film-substrate'] },
  { id: 'style-gouache', category: 'style', label: 'matte gouache with carefully shaped areas of colour', tags: ['painting', 'gouache'], excludes: ['film-substrate'] },
  { id: 'style-anime-background', category: 'style', label: 'a hand-painted anime background with restrained character detail', tags: ['painting', 'illustration'], excludes: ['film-substrate'] },
  { id: 'style-cinematic-still', category: 'style', label: 'a cinematic still with naturalistic textures and restrained contrast', tags: ['cinematic', 'naturalistic'], excludes: ['paper-substrate'] },
  { id: 'style-vector-poster', category: 'style', label: 'a minimal vector-like composition with carefully balanced shapes', tags: ['vector', 'graphic'], excludes: ['film-substrate', 'paper-substrate'] },
  { id: 'style-woodblock', category: 'style', label: 'a woodblock-inspired print with graceful contour lines', tags: ['print', 'graphic'], excludes: ['film-substrate'] },
  { id: 'style-oil-miniature', category: 'style', label: 'a finely observed oil-painting miniature with softened brushwork', tags: ['painting', 'oil'], excludes: ['film-substrate'] },

  // Framing keeps the screen comfortable; wide compositions remain common.
  { id: 'viewpoint-wide-negative-space', category: 'viewpoint', label: 'a wide composition with abundant negative space', tags: ['wide', 'restful'] },
  { id: 'viewpoint-low-horizon', category: 'viewpoint', label: 'a low horizon with the setting extending far into the distance', tags: ['wide', 'expansive'], requires: ['outdoor'] },
  { id: 'viewpoint-window-frame', category: 'viewpoint', label: 'a view framed by the interior edge of a window', tags: ['framed', 'intimate'], requires: ['indoor'], excludes: ['space'] },
  { id: 'viewpoint-doorway-frame', category: 'viewpoint', label: 'a gentle view from a sheltered doorway', tags: ['framed', 'intimate'], requires: ['terrestrial', 'sheltered'] },
  { id: 'viewpoint-distant-observer', category: 'viewpoint', label: 'a distant observer view with small figures and no facial close-ups', tags: ['wide', 'observational'], requires: ['terrestrial'] },
  { id: 'viewpoint-ground-level', category: 'viewpoint', label: 'a calm ground-level view with layered foreground shapes', tags: ['layered', 'low-view'], requires: ['ground'] },
  { id: 'viewpoint-water-reflection', category: 'viewpoint', label: 'a balanced composition allowing quiet reflections to occupy the lower half', tags: ['reflection', 'balanced'], requires: ['outdoor', 'water'] },
  { id: 'viewpoint-slightly-elevated', category: 'viewpoint', label: 'a slightly elevated view with clear, unhurried spatial relationships', tags: ['elevated', 'observational'], requires: ['terrestrial'] },
  { id: 'viewpoint-cosmic-panorama', category: 'viewpoint', label: 'an immense panorama with tiny focal accents and deep dark margins', tags: ['wide', 'expansive', 'dark-margins'], requires: ['space'], phases: ['night'] },
  { id: 'viewpoint-asymmetric-balance', category: 'viewpoint', label: 'an asymmetrical composition with one focal area balanced by open space', tags: ['asymmetric', 'restful'] },
];
