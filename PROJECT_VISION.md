# Heartbeat — project vision and decisions

Updated 28 October 2026. [README.md](README.md) describes how to run the current system and record the prepared demo. A live artwork retest now tolerates unknown or duplicated optional theme IDs without storing false memory, while preserving strict image and nighttime checks; sustained visual variety still needs real evaluation. This document records the intended experience, what has been implemented, why the architecture and design were chosen, what is still missing and how to proceed. The [operator setup guide](docs/launch-setup.md) gives the concrete external steps needed for real email, payments and hosted staging.

The [current system design](docs/system-design.md) maps the actual components, artwork pipeline, credential boundary and Stripe activation sequence. Subscription access is server-managed: verified Stripe reconciliation updates an account entitlement, while the operator's model credentials stay on the server. Checkout return keeps the selected journey and checks server confirmation every five seconds for up to one minute. Billing remains disabled locally; real sandbox/hosted qualification, delayed-event recovery and a suitable shared operating budget must precede selling paid access. Each release target now has an explicit reviewed `billingEnabled` flag, false by default, with credential validation before activation. This is an implemented integration, not an already operating commercial service.

## The product

Heartbeat is a living ambient surface for screens: a wallpaper or screensaver that interprets the local environment and creates an atmosphere people enjoy leaving in their room. It uses the selected city's time, outdoor weather, temperature, date and season. These are creative clues, not a claim that the system reads a person's emotions or senses their room.

A bright Sunday might suggest a lazy anime afternoon in an airy Japanese home. A cold rainy morning might suggest shelter, an empty station, a pencil study or a distant landscape. Dogs chasing a ball under a single tree can be as appropriate as a cinematic city. The director should choose an image's subject, action, style, materials, composition and lighting deliberately, with enough freedom to surprise.

At night the image must respect the room: dark, restrained, comfortable and free of sudden bright replacements. Holidays are optional, subtle cues; location alone must not assign a person's culture or beliefs.

The product test is **whether someone chooses to leave it running and return to it**, not whether an image endpoint responds successfully.

## The current experience contract

| Area | Decision |
| --- | --- |
| Introduction | An expressive, immersive site that lets people feel the product before reading a feature inventory |
| Onboarding | Sign in/create an account, then guided city → visual style → ready → world; preserve the selected plan and safe continuation; no provider key or prompt-writing requirement |
| Optional preferences | Visual language, temperature units, motion and festive touches; these are not mandatory questionnaires |
| Ambient mode | Artwork, correct local time and outdoor temperature; controls recede when idle |
| Honesty | Illustrative previews and generation capacity are identified; a fallback must not masquerade as fresh AI artwork |
| Intelligence | Use actual weather/time/date together, interpret their atmospheric meaning and consider recent displayed history |
| Memory | Retain useful preferences and bounded creative history rather than an ever-growing conversation |
| Reliability | Keep the current valid picture until the next is decoded and safe; recover existing jobs without repeating paid requests |
| Customer access | Ordinary account/subscription access; provider credentials stay with Heartbeat's server |
| Product shape | Browser experience first, Windows companion in development, hardware and fleet management later |
| Recording | A labelled prepared-art route makes a reproducible demonstration without pretending that every ten-second change is a new live model call |

The earlier city-only free study is retained at `/local-study` behind explicit HTTP loopback development opt-in. The current paid-product direction adds accounts for ownership and entitlements without asking customers to configure AI services.

## Customer entry and recording demo — 27 October 2026

The local product now has `/onboarding`: a short city, visual-style and ready sequence. The ready screen and personal display share a shell so **Enter your world** can request fullscreen immediately from the click, with a window-filling fallback. Optional preferences remain small; **Surprise me** avoids making artistic choices a barrier. Signup, sign-in, verification/reset links and payment return preserve an allowlisted continuation and selected plan rather than losing the user at a dashboard. A paid return still waits for server entitlement; it cannot manufacture access. Email verification and payment acceptance remain real-service setup and testing work.

`/demo` is a separate public recording route. Ten distinct original artworks were generated with built-in Image Generation, retained as **1672×941 PNGs**, and served as optimized WebP copies at unchanged dimensions. All ten decode before the user starts. A new scene begins every **ten seconds**, with a **1.6-second crossfade** and approximately **100-second uninterrupted loop**. Pause, next/previous, restart, fullscreen, captions and whole-picture/fill framing support recording. Hidden tabs pause advancement. Full prompts and provenance are retained in [docs/demo-art-a.json](docs/demo-art-a.json) and [docs/demo-art-b.json](docs/demo-art-b.json), with delivery details in [docs/demo-art-delivery.json](docs/demo-art-delivery.json).

