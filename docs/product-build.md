# Heartbeat application build — October 21, 2026

This is a working local application and an unsigned Windows companion build. It has not been published, charged a customer, or been qualified as a production service.

## Try the application

Run `npm run dev` and open **http://localhost:5173/**. The home page is now the product landing page, with interactive curated previews that never request inference. Create a Heartbeat account using an email and a password of at least 12 characters. In this checkout, explicit development mode permits unverified accounts only on HTTP loopback. It does not send verification emails or take payments.

Choose your city in the studio, select a preferred visual language in Atmosphere, then open the display. The account session connects AI automatically. Customers never enter provider tokens or the old shared display key. The existing free ambient study remains at `/local-study`; `/prototype/` remains a separate visual experiment.

Routes:

| Route | Purpose |
| --- | --- |
| `/` | Product introduction and curated atmosphere previews |
| `/auth` | Register, sign in, verify email and reset password |
| `/app` | Account-owned studio, city/preferences, library/favourites, devices and billing |
| `/display` | Minimal ambient artwork, time, temperature and optional feedback |
| `/pricing` | Trial and memberships; actual configured Stripe prices when enabled |
| `/desktop-guide` | Windows companion setup |
| `/privacy`, `/terms` | Accurate early-access information; operator details still required before launch |

## What is implemented

- Email/password accounts, PBKDF2 password hashes, opaque hashed session tokens, HTTP-only cookies, HTTPS `__Host-` cookies, sign-out, one-use verification/reset tokens, password-confirmed deletion and bounded request/rate checks. Password reset revokes existing sessions. Email/password is implemented; Google/OAuth is not.
- Account-owned city and display preferences, art-language preference, bounded creative memory, private generated JPEG retrieval and a library. Favourites are protected from routine image retention, capped at 100 per account. Other images retain the current frame and recent candidates. The account display receives server preferences/memory directly and still opens when browser storage is blocked. Sign-in and sign-out do not depend on clearing storage. Browser account changes clear previous account state when storage permits; a same-account reload preserves an ambiguous job's recovery ID.
- Separate customer and operating budgets. Current provisional plans: trial three pictures lifetime, Studio 120 pictures/billing month, Atelier 360 pictures/billing month. In-progress work reserves allowance. Failed or HOLD preparations do not use customer picture credits. Successful pictures still count after routine image expiry. Every attempted provider preparation remains spent against the account-wide UTC operating cap.
- The checkout's existing operating cap was preserved at three attempts/day. It is not a Cloudflare quota or a sustainable public-service pricing model. Final prices, credits, refresh intervals and the operating budget require cost measurement and operator approval. These draft plans do not claim different model quality; both currently use the verified provider configuration.
- Cloudflare Workflows binding `ARTWORK_WORKFLOW`, durable D1 jobs, unique account/request IDs, a permanent started gate and zero ordinary step retries. The client polls the stored result after a reload/lost response rather than repeating a possibly charged POST. A worker interrupted during inference can still leave an operating attempt spent. There is no exactly-once guarantee from the external AI provider.
- Fresh weather conditions and bounded actual-picture history reach the director, along with preferred style and compatible theme inspiration. Quiet-hour and decode/crossfade protections remain active.
- A bounded JPEG decoder checks actual night pixels on the server across centered wide, portrait and full-frame samples before an image is stored as ready. Bright or malformed night results fail without consuming a customer picture credit. The browser retains its own cropped night check as well. These are provisional comfort checks, not an artistic-quality or monitor-brightness guarantee.
- Stripe hosted subscription Checkout, customer-bound Portal sessions, allowlisted recurring Prices, persistent checkout idempotency, raw-body signature verification, event deduplication, per-customer reconciliation fencing and retrieval of current subscription state. Browser success URLs never grant access. Unknown Prices cannot grant paid access. Refund/dispute events hold access for manual review; later invoice events do not automatically clear that review.
- Revocable, limited-scope desktop device tokens, short-lived six-digit pairing, private image retrieval and optional background picture requests using the account's stored city/preferences. Device credentials cannot call account/billing endpoints.

