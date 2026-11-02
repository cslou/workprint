# Workprint — Implementation Spec

**Planning-approved scope.** This document defines the first hosted MVP; it does not claim implemented behavior or authorize implementation, unseen designs, paid product calls, production changes or public launch. It supersedes inconsistent older hosted-MVP planning references. Existing local Pi skills remain a separate working product; their runtime policy is not silently changed by this spec. All completion criteria below are future proof obligations, not passed checks. **MVP plan (2026-11-01):** the [MVP plan in §10](#mvp-plan-2026-11-01) governs current delivery and overrides conflicting requirements elsewhere in this spec.

**Repository baseline.** Workprint is a fresh hosted-application repository, not a copy of the earlier local-skill workspace. This spec and sprint plans are tracked alongside selected product, architecture and design references. Research and original local tools/tests remain outside the public checkout. Useful source contracts and scenarios may inform new hosted work, but historical code/test counts are not its baseline or proof.

## 1. Product Overview

Workprint is a hosted, chat-first filmmaking workspace for solo creators and small-team professionals making short narrative films, reels and shorts across visual styles. It brings production expertise, AI-assisted creation and versioned work into one place, so creators can develop ideas or existing material without assembling their own collection of AI tools. The assistant prepares work, explains limitations and carries out revisions; the person directs, reviews and chooses. This spec defines the first hosted release toward that product vision.

### Key References

- [Product vision](../litepaper.md) and [architecture background](../architecture.md).
- [Design guide](../design/design.md), [MVP flow references](../design/generate-flows.html) and [design history](../design/history.md). Static examples are not implemented product behavior; Editor/Project roadmap screens are excluded.
- [Canonical production terminology](../../CONTEXT.md) and [source-contract reference notes](#source-contract-references).
- Background research on native agents, backend structure, infrastructure, storage and video-provider APIs remains private maintainer evidence, not launch-provider selection or runtime qualification.
- The six skill-owned sources and their hosted reuse boundaries are mapped in the [MVP agent tool guidance](#existing-skills-and-helper-reuse-map). `create-production` is only a legacy redirect to `produce-scene`.

### Source contract references

The original local-skill sources are not included in Workprint. They live in the maintainer's local `~/projects/animation-studio` checkout; filenames alone do not establish validation behavior. These are paths in that workspace, not installed Workprint tools or public download links:

- `.pi/skills/create-scene-script/`: `SKILL.md`, `references/scene-script-schema.md`, `scripts/validate_scene_script.py`.
- `.pi/skills/create-storyboard/`: `SKILL.md`, `references/{reference-package-schema,storyboard-schema,panel-generation-strategy}.md`, `scripts/{validate-reference-package,render-storyboard,image-file}.mjs`.
- `.pi/skills/generate-image/`: `SKILL.md`, `references/{openai-api,prompt-preparation}.md`.
- `.pi/skills/generate-video/`: `SKILL.md`, `references/minimax-video-v2.md`.
- `.pi/skills/produce-scene/`: `SKILL.md`, `references/production-record.md`.
- `.pi/skills/assemble-video/SKILL.md`; `.pi/skills/create-production/SKILL.md` is only the legacy redirect.
- `.pi/lib/{ffmpeg,ffprobe}.mjs`.

Do not import the old runtime or test suite. For the MVP, MiniMax Video V2 is the selected video provider and Meta `muse-image-1.0` replaces the OpenAI image client; qualify both with live calls in their sprints.

## 2. Goals

1. Guided creation of one video or Narrative Scene from an idea or relevant existing material, without requiring creators to manage prompts and production files themselves.
2. Visible creative control through Script, Assets, Storyboard and Videos beside the conversation, exact-version review/choice and targeted revisions.
3. Reusable, versioned work: preserve saved versions and reuse uploaded/Library assets without silently replacing earlier choices.
4. Assembly/export of full chosen clips in storyboard order as one video, without requiring an Editor visit.
5. Understandable background work: visible progress, failures and uncertain outcomes; Stop is distinct from generation cancellation, which does not guarantee remote work or charges stop.
6. Informed, explicitly approved media-generation batches. Informational cost estimates remain; application spending limits and reservations do not.
7. Reliable return to saved conversations, work and decisions, with interrupted/incomplete activity identified.
8. Available assistant token usage, background-model usage, media usage and associated costs recorded per actual attempt and correlated with account, conversation and operation. Distinguish reported/calculated/estimated/unknown information and exclude credentials/private content from logs; cross-path completeness proof and totals queries are deferred.

**MVP scope (2026-11-01):** the MVP delivers G1, G2, G3, G7 and the Stop part of G5. G4 export, G5 cancellation, G6 approval and G8 usage are deferred: B-009, B-029, B-030/B-033 and B-010. See the [MVP plan](#mvp-plan-2026-11-01).

## 3. Non-Goals (Deferred)

- Project/multi-scene composition, collaborative or simultaneous editing, client-review administration and native applications. One conversation develops one video or Narrative Scene; the broader product vision is not the first release's scope.
- An Editor, timeline/pixel editing, trimming, retiming, timeline reordering, transitions, titles, captions, grading or finishing. Storyboard planning/order edits and stream-copy assembly of compatible full clips remain in scope; conversion/normalization of incompatible clips is deferred.
- Audio-reference inputs, voice cloning, separate dialogue/music/SFX generation or mixing. Script dialogue/sound intentions and embedded original clip audio remain supported; no standalone-audio, PDF or Word uploads.
- Payments, subscriptions, invoices, credit balances, reservations, spending caps, allowances/top-ups or a public usage-analytics dashboard. Estimates inform exact human authorization; usage records do not enforce a budget or certify a provider invoice.
- Sub-agents, a custom inference loop/conversation store/skill engine, restart-resumable long reasoning, multiple simultaneously executing backends or another scheduler alongside the qualified execution owner.
- Signup/invitation-policy selection or administration. Basic authentication, owner isolation and sign-out remain required. Deployment permissions must not silently choose public signup or authorize announcements.
- **Deferred by explicit user decision for this MVP:** account deletion, conversation deletion, Artifact/version deletion with retention and scheduled cleanup, creator-selectable image/video models and conversation model preferences, the cross-path usage-completeness story with internal totals queries, export conversion/normalization of incompatible clips, and sequential/comparison playback (Play all). The release keeps server-configured media models, per-attempt usage recording inside each enabled integration, stream-copy export of compatible clips and single-clip playback. Saved work, conversations and accounts persist: no application record reaches a deleted, tombstoned or closed state, so story criteria that mention deleted/closed inputs require no implementation in this release. No hidden operator substitute or partial implementation is built for them.
- A new manual screenplay/storyboard builder or structured-document import product to bypass agent producers; production seed endpoints or simulated successful product lifecycles.
- Automatic creative approval, clip selection, provider substitution or paid replacement work. Successful generation/decoding, Library membership, viewing and assistant claims do not grant human authority.
- Automatic portability of local YAML/HTML/manifests, CLI approval flags, spend controls or relocated Selects packages into the hosted product.

## 4. Architecture

### Reference Repos

Bounded repository discovery and primary-source inspection were completed. Broad discovery encountered unavailable/timed-out services; these are useful verified source references, not an exhaustive survey. The commits below are inspected snapshots, **not selected dependency releases or executed hosted qualification**.

| Repo | Why it is relevant | Pattern to adopt | Pattern to avoid |
| --- | --- | --- | --- |
| [mastra-ai/mastra](https://github.com/mastra-ai/mastra/tree/846639e853177c7c55f7ff6e0f27c0f54bc68562) | Native TypeScript agent/workflow runtime and usage observations | Supported public observations/correlation; preserve unknown usage; account for already-recorded cumulative usage on resume rather than double-counting aggregates | Depending on inspected internal helpers as stable APIs, treating sampled tracing as a durable ledger or assuming restart implies exactly-once effects |
| [langfuse/langfuse](https://github.com/langfuse/langfuse/tree/b914c2a58139bbae930af1e3aa4019883588014f) | Usage/cost ingestion and provenance | Distinguish supplied quantities/costs from pricing enrichment, estimates and unknowns | Importing its infrastructure, treating supplied cost as verified billing, or universally summing incomplete buckets |
| [mifi/lossless-cut](https://github.com/mifi/lossless-cut/tree/be46b73a610c8b061bc1188b44a138c17120b7b3) | Explicit ordered media concatenation | Ordered manifests, explicit stream mapping, escaped inputs and argument-array process execution | Desktop path/overwrite assumptions, claiming concatenation proves normalization, or transplanting GPL code |

Primary inspected passages: [Mastra usage shapes](https://github.com/mastra-ai/mastra/blob/846639e853177c7c55f7ff6e0f27c0f54bc68562/packages/core/src/observability/usage.ts#L18-L58), [resume accounting](https://github.com/mastra-ai/mastra/blob/846639e853177c7c55f7ff6e0f27c0f54bc68562/observability/mastra/src/usage.ts#L138-L200), [Langfuse enrichment](https://github.com/langfuse/langfuse/blob/b914c2a58139bbae930af1e3aa4019883588014f/worker/src/services/IngestionService/index.ts#L1567-L1589) and [LosslessCut assembly](https://github.com/mifi/lossless-cut/blob/be46b73a610c8b061bc1188b44a138c17120b7b3/src/renderer/src/hooks/useFfmpegOperations.ts#L174-L244). Mastra's inspected paths use [Apache-2.0 with exceptions](https://github.com/mastra-ai/mastra/blob/846639e853177c7c55f7ff6e0f27c0f54bc68562/LICENSE.md); Langfuse has [MIT/enterprise/third-party boundaries](https://github.com/langfuse/langfuse/blob/b914c2a58139bbae930af1e3aa4019883588014f/LICENSE); LosslessCut supplies [GPLv2 text](https://github.com/mifi/lossless-cut/blob/be46b73a610c8b061bc1188b44a138c17120b7b3/LICENSE). Study patterns without copying restricted code; qualify the selected FFmpeg build's licensing separately.

### Stack

- **Frontend:** React 19, Vite and React Aria, deployed as static assets on Cloudflare.
- **Backend:** TypeScript/Node in Docker, one Railway backend. One app-owned entry serves Mastra through the official `@mastra/hono` adapter on a single HTTP listener (Lou, 2026-10-29; it replaces the generated server, see B-001). Mastra supplies normal agent/tools, native Memory/conversations and provisionally preferred persistent workflows; no parallel Express/Hono server.
- **Database:** Supabase Postgres; plain SQL through `pg`, generated application types and declarative application schemas/migrations. Native Mastra storage remains native-owned.
- **Auth:** Supabase Auth, verified at backend admission and mapped into trusted native request context. Browser-supplied owner/approval claims are not authoritative.
- **Files/media:** private Cloudflare R2, S3-compatible transfer/access; Mediabunny/WebCodecs playback; bounded FFmpeg/ffprobe subprocesses for verification and stream-copy assembly.
- **Observability:** official Sentry SDKs and bounded redacted diagnostics. Durable usage/cost provenance remains application-owned.
- **Workspace:** pnpm workspaces with pinned Node/pnpm/dependency cohort and lockfile; strict TypeScript and dependency-cruiser boundaries. No mandatory Turborepo, ORM, command bus or generic DI framework.

Exact compatible versions, supported models/media profiles and numerical limits are recorded during the owning qualification work before dependent paths are enabled. Existing local-tool versions and inspected library source are not those selections.

### System Diagram

```text
Creator
  |
  v
Cloudflare: web ----> api-client ----> Railway: one native Mastra server
       |                                    |
       +----> player                        +-- authenticated HTTP adapters
                  ^                         +-- normal Agent / native tools
                  |                         +-- independent native workflows
         authorized sources                          |
                                                     v
                                               application
                                                     |
                                  owning domain public functions
                                      |          |          |
                                Postgres       storage    provider adapters
                             app/native data     |          |
                                             private R2   selected AI services

Supabase Auth -> verified admission/context; Sentry <- redacted diagnostics
Browser transfer/playback -> scoped R2 URLs obtained through api-client
```

The runtime, not Postgres or a continuing assistant turn, executes work. Postgres preserves application/native state; provider work may continue while this backend is down. Independent workflow steps perform bounded API waits, acquisition and processing without repeatedly asking an LLM what to do. No application transaction/connection is held across provider calls, downloads, FFmpeg, native starts/writes or remote waits.

### Module Overview

Backend modules are folders within the API deployable, not separate services/packages. Each domain owns its SQL and exposes narrow functions; domains do not import/call peer domains. `application` coordinates their public interfaces and transactions. Configuration/mechanical dependencies point inward; they do not import product features.

| Module | Owns and exposes | Dependencies / consumers | Flows and main delivery owners |
| --- | --- | --- | --- |
| `web` | Screens, feature UI/state, human controls and presentational composition | Calls `api-client`; supplies authorized sources to `player`; may use browser-safe `contracts`. No backend/private cross-feature imports | 8.1–8.7; Phase 2 wiring, Phase 3 functional controls, MVP Sprints 006–013 agent-driven views |
| `contracts` | Shared application request/response schemas, DTOs/errors and pure structural content shapes | No app/server imports, DB rows, provider payloads, secrets or authoritative approval rules. Backend and client consume it; native protocol types are reused, not cloned | Cross-boundary 8.1–8.9; P1-S4/S5, feature contracts thereafter |
| `api-client` | Framework-free authenticated application/native transport, correlation, source access and reconciliation | `contracts` and supported native/Auth client interfaces; consumed by web. It grants no business/approval authority | 8.1–8.7; Phases 1–3 and MVP streaming/refresh (Sprints 006–007) |
| `player` | Framework-free single-clip playback and events from supplied sources | Mediabunny/WebCodecs and narrow structural source/event contracts; no domain, selection, access or export authority | 8.2/8.5/8.6; P2-S6, P3-S10 (Sprint 005) |
| Backend `mastra` | Native entry/bootstrap, server/auth/HTTP adapters, independent workflow registration/adapters, readiness/drain | Composes `agent/mastra`, `application`, platform/native adapters and trusted collaborators into one runtime | All backend entry/operating paths; P1-S2 admission, Sprint 004 entry and workflows; deployment later (B-031) |
| `application` | Named shared use cases, cross-domain transaction coordination and recoverable hand-offs | Domain public functions plus narrow supplied native/conversation/workflow collaborators. No domain SQL or imports of `agent`, either Mastra subtree or assembled bootstrap | Cross-domain 8.1–8.9; foundation interfaces, Phase 3 shared behavior, MVP tool use cases |
| `agent` / `agent/mastra` | Assistant guidance/context/capabilities; native Agent/tool bindings, trusted conversation access, queue/report integration | Shared application/domain interfaces and supported native APIs. Backend composition supplies the native instance; no second loop/store | 8.1/8.3–8.5/8.7/8.9; MVP Sprints 006–013: agent loop and every tool, each in its own directory |
| `artifacts` | Immutable production work, conversation uses/approval/selection, the conversation selection revision, questions/answers, uploads and dependencies/changes; owned read/write/validation functions | `db`, structural contracts and narrow storage mechanics; composition coordinates peer-owned guards/work. No provider execution | 8.2–8.6; Sprint 005, reused by MVP tools (Sprints 007–013); assistant-made images saved through generated objects, whose PNGs alone may carry Meta’s XMP AI label (Sprint 008); assistant-made clips saved through generated objects as a draft clip use (`clipUseSchema`, listed as `workspace.generatedVideos`, not a binding the browser can set), the job marked succeeded in the clip's transaction. Their format allowance is `artifacts/uploads/media-allowance.ts`: H.264 Constrained Baseline, Main or High, with no aspect-ratio tag read as square pixels, portrait or landscape within 1920×1080, still fully decoded, measured and given a poster; uploads stay as strict as before (Sprint 009) |
| `generation` | Exact proposals, approved batches, requests, provider adapters/receipts/tasks, guarded submission/result transitions and batch reporting state | `db`, `model-catalog`, storage mechanics; composition supplies artifact/usage/native collaborators | 8.3/8.4/8.7; MVP image generation (Sprint 008, `generation/meta-image.ts`) and video (Sprint 009: `generation/minimax-video.ts`, with each MiniMax task saved as a job in `generation.requests`, purpose `video`); proposals and cancellation later (B-029, B-030) |
| `exports` | Captured exact ordered sources, compatibility policy, export records/status/currentness, workflow correlation and finalization; output itself is an `artifacts` version | `db`, storage/media mechanics; composition coordinates artifact/native interfaces | 8.6/8.7; deferred (B-009) |
| `usage` | Trusted per-attempt quantities/cost provenance | `db`; receives observations through integration/application boundaries, never browser-authoritative amounts | 8.9; deferred (B-010) |
| `model-catalog` | Configuration-only enabled media IDs/mappings, capabilities/limits, pricing references and the server-configured defaults; safe lookup/projection | No owned tables, credentials, provider execution or creator-facing routes. Shared configuration dependency of proposal disclosure and generation | 8.4; MVP model settings for later media work (Sprint 009) |
| `storage` | Private object transfer/signing and bounded mechanical media inspection/posters/processing | R2/S3 and controlled FFmpeg/ffprobe process adapters; no domain policy or upward imports | 8.2–8.7; Sprint 005, then generated media: images under `published/<id>/<id>` recorded in `artifacts.generated_objects` (Sprint 008), video (Sprint 009: decoding, measuring and the poster for assistant-made clips; their format policy is in `artifacts`) and joining (Sprint 010, B-020) |
| `db` | Connections, transaction primitives and application types | Postgres/`pg`; no scheduler or domain-query dumping ground. Owning modules retain their SQL | All persistence; Phase 1 foundation and owner-scoped feature tests |

Bootstrap supplies narrow collaborators so that `application` never imports `agent`. A public TypeScript function is not automatically an HTTP endpoint or a model tool.

Enforce these boundaries through package exports, dependency-cruiser and strict type checks: no cycles, upward platform imports, private-module imports, browser/server leakage or production imports of test helpers/local skill orchestration. Tests stay near owners; backend owns native/cross-domain/recovery integration tests and root `test/` covers cross-app journeys/deployed smoke.

### Repo Structure

```text
repository-root/
├── apps/
│   ├── web/                       # Frontend screens, features and presentation
│   └── api/
│       └── src/
│           ├── agent/             # Assistant guidance, context and capabilities
│           │   ├── tools/         # One directory per tool: schema, phrase, execute over injected collaborators (framework-neutral)
│           │   └── mastra/        # Native Agent/tool/conversation integration; turns the tool registry into native tools
│           ├── application/       # Shared cross-domain use-case coordination
│           ├── mastra/            # Backend entry, HTTP and workflow adapters
│           ├── artifacts/         # Creative work, versions, approvals and reuse
│           ├── generation/        # Proposals, requests and provider execution
│           ├── exports/           # Ordered assembly, export records and results
│           ├── usage/             # Trusted usage and cost provenance
│           ├── model-catalog/     # Safe configured model capabilities/mappings/defaults
│           ├── storage/           # Private files and bounded media mechanics
│           └── db/                # Connection/transaction support and DB types
│
├── packages/
│   ├── contracts/                 # Shared browser-safe application schemas/types
│   ├── api-client/                # Framework-free API/native transport client
│   └── player/                    # Framework-free playback from supplied sources
├── supabase/                      # Supabase CLI config and application-owned schemas/migrations
├── test/                          # Cross-app journeys and release smoke checks
├── scripts/                       # Development, setup and verification commands
├── docs/                          # Architecture, specs and operating guidance
└── outputs/                       # Ignored generated work and evidence
```

Only these higher-level boundaries are fixed. Smaller components/files/subfolders remain implementation choices; no phase/sprint source folders, empty module scaffolding or generic catch-all services/repositories/utils hierarchy is required. Configuration, telemetry, build/deployment files and colocated tests still have owners.

`agent/mastra` binds the normal assistant to native Agent/tools/Memory/queue/report APIs. Sibling `apps/api/src/mastra` retains the conventional `index.ts` entry and HTTP/independent workflow adapters, composing the agent into **one Mastra instance and one execution owner**. Backend export/cleanup must not depend on an assistant turn. Mastra's [project layout](https://mastra.ai/reference/project-structure) is largely unopinionated and its [source directory is configurable](https://mastra.ai/reference/cli/mastra#common-flags); this separation is this project's choice, not a framework mandate.

Application-owned schema changes use the Supabase CLI migration workflow under `supabase/`, owned by their modules. `model-catalog` creates no table. A `deletion` owner for closure barriers and cleanup checkpoints is reserved for the deferred lifecycle features and is not created in this release. Native schemas remain excluded from application migrations. The existing `.pi/` working product, its tests and ignored outputs remain in the source repository; they are not part of the fresh application baseline. Introduce only folders with real work in the current sprint, following these module boundaries rather than scaffolding the full tree at once.

### Key Concepts & Data Flow

**Production terms.** An Artifact is identifiable work, an Artifact Version is its exact immutable review/dependency subject, an Asset is work managed for reuse, and a Deliverable is an assigned handoff—not just any generated file. A Shot is uninterrupted visual/editorial intent; several Storyboard Panels can describe it; a Frame is a temporal position in moving media. Use [CONTEXT.md](../../CONTEXT.md), not overloaded file/editor terminology.

**Authority.** Supabase/native context supplies trusted identity and conversation scope. Domain functions check owned resources and actor capability. Human use/approval/selection binds exact versions and purpose; assistant saves remain unapproved drafts and do not replace pinned human choices. Draft/Ready are derived from conversation use, not global version approval. Manual human edits save against the expected base, move the human's use approved, and start no assistant turn. Viewing, generation, decoding and technical export completion grant no creative approval.

**Surfaces.** P1-S4 resolves the closed, versioned surface catalog before consumers: owner, caller, flow, inputs/outputs, authentication/authorization, validation, errors, idempotency and implementation status. Reuse supported native contracts, marking qualification pending until the owning story; do not invent custom copies or treat every operation as an HTTP route/tool. The following logical contracts constrain that catalog, rather than leaving product behavior to discovery:

| Caller / operation | Owner and inputs | Results, errors and retry boundary |
| --- | --- | --- |
| Browser: create/list/load a conversation, send/queue text, subscribe, Stop | Native conversation integration with verified account, exact conversation/turn/message identities and bounded input/cursors; New video starts scoped work, not Project CRUD. Video identity is the native thread id; New video is client-only, and the thread is persisted by the first accepted send, not on click | Owned native identity/history/acceptance/stream observation. Reject unauthenticated/foreign scope; distinguish interrupted output and saved completion. Reconnect only observes, never resends; Stop targets the identified turn, not newer turns or independent work |
| Browser/shared reads: workspace, versions, Library and current decisions | `artifacts`/`generation` read functions through composition; exact scope/version IDs, kind filters and bounded pagination | Authoritative versions, uses, questions, statuses and scoped media metadata/access. Missing/foreign data is not replaced with a latest version; empty/loading/error remain explicit; reads grant no approval |
| Browser manual save/use/choice; agent draft save | `artifacts` through application; trusted actor/capability, exact base/content/dependencies/intended use or chosen version/Shot; stable operation identity where effects can repeat | Immutable saved version or exact human-use relationship. Stale/conflicting/invalid/foreign inputs fail without partial effects. Human manual save differs from assistant draft provenance; repeat effects reconcile the original result rather than fabricate another version |
| Browser: review/answer; agent: create a question/proposal | Owned current question/proposal revision and exact bindings; recognized human approval of the exact shown draft, or a typed message that goes to the assistant as an ordinary turn | Committed human decision, or a pending question left waiting while the assistant handles the typed request and supersedes the card with a fresh proposal. The card is read-only; no in-card edit changes a proposal. Ambiguous/model/stale/superseded claims cannot authorize. Decision/link effects and stable hand-off identity commit together; native continuation is separate and recoverable |
| Browser: request/confirm upload | `artifacts` upload record plus `storage`; account/conversation/intended use, allowed size/type and server-authorized non-overwriting key; confirmation references that upload | Scoped transfer URL then, only after byte/media verification, usable version/use. Failed/expired/mismatched/oversized uploads remain unusable; confirmation is repeat-safe and cleanup references survive uncertainty |
| Browser: playback/download | Owned exact version, current access check; `api-client` supplies sources to `player` | Scoped URLs/metadata. Expired access is reacquired or fails explicitly; viewing does not select or export. No provider URL becomes an owned candidate merely by being returned |
| Browser: cancel Generation Request | `generation` with exact request/owner; application coordinates native/provider cancellation where supported | Guard local terminal/batch effects once, return local state and honest remote/charge uncertainty. No assistant Stop, new paid submission or late-success publication; repeated cancellation cannot double-decrement |
| Agent: authorized generation admission | `generation`/application, trusted scope and exact current human-approved proposal/authority identity | Persist batch, one request per candidate and stable run IDs before start; same authority returns same batch despite another tool-call ID. Invalid/stale/unsupported authority starts no work; no public generation-submit or external-agent/MCP surface |
| Internal native workflows: generation/export | Persisted application work identity plus stable native run correlation; re-read owned records, not mutable model arguments | Bounded status/result/failure transitions and recoverable hand-offs. Application records own business outcome, native storage owns execution snapshots; repeated steps are expected and guarded |
| Internal provider adapters | Resolved exact model/prompt/settings/ordered approved inputs and bounded attempt context | Qualified sync result/receipt or genuine async task identity/status/result/cancel support; normalized typed failure and available usage/provenance. No arbitrary user endpoint, invented task API or silent fallback |
| Internal usage/report/update adapters | Trusted actual-attempt observations or saved outcome/change identity | Durable usage/outcomes before notices; bounded authoritative refetch; report acknowledgment only against a correlated saved native assistant message, not a read/signal/stream ending |

**Application contract catalog (v1).** These are the closed application contracts that P1-S4 freezes into `contracts` schemas and `api-client` methods; P1-S4 records exact field names, native transport mapping and implementation status, and may not add, widen or remove operations without reopening this section. All routes sit under `/v1`, require the verified Supabase session, carry JSON bodies validated against closed schemas, and return one error envelope `{ error: { code, message, details? } }` with codes `unauthenticated`, `forbidden`, `not_found`, `invalid_input`, `stale_revision`, `superseded`, `unsupported`, `not_implemented` and `integration_failure`. Every mutation carries a client-generated `operationId`; repeating an identical operation returns the original result, and reusing an `operationId` with a different payload fails with `invalid_input`. Native conversation operations (create/list/load, send/queue, subscribe, Stop) use Mastra's supported interfaces through `api-client` and are not re-specified here.

| Operation | Request | Response and errors |
| --- | --- | --- |
| `GET /conversations/:id/workspace` | none | `{ script, assets, storyboard, videos, pendingQuestion, activeWork, selectionRevision }`: current versions/uses per tab with Draft/Ready state; ordered Shots, each with its Panels (per Panel: description, references, candidate image versions and the approved image, if any), the chosen video and, additively, the exact owned candidate video versions bound to the Shot (Sprint 005 Story 7; pending Lou's ratification); candidate requests with status and target; the single pending question or `null`; and the selection revision |
| `GET /artifacts/:id/versions`, `GET /versions/:id` | bounded `cursor`/`limit` | Version summaries or one version `{ id, artifactId, kind, revision, createdBy: 'human'\|'assistant', createdAt, content\|media, dependencies }`; `not_found` for foreign or unknown IDs |
| `GET /library` | `kind?`, `cursor`, `limit` | Owned Artifacts and read-only built-ins with latest-version summaries; no conversation-specific Draft/Ready state |
| `POST /conversations/:id/versions` | `{ operationId, artifactId?, kind: 'script'\|'reference'\|'storyboard', baseVersionId?, content, dependencies: [versionId], intendedUse? }` | `201 { version, use? }`: a new immutable version created by the human (assistant saves use the in-process tool with `createdBy: 'assistant'`), the human use moved to approved when `intendedUse` is given. `stale_revision` if `baseVersionId` is not the Artifact's latest; `invalid_input` for content failing the kind's schema |
| `POST /conversations/:id/uses` | `{ operationId, versionId, purpose: 'script'\|'reference'\|'storyboard'\|'panel_image'\|'shot_video', shotId?, panelId?, role? }` | `201 { use, selectionRevision }`: exact human use/approval, Panel-image approval or Shot-video choice. `panel_image` requires `shotId` and `panelId` and makes that version the Panel's approved image, replacing any earlier one for that Panel; `shot_video` requires `shotId` and advances the selection revision. `not_found`/`forbidden` for foreign versions; `invalid_input` for an incompatible purpose or a version whose kind does not match it |
| `PATCH /conversations/:id/storyboard` | `{ operationId, baseVersionId, shots: [{ shotId, order, intent?, panels: [{ panelId, order, description?, references: [versionId] }] }] }` | `{ version, selectionRevision, affected: [versionId] }`: new storyboard version with stable Shot/Panel identities and the list of now-stale downstream work; order changes advance the selection revision. `stale_revision` on an old base |
| `GET /questions/:id` | none | `{ id, revision, status: 'pending'\|'answered'\|'superseded', scope: { versionId?, proposalId?, useId? }, prompt, options: [{ id, label }] }`. A generation-approval question exposes exactly one option, the approval of the shown proposal; other question kinds list their concrete choices. Typed text is never an answer payload: it is sent as an ordinary conversation message and the question stays `pending` until answered or superseded |
| `POST /questions/:id/answers` | `{ operationId, questionRevision, optionId }` | `{ question, effects: [{ type, id }], continuationId }`: the recorded human decision, its committed effects (approval, use, batch authority) and the stable native continuation identity. `superseded` if the question is no longer current or `questionRevision` is stale; `invalid_input` for an unlisted option |
| `GET /proposals/:id` | none | `{ id, revision, questionId, purpose: 'reference_image'\|'panel_image'\|'shot_video', target: { role?, shotId?, panelId? }, provider, model, prompt, settings, candidateCount, inputs: [{ versionId, role, order }], disclosures, estimate: { amount?, currency?, basis: 'provider'\|'calculated'\|'estimated'\|'unknown' } }`. `reference_image` targets a reference `role`; `panel_image` targets one `shotId`/`panelId`; `shot_video` targets one `shotId`. Every candidate produced from the proposal carries this target |
| `POST /conversations/:id/uploads` | `{ operationId, kind: 'image'\|'video', filename, contentType, byteSize, intendedUse? }` | `201 { uploadId, url, expiresAt, maxBytes }`: a scoped single-use transfer URL; `unsupported` for a type/size outside the declared allowlist |
| `POST /uploads/:id/confirm` | `{ operationId }` | `{ version, use? }` after actual byte/type/size/decode verification; `invalid_input` with the measured discrepancy when verification fails; `not_found` for expired or foreign uploads. Repeat-safe. Uploaded PNGs may carry no text chunks; only assistant-made PNGs may carry Meta's one uncompressed XMP `iTXt` AI label before the image data (Sprint 008) |
| `GET /versions/:id/media` | none | `{ url, expiresAt, poster?, measured: { width, height, durationMs?, hasAudio? } }`: scoped read access reacquired on expiry; `not_found` for foreign versions |
| `GET /generation-requests/:id`, `GET /conversations/:id/generation-requests` | `status?`, `cursor`, `limit` | `{ id, batchId, proposalId, purpose, target, status, failureReason?, resultVersionId?, remote: { taskId?, status? }, usage? }` per request; `resultVersionId` is an unapproved candidate at that target until a human `panel_image`, `reference` or `shot_video` use binds it |
| `POST /generation-requests/:id/cancel` | `{ operationId }` | `{ request, remote: 'requested'\|'unsupported'\|'unknown' }`: guarded local transition plus honest remote status; `invalid_input` if already terminal |
| `POST /conversations/:id/exports` | `{ operationId, selectionRevision }` | `201 { export }` with status `queued` after server-side capture of every Shot's chosen version in order and compatibility pre-check. `stale_revision` if `selectionRevision` is not current; `invalid_input` naming the Shots without a chosen video; `unsupported` naming the incompatible clips |
| `GET /conversations/:id/exports`, `GET /exports/:id` | `cursor`, `limit` | `{ id, status, capturedSelectionRevision, current: boolean, sources: [{ shotId, versionId, order }], compatibility, failureReason?, outputVersionId? }`; download uses the output version's media access |

Internal `usage` records are written by each enabled integration; no browser-submitted amounts, totals API or dashboard exist. Agent tools call the same application functions in process with assistant provenance and never receive approval, selection, export or cancellation authority.

All browser operations enforce verified identity/ownership and closed inputs. Authentication, invalid input, stale/conflicting revision, unavailable/foreign/not-found resource, unsupported capability, explicit not-implemented and integration failure remain distinguishable as appropriate without exposing sensitive internals. P1's unfinished route order is **authenticate → closed-schema validation → ownership for implemented resources → structured not implemented**. Unfinished actions perform no mutation or provider work. Client types come from shared application schemas or supported native contracts, not independent copies. A local alert or generic API ping is not frontend wiring proof.

**Independent execution.** The normal agent prepares work, saves authorized intent, starts independent native workflows, replies and ends; it does not wait/reason throughout generation. Persist request/batch/run identities before separate native start; reconcile the save/start gap. Atomically guard eligibility and save `submitting` before the paid call. An ambiguous/unreceipted submission fails as `outcome_unknown`, never blind resubmission. Async adapters persist genuine task IDs and poll that same task with bounded waits; sync adapters retain actual bounded responses/receipts without invented polling/cancel guarantees. Acquire/verify private bytes before candidate publication. In one application transaction guard the terminal transition, at most one unapproved version per request and one batch decrement. No remote/media/native operation occurs inside that transaction. **MVP exception (B-025):** video generation waits inside the tool call. It saves the MiniMax task id before polling, marks the job interrupted after Stop, a deadline or a restart, resumes that task only when the user asks, and never resubmits; background execution comes later (B-032). The full post-MVP contract is in Git history at `eb98e49` (the removed Phase 4 "Submission and recovery contract").

**Updates and reporting.** Save outcomes before qualified short panel-change notices. Browser notice/poll/reconnect triggers authoritative workspace fetch; streamed text is not panel state or persistence acknowledgment. Manual changes remain available for the next agent turn. A durable turn-consumption checkpoint prevents loss on interrupted preparation; reading context does not acknowledge outcome reporting. Short normal-agent report turns queue behind active turns. Acknowledge only a correlated durably saved native assistant report, reconciling uncertain saves before another attempt. Repeated physical wake-ups or real additional inference calls are not claimed exactly once.

**Recovery.** Disconnect ends observation; Stop affects the observed turn; generation cancellation is a separate request operation and may not stop provider work/charges. Turn abort must not propagate into independent generation/export. Native restart may re-enter steps and interrupt normal reasoning. Native execution is accepted only after real built-server/Postgres Stop, save/start-gap, cancellation/re-entry and process-death qualification. A demonstrated essential gap returns for an approved simpler solution or the conditional pg-boss replacement; never add it beside native workflows or hide failure behind mocks/custom scheduling.

**Export.** Capture complete exact chosen clips, Shot order, settings and stable command/run identities before processing. Repeating an identical command resolves to the same export; conflicting reuse fails. Join only clips whose streams are compatible, by stream copy without re-encoding; reject incompatible combinations with a message naming the mismatch instead of converting them. Preserve full clips, geometry and embedded audio, with decoded verification and unchanged originals. Selection/order changes never retarget captured work; currentness is separate from successful completion. Invalid inputs block unfinished publication. A completed export has independent owned bytes and remains after later source changes.

### Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Runtime ownership | One native backend and qualified execution owner | Keep native conversation/tool/workflow support without parallel infrastructure or a second inference engine |
| Shared business logic | In-process domain functions coordinated by `application` | Frontend and agent use the same rules without HTTP self-calls or duplicated implementation; actor authority remains different |
| Framework placement | Agent bindings under `agent/mastra`, backend entry/adapters under sibling `mastra` | Independent HTTP/export/cleanup is not agent-owned; both compose one runtime |
| Schema boundaries | Browser-safe `contracts`; domain-owned rules/SQL; native-owned schemas untouched | Share interface shapes without leaking rows/secrets or moving approval authority into UI/types |
| Model configuration | Server-configured assistant, image and video defaults over a configuration-only catalog | Preserve exact captured generation identities; creator-selectable models/preferences are deferred; no arbitrary endpoints/fallback |
| Paid effects | Full release: exact human snapshots, durable pre-start identities, guarded submission/publication and provider-aware recovery. MVP: tools call providers on request without approval, saving task ids before polling (B-025, B-030) | Persistence alone is not exactly-once execution; uncertainty must never cause blind resubmission |
| Usage | Per actual attempt, available quantities and reported/calculated/estimated/unknown provenance | Honest traceability without budgets, invoice claims or double counting |
| MVP interaction | Four tabs, immutable exact versions, human decisions, direct full-clip export | Deliver a guided creation/review workflow without Editor/Project/audio-finishing scope |
| Phase allocation | Shared backend and frontend delivered in Phase 3 Wave 1; agent tools and media in MVP Sprints 006–013 | Build rules once, then add thin agent tools over them; no fake product or invented authoring UI |
| Release | MVP: a local build after Sprint 013, verified per sprint with Lou's QA; deployment later (B-031) | No generic QA phase or claim that a local build is a deployed release |

## 5. External Integrations

**Application model direction (2026-10-27):** use Meta's Muse model family, as selected by the user. Exact assistant/image/video IDs, supported capabilities and API contracts still require verification and qualification in their owning stories; older local-provider defaults and the hackathon draft do not supply that evidence. The user will provide the API key in the new repository's ignored `.env` after the move. Record the verified provider configuration name when integrating it; keep the secret backend-only. This direction does not authorize live calls or require live inference for Phase 1. **MVP selection (Lou, 2026-11-01):** chat `muse-spark-1.3` (swappable), images `muse-image-1.0`, video MiniMax Video Generation V2. Keys are `META_API_KEY` and `MINIMAX_API_KEY` in the root `.env`, server-only. No development budget is set; live calls confirm real response shapes.

For every enabled integration, record the selected versions/model mapping, current official contract, sanitized observed success/error/usage shapes, limits and evidence before dependent parsing/integration acceptance. Make real requests where feasible and separately authorized; missing authorization/evidence is not a pass. Controlled fixtures preserve those contracts for automation, not replace actual native/private-service qualification. No live inference or deployment has been performed to create this spec.

### Mastra and configured assistant provider

- **Purpose/docs:** native HTTP/request context, conversations/Memory, normal tool-using agent, streaming/queue/Stop and independent persistent execution; [request context](https://mastra.ai/docs/server/request-context), [model providers](https://mastra.ai/models/providers), [project structure](https://mastra.ai/reference/project-structure).
- **Auth/configuration:** verified Supabase identity enters trusted native context. Backend `DEFAULT_ASSISTANT_MODEL`, selected provider's server-only credential variables and native Postgres configuration. A candidate mentioned in research is not a selected model.
- **Interfaces used:** supported native conversation create/list/history/send/queue/subscribe/Stop, Agent/tool/results/errors, supported turn-ending and saved-message correlation, workflow start/state/wait/recovery/cancel and native store preparation. P1 pins the package set and catalogs supported interfaces without claiming conversation/workflow compatibility. Sprint 004 qualified conversations, turn transport and shared execution; Sprint 006 qualifies the live chat model and tool loop. Do not substitute an arbitrary chat route for native queue/wake behavior.
- **Failure/retry/bounds:** missing or invalid provider configuration fails explicitly before provider work; unavailable/error/interrupted states settle the client without exposing credentials. Bound retries, calls, output, context, tools and concurrency. Tool effects reconcile stable operations; an assistant retry cannot repeat completed business effects. No silent provider/model substitution. Normal reasoning need not resume after process death.
- **Usage/qualification:** observe every enabled actual native/framework/background model attempt, including memory/report/other automatic calls where used; disable optional billable paths whose activity cannot be covered. Usage recording is deferred for the MVP (B-010). Source/docs and controlled native tests are distinct from selected-provider qualification.

### Image and video providers

- **Purpose/docs:** for the MVP, agent tools call Meta [`muse-image-1.0`](https://dev.meta.ai/docs/image-generation) (synchronous) and MiniMax Video Generation V2 (asynchronous task) on request; exact human-approved proposals return after the MVP (B-030). The [MiniMax video reference](#source-contract-references) is the local starting point; confirm the real contract with live calls.
- **Auth/configuration:** server-only selected-provider credentials; safe configured `model-catalog` IDs/capabilities; `DEFAULT_IMAGE_MODEL` and `DEFAULT_VIDEO_MODEL`. No browser keys or arbitrary provider URLs.
- **Interfaces used:** actual synchronous submit/result or asynchronous submit/task-status/result, plus cancellation/result refresh only where genuinely supported. Record input modes/reference limits/order, formats/cardinality/settings, pricing basis, errors/moderation, receipts/task identities, idempotency and available usage. Never invent polling for a sync response or treat an HTTP correlation ID as a task ID.
- **Failure/retry/bounds:** save `submitting` before paid network work. Bound submissions, bodies, downloads, polling pace/deadlines and concurrency; disable automatic unsafe SDK/native/tool paid retries. Known task recovery uses that task; ambiguous submission becomes failed/`outcome_unknown`. Local failure/cancellation does not prove stopped charges. No paid replacement or automatic resubmission; preserve successful siblings.
- **Owned delivery:** acquire actual bytes into private stable request-owned staging, constrain destinations/redirects and prevent private-network access. Never forward provider auth to output hosts. Verify type/size/decoding/media contract before guarded publication; do not regenerate to repair a transfer or pretend URLs are owned artifacts.
- **Qualification:** Sprints 008 and 009 capture real response and media evidence with live calls; video Stop and restart behaviour follows B-025. Generated image findings and playable motion/audio review remain distinct from technical decoding. Enabled multimodal inspection needs its own capability/disclosure/usage proof; unsupported inspection is disclosed, not reported as a pass.

### Supabase Auth and Postgres

- **Purpose/docs:** identity/session and application/native persistent state; [Auth](https://supabase.com/docs/guides/auth), [Postgres connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).
- **Auth/configuration:** browser public URL/publishable key; backend `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, restricted `DATABASE_URL`; privileged setup-only `MIGRATION_DATABASE_URL`. Secrets never enter browser bundles, logs or model context. Use direct `pg` and the qualified native Postgres adapter, not a newly introduced generated data API.
- **MVP entry:** use Supabase's standard email/password sign-in and password reset for an existing authorized Supabase account. Account provisioning is outside the app; signup/invitation policy and administration remain deferred. Use supported SDK flows; add no custom credential store, role-management system, separate authentication service or extra auth stories.
- **Interfaces used:** supported sign-in/password-reset/session/token verification/refresh/sign-out; SQL transactions/owned queries; supported native storage initialization. Supabase owns identity; native schema mutation is not application migration work.
- **Failure/retry/bounds:** bound pool/connect/query/transaction timeouts; qualify the chosen connection/pooling mode. Token refresh/reconnect cannot replay commands. Uncertain writes reconcile stable operation identity before repetition.
- **Qualification:** P1-S2 exercises actual backend token verification and restricted route exposure; P3-S1a–S1c verifies conversation persistence, standard sign-in/reset/session behavior and resource isolation. P3-S18/S19 qualifies workflow persistence/recovery. Prove restricted serving privileges and separate schema setup; no production credentials/data in tests.

### Cloudflare R2

- **Purpose/docs:** private owned image/video/poster/export bytes; [S3 API](https://developers.cloudflare.com/r2/api/s3/api/), [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
- **Auth/configuration:** backend `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; browser receives only scoped short-lived upload/access URLs through `api-client`.
- **Interfaces used:** S3-compatible authorized upload, object metadata/byte inspection, bounded read/range/download and staging-cleanup operations. Confirm actual bytes/type/size and media contract, not extension or transfer acknowledgment alone. Stable non-overwriting keys separate staging from immutable publication.
- **Failure/retry/bounds:** expired/failed transfers stay unusable; source expiry is reacquired or explicitly fails. Bound body/transfer/storage/time resources and safe retries; retain identifiers across orphan/cleanup failure and late uploads. Qualify and disclose issued-URL lifetime.
- **Qualification:** the first real P3-S3 media slice proves actual signing, CORS, range requests, stored checks, expiry and downloads in a browser; P3-S10 verifies actual player consumers; export/generation owners add their relevant races and cleanup proof. Public fixture playback is not private transport evidence. MVP: local SeaweedFS only; real R2 returns with deployment (B-031).

### Sentry

- **Purpose/docs:** bounded operational error reporting through official browser/server SDKs; [JavaScript SDK documentation](https://docs.sentry.io/platforms/javascript/).
- **Auth/configuration:** browser `VITE_SENTRY_DSN` and backend `SENTRY_DSN`/`SENTRY_ENVIRONMENT`; configuration remains environment-specific. SDK-managed event/envelope submission is not a product endpoint or usage database.
- **Failure/retry/bounds:** telemetry is bounded/nonblocking; SDK availability or rate limiting must not determine product success, approval or usage correctness. Redact credentials, signed URLs, private creative content and sensitive user data; retain useful safe correlation. No uncontrolled retry/event backlog.
- **Qualification:** owner-level redaction/failure tests; deployment (B-031) verifies deployed error-reporting/readiness configuration with sanitized evidence. Disabled local telemetry is explicit, not swallowed product errors.

## 6. Data Model

Supabase owns identity; Mastra owns native conversations/messages/summaries and execution snapshots. Use supported interfaces and do not edit those schemas. Application records carry stable identity, trusted owner/scope, creation/update provenance and applicable revision/lifecycle fields. Domains own their tables/SQL; `application` coordinates cross-domain transactions. Exact immutable versions, not `latest` aliases, bind review and execution. Shared schemas are established before their first writes.

| Entity / owner | Required relationships, state and constraints |
| --- | --- |
| Artifact — `artifacts` | Stable identity, account and kind/origin. Native conversation origin is provenance, not ownership. Built-ins are bounded/read-only. Deletion is deferred; Artifacts persist |
| Artifact Version — `artifacts` | Artifact identity, immutable schema-versioned text/planning content or verified owned media, provenance and exact dependencies. Media includes stable object/poster references, actual type/size and relevant measured geometry/timing/streams/verification. Provider tasks stay in `generation`; a provider URL is not owned media |
| Conversation use/review — `artifacts` | Scoped exact version, purpose/role, human approval and pinned choice where relevant; preserve historical decisions and independent uses across conversations. Draft/Ready derives from this use. Manual human save/use effects differ from assistant draft writes; viewing is inert. The conversation carries one monotonic **selection revision**, advanced inside the same transaction by every saved Shot-video choice or Shot-order change and returned with workspace reads |
| Script/storyboard content — `artifacts` | Content schema version, ordered visible/audible Script, stable Shot identities/order/intent/criteria, ordered Panel identities/descriptions, exact references, each Panel's approved image and each Shot's chosen video. Multiple Panels may describe one Shot. No Project hierarchy or file-layout-derived approval |
| Reference/Panel coverage — `artifacts` | Role/view/environment/prop assignments; establishing/continuation/new-Shot/return mode, exact ordered references and dominant approved anchor where conditioning applies; Direct/Inherited/Not-visible coverage. A Panel's approved image is the exact version bound by a human `panel_image` use for that Shot/Panel; candidate images carry their target Panel from the proposal and are not a Panel's image until such a use exists. Inheritance must resolve through Panels whose approved image is non-stale to canonical requirements. Changes identify transitive dependents and affected Shot siblings for revalidation, not automatic regeneration |
| Question/answer — `artifacts` | One current pending question per conversation, exact version/proposal/use/review scope, allowed choices and human answer/effect. Logical pending/answered/superseded state; superseded controls cannot approve replacements. Complete relevant Script/storyboard review binds that complete content, not inferred individual-image approvals. Decision/effects and stable continuation identity commit together; native notification is separate |
| Dependency/change/consumption records — `artifacts` | Exact upstream versions and affected work, manual changes awaiting next-turn context and durable consumption correlation. Reads do not discard unhandled changes or acknowledge a report. Preserve unrelated choices and surface unknown impact |
| Upload — `artifacts` | Owner/intended conversation/use, server-authorized key/type/size, transfer/confirmation outcome and cleanup references. Unconfirmed, invalid or expired uploads are unusable. Confirmation/publication is repeat-safe and cannot overwrite an existing published version |
| Generation proposal — `generation` | Immutable exact review revision: purpose and exact target (reference role, Shot/Panel or Shot video), resolved provider/model, prompt/settings, candidate/request breakdown, ordered input versions/hashes, disclosure and estimate basis/unknowns. Proposals are read-only to the browser: any requested change arrives through chat and the assistant creates a new proposal bound to a new question; no mutation of a shown or approved snapshot |
| Generation batch — `generation` | Exact persisted human authority, requests, remaining-terminal accounting, saved outcomes and logical report correlation/acknowledgment. One batch per authorized execution, even across repeated tool-call IDs. Successful siblings survive partial failure; no approval for imaginary future references |
| Generation Request — `generation` | One candidate per request at the proposal's target; scoped batch/exact snapshot, stable native run and attempt identities, actual receipt or async task, staging/result/failure/cancellation provenance. Guard one terminal effect, at most one unapproved result version and one batch decrement. Native snapshots remain native-owned |
| Export — `exports` | Owner/conversation, stable command/payload identity, the selection revision supplied by the command and validated against the conversation's current selection revision inside the capture transaction, captured exact Shot/source version order, compatibility-check results, workflow identity, status/failure and verified output-version reference. Same command/payload resolves to the same export; conflicting reuse fails. At most one guarded completed output; currentness is distinct from success |
| Usage attempt/observations — `usage` | Trusted account/conversation/turn/request/background correlation and actual attempt identity, available requested/resolved/reported provider/model, quantities/units, cost/currency, pricing basis and provenance/completeness. Repeated observations reconcile one attempt; actual additional calls remain separate, including errors/cancellation |

### Lifecycle and integrity rules

- Generation states are `queued`, `submitting`, `running`, `succeeded`, `failed`, `cancelled`; failure reasons include `moderation`, `invalid_input`, `timed_out`, `outcome_unknown`, `provider_error`. Async `running` uses an actual saved task identity; sync completion does not require an invented remote task. Lost submission evidence does not authorize replay.
- Export states are `queued`, `processing`, `succeeded`, `failed`, `cancelled`. Final publication checks input validity at a defined serialization boundary; earlier validation alone is insufficient. Choice/order changes advance the selection revision and do not retarget captured work; an export whose captured revision is older than the current one is complete but not current.
- Enforce uniqueness for scoped stable operations/commands, authorized batch execution and request/export result publication. Guard terminal transitions and batch accounting transactionally against retries/cancellation. Reconcile uncertain writes; do not hold transactions over remote work.
- Approved proposal inputs and generated-result provenance remain exact. Ordinary upstream edits/choices expose affected/stale work rather than silently retargeting requests. Cancelled work cannot publish late success; preserve successful unrelated candidates and completed exports.
- Usage provenance distinguishes **provider-reported, calculated, estimated and unknown**. Unknown is not zero. Do not record an aggregate and its child observations as separate attempts or treat telemetry/invoices as interchangeable. Totals/aggregation queries are deferred. No budget/reservation/balance/invoice records or sensitive content in usage/logs.
- Deletion is deferred from this release: Artifacts, versions, conversations and accounts persist, and no application record enters a deleted, tombstoned or closed state. Story criteria that mention deleted/closed inputs therefore require no implementation here; closure barriers, retention and cleanup return with the deferred lifecycle features.
- Invalid sources block unfinished export publication. Completed exports retain independent owned bytes and access regardless of later source changes.

## 7. Environment Setup

### Required Env Vars

These are names and safe defaults, never credential values. Provider-specific credential names are recorded when integrations are selected; they remain backend-only.

```dotenv
# Browser
VITE_API_BASE_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SENTRY_DSN=

# Backend
PORT=
WEB_ORIGIN=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
DATABASE_URL=
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
DEFAULT_ASSISTANT_MODEL=
DEFAULT_IMAGE_MODEL=
DEFAULT_VIDEO_MODEL=
SENTRY_DSN=
SENTRY_ENVIRONMENT=

# Privileged setup only; never the serving connection
MIGRATION_DATABASE_URL=
```

Automated tests supply controlled providers through the test harness, using actual native/application paths and isolated real Postgres. Test providers and qualification controls are not imported or exposed by production; no alternate product state machine or production seed endpoint is added.

Validate required provider configuration before calls and report missing credentials clearly. Builds, imports and startup do not initiate inference or paid work merely because credentials exist. Qualified startup recovery may reconcile previously authorized work; paid generation still requires exact human approval.

### Local Dev

Supabase is one Auth/Postgres integration; endpoints and credentials select the environment. Use environment-neutral Supabase module/helper names, not separate local/production integrations or folders. The conventional `supabase/` directory holds CLI configuration and application migrations, not an alternate runtime. Development provisioning may use the Workprint-only CLI/Docker stack authorized on 2026-10-27, with loopback-only unused ports, separate setup/serving roles and ignored private configuration. Two synthetic development accounts may be provisioned through supported setup outside the product. This does not authorize hosted/production changes or changes to other projects' stacks. Tests exercise the same integration with actual Supabase verification and isolated real Postgres where those boundaries are implemented; no identity bypass or fake conversation store. Private R2 and live AI remain separately authorized later prerequisites. Use synthetic/licensed media, never customer data or ignored private demo assets.

P1-S1 supplies pinned Node/pnpm, a deterministic lockfile, credential-free examples and pre-admission environment validation. FFmpeg/ffprobe is required for media work; Docker supports isolated database tests; Supabase tooling supports owned schema development. Target commands from the repository root are:

```sh
pnpm install --frozen-lockfile
pnpm db:prepare
pnpm dev
pnpm check
pnpm test
pnpm build
```

These root commands are supplied by the accepted Sprint 001 Story 1 foundation; they do not establish Auth, conversation or workflow qualification. `db:prepare` uses separately authorized setup privileges and supported application/native mechanisms; it must not normalize manual native-schema changes or make serving credentials privileged. Preserve the accepted initialization/privilege checks as later capabilities are added.

The fresh application repository starts with no inherited tests. Each sprint adds automated proof of its actual behavior and credible failure risks; useful checks become regression coverage for subsequent work. Final verification runs the full available application suite, including earlier stories' checks. Record the actual baseline at execution; do not count the source repository's local-skill suites as imported, removed, passing or pending application tests.

Prefer focused boundary tests for native runtime, authentication, persistence and recovery. Add small unit tests only for distinct risks more cheaply or clearly proved there; do not duplicate equivalent proof across layers. No arbitrary test-count/coverage target, documentation-heading tests, incidental source snapshots or tests of framework internals. Preserve meaningful security, protocol, configuration, architecture and public-contract checks even when static. Source-repository maintenance still follows its own README verification requirements; this amendment does not delete or weaken those tests.

### Deployment

**Not part of the MVP** (Lou, 2026-11-01; B-031). This section describes the later deployment.

Production targets are Cloudflare static frontend, **one Railway backend**, Supabase Auth/Postgres and private R2, with Sentry as configured. Deployment deploys the exact reviewed/verified build and records identity/targets, using reviewed application and supported native store preparation, restricted serving grants and separate setup credentials. No additional CI/CD platform is required.

Before action, resolve and verify B-001's incoming-request admission/body-limit gate; its private-development risk acceptance does not permit public exposure. Separately authorize resources, exposure/access, schema preparation, secrets and any paid smoke calls. Verify API origins/Auth redirects/password-reset email delivery/R2 CORS/private access, selected model mappings, exclusion of test-only providers/controls and the qualified pool/provider/media/process/readiness/shutdown limits. Signup policy and announcements are not implied.

Use bounded actual deployed browser/API smoke checks with authorized accounts and synthetic/licensed material, including private upload/playback/download and saved-work-to-export. Enabled AI wiring needs separately authorized exact proposals/calls and usage evidence; no production fake provider or seed endpoint. Reuse the release build's feature/regression evidence rather than recreating QA. Missing authorization or a required failed/unrun check is non-pass.

Hand over reproducible deployment/configuration and bounded startup/shutdown/redeploy/diagnosis/recovery instructions. Brief interruption is acceptable; overlapping workers/replicas and zero downtime are not assumed. Preserve saved identities/cleanup state and reconcile known work; never wipe data or blindly resubmit to repair a release. On failure, report the actual state and follow the stop/recovery procedure. A local build alone is not the final deployed deliverable.

## 8. User & Data Flows

These are intended functional product flows, not claims that the Phase 1 foundation or Phase 2 wiring completes them. All owned references use verified identity/scope and current access checks; empty/unavailable/error states are honest. For the MVP, the [MVP plan](#mvp-plan-2026-11-01) overrides 8.4, 8.6 and 8.9.

### 8.1 Start or resume work

- **Actor/trigger:** creator with an existing authorized Supabase account signs in using email/password, starts a new video, or opens a recent conversation.
- **Happy path:** show conversation and Script, Assets, Storyboard and Videos; restore saved work and pending questions. New work has an honest empty state. Sign-out clears session/account-scoped presentation; late responses cannot populate another account or conversation.
- **Data changed:** create a conversation when starting; resumption reads existing records.
- **Result:** creator understands current work and next action.
- **Failure/recovery:** use Supabase's standard password-reset flow; incorrect credentials and invalid/expired reset links give actionable feedback without creating an account. Authentication/session-refresh/loading failures preserve saved work and settle loading. Sign-in/out uses the qualified Auth interface; refreshing credentials or reconnecting never resubmits commands or paid requests.

**Chat (Sprint 006, implemented):**
- **Send:** a message of at most 32 KiB is sent as one Muse Spark turn. A New video's native thread is created by its first accepted send, without remounting the chat. Recents lists a video only once a send is accepted.
- **One turn per video:** while a turn runs, Stop replaces Send, and a second send (another tab, say) is rejected as busy with the draft kept. Nothing queues.
- **Stream:** the reply streams as safe text and tool-activity events only. Each tool shows its phrase with elapsed time, then a done summary or "didn't finish"; a tool without a phrase shows "Working…". History keeps the same lines in order with the text and fails closed on an unknown part.
- **Tools:** read-workspace reads only the run's own account and video, within 50 items, 16 KiB and 200 characters per text. update-script writes the video's script (Sprint 007, §8.3). After each finished tool and when the turn ends, the workspace tabs re-read and show saved changes without a reload.
- **Outcomes:** a turn ends completed, failed (Retry once, which resends; B-035), interrupted, or lost (this page stopped hearing it; no Retry). An unconfirmed send re-reads history before offering Check again or Send anyway, and never resends on its own.
- **Titles:** after an accepted send to an untitled video, one bounded model call names it from that message: minimal reasoning effort, 1,024 tokens, a 15 s deadline and no retry. The title is cut to 60 characters and saved alone, after the started mark. A failure leaves "Untitled video", and the next message tries once more.

### 8.2 Bring or reuse material

- **Actor/trigger:** pasted text, supported image/video upload, or Library selection.
- **Happy path:** validate input, establish intended use, continue from the relevant stage without unnecessary repeated work.
- **Data changed:** save validated uploads as Artifact Versions and link exact upload/Library versions to the conversation.
- **Result:** assistant can use material in its agreed context.
- **Failure/recovery:** reject unsupported/invalid/unauthorized input; failed upload creates no usable version. Viewing does not approve; attaching a reference does not select it as a Shot's video.
- **Saved images as inputs (Sprint 008):** uploaded and assistant-made images can be inputs to the agent's image edits; see §8.3 Images.

### 8.3 Develop script, references and storyboard

- **Actor/trigger:** creator describes intent or asks for revision.
- **Happy path:** assistant prepares saved drafts in the tabs and asks one question at a time when needed. Paid media work follows 8.4.
- **Data changed:** new Artifact Versions and saved questions bound to exact versions.
- **Result:** reviewable work and recorded human decisions.
- **Failure/recovery:** clarify material ambiguity; stale questions cannot approve replacements; unrelated replies leave pending decisions unresolved.

**Script (Sprint 007, implemented):**
- **Agent writes the script:** asked to write or change the script, the agent calls update-script with the complete script and the version it last read (`null` when the video has none). The save is validated by the same schema as manual saves. It becomes the video's next script version, created by the assistant, and the current script as a draft; it is never an approval. The tool line reads "Updating the script…", then "Saved version N".
- **No overwrite:** the base must be the version the video uses now. If the user saved or chose another version meanwhile, nothing is saved and the line says "Not saved: the script changed". A base from another script is "not found", and the refusal sends the agent to read the workspace first. Invalid content is "the script isn’t valid". A video with no script has nothing to overwrite, so its first save ignores the base (Muse Spark does not reliably send `null`). Account and video come only from the run. A built-in script in use is adapted into the account's own script.
- **Tabs update:** the workspace re-reads after each finished tool and when the turn ends, so the Script tab shows the new version without a reload. While an editor is open the re-read waits until it closes; typed text is never replaced, and Save offers the existing latest-version review.
- **MVP exception to §8.5 and SC2:** an agent rewrite replaces the current script use as a draft, even when the user had approved the previous version. Reverting goes through Version history "Use this version". Assistant saves are not yet journaled for downstream revalidation (B-036).

**Images (Sprint 008, implemented):**
- **Agent makes an image:** the agent calls generate-image with a prompt and Meta's options: 1–10 images, a size (`auto` or `WxH`), reasoning strength and Meta's image search, web search and shell tools. With input images, the call is an edit of those images. The server calls Meta `muse-image-1.0` (`generation/meta-image.ts`) as PNG; paid calls run on request with no user authorization in the MVP. The tool line reads "Making an image…" (or "Making N images…"), then "Saved Image N · Version R". It reads "Saved N images" or "Saved k of n images" for several, and "Saved 1 image" when the label can't be read.
- **Inputs:** the agent names input images by version id from read-workspace. Only the video's image assets and its panel-candidate images are allowed, at most 10; a foreign or missing id is "an input image wasn’t found" and nothing is sent to Meta.
- **Saved as drafts:** each image passes the upload byte and decode checks (allowing Meta's XMP AI label) and is saved as the account's own assistant-created image version, recorded in `artifacts.generated_objects`, with any inputs as its dependencies. It joins the video as a draft reference use, never an approval, and appears in Assets without a reload.
- **Shown in the chat:** when the user asked for the image directly, the agent sets `showInChat`; the done tool line then carries the saved version ids (at most 10), and the chat shows each image under the line through the owned media read. Clicking opens the media viewer. Saved history shows the same after reload.
- **Edits and versions (Sprint 008 QA, Lou, 2026-11-02):** when the user asks to change one existing image, the agent passes `revises` with that image's version id, which is also an input, and makes one image. The result is that image's next version (revision 2, …) in the same place in the video, a draft again, and the line reads "Saved Image N · Version 2". Edits made at once become successive versions, and none is lost. Anything else is a new image: variations (count above 1), a built-in image, an image this video doesn't use, a `revises` that isn't an input, and an image a person has approved, since an assistant draft never replaces an approval (SC2). An edit is not yet journaled for downstream checks (B-036). A `revises` the user didn't mean moves the original into the image's history rather than leaving two images, and nothing is lost. Choosing between variations comes with the looks picker (Sprint 013). The Assets viewer shows an image's version history, and "Use this version" is the existing human use.
- **Names and loading:** chat, Assets and read-workspace all name an image "Image N · Version R", counting images in the video's Assets order. Images load near view, and one copy per version is shared in the page session (B-038 previews, B-039 caching across reloads).
- **Failure/recovery:** a refusal, an invalid request, Meta being unavailable or an image that fails checks or storage each has its own line and a message the agent follows. A server that can't save images refuses before any call to Meta; a partial save keeps the images that passed. Stop ends our request but cannot cancel the generation or its charge at Meta (B-029). Nothing from a response that arrives after Stop is saved. Deleting generated images comes later (B-037).

**Videos (Sprint 009, implemented):**
- **Agent makes a video:** the agent calls generate-video with a motion prompt, a whole-second duration (4–15, default 6) and a ratio (default 16:9), optionally from the video's saved images as `firstFrame` and `lastFrame` (a last frame needs a first; with frames the ratio is MiniMax's `adaptive`). The server calls MiniMax Video V2 (`MiniMax-H3`, 768P), saves the job as `submitting` and then `running` with its task id, polls every 10 s for up to 30 minutes, downloads the clip and saves it. Paid calls run on request with no user authorization in the MVP. The line reads "Making a video…", with the elapsed time (`· 2 min`), then "Saved Video N · Version 1".
- **The turn waits:** the chat waits inside the turn while the clip is made (B-025). Turn streams are bounded by a 35-minute turn deadline instead of the 180 s route timeout. Background execution comes later (B-032).
- **Inputs:** frames name the video's images by version id from read-workspace and are checked, with the whole request, before any job is saved or anything is sent. A foreign or unused id is "an input image wasn’t found". No input is nullable, and a wrong optional value is harmless or refused with a readable message.
- **Saved as drafts:** the clip passes the decode check with MiniMax's format allowed and is saved as the account's own assistant-created video version, with its frames as dependencies. It joins the video as a draft `video` use, never an approval, and its job is marked succeeded in the same transaction. It is listed in the Videos tab's "Generated videos", above the Shot rows, named "Video N · Version R" and counted with the assets, as read-workspace and the chat name it. Linking a clip to a Shot comes with the storyboard sprint.
- **Shown in the chat:** when the user asked for the video directly, the agent sets `showInChat`; the done line then carries the clip, and the chat shows its poster under the line with a play mark. Clicking opens the single-clip viewer, which plays it and offers no use or choice. Saved history shows the same after reload.
- **Failure/recovery:** MiniMax refusing the request, the key or for payment, being busy or unavailable, failing or cancelling the task, and a clip that fails checks each have their own line and a message the agent follows. A create whose answer is lost fails the job `outcome_unknown` and is never sent again. A query error keeps polling until the deadline. A server that can't save videos refuses before any call to MiniMax. Stop, the deadline and resume are in §8.7.

### 8.4 Approve and run a generation batch

- **Actor/trigger:** assistant proposes images/videos.
- **Happy path:** show scope, inputs/provider disclosure and informational estimate; after explicit approval save authorized requests and start independent background generation.
- **Data changed:** batch approval, Generation Requests, execution identities, usage records and successful candidate versions.
- **Result:** candidates for review and a saved outcome report.
- **Failure/recovery:** materially changed requests/alternatives need fresh approval; uncertain submissions are not automatically repeated; partial successes survive. Application spending-limit enforcement has been removed from this flow by explicit user decision.
- **MVP (2026-11-01):** the agent generates on request with no proposal or approval step (B-030). Video waits inside the tool with a saved task id (B-025).

### 8.5 Review, revise and choose

- **Actor/trigger:** inspect, manually edit, request revision or choose a version.
- **Happy path:** inspect candidates individually, revise affected work and explicitly choose exact versions. Manual text/planning saves do not start an assistant turn; context reaches the next turn.
- **Data changed:** new versions, exact approval/selection relationships and changes.
- **Result:** clear drafts, approved work and chosen videos.
- **Failure/recovery:** reject stale saves, preserve prior versions/unrelated approvals and identify affected downstream work without automatic regeneration or replacement.

### 8.6 Assemble and export

- **Actor/trigger:** creator requests export.
- **Happy path:** require a chosen video for every included Shot; capture exact versions/order and the selection revision, verify stream compatibility and join the clips by stream copy into one downloadable MP4.
- **Data changed:** export source/order/compatibility/status/verified output records.
- **Result:** complete chosen clips and their existing audio, unchanged originals, no Editor visit.
- **Failure/recovery:** missing choices or invalid inputs block unfinished export; incompatible clips are rejected with a message naming the mismatch rather than converted; no silent cropping, stretching or dropped audio. Failed processing publishes no completed export. Later selection changes advance the selection revision and do not mutate it or make it appear current.
- **MVP (2026-11-01):** export is deferred (B-009). The agent's join tool (B-020) is separate and offers no download.

### 8.7 Stop, cancel and recover

- **Actor/trigger:** Stop, generation cancellation, disconnect or return after interruption.
- **Happy path:** Stop affects the identified assistant turn only; generation cancellation is separate; returning reloads/observes saved work.
- **Data changed:** interruption/cancellation outcomes and reconciliation of persisted background work.
- **Result:** ongoing/completed/cancelled/uncertain work is distinguishable.
- **Failure/recovery:** server restart may interrupt normal reasoning; recovery cannot duplicate paid submissions/results. Cancellation may not stop charges; cancelled work cannot publish late results.

**Chat Stop (Sprint 006, implemented):**
- **Exact turn:** Stop sends the exact-turn abort with the run id this page captured, once per turn. A delayed Stop for an earlier run is a no-op, another account's Stop is not found, and a running tool receives the abort signal.
- **Notices:** "Stopped." shows only when the server acknowledged the Stop and the turn ended interrupted. If the reply ended but the Stop went unacknowledged, it shows "We couldn't confirm the reply stopped." with Retry once. If this page lost the reply, or nothing ended within about 8 s, it shows the same copy with no Retry; the chat stops watching and never sends a second Stop.
- **Saved text:** partial text is saved. History shows it as plain text with no marker (B-035).
- **Not a Stop:** closing the page, switching video or signing out disconnects the observer only, and the turn finishes on the server. Copy never claims the provider stopped work or charges.

**Video jobs (Sprint 009, implemented):**
- **Stop and deadlines:** Stop, the 35-minute turn deadline and the 30-minute poll deadline end the wait and mark the job `interrupted` with its task id. The line ends "Stopped waiting for the video", in saved history too. Nothing is saved from a download that ends after Stop. A Stop before the create sends nothing and saves no job. Once a job is `submitting`, the create runs to its own timeout even after Stop (20 s, or about 42 s with its one retry after a 429), so an interrupted job always has its task id; past §8.7's 8 s the chat shows its existing "We couldn't confirm the reply stopped" notice. Stop cannot cancel the task or its charge at MiniMax (B-029).
- **Restart:** a server shutdown leaves a polling job `running`, and the next start marks it `interrupted`. A job still `submitting` at shutdown, its create's answer lost, is failed `outcome_unknown` on the next start and is never resent. Nothing polls in the background and nothing is resubmitted.
- **Resume on ask:** the agent passes `resume` with the job id only when the user asks. The job must be this account's and this video's. An expired job (MiniMax keeps tasks 7 days) fails `expired`. An interrupted job returns to `running` and polls the same task with no new create. A job still being made, already saved or failed is refused with its own line ("That video is already saved as Video N · Version 1").
- **After MiniMax succeeds:** a download or save that is unavailable leaves the job interrupted and resumable; a clip too large or refused by the check fails it `check_refused`. A frame no longer used by the video leaves it interrupted, and the agent asks the user to use that image again before resuming.
- **Job cards:** each job shows in the Videos tab's generation requests as "Video request" with its status, under the Generated videos list.

**Operator release/redeploy case (deferred, B-031):** after separate authorization, deploy the reviewed build/configuration and prepare application/native stores through supported setup mechanisms, then verify the actual deployed URLs with bounded Auth/private-media/export and separately authorized AI smoke checks. Record build/target identity, actual results and operating instructions. This changes deployed configuration/schemas through §7's controlled procedure, not product authority or signup policy. Startup/shutdown/redeploy preserves saved work and task identities with one executing backend. On failure, report the real state and stop/recover without destructive reset or blind resubmission; missing authorization/checks cannot be called a completed release.

### 8.8 Delete work/account (deferred)

Deferred by explicit user decision. This release provides no Artifact/version, conversation or account deletion: saved work, conversations and accounts persist, so saved versions and completed exports never lose their sources. The deferred lifecycle features return with their own flows, barriers, data decisions, stories and review in a later release; no deletion control, hidden operator substitute or not-implemented placeholder is built now.

### 8.9 Record and inspect usage

- **Actor/trigger:** model/provider activity and authorized operational investigation.
- **Happy path:** record available assistant/background tokens, media usage and costs with account/conversation/operation correlation.
- **Data changed:** usage entries, cost provenance and unknown markers.
- **Result:** each attempt can be traced; totals queries and dashboards are deferred.
- **Failure/recovery:** missing is unknown, not zero; same attempt is not counted twice, real repeated calls stay separate; no credentials/private content in logs. No budget/reservation/billing platform.
- **MVP (2026-11-01):** deferred (B-010).

## 9. Success Criteria

Every criterion is observable and maps to the goals; functional and relevant regression verification accompany each owning feature. Automated real-path tests are primary. Where semantic/creative judgment cannot be automated meaningfully, record reproducible human steps and concrete pass/fail concerns separately from technical success. Document/keyword checks never prove product behavior or agent obedience.

**MVP criteria (2026-11-01):** each MVP sprint's backlog pass conditions, proven by that sprint's checks and Lou's QA. SC1–SC8 and the deployed-release gate below are the full-release criteria.

- [ ] **SC1 (G1):** Browser proof of a representative idea-to-saved-script/reference/storyboard journey, plus entry through pasted text, uploads and Library reuse without forcing unnecessary stages.
- [ ] **SC2 (G2/G3):** Correct workspace versions/decisions; manual saves without new assistant turns; explicit stale-save failures; no automatic replacement of approved work (MVP exception: an agent script rewrite replaces the current use as a draft, §8.3); only human approval/selection.
- [ ] **SC3 (G3):** Exact-version reuse across conversations with independent approvals, original preservation and rejection of foreign-account references.
- [ ] **SC4 (G4):** End-to-end stream-copy export of compatible chosen clips in order, with clear rejection of incompatible clips. Decode/check picture geometry, order, duration and existing audio; block invalid inputs; preserve independent completed exports.
- [ ] **SC5 (G5/G7):** Progress, partial success, failure, timeout and uncertainty; distinct Stop/cancel behavior; guarded late publication and accurate saved outcome reports.
- [ ] **SC6 (G6):** Exact human-approved batch traceability, fresh approval for material changes, server-configured model defaults that cannot retarget approved work; no spending-cap/reservation criterion.
- [ ] **SC7 (G5/G7):** Actual built-server kill/restart/reconnect cases around dispatch, submission, finalization and report acknowledgment; no replay or duplicate results/approval effects.
- [ ] **SC8 (G8):** Expected per-attempt assistant/background/media usage with provenance/unknowns; genuine repeated calls separate; logs free of secrets/private content.
- [ ] **Deployed-release gate (hosted G1 and all enabled flows):** under separately granted production/live-call authorization, the exact reviewed MVP is implemented, verified and deployed to its intended hosting, deployment-specific smoke checks pass and the operating/recovery handoff is complete. An undeployed build, missing authorization or unrun required check is non-pass. Before public exposure, paid-call authorization (B-030) and spending limits (B-033) are resolved or explicitly re-decided. B-031 owns this gate.

Common release gates: selected native package-set qualification with actual built server/Postgres; authorized sanitized real-provider response evidence; Supabase/R2 qualification; ownership/route/cleanup safeguards; documented tested input/concurrency/timeout/shutdown bounds; desktop/narrow keyboard/focus/loading/empty/failure/interruption checks; relevant automated and application-repository regression suites. No fixed account-capacity, full accessibility certification, zero-downtime or exactly-once-provider claim is inferred.

Phase 1 and Phase 2 evidence is not proof of these product behaviours. The MVP sprints prove their own backlog items; criteria they do not cover stay open for the full release.

### Goal-to-delivery traceability

| Goal | Flows | Delivered or planned by | Status |
| --- | --- | --- | --- |
| G1 Guided creation from an idea or existing material | 8.1–8.5 | Wave 1 (uploads, Library); Sprints 006–012 (B-012, B-013, B-015, B-017–B-019) | MVP |
| G2 Visible human creative control and targeted revisions | 8.3, 8.5 | Sprint 005 (manual saves, choices); Sprints 007, 012, 013 (B-013, B-018, B-024, B-014) | MVP |
| G3 Reusable immutable work | 8.2, 8.5 | Sprint 005 (versions, Library reuse); Sprint 013 (B-016 exact asset choice) | MVP |
| G4 Full chosen clips assembled in order | 8.6 | Sprint 010 joins clips in the conversation (B-020); export with download is B-009 | Partly MVP |
| G5 Understandable independent work and distinct Stop/cancel | 8.4, 8.7 | Sprint 004 (turn control); Sprint 006 (B-021, B-022); Sprint 009 (B-025); cancellation is B-029 | Partly MVP |
| G6 Exact informed media authorization | 8.3–8.5 | B-030, B-033 | After the MVP |
| G7 Reliable return to saved work | 8.1, 8.7 | Sprint 004 (navigation, history); Sprint 006 (B-012); Sprint 009 (B-025 resume) | MVP |
| G8 Honest correlated usage and costs | 8.9 | B-010 | After the MVP |

Phases are milestones, not sprint boundaries, and approval of this plan is not implementation or live-service authorization.

## 10. Phases

Phases 1 and 2 and Phase 3 Wave 1 are delivered. On 2026-11-01 Lou replaced the remaining Phase 3 waves, the reduced-delivery amendment and Phase 4 with the [MVP plan](#mvp-plan-2026-11-01) below, which delivers the agent and media capabilities as seven small sprints. Detailed plans for undelivered stories were removed; anything still wanted is tracked in the [backlog](../backlog.md). Earlier story identifiers (P1-S*, P2-S*, P3-S*) remain only in the delivered sprint records. The removed text is in Git history at `eb98e49`.

Tools call application/domain functions in process, never application HTTP routes. Shared implementation does not grant shared human authority.

### Delivered

| Milestone | Delivered by | Outcome |
| --- | --- | --- |
| Phase 1: contracts and API foundation | [Sprint 001](../sprints/sprint-001.md) | Authenticated backend skeleton, the closed contract catalog in §4 and a typed client. Unfinished operations return structured not-implemented responses. |
| Phase 2: connected frontend and surface audit | [Sprints 002](../sprints/sprint-002.md)–[003](../sprints/sprint-003.md); `main` via PR #27 | Every application control is wired through `api-client`; unfinished operations report "Not implemented yet" without pretending to save. |
| Phase 3 Wave 1: runtime, conversations, saved work, uploads and media | [Story 001](../stories/story-001.md), [Sprint 004](../sprints/sprint-004.md) (PR #58) and [Sprint 005](../sprints/sprint-005.md) (PR #63) into `phase-3`; `phase-3` → `main` in PR #64 | App-owned Hono entry with bounded ingress; Supabase sign-in; owned conversation navigation and history; qualified native turn transport, Stop and workflow recovery; saved-work schema and manual saves; private uploads and media verification; Library reuse; storyboard edits and Shot video choice; single-clip playback. |

**Decisions from delivered work that stay in force**
- One backend and one Mastra instance, served through the app-owned `@mastra/hono` entry with pre-Mastra Auth and bounded intake (archived B-001).
- Local S3-compatible storage (SeaweedFS) is enough for the MVP. Real R2 qualification was removed on 2026-11-01 and returns with deployment (B-031).
- Mastra stays pinned at 1.79.0 until B-007.
- New video is client-only. The video id is the native thread id, created by the first accepted send (B-012).
- MVP test trim (2026-11-01): no screenshot/visual, auth-evidence or ingress qualification suites. Run targeted checks per change, plus one trimmed full run (`pnpm test`, `pnpm test:browser`) before each QA handoff.
- Audit exceptions B-004 and B-008 are private/local only and gate any public exposure.

### MVP plan (2026-11-01)

**Outcome:** in a local build, a signed-in creator chats with an agent. The agent writes the script, asks questions with text or image options, generates images, reference sheets, storyboard panels and shot videos, and joins clips. All saved work appears in Script · Assets · Storyboard · Videos beside the conversation.

**Decisions (Lou, 2026-11-01)**
- **Models:**
  - Chat uses Meta Muse Spark `muse-spark-1.3` through the Meta Model API (`https://api.meta.ai/v1`, server-only `META_API_KEY`), kept swappable.
  - Images use Meta `muse-image-1.0`.
  - Video uses MiniMax Video Generation V2 (server-only `MINIMAX_API_KEY`); Meta's API has no video generation.
- **Agent tools are MVP work:**
  - Each tool lives in its own directory under the agent module and calls application functions in process.
  - Account and video scope come from the trusted server context, never from model arguments.
  - Reference sheets and the storyboard are built as tools for now; converting them to workflows can be decided later.
- **Saves and caching:**
  - Assistant saves are drafts, never human approval or selection.
  - The system prompt and tool list stay static so Meta's automatic prefix caching holds. Current workspace state reaches the agent through a read tool (B-023).
  - Keep Workprint's saved script schema. The agent can update every field of it (B-013).
- **No paid-call controls in the MVP:** no user authorization before paid image or video calls, and no spending limits or development budget. Both come later (B-030, B-033).
- **Video waits inside the tool:** video generation waits in the tool with a saved task id and resume, following the local `generate-video` skill (B-025). The user cannot chat meanwhile; background generation comes later (B-032).
- **Not in the MVP:**
  - deployment (B-031)
  - export (B-009)
  - usage records (B-010)
  - message queueing (B-026)
  - reconnecting to a running reply (B-027)
  - restart-proof question continuation (B-028)
  - generation cancellation (B-029)
  - generation proposals (B-030)

**Supersedes:** where this plan conflicts with §2 G4/G6/G8, §4 Independent execution, §5 approval/usage rules, §7 Deployment, §8.4/8.6/8.9 or §9, this plan wins for the MVP. Those sections describe the full release that follows.

### Phase 3 sprint packaging

| Sprint | Backlog items | Lou can test at the end |
| --- | --- | --- |
| Foundation: [Story 001](../stories/story-001.md) | — | Delivered. |
| Wave 1: [Sprint 004](../sprints/sprint-004.md), Native runtime and conversations | B-001 | Delivered. |
| Wave 1: [Sprint 005](../sprints/sprint-005.md), Saved work, uploads and media | — | Delivered. |
| 006: Chat | B-012 agent loop on Muse Spark, B-021 streaming and tool activity phrases, B-022 Stop, B-023 read-workspace tool, B-034 automatic video titles | Chat with streaming replies; a real tool line ("Getting up to date on our progress…"); Stop mid-reply; titled videos in Recents; history after reload. |
| 007: Script | B-013 update-script tool, B-024 tab refresh | The agent writes the script; the Script tab updates without a reload. |
| 008: Images | B-015 Meta image generation | Generated images in the chat and Assets; a follow-up can use a saved image as input. |
| [009: Video](../sprints/sprint-009.md) | B-025 waiting with resume, B-019 MiniMax video | The agent makes a video from a prompt or saved images; it plays in the chat and in a "Generated videos" list in Videos; Stop and restart keep the job, and the agent resumes it on request. |
| 010: Join clips | B-020 join clips | Joined clips play as one video. |
| 011: Reference sheets | B-017 | Character, place and prop sheets in Assets. |
| 012: Storyboard | B-018 | Planned shots with generated panel images. |
| 013: Questions | B-014 AskUserQuestion, B-016 image options | Option questions as in `docs/design/demo-02.html`; the chosen option resumes the agent; image choices whose exact asset the agent then uses. |

**Sprint rules**
- Each sprint holds a few small backlog items, so Lou can test often. Sprint 006 takes five because B-023 gives it a real tool to show and B-034 is small (Lou, 2026-11-01). Sprints run in order, each from integrated `main`. Stories are one PR each into `sprint-NNN`. The sprint integrates into `main` on Lou's explicit merge command.
- Verification:
  - Targeted checks run per change.
  - Deterministic browser and API tests use a test-only scripted model, excluded from the production build.
  - A few live calls confirm real provider response and stream shapes before parsing is finalized.
  - One trimmed full run and a QA build precede each handoff to Lou. No screenshot suites.
- Design: follow the approved demo references (for example `docs/design/demo-02.html`). Make an inert preview only for a state with no reference.
- Video runs before reference sheets (Lou, 2026-11-02), because B-017 waits for Lou's details; video does not need reference sheets or the storyboard. Joining clips follows as its own sprint.
- Questions (B-014) and image options (B-016) moved after video on 2026-11-02 (Lou). Until they land, the agent asks in plain chat text and waits for the reply.

### Agent tool guidance

#### Preserve creative intent without copying the local runtime

- **Script:** adapt an idea or selected prose into ordered visible/audible action. Preserve dialogue and sound intentions; do not invent a multi-scene Project or fabricate chapter metadata for an idea. Existing work can be reused without forcing unnecessary rewriting.
- **References:** keep character, environment, style, prop and composition roles explicit. Library membership, viewing and model suggestion do not approve a reference.
- **Storyboard:** textual Shot Definitions, ordered Storyboard Panels and image Frames remain different things. Preserve stable Shot/Panel identities, intended state progression and neighbouring context. The agent asks for review at the skill's checkpoints rather than assuming approval: in chat text until B-014 lands (Sprint 013), then with questions.
- **Generation:** prepare a concise production brief and the exact provider prompt, settings and reference order. Technical validation produces a candidate, never creative approval, a chosen clip or a finished-film claim. No automatic provider/model substitution or paid replacement request.
- **Production:** map Shot intent to supported video conditioning (MiniMax V2: a first and optionally a last frame) and explain limitations candidly.
- Local YAML/JSON/HTML layouts, shell flags, spend-limit fields, handoff packages and local sequential orchestration are not hosted requirements. Implement guidance through the supported Mastra agent instructions and tool descriptions; a Markdown filename is not proof the guidance is loaded or followed. Authority checks belong in domain code, not only in prompts: every id a tool takes from model arguments or the browser resolves, through an account- and video-scoped domain query that the tool reaches via an application function, to an exact version owned by the trusted account and video, or returns not-found.

#### Existing skills and helper reuse map

The skills live in `~/projects/animation-studio/.pi/skills/` (see [source contract references](#source-contract-references)). They are local agent instructions and mechanical helpers, not ready-made hosted tools.

| Existing source | Hosted disposition | Sprint |
| --- | --- | --- |
| `create-scene-script` and its validator | Adapt the writing guidance and ordering/speaker rules. Keep Workprint's saved script schema; do not port the YAML format, file conventions or Python runtime. | 007 (B-013) |
| `create-storyboard`: Reference Package, storyboard schema and panel-generation strategy | Adapt reference roles, Shot/Panel planning and panel dependency rules. The standalone HTML renderer is not ported. | 011–012 (B-017, B-018) |
| `generate-image` and its prompt-preparation contract | Adapt brief, prompt and inspection guidance for Meta `muse-image-1.0`. OpenAI/MiniMax image clients are not used. | 008 (B-015) |
| `generate-video` and its MiniMax V2 provider scripts | Adapt submit → save task → poll → download → validate and same-task resume. Hosted generation records replace the local manifest. | 009 (B-025, B-019) |
| `assemble-video` and the shared FFmpeg/ffprobe adapters | Reuse the exact ordering, compatibility and decoded-verification rules for stream-copy joining, inside the existing media sandbox. | 010 (B-020) |
| `produce-scene` | Take review, continuity review and Selects assembly are after the MVP; Shot video choice already exists from Sprint 005. | — |

### After the MVP

The backlog's Later section holds the deferred work, including export, usage records, deployment, generation approval and spending limits, background generation, cancellation, queueing and the Mastra upgrade. The §9 full-release criteria remain the target for that work.

---

*Created: 2026-10-26 · MVP plan: 2026-11-01*