The prepared-demo label remains visible; its time, weather and cities are illustrative contexts. Playback makes no model, weather, account or payment API calls. This lets the user record a smooth demonstration without buying ten inferences per minute, changing customer allowances or disguising static assets as runtime reasoning. The normal personal display remains driven by saved preferences, real context, creative memory and its normal budgets/cadence.

Screen fit and artwork quality are separate decisions. The browser display fills the window and supports optional fullscreen. A coarse CSS viewport class now guides safe subject framing in live creative requests; it does not enumerate monitors or fingerprint physical pixels. Surface updates are bounded and resizing does not buy inference for every event. The current provider returns its own image dimensions, so this is composition awareness rather than a guarantee of native 4K or custom ultrawide output. Whole-picture mode in the recording player keeps the entire source image when cropping would be undesirable.

## What has been built

### Context and creative planning

The engine resolves a city/timezone, fetches real outdoor observations, checks freshness and uses local clock/solar information, weekday/weekend and hemisphere-aware season. It does not fabricate an outdoor reading when data is unavailable. Weather is a local-area estimate, not an indoor sensor. A Workerd-specific fetch issue was corrected with manual redirect handling that retains the HTTPS provider boundary. Typed provider outages can produce an explicitly unknown-weather creative fallback; they cannot invent temperature or weather confidence. Provider configuration rejections fail closed, and customer/hosted browsers cannot silently switch to a free direct-provider path.

A local policy supplies immediate free artwork and bounded fallback decisions. The Cloudflare runtime director receives current context, a compact creative memory and compatible inspiration, and returns structured HOLD or REIMAGINE instructions. Image generation produces private JPEG artwork when server configuration and budgets permit it. A working API adapter does not establish sustained artistic quality.

The creative mesh currently has 93 ingredients across categories such as place, subject, action, object, material, style and composition. Compatibility/context rules reduce incoherent combinations. The mesh is inspiration, not a rigid list of all pictures the model may produce. The model can reinterpret or invent beyond it.

### Memory and uniqueness

The system retains the active city's last twelve committed directions, bounded ingredient/taste summaries and semantic fingerprints. Actual displayed frames enter history; previews, discarded plans and failed frames do not. Feedback influences future proposals, not model training.

The director sees a compact packet, not all past pictures or an indefinite chat transcript. This keeps prompts manageable and reduces repeated combinations. Memory is not intended to be deleted after every image: doing so would lose preferences and repetition signals. It should also not grow forever.

Every image should feel distinct in subject, activity, view and composition. Absolute uniqueness across all generated pictures cannot be guaranteed by prompt memory, hashes or sampling. More theme ingredients, better semantic/pixel comparisons and measured long-run diversity are possible later improvements. No system should claim it has proved infinite creativity after a short test.

### Accounts, jobs and billing foundations

Implemented: email/password accounts, Google OAuth integration, opaque server sessions, private profiles/memory/library/favourites, one-use verification/reset links, account deletion, durable D1 jobs, Workflow execution, customer allowances and a separate operating ledger. Google sign-in requires a separately configured client; it has automated signed-token and Workerd tests, and the operator confirmed linking a real Google account and signing in after logout locally on 28 October. Hosted acceptance still needs testing. Existing unverified password accounts are only linked after a confirmed Heartbeat sign-in. Password hashing keeps PBKDF2-SHA256 at 600,000 iterations, using native asynchronous derivation when supported and the same-work-factor fallback when the runtime cannot provide it. Hosted CPU/load still needs measurement. Provider keys are never customer onboarding.

Stripe Checkout/Portal and signed webhook processing are implemented. Access derives from server subscription state; checkout redirects and browser plan fields cannot grant it. Reconciliation reads current Stripe state rather than assuming event arrival order. Real sandbox lifecycle qualification is still required, including refund/dispute object shapes and manual review recovery.

Resend delivery is implemented but real sender verification and inbox delivery remain operator setup. Local development explicitly bypasses verification only on HTTP loopback; that is not acceptable production authentication behaviour.

### Playback and night comfort

Preparation runs in the background while the current picture remains. New images are decoded before crossfade; hidden tabs and pause defer display. Server night-JPEG checks examine wide, portrait and full-frame samples, and the client checks its displayed crop. These checks enforce provisional pixel-brightness limits, not artistic quality or a guarantee about physical monitor brightness.

