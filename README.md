# Heartbeat

**A screen with a pulse.** Heartbeat is a context-aware ambient-art application: choose a city, then let original artwork respond to local time, real outdoor weather and the season. The core experience is artwork, a clock and temperature, with controls that recede while you leave it running.

**Status — 26 October 2026:** local account application with staged generation recovery, transactional dispatch, authoritative creative memory, usage/cost ledgers, durable billing reconciliation, resumable deletion and release gates. The Windows companion is an unsigned development build. Real inference examples predate this architecture change. Hosted capacity, real email/Stripe acceptance, browser/device QA and native Windows qualification remain outstanding. This is not a public commercial release.

Read [PROJECT_VISION.md](PROJECT_VISION.md) for the product reasoning, decisions and future scope; [the current system design](docs/system-design.md) for architecture diagrams, payment-to-access flow and credential locations; [the build/activation guide](docs/product-build.md) for detailed operational steps; and [design reference notes](docs/design-reference-notes.md) for what informed the redesign.

The [architecture implementation record](docs/architecture-changes.md) maps all 20 review requirements to source changes, remaining scope and release acceptance. Several requirements include hosted or human qualification that code alone cannot complete.

## Start locally

After pulling architecture changes, run `npm run build` and `npm run product:prepare` once before starting. The preparation script makes a private local backup before new migrations. Then run:

```powershell
npm run dev
```

Open `http://localhost:5173/`. Create an account with a password of at least 12 characters, choose your city in the studio, optionally adjust Atmosphere, and open the display. In explicit development mode, email verification is bypassed only on HTTP loopback. Customers do not enter provider tokens or the old shared display key.

For a fresh clone, use Node 22.13+ and the pinned pnpm version in `package.json`:

```powershell
pnpm install --frozen-lockfile
npm run build
npm run ai:prepare
npm run product:prepare
npm run dev
```

The preparation scripts create the active local AI/account tables and an ignored `.dev.vars`. They do not deploy or provision cloud resources. Existing credentials, pictures, attempt history and operating limits are preserved. Legacy world/story routes require their earlier migrations separately; they are not the current customer flow. Independent clean-clone installation still needs qualification on another machine.

## Routes

| Route | Current purpose |
| --- | --- |
| `/` | Living-organism landing, atmosphere controls and illustrative art previews |
| `/auth` | Registration, sign-in, verification and password reset |
| `/app` | Personal studio, city/preferences, private collection, favourites, devices and billing |
| `/display` | Account ambient player with real time/weather and generated-art playback |
| `/pricing` | Trial and provisional memberships; no payment when billing is unconfigured |
| `/desktop-guide` | Windows pairing/build instructions |
| `/privacy`, `/terms` | Early-access information; operator policies still need finalization |
| `/local-study` | Earlier free engine; requires explicit loopback development opt-in |
| `/prototype/` | Earlier static experiment; gated in the app, separately available with `npm run prototype` |

Older `/pulse`, `/story`, world APIs and prototype routes remain reference code. They are blocked unless `HEARTBEAT_LEGACY_ROUTES_ENABLED=true` in explicit HTTP loopback development. Account generation cannot use the old synchronous prepare API.

## Implemented so far