## Verification actually performed

- TypeScript and production build passed. Build output includes the application routes and Workflow binding.
- `npm run test:product`: real SQLite transactions plus mocked Stripe/email/AI/Workflow services; actual React components in a simulated DOM. Covers sign-in failures, CSRF, expired/forged sessions, verification/reset replay, account isolation, scoped device pairing/revocation, quota enforcement, forged plans, durable job deduplication/re-entry, library/favourites and account deletion. Billing covers duplicate, out-of-order and same-second events, concurrent reconciliation, failed storage before acknowledgement, unknown Prices and persistent refund review.
- `npm run test:product:live`: actual localhost routes, disposable account registration/session, preferences, private library and disabled checkout. No payment, email or inference request. Disposable accounts are deleted afterward.
- Ambient, creative, provider, prototype and accelerated soak suites passed. The soak covers 3,535 decisions and 1,211 rendered moments across seven simulated weeks. These are simulation results, not a real overnight desktop run.
- `tests/night-quality.mjs` decodes actual JPEG fixtures, including the real too-bright pencil-night regression. It checks dark acceptance, bright/malformed rejection, several crops and unchanged image bytes. The provider adapter also rejects a real bright image at night.
- Two live operating attempts exercised account → local Workflow emulator → real Cloudflare director/image generation → private storage/retrieval. Inspection of the first found a pencil-style picture too bright for night (mean ~0.402), which prompted the server quality guard and stronger night instructions. The second, **Moonlit Library Sanctum**, passed: mean brightness ~0.219 wide, ~0.254 portrait and ~0.229 full frame. The final JPEG is `outputs/product-workflow-live.jpg`. The quality regression is retained as a test fixture. No browser display ACK was fabricated. Test accounts were removed and the spent operating ledger retained. The cap was not increased.
- `npm run desktop:build` compiles `outputs/desktop/Heartbeat.exe` and `Heartbeat.scr`; self-tests cover allowed origins, screensaver arguments, dark/bright sampling and current-user DPAPI encryption. The build changes no wallpaper, startup or screensaver setting.

Browser inventory exposed no controllable browser or native window. No browser screenshots, real layout/device rendering, actual wallpaper changes, native screensaver preview/lock behaviour or unattended overnight use were verified. Passing a simulated DOM, local Workflow emulator or compiler is not evidence of those outcomes.

## Activate real email and subscriptions

These are operator steps, not customer steps. Do not paste secrets into chat.

1. Choose a real HTTPS application origin/domain and operator/support identity. Set `HEARTBEAT_APP_MODE=production` on its target. Keep local/test and production databases and secrets separate.
2. Configure a verified sender with Resend. Set `HEARTBEAT_EMAIL_API_KEY` and `HEARTBEAT_EMAIL_FROM` through runtime secrets. Validate real verification and password-reset delivery. Production registration stays unavailable without email configuration; production generation requires verification.
3. Create a Stripe account and use **test mode first**. Set `STRIPE_SECRET_KEY` to its test key. Create two distinct active recurring monthly Prices in GBP, USD or EUR, then set `STRIPE_STUDIO_PRICE_ID` and `STRIPE_ATELIER_PRICE_ID`. Real price amounts come from Stripe rather than invented UI values. Review the draft allowances and cadence in `lib/product/core.ts` before selling either plan.
4. Configure Stripe Customer Portal, including plan changes and cancellation. Register `/api/product/webhook` and store its endpoint's `STRIPE_WEBHOOK_SECRET`. Subscribe to Checkout completion, subscription lifecycle, invoice paid/payment failed, refund and dispute events supported in `lib/product/billing.ts`. Local Stripe CLI forwarding uses its own signing secret, different from the deployed endpoint.
5. Only after those values exist, set `HEARTBEAT_BILLING_ENABLED=true` **in the test environment**. Complete real Stripe test Checkout, Portal changes, cancellation, failed payment/renewal, webhook retry and test-clock scenarios. No real card is needed for sandbox testing. Real Stripe sandbox interaction has not been performed here.
6. Apply appended migrations to the intended target and provision the Workflow binding. Local tables were prepared using `npm run product:prepare`; local and hosted resources are separate. JPEG decoding and password work need hosted CPU/memory measurement. Free Workflow CPU limits can be insufficient; a local-emulator pass does not establish free-tier suitability. No paid cloud resources were created or enabled by this build.
7. Finalize actual prices, refresh/credit policy, cost ceiling, support/refund/cancellation terms and retention policy. Add scheduled cleanup/reconciliation, production monitoring, backup/restore tests and an independent security review. Finish browser/accessibility/device QA and a small private beta before live billing/public publication.