A real too-bright pencil-night generation was rejected during development; stronger night instructions and regression fixtures now cover it. Another real night image passed. These are local provider/storage tests, not an unattended browser-night qualification.

A follow-up found that generation cooldown and queue polling shared a clock, which could delay a ready picture for an hour. Already-funded jobs now poll on an independent adaptive schedule, starting at five seconds, even at capacity. The active tab retains a recovery ID in memory when local storage is blocked, and server discovery also permits recovery after reload without that browser snapshot. An interrupted provider call can remain spent against the operating budget; exactly-once external inference is not guaranteed.

### Native Windows development

An unsigned companion can pair to the account, retrieve private artwork, cache it, explicitly apply/restore wallpaper and request optional automatic updates. Credentials use current-user DPAPI locally and scoped/revocable server tokens. A `.scr` executable implements configuration, fullscreen and preview invocation modes.

Compile/self-tests passed. Actual OS wallpaper behaviour, multi-monitor/mixed-DPI, screensaver preview/input/lock, sleep/wake and overnight use have not been qualified. Previous wallpaper slideshow restoration is not implemented. There is no installer, release signature, startup registration or claimed production desktop support.

## Design direction and the reasoning behind it

The user rejected the earlier forest/cream generic landing and selected a dark, glass-organism direction, combined with the third concept's minimalism. The revised target is [the combined concept](docs/design/heartbeat-target.png).

The new presentation uses a physically rendered glass loop as the visual metaphor for a pulse, a navy/coral palette, bold typography, sparse navigation and a single direct invitation. Open ivory sections create a calmer editorial rhythm. Sign-in and the studio share the typography and interaction language; the private artwork remains the main object of attention.

The reference sites were requested for their feel and behaviour, not as assets to copy. Public source inspection found scroll-led WebGL/showroom and pointer-driven image treatments at Shift, and immersive spatial/WebGL presentation at 3D Discovery. See [reference notes](docs/design-reference-notes.md) for evidence and limits. At that earlier design stage no live browser capture was possible, and original design work was explicitly authorized instead. The new flow now has bounded Chrome captures and geometry evidence; it does not claim a faithful clone or completed comparison with those live references.

The implementation currently uses text-free generated raster assets plus limited transforms for breathing/parallax, not a real-time deforming 3D organism. Native scrolling, no forced loader, reduced-motion support and hidden/offscreen pausing keep it simpler and more accessible. Moving to a shader/3D scene is a possible enhancement after performance and user value are measured. A landing effect must not dictate the ambient display's resource use.

Motion is part of presentation, not the definition of intelligence. A picture that responds meaningfully to a rainy evening is more valuable than a continuously moving scene that ignores the environment.

## Usability refinement ? 22 October 2026

User screenshots showed that independent fixed-position navigation/status overlays collided with the brand and clock. The display now uses a shared grid and wrapping header so each item has real layout space. Redundant status for an available original is omitted; preparation/capacity/fallback states remain explicit.

The customer experience should feel like an ambient product rather than its development console. Local theme previews, history counters and planning diagnostics are hidden in customer settings, which offer simple more/less feedback and a route to visual-language preferences. The free overview stays focused on the current atmosphere; paid overviews can show recent artwork. Collection ownership/favourites are unchanged.

The landing is a translucent window into several curated artistic worlds, with a different opening image on return visits when storage permits avoiding repeats. This is an inexpensive presentation choice, not a new runtime inference per page view. The brand can vary without exposing a prompt generator or consuming the daily art budget.

These changes responded to supplied visual evidence. Bounded actual-Chrome geometry and screenshot checks were added on 27 October for the demo/onboarding/personal-entry flow; physical-device, mixed-DPI and overnight comfort qualification remain separate.

## Why this technical stack

| Choice | Why | Constraint to qualify |
| --- | --- | --- |
| React + TypeScript | Existing implementation, reusable account/player components and explicit data contracts | Build/typing does not verify rendered UX |
| Vinext + Vite with App Router conventions | Retains the existing Worker-capable runtime and routes | Framework remains beta; independent production deployment needs qualification |
| Local creative rules | Immediate free fallback, deterministic tests and no required inference for stable conditions | Six SVG scene families are a fallback, not unlimited AI artwork |
| Cloudflare runtime adapters | Server-owned reasoning/image calls near the existing D1/R2 system | Model access, output reliability, cost and CPU limits must be measured |
| D1/SQLite | Durable ownership, atomic reservation/accounting and recoverable job state | Migrations, backups, concurrency and retention need production operations |
| Private R2 | Keep large image bytes outside job-step results and account data rows | Delivery, deletion and storage costs need monitoring |
| Cloudflare Workflows | Background work survives a browser closing; explicit recovery/re-entry rules | Local emulator success does not prove hosted CPU/memory suitability |
| Hosted Stripe billing | Keep card handling in Stripe and derive access from verified server events | Actual sandbox purchase/renewal/failure/cancellation remains untested |
| Resend | Bounded transactional verification/reset delivery adapter | Verified domain and real mailbox delivery are not yet configured |
| WinForms companion | Small native Windows build using the existing .NET Framework compiler and OS APIs | Signing, installer and native lifecycle tests remain |

