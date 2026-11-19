// Words for the company site at heartbeatart.co.uk: the journal, the principles and Labs.
// Every note describes what Heartbeat actually does today (see docs/how-heartbeat-works.md and the code it names).
// Plans are labelled as plans. Dates are publication dates (ISO, UTC).

export type Block = { h: string } | { p: string } | { list: string[] } | { quote: string };
export type Category = 'Notes' | 'Principles' | 'Release' | 'Company';
export type Entry = { slug: string; title: string; summary: string; category: Category; date: string; minutes: number; body: Block[]; href?: string };

export const APP_URL = 'https://app.heartbeatart.co.uk/';
export const WAITLIST_URL = APP_URL + '#request';
export const CONTACT = 'hello@heartbeatart.co.uk';

export const JOURNAL: Entry[] = [
  {
    slug: 'opening-early-access', title: 'Opening early access', category: 'Company', date: '2026-11-19', minutes: 2,
    summary: 'A small private test on Windows, Mac, Android, iPhone and the web. What testers get, and how to join.',
    body: [
      { p: 'Heartbeat paints a new original picture for the moment you are in: your time, your weather, the sun and moon, and your mood. It lives on your wallpaper, your screensaver and your lock screen, so you see it without opening anything.' },
      { p: 'Today we are opening a small, invite-only test. It is free while we test it, and nothing is charged.' },
      { h: 'What testers get' },
      { list: [
        'Windows: your wallpaper and screensaver, with an icon by the clock for moods.',
        'Mac: your wallpaper, and full-screen Heartbeat when your Mac is idle.',
        'Android: your lock screen picture, and a screensaver while charging.',
        'iPhone and iPad: a Home Screen app, and your lock screen picture through Apple’s Shortcuts.',
        'Any browser or TV: a full-screen display.',
      ] },
      { p: 'You sign in with your email and a six-digit code. There is no password.' },
      { h: 'What we want to learn' },
      { p: 'Do people keep Heartbeat as their lock screen and wallpaper after a week, and after a month? Is one new picture an hour the right pace? Which moods do people live with? During the test we record when a Heartbeat screen is open and for how long, the mood, and the type of device, as our privacy information explains. We never sell data.' },
      { h: 'How to join' },
      { p: 'Leave your email on the early access list at app.heartbeatart.co.uk. We read every request and invite people in small groups.' },
    ],
  },
  {
    slug: 'principles', href: '/principles', title: 'Heartbeat Principles', category: 'Principles', date: '2026-11-19', minutes: 4,
    summary: 'Calm first, private by design, dark at night, never the same twice. What we will and won’t build.', body: [],
  },
  {
    slug: 'how-heartbeat-decides-a-picture', title: 'How Heartbeat decides a picture', category: 'Notes', date: '2026-11-19', minutes: 4,
    summary: 'From a city, a clock and a forecast to one painting: the steps between a moment and a picture.',
    body: [
      { p: 'Every Heartbeat picture starts with a moment, not a prompt someone typed. Here is what happens between that moment and the painting on your screen.' },
      { h: 'Reading the moment' },
      { p: 'Heartbeat knows only the city you chose. From it, it works out your local time and date, the live weather, how high the sun is and from which direction, the phase of the moon, the cloud cover and the season.' },
      { h: 'Drawing ingredients' },
      { p: 'Next it draws one word from each of seven groups: a subject, an object, a place, a style, a twist, a viewpoint and a palette. There are 350 words in all. Words used recently are drawn less often, and at night only dark palettes can be drawn at all.' },
      { h: 'Applying your mood' },
      { p: 'Your mood adds one short instruction, shifts the colours and twists that can be drawn, and sets a brightness limit. A mood guides the feeling of a picture. It never replaces the moment, and it never overrides night darkness.' },
      { h: 'The director decides' },
      { p: 'A language model, Llama 3.3 running on Cloudflare Workers AI, receives all of this and must answer in a strict form: a title, a short reason, the image prompt, the lighting, and which ingredient words it used, at least two. An answer that breaks the rules is rejected before anything is painted, which costs almost nothing.' },
      { h: 'The painter paints' },
      { p: 'An image model, FLUX.2 on Microsoft Azure, paints the prompt in your screen’s shape: wide for a laptop, tall for a phone. It receives the scene, never your email.' },
      { h: 'The picture is checked' },
      { p: 'At night, and in dim moods, a painting must stay under a brightness limit. Exact repeats are rejected. Only then is the picture stored and shown, fading in slowly over the one before.' },
      { quote: 'A new picture is made only while one of your Heartbeat screens is in use. Nothing is painted while your devices sleep.' },
    ],
  },
  {
    slug: 'why-night-has-to-be-dark', title: 'Why night has to be dark', category: 'Notes', date: '2026-11-19', minutes: 3,
    summary: 'After sunset Heartbeat dims, then goes near-black. How the rule works, and what happens when a painting comes back too bright.',
    body: [
      { p: 'A screen in a bedroom or a living room at night should not light the room up. Heartbeat treats that as a rule, not a style.' },
      { h: 'How the rule works' },
      { p: 'Through the evening the sky in the picture follows the real sky. Once the sun is well below the horizon, only dark palettes can be chosen, and every painting is measured before it is shown. On a scale from 0 (black) to 1 (white), a night picture’s average brightness must stay at or below 0.32, and no more than 12% of it may be bright.' },
      { p: 'Screens come in different shapes, so the picture is measured three times: as a wide crop, as a tall crop and as a whole. It must pass all three. Some moods are dim at any hour: Sleep follows the night rule all day, and Romantic has its own gentler limit.' },
      { h: 'When a painting comes back too bright' },
      { p: 'Image models do not always listen. When a night painting comes back too bright, Heartbeat does not throw it away. It darkens it with a gentle tone curve that keeps small highlights readable while the whole picture sinks into shadow, until it passes. The scene stays the same; only its brightness changes.' },
      { quote: 'Moods can change the feeling of a night picture. They can never make it bright.' },
    ],
  },
  {
    slug: 'painting-the-real-sky', title: 'Painting the real sky', category: 'Notes', date: '2026-11-19', minutes: 3,
    summary: 'Golden hour, blue hour, a low winter sun and the moon’s real phase, worked out for any city.',
    body: [
      { p: 'Heartbeat does not guess the time of day from a clock alone. It calculates the sky.' },
      { h: 'The sun' },
      { p: 'For your city’s coordinates and the current moment, Heartbeat works out how high the sun is and its compass direction. The height decides the stage of the day:' },
      { list: [
        'Night: the sun more than 18° below the horizon.',
        'Astronomical, nautical and civil twilight: from 18° below up to sunrise or sunset.',
        'Golden hour: from the horizon up to 6°.',
        'Low sun: up to 20°.',
        'Day: up to 45°, and high sun above that.',
      ] },
      { p: 'So a December afternoon in London is painted with a low sun from the south-west, while the same hour in June is still bright day.' },
      { h: 'The moon' },
      { p: 'Heartbeat also works out the moon’s phase and position. A crescent in the painting is a crescent in the sky.' },
      { h: 'The clouds' },
      { p: 'Live cloud cover from the weather forecast decides how much of that sky you can actually see. On an overcast night, there are no stars.' },
    ],
  },
  {
    slug: 'never-the-same-picture-twice', title: 'Never the same picture twice', category: 'Notes', date: '2026-11-19', minutes: 2,
    summary: 'Creative memory: how Heartbeat keeps each picture new for one person.',
    body: [
      { p: 'Every Heartbeat picture is painted for one person and one moment. There is no stock library. To keep it that way, each account has a creative memory.' },
      { h: 'What it remembers' },
      { list: [
        'A fingerprint of recent pictures, built from their themes and prompts, so an exact repeat is rejected.',
        'How often each ingredient word has been used, so recent words are drawn less often.',
        'What you told it: on the display you can say a picture should come up more, or less.',
      ] },
      { h: 'An honest limit' },
      { p: 'Two pictures can still resemble each other, especially in the same weather at the same hour. We can promise that no picture is ever reused, and that Heartbeat keeps looking for somewhere new. We cannot promise absolute uniqueness.' },
    ],
  },
  {
    slug: 'eight-moods', title: 'Eight moods', category: 'Notes', date: '2026-11-19', minutes: 3,
    summary: 'Auto, Calm, Sleep, Cosy, Focus, Playful, Dreamy and Romantic, and what each one changes.',
    body: [
      { p: 'A mood guides how a picture feels. It never replaces the moment: the time, the weather and the sky still decide the scene.' },
      { list: [
        'Auto: the time and the weather decide everything.',
        'Calm: slow, peaceful and spacious, with soft light and gentle colours.',
        'Sleep: winding down. A near-black picture with tiny dim highlights and complete stillness.',
        'Cosy: sheltered warmth. Warm lamps, snug interiors and soft textures.',
        'Focus: a calm background for working, with simple shapes and plenty of empty space.',
        'Playful: whimsical and smile-making, with gentle humour. Still dark at night.',
        'Dreamy: surreal and otherworldly. Impossible places and a soft glow.',
        'Romantic: dim and intimate, with deep reds, purples and candlelight. Atmosphere only.',
      ] },
      { h: 'Changing your mood' },
      { p: 'Choose a mood in your studio, or from the Windows, Mac or Android app. Choosing a mood never starts a new picture; the next picture follows it. Calmer moods also fade in more slowly.' },
    ],
  },
  {
    slug: 'windows-1-4-1', title: 'Windows 1.4.1', category: 'Release', date: '2026-11-18', minutes: 1,
    summary: 'Heartbeat on the lock screen, and a wallpaper that wins over Windows Spotlight.',
    body: [
      { h: '1.4.1' },
      { list: [
        'Windows Spotlight and slideshows replace the desktop wallpaper by themselves, which hid Heartbeat’s. Setting the wallpaper now switches the background to Picture. Turning the wallpaper off, or uninstalling, puts your previous setting back.',
        'The menu by the clock shows the app’s version.',
      ] },
      { h: '1.4.0' },
      { list: [
        'Windows doesn’t let apps set the lock screen picture, but it can show a slideshow from a folder. Heartbeat now keeps its three newest pictures in Pictures › Heartbeat, and “Show on my lock screen…” in the menu opens the right settings with the steps.',
      ] },
      { p: 'Installed copies update themselves. To update now, right-click the Heartbeat icon by the clock and choose Check for updates.' },
    ],
  },
  {
    slug: 'android-1-2-0', title: 'Android 1.2.0', category: 'Release', date: '2026-11-18', minutes: 1,
    summary: 'A first-run screen that asks where Heartbeat should show.',
    body: [
      { list: [
        'After you sign in, a one-time “Where should it show?” screen offers your lock screen picture, your home screen wallpaper, and a screensaver while charging, with what each one does.',
        'Notifications still appear on your lock screen as usual.',
      ] },
    ],
  },
];

