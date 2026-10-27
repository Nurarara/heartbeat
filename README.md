# Heartbeat

**A screen with a pulse.** Heartbeat is a context-aware ambient-art application: choose a city, then let original artwork respond to local time, real outdoor weather and the season. The core experience is artwork, a clock and temperature, with controls that recede while you leave it running.

**Status — 27 October 2026:** working local account application with guided city/style onboarding and a ten-image recording demo. Actual Chrome checks exercised the new journey and demo across 18 viewport cases; a live Cloudflare request also completed through the local durable pipeline. Staged recovery, authoritative creative memory, usage/cost ledgers, billing reconciliation and deletion safeguards remain in place. Real email/Stripe acceptance, hosted capacity, physical-device/overnight comfort and native Windows qualification remain outstanding. Billing is disabled; this is not a public commercial release.

Read [PROJECT_VISION.md](PROJECT_VISION.md) for the product reasoning, decisions and future scope; [the current system design](docs/system-design.md) for architecture diagrams, payment-to-access flow and credential locations; [the build/activation guide](docs/product-build.md) for detailed operational steps; and [design reference notes](docs/design-reference-notes.md) for what informed the redesign.

The [architecture implementation record](docs/architecture-changes.md) maps all 20 review requirements to source changes, remaining scope and release acceptance. The [operator setup guide](docs/launch-setup.md) gives the concrete email, Stripe and hosted-staging steps; `npm run setup:check` reports local configuration presence without printing values or calling providers. Configuration presence does not establish successful real-service testing.

## Start locally

After pulling architecture changes, run `npm run build` and `npm run product:prepare` once before starting. The preparation script makes a private local backup before new migrations. Then run:

```powershell
npm run dev
```

Open `http://localhost:5173/`. Create an account with a password of at least 12 characters, then follow `/onboarding`: choose a city, choose a visual language or **Surprise me**, and enter your world. The final button can request fullscreen from that click; declining or unsupported fullscreen leaves a window-filling display. In explicit development mode, email verification is bypassed only on HTTP loopback. Customers do not enter provider tokens or the old shared display key.

For a fresh clone, use Node 22.13+ and the pinned pnpm version in `package.json`:

```powershell
pnpm install --frozen-lockfile
npm run build
npm run ai:prepare
npm run product:prepare
npm run dev
```

The preparation scripts create the active local AI/account tables and an ignored `.dev.vars`. They do not deploy or provision cloud resources. Existing credentials, pictures, attempt history and operating limits are preserved. Legacy world/story routes require their earlier migrations separately; they are not the current customer flow. Clean-runner CI exercises installation/build/local HTTP, while a separate physical-machine installation and hosted release still need qualification.

## Record the prepared demo

Open **http://localhost:5173/demo**. No account, domain, Stripe or email configuration is needed for this route.

1. Wait until all ten images are decoded, then click **Enter the demo**. This starts the timer and requests fullscreen from the user gesture.
2. A new scene begins every **10 seconds**, with a **1.6-second crossfade**. An uninterrupted ten-scene cycle lasts about **100 seconds**, then loops. Hidden tabs and pause stop automatic advancement.
3. Space pauses/resumes; arrows change scenes; F toggles fullscreen. Pointer movement reveals controls. Captions can be hidden; the **Demo · prepared artwork** label stays visible. Choose **Whole picture** to preserve the complete artwork or **Fill screen** for a crop.
4. Record the browser with your preferred recorder. Cities, time and weather in this mode are recorded illustrative contexts. Playback makes no AI, weather, account or payment API requests.

The ten distinct original PNGs are retained in `public/demo/art` at **1672×941**. Optimized WebP delivery copies preserve those dimensions; their delivery inventory is [docs/demo-art-delivery.json](docs/demo-art-delivery.json). Full prompts and built-in Image Generation provenance are in [docs/demo-art-a.json](docs/demo-art-a.json) and [docs/demo-art-b.json](docs/demo-art-b.json). Prepared playback is separate from live generation and does not demonstrate a fresh model call every ten seconds. The personal display keeps its normal creative memory, weather awareness, cadence and allowances.

## Guided customer entry and screen fit

The current account journey is **landing/pricing → account → guided city/style setup → ready → personal world**. Selected plan and allowlisted continuation survive sign-in, verification and reset links. New users enter onboarding rather than being dropped into a studio dashboard. Returning users can reopen their existing world. The paid path resumes Checkout only when actual verification and server configuration allow it; a payment return waits for server-confirmed entitlement and cannot grant a plan itself.

