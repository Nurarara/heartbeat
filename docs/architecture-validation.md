# Local architecture validation — 26 October 2026

This records local evidence for the architecture update from baseline `167eedd`. [Requirement coverage](architecture-changes.md) distinguishes implemented source from remaining release acceptance. No new paid inference, real email, Stripe payment, cloud provisioning or deployment was performed during these checks.

## Passed

- `npm run test:architecture`: schema contract, staged fault/recovery tests, concurrent server memory/preferences, migration from old account/profile/job data, retention/deletion races, security/context/release guards and audited allowance adjustments. Real in-memory SQLite transactions; provider, storage and billing failures simulated. The maintenance error printed by its failure-isolation test is intentional.
- `npm run test:product`: accounts/ownership, billing inbox/reconciliation and checkout/deletion races, React studio interactions, account queue playback, stable lost-ACK retries and account-identity races. External HTTP mocked; UI uses a simulated DOM.
- `npm run test:ai`, `npm run test:creative`, `npm run test:ambient`: service/provider contracts, creative library and long-run bounded-memory sampling, quiet hours, playback and weather/context policy. No live model calls.
- `npm run check:schema`: 14 migrations, 36 tables. Typed schema and migration-derived contract agree; current runtime marker is 13.
- TypeScript and targeted ESLint covering the modified product/server boundaries and playback/startup/preparation scripts. Build succeeded through all Vinext stages. Framework classification/plugin-timing notices remain informational.
- `npm run desktop:build`: compiled unsigned EXE/SCR and passed origin, argument, night-policy/crop, cache-namespace and DPAPI self-tests. No OS settings changed.
- `npm run product:prepare`: exported the correct persisted local database and restored the SQL into memory to verify integrity and critical row counts before upgrade. Applied additive migrations and passed a repeat no-change run.
- `npm run test:product:live` against the actual built Worker on HTTP loopback: landing/auth/studio/display/legal/desktop routes, blocked legacy routes including static prototype files, registration/session, preferences, private library and disabled billing. Immediate background deletion completed for the disposable account. Final local counts: two original accounts, zero deleting accounts, 12 attempt records, seven stored-art references, schema marker 13.
- Exact staged Git source checked against both configured local secrets and common credential/private-key patterns, with no findings. Private runtime files, backups and unsigned binaries remain ignored.

## Not established by these results

Hosted CPU/memory/load/cost, real provider recovery and invoice settlement, actual Stripe sandbox lifecycle, real mailbox delivery, visual/browser/accessibility quality, Windows OS behavior and overnight ambient comfort remain unqualified. Local PBKDF2-600000 samples varied with CPU contention and took seconds; selecting a hosted plan requires measurement. Earlier real Cloudflare image examples predate this change and do not qualify its hosted workflow.

The committed CI now includes an isolated built-app local HTTP journey with AI and billing disabled. Its remote Ubuntu execution must be checked on the published commit; the local Windows results above are not a substitute for a green remote run.
