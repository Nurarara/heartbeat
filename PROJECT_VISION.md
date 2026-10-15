# Heartbeat: rationale, scope and future vision

## The idea

Heartbeat turns a screen into a living visual surface. A person supplies their city. The system resolves local time, date and outdoor temperature, interprets what those signals mean for atmosphere, and creates an evolving visual experience that can be left running in a room.

The product's value is the feeling it creates in a space: calm, warmth, energy, shelter, quiet or a sense of a day unfolding. Its long-term category is **adaptive ambient computing and living visual surfaces**.

The first question is practical: **Will people enjoy leaving this running in their room?** A beautiful screenshot, a working weather call or a simulated image sequence does not answer that question by itself.

This document distinguishes the intended product from the existing prototype. The current status and implementation map are in [README.md](README.md).

## The latest product contract

The October product correction supersedes the earlier name/style/vibe onboarding concept for the default first version.

| Decision | Current intended direction |
| --- | --- |
| Opening | The name `heartbeat` and one city input. |
| Setup | Resolve the city and timezone, then begin. No name, style or vibe questionnaire. |
| Ambient display | Artwork, accurate time and outdoor temperature. |
| Date | An input to reasoning; no extra permanent date UI is required by the latest direction. |
| Core intelligence | Interpret time, temperature and date together to choose what the artwork communicates. |
| Creative decisions | The system chooses subject, activity, composition, lighting and atmosphere. |
| Continuity | Maintain a coherent aesthetic and believable development, while allowing new subjects and views. |
| Heartbeat | Consider the world roughly every ten minutes; expensive generation is conditional. |
| Interaction | Controls appear when needed and disappear while the display is left alone. |
| Reliability | Keep the current artwork visible until a valid replacement is ready. |

Additional weather signals may improve interpretation later, but the basic experience must be convincing with time, temperature and date. Existing weather collection is an implementation detail, not a reason to add weather cards, forecasts or more questions.

## Why these choices

### One city input

The user is choosing an atmosphere for a room, not configuring a creative workstation. Asking for a name, a style and a carefully written vibe places creative work on the person before they have seen the value.

City input provides the geographic reference needed for a timezone and local-area temperature. The system should carry the remaining creative burden. Location disambiguation can remain within that one input rather than becoming a second onboarding flow.

The city should be remembered so later visits can return directly to the display. A quiet way to change it is useful; repeated onboarding is not.

### Time, temperature and date as the first reasoning inputs

These inputs are easy for a person to understand and rich enough to test the core idea. They describe the rhythm of a day, the likely relationship between outside and shelter, and the seasonal context of a place.

They do not tell us everything. A local-area temperature estimate does not establish an indoor measurement. Date and latitude can suggest season, but a tropical location should not be assigned a temperate autumn aesthetic merely because it is October. Time and date alone do not justify inventing rain, a festival or a particular moon phase.

Good reasoning uses what is known, makes restrained inferences and avoids filling gaps with confident fiction.

### Minimal overlays

Clock and temperature are reliable information the display can offer without becoming a dashboard. Render them through application code, independently of the artwork. A generated clock face or temperature label can be wrong and becomes stale immediately.

Style labels, scene titles, preview indicators, progress counters and reasoning explanations compete with the atmosphere. Diagnostics may remain in developer tools, but they should not become permanent furniture on the user's display.

### A heartbeat rather than a fixed slideshow

A slideshow advances because a timer elapsed. Heartbeat should respond because the environment or temporal story justifies a change.

The heartbeat has three broad outcomes:

| Outcome | Appropriate situation | Intended response |
| --- | --- | --- |
| Hold | Conditions and story remain meaningfully stable. | Keep the current frame and its gentle motion. |
| Animate | A small shift can be expressed without new scene content. | Adjust restrained lighting, movement or an appropriate lightweight effect. |
| Reimagine | The next state needs visible semantic change. | Direct and generate a fresh frame in the background. |

The target cadence is approximately ten minutes, not a biological pulse animation. The relationship between the local environment and the world's mood is what gives the product its heartbeat.

### Continuity without captivity

The original implementation preserves a camera, a room, recurring objects and the same sleeping cat very aggressively. That was useful for a controlled reference-editing experiment. It became a poor creative default when it prevented anything genuinely new from happening.

The next memory design should distinguish:

- **Lasting identity:** aesthetic, colour language, atmosphere and selected recurring themes.
- **Evolving state:** lighting, activity, temperature cues, objects in use and consequences of recent events.
- **Creative freedom:** a different view, new activity or subject, or a new chapter that still feels part of the same experience.

A new image should have a reason to exist. Preserving the exact room forever is not the definition of continuity, and replacing it with unrelated images is not meaningful evolution either.

The sleeping cat is a test asset, not the product's permanent subject. `Cute anime` is an inherited prototype preference, not a justified badge or a required default identity.

### Software before hardware

A browser-based experience is the fastest way to investigate the atmospheric value across screens people already own: laptops, monitors, tablets, TVs and projectors where browser capabilities permit it.