The ready screen and display share a shell so a fullscreen request can happen immediately on the final click. Browser fullscreen is optional; the display still fills the available window when it is unavailable. The personal player reports a coarse CSS viewport class, which informs safe subject composition without collecting monitor inventories or physical-pixel fingerprints. Resizing does not buy a new image for every event. Current Cloudflare image output dimensions are provider-returned; a screen profile does not guarantee native 4K or ultrawide generation. Real device/monitor sharpness and comfort remain qualification work.

## Routes

| Route | Current purpose |
| --- | --- |
| `/` | Living-organism landing, atmosphere controls and illustrative art previews |
| `/auth` | Registration, sign-in, verification and password reset |
| `/onboarding` | Guided city/style/ready sequence, saved journey and same-shell optional fullscreen entry |
| `/app` | Personal studio, city/preferences, private collection, favourites, devices and billing |
| `/display` | Account ambient player with real time/weather and generated-art playback |
| `/demo` | Public ten-image prepared recording loop; no runtime API calls during playback |
| `/pricing` | Trial and provisional memberships; no payment when billing is unconfigured |
| `/desktop-guide` | Windows pairing/build instructions |
| `/privacy`, `/terms` | Early-access information; operator policies still need finalization |
| `/local-study` | Earlier free engine; requires explicit loopback development opt-in |
| `/prototype/` | Earlier static experiment; gated in the app, separately available with `npm run prototype` |

Older `/pulse`, `/story`, world APIs and prototype routes remain reference code. They are blocked unless `HEARTBEAT_LEGACY_ROUTES_ENABLED=true` in explicit HTTP loopback development. Account generation cannot use the old synchronous prepare API.

## Implemented so far

- **Atmosphere engine:** city/timezone resolution, real Open-Meteo observations, server clock offset, freshness checks, weekday/season/solar context, explicit festive opt-in and local quiet-hour darkness. Workerd-safe manual redirect handling preserves the HTTPS provider boundary. Typed provider outages permit an explicitly unknown-weather creative fallback; missing temperature remains unavailable rather than invented. Provider configuration rejections fail closed, and customer/hosted browsers cannot bypass the server with free-provider fallback.
- **Creative intelligence:** Cloudflare runtime director and image adapter, strict structured-output contracts, 93 theme ingredients, compatible sampling, bounded displayed-scene history, composition fingerprints and more/less feedback. New subjects and viewpoints are encouraged; absolute uniqueness is not guaranteed.
- **Playback:** illustrated first frame, background preparation, decode-before-crossfade, pause/visibility handling, night crop checks, committed-history-only memory and private image retrieval. Failed work keeps the current picture.
- **Accounts:** email/password authentication, versioned PBKDF2-SHA256 hashes at 600,000 iterations, hashed opaque sessions, secure HTTPS cookies, bounded/rate-limited requests, verification and one-use reset links, sign-out and password-confirmed deletion. Native asynchronous hashing is used where supported, with a same-work-factor fallback for unsupported runtimes; hosted CPU/load still needs measurement. Password reset revokes existing sessions. OAuth is not implemented.
- **Private ownership and memory:** canonical server preferences with version conflicts, bounded memory derived from idempotent display/feedback events, default world/surface identities, owner-isolated images, cursor library pages and protected favourites. Server discovery recovers pending/ready work even when browser storage is unavailable. Epoch-based revocation, identity refresh and late-response guards protect account switching.
- **Durable generation:** atomic job/outbox acceptance, stable Workflow dispatch, fenced persisted stages, explicit provider receipts, separate picture/operating ledgers, concurrency slots, queue deadlines, circuits and manifest-based R2 recovery. Unknown paid outcomes require reconciliation rather than automatic resubmission. No exactly-once provider guarantee is claimed.
- **Billing integration:** hosted Checkout/Portal, one pending checkout, pinned Stripe API/event contract, signed durable webhook inbox, bounded retries/quarantine, scheduled current-state reconciliation and persistent review holds. Browser success URLs do not grant access. Actual Stripe sandbox lifecycle remains unqualified.
- **Operations:** independent scheduled repair/retention/deletion tasks, immediate account revocation with resumable cleanup, aggregate operational alerts and separately authenticated audited recovery endpoints. Monitoring destinations and production runbooks still require operator setup.
- **Windows development companion:** six-digit pairing, scoped/revocable device credentials, current-user DPAPI encryption, private downloads, explicit wallpaper apply/restore, per-monitor selection, optional automatic updates and cached `.scr` entry modes. It is unsigned, not an installer or qualified release.

