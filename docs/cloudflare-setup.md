# Earlier prototype: activate Heartbeat AI locally

**For the current account-based application, use [the product activation guide](product-build.md).** This page documents the earlier `/local-study` shared-key prototype. Customers now sign in without a display access key.

The server, attempt ledger, private image storage, client playback and evaluation controls are connected. AI remains off until you enable it. Local database setup has already been applied in this checkout and `.dev.vars` was created with a generated display access key. Its contents are ignored by Git.

## Your steps

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/). Go to **Workers AI → Use REST API**. Create a Workers AI API Token and copy the Account ID from the same screen. If creating a custom token, scope it to your account with Workers AI Read and Edit permissions. See [Cloudflare's official instructions](https://developers.cloudflare.com/workers-ai/get-started/rest-api/).
2. Open `.dev.vars` in this project in your editor. Fill `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, and change `HEARTBEAT_AI_ENABLED=false` to `true`. Keep the generated `HEARTBEAT_AI_ACCESS_KEY`, origin and initial limit. Do not paste the provider token into chat or a browser form.
3. Restart `npm run dev`. Open **http://localhost:5173/local-study**, choose your city, then open settings → **AI connection and picture review**. Enter the **display access key** from `HEARTBEAT_AI_ACCESS_KEY` and choose **Connect AI**. This key is separate from the Cloudflare token. The panel must show **Connected** and the shared daily usage. Local HTTP aliases (`localhost`, `127.0.0.1`, IPv6 loopback) work on the same configured port; requests still require their exact same Origin. Production hosts require the exact configured origin. Browser cookies are separate for each hostname, so reconnect when switching addresses.
4. The first generated picture prepares while the existing artwork stays visible. Once it appears, rate context fit, restfulness, composition, freshness and coherence. More/less scene feedback influences later planning; ratings can be exported.

If the Cloudflare dashboard requires account/model setup, complete that there. Changing local settings does not configure a cloud account. Keep inference enabled only when you intend to use it.

This display key is a local development gate, not customer onboarding. A paid product needs customer accounts, server-verified subscriptions/entitlements, per-customer usage budgets and isolated image/memory ownership. Provider credentials stay with Heartbeat's server. The earlier prototype has no customer billing/accounts, and customers should not be asked to supply either a provider token or this shared development key.

## Initial limits and behaviour

- The generated setup file allows **three preparation attempts per UTC day across all sessions/tabs using this database**. One attempt permits at most one director request and one image request. Failed work, interrupted work and director-only HOLD decisions remain counted. This is an attempt cap, not a guaranteed dollar cap.
- A session has a ten-minute minimum interval and one in-flight lease. A director HOLD extends that interval to an hour. Reloading, reconnecting and resetting creative history do not reset the ledger. The server fallback limit, when the setting is absent, is eight; configured values are clamped to 1–24.
- The default director is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, chosen for documented JSON-mode support. It is not a claim that this is the cheapest/best creative model. The smaller `@cf/meta/llama-3.1-8b-instruct-fp8` is configurable, but its live structured-output reliability still needs comparison before switching. There is no automatic paid fallback or repair call.
- Images use `@cf/black-forest-labs/flux-1-schnell`, four steps. Its contract does not promise seed control or landscape dimensions; playback crops the result to the screen.
- Generated images are private to a signed, expiring browser AI session. Application access requires the separate display key. Provider tokens stay on the server.
- The browser decodes before replacement. Night artwork is sampled after cropping and rejected when too bright under provisional thresholds. This is a comfort check, not an artistic-quality or monitor-brightness guarantee. Exact duplicate JPEG bytes are rejected; visual uniqueness still needs human evaluation.
- R2 retains recent candidates, with best-effort cleanup after preparation: the most recent eight noncurrent images per session, plus its current image. Noncurrent/expired-session images older than seven days are eligible for cleanup. The attempt ledger remains intact. This is request-driven retention, not a scheduled production cleanup service.
- Generation uses a foreground request with a durable attempt record and fenced lease. A lost response can retrieve the prepared result without running inference again. A worker interrupted mid-inference may still leave a spent failed attempt. A durable background queue remains production work.

## Optional live diagnostic

After enabling the server, `npm run ai:smoke` makes **one counted live preparation attempt** through the normal session/budget routes for London. `npm run ai:smoke -- tokyo` uses Tokyo's current context instead. It saves a JPEG and a small result report in ignored `outputs/`. It prints no credentials and does not acknowledge the picture as displayed. Do not run it repeatedly as a retry strategy; each new invocation can consume another allowance.

For a fresh clone, install dependencies, run `npm run build`, then `npm run ai:prepare`. Preparation only changes the local database, adds the new AI schema if missing and creates `.dev.vars` if absent. Existing setup files are preserved. It does not deploy or create cloud resources. Production deployment must apply the appended migrations and configure secrets on its own target.

## Verification completed and still needed

`npm run test:ai` covers actual SQLite transactions with mocked provider/R2 operations, concurrent claims, global limits, spent failures/HOLDs, replay, private image access, signed sessions, ACK ordering, expired-lease fencing, retention failures and duplicate bytes. A simulated-DOM integration exercises free-first playback, one funded request, pause/resume, generated image adoption, display ACK, cooldown, lost-response recovery at the cap, and stale nighttime candidate rejection. Core tests additionally cover hiding/pausing during full-length fades.

On October 20, 2026, two counted live preparation tests passed using JSON-object mode, the explicit contract in model instructions and strict application validation. Each completed director reasoning, image generation, private storage and authenticated JPEG retrieval. London returned the daytime illustration "Autumn Orchard Serenity" (1024-square, 824,369 bytes); Tokyo returned "Autumn Night Reflections" near midnight local time (1024-square, 414,707 bytes). Both images were visually inspected. A 32-by-20 point sample of the night image's centered 16:9 crop had mean brightness 0.192 and bright fraction 0.0031, within provisional thresholds. This is an approximate offline diagnostic, not a browser canvas or monitor test. Reports and images are in ignored `outputs/live-ai-*` files. Two of three attempts were used that UTC day; the ledger and cap were not reset or raised.

The preceding day's three rejected requests returned HTTP 400/code 8007 with JSON/schema error hints. JSON-object mode resolved that observed failure in these two live requests. This small sample does not establish reliability across every model response.

These tests do not establish artistic quality. There is no connected browser surface in this environment; real browser screenshots, monitor behaviour and a real unattended overnight run remain unverified. After the first live picture, leave the display running across dusk/night and revisit it the next morning, checking for blank frames, unwanted brightness, repetition and broken time/temperature. Keep feedback optional and judge the whole room experience as well as individual pictures.

## Connection and weather correction

The printed `127.0.0.1` dev URL previously failed the `localhost` origin configuration. Both aliases now pass real HTTP session/status checks; cross-origin requests, other ports, lookalike hostnames and loopback requests against a production configuration remain rejected in regression tests. The panel explicitly shows connected/disconnected/preparing state, current free-versus-AI artwork and completion of manual checks. Simulated-DOM tests cover rejected login, retry, successful connection and visible usage without making inference requests.

Weather codes were fetched but absent from the director packet. `lib/weather-mood.ts` now maps fresh Open-Meteo WMO conditions (including drizzle, rain, overcast and fog) into both model context and sampled inspiration. Unknown/stale data cannot invent conditions. Local fallback planning avoids sunny meadow selection in subdued weather and considers meaningful condition changes after the minimum hold. Settings show the actual provider weather estimate. The two earlier live images predate this correction; no extra image request was used to validate it, preserving the remaining daily attempt for browser evaluation.