Hardware introduces sourcing, certification, support, returns and inventory before the experience has been validated. Dedicated frames can come later if people repeatedly choose to keep the software running.

### Browser ambient mode before native OS integration

The first delivery is an immersive browser display. Fullscreen presentation, hidden controls and best-effort wake lock support that use case.

A native screensaver that activates automatically when a computer is idle is a separate integration. It requires platform-specific work, installation and lifecycle testing. A fullscreen web page should not be described as having completed that native behaviour.

## What the reasoning should do

The director should ask what the scene ought to communicate given the supplied context and its recent history. It should produce a small, concrete plan that an image generator can follow.

For example, a warm afternoon could invite an airy, unhurried scene with daylight and activity appropriate to the established aesthetic. A colder evening could invite shelter, warmer interior light, quieter activity or heavier clothing where people are present. A date can inform seasonal colour and length of day without requiring a holiday or news lookup.

There should be no universal rule such as `12°C = blue bedroom` or `night = sleeping cat`. The same signals can support different beautiful interpretations. The system should choose coherently and avoid exhausting a small set of presets.

A useful structured direction includes:

1. A hold, animate or reimagine decision and a short reason.
2. The intended atmosphere and next scene state.
3. The meaningful visual changes.
4. What must remain recognisable.
5. A prompt grounded in the actual previous image and permitted context.
6. A memory update that becomes history only after successful display.

Structured output helps validation and debugging. It does not itself prove that the reasoning or generated art is good.

## The complete first-version loop

At any point there should be a current frame. A future frame can be prepared independently.

1. Resolve the selected city and local timezone.
2. Collect fresh local-area temperature and derive local time/date.
3. Load the actual current frame, relevant references and bounded memory.
4. Evaluate whether a new visual state would add meaningful value.
5. If holding, keep the world running and schedule the next check.
6. If adjusting, apply an appropriate lightweight change without a generation call.
7. If reimagining, create structured direction and generate in the background.
8. Check format, dimensions, decodability and eventually semantic/continuity quality.
9. Prepare the candidate without clearing the current artwork.
10. Commit and transition when ready at the intended heartbeat. If late, keep the old frame until ready.
11. Record only what was actually displayed and begin preparing the next justified state.

An expensive call may fail, take longer than expected or return an unsuitable image. These outcomes must not become a loading screen in the room.

## Architecture choices and tradeoffs

| Choice | Why it was used | Tradeoff or next action |
| --- | --- | --- |
| React and TypeScript | Manage the player, controls and typed context/frame state in one web application. | A browser UI can grow too complex; simplify the visible product aggressively. |
| Vinext/Vite and a Worker runtime | Reuse the existing Sites-compatible application and server routes. | Portability and platform-specific build behaviour need independent verification. |
| D1 persistence | Store current/pending frames, context, version guards, attempts and memory durably. | Current ownership is cookie-scoped; account/device sharing is not yet a complete product model. |
| R2 artwork storage | Keep generated images server-side and separate image bytes from scene metadata. | Retention, cleanup, export and storage costs still need policies. |
| Rule-based environmental interpreter | Provide a transparent baseline and test the significance of changes cheaply. | It cannot substitute for rich AI direction or be marketed as an LLM. |
| Vision-capable AI director | Let scene planning refer to what the user actually sees, not only metadata. | Credentialed operation, latency, quality and cost remain unverified. |
| Reference-image editing | Reduce identity drift across related frames. | Too much preservation freezes the experience; allow deliberate creative evolution. |
| Structured world memory | Prevent constant resets and keep recent consequences available to the director. | The fixed world bible must be relaxed to match the latest continuity requirement. |
| Current/prepared frame slots | Hide generation latency and verify a candidate before replacement. | Stale candidates, interrupted requests and multiple tabs require careful coordination. |
| Foreground scheduling | Make an early prototype operate while its browser display is open. | Production generation needs a durable queue and recovery beyond one HTTP request. |
| Code-rendered overlays | Keep time and temperature accurate and independent of generated art. | Their visibility and layout must remain restrained across devices. |

These choices describe the current source and a likely evolution, not a claim that every component is already production-ready. Providers and models can change if evidence supports it; the user experience is the stable requirement.

## Immediate implementation order

### 1. Correct the opening and display

Replace the current setup with the brand and one city input. Remove the style badge, extra questionnaires, scene captions and demo links from the main experience. Keep only the intended overlays while idle. Preserve a quiet way to change city and control fullscreen.

### 2. Correct the creative contract

Revise the director prompt, schema and memory so an evolving world can contain new activity, subjects and views. Remove the permanent dependence on the reference cat scene. Make time, temperature and date sufficient inputs for the default experience.

### 3. Complete actual generation

Configure a provider securely, check model/account access, and run a real city/context-to-directed-image-to-display sequence. Measure the result rather than treating an implemented API request as completion.

### 4. Verify autonomous operation

Leave the display running through repeated heartbeats. Include stable periods, a significant temperature change, time-of-day transition, a failed generation, missing data and a hidden-tab return. Confirm no blank frame, duplicate consumption or broken local clock.

### 5. Build production reliability