## Why old pictures could remain

There are three distinct cases:

1. Landing artwork is an **illustrative preview**, not a live generation request. Its city/time/weather labels are examples. Clicking Rain, Sun or After hours changes the demonstration without spending inference.
2. The current local operator cap is **three attempted preparations per UTC day**, shared across accounts. It is an application safeguard, not a Cloudflare free-tier quota or a customer's subscription allowance. It was not raised during the redesign. Failed/HOLD attempts can still spend this operating budget.
3. A real playback bug allowed a server cooldown to postpone retrieval of an already-funded queued picture for an hour. Recovery now has an independent adaptive polling schedule, starting at five seconds, rather than waiting for new-generation capacity. The server also discovers stored work when browser storage is unavailable. Regression tests cover these cases.

The account display labels illustrated previews, originals and preparing work. Capacity status includes the reset time; exhausted customer allowance remains a different explanation. Existing artwork stays available when generation is paused.

## Usability follow-up ? 22 October 2026

User screenshots exposed display overlays colliding at narrow widths. Header navigation now wraps in normal flow, and one grid owns the clock/temperature, artwork status and controls. Notices share that flow; normal available originals do not show a redundant status label. Short/narrow layouts wrap rather than pin separate labels over the time.

Customer settings now show simple more/less picture feedback and a link to visual-style preferences. Theme-proposal previews, creative counters, reset tools and technical diagnostics remain in `/local-study`; they are not customer setup. City changes retain style and festive preferences, and preference controls disable while a save is pending.

The free/trial overview omits ?Recently in your world.? Studio/Atelier accounts retain it. Existing collection/favourite access and stored artwork are unchanged; this is an overview simplification, not a new paid entitlement restriction.

Landing artwork now rotates among four curated images on a new visit, avoiding the previous choice when browser storage is available. Artwork is deliberately translucent over the navy background. Atmosphere selectors also change the hero image, and sample temperatures use proper degree symbols. Opening the landing makes no inference request and does not promise a newly generated image every visit.

React DOM coverage includes revisit variation, storage denial, simple picture feedback, free/paid recent sections and the structural grouping of header/readings/status. On 27 October, actual Chrome added bounded screenshot/geometry checks for the new demo/onboarding/personal-entry flow. Physical touch devices, monitor/DPI and overnight visual comfort remain unqualified.

## Visual direction and why

The user chose the glass-organism concept with a more minimal layout. The implementation combines a navy/coral immersive hero, oversized self-hosted typography, a single primary invitation, subtle breathing/pointer response, open ivory editorial sections and an artwork-first studio. Four new text-free raster assets replace the old promotional demo pictures.

Both requested sites were studied from their public HTML and selected public JavaScript. Shift uses a scroll-led WebGL showroom and pointer-driven image effects. 3D Discovery uses immersive spatial presentation and reduced-motion-aware WebGL components. Their implementation code and assets were not copied into Heartbeat. See [reference research and limitations](docs/design-reference-notes.md).

The current organism is a **generated raster with lightweight transforms**, not a real-time 3D simulation. This keeps the initial implementation simpler and avoids making an unattended display depend on a heavy WebGL scene. Reduced-motion settings disable the effect; hidden/offscreen hero motion pauses. Bounded Chrome geometry/interaction evidence is available; physical GPU, battery, device and overnight comfort still need measurement. A full interactive 3D layer is a possible later iteration, not a completed feature.

The selected combined target is [docs/design/heartbeat-target.png](docs/design/heartbeat-target.png). [design-qa.md](design-qa.md) records design evidence and limits. Browser captures are now available for the new flow; they do not establish exhaustive visual quality or fidelity to either reference website.

## Stack and ownership map