- **Atmosphere engine:** city/timezone resolution, real Open-Meteo observations, server clock offset, freshness checks, weekday/season/solar context, explicit festive opt-in and local quiet-hour darkness. Missing temperature is shown as unavailable.
- **Creative intelligence:** Cloudflare runtime director and image adapter, strict structured-output contracts, 93 theme ingredients, compatible sampling, bounded displayed-scene history, composition fingerprints and more/less feedback. New subjects and viewpoints are encouraged; absolute uniqueness is not guaranteed.
- **Playback:** illustrated first frame, background preparation, decode-before-crossfade, pause/visibility handling, night crop checks, committed-history-only memory and private image retrieval. Failed work keeps the current picture.
- **Accounts:** email/password authentication, salted PBKDF2 hashes, hashed opaque sessions, secure HTTPS cookies, bounded/rate-limited requests, verification and one-use reset links, sign-out and password-confirmed deletion. Password reset revokes existing sessions. OAuth is not implemented.
- **Private ownership and memory:** canonical server preferences with version conflicts, bounded memory derived from idempotent display/feedback events, default world/surface identities, owner-isolated images, cursor library pages and protected favourites. Server discovery recovers pending/ready work even when browser storage is unavailable. Epoch-based revocation, identity refresh and late-response guards protect account switching.
- **Durable generation:** atomic job/outbox acceptance, stable Workflow dispatch, fenced persisted stages, explicit provider receipts, separate picture/operating ledgers, concurrency slots, queue deadlines, circuits and manifest-based R2 recovery. Unknown paid outcomes require reconciliation rather than automatic resubmission. No exactly-once provider guarantee is claimed.
- **Billing integration:** hosted Checkout/Portal, one pending checkout, pinned Stripe API/event contract, signed durable webhook inbox, bounded retries/quarantine, scheduled current-state reconciliation and persistent review holds. Browser success URLs do not grant access. Actual Stripe sandbox lifecycle remains unqualified.
- **Operations:** independent scheduled repair/retention/deletion tasks, immediate account revocation with resumable cleanup, aggregate operational alerts and separately authenticated audited recovery endpoints. Monitoring destinations and production runbooks still require operator setup.
- **Windows development companion:** six-digit pairing, scoped/revocable device credentials, current-user DPAPI encryption, private downloads, explicit wallpaper apply/restore, per-monitor selection, optional automatic updates and cached `.scr` entry modes. It is unsigned, not an installer or qualified release.

## Why old pictures could remain

There are three distinct cases:

1. Landing artwork is an **illustrative preview**, not a live generation request. Its city/time/weather labels are examples. Clicking Rain, Sun or After hours changes the demonstration without spending inference.
2. The current local operator cap is **three attempted preparations per UTC day**, shared across accounts. It is an application safeguard, not a Cloudflare free-tier quota or a customer's subscription allowance. It was not raised during the redesign. Failed/HOLD attempts can still spend this operating budget.
3. A real playback bug allowed a server cooldown to postpone retrieval of an already-funded queued picture for an hour. Recovery now has its own five-second polling schedule, independent of new-generation cooldown/capacity. The open tab also retains its request ID in memory when storage is blocked. Regression tests cover both cases.

The account display labels illustrated previews, originals and preparing work. Capacity status includes the reset time; exhausted customer allowance remains a different explanation. Existing artwork stays available when generation is paused.

## Usability follow-up ? 22 October 2026

User screenshots exposed display overlays colliding at narrow widths. Header navigation now wraps in normal flow, and one grid owns the clock/temperature, artwork status and controls. Notices share that flow; normal available originals do not show a redundant status label. Short/narrow layouts wrap rather than pin separate labels over the time.

Customer settings now show simple more/less picture feedback and a link to visual-style preferences. Theme-proposal previews, creative counters, reset tools and technical diagnostics remain in `/local-study`; they are not customer setup. City changes retain style and festive preferences, and preference controls disable while a save is pending.

The free/trial overview omits ?Recently in your world.? Studio/Atelier accounts retain it. Existing collection/favourite access and stored artwork are unchanged; this is an overview simplification, not a new paid entitlement restriction.

Landing artwork now rotates among four curated images on a new visit, avoiding the previous choice when browser storage is available. Artwork is deliberately translucent over the navy background. Atmosphere selectors also change the hero image, and sample temperatures use proper degree symbols. Opening the landing makes no inference request and does not promise a newly generated image every visit.

React DOM coverage includes revisit variation, storage denial, simple picture feedback, free/paid recent sections and the structural grouping of header/readings/status. Real browser screenshots/geometry, touch/device and visual comfort checks still need human or browser access.

## Visual direction and why

The user chose the glass-organism concept with a more minimal layout. The implementation combines a navy/coral immersive hero, oversized self-hosted typography, a single primary invitation, subtle breathing/pointer response, open ivory editorial sections and an artwork-first studio. Four new text-free raster assets replace the old promotional demo pictures.

Both requested sites were studied from their public HTML and selected public JavaScript. Shift uses a scroll-led WebGL showroom and pointer-driven image effects. 3D Discovery uses immersive spatial presentation and reduced-motion-aware WebGL components. Their implementation code and assets were not copied into Heartbeat. See [reference research and limitations](docs/design-reference-notes.md).

The current organism is a **generated raster with lightweight transforms**, not a real-time 3D simulation. This keeps the initial implementation simpler and avoids making an unattended display depend on a heavy WebGL scene. Reduced-motion settings disable the effect; hidden/offscreen hero motion pauses. Real GPU, battery, layout and interaction quality still need browser/device measurement. A full interactive 3D layer is a possible later iteration, not a completed feature.

