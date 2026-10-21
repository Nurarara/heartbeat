# Step 2 testing — 2026-10-15

The local display passed the checks below after fixing a backward-clock history bug. These results qualify the local rule/SVG prototype; they do not qualify live AI generation or native screensaver integration.

| Check | Result and scope |
| --- | --- |
| `npm run test:ambient` | Passed preferences, timezone/DST, context validation, creative policy and actual React components in a simulated DOM. Includes a 24-hour accelerated playback session, exact holds, nighttime return, hidden decoding, pause/resume, bounded memory, reload and automatic retry. |
| Additional interaction/recovery cases | Passed keyboard city selection, blocked browser storage, city request isolation, offline weather, ten rapid manual requests during full-duration crossfades, removal of interrupted frames and image URL cleanup. Only the last completed fade enters history. |
| `npm run test:soak` | Passed 3,535 decisions and 1,211 rendered moments. Seven separate week-long simulations cover London/New York DST end, Sydney DST start, tropical year-end, polar summer, southern summer and leap day. Includes weather loss, temperature swings, quiet hours and saved-memory round-trips. |
| `npm run test:live` | Passed against the running local server: home page, real London/Tokyo/Sydney geocoding, fresh selected-city outdoor context, invalid location/timezone rejection and all six renderer modules. Requires a running dev server and network access to Open-Meteo. Results describe this run, not future upstream availability. |
| `npm run test:prototype` | Passed deterministic artwork, variation, safe independent SVG IDs and context/recipe validation. |
| Existing world/pulse/story domain scripts | Passed timezone, legacy playback/policy, bounded committed history, structured directions and bundled image validation. |
| TypeScript | `tsc --noEmit` passed. |
| Active-display lint | Passed with zero warnings/errors for `app/live-heartbeat.tsx`, `components/ambient-art.tsx`, `hooks/use-ambient-director.ts`, `lib/ambient-director.ts`, `lib/ambient.ts`, `lib/context.ts` and the context/location API routes. This was a targeted check, not a repository-wide lint claim. |
| Production build | Passed after the fixes. |

## Fixes made during testing

- A reproduced backward-clock correction caused newly saved history to include future/out-of-order timestamps. The reload validator then rejected it. Committing a new moment now removes history later than its display time; the regression check passes.
- Latest-prop/callback refs now update after React commits instead of during rendering. This prevents asynchronous playback from seeing values from a render React abandons.
- Browser search/storage initialization is deferred and cancellable. Removed a redundant state-setting effect, corrected effect dependencies/focus cleanup and typed the upstream context payload without `any`.

## Remaining verification

No real browser walkthrough or screenshots were possible in this session. The connected-browser inventory was empty, opening the in-app browser returned `Browser is not available: iab`, and Windows Computer Use returned `failed to connect native pipe` (`os error 2`).

The DOM checks exercise React and asynchronous lifecycles, but do not verify CSS layout, actual browser image decoding, visual crossfade quality, fullscreen, wake lock, mobile layout or browser memory use. Full-duration fade timers were exercised; their pixels were not inspected. Prior SVG raster inspection is artwork evidence only.

The multi-day checks advance a simulated clock. They are not an hours-long unattended browser run. Real desktop/mobile browser testing, a real-time soak and credentialed model/image generation remain open.