References: [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create), [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal), [Cloudflare Workflows](https://developers.cloudflare.com/workflows/build/workers-api/), [Workflow limits](https://developers.cloudflare.com/workflows/reference/limits/), [Resend sending](https://resend.com/docs/api-reference/emails/send-email).

## Windows companion qualification

Build on Windows with `npm run desktop:build`. Open the executable yourself and pair its six-digit code in Studio → Desktop companion. Tokens are encrypted using current-user DPAPI locally and hashed on the server. HTTPS is required except for loopback development. HTTP redirects are disabled for token-bearing requests.

Download latest only retrieves artwork. Applying/restoring wallpaper is explicit. Automatic wallpaper updates and creation requests are separate opt-ins. The companion uses `IDesktopWallpaper` with full local image paths and an optional monitor selection. It records prior wallpaper paths/position for a restore action. Restoring a prior slideshow configuration is not implemented and requires additional qualification.

The `.scr` entry handles `/s`, `/c`, and `/p <HWND>` preview invocation. Fullscreen mode uses cached pictures, supports multiple screen windows and exits on input. Missing/unreadable art falls back to black; locally late-night bright cached art is rejected. Native correctness still needs hands-on checks for preview parenting, mixed DPI, portrait displays, keyboard/mouse exit, sleep/wake, lock/password behaviour, resource use and install/uninstall. No startup task or OS screensaver registration was made. No installer or release signature is provided; the local binaries are unsigned development artifacts.

## Playback follow-up ? October 21

Investigating repeated old pictures found that account job polling shared the generation cooldown clock. A status refresh could postpone retrieving already-funded work for an hour. Recovery now has its own five-second polling schedule, including when capacity is exhausted or a prior original is restored. An in-memory request ID also allows lost-response recovery within the same open tab when storage is blocked. Decoded acknowledgement clears only the matching request; it cannot clear unrelated pending work. Reload recovery still requires available browser storage.

The account display now labels illustrated previews, originals and preparing work. Daily-cap status provides the next UTC reset in the viewer's timezone; an exhausted customer allowance keeps its own explanation. The three-attempt operating cap was not raised and no additional provider inference was performed for this fix. `tests/product-playback.mjs` exercises real React playback with mocked queued work, a one-hour generation cooldown, exhausted capacity and blocked-storage/lost-response recovery. The user selected the glass-organism concept with the third concept?s minimalism. The combined target, original text-free hero/weather assets, redesigned landing, sign-in and studio styles are now implemented. Public reference-site HTML/JavaScript were inspected, but no browser screenshot or live visual comparison was available. See `design-qa.md`, which remains blocked, and `docs/design-reference-notes.md`.

## Redesign and source checkpoint

The current landing uses an original raster glass organism with limited breathing/pointer transforms, native scrolling, self-hosted OFL fonts and illustrative Rain/Sun/After hours selectors. These previews make no runtime inference requests. Hidden-tab/reduced-motion behaviour and selector synchronization are covered by React DOM tests; actual rendering/performance still needs browser qualification. This is not a real-time WebGL organism or a clone of either reference website.

`README.md` and `PROJECT_VISION.md` now describe the complete current application, rationale, setup, remaining work, manual operator steps and known blockers. `scripts/check-secrets.mjs` checks the exact staged Git index before source publication, including configured local secret values, common credential patterns and private runtime file paths. Browser/runtime databases, secrets, outputs and unsigned desktop binaries stay ignored. Source publication does not activate billing or deploy the app.
