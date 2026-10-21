# Reference study and chosen direction

Date: 21 October 2026. User references: [3D Discovery](https://www.3d-discovery.fr/en) and [Shift](https://shift.vml.dev/).

## What was directly inspected

Public HTML and a bounded selection of publicly served JavaScript were downloaded for read-only source research. No third-party code, images, fonts or shaders were copied into Heartbeat. Temporary reference downloads stay under ignored `outputs/design-references/`.

- 3D Discovery presents browser-based spatial exploration, guided tours and contextual information. Its delivered scripts contain WebGL/canvas components, ScrollTrigger integration and explicit reduced-motion checks.
- Shift's delivered HTML is deliberately sparse: a menu, manifesto/explorations paths, contact and a scroll-to-discover invitation. Its `ShowroomScroll` component imports ScrollTrigger and contains canvas/WebGL logic. `HoverBulge` contains texture/shader and mouse-uniform handling. Its base layout includes Lenis-related scrolling logic. These are source observations, not a claim to have watched or measured the rendered effects.

The web text reader initially could not open Shift. Direct HTTP retrieval subsequently worked with ordinary browser request headers. Browser inventory still exposed no controllable browser. There are no reference screenshots or verified motion recordings.

## Interpretation for Heartbeat

The useful common direction is an experience-led site: large visual space, very little interface, movement tied to interaction/scroll and a reason to explore. For Heartbeat this suggests a living visual metaphor, art before feature lists, restrained navigation and clear entry into the ambient experience.

The user selected the second generated concept's liquid-glass organism and the third concept's minimalism. The combined generated target is `docs/design/heartbeat-target.png`. It is an original mockup, not a capture or clone of either reference site.

## Current implementation

- Navy/coral full-height hero, self-hosted Manrope and Barlow Condensed, one primary invitation and synchronized Rain/Sun/After hours selectors.
- Text-free generated organism asset with limited breathing and pointer transforms; no real-time 3D deformation or shader rendering is claimed.
- Native anchor scrolling, a calmer ivory manifesto and invitation, full-bleed illustrative art preview, consistent sign-in and studio styles.
- Reduced motion disables effects. Hidden-tab motion pauses, and IntersectionObserver pauses hero breathing when offscreen. No artificial loading gate or scroll hijacking.
- Landing previews make no runtime inference requests. Sample city/time/weather are explicitly illustrative. Account generation and ambient comfort remain separate from promotional motion.

A full WebGL layer is a possible future step, subject to CPU/GPU/battery, accessibility and product-value measurement. Browser visual comparison remains blocked; see `design-qa.md`.
