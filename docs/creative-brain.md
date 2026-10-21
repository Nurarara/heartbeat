# Creative planning foundation

For the current account application, see [product build and activation](product-build.md). The shared-key instructions below describe the earlier `/local-study` workflow. The account display uses sign-in, server profiles and durable background jobs.


Implemented: a local theme sampler, compact memory, proposal feedback, strict model contracts, protected Cloudflare generation routes, a durable attempt ledger, private image storage, decoded generated-image playback and review tools. The default display stays on six free authored SVG families until server setup and its private AI session are enabled. Two credentialed provider runs passed on October 20, 2026: a London daytime illustration and a dark Tokyo nighttime scene, including private image retrieval. Actual browser playback and overnight behaviour still need qualification.

## Use it

Run `npm run dev`. In city/display settings, expand **Creative ideas and memory** and choose **Preview a scene idea**. The proposed subject, activity, materials, style and composition are plans for a future generated picture. They are not depictions of the currently displayed SVG. **More like this** and **Less like this** adjust ingredient preferences. **Reset creative history** clears creative memory while retaining city/display settings.

The editable library is `lib/creative-library.ts`: 93 ingredients across seven categories. Physical compatibility tags, local phase and temperature suitability restrict sampling. Twelve candidate combinations are considered per guided proposal. The director contract allows a future model to reinterpret or invent beyond those ingredients.

## Memory

- `heartbeat.story.v1` retains the active city's last twelve displayed directions.
- `heartbeat.creative.v1` retains browser-wide usage counters and taste feedback across city changes. A snapshot also lives with story memory for recovery.
- Real SVG commits record their actual scene family. They do not claim an unrendered proposal was displayed.
- Future realized concepts can record ingredient use and the last 64 semantic composition fingerprints. A fixed 2,048-bucket count sketch helps avoid older combinations without growing a conversation forever. Hash collisions are possible; this is a diversity signal, not proof of visual uniqueness.
- A model packet receives current conditions, twelve recent scene families, eight recent concepts, twelve frequent ingredients, up to sixteen taste records and three proposed inspirations. It does not receive the whole archive.
- Previewing changes no display history. Feedback changes taste only. Preferences affect future planning context; no model training occurs.

## Evaluate

`npm run test:creative` validates compatibility, memory, model responses and provider contracts using mocked network responses. `npm run creative:evaluate` writes `outputs/creative-evaluation.json` and a standalone `outputs/creative-review.html`. The review sheet has 24 A/B pairs with context-fit, restful-atmosphere and freshness ratings, method reveal and JSON export.

The recorded offline comparison used 240 proposals per method: uniform sampling produced 221 semantic compositions with seven recent repeats; guided sampling produced 240 with no recent repeats. Guided selection considers twelve candidates and memory; uniform selection samples one. This comparison tests planning policy, not model quality, rendered-image beauty or unlimited uniqueness. A separate 500-step guided check produced 500 distinct semantic fingerprints in that test sequence. These are fixture results, not guarantees for every run.

TypeScript, the ambient/UI/recovery suites, accelerated multi-timezone soak and a production build passed after integration. Browser screenshots and real unattended playback remain unverified.

## Service setup still required

`lib/director-contract.ts`, `lib/ai/cloudflare.ts` and `lib/ai/service.ts` implement structured direction, FLUX schnell JPEG requests, signed AI sessions, bounded attempts and private artifacts. Provider credentials are server-only. Activation also requires local storage setup, an explicit enable flag and unlocking a browser AI session. Mock tests do not establish real model availability, artistic quality or costs.

Attempt budgets, pending storage, generated playback and mocked recovery checks are connected. Browser activation steps and live-test evidence are in [the Cloudflare setup guide](cloudflare-setup.md). Two real pictures have been visually inspected; the night picture also passed an approximate offline brightness sample. The smaller reasoning-model choice, sustained artistic variety, real browser transitions and overnight behaviour remain to be evaluated.

Cloudflare references used for the adapter: [REST API](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/), [FLUX schnell schema](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/), [errors](https://developers.cloudflare.com/workers-ai/platform/errors/). The current image adapter supports FLUX schnell's prompt/steps contract, without promising seed control or landscape output dimensions. Decoder/visual qualification still belongs to real playback testing.
