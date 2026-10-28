# Heartbeat design QA

current result: browser checks passed for the new demo/onboarding; full visual/device qualification remains open

## 27 October browser inspection

Browser access is now available through an isolated real Chrome/CDP session. The new `/demo` intro and city/style/ready onboarding were captured at 1440 × 900, 768 × 1024 and 390 × 844. The player was also checked in ultrawide and 4K browser windows. Reports found no horizontal overflow or broken images across 18 views, no reported console errors, real fullscreen entry and real ten-second image progression. Demo playback made zero API calls. Customer generation/geocoding were intercepted for this visual run; a separate live provider test exists in `docs/architecture-validation.md`.

The demo intro's automated design inspection reports zero findings at desktop/tablet/phone widths. Explicit exceptions preserve Heartbeat's approved ivory artwork palette and the oversized title of this immersive entry screen; they are not exceptions for controls or forms. Screenshots were physically inspected. Revisions reduced the heading to two lines, retained Manrope instead of a serif fallback, improved image scrim legibility, kept touch transport targets at 44 px, and removed an inappropriate visible heading-focus outline while preserving control focus states. Onboarding resets scroll and focuses each new step before paint.

The player capture harness initially showed a 44-pixel top shift and bottom band after mixing fullscreen with emulated viewport changes. Fresh-page windowed captures at 1440/390 are correct, with root bounds equal to the viewport, zero scroll/visual-viewport offsets and intact headers. A separate fresh page entered/exited actual fullscreen successfully. This was a capture artifact; no compensating CSS offset was added. Local screenshots/reports are under ignored `outputs/customer-journey-browser`, `outputs/design-demo-final` and `outputs/demo-windowed-qa`.

The reviewed new screens share the approved navy/ivory/Manrope brand, give the artwork most of the screen, keep one clear step/action at a time and identify prepared/illustrative content. The desktop demo and mobile onboarding are coherent with that direction. A further real-browser review of landing/pricing/registration found the new demo link touching the primary landing invitation. Scoped flex placement and spacing fixed it; fresh 1440/390/320 captures were inspected, with separate actions, clear nav/heading/rail and no horizontal overflow. Narrow sign-in navigation is kept on one line. Evidence is in ignored `outputs/landing-final-qa`.

The built-preview check also caught incompatible client-side routing when leaving the isolated recording player. Its exit/sign-up links now use full-document navigation, which discards playback/fullscreen state and matches the established application navigation. The scoped lint exception records that intent; correctness is checked in the built browser, separately from simulated DOM tests.

This is a bounded screenshot/interaction review, not a claim of pixel fidelity to either reference website or a completed accessibility/performance audit. The existing studio and physical devices still need broader acceptance, as do keyboard/screen-reader review, night comfort and battery measurements.

## Historical browser-access limitation

## Target

Original combined mockup: `docs/design/heartbeat-target.png`, generated after the user chose the second concept's living-glass visual with the third concept's minimalism. The image was opened and inspected. New organism/rain/sun/night assets were separately generated and inspected.

## Implementation

Updated `components/product-shell.tsx`, `components/customer-app.tsx` and `app/product.css` in the existing application. Local dev address: `http://localhost:5173/`. No new prototype runtime or public deployment was created.

## Blocking evidence gap

Browser inventory returned no browsers or native app surfaces. In-app browser creation was unavailable. The reference websites could be researched through their public HTML/JavaScript, but no rendered reference or implementation screenshot could be captured. No same-viewport combined visual comparison is possible, so this report cannot pass visual fidelity or make screenshot-based findings.

## Required fidelity surfaces still unverified

- Fonts/typography: actual font loading, wrapping and hierarchy at desktop/mobile viewports.
- Spacing/layout rhythm: hero composition, nav/CTA clearances, mobile rail and account screens.
- Colours/tokens: actual image/text contrast, active/focus/disabled states and daylight readability.
- Image quality: object-fit crops, responsive sharpness, compression/loading and night comfort on devices.
- Copy/content: visible line breaks, illustrative labels, errors, private empty states and membership wording.

React DOM tests cover selector synchronization, reduced-motion state, hidden-tab pausing, account navigation and the main forms. HTTP checks, type checks and production builds establish different properties; they do not replace the missing comparison.

## Next QA steps

Capture the target-equivalent landing at 1440 × 1024 and a narrow mobile viewport, then sign-in, studio, atmosphere and preview states. Put each source/implementation pair in the same comparison input. Review the five surfaces above, keyboard/touch operation and frame rate/battery. Fix actionable P0/P1/P2 issues and capture again before changing `final result` to passed. Native wallpaper/screensaver testing remains separate.

## Screenshot follow-up ? 22 October 2026

The user supplied three baseline screenshots showing a fixed studio link colliding with the brand, artwork status colliding with the clock, an unwanted developer-oriented creative panel and an unnecessary free-tier recent-art area. Those screenshots were inspected. Source fixes now use a common grid/wrapping header, simplified customer feedback, paid-only recent overview and softer rotating landing imagery. The new opening imagery intentionally varies from the original single-sculpture mockup at the user's request.

Automated interaction and layout-structure checks pass, including blocked storage and revisit selection. No browser surface is available for a fresh rendered capture or same-viewport comparison. The final result remains blocked; these fixes must not be described as pixel-verified.
