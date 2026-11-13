# Heartbeat — product strategy and feature roadmap

Created 13 November 2026. This is the record of what Heartbeat should become and what has to be done. [PROJECT_VISION.md](../PROJECT_VISION.md) covers the current experience, architecture decisions and launch blockers. This document adds the strategy and feature roadmap on top of that.

Tick items (`- [x]`) as they ship. Every feature below is an idea until it has been built and tested with real users. Nothing here is a promise to customers.

## Strategic position

**Heartbeat is a delight product, not problem-solving SaaS.** It doesn't remove a pain point. It makes a room or a screen feel better, in the same category as Spotify, Calm, Samsung Frame's Art Store and Wallpaper Engine. Delight products compete on taste, feel and identity rather than feature lists.

**The core is copyable.** Weather plus time plus an image model is a weekend project for anyone with AI tools. Building is no longer the hard part. Distribution, taste and accumulated assets are. So the roadmap deliberately favours things a clone cannot fast-follow:

| Moat | How Heartbeat builds it |
| --- | --- |
| Taste | Continuity, restraint at night, a distinct visual identity, never "AI slop on a timer" |
| Network | Features where each user brings another (linked windows, gifting, shared canvases) |
| Data and history | Accumulated personal history (year film, persistent world), archive-based features |
| Supply | Real artists publishing style packs with a revenue share |
| Distribution | Venue channels, frame/TV partnerships, app-store presence |
| Cost engineering | Caching, shared generations and pre-rendered libraries so margins work where a clone's don't |

**Platform risk.** AI labs absorb horizontal tools that every user needs (notes, whiteboards, chat). They are unlikely to build ambient art for TVs, frames and venues. The realistic competitive threat is display makers adding a similar feature (Samsung Art Mode, Google ambient modes), so speed, taste and partnerships matter more than raw features.

**The product test stays the same:** does someone choose to leave it running and come back to it?

## Guardrails for every feature

These carry over from the existing vision and apply to everything below.

- Context such as weather and time is a creative clue. Any feature that uses sensors, presence, audio or personal data is **opt-in**, processed on-device where possible, and honest about what it uses.
- Cultural and holiday cues are optional and subtle. Location alone never assigns someone's culture or beliefs.
- Night comfort beats novelty: no sudden bright frames, at night or in any mode.
- A fallback never pretends to be fresh AI artwork.
- Cost per user is measured before a feature ships to paying tiers.

## Phase 0 — launch the core (in progress)

The ordered launch blockers live in [PROJECT_VISION.md → Remaining work](../PROJECT_VISION.md#remaining-work-in-order): visual QA, unattended artwork qualification, email, Stripe sandbox, hosting, operations, Windows qualification, pricing and terms, then a private beta.

- [ ] Complete the Phase 0 list in PROJECT_VISION.md
- [ ] **Start storing displayed-frame history from day one.** The year film and persistent world depend on it, even though they ship later
- [ ] Private beta: get the first 100 people to keep it running (see the plan below)

## Phase 1 — make the core feel smarter

Cheap features that build on the existing time/weather/season context.

- [ ] **Circadian screen.** Calendar-aware art that sharpens before meetings and winds down at night like a sunset lamp. Ambient wellbeing with no notifications
- [ ] **Cultural calendar.** Moon phases, solstices and opt-in festivals and local events, applied subtly
- [ ] **Sunrise alarm.** At wake-up time the screen becomes a slow artificial dawn
- [ ] **Coming-home bloom.** Opt-in phone proximity: the art wakes up when you walk in

## Phase 2 — growth loops (network effects)

- [ ] **Linked windows.** Two screens in different cities share one artwork that blends both places' weather and time. Built for long-distance couples and families. Every sale brings in a second user, so this is the main growth engine
- [ ] **Gift a moment.** Send a scene to someone else's Heartbeat, such as a sunset from your city for their birthday
- [ ] **Multi-screen canvas.** Several screens in a room or building form one continuous artwork, so old tablets become a video wall
- [ ] **Share-worthy moments.** One-tap export of the current frame and short timelapse clips, with subtle branding

## Phase 3 — memory and personal data

- [ ] **Your year as a film.** The art evolves over the year. On 31 December, deliver a timelapse of the screen's year, made to be shared
- [ ] **Memory mode.** Upload photos and the art reinterprets them on their anniversaries
- [ ] **Life streams.** Opt-in Spotify, Strava or step data shapes the art, so a good run day looks different from a lazy one
- [ ] **Dream canvas.** Voice-note a dream in the morning and it becomes that day's art, fading through the day

## Phase 4 — living world and senses

- [ ] **Persistent world.** One consistent generated landscape with fixed geography that you explore slowly over months. Its accumulated history is a moat
- [ ] **Serialised story.** A character lives in the screen and ages through the seasons, with weekly episodes
- [ ] **Ghost of your street.** Your area as it looked about 100 years ago, in the same season and light, built from historical archives and maps. Needs archive and licensing research
- [ ] **City mood painting.** Live city data (transport delays, air quality, football results, noise) drives one collective artwork. London first
- [ ] **Room-reactive art.** Opt-in, on-device audio energy only (volume and rhythm, never words). The art calms when the room is loud and comes alive at a party
- [ ] **Room sync.** Philips Hue and other smart lights match the art's palette
- [ ] **Generative soundscape.** Ambient audio generated to match the visuals

## Phase 5 — business layer and distribution

- [ ] **Artist style packs.** Real artists publish styles and earn a revenue share. This is the supply moat and a brand signal
- [ ] **Print your moment.** Order any frame as a physical one-of-one print through print-on-demand
- [ ] **Venue channels.** Branded, curated streams for hotels, cafés, pubs and offices (pairs with City mood painting)
- [ ] **Developer plugins.** An open API so other people can add data sources
- [ ] **Hardware and partnerships.** Digital frames, TV app stores and display-maker deals
- [ ] **Billboard crowd mode.** Passers-by shape a public screen from their phones. This is the long-horizon billboard path

## Phase 6 — cost and quality engine (runs alongside everything)

- [ ] Shared and cached generations for users with matching context (same city, weather and time band)
- [ ] Pre-rendered libraries with light per-user personalisation
- [ ] A smaller or cheaper runtime director compared on structured-output reliability and cost
- [ ] Long-run novelty and diversity measurement
- [ ] Premium tier: deeper reasoning and richer context, sold only after evaluations show a real difference

## First 100 users plan

The goal is learning what makes people keep it running, not revenue.

- [ ] Recruit from your own network, Reddit (r/battlestations, r/unixporn, r/malelivingspace, r/CozyPlaces), ambient and lofi communities, and Product Hunt
- [ ] Build in public: post a short clip of the screen changing through a rainy London evening
- [ ] Instrument retention: daily active displays, hours left running, and which moments get favourited or shared
- [ ] Interview 10 to 15 users about why they keep it running, or why they stopped
- [ ] Decide the Phase 1 and 2 order from what those users actually value

## How to use this file

- Tick items and add a date when they ship.
- Move ideas between phases as evidence comes in, with a one-line reason.
- Add new ideas under the phase they fit, marked as ideas until they're built.
