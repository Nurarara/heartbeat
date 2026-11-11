# Architecture implementation and acceptance record

Updated 26 October 2026. Implements the architecture review against baseline `167eedd`. This is a source implementation record, not a production certificate. The supplied 25-page architecture PDF remains the review input.

## Requirement coverage

| Review | Implemented in this checkout | Remaining acceptance or scope |
| --- | --- | --- |
| R01: recoverable generation | Persisted stages, fenced leases, input hashes, provider-operation receipts, immutable asset keys, ambiguous-outcome state, safe recovery and audited settlement | Hosted Workflow restarts and provider ambiguity must be exercised on staging |
| R02: reliable dispatch | D1 job and outbox written together; stable Workflow IDs; bounded dispatch retry and scheduled repair | Hosted scheduler and Workflow failure drills |
| R03: domain boundaries | Workflow calls typed generation operations directly; account inference cannot use the old synchronous prepare route | Further formatting/refactoring can follow without another platform rewrite |
| R04: authoritative memory | Server-owned bounded memory; versioned preference CAS; append-only, idempotent display/feedback events; concurrent event claim | Real multi-device sessions and long-running creative evaluation |
| R05: separate identities | Account, default world, presentation surface and paired-device records; owner/world/surface checks | Customer-facing multiple worlds and independent per-device surfaces are deferred; paired devices currently share the default surface |
| R06: admission and capacity | Separate eligibility, picture reservation, daily attempt and estimated monetary ceilings; one pending account job; provider slots, queue deadline and stage circuits | Hosted load/CPU measurement and approved cost estimates; priority scheduling across paid tiers is not implemented |
| R07: ledgers | Idempotent picture reserve/commit/release, bounded audited period allowance adjustments and separate provider operating/cost entries | Actual provider invoice reconciliation and a support user interface remain future work |
| R08: database efficiency | Period counters, indexed/bounded repair queries, cursor library pages and read-only repeat profile access | Measure D1 query plans, row reads, contention and cost under hosted load; large job tables still require a measured retention/archive policy |
| R09: polling and delivery | Server job discovery without browser storage, adaptive jittered polling, private owner-authorized image responses, per-account desktop cache | Browser private image caching/signed delivery is deliberately not enabled; measure bandwidth before changing revocation semantics |
| R10: billing state machine | Durable signed webhook inbox, pinned Stripe contract, retries/quarantine, scheduled current-state reconciliation, review holds, one pending checkout and fenced deletion interaction | Real Stripe sandbox lifecycle, delays, retries, disputes, renewals and portal testing; live billing stays off |
| R11: security | Versioned 600,000-iteration PBKDF2-SHA256 with legacy upgrade, hashed sessions, credential epochs, reset revocation, named pairing, abuse limits and trusted-proxy opt-in | Independent review, hosted password CPU qualification, email-delivery and browser security tests; optional MFA/OAuth are outside this change |
| R12: context adapter | Free local/commercial hosted provider boundary, allowlisted HTTPS endpoints, provenance/freshness, bounded stale responses, cache/deduplication, circuit and route admission | Commercial weather subscription/key; cache is per Worker isolate, not a distributed global cache; choose global caching from measured traffic |
| R13: asset lifecycle | Private manifests, content hashes for new art, staged/ready/deleting/deleted states, scheduled bounded retention, current/favourite protection and deletion repair | Hosted R2 failure and retention drills; old assets have legacy metadata, not retroactively verified hashes |
| R14: deletion | Immediate credential revocation, atomic deletion intent, resumable bounded cleanup, late-object repair and anonymized financial/job tombstones | Hosted interruption/retry drills and final legal retention policy; deletion cannot revoke pixels already seen or copied offline |
| R15: Windows safety | Account/surface cache namespace, atomic manifests, DPAPI token storage, disconnect/purge, short-lived city/night policy, crop checks, wake/transition guards and display ACK retries | Actual OS wallpaper/restore, lock/sleep, screensaver parenting, mixed DPI/monitors, signing and installer; slideshow restoration remains unsupported |
| R16: creative evaluation | Structured creative contracts, provenance, bounded history/fingerprints, fixed simulation/evaluation scripts and existing image/night fixtures | A blinded human-rated benchmark, tier/model comparison and quality thresholds remain; absolute uniqueness is not guaranteed |
| R17: release environments | Separate source configuration for staging/production, CI, exact-SHA protected release gate, same-SHA staging check, additive migrations and combined code/secret deployment | Provision resources, real IDs/origins, required GitHub reviewers, isolated secrets, successful clean runner, backup/restore and rollback drills |
| R18: legacy routes | Old inference/study routes gated behind explicit HTTP loopback development opt-in; customer prepare route blocked | Check deployed routing/WAF and public bundle exposure on staging |
| R19: operations | Independent bounded maintenance tasks, operational aggregates/alerts and authenticated audited retry/review/unknown-settlement/picture-adjustment endpoints | Alert destination, dashboards/SLOs, on-call/support process and invoice reconciliation |
| R20: qualification | SQLite transactions, fault injection, React DOM and contract regressions plus build/schema/desktop self-tests | Real hosted services, browser/device/accessibility, sustained load, overnight sessions and independent security qualification |