export const PRINCIPLES: { id: string; title: string; body: Block[] }[] = [
  { id: 'calm-first', title: 'Calm first', body: [
    { p: 'Most screens want something from us: a tap, a scroll, a minute more. Heartbeat starts from the opposite idea. A screen in your home can simply be beautiful, and it can know what kind of moment you are in.' },
    { p: 'Heartbeat never competes for your attention. There are no feeds, no streaks, no alerts and no ads. If a feature would make people look at Heartbeat more but feel no better, we will not build it.' },
  ] },
  { id: 'private-by-design', title: 'Private by design', body: [
    { p: 'Heartbeat needs your city, not your location. The services that decide and paint a picture receive the scene, not your email.' },
    { p: 'When Heartbeat one day senses more, such as the light in a room, that understanding will stay on your device. We do not sell data, and we do not track you across other sites.' },
  ] },
  { id: 'dark-at-night', title: 'Dark at night', body: [
    { p: 'After sunset, Heartbeat dims, then goes near-black, on every device. Every night picture is measured before it is shown, and a mood can never make the night bright.' },
  ] },
  { id: 'never-the-same-twice', title: 'Never the same twice', body: [
    { p: 'Every picture is painted for one person and one moment. Nothing is reused from a library, and Heartbeat remembers what it has shown so it keeps finding somewhere new.' },
  ] },
  { id: 'honest-about-ai', title: 'Honest about AI', body: [
    { p: 'Heartbeat’s pictures are made by AI. They are paintings of a moment, not photographs, and we never present them as real. When we show prepared examples, we say so. When a picture is imperfect, we would rather tell you than hide it.' },
  ] },
  { id: 'what-we-wont-build', title: 'What we won’t build', body: [
    { list: [
      'Advertising, sponsored pictures or feeds.',
      'Anything that watches a room through a camera or a microphone and sends it away.',
      'Streaks, badges or tricks that make people come back for their own sake.',
      'Selling or renting anyone’s data.',
    ] },
    { p: 'These principles will grow as Heartbeat does. When we change them, the date on this page changes too.' },
  ] },
];
export const PRINCIPLES_DATE = '2026-11-19';

