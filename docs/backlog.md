# Backlog

Convention: `docs/conventions/backlog-management.md` (selected harness root; AGENTS.md §12)

## Inbox

### B-008 — Qualify compatible minimatch audit remediation
- Problem: Newly disclosed GHSA-g3hv-75wg-m249 reports inherited minimatch 10.2.6 developer-tool paths; Sprint 005 also reports serve-handler’s 3.1.5 through the broad affected range. Patched 11.0.1 is outside current consumers’ declared 10.x ranges. Static independent review found no production dependency path or application-controlled glob, and no inspected caller enables the vulnerable optimizationLevel ≥2 mechanism.
- Outcome: Qualify compatible upstream consumers/backport or an explicitly authorized toolchain upgrade, preserving release-age policy and full regression checks; remove the advisory without suppression or undeclared major override.
- Constraint: On 2026-10-31 the orchestrator, under Lou’s delegated intermediate decisions, approved a narrowly temporary private/local Wave 1 exception: Sprint 004’s 33 ESLint/typescript-eslint paths and Sprint 005’s additional readdir-glob 10.2.6 and serve-handler 3.1.5 paths. Full audit stays NON-PASS. Reassess at Wave 1 completion/before Wave 2 and immediately on dependency, caller/options, input-trust or production-closure changes. No shared/public deployment, audit suppression, age bypass or implementation of an unrelated upgrade is authorized.
- References: https://github.com/advisories/GHSA-g3hv-75wg-m249; `docs/sprints/sprint-004.md` and `docs/sprints/sprint-005.md` safety decisions; local evidence `/tmp/workprint-sprint-004/native-turn-transport/6871fb9f7289806d979f0ebe1e7626be743e634a/audit-blocker-summary.json` and `/tmp/workprint-285be91-full-audit.json`. Advisory requires attacker-controlled glob plus optimizationLevel ≥2; default is 1. readdir-glob whitelists options excluding that flag; serve-handler 3.1.5 lacks the described implementation. These are static exposure findings, not exploit tests or a zero-risk claim.

## Next

MVP items B-012 to B-020 come from Lou's 2026-11-01 grooming, in Lou's priority order. Each tool lives in its own directory under the agent module and calls application functions in process, never application HTTP routes (implementation spec §10). Assistant saves and generations never count as human approval (AGENTS.md).