Move paid work into a durable queue, define retry rules and ownership of attempts, handle interrupted requests, cancel stale work and enforce budgets across active displays. Establish storage retention and observability without leaking credentials or private context.

### 6. Validate the atmosphere with people

Ask people to leave it in their room, rather than just rate a screenshot. Observe whether they keep it running, return to it, dislike distractions or feel the imagery is repetitive. Improve the core before adding unrelated surfaces and features.

## First-version acceptance criteria

- A new user enters only a city and reaches the ambient display.
- The resolved timezone is correct, including local midnight and daylight saving changes.
- Time and outdoor temperature are accurate; unavailable temperature is not fabricated.
- Date influences reasoning without forcing extra permanent UI.
- At least one real AI-generated scene visibly reflects context.
- Multiple subsequent scenes introduce meaningful change while remaining coherent.
- Stable conditions can hold a scene without wasting an expensive generation.
- Artwork stays visible during preparation, errors and slow responses.
- The next image is checked/decoded before a seamless replacement.
- The experience continues autonomously while the supported display mode is active.
- Controls disappear during inactivity and remain accessible when requested.
- A multi-hour session and the chosen devices are actually tested before claiming support.

The existing simulated study is useful evidence about reference-image continuity and playback. It does not satisfy the real-generation or multi-hour acceptance criteria.

## What is deliberately deferred

Do not begin with hardware, advanced news intelligence, a large style picker, a weather dashboard, payments or commercial signage management. Do not create more demo routes as a substitute for finishing the main loop.

The current code contains laboratory and study routes because they helped explore behaviour. The product should not require users to visit them to experience its intelligence.

## Expansion after the core works

### Richer environmental context

Weather condition, feels-like temperature, sunrise/sunset, clouds, precipitation and wind may make interpretation more faithful. Some of this data is already collected by the prototype. Collecting it is different from proving its creative value.

### Optional visual direction

A future advanced preference could offer photorealistic, cinematic, anime, cute anime, manga, comic, pencil, ink, watercolour, oil, pixel art, collage, abstract, dark fantasy, minimalist, retro, cyberpunk, children's-book illustration or custom direction. This is an optional later layer, not a return to mandatory first-run questions.

Style determines how the world is represented. Environmental and temporal reasoning determines what happens within it.

### Temporal storytelling

Memory can support believable consequences: an activity begins, a scene becomes busier, daylight fades, people leave, and the environment settles. Recurring themes or characters may return without becoming an unchanging composition.

### World-awareness controls

Later, users could opt into sensitivity to culture, sport, local events, holidays, news or civic context. Deeper reasoning might be used occasionally, such as approximately once per ten meaningful generations, if its value and cost justify it.

Any event influence should be subtle and verified. Sensitive categories should be optional. Civic atmosphere must remain neutral: no candidate endorsements, party promotion, political persuasion or visual coding of political outcomes as good or bad. The display must not become a news feed.

## Economics: AI Moments

An **AI Moment** is a meaningful expensive reimagination of the visual world. It is a product concept for budgeting value, not a requirement to expose tokens or technical image credits.

The proposed commercial direction is an annual subscription with a defined allowance of Moments, potentially with larger tiers or optional packs. Around $99 per year was an early hypothesis, not a validated price. Premium reasoning could be metered separately if it creates enough additional value.

Do not promise unlimited expensive cloud generation. A ten-minute decision loop can run often while generating much less frequently. Economics should be based on observed usage:

`annual contribution = subscription revenue - generation - reasoning - weather/data - storage/delivery - other variable service costs`

Measure both average and heavy usage, failed attempts, multiple displays, image quality settings and support costs. Provider prices and access conditions must be verified at the time of a commercial decision. The current 24-attempt limit is a prototype guardrail, not the business model.

## Surfaces and company direction

| Horizon | Potential surfaces | What must be true first |
| --- | --- | --- |
| Consumer software | Laptops, desktop monitors, tablets, browser-capable TVs and projectors. | People choose to keep the core experience running. |
| Dedicated displays | Desk displays, digital art frames, portrait/landscape posters and clock/display hybrids. | Stable software, device support and unit economics. |
| Business spaces | Cafés, hotels, offices, restaurants, spas, clinics, gyms, co-working and retail. | Reliable unattended operation and suitable content controls. |
| Large installations | Malls, airports, events, public installations, signage and billboards. | Fleet control, editorial governance, monitoring and commercial contracts. |

The common asset should be a context engine that can interpret the world and direct suitable visual atmosphere for different surfaces. Surface expansion should follow demonstrated value rather than precede it.

## Open product questions

1. How much visible change is enough to feel alive without becoming distracting?
2. When should the director preserve a place, shift viewpoint, introduce a subject or begin a new chapter?
3. How much animation adds value compared with a still image and gentle motion?
4. What generation allowance can support a compelling annual subscription?
5. What evidence shows people want this beyond the novelty of the first session?
6. Which display category has the strongest repeat use before hardware is considered?

The next milestone should answer these through a real city-only ambient experience and sustained use. Additional interface complexity is not evidence of progress toward that goal.