export const QUESTIONS: { title: string; text: string }[] = [
  { title: 'Understanding a moment.', text: 'How can a system turn time, sky, weather and mood into a fitting creative decision?' },
  { title: 'Never the same twice.', text: 'How do we keep every picture new for one person, and for millions, without repeating ourselves?' },
  { title: 'Sensing without watching.', text: 'Can a room’s light and sound be understood on the device, with nothing personal leaving the home?' },
  { title: 'Measuring calm.', text: 'How do we know a space actually feels better, and hold ourselves to that instead of attention?' },
];

/** The direction of travel. Only "Now" exists today. */
export const HORIZONS: { when: string; reach: string; title: string; items: string[]; now?: boolean }[] = [
  { when: 'Now', reach: 'Your sky', now: true, title: 'A screen with a pulse', items: ['Time, weather, sun and moon for your city', 'Eight moods, dark and restful at night', 'Wallpaper, screensaver and lock screen on every device'] },
  { when: 'Next', reach: 'Your area', title: 'The pulse of your neighbourhood', items: ['Air quality, pollen, tides and moon events', 'Gentle festivals for your city', 'Shared windows: the sky over someone you love'] },
  { when: 'Later', reach: 'Your room', title: 'A room that answers', items: ['Lights that match the picture', 'The song you are playing sets the mood', 'Living-room TVs and picture frames'] },
  { when: 'Beyond', reach: 'Shared spaces', title: 'The ambient layer for places', items: ['Cafés, hotels, offices and waiting rooms', 'An open platform so any space can have a pulse'] },
];

export const sortedJournal = () => [...JOURNAL].sort((a, b) => b.date.localeCompare(a.date) || JOURNAL.indexOf(a) - JOURNAL.indexOf(b));
export const entryHref = (entry: Entry) => entry.href || `/journal/${entry.slug}`;
export function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}