| Layer | Choice and reason | Main locations |
| --- | --- | --- |
| UI | React, TypeScript, Vinext/Vite and compatible App Router conventions; keep the existing runtime and account flows | `app/`, `components/`, `app/product.css` |
| Local creative loop | Rules plus bounded memory; instant free fallback and no mandatory model call for a stable hold | `lib/ambient-director.ts`, `lib/creative.ts`, `hooks/` |
| Runtime AI | Cloudflare director/image REST adapters; credentials remain server-side | `lib/ai/`, `lib/director-contract.ts` |
| Persistence | D1/SQLite for accounts, jobs and ledger; private R2 for JPEGs | `db/schema.ts`, `drizzle/`, `lib/product/` |
| Jobs | Cloudflare Workflows, with explicit re-entry/recovery policy | `lib/product/jobs.ts`, `workflow.ts`, `build/sites-worker.ts` |
| Billing/email | Stripe hosted billing and Resend delivery adapters | `lib/product/billing.ts`, `auth.ts` |
| Windows | Native WinForms/.NET Framework companion and OS wallpaper APIs | `desktop/Heartbeat.cs`, `scripts/build-desktop.mjs` |

Default configured AI models are recorded in `.env.example`; model access, costs and a genuinely cheaper director should be re-evaluated with measured quality. The legacy OpenAI world generator remains historical code, not the active customer generation path.

## Plans and operating costs

| Draft plan | Customer pictures | Minimum generation interval |
| --- | --- | --- |
| Trial | 3 lifetime | 60 minutes |
| Studio | 120 per billing month | 30 minutes |
| Atelier | 360 per billing month | 10 minutes |

These are provisional settings in `lib/product/core.ts`, not approved commercial terms. Known safe failures and HOLDs release customer picture reservations; successful preparations commit once even after image expiry. Ambiguous external outcomes remain held for reconciliation. Provider attempts and estimated monetary spend use separate ledgers. Hosted targets require approved positive estimates and a daily monetary ceiling; the local three-attempt cap was not raised.

Both paid tiers currently use the same models. Premium deeper reasoning, richer context, higher-resolution output and distinct quality tiers are future work. No unlimited generation or higher-tier quality advantage is being claimed. Actual prices are read from configured Stripe Prices when billing is enabled; unconfigured plans remain unavailable.

## Secrets and GitHub

Active local credentials are in the ignored root `.dev.vars`, next to `package.json`. The current checkout has Cloudflare credentials configured; email and Stripe credentials are absent and billing is disabled. Customers authenticate with an account or paired device token. A subscription changes the server entitlement; it never distributes a provider API key. The [system design and key inventory](docs/system-design.md) records the exact implemented flow, five-second checkout confirmation polling, shared operating-cap limitation and hosted setup still required.

`.dev.vars`, `.env*` except `.env.example`, runtime databases, local tool state and `outputs/` are ignored. `.env.example` contains placeholders only. Customers receive account sessions; provider/email/Stripe credentials belong in runtime server secrets. Do not paste tokens into chat or put them into frontend code.

Before committing, stage the intended files and run:

```powershell
npm run check:secrets
```

This checks the **exact Git index**, rejects private runtime/credential files, looks for known locally configured secret values and common credential/private-key formats, and reports file names without printing secrets. It is a useful guard, not a complete security audit. Never use `git add -f` on secret files. Rotate any credential that is ever exposed.

## Verification and its limits

See [the 26 October architecture validation record](docs/architecture-validation.md) for that checkpoint's tests and preserved local data counts. The 27 October additions below are separate evidence, not a claim of completed hosted qualification.

Useful commands:

```powershell
npm run test:product
npm run test:architecture
npm run check:schema
npm run test:ai
npm run test:ambient
npm run test:creative
npm run test:soak
npm run test:prototype
node --experimental-strip-types tests/night-quality.mjs
pnpm exec tsc --noEmit
npm run build
npm run desktop:build
npm run setup:check
```

With the local dev server running, `npm run test:product:live` checks actual HTTP account/routes without inference, payments or email. `npm run test:live` checks real city/weather APIs and requires internet access. The explicit live-AI smoke script is separately opt-in and spends an operating attempt; normal tests use mocks.

Account/billing tests use real SQLite with mocked external services. React DOM checks cover navigation, synchronized preview selectors, reduced motion, hidden-tab pausing, city/preferences, favourites, device pairing and blocked storage. Playback checks cover queued recovery under a one-hour cooldown/full capacity, lost responses, decoded acknowledgement and night rejection. The accelerated soak covers 3,535 decisions and 1,211 displayed moments across seven simulated weeks.

Prior real Cloudflare tests exercised actual directing, generation and private retrieval. A too-bright pencil-night result prompted a server JPEG brightness guard across wide, portrait and full-frame crops; the subsequent night result passed. Those historical examples remain useful fixtures, not hosted qualification.