This does not lock the product permanently to a model or vendor. A smaller runtime director should be compared on actual structured-output reliability, context fit and cost. The current verified configuration is not evidence that the cheapest possible agent has been selected.

## Economics and higher tiers

Draft settings are trial three pictures lifetime, Studio 120/billing month and Atelier 360/billing month, with minimum new-generation intervals of 60/30/10 minutes. These are provisional. Final prices, credits, upgrade policy and spending ceiling require approval after measurement.

Customer pictures and provider attempts are different. Failed/HOLD work does not consume a customer picture credit, but still costs an operating attempt. Successful images count even after routine storage expiry. The local shared three-attempt daily safeguard is not a subscription model and is not the provider's own quota.

Paid tiers currently share models. The longer-term premium idea remains: more reasoning time, richer creative context, better detail and potentially different output quality. It needs a real implementation and evaluations before being sold as a distinction. No unlimited expensive generation is promised.

Measure average/heavy use, failures, multiple displays, reasoning, images, weather licensing, image delivery/storage, payment fees, tax and support before choosing prices. Around $99/year was an earlier hypothesis, not a current offer; the implemented billing catalog is monthly for now.

## Completed evidence and explicit blockers

Automated checks cover real SQLite transactions, mocked external integrations, actual React lifecycle/interaction under a simulated DOM, capacity/quota isolation, queue recovery, night JPEG validation and accelerated policy/playback studies. Selected local HTTP account/weather routes and real Cloudflare inference/storage have been exercised. New focused checks cover journey continuation, city/style/ready progression, prepared playback timing/preload, coarse surface updates, release billing activation and native/fallback password compatibility.

**Browser evidence is now bounded rather than wholly blocked:** actual Chrome exercised 18 viewport cases across phone/tablet/desktop, ultrawide and 4K-sized windows. Its report records zero horizontal overflow and broken images, real ten-second advancement with no demo API calls, fullscreen entry and city/style/ready progression into a window-filling personal world. Evidence is in ignored `outputs/customer-journey-browser/`; see [design-qa.md](design-qa.md) for design limits. These are browser window sizes, not physical phone/4K-monitor tests, exhaustive accessibility, sustained visual comfort or proven reference-site fidelity.

**Live generation evidence:** on 27 October, one director result was invalid and a later new account-owned request reached ready through the local durable pipeline in 22.34 seconds after one generation POST. Its **Autumn Lake Serenity** JPEG is 1024×1024; ignored evidence is `outputs/live-journey-report.json` and `outputs/live-journey-art.jpg`. One success and a handled invalid-output case do not establish typical latency, indefinite artistic variety or hosted Workflow capacity. Historical day/night provider examples remain distinct from this current roundtrip.

**External integration setup is incomplete:** real email sender/delivery, Stripe sandbox lifecycle, hosted resources/domain/secrets and native OS qualification need operator access or human testing. Stripe was explicitly left disabled while the operator's domain/email/payment setup is pending. No production payment, paid hosting-plan activation or public deployment was performed. Live inference used the existing configured provider account.

## Remaining work, in order

Architecture update, 26 October 2026: staged recovery, transactional dispatch, server-owned versioned memory, separate ledgers/admission, durable billing inbox/reconciliation, scheduled cleanup and recoverable deletion are implemented locally. The older roadmap below describes product/release qualification; scheduled cleanup and reconciliation no longer need an initial implementation. They need hosted acceptance, monitoring and support operations. See [the complete review coverage](docs/architecture-changes.md) and [updated system diagrams](docs/system-design.md).

