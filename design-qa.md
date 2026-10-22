# Heartbeat design QA

final result: blocked

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