On **27 October**, a live check encountered an invalid director result and then completed a new account-owned request through the local durable pipeline. **Autumn Lake Serenity** became ready in **22.34 seconds** after one generation POST; its private JPEG is **1024×1024**. The successful report is `outputs/live-journey-report.json`, with image `outputs/live-journey-art.jpg`. These ignored local artifacts establish one provider-connected success and retain the failed-output lesson; they do not establish typical latency, artistic quality, indefinite reliability or deployed Workflow capacity.

Actual Chrome exercised **18 viewport cases** spanning phone/tablet/desktop, ultrawide and 4K-sized windows with no recorded horizontal overflow or broken images. The report recorded real ten-second demo advancement, fullscreen entry, zero demo API requests, city/style/ready progression and a 1440px-wide personal display. Evidence is under ignored `outputs/customer-journey-browser/`. A large browser viewport is not a test on a physical 4K monitor or phone; screenshot inspection and geometry do not establish exhaustive accessibility, visual comfort or original-reference fidelity.

**Still unqualified:** physical touch/mobile/mixed-DPI behaviour, sustained browser/GPU/battery and night comfort, real email delivery, real Stripe sandbox lifecycle, deployed Workflow CPU/memory/load, actual wallpaper restoration/screensaver lock handling, overnight operation and sustained artistic variety. Browser evidence is bounded to the recorded Chrome runs. Stripe was deliberately left disabled while the operator's email/domain/payment setup is pending; no real subscription was charged.

## What remains, blockers and manual steps

| Next step | Who/what is needed |
| --- | --- |
| Device and visual QA | Extend the bounded Chrome evidence to physical devices, mixed DPI, accessibility, GPU/battery and overnight comfort; review artwork crops and sharpness |
| Email | Operator verifies a sending domain in Resend, sets sender/key; test verification/reset delivery and expired links on HTTPS production-mode staging |
| Payments | Operator creates Stripe sandbox products/Prices and Portal configuration; set webhook secrets and test purchase, decline, duplicate click, renewal/failure, upgrade/downgrade, cancel, refund/dispute and retries |
| Hosting | Fill isolated resource IDs/origins and budgets in `config/environments.json`; provision resources/secrets and protected GitHub environments; qualify hashing/JPEG/Workflow CPU and memory |
| Economics | Approve prices, allowances, cadence and spending ceiling using measured reasoning/image/storage/traffic costs; three shared attempts/day is not a public-service budget |
| Operations | Qualify the implemented scheduler, repair, audited picture adjustments and billing reconciliation; connect alerts; perform hosted backup/restore/rollback drills and finish a support interface |
| Security | Independently review auth/payment/ownership and implemented abuse controls; measure 600k-iteration password hashing on hosted Workers; review provider/asset/data licensing |
| Windows | Human tests for apply/restore, multiple monitors, DPI, preview/input/lock/sleep; prior slideshow restore, signing, installer and uninstall still need work |
| Product quality | Several real day/night sessions, diverse real images and a small private beta where people choose whether to keep it running |
| Launch | Final operator/support identity, privacy/retention and refund/cancellation terms, applicable tax review, separate live Stripe configuration and explicit release decision |

The step-by-step activation checklist is [docs/launch-setup.md](docs/launch-setup.md), alongside [docs/product-build.md](docs/product-build.md). Each release target now has an explicit `billingEnabled` flag, defaulting to false; enabling it requires complete distinct Stripe settings and the target's appropriate key type. No real subscription was charged and no public deployment or paid hosting plan was enabled by this local build. Live inference uses the existing configured provider account. GitHub source publication is separate from deploying the application.

## History, rights and attribution

The earlier cat/room continuity study, six-family SVG experiment and old world/story routes are retained for reference. They are not promises of the new engine's visual range. See [creative planning](docs/creative-brain.md), [Step 2 tests](docs/step-2-testing.md) and [the earlier AI setup](docs/cloudflare-setup.md).

Weather attribution: [Open-Meteo](https://open-meteo.com/). Its commercial licensing/attribution must be reviewed before selling the product. Promotional images and the design target were created with built-in Image Generation; provenance is in [docs/design/ASSETS.md](docs/design/ASSETS.md). The separate ten-image recording set has its complete prompts in [docs/demo-art-a.json](docs/demo-art-a.json) and [docs/demo-art-b.json](docs/demo-art-b.json). Manrope and Barlow Condensed are self-hosted with their bundled OFL notices. Keep all existing third-party notices. No project-wide open-source license has been selected; repository visibility does not itself grant one.