The selected combined target is [docs/design/heartbeat-target.png](docs/design/heartbeat-target.png). [design-qa.md](design-qa.md) records the current browser-capture blocker. Build/DOM results do not establish visual fidelity.

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

See [the 26 October architecture validation record](docs/architecture-validation.md) for the latest checks, preserved local data counts and explicit evidence limits.

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
```

With the local dev server running, `npm run test:product:live` checks actual HTTP account/routes without inference, payments or email. `npm run test:live` checks real city/weather APIs and requires internet access. The explicit live-AI smoke script is separately opt-in and spends an operating attempt; normal tests use mocks.

Account/billing tests use real SQLite with mocked external services. React DOM checks cover navigation, synchronized preview selectors, reduced motion, hidden-tab pausing, city/preferences, favourites, device pairing and blocked storage. Playback checks cover queued recovery under a one-hour cooldown/full capacity, lost responses, decoded acknowledgement and night rejection. The accelerated soak covers 3,535 decisions and 1,211 displayed moments across seven simulated weeks.

Prior real Cloudflare tests exercised actual directing, generation and private retrieval. A too-bright pencil-night result prompted a server JPEG brightness guard across wide, portrait and full-frame crops; the subsequent night result passed. These were local Workflow-emulator runs, not hosted Workflow CPU qualification or actual browser display evidence.

**Not verified:** rendered browser layout/fidelity, touch/mobile/mixed-DPI behaviour, real email delivery, real Stripe sandbox lifecycle, deployed Workflow CPU/memory, actual wallpaper restoration/screensaver lock handling, real overnight operation or sustained artistic variety. No controllable browser was exposed during the redesign. Passing tests/compiler/HTTP does not prove these outcomes.

## What remains, blockers and manual steps

| Next step | Who/what is needed |
| --- | --- |
| Visual QA | Browser access or human desktop/mobile captures; compare at the same viewport, fix typography/crops/contrast/interactions and assess frame rate/battery |
| Email | Operator verifies a sending domain in Resend, sets sender/key; test verification/reset delivery and expired links on HTTPS production-mode staging |
| Payments | Operator creates Stripe sandbox products/Prices and Portal configuration; set webhook secrets and test purchase, decline, duplicate click, renewal/failure, upgrade/downgrade, cancel, refund/dispute and retries |
| Hosting | Fill isolated resource IDs/origins and budgets in `config/environments.json`; provision resources/secrets and protected GitHub environments; qualify hashing/JPEG/Workflow CPU and memory |
| Economics | Approve prices, allowances, cadence and spending ceiling using measured reasoning/image/storage/traffic costs; three shared attempts/day is not a public-service budget |
| Operations | Qualify the implemented scheduler, repair, audited picture adjustments and billing reconciliation; connect alerts; perform hosted backup/restore/rollback drills and finish a support interface |
| Security | Independently review auth/payment/ownership and implemented abuse controls; measure 600k-iteration password hashing on hosted Workers; review provider/asset/data licensing |
| Windows | Human tests for apply/restore, multiple monitors, DPI, preview/input/lock/sleep; prior slideshow restore, signing, installer and uninstall still need work |
| Product quality | Several real day/night sessions, diverse real images and a small private beta where people choose whether to keep it running |
| Launch | Final operator/support identity, privacy/retention and refund/cancellation terms, applicable tax review, separate live Stripe configuration and explicit release decision |

The detailed activation checklist is in [docs/product-build.md](docs/product-build.md). No real subscriptions were charged, no paid cloud resources were enabled, and no new public deployment was made by this local build. GitHub source publication is separate from deploying the application.

## History, rights and attribution

The earlier cat/room continuity study, six-family SVG experiment and old world/story routes are retained for reference. They are not promises of the new engine's visual range. See [creative planning](docs/creative-brain.md), [Step 2 tests](docs/step-2-testing.md) and [the earlier AI setup](docs/cloudflare-setup.md).

Weather attribution: [Open-Meteo](https://open-meteo.com/). Its commercial licensing/attribution must be reviewed before selling the product. New promotional images and the design target were created with built-in Image Generation; provenance is in [docs/design/ASSETS.md](docs/design/ASSETS.md). Manrope and Barlow Condensed are self-hosted with their bundled OFL notices. Keep all existing third-party notices. No project-wide open-source license has been selected; repository visibility does not itself grant one.