## Important operating rules

- A customer picture credit is reserved for a job. A successfully prepared picture commits it once, even if that picture is later too old for presentation or expires from storage. A safe failure or HOLD releases the picture credit. Ambiguous external outcomes are held for reconciliation rather than blindly submitted again.
- Provider attempts and estimated spend are separate from customer picture credits. A failed paid provider call can still cost money. `actual_micros` is not invented from the estimate; real invoice reconciliation remains a separate step.
- Operator picture adjustments change the exact current period's allowance, never successful-picture history or provider spend. Unique request IDs make retries idempotent; conflicting replay, inactive accounts, billing review, stale periods and withdrawals below reserved/used units are rejected. Customer accounts cannot call this endpoint.
- The local three-attempt daily safeguard is preserved. It is neither a provider quota nor an unlimited commercial plan. Hosted configuration requires positive, explicitly chosen cost estimates and budget.
- There is no exactly-once guarantee across D1, Workflows, the AI provider and R2. Stable operation keys, stage fences and manifests make safe states recoverable; unknowable external results remain explicit.
- Only a validated display acknowledgement contributes to displayed history. Preparing or downloading an image alone does not mean it was shown. Stable event IDs make lost-response retries safe.
- The default world/surface migration provides an identity boundary for future phones and multiple displays. It does not implement a mobile app, mobile OS wallpaper control or customer-facing multi-world management.

## Local verification versus release acceptance

Run the commands in the README after changes. The automated suites use real in-memory SQLite transactions and simulated dependencies; React playback tests use a simulated DOM. They do not make paid provider calls, send real mail, charge cards or set OS wallpaper.

The previous real inference examples documented in the build guide predate this architecture change. They must not be used as proof that the new hosted recovery design is qualified.

Before release, keep a record for the exact candidate commit containing:

1. Clean CI build and test results; schema migration from an anonymized prior-version snapshot; preserved account/ledger counts; successful restore and known compatible rollback version.
2. Separate staging resources and secrets, production policy, commercial weather, and approved per-call estimates/budget. Measure password hashing, JPEG validation and Workflow CPU/memory.
3. Real mailbox verification/reset/replay and logout/device revocation tests. Real Stripe sandbox purchase, return-before-webhook, duplicate/delayed webhook, renewal/failure/cancellation/refund/dispute and reconciliation tests.
4. Hosted interruption drills at dispatch, provider submission, R2 persistence, account deletion and retention; no duplicate automatic paid submission and no unresolved unobserved alerts.
5. Browser/phone viewport, accessibility, visibility/sleep/wake and overnight comfort checks; hosted load and cost measurement. Windows distribution has its own native qualification gate.
6. Operator identity, support/contact/refund/retention terms, alert routing and a small invitation beta. Only then separately enable live billing and public availability.

## Migration and publication boundaries

`npm run product:prepare` upgrades only the local persisted emulator, backs it up under ignored `outputs/backups` before the new architecture migrations, and preserves `.dev.vars`. Keep those backups private: they may contain personal account data. It is not a cloud migration or a substitute for a tested hosted backup.

`npm run check:schema` applies all SQL migrations to an empty SQLite database and compares the generated Drizzle contract. Migrations `0008` through `0014` are additive; the current schema marker is 14 (15 migration files, 38 tables). The latest migration adds Google identity/state and session authentication metadata. Do not edit already-applied migrations to fix a deployed database; append a migration.

The local upgrade was exercised against this checkout with a restore-checked private SQL backup. It preserved two accounts, 12 attempt records and seven stored-art references. A second preparation run made no further changes. These counts are local migration evidence, not a hosted backup/restore drill.

Source publication does not provision or deploy a service. The release workflow requires real isolated configuration, protected GitHub environments and an explicit exact revision. The committed environment file intentionally contains placeholders and zero monetary budget, so it cannot silently activate an unapproved deployment. Billing remains disabled in release builds until separately qualified and enabled.
