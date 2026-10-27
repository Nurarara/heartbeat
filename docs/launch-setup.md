# Heartbeat: operator setup and first paid-user test

Updated 27 October 2026. The recording demo needs no domain, Stripe account or email service. It runs locally at `/demo`. Real customer payments and email require the setup below. Keep all credentials out of chat, frontend code and Git.

## Record the demo now

1. Run `npm run dev` and open http://localhost:5173/demo.
2. Wait until all ten prepared artworks are loaded. Click **Enter the demo**; it requests fullscreen from that click. If fullscreen is unavailable, the player fills the browser window.
3. Each artwork holds for ten seconds, with a smooth crossfade. The ten-scene loop lasts about 100 seconds. There is no inference, weather request or account/payment request during playback.
4. Move the pointer to show controls. Space pauses/resumes, arrows change artwork, F toggles fullscreen. Use captions off for a cleaner recording; the prepared-demo label remains. **Whole picture** preserves the artwork on unusual screen shapes; **Fill screen** fills the window with a crop.
5. Record using your preferred screen recorder. The displayed cities, weather and time are illustrative recorded contexts. The normal `/display` continues to use account preferences, real context, its own creative memory and normal allowance/cadence.

The ten original PNGs are in `public/demo/art`; full generation prompts and built-in Image Generation provenance are in `docs/demo-art-a.json` and `docs/demo-art-b.json`. Optimized WebP copies are served by the player; dimensions are preserved. These files are prepared demo content, not evidence of a live model call every ten seconds.

## Check what is missing

Run `npm run setup:check`. It checks local field presence without displaying values or calling providers. Configuration and successful real-service acceptance are separate states.

The ignored `.dev.vars` file is beside `package.json`. Set secrets there locally, or in the target deployment's secret store. `.env.example` lists field names only. Source publication does not upload this file.

## Stripe sandbox first

1. Create a Stripe account or use a temporary claimable sandbox if available. Use a sandbox, never live payments for these tests. An existing Stripe account is not needed for the recording demo.
2. In the sandbox Product catalog, create **Heartbeat Studio** and **Heartbeat Atelier**, each with a distinct recurring monthly Price. Use the same supported currency for both (GBP, USD or EUR); choose test amounts. Final public prices still need an explicit decision.
3. Save the sandbox secret key and both `price_...` IDs locally as `STRIPE_SECRET_KEY`, `STRIPE_STUDIO_PRICE_ID` and `STRIPE_ATELIER_PRICE_ID`. Configure the Customer Portal for cancellation and supported plan changes.
4. Configure event delivery to `/api/product/webhook` and put the endpoint's signing secret in `STRIPE_WEBHOOK_SECRET`. The endpoint must deliver the app's pinned **2025-03-31.basil** event contract. Required event types are listed in `lib/product/billing-recovery.ts`.
5. Local Stripe CLI forwarding uses a different signing secret from a hosted endpoint. Check the forwarded event's API version; the app deliberately quarantines incompatible signed events. A request `Stripe-Version` header does not itself control webhook event shape. Do not remove this protection just to make a test green.
6. Configure email verification first. Then enable `HEARTBEAT_BILLING_ENABLED=true` only in the sandbox/staging environment and restart the local server. Development's email bypass does not make an account eligible for real Checkout; the account must actually be verified.
7. Test signup, verification, city/style onboarding, Checkout, return before webhook, delayed/repeated events, immediate server entitlement refresh, cancellation, renewal failure/recovery, refunds/disputes and portal changes. A browser success URL must never grant membership by itself.

Temporary sandboxes can expire and must be claimed for continued use. Real Stripe acceptance is pending until a real sandbox has been provisioned and these journeys have passed.

References: [Stripe sandboxes](https://docs.stripe.com/sandboxes), [products and prices](https://docs.stripe.com/products-prices/manage-prices), [webhook versioning](https://docs.stripe.com/webhooks#api-versioning).

## Domain and verification email

1. Choose and register a domain you want to own. No domain was purchased by this work. A temporary HTTPS staging hostname can be used for the web app; broad customer email still needs a verified sender domain.
2. Create a Resend account, add your sending domain and add the DNS records Resend provides. Wait until its dashboard reports the domain verified. Do not replace unrelated existing DNS/email records blindly.
3. Create a sending-only key scoped to that domain. Put it in `HEARTBEAT_EMAIL_API_KEY`; set `HEARTBEAT_EMAIL_FROM` to a sender on the verified domain, such as `Heartbeat <hello@your-domain>`.
4. Set the exact application origin for that environment. Test verification and reset emails in real inboxes, expired/reused links and continuation into the chosen plan/onboarding. Verify that reset revokes existing sessions and paired devices.

References: [Resend domains](https://resend.com/docs/dashboard/domains/introduction), [Resend API key permissions](https://resend.com/changelog/new-api-key-permissions).

## Hosted staging and launch

Provision separate Cloudflare Worker, D1, private R2 and Workflow resources for staging/production. The existing inference token may only permit Workers AI; do not assume it can deploy or administer resources. Use separate narrowly scoped deploy/runtime credentials. Fill real resource IDs/origins and approved cost estimates/budgets in `config/environments.json`; placeholders intentionally fail release checks. Commercial weather access is required by hosted policy.

Configure GitHub staging/production environments and required reviewers with the exact variable/secret names in `.github/workflows/release.yml`. The protected workflow releases an exact reviewed commit; production requires that same commit's successful staging deployment and recorded acceptance. Billing is disabled by default and must only be activated after the sandbox journey passes.

Before charging customers, finish hosted CPU/memory/load measurements (including password hashing and JPEG validation), provider interruption/recovery drills, monitoring/alerts, backup/restore/rollback, browser/accessibility/device and overnight comfort tests, independent security review, support/operator identity and final privacy/retention/refund/cancellation terms. Start with a small private beta. Mobile apps, native Windows distribution/signing and distinct premium model-quality promises have their own qualification work.

See `docs/architecture-changes.md` for the complete release acceptance register.