### B-012 — Chat with the agent through a tool-using loop
- Problem: Send is still disabled. The only native agent (`apps/api/src/agent/mastra/native-turns.ts`) is text-only: "Do not use tools", one step, a 64-token output cap and an 8-second budget. `DEFAULT_ASSISTANT_MODEL` is checked for syntax only, so no live model is connected. The send/stream path also lost its tests in the Sprint 004 MVP test trim.
- Outcome: The user types into the chat input. The message goes to one Mastra agent loop on the video's native thread (thread id = video id, created on the first accepted send). The loop can answer, call registered tools over several steps and stream its reply, and the reply is saved to history. Pass: the user can talk to the agent and the agent responds; a reload shows the saved conversation.
- Constraint: One backend and one Mastra instance; native threads stay the conversation store. The model key stays server-only. Raise the current turn limits deliberately rather than removing them.
- References:
  - [Sprint 006](sprints/sprint-006.md) Stories 1–3: the planned model binding, send/stream and Stop work, to be re-cut around this item.
  - `apps/api/src/mastra/config.ts`: model admission.
  - [Meta developer docs](https://dev.meta.ai/docs/image-generation): the API base is `https://api.meta.ai/v1`. It offers OpenAI-compatible Responses and Chat Completions APIs, and the docs have a Tool calling page.
- Blocker: confirm the chat model ID; the Muse model for the chat loop has not been named yet.

### B-013 — Agent tool: update the video's script
- Problem: The Script tab can only show and manually edit saved scripts. The agent has no way to write one.
- Outcome: An update-script tool, in its own directory, saves a new assistant-made script version for the current video/thread. The user sees the Script tab update to match. Pass: the database holds the new version and the Script tab shows it.
- Constraint: The saved version is a draft, not an approval. Turn the animation-studio skill's instructions into the tool's description and the agent's guidance rather than copying its local file workflow. The skill's Scene Script YAML schema differs from Workprint's saved script content, so the mapping needs a decision.
- References:
  - `~/projects/animation-studio/.pi/skills/create-scene-script/SKILL.md` and `references/scene-script-schema.md`: Lou's create-script skill.
  - `apps/api/src/artifacts/content.ts`: the saved script schema.
  - `apps/web/src/materials/script.tsx`: the Script tab.

### B-014 — Agent tool: AskUserQuestion with options in the UI
- Problem: The question card UI and contract exist (`questionSchema`, `apps/web/src/conversation/question.tsx`). The agent cannot ask a question yet, and answers cannot reach the agent.
- Outcome: The agent calls AskUserQuestion with a prompt and options. The turn waits, and the UI shows the question as in demo-02: question N of M, lettered options, plus "type your own answer". The user's choice goes back to the agent, which continues with it. Pass: the options appear in the UI, and choosing one resumes the agent with that answer.
- References:
  - `docs/design/demo-02.html`: the approved look.
  - [Sprint 007](sprints/sprint-007.md) Stories 1–2: the planned question reads and exact answers, to be re-cut around this item.
  - `packages/contracts/src/models.ts`: `questionSchema`.

### B-015 — Agent tool: generate images with Meta Muse Image
- Problem: The product cannot create images; users can only upload them (Sprint 005).
- Outcome: A generate-image tool calls Meta's image API from a text prompt, optionally with images already in the user's storage as inputs. It stores the result in private storage as the user's image. The image appears in the Assets tab. Pass: the user asks for an image, the agent calls Meta, the image is stored and shown, and a follow-up request can use a stored image as input.
- Constraint:
  - The Meta docs, read 2026-11-01, say:
    - model `muse-image-1.0`
    - `POST /v1/images/generations` for text to image, and `POST /v1/images/edits` with 1–10 input images (`image_url` or `file_id`)
    - base64 output by default
    - blocking calls
    - $0.01 per image
  - Confirm the real response shape with one live call before writing the parser.
  - The key stays server-only.
- References:
  - [Meta image generation](https://dev.meta.ai/docs/image-generation).
  - `~/projects/animation-studio/.pi/skills/generate-image/references/prompt-preparation.md`: prompt guidance.
  - `apps/api/src/storage/`: storage from Sprint 005.
- Blocker: Lou's wording "shown … both in assets" is unclear. Confirm whether the image should also appear inline in the chat.

### B-016 — Images on AskUserQuestion options, with exact asset identity
- Problem: Question options carry only an id and a label. The agent cannot show image choices, and an answer cannot say which asset was chosen.
- Outcome: An option can carry a stored image (an exact asset/version), and the UI shows it as a thumbnail. The answer returned to the agent names that exact asset/version, so the agent knows which asset the user means. Pass: the user picks an image option, and the agent's next action uses that exact asset.
- Constraint: Do not guess identity from labels or untyped content. Same principle as B-003.
- References: B-014; B-003 (proposal input display names); `packages/contracts/src/models.ts` `questionSchema`.

### B-017 — Agent creates reference sheets
- Problem: The Assets tab can show reference sheets (`apps/web/src/materials/sheet.tsx`), but only manual saves create them. The agent cannot create a character, place or prop reference.
- Outcome: The agent creates a reference sheet for a subject: a saved reference version with its description, continuity notes and images generated through B-015. The sheet appears in Assets. Pass: the user asks for a reference sheet, and a saved sheet with images shows in Assets.
- References:
  - `~/projects/animation-studio/.pi/skills/create-storyboard/references/reference-package-schema.md`: subjects, views and continuity notes.
  - `generate-image/references/prompt-preparation.md`: the "character sheet" image type.
  - `docs/design/` demos showing reference sheets.
- Blocker: no dedicated reference-sheet skill or template was found in `~/projects/animation-studio/.pi`; the closest sources are listed above. Lou to point to the intended skill and templates.

### B-018 — Agent makes the storyboard from the script
- Problem: Storyboard reads and manual edits exist (`apps/api/src/artifacts/storyboard.ts`, `apps/web/src/storyboard/`), but the agent cannot plan shots or make panels.
- Outcome: Storyboard tool(s) plan shots from the current script version, then create each panel's image through B-015 using the selected reference sheets. They save a storyboard version linked to that script and those references. Pass: the Storyboard tab shows the planned shots with generated panel images.
- References: `~/projects/animation-studio/.pi/skills/create-storyboard/SKILL.md` with `references/panel-generation-strategy.md` and `storyboard-schema.md`; B-013, B-015, B-017.

### B-019 — Agent tool: generate a video
- Problem: The Videos tab and player exist, but nothing produces a generated video.
- Outcome: A generate-video tool takes a prompt and one or more images (uploads or storyboard panels) and starts a provider job. It waits for the result, stores the video, and shows it in the Videos tab. Pass: the generated video is stored, appears in Videos and plays.
- Constraint: Video generation is asynchronous, so the job must survive a long wait and report failure honestly.
- References: `~/projects/animation-studio/.pi/skills/generate-video/SKILL.md` and `references/minimax-video-v2.md` (MiniMax Video Generation V2); `apps/web/src/videos/`; `packages/player`.
- Blocker: choose the video provider. Meta's API has no video generation (only video understanding); the earlier skill used MiniMax.

### B-020 — Agent tool: join videos together
- Problem: There is no way to combine generated clips into one video.
- Outcome: A join-videos tool combines an ordered set of the user's stored videos into a new video. The new video is stored and shown in the Videos tab, and the originals are kept. Pass: the joined video plays in Videos in the requested order.
- Constraint: This is the agent's assembly tool. Export and download stay in B-009.
- References: `~/projects/animation-studio/.pi/skills/assemble-video/SKILL.md` (stream-copy joining with compatibility checks) and `.pi/lib/ffmpeg.mjs`; `apps/api/src/storage/media/sandbox.ts` (the existing ffmpeg sandbox); B-019.

### B-001 — Bound incoming requests before native body parsing
- Problem: Sprint 001 Story 5 exposed a serving-order limitation in the pinned Mastra generated server (`@mastra/deployer` 1.79.0). Native context middleware awaits POST/PUT JSON before application authentication and request deadlines. An authenticated unfinished upload failed the independent five-second watchdog instead of reaching the intended two-second application deadline. This is pre-authentication resource exposure, not demonstrated unauthorized data access. Source inspection shows built-in `server.auth` also runs downstream; that alternative has not been compared in a runtime reproduction.
- Outcome: Before Phase 3 native-runtime qualification and before public deployment, demonstrate bounded incoming body size/time and appropriate early authentication rejection through the actual serving path. Retain normal authenticated API behavior, health access and exclusion of unintended native routes. Prefer an evidenced upstream fix or supported configuration; otherwise assess the official single-server adapter or verified deployment protections against the same behavior. Do not assume a proxy limit or library upgrade solves the issue without testing it.
- Constraint: Keep one backend/listener and one Mastra runtime. An application-owned official-adapter bootstrap changes the approved lifecycle and requires explicit approval. No vendor patch, parallel server, weakened failing test or claim that the current deadline works. The user subsequently approved deferring this gate for private/local Phase 1–2 development only; the exception is recorded in the spec and Sprint 001 Story 5. Preserve the failing qualification separately from passing current-scope tests. This does not authorize public exposure, implementation of a server migration, or claim that the limitation is fixed.
- References:
  - [Sprint 004, Stories 1a and 1b](sprints/sprint-004.md) — selected work record.
    - On 2026-10-29 the Story 1 investigation confirmed that no supported setting bounds the generated server, in 1.79.0 or 1.80.0. Upstream mastra-ai/mastra#28214 is open.
    - **Lou approved the application-owned `@mastra/hono` adapter entry the same day.**
    - 1a swaps the server with no behaviour change; 1b adds pre-Mastra routing, Auth and bounded intake.
    - Done on Mastra 1.79.0; B-007 reruns `qualify:ingress` after the upgrade.
  - [Sprint 001, Story 5](sprints/sprint-001.md#story-5-callable-backend-skeleton-and-typed-application-client) and [PR #7](https://github.com/cslou/workprint/pull/7) — affected API skeleton, now accepted for private/local scope under the tracked exception; published head at discovery was `435df589896e59f3bb2bcb6cdc007012e98e688e`.
  - `apps/api/test/ingress.qualification.ts` and `pnpm qualify:ingress` — committed unfinished-upload reproduction sharing `auth-built-fixture.ts`; both authenticated and unauthenticated leaf checks remain failing under the approved exception. Aggregate `pnpm test` remains the 13 passing current-scope cases.
  - `apps/api/src/mastra/backend.ts` and `apps/api/src/mastra/application-routes.ts` — current admission and request-reading boundaries.
  - [Mastra middleware](https://mastra.ai/docs/server/middleware) and [official Hono adapter](https://mastra.ai/reference/server/hono-adapter) — documented integration points; middleware before adapter initialization is a candidate, not an accepted migration.
  - Local investigation `/tmp/workprint-story5-blocker1/outcome.md` and reproduction `/tmp/workprint-story5-blocker1/contracts.log` — temporary supporting evidence, not durable prerequisites. The finding and required outcome are summarized above so this item survives their removal.

## In progress

## Later

### B-011 — Recover an initially failed workspace read
- Problem: PR41 preservation fix `9021158` keeps active editors mounted when image uploads finish. Independent re-review found a P2 edge case: if the initial workspace GET failed, a later successful upload cannot apply its receipt overlay because no successful base projection exists; the user must reload/reopen to see Assets.
- Outcome: Add explicit bounded read recovery for a missing/failed base projection while retaining same-scope populated editors, pending/conflicted text and original unknown-save identities. Prove failed initial GET → successful image upload → exact Assets row without reload, with no mutation replay or cross-account retention.
- Constraint: Accepted as a nonblocking P2 for private/local Story 4 under delegated intermediate decisions; this is not data loss or a failed upload claim. Address with authoritative workspace refresh work, not by restoring unconditional upload-driven unmounts.
- References: PR41 re-review cycle 3 at `90211588bb85ca87c51f45486c2d7fa3b9cfb690`, mergeability 4/5; `apps/web/src/shell/workspace.ts`; P3-S9 refresh work planned for Sprint 008.

### B-010 — Restore deferred model usage records
- Problem: Lou deferred usage records while approving core-functionality Sprint 006/007 planning to shorten delivery. The original P3-S1c requirement to persist each assistant model attempt is no longer part of this reduced delivery; no accounting completeness, spend totals or billable cancellation guarantees may be claimed.
- Outcome: When separately authorized, persist trusted actual model/attempt/account/conversation correlation, reported/calculated/estimated/unknown provenance and deduplicated observations without collapsing real repeated calls. Qualify provider response shapes and native correlation without treating terminal execution IDs as durably retained by assumption.
- Constraint: No usage schema, persistence, aggregation, dashboard or spend gate in Sprint 006/007. Keep server-only credentials, explicit live-call approval, bounded calls/output/concurrency, no hidden paid retries and honest unknown outcomes. Existing informational proposal estimates are not measured usage and remain in review disclosures. Later Phase 4 provider-specific usage requirements need explicit disposition before those integrations start; this deferral does not silently waive their safety/authorization gates.
- References: Lou’s core-functionality planning decision in this conversation; `docs/specs/implementation-spec-001.md` reduced-delivery amendment and P3-S1c; `docs/sprints/sprint-006.md`.

### B-009 — Deliver verified export after the reduced release
- Problem: Lou explicitly deferred export on 2026-10-31 to shorten delivery. P3-S11–S13 were originally Wave 2 Sprint 007; exact export capture, stream-copy assembly/publication, download and crash/race qualification remain unimplemented. Temporary video-upload restrictions also prevent claiming a complete user upload-to-export journey.
- Outcome: When separately authorized, deliver export from exact selected versions through bounded compatible stream-copy processing, verified immutable publication, authorized downloads/history and actual recovery/cancellation-race proof. Existing presentation must not claim working submission or fake downloads in the meantime.
- Constraint: Export is excluded from the current reduced delivery, not counted as complete. Reconcile P3-S9/S17 and Phase 4 export integration P4-S18/S19 so acceptance does not require or claim deferred behavior. No conversion, timeline, audio mixing or exactly-once external execution promise. Recording this item does not authorize implementation.
- References: `docs/specs/implementation-spec-001.md` P3-S11–S13, P3-S9/S17 and Wave 2 packaging; Lou’s 2026-10-31 decision to defer export while selecting Muse Wonder and requesting Sprint 006/007 plans.

### B-007 — Upgrade Mastra to 1.80.x after Wave 1
- Problem: Story 001 planned to upgrade Mastra (core/deployer 1.79.0 → 1.80.x, CLI 1.35.0 → 1.36.x, pg 1.32.0 → 1.33.x). The cohort was published 2026-10-28 between 13:33 and 13:58Z, and pnpm 11's default 24-hour minimum release age refused it until about 14:00Z the next day. The resolver also auto-added `minimumReleaseAgeExclude` entries, which were removed. On 2026-10-29 Lou moved the upgrade out of the foundation so Wave 1 could start on the current 1.79.0 set.
- Outcome: A standalone story into `phase-3`, after both Wave 1 sprints integrate and before Wave 2 starts, moves the Mastra packages, including `@mastra/hono` (1.7.21 → 1.7.22 or newer, which requires core ≥1.80), to the newest releases that pass the release-age policy. The `mastra` CLI is included only if Sprint 004 Story 1a kept it. The full ordered suite passes on the combined Wave 1 code, including native turn, queue/Stop, workflow and restart qualification and `qualify:ingress`.
- Constraint: No release-age exclusions or other release-age changes; no overrides or resolutions. The orchestrator approved the transitive `zod-from-json-schema` 0.5.6 → 0.5.2 exact pin from `@mastra/schema-compat` 1.3.17; any other non-Mastra lockfile change needs a new decision. A breaking change that needs more than version-mechanical adaptation stops the story for escalation. `audit` may report only B-002/B-004; record whether either changes.
- References:
  - [Story 001](stories/story-001.md) — Scope change note; [Phase 3 sprint packaging](specs/implementation-spec-001.md#phase-3-sprint-packaging) — "Mastra upgrade after Wave 1".
  - [PR #33](https://github.com/cslou/workprint/pull/33) — the foundation PR, with the pre-upgrade baseline.

### B-002 — Clear the inherited deepmerge audit advisory
- Problem: On 2026-10-28, during Sprint 002 Story 2, `pnpm audit` began reporting GHSA-gcqx-w48m-w2h4 (low severity): `deepmerge` `mergeObject()` lets attacker-controlled source objects poison the prototype of returned objects. The locked `deepmerge@4.3.1` arrives only through Mastra build tooling: `mastra` 1.35.0 → `@mastra/deployer` 1.79.0 → `@rollup/plugin-node-resolve` 16.0.3 → `deepmerge` 4.3.1. The same lock entry is already on `main`; Phase 2 did not add or change it, and earlier audits that day, including PR #11's, reported no known vulnerabilities. The advisory lists no patched version (vulnerable `>=4.2.0 <=4.3.1`). A read-only inspection of installed code found that the resolver's only call is `deepMerge({}, defaults)` on a package-owned literal; caller options are combined by shallow spread, and the deployer passes fixed options and project paths. No request data or caller configuration was seen reaching it, and the existing generated API output and browser bundle contained no deepmerge or resolver code. That was static inspection of existing artifacts, not a fresh build or runtime trace. `mastra dev` and `mastra build` still run this tooling, so dev-only status alone is not a safety argument.
- Outcome: `pnpm audit` passes again through a durable, verified fix, preferably an upstream Mastra or Rollup release that patches or removes `deepmerge`. Failing that, before any shared or public deployment, the exposure is re-assessed against the actual build and serving path and explicitly re-decided.
- Update (2026-10-29): Sprint 004 Story 1a removes the `mastra` CLI if nothing else uses it once the backend is served through the app-owned adapter entry. Per the current lockfile, that drops the only `deepmerge` path (CLI → `@mastra/deployer` → `@rollup/plugin-node-resolve`). If Story 1a's audit confirms it, close this item.
- Constraint: The user approved deferring this on 2026-10-28 as a private/local development exception, alongside B-001. Keep reporting `pnpm audit` as NON-PASS separately from passing checks; never count it as a pass. No audit ignore, override, severity downgrade, package substitution or vendor patch without explicit approval. Revisit when an upstream fix ships, the dependency path changes, builds would process untrusted input, or before shared/public deployment. This does not authorize public exposure.
- References:
  - [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) — the advisory; no first patched version as of 2026-10-28.
  - [PR #12](https://github.com/cslou/workprint/pull/12) — first non-pass report at head `ac443a9a57aabecfe73f193c61cf9b95adf7f17a`, with the audit output and dependency path.
  - [Sprint 002, Story 2](sprints/sprint-002.md#story-2-browser-to-backend-connectivity-and-scoped-request-handling-p2-s2a) — accepted delivery record. The Safety sections of Sprint 002 and Sprint 003 record the exception.
  - `pnpm-lock.yaml` — locked `deepmerge@4.3.1` and its parent chain.
  - Installed `@rollup/plugin-node-resolve` 16.0.3, `dist/es/index.js` lines ~1063–1084 — the only `deepMerge` call, on fixed internal defaults. Line numbers apply to that installed version.
  - `scripts/tasks.mjs` — the Mastra CLI runs for `dev` and `build`; `start` runs the generated API entry directly.

### B-004 — Clear the inherited @hono/node-server audit advisory
- Problem: On 2026-10-29, during Sprint 003 Story 4, `pnpm audit` began reporting GHSA-rmxm-3fg6-px4f (moderate): `@hono/node-server` `serveStatic` decodes the request path a second time, which can bypass middleware on static paths. The locked `@hono/node-server@1.19.17` arrives only through Mastra build tooling: `mastra` 1.35.0 → `@mastra/deployer` 1.79.0 → `@hono/node-ws` 1.3.1 → `@hono/node-server`. No Phase 2 change added or changed it; this is a newly published advisory on an existing lock entry. It affects `>=1.19.10 <2.1.3`, and the only patched line is 2.1.3 and later. `@hono/node-ws` 1.3.1, the latest, declares a peer range of `^1.19.11`, so no compatible patched release exists. A read-only inspection of the generated API output (`apps/api/.mastra/output/index.mjs`) found two `serveStatic` uses. Both serve Mastra Studio assets, and both are inside `if (options?.studio)` branches; the generated entry calls `createNodeServer(..., { studio: false })`, and `apps/api/src/mastra/backend.ts` disables Swagger UI and OpenAPI docs. This is static inspection of an existing build, not a runtime trace. `mastra dev` may still serve Studio locally.
- Outcome: `pnpm audit` passes again through a durable, verified fix, preferably an upstream Mastra or Hono release that moves the chain to a patched `@hono/node-server`. Failing that, before any shared or public deployment, the exposure is re-assessed against the actual serving path and explicitly re-decided.
- Update (2026-10-29): from Sprint 004 Story 1a, `@hono/node-server` 1.19.17 becomes a direct dependency, used for `serve()` only, never `serveStatic`. It is also reachable via `@mastra/hono` → `@hono/node-ws`. Studio is not served. Record the new path when Story 1a lands; the exposure assessment is unchanged.
- Constraint: **Lou approved deferring this on 2026-10-29 as a private/local development exception, alongside B-001 and B-002** (Phase 2 review). Keep reporting `pnpm audit` as NON-PASS (B-002 plus B-004), separately from passing checks; never count it as a pass. No audit ignore, override, severity downgrade, package substitution or vendor patch without explicit approval. Revisit when an upstream fix ships, the dependency path changes, Studio would be served beyond loopback, or before shared/public deployment. This does not authorize public exposure.
- References:
  - [GHSA-rmxm-3fg6-px4f](https://github.com/advisories/GHSA-rmxm-3fg6-px4f) — the advisory; patched in `>=2.1.3`.
  - [PR #22](https://github.com/cslou/workprint/pull/22) — first non-pass report, at head `7055358e0f230e13c10c960e5dede53660f17e48`. The PR made no dependency change.
  - [Sprint 003, Story 4](sprints/sprint-003.md#story-4-direct-export-historystatus-and-download-consumers-p2-s8) — accepted delivery record.
  - `pnpm-lock.yaml` — the locked `@hono/node-server@1.19.17` and its parent chain.
  - Generated `apps/api/.mastra/output/index.mjs` — the `serveStatic` uses gated by `options.studio`, and the `studio: false` entry call. Line numbers vary by build.

### B-005 — Retire test pages as the real pages are completed
- Problem: Sprint 003 Story 5's exposure audit (PR #23) found that the default app-root Vite dev server (`apps/web/vite.config.ts`, not the dedicated `vite.test.config.ts`) serves `/test/*.html` mounts and `/test/fixtures/*`. Its `server.fs.allow` includes the whole `apps/web/` directory. The mounts render production consumers with labelled read-only prerequisites. Private fixtures under `outputs/` and auth fixtures stay denied (`apps/api/test/web-files.security.test.ts`), and a runtime check in `scripts/browser/tests/config.spec.ts` proves the production build and preview exclude every test entrypoint, module and fixture. Exposure is therefore development-only and loopback-only.
- Outcome: As each real page and flow is completed from Phase 3 onward, with real data reachable through ordinary navigation, its isolated test page (`apps/web/test/*.html` and its mount) and labelled read-only prerequisites are removed. Its browser and visual coverage moves to real-flow tests at equal or greater strength. Once no test pages remain, no dev server serves them.
- Constraint: Lou decided on 2026-10-29 (Phase 2 review) to keep the test pages until the real pages replace them; dev-only, loopback-only exposure is accepted until then. Remove a page only once its replacement coverage passes; never drop coverage to remove one. If a shared dev environment or tunnel is needed before then, first make the default dev server refuse `apps/web/test/` paths. Do not weaken the production exclusion checks.
- References:
  - [Phase 3 sprint packaging](specs/implementation-spec-001.md#phase-3-sprint-packaging) — retirements happen inside each sprint as real pages land ([Sprint 004](sprints/sprint-004.md) Story 3 retires the test-only Open conversation link; [Sprint 005](sprints/sprint-005.md)); remaining pages retire in Wave 3 Sprint 008.
  - [PR #23](https://github.com/cslou/workprint/pull/23) — Story 5 exposure section, with the observed dev disposition and recommendation.
  - `apps/web/vite.config.ts` — `server.fs.allow`.
  - `scripts/browser/tests/config.spec.ts` — default dev versus production runtime comparison.

### B-006 — Tidy Phase 2 tab assembly and visual pair helpers
- Problem: The cumulative Sprint 003 integration review (PR #26, 4/5) found three minor P2s, none of them a behaviour defect.
  - **Spacing canary:** the comparator's spacing canary in `scripts/browser/tests/visual.spec.ts` (~lines 49–53) captures its negative and restored screenshots without `settleCapture` after the DOM mutation. This pre-dates Sprint 003 and contradicts the "every capture settles" rule.
  - **Tab assembly:** `apps/web/src/materials/panel.tsx` (~line 17) assembles the peer workspace tabs and inspects storyboard data to decide tab preservation, so workspace tab lifecycle sits in the materials feature rather than the shell.
  - **Pair helpers:** `scripts/browser/{storyboard-pair,picker-pair}.ts` and the request visual helpers keep their own measure/capture/compare/evidence pipelines beside the shared `scripts/browser/capture-pair.ts`.
- Outcome: The canary settles through `settleCapture`. The shell owns tab assembly and preservation, with materials owning only Script/Assets content. Visual helpers reuse the shared capture mechanics, with feature-specific reference setup kept separate. All existing pairs and behaviour stay unchanged, with zero drift.
- Constraint: Do these when the modules are next touched, preferably at the start of Phase 3 work on those surfaces. They are not Phase 2 blockers. Keep zero tolerance and no masks or retries.
- References:
  - [Phase 3 sprint packaging](specs/implementation-spec-001.md#phase-3-sprint-packaging) — allocated to Wave 3 Sprint 008, or earlier when a sprint next touches those modules.
  - [PR #26](https://github.com/cslou/workprint/pull/26) — integration review acceptance comment, listing the three P2s.
  - `scripts/browser/capture-pair.ts`, `scripts/browser/capture.ts` — the shared capture and settlement path.

### B-003 — Give proposal inputs a display name
- Problem: The user-approved proposal card (Sprint 002 Story 4) lists each input by name and version, for example "Uses: Vale reference (version 1), Gallery reference (version 1)". No contract carries that name. A proposal input is only `{ versionId, role, order }`, and a reference version has untyped `content`. Version numbers come from the existing `version` read, and Shot/Panel numbering from the workspace storyboard; only the name is missing. To avoid guessing, the Phase 2 card fails closed: without a name for every input it shows no proposal details and does not allow approval. Names currently come only from labelled read-only test prerequisites. This has no effect in Phase 2, where real reads return not-implemented, but proposal approval cannot work for real until a name source exists.
- Outcome: Before Phase 3 question/proposal work enables real approvals, a typed display name is available for each proposal input through an existing or extended contract, and the card shows it with no guessing from `content` or `role`. The fail-closed rule stays for any input still missing a name.
- Constraint: The user decided on 2026-10-28 that this only matters from Phase 3. Do not infer names from untyped content or IDs. Contract changes follow the normal spec and review path.
- References:
  - [Phase 3 sprint packaging](specs/implementation-spec-001.md#phase-3-sprint-packaging) — allocated to [Sprint 007 Story 1](sprints/sprint-007.md#story-1-owned-questionproposal-reads-and-input-names) with P3-S7 after the reduced-delivery split.
  - [PR #14](https://github.com/cslou/workprint/pull/14) — Story 4 delivery; its description discloses the gap.
  - [Sprint 002, Story 4](sprints/sprint-002.md#story-4-conversation-unavailable-and-exact-questionproposal-controls-p2-s3) — accepted delivery record.
  - `apps/web/src/conversation/proposal.tsx` — `ProposalDisplayFacts` and the fail-closed `proposalLines` gate.
  - `packages/contracts/src/models.ts` — `proposalSchema` inputs and `versionSchema`.
  - `docs/design/design.md#shell-and-remaining-phase-2-feedback` — the approved proposal-card copy.