1. Extend the bounded Chrome runs to physical desktop/mobile devices, other browsers, mixed DPI, accessibility, reduced motion and sustained GPU/battery/comfort checks. Review real artwork crops and sharpness. Existing screenshots and geometry checks do not replace this qualification.
2. Qualify more real artwork over day/night/weather changes, including a multi-hour unattended session, offline/hidden return, stable holds and meaningful variety. Measure why a picture was appropriate and whether people keep the display running.
3. Configure HTTPS production-mode staging with a verified email sender, then test verification/reset delivery, replay/expiry, two-account isolation and deletion against real services.
4. Configure Stripe sandbox Prices/Portal/webhooks; test purchase, decline/authentication, duplicate clicks, plan changes/proration, renewals, failed payments/recovery, cancellation, retries and refund/dispute review. Fix actual provider-contract gaps before live billing.
5. Provision isolated hosted D1/R2/Workflow resources, migrations and server secrets. Measure CPU/memory and concurrent requests; approve a suitable budget rather than assuming free-tier suitability.
6. Qualify scheduled cleanup, billing reconciliation and audited operator picture adjustments; connect operational alerts to a monitoring destination. Test hosted backup/restore/rollback, finish a support interface and independently review authentication/abuse controls.
7. Qualify Windows apply/restore, monitors/DPI, preview/input/lock and sleep/wake. Decide slideshow support, then signing, installer and uninstall/distribution.
8. Finalize prices, allowance/cadence rules, public operator/support identity, privacy/retention/refund/cancellation terms and appropriate tax/licensing review. Run a small private beta before a separate live-payment/release decision.
9. Add deeper premium reasoning, richer theme nodes and intelligent long-run novelty checks only after core quality, costs and retention are convincing.

## What the operator must supply

The operator chooses an application address, authenticates hosting accounts, verifies a sending domain, creates or claims a Stripe sandbox and its products/Prices, and eventually completes live business/payout setup. Secrets are entered locally or in server secret storage, not in chat or frontend code. The operator also approves prices/spending and performs physical-device/Windows/overnight experience tests. `npm run setup:check` inventories field presence without displaying values or calling providers; [docs/launch-setup.md](docs/launch-setup.md) gives the step-by-step handoff. The recording demo needs none of these external accounts.

Technical deployment/configuration work can be assisted; creating/verifying external accounts, accepting costs and approving public commercial terms cannot be assumed from a successful code build. GitHub source publication does not itself deploy the app or activate billing.

## Future horizons and boundaries

Potential surfaces include phones/tablets, TVs/projectors, digital frames and eventually commercial installations. Hardware, fleet management, business signage and advanced event/news awareness remain deferred. Opt-in seasonal/cultural context must be appropriate and restrained. Civic/political cues should not promote candidates or present outcomes as good or bad.

The central asset is a creative context engine that understands a moment and directs suitable art for a surface. The brand can feel alive while the application remains quiet. Additional dashboards, routes or animations are not evidence that this core value has been achieved.

## Architecture decisions and boundaries — 26 October 2026

Keep the current Worker, D1, private R2 and Workflow stack while repairing the boundaries between them. A new database or orchestration vendor would not itself solve lost dispatch, ambiguous inference, competing memory writes or unsafe account deletion. The implementation therefore adds explicit durable stages, transactional outbox delivery, operation receipts, version claims, manifests and bounded repair.

Creative memory belongs to a world on the server. Only validated display/feedback events change it; clients cannot overwrite it with old snapshots. Preference versions and display event IDs let multiple tabs/devices disagree safely. Default worlds and surfaces are now separate identities so future phones can reuse the domain without assuming an account is a screen. Multi-world UI, independent per-device surfaces and mobile apps remain future work.

Continuity takes priority over inference frequency. The last valid image remains while work is held or unavailable. A safely failed preparation releases customer picture credit; a successful preparation commits once. Unknown paid outcomes require reconciliation instead of an automatic repeat purchase. Picture allowances, provider attempts, estimated money, concurrency and subscription eligibility are deliberately separate policies.

Night comfort must be rechecked when showing an image. Native cached artwork uses a short-lived selected-city policy and crop checks; stale or malformed policy fails dark. This is source-level protection, not proof of real monitor comfort, battery performance, OS lock safety or restoration behavior.

The new release configuration separates development, staging and production and refuses placeholder resources or unapproved hosted budgets. Source publication cannot activate billing. Real service accounts, resource provisioning, protected environments, commercial weather, cost choices, hosted password/JPEG CPU measurements and release acceptance are still necessary. The 600k PBKDF2 work factor remains unchanged by the native-async optimization; fallback performs the same algorithm and iterations. Local speed improvements do not establish hosted signup capacity.

Long-run artistic quality is still an evaluation task. Existing sampling/contracts/fingerprints are useful evidence of variety, not a guarantee that every image is unique or worth displaying. A blinded human-rated image set, real multi-hour sessions and measured cheaper-model comparison should decide future creative and paid-tier claims.
