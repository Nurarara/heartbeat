# Heartbeat

**A screen with a pulse.** Heartbeat is a context-aware ambient-art application: choose a city, then let original artwork respond to local time, real outdoor weather and the season. The core experience is artwork, a clock and temperature, with controls that recede while you leave it running.

**Status — 21 October 2026:** working local account application and unsigned Windows companion. Cloudflare generation has been exercised with real inference. Stripe and email integrations are implemented but not activated or tested end to end with their real services. Hosted production, real-browser visual QA and hands-on Windows qualification remain outstanding. This is not a public commercial release.

Read [PROJECT_VISION.md](PROJECT_VISION.md) for the product reasoning, decisions and future scope; [the build/activation guide](docs/product-build.md) for detailed operational steps; and [design reference notes](docs/design-reference-notes.md) for what informed the redesign.

## Start locally

This checkout is already prepared. Run:

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
| `/local-study` | Earlier free, city-only six-family SVG engine and optional local shared-key study |
| `/prototype/` | Separate static SVG visual experiment, also available with `npm run prototype` |

Older `/pulse`, `/story` and world APIs remain reference code. They are not the new onboarding or current provider configuration.

## Implemented so far

- **Atmosphere engine:** city/timezone resolution, real Open-Meteo observations, server clock offset, freshness checks, weekday/season/solar context, explicit festive opt-in and local quiet-hour darkness. Missing temperature is shown as unavailable.
- **Creative intelligence:** Cloudflare runtime director and image adapter, strict structured-output contracts, 93 theme ingredients, compatible sampling, bounded displayed-scene history, composition fingerprints and more/less feedback. New subjects and viewpoints are encouraged; absolute uniqueness is not guaranteed.
- **Playback:** illustrated first frame, background preparation, decode-before-crossfade, pause/visibility handling, night crop checks, committed-history-only memory and private image retrieval. Failed work keeps the current picture.
- **Accounts:** email/password authentication, salted PBKDF2 hashes, hashed opaque sessions, secure HTTPS cookies, bounded/rate-limited requests, verification and one-use reset links, sign-out and password-confirmed deletion. Password reset revokes existing sessions. OAuth is not implemented.
- **Private ownership:** server preferences/memory, account-owned library and favourites, isolated image access, account switching and bounded retention. Up to 100 favourites are protected from routine expiry. The display opens from server preferences even if local storage is blocked; recovery across a reload still needs available storage.
- **Durable generation:** Cloudflare Workflow binding, D1 jobs, unique account/request IDs, a permanent start gate and recovery polling. The client does not blindly repeat an ambiguous paid POST. Interrupted external work can still leave an operating attempt spent; there is no exactly-once provider guarantee.
- **Billing integration:** hosted Stripe Checkout, customer-bound Portal, allowlisted monthly Prices, persistent checkout idempotency, signed raw-body webhooks, duplicate-event handling and current-state reconciliation under a per-customer lease. A browser success URL does not grant access. Refund/dispute handling and full lifecycle behaviour still require real Stripe sandbox testing.
- **Windows development companion:** six-digit pairing, scoped/revocable device credentials, current-user DPAPI encryption, private downloads, explicit wallpaper apply/restore, per-monitor selection, optional automatic updates and cached `.scr` entry modes. It is unsigned, not an installer or qualified release.

## Why old pictures could remain

There are three distinct cases:

1. Landing artwork is an **illustrative preview**, not a live generation request. Its city/time/weather labels are examples. Clicking Rain, Sun or After hours changes the demonstration without spending inference.
2. The current local operator cap is **three attempted preparations per UTC day**, shared across accounts. It is an application safeguard, not a Cloudflare free-tier quota or a customer's subscription allowance. It was not raised during the redesign. Failed/HOLD attempts can still spend this operating budget.
3. A real playback bug allowed a server cooldown to postpone retrieval of an already-funded queued picture for an hour. Recovery now has its own five-second polling schedule, independent of new-generation cooldown/capacity. The open tab also retains its request ID in memory when storage is blocked. Regression tests cover both cases.

The account display labels illustrated previews, originals and preparing work. Capacity status includes the reset time; exhausted customer allowance remains a different explanation. Existing artwork stays available when generation is paused.

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

These are provisional settings in `lib/product/core.ts`, not approved commercial terms. Failed preparations and HOLDs do not consume customer picture credits; in-progress work reserves allowance and successful pictures still count after image expiry. All provider attempts remain accounted against the separate global operating cap.

Both paid tiers currently use the same models. Premium deeper reasoning, richer context, higher-resolution output and distinct quality tiers are future work. No unlimited generation or higher-tier quality advantage is being claimed. Actual prices are read from configured Stripe Prices when billing is enabled; unconfigured plans remain unavailable.

## Secrets and GitHub

`.dev.vars`, `.env*` except `.env.example`, runtime databases, local tool state and `outputs/` are ignored. `.env.example` contains placeholders only. Customers receive account sessions; provider/email/Stripe credentials belong in runtime server secrets. Do not paste tokens into chat or put them into frontend code.

Before committing, stage the intended files and run:

```powershell
npm run check:secrets
```

This checks the **exact Git index**, rejects private runtime/credential files, looks for known locally configured secret values and common credential/private-key formats, and reports file names without printing secrets. It is a useful guard, not a complete security audit. Never use `git add -f` on secret files. Rotate any credential that is ever exposed.

## Verification and its limits

Useful commands:

```powershell
npm run test:product
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
| Hosting | Choose target/domain, authenticate cloud account, provision isolated D1/R2/Workflow resources, apply migrations and secrets; qualify CPU/memory before selecting a paid plan |
| Economics | Approve prices, allowances, cadence and spending ceiling using measured reasoning/image/storage/traffic costs; three shared attempts/day is not a public-service budget |
| Operations | Implement scheduled cleanup, periodic billing reconciliation, monitoring/alerts, backup/restore drills and a support/admin review process |
| Security | Independent auth/payment/ownership review, abuse/rate-limit hardening and provider/asset/data licensing review |
| Windows | Human tests for apply/restore, multiple monitors, DPI, preview/input/lock/sleep; prior slideshow restore, signing, installer and uninstall still need work |
| Product quality | Several real day/night sessions, diverse real images and a small private beta where people choose whether to keep it running |
| Launch | Final operator/support identity, privacy/retention and refund/cancellation terms, applicable tax review, separate live Stripe configuration and explicit release decision |

The detailed activation checklist is in [docs/product-build.md](docs/product-build.md). No real subscriptions were charged, no paid cloud resources were enabled, and no new public deployment was made by this local build. GitHub source publication is separate from deploying the application.

## History, rights and attribution

The earlier cat/room continuity study, six-family SVG experiment and old world/story routes are retained for reference. They are not promises of the new engine's visual range. See [creative planning](docs/creative-brain.md), [Step 2 tests](docs/step-2-testing.md) and [the earlier AI setup](docs/cloudflare-setup.md).

Weather attribution: [Open-Meteo](https://open-meteo.com/). Its commercial licensing/attribution must be reviewed before selling the product. New promotional images and the design target were created with built-in Image Generation; provenance is in [docs/design/ASSETS.md](docs/design/ASSETS.md). Manrope and Barlow Condensed are self-hosted with their bundled OFL notices. Keep all existing third-party notices. No project-wide open-source license has been selected; repository visibility does not itself grant one.
