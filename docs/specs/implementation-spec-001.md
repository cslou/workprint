# Workprint — Implementation Spec

**Planning-approved scope.** This document defines the first hosted MVP; it does not claim implemented behavior or authorize implementation, unseen designs, paid product calls, production changes or public launch. It supersedes inconsistent older hosted-MVP planning references. Existing local Pi skills remain a separate working product; their runtime policy is not silently changed by this spec. All completion criteria below are future proof obligations, not passed checks.

**Repository baseline.** Workprint is a fresh hosted-application repository, not a copy of the earlier local-skill workspace. This spec and sprint plans are tracked alongside selected product, architecture and design references. Research and original local tools/tests remain outside the public checkout. Useful source contracts and scenarios may inform new hosted work, but historical code/test counts are not its baseline or proof.

## 1. Product Overview

Workprint is a hosted, chat-first filmmaking workspace for solo creators and small-team professionals making short narrative films, reels and shorts across visual styles. It brings production expertise, AI-assisted creation and versioned work into one place, so creators can develop ideas or existing material without assembling their own collection of AI tools. The assistant prepares work, explains limitations and carries out revisions; the person directs, reviews and chooses. This spec defines the first hosted release toward that product vision.

### Key References

- [Product vision](../litepaper.md) and [architecture background](../architecture.md).
- [Design guide](../design/design.md), [MVP flow references](../design/generate-flows.html) and [design history](../design/history.md). Static examples are not implemented product behavior; Editor/Project roadmap screens are excluded.
- [Canonical production terminology](../../CONTEXT.md) and [source-contract reference notes](#source-contract-references).
- Background research on native agents, backend structure, infrastructure, storage and video-provider APIs remains private maintainer evidence, not launch-provider selection or runtime qualification.
- The six skill-owned sources and their hosted reuse boundaries are mapped in [Phase 4](#existing-skills-and-helper-reuse-map). `create-production` is only a legacy redirect to `produce-scene`.

### Source contract references

The original local-skill sources are not included in Workprint. Obtain authorized source material from the maintainer before dependent adaptation; filenames alone do not establish validation behavior. These are paths in the earlier source workspace, not installed Workprint tools or public download links:

- `.pi/skills/create-scene-script/`: `SKILL.md`, `references/scene-script-schema.md`, `scripts/validate_scene_script.py`.
- `.pi/skills/create-storyboard/`: `SKILL.md`, `references/{reference-package-schema,storyboard-schema,panel-generation-strategy}.md`, `scripts/{validate-reference-package,render-storyboard,image-file}.mjs`.
- `.pi/skills/generate-image/`: `SKILL.md`, `references/{openai-api,prompt-preparation}.md`.
- `.pi/skills/generate-video/`: `SKILL.md`, `references/minimax-video-v2.md`.
- `.pi/skills/produce-scene/`: `SKILL.md`, `references/production-record.md`.
- `.pi/skills/assemble-video/SKILL.md`; `.pi/skills/create-production/SKILL.md` is only the legacy redirect.
- `.pi/lib/{ffmpeg,ffprobe}.mjs`.

Do not import the old runtime or test suite. Existing OpenAI/MiniMax contracts are historical candidate evidence, not selected Muse capabilities; qualify current providers through the owning stories.

## 2. Goals

1. Guided creation of one video or Narrative Scene from an idea or relevant existing material, without requiring creators to manage prompts and production files themselves.
2. Visible creative control through Script, Assets, Storyboard and Videos beside the conversation, exact-version review/choice and targeted revisions.
3. Reusable, versioned work: preserve saved versions and reuse uploaded/Library assets without silently replacing earlier choices.
4. Assembly/export of full chosen clips in storyboard order as one video, without requiring an Editor visit.
5. Understandable background work: visible progress, failures and uncertain outcomes; Stop is distinct from generation cancellation, which does not guarantee remote work or charges stop.
6. Informed, explicitly approved media-generation batches. Informational cost estimates remain; application spending limits and reservations do not.
7. Reliable return to saved conversations, work and decisions, with interrupted/incomplete activity identified.
8. Available assistant token usage, background-model usage, media usage and associated costs recorded per actual attempt and correlated with account, conversation and operation. Distinguish reported/calculated/estimated/unknown information and exclude credentials/private content from logs; cross-path completeness proof and totals queries are deferred.

## 3. Non-Goals (Deferred)

- Project/multi-scene composition, collaborative or simultaneous editing, client-review administration and native applications. One conversation develops one video or Narrative Scene; the broader product vision is not the first release's scope.
- An Editor, timeline/pixel editing, trimming, retiming, timeline reordering, transitions, titles, captions, grading or finishing. Storyboard planning/order edits and stream-copy assembly of compatible full clips remain in scope; conversion/normalization of incompatible clips is deferred.
- Audio-reference inputs, voice cloning, separate dialogue/music/SFX generation or mixing. Script dialogue/sound intentions and embedded original clip audio remain supported; no standalone-audio, PDF or Word uploads.
- Payments, subscriptions, invoices, credit balances, reservations, spending caps, allowances/top-ups or a public usage-analytics dashboard. Estimates inform exact human authorization; usage records do not enforce a budget or certify a provider invoice.
- Sub-agents, a custom inference loop/conversation store/skill engine, restart-resumable long reasoning, multiple simultaneously executing backends or another scheduler alongside the qualified execution owner.
- Signup/invitation-policy selection or administration. Basic authentication, owner isolation and sign-out remain required. Deployment permissions must not silently choose public signup or authorize announcements.
- **Deferred by explicit user decision for this MVP:** account deletion, conversation deletion, Artifact/version deletion with retention and scheduled cleanup, creator-selectable image/video models and conversation model preferences, the cross-path usage-completeness story with internal totals queries, export conversion/normalization of incompatible clips, and sequential/comparison playback (Play all). The release keeps server-configured media models, per-attempt usage recording inside each enabled integration, stream-copy export of compatible clips and single-clip playback. Saved work, conversations and accounts persist: no application record reaches a deleted, tombstoned or closed state, so story criteria that mention deleted/closed inputs require no implementation in this release. Identifiers P3-S6, P3-S14–S16 and P4-S17 are retained as deferred, not active, stories; no hidden operator substitute or partial implementation is built for them.
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
- **Backend:** TypeScript/Node in Docker, one Railway backend. Mastra supplies the HTTP listener, normal agent/tools, native Memory/conversations and provisionally preferred persistent workflows; no parallel Express/Hono server.
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
| `web` | Screens, feature UI/state, human controls and presentational composition | Calls `api-client`; supplies authorized sources to `player`; may use browser-safe `contracts`. No backend/private cross-feature imports | 8.1–8.7; Phase 2 wiring, Phase 3 functional controls, Phase 4 actual producer integration |
| `contracts` | Shared application request/response schemas, DTOs/errors and pure structural content shapes | No app/server imports, DB rows, provider payloads, secrets or authoritative approval rules. Backend and client consume it; native protocol types are reused, not cloned | Cross-boundary 8.1–8.9; P1-S4/S5, feature contracts thereafter |
| `api-client` | Framework-free authenticated application/native transport, correlation, source access and reconciliation | `contracts` and supported native/Auth client interfaces; consumed by web. It grants no business/approval authority | 8.1–8.7; Phases 1–3 and producer refresh in Phase 4 |
| `player` | Framework-free single-clip playback and events from supplied sources | Mediabunny/WebCodecs and narrow structural source/event contracts; no domain, selection, access or export authority | 8.2/8.5/8.6; P2-S6, P3-S10, P4-S18 |
| Backend `mastra` | Native entry/bootstrap, server/auth/HTTP adapters, independent workflow registration/adapters, readiness/drain | Composes `agent/mastra`, `application`, platform/native adapters and trusted collaborators into one runtime | All backend entry/operating paths; P1-S2/S3, functional workflows and P4-S19 |
| `application` | Named shared use cases, cross-domain transaction coordination and recoverable hand-offs | Domain public functions plus narrow supplied native/conversation/workflow collaborators. No domain SQL or imports of `agent`, either Mastra subtree or assembled bootstrap | Cross-domain 8.1–8.9; foundation interfaces, Phase 3 shared behavior, Phase 4 producer integrations |
| `agent` / `agent/mastra` | Assistant guidance/context/capabilities; native Agent/tool bindings, trusted conversation access, queue/report integration | Shared application/domain interfaces and supported native APIs. Backend composition supplies the native instance; no second loop/store | 8.1/8.3–8.5/8.7/8.9; basic conversation in Phase 3, creative tools/producers in Phase 4 |
| `artifacts` | Immutable production work, conversation uses/approval/selection, the conversation selection revision, questions/answers, uploads and dependencies/changes; owned read/write/validation functions | `db`, structural contracts and narrow storage mechanics; composition coordinates peer-owned guards/work. No provider execution | 8.2–8.6; P3-S2–S5/S7, reused by P4-S2–S7/S10 |
| `generation` | Exact proposals, approved batches, requests, provider adapters/receipts/tasks, guarded submission/result transitions and batch reporting state | `db`, `model-catalog`, storage mechanics; composition supplies artifact/usage/native collaborators | 8.4/8.7/8.9; P3-S7/S8 consumers, P4-S8–S16 execution |
| `exports` | Captured exact ordered sources, compatibility policy, export records/status/currentness, workflow correlation and finalization; output itself is an `artifacts` version | `db`, storage/media mechanics; composition coordinates artifact/native interfaces | 8.6/8.7; P3-S11–S13, P4-S18/S19 integration |
| `usage` | Trusted per-attempt quantities/cost provenance | `db`; receives observations through integration/application boundaries, never browser-authoritative amounts | 8.9 and each enabled AI path; P3-S1 and each integration owner |
| `model-catalog` | Configuration-only enabled media IDs/mappings, capabilities/limits, pricing references and the server-configured defaults; safe lookup/projection | No owned tables, credentials, provider execution or creator-facing routes. Shared configuration dependency of proposal disclosure and generation | 8.4; P4-S8/S11/S13 |
| `storage` | Private object transfer/signing and bounded mechanical media inspection/posters/processing | R2/S3 and controlled FFmpeg/ffprobe process adapters; no domain policy or upward imports | 8.2/8.4–8.7; P3-S3/S10/S12–S13, P4-S10/S11/S13 |
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
│           │   └── mastra/        # Native Agent/tool/conversation integration
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
├── supabase/                      # Application-owned schemas and migrations
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

**Surfaces.** P1-S4 resolves the closed, versioned surface catalog before consumers: owner, caller, flow, inputs/outputs, authentication/authorization, validation, errors, idempotency and implementation status. Reuse qualified native interfaces; do not invent custom copies or treat every operation as an HTTP route/tool. The following logical contracts constrain that catalog, rather than leaving product behavior to discovery:

| Caller / operation | Owner and inputs | Results, errors and retry boundary |
| --- | --- | --- |
| Browser: create/list/load a conversation, send/queue text, subscribe, Stop | Native conversation integration with verified account, exact conversation/turn/message identities and bounded input/cursors; New video starts scoped work, not Project CRUD | Owned native identity/history/acceptance/stream observation. Reject unauthenticated/foreign scope; distinguish interrupted output and saved completion. Reconnect only observes, never resends; Stop targets the identified turn, not newer turns or independent work |
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
| `GET /conversations/:id/workspace` | none | `{ script, assets, storyboard, videos, pendingQuestion, activeWork, selectionRevision }`: current versions/uses per tab with Draft/Ready state; ordered Shots, each with its Panels (per Panel: description, references, candidate image versions and the approved image, if any) and chosen video; candidate requests with status and target; the single pending question or `null`; and the selection revision |
| `GET /artifacts/:id/versions`, `GET /versions/:id` | bounded `cursor`/`limit` | Version summaries or one version `{ id, artifactId, kind, revision, createdBy: 'human'\|'assistant', createdAt, content\|media, dependencies }`; `not_found` for foreign or unknown IDs |
| `GET /library` | `kind?`, `cursor`, `limit` | Owned Artifacts and read-only built-ins with latest-version summaries; no conversation-specific Draft/Ready state |
| `POST /conversations/:id/versions` | `{ operationId, artifactId?, kind: 'script'\|'reference'\|'storyboard', baseVersionId?, content, dependencies: [versionId], intendedUse? }` | `201 { version, use? }`: a new immutable version created by the human (assistant saves use the in-process tool with `createdBy: 'assistant'`), the human use moved to approved when `intendedUse` is given. `stale_revision` if `baseVersionId` is not the Artifact's latest; `invalid_input` for content failing the kind's schema |
| `POST /conversations/:id/uses` | `{ operationId, versionId, purpose: 'script'\|'reference'\|'storyboard'\|'panel_image'\|'shot_video', shotId?, panelId?, role? }` | `201 { use, selectionRevision }`: exact human use/approval, Panel-image approval or Shot-video choice. `panel_image` requires `shotId` and `panelId` and makes that version the Panel's approved image, replacing any earlier one for that Panel; `shot_video` requires `shotId` and advances the selection revision. `not_found`/`forbidden` for foreign versions; `invalid_input` for an incompatible purpose or a version whose kind does not match it |
| `PATCH /conversations/:id/storyboard` | `{ operationId, baseVersionId, shots: [{ shotId, order, intent?, panels: [{ panelId, order, description?, references: [versionId] }] }] }` | `{ version, selectionRevision, affected: [versionId] }`: new storyboard version with stable Shot/Panel identities and the list of now-stale downstream work; order changes advance the selection revision. `stale_revision` on an old base |
| `GET /questions/:id` | none | `{ id, revision, status: 'pending'\|'answered'\|'superseded', scope: { versionId?, proposalId?, useId? }, prompt, options: [{ id, label }] }`. A generation-approval question exposes exactly one option, the approval of the shown proposal; other question kinds list their concrete choices. Typed text is never an answer payload: it is sent as an ordinary conversation message and the question stays `pending` until answered or superseded |
| `POST /questions/:id/answers` | `{ operationId, questionRevision, optionId }` | `{ question, effects: [{ type, id }], continuationId }`: the recorded human decision, its committed effects (approval, use, batch authority) and the stable native continuation identity. `superseded` if the question is no longer current or `questionRevision` is stale; `invalid_input` for an unlisted option |
| `GET /proposals/:id` | none | `{ id, revision, questionId, purpose: 'reference_image'\|'panel_image'\|'shot_video', target: { role?, shotId?, panelId? }, provider, model, prompt, settings, candidateCount, inputs: [{ versionId, role, order }], disclosures, estimate: { amount?, currency?, basis: 'provider'\|'calculated'\|'estimated'\|'unknown' } }`. `reference_image` targets a reference `role`; `panel_image` targets one `shotId`/`panelId`; `shot_video` targets one `shotId`. Every candidate produced from the proposal carries this target |
| `POST /conversations/:id/uploads` | `{ operationId, kind: 'image'\|'video', filename, contentType, byteSize, intendedUse? }` | `201 { uploadId, url, expiresAt, maxBytes }`: a scoped single-use transfer URL; `unsupported` for a type/size outside the declared allowlist |
| `POST /uploads/:id/confirm` | `{ operationId }` | `{ version, use? }` after actual byte/type/size/decode verification; `invalid_input` with the measured discrepancy when verification fails; `not_found` for expired or foreign uploads. Repeat-safe |
| `GET /versions/:id/media` | none | `{ url, expiresAt, poster?, measured: { width, height, durationMs?, hasAudio? } }`: scoped read access reacquired on expiry; `not_found` for foreign versions |
| `GET /generation-requests/:id`, `GET /conversations/:id/generation-requests` | `status?`, `cursor`, `limit` | `{ id, batchId, proposalId, purpose, target, status, failureReason?, resultVersionId?, remote: { taskId?, status? }, usage? }` per request; `resultVersionId` is an unapproved candidate at that target until a human `panel_image`, `reference` or `shot_video` use binds it |
| `POST /generation-requests/:id/cancel` | `{ operationId }` | `{ request, remote: 'requested'\|'unsupported'\|'unknown' }`: guarded local transition plus honest remote status; `invalid_input` if already terminal |
| `POST /conversations/:id/exports` | `{ operationId, selectionRevision }` | `201 { export }` with status `queued` after server-side capture of every Shot's chosen version in order and compatibility pre-check. `stale_revision` if `selectionRevision` is not current; `invalid_input` naming the Shots without a chosen video; `unsupported` naming the incompatible clips |
| `GET /conversations/:id/exports`, `GET /exports/:id` | `cursor`, `limit` | `{ id, status, capturedSelectionRevision, current: boolean, sources: [{ shotId, versionId, order }], compatibility, failureReason?, outputVersionId? }`; download uses the output version's media access |

Internal `usage` records are written by each enabled integration; no browser-submitted amounts, totals API or dashboard exist. Agent tools call the same application functions in process with assistant provenance and never receive approval, selection, export or cancellation authority.

All browser operations enforce verified identity/ownership and closed inputs. Authentication, invalid input, stale/conflicting revision, unavailable/foreign/not-found resource, unsupported capability, explicit not-implemented and integration failure remain distinguishable as appropriate without exposing sensitive internals. P1's unfinished route order is **authenticate → closed-schema validation → ownership for implemented resources → structured not implemented**. Unfinished actions perform no mutation or provider work. Client types come from shared application schemas or supported native contracts, not independent copies. A local alert or generic API ping is not frontend wiring proof.

**Independent execution.** The normal agent prepares work, saves authorized intent, starts independent native workflows, replies and ends; it does not wait/reason throughout generation. Persist request/batch/run identities before separate native start; reconcile the save/start gap. Atomically guard eligibility and save `submitting` before the paid call. An ambiguous/unreceipted submission fails as `outcome_unknown`, never blind resubmission. Async adapters persist genuine task IDs and poll that same task with bounded waits; sync adapters retain actual bounded responses/receipts without invented polling/cancel guarantees. Acquire/verify private bytes before candidate publication. In one application transaction guard the terminal transition, at most one unapproved version per request and one batch decrement. No remote/media/native operation occurs inside that transaction. The full approved contract is in [Phase 4](#submission-and-recovery-contract).

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
| Paid effects | Exact human snapshots, durable pre-start identities, guarded submission/publication and provider-aware recovery | Persistence alone is not exactly-once execution; uncertainty must not create unapproved charges/results |
| Usage | Per actual attempt, available quantities and reported/calculated/estimated/unknown provenance | Honest traceability without budgets, invoice claims or double counting |
| MVP interaction | Four tabs, immutable exact versions, human decisions, direct full-clip export | Deliver a guided creation/review workflow without Editor/Project/audio-finishing scope |
| Phase allocation | Frontend/shared backend in Phase 3; actual agent integration/producers in Phase 4 | Build rules once and expose honest milestone limits; no fake product or invented authoring UI |
| Release | Feature proof with owners; combined acceptance P4-S18; real deployment P4-S19 | No generic QA phase, unfinished feature hand-off or claim that a local build is a deployed release |

## 5. External Integrations

**Application model direction (2026-10-27):** use Meta's Muse model family, as selected by the user. Exact assistant/image/video IDs, supported capabilities and API contracts still require verification and qualification in their owning stories; older local-provider defaults and the hackathon draft do not supply that evidence. The user will provide the API key in the new repository's ignored `.env` after the move. Record the verified provider configuration name when integrating it; keep the secret backend-only. This direction does not authorize live calls or require live inference for Phase 1.

For every enabled integration, record the selected versions/model mapping, current official contract, sanitized observed success/error/usage shapes, limits and evidence before dependent parsing/integration acceptance. Make real requests where feasible and separately authorized; missing authorization/evidence is not a pass. Controlled fixtures preserve those contracts for automation, not replace actual native/private-service qualification. No live inference or deployment has been performed to create this spec.

### Mastra and configured assistant provider

- **Purpose/docs:** native HTTP/request context, conversations/Memory, normal tool-using agent, streaming/queue/Stop and independent persistent execution; [request context](https://mastra.ai/docs/server/request-context), [model providers](https://mastra.ai/models/providers), [project structure](https://mastra.ai/reference/project-structure).
- **Auth/configuration:** verified Supabase identity enters trusted native context. Backend `DEFAULT_ASSISTANT_MODEL`, selected provider's server-only credential variables and native Postgres configuration. A candidate mentioned in research is not a selected model.
- **Interfaces used:** supported native conversation create/list/history/send/queue/subscribe/Stop, Agent/tool/results/errors, supported turn-ending and saved-message correlation, workflow start/state/wait/recovery/cancel and native store preparation. P1 qualifies the coherent package set before freezing dependent contracts; P4-S1 separately qualifies actual tool/guidance/report seams. Do not substitute an arbitrary chat route for native queue/wake behavior.
- **Failure/retry/bounds:** missing or invalid provider configuration fails explicitly before provider work; unavailable/error/interrupted states settle the client without exposing credentials. Bound retries, calls, output, context, tools and concurrency. Tool effects reconcile stable operations; an assistant retry cannot repeat completed business effects. No silent provider/model substitution. Normal reasoning need not resume after process death.
- **Usage/qualification:** observe every enabled actual native/framework/background model attempt, including memory/report/other automatic calls where used; disable optional billable paths whose activity cannot be covered. P3-S1 qualifies configured text chat; P4 adds tool/multimodal/report paths with actual authorized evidence. Source/docs and controlled native tests are distinct from selected-provider qualification.

### Image and video providers

- **Purpose/docs:** selected `generation` adapters execute exact approved media proposals. Select and record current official provider/model API documentation during sprint packaging before adapter implementation. Existing [OpenAI image reference](#source-contract-references) and [MiniMax video reference](#source-contract-references) are candidate/local evidence, not a launch decision or hosted qualification.
- **Auth/configuration:** server-only selected-provider credentials; safe configured `model-catalog` IDs/capabilities; `DEFAULT_IMAGE_MODEL` and `DEFAULT_VIDEO_MODEL`. No browser keys or arbitrary provider URLs.
- **Interfaces used:** actual synchronous submit/result or asynchronous submit/task-status/result, plus cancellation/result refresh only where genuinely supported. Record input modes/reference limits/order, formats/cardinality/settings, pricing basis, errors/moderation, receipts/task identities, idempotency and available usage. Never invent polling for a sync response or treat an HTTP correlation ID as a task ID.
- **Failure/retry/bounds:** save `submitting` before paid network work. Bound submissions, bodies, downloads, polling pace/deadlines and concurrency; disable automatic unsafe SDK/native/tool paid retries. Known task recovery uses that task; ambiguous submission becomes failed/`outcome_unknown`. Local failure/cancellation does not prove stopped charges. New model/provider/request or replacement candidates require fresh exact approval; preserve successful siblings.
- **Owned delivery:** acquire actual bytes into private stable request-owned staging, constrain destinations/redirects and prevent private-network access. Never forward provider auth to output hosts. Verify type/size/decoding/media contract before guarded publication; do not regenerate to repair a transfer or pretend URLs are owned artifacts.
- **Qualification:** P4-S8–S10 defines authority/publication, P4-S11/P4-S13 captures selected-provider real response/usage/media evidence, and P4-S15/S16 tests cancellation/uncertainty/recovery. Generated image findings and playable motion/audio review remain distinct from technical decoding. Enabled multimodal inspection needs its own capability/disclosure/usage proof; unsupported inspection is disclosed, not reported as a pass.

### Supabase Auth and Postgres

- **Purpose/docs:** identity/session and application/native persistent state; [Auth](https://supabase.com/docs/guides/auth), [Postgres connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).
- **Auth/configuration:** browser public URL/publishable key; backend `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, restricted `DATABASE_URL`; privileged setup-only `MIGRATION_DATABASE_URL`. Secrets never enter browser bundles, logs or model context. Use direct `pg` and the qualified native Postgres adapter, not a newly introduced generated data API.
- **MVP entry:** use Supabase's standard email/password sign-in and password reset for an existing authorized Supabase account. Account provisioning is outside the app; signup/invitation policy and administration remain deferred. Use supported SDK flows; add no custom credential store, role-management system, separate authentication service or extra auth stories.
- **Interfaces used:** supported sign-in/password-reset/session/token verification/refresh/sign-out; SQL transactions/owned queries; supported native storage initialization. Supabase owns identity; native schema mutation is not application migration work.
- **Failure/retry/bounds:** bound pool/connect/query/transaction timeouts; qualify the chosen connection/pooling mode. Token refresh/reconnect cannot replay commands. Uncertain writes reconcile stable operation identity before repetition.
- **Qualification:** P1-S2/S3 exercises actual server/Postgres/auth integration, P3-S1 verifies standard sign-in/reset/session behavior and isolation. Prove restricted serving privileges and separate schema setup; no production credentials/data in tests.

### Cloudflare R2

- **Purpose/docs:** private owned image/video/poster/export bytes; [S3 API](https://developers.cloudflare.com/r2/api/s3/api/), [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
- **Auth/configuration:** backend `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; browser receives only scoped short-lived upload/access URLs through `api-client`.
- **Interfaces used:** S3-compatible authorized upload, object metadata/byte inspection, bounded read/range/download and staging-cleanup operations. Confirm actual bytes/type/size and media contract, not extension or transfer acknowledgment alone. Stable non-overwriting keys separate staging from immutable publication.
- **Failure/retry/bounds:** expired/failed transfers stay unusable; source expiry is reacquired or explicitly fails. Bound body/transfer/storage/time resources and safe retries; retain identifiers across orphan/cleanup failure and late uploads. Qualify and disclose issued-URL lifetime.
- **Qualification:** the first real P3-S3 media slice proves actual signing, CORS, range requests, stored checks, expiry and downloads in a browser; P3-S10 verifies actual player consumers; export/generation owners add their relevant races and cleanup proof. Public fixture playback is not private transport evidence.

### Sentry

- **Purpose/docs:** bounded operational error reporting through official browser/server SDKs; [JavaScript SDK documentation](https://docs.sentry.io/platforms/javascript/).
- **Auth/configuration:** browser `VITE_SENTRY_DSN` and backend `SENTRY_DSN`/`SENTRY_ENVIRONMENT`; configuration remains environment-specific. SDK-managed event/envelope submission is not a product endpoint or usage database.
- **Failure/retry/bounds:** telemetry is bounded/nonblocking; SDK availability or rate limiting must not determine product success, approval or usage correctness. Redact credentials, signed URLs, private creative content and sensitive user data; retain useful safe correlation. No uncontrolled retry/event backlog.
- **Qualification:** owner-level redaction/failure tests; P4-S19 verifies deployed error-reporting/readiness configuration with sanitized evidence. Disabled local telemetry is explicit, not swallowed product errors.

## 6. Data Model

Supabase owns identity; Mastra owns native conversations/messages/summaries and execution snapshots. Use supported interfaces and do not edit those schemas. Application records carry stable identity, trusted owner/scope, creation/update provenance and applicable revision/lifecycle fields. Domains own their tables/SQL; `application` coordinates cross-domain transactions. Exact immutable versions, not `latest` aliases, bind review and execution. Shared schemas needed by Phase 3 consumers are established before their writes; Phase 4's skill mapping does not postpone those shared invariants.

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

Everyday development is local web/backend against dedicated development Supabase and private R2, not production resources and not a selected all-local service replacement. Tests use isolated real Postgres, controlled external responses and synthetic/licensed media; never customer data or ignored private demo assets.

P1-S1 supplies pinned Node/pnpm, a deterministic lockfile, credential-free examples and pre-admission environment validation. FFmpeg/ffprobe is required for media work; Docker supports isolated database tests; Supabase tooling supports owned schema development. Target commands from the repository root are:

```sh
pnpm install --frozen-lockfile
pnpm db:prepare
pnpm dev
pnpm check
pnpm test
pnpm build
```

These are **planned hosted-app commands**, not commands already supplied by Workprint. `db:prepare` uses separately authorized setup privileges and supported application/native mechanisms; it must not normalize manual native-schema changes or make serving credentials privileged. Validate the selected cohort's actual initialization behavior.

The fresh application repository starts with no inherited tests. Each sprint adds automated proof of its actual behavior and credible failure risks; useful checks become regression coverage for subsequent work. Final verification runs the full available application suite, including earlier stories' checks. Record the actual baseline at execution; do not count the source repository's local-skill suites as imported, removed, passing or pending application tests.

Prefer focused boundary tests for native runtime, authentication, persistence and recovery. Add small unit tests only for distinct risks more cheaply or clearly proved there; do not duplicate equivalent proof across layers. No arbitrary test-count/coverage target, documentation-heading tests, incidental source snapshots or tests of framework internals. Preserve meaningful security, protocol, configuration, architecture and public-contract checks even when static. Source-repository maintenance still follows its own README verification requirements; this amendment does not delete or weaken those tests.

### Deployment

Production targets are Cloudflare static frontend, **one Railway backend**, Supabase Auth/Postgres and private R2, with Sentry as configured. P4-S19 deploys the exact reviewed/verified build and records identity/targets, using reviewed application and supported native store preparation, restricted serving grants and separate setup credentials. No additional CI/CD platform is required.

Before action, separately authorize resources, exposure/access, schema preparation, secrets and any paid smoke calls. Verify API origins/Auth redirects/password-reset email delivery/R2 CORS/private access, selected model mappings, exclusion of test-only providers/controls and the qualified pool/provider/media/process/readiness/shutdown limits. Signup policy and announcements are not implied.

Use bounded actual deployed browser/API smoke checks with authorized accounts and synthetic/licensed material, including private upload/playback/download and saved-work-to-export. Enabled AI wiring needs separately authorized exact proposals/calls and usage evidence; no production fake provider or seed endpoint. Reuse the release build's feature/regression evidence rather than recreating QA. Missing authorization or a required failed/unrun check is non-pass.

Hand over reproducible deployment/configuration and bounded startup/shutdown/redeploy/diagnosis/recovery instructions. Brief interruption is acceptable; overlapping workers/replicas and zero downtime are not assumed. Preserve saved identities/cleanup state and reconcile known work; never wipe data or blindly resubmit to repair a release. On failure, report the actual state and follow the stop/recovery procedure. A local build alone is not the final deployed deliverable.

## 8. User & Data Flows

These are intended functional product flows, not claims that the Phase 1 foundation or Phase 2 wiring completes them. All owned references use verified identity/scope and current access checks; empty/unavailable/error states are honest. Phase 3's declared agent-producer prerequisites and Phase 4's ordinary-input acceptance remain distinct.

### 8.1 Start or resume work

- **Actor/trigger:** creator with an existing authorized Supabase account signs in using email/password, starts a new video, or opens a recent conversation.
- **Happy path:** show conversation and Script, Assets, Storyboard and Videos; restore saved work and pending questions. New work has an honest empty state. Sign-out clears session/account-scoped presentation; late responses cannot populate another account or conversation.
- **Data changed:** create a conversation when starting; resumption reads existing records.
- **Result:** creator understands current work and next action.
- **Failure/recovery:** use Supabase's standard password-reset flow; incorrect credentials and invalid/expired reset links give actionable feedback without creating an account. Authentication/session-refresh/loading failures preserve saved work and settle loading. Sign-in/out uses the qualified Auth interface; refreshing credentials or reconnecting never resubmits commands or paid requests.

### 8.2 Bring or reuse material

- **Actor/trigger:** pasted text, supported image/video upload, or Library selection.
- **Happy path:** validate input, establish intended use, continue from the relevant stage without unnecessary repeated work.
- **Data changed:** save validated uploads as Artifact Versions and link exact upload/Library versions to the conversation.
- **Result:** assistant can use material in its agreed context.
- **Failure/recovery:** reject unsupported/invalid/unauthorized input; failed upload creates no usable version. Viewing does not approve; attaching a reference does not select it as a Shot's video.

### 8.3 Develop script, references and storyboard

- **Actor/trigger:** creator describes intent or asks for revision.
- **Happy path:** assistant prepares saved drafts in the tabs and asks one question at a time when needed. Paid media work follows 8.4.
- **Data changed:** new Artifact Versions and saved questions bound to exact versions.
- **Result:** reviewable work and recorded human decisions.
- **Failure/recovery:** clarify material ambiguity; stale questions cannot approve replacements; unrelated replies leave pending decisions unresolved.

### 8.4 Approve and run a generation batch

- **Actor/trigger:** assistant proposes images/videos.
- **Happy path:** show scope, inputs/provider disclosure and informational estimate; after explicit approval save authorized requests and start independent background generation.
- **Data changed:** batch approval, Generation Requests, execution identities, usage records and successful candidate versions.
- **Result:** candidates for review and a saved outcome report.
- **Failure/recovery:** materially changed requests/alternatives need fresh approval; uncertain submissions are not automatically repeated; partial successes survive. Application spending-limit enforcement has been removed from this flow by explicit user decision.

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

### 8.7 Stop, cancel and recover

- **Actor/trigger:** Stop, generation cancellation, disconnect or return after interruption.
- **Happy path:** Stop affects the identified assistant turn only; generation cancellation is separate; returning reloads/observes saved work.
- **Data changed:** interruption/cancellation outcomes and reconciliation of persisted background work.
- **Result:** ongoing/completed/cancelled/uncertain work is distinguishable.
- **Failure/recovery:** server restart may interrupt normal reasoning; recovery cannot duplicate paid submissions/results. Cancellation may not stop charges; cancelled work cannot publish late results.

**Operator release/redeploy case (P4-S19):** after separate authorization, deploy the reviewed build/configuration and prepare application/native stores through supported setup mechanisms, then verify the actual deployed URLs with bounded Auth/private-media/export and separately authorized AI smoke checks. Record build/target identity, actual results and operating instructions. This changes deployed configuration/schemas through §7's controlled procedure, not product authority or signup policy. Startup/shutdown/redeploy preserves saved work and task identities with one executing backend. On failure, report the real state and stop/recover without destructive reset or blind resubmission; missing authorization/checks cannot be called a completed release.

### 8.8 Delete work/account (deferred)

Deferred by explicit user decision. This release provides no Artifact/version, conversation or account deletion: saved work, conversations and accounts persist, so saved versions and completed exports never lose their sources. The deferred lifecycle features return with their own flows, barriers, data decisions, stories and review in a later release; no deletion control, hidden operator substitute or not-implemented placeholder is built now.

### 8.9 Record and inspect usage

- **Actor/trigger:** model/provider activity and authorized operational investigation.
- **Happy path:** record available assistant/background tokens, media usage and costs with account/conversation/operation correlation.
- **Data changed:** usage entries, cost provenance and unknown markers.
- **Result:** each attempt can be traced; totals queries and dashboards are deferred.
- **Failure/recovery:** missing is unknown, not zero; same attempt is not counted twice, real repeated calls stay separate; no credentials/private content in logs. No budget/reservation/billing platform.

## 9. Success Criteria

Every criterion is observable and maps to the goals; functional and relevant regression verification accompany each owning feature. Automated real-path tests are primary. Where semantic/creative judgment cannot be automated meaningfully, record reproducible human steps and concrete pass/fail concerns separately from technical success. Document/keyword checks never prove product behavior or agent obedience.

- [ ] **SC1 (G1):** Browser proof of a representative idea-to-saved-script/reference/storyboard journey, plus entry through pasted text, uploads and Library reuse without forcing unnecessary stages.
- [ ] **SC2 (G2/G3):** Correct workspace versions/decisions; manual saves without new assistant turns; explicit stale-save failures; no automatic replacement of approved work; only human approval/selection.
- [ ] **SC3 (G3):** Exact-version reuse across conversations with independent approvals, original preservation and rejection of foreign-account references.
- [ ] **SC4 (G4):** End-to-end stream-copy export of compatible chosen clips in order, with clear rejection of incompatible clips. Decode/check picture geometry, order, duration and existing audio; block invalid inputs; preserve independent completed exports.
- [ ] **SC5 (G5/G7):** Progress, partial success, failure, timeout and uncertainty; distinct Stop/cancel behavior; guarded late publication and accurate saved outcome reports.
- [ ] **SC6 (G6):** Exact human-approved batch traceability, fresh approval for material changes, server-configured model defaults that cannot retarget approved work; no spending-cap/reservation criterion.
- [ ] **SC7 (G5/G7):** Actual built-server kill/restart/reconnect cases around dispatch, submission, finalization and report acknowledgment; no replay or duplicate results/approval effects.
- [ ] **SC8 (G8):** Expected per-attempt assistant/background/media usage with provenance/unknowns; genuine repeated calls separate; logs free of secrets/private content.
- [ ] **Deployed-release gate (hosted G1 and all enabled flows):** under separately granted production/live-call authorization, the exact reviewed MVP is implemented, verified and deployed to its intended hosting, deployment-specific smoke checks pass and the operating/recovery handoff is complete. An undeployed build, missing authorization or unrun required check is non-pass. P4-S19 owns this gate.

Common release gates: selected native package-set qualification with actual built server/Postgres; authorized sanitized real-provider response evidence; Supabase/R2 qualification; ownership/route/cleanup safeguards; documented tested input/concurrency/timeout/shutdown bounds; desktop/narrow keyboard/focus/loading/empty/failure/interruption checks; relevant automated and application-repository regression suites. No fixed account-capacity, full accessibility certification, zero-downtime or exactly-once-provider claim is inferred.

Phase 1's native-qualification evidence and Phase 2's wiring evidence are not proof of these complete product behaviors. Phase 2 verifies honest not-implemented feedback and no pretend mutation; it does not require fake successful lifecycles. Under the revised allocation, Phase 3 owns real stale-version/human-answer, transfer, ownership, frontend status/cancellation, workspace-update and export currentness/recovery/independence tests. Phase 4 owns initial agent question/proposal creation, real provider generation/cancellation/partial-success/late-publication behavior and complete tool-driven flows. Consumer tests may supply valid isolated persisted prerequisites without implementing the absent agent producer. P4-S18 closes remaining combined-product coverage and P4-S19 delivers actual deployment/operating handoff; neither supplies the first functional proof of export or another unfinished feature. These obligations are deferred to their functional owners, not removed or left wholesale to a final release test.

### Goal-to-delivery traceability

| Goal | Flows | Technical owners | Primary stories | Observable proof |
| --- | --- | --- | --- | --- |
| G1 Guided creation from an idea or existing material | 8.1–8.5 | `web`, `agent`, `application`, `artifacts`, `generation`, native integration | P3-S1–S4; P4-S1–S13; P4-S18 | Criterion 1: ordinary idea/paste/upload/Library journeys produce real saved, reviewed work through actual producers, without unnecessary repeated stages or seeded producer substitutes. |
| G2 Visible human creative control and targeted revisions | 8.3, 8.5 | `web`, `artifacts`, `application`, `agent` | P3-S2, S5, S7, S9; P4-S3–S7, S12–S14 | Criterion 2: exact versions, human-only decisions, stale-save rejection, preserved manual input/history and no automatic replacement; actual backend/native-to-UI effects. |
| G3 Reusable immutable work | 8.2, 8.5 | `artifacts`, `storage`, `application` | P3-S2–S4, S17; P4-S6–S7, S15 | Criteria 2–3: cross-conversation exact-version reuse with independent approvals; original preservation; foreign references rejected; no silent replacement. |
| G4 Full chosen clips assembled in order | 8.6 | `exports`, `artifacts`, `storage`, `application`, native workflows, `player` | P3-S10–S13, S17; P4-S18–S19 | Criterion 4: actual captured sources → bounded processing → decoded/downloaded output with correct order, geometry, duration and existing audio; restart safety and completed-output independence. |
| G5 Understandable independent work and distinct Stop/cancel | 8.4, 8.7 | `generation`, `agent`, `application`, native workflows, `api-client`, `web` | P1-S2–S3; P3-S8–S9; P4-S9–S10, S13–S16 | Criteria 5 and 7: actual progress/partial/failed/unknown states, Stop isolation, scoped cancellation, guarded publication and correlated saved reports, including process interruption. |
| G6 Exact informed media authorization | 8.3–8.5 | `artifacts`, `generation`, `model-catalog`, `application`, `web` | P3-S7; P4-S4, S8–S9, S11–S13, S15 | Criterion 6: exact disclosed inputs/provider/model/settings/count/estimate binding; stale or changed proposals cannot authorize new paid submissions; repeated authority resolves to the same batch; no budget gate. |
| G7 Reliable return to saved work | 8.1, 8.7 | native conversations/workflows, `agent`, `application`, domain owners, `api-client` | P1-S2–S3; P3-S1, S9, S13; P4-S2, S4, S9–S10, S14–S16 | Criterion 7 and common gates: real built-server/Postgres kill/restart/reconnect around intent/start, submission, finalization and report acknowledgment; no duplicate effects or replay. |
| G8 Honest correlated usage and costs | 8.9 and every enabled AI path | `usage`, `application`, native/provider adapters | P3-S1; P4-S11, S13–S14, S18–S19 | Criterion 8: trusted per-attempt assistant/framework/background/media observations; unknown ≠ zero; genuine additional calls stay separate; no sensitive logging. |

P4-S18 closes missing supported combinations/races, not every feature's first test. P4-S19 proves the deployed configuration and operating handoff; it does not accept unfinished functionality. Phases are milestones, not sprint boundaries, and approval of this plan is not implementation or live-service authorization.

## 10. Phases

The delivery sequence is **contracts/API foundation → connected frontend and surface audit → frontend/shared functionality → actual agent/media capabilities, complete acceptance and deployment**. Four phases contain 45 active stories (5 + 9 + 13 + 18); deferred identifiers P3-S6, P3-S14–S16 and P4-S17 are retained for traceability and are not active work. Phases are milestones, not sprint boundaries; foundations are explicitly internal increments, not usable filmmaking releases. Each story targets ≤5 logical commits including verification and may be split during concrete sprint packaging without dropping its checks.

| Actual production callers | Phase 3 | Phase 4 |
| --- | --- | --- |
| Frontend only | Implement backend functionality and frontend trigger | No agent tool is implied |
| Agent only | Do not implement the agent-only operation | Implement backend operation and agent tool/skill integration |
| Frontend and agent | Implement shared backend rules and frontend trigger | Add thin agent integration over the same rules |

Classify genuine operations, not whole modules or hypothetical consumers. Shared implementation does not grant shared human authority. Tools call application/domain functions in process, never application HTTP routes. Internal helpers accompany their owning capability without artificial public/tool surfaces. Phase 3 consumes isolated valid records where Phase 4 owns the real producer; its capability milestone is not a fresh-account-to-film claim.

Contracts and native qualification precede dependent consumers; data/authority primitives accompany the first writes that require them. Required feature recovery, service qualification and design approval precede acceptance/enabling of that feature. In particular, export capture/processing/recovery must all be ready before export is presented as working, and a generation path requires its authority, adapter, publication, cancellation and recovery dependencies. Story identifiers do not authorize exposing a partial path. Package actual sprint work in dependency order; return material missing decisions or failed essential qualification for approval rather than inventing a fallback.

There is no separate general QA phase. Functional/regression proof stays with its feature owners; P4-S18 closes remaining supported combinations and P4-S19 performs actual deployment/operating handoff. None of these planning approvals authorizes implementation, unseen designs, live-service calls or production changes.

### Phase 1 — Contracts and API Foundation

**Outcome:** a runnable backend and typed client interface that the frontend can connect to. Unfinished product operations return not-implemented responses. Authentication and native integration are genuinely exercised; controlled model/provider responses are confined to explicit tests and native-runtime qualification.

This is an **internal development milestone**, not a usable filmmaking product.

#### Scope

**Included**

- Repository/application setup and validated environment configuration.
- Basic authentication and native conversation integration.
- Early proof of native background execution.
- Browser-route, agent-tool and internal-operation contracts.
- Callable unavailable-feature responses, `api-client`, and test-only qualification fixtures.

**Not included**

- Building the full frontend.
- Implementing production features such as Artifact editing, generation or export.
- Selecting every launch media model or making paid generation calls.
- Billing or spending controls.

#### Modules

The `api` deployable scaffolds backend `mastra`, `application`, `agent` (including `agent/mastra`), `db` and domain-owned interfaces under the approved directory structure. `contracts` holds shared browser-safe schemas; `api-client` owns transport. `web` receives only its initial application scaffold. This establishes boundaries, not unfinished domain behavior.

#### Flows Delivered

Framework-level conversation creation/loading, observation and stopping are exercised with controlled model responses in the native-integration test harness. Implemented platform operations stay real; unfinished product operations have callable contracts returning not-implemented responses, **not completed functionality**. Until assistant functionality is implemented and qualified, ordinary development must not manufacture assistant replies or silently make paid calls.

#### Dependencies

This spec’s §§4–7 and separately authorized development Supabase access. Compatible package versions are pinned and evaluated within this phase.

#### Stories

##### P1-S1 — Application and development foundation

- **What:** establish the workspace, pinned dependencies, configuration and development/check commands.
- **Acceptance criteria:**
  - [ ] Web/backend scaffolds build and start reproducibly.
  - [ ] Secrets stay server-side and required provider configuration is validated. Tests supply controlled providers through their harness; production excludes test providers and qualification controls. Builds, imports and startup do not initiate inference or paid work merely because credentials exist.
  - [ ] Type, lint and module-boundary checks run alongside existing required verification.
- **Commits:** ≤5.

##### P1-S2 — Native conversation integration proof

- **What:** connect Supabase authentication and Postgres-backed Mastra conversation behavior, using controlled model responses in explicit qualification tests rather than a simulated application workflow.
- **Acceptance criteria:**
  - [ ] Exercise saved history, streaming, queued input and Stop through supported native interfaces.
  - [ ] Verify ownership isolation and distinguish interrupted output from saved completion.
  - [ ] Missing provider configuration or unavailable assistant functionality produces an explicit error before provider work. `api-client` settles loading without exposing credentials or hanging. Qualification uses harness-supplied controlled providers through supported native interfaces, not a parallel stream protocol.
  - [ ] Expose only the intended native/product routes—not unrestricted framework administration or tool execution.
- **Commits:** ≤5.

##### P1-S3 — Native background-execution proof

- **What:** exercise a small persistent workflow through the actual built server and real Postgres, using test-only fake external work—not the finished generation system.
- **Acceptance criteria:**
  - [ ] Start background work from a tool in a controlled assistant turn, return without waiting for the job, then Stop that still-active turn. The independently started workflow continues; closing browser observation also does not cancel it.
  - [ ] Kill the process after saving a test work intent and its stable run identity but before native start. After restart, narrow reconciliation starts or recovers that same work; the intent is not stranded and repeated reconciliation does not create additional runs.
  - [ ] Exercise waiting, process restart, step re-entry, explicit workflow cancellation and terminal failure. Record native statuses and the application safeguards required for repeated steps; do not infer exactly-once external execution.
  - [ ] Demonstrate bounded test-work concurrency and timeouts, with observable cancellation/failure outcomes rather than indefinite waits or silent loss.
  - [ ] Retain native workflows only if these cases pass without a parallel runner or custom scheduler. A demonstrated essential gap blocks the dependent contracts until the documented pg-boss alternative or a simpler supported solution is assessed; do not hide it behind mocks.
- **Commits:** ≤5.

This proves framework behavior; complete generation/export safety tests still belong to their feature implementations.

##### P1-S4 — Surface catalog and contracts

- **What:** define browser routes, agent tools and internal workflow/domain operations.
- **Acceptance criteria:**
  - [ ] Each surface identifies its owner, intended consumer, flow, inputs, outputs, authorization, errors and implementation status.
  - [ ] Define the structured not-implemented response and client handling, normalizing supported native error paths where needed. An unfinished action must not report a save, approval, generated result or export as successful.
  - [ ] For unfinished routes: authenticate → validate the closed input schema → check ownership for implemented resources → return not implemented. Authentication, validation and not-found/ownership failures remain distinct. `api-client` types derive from the same application schemas or supported native contracts, not independent copies.
  - [ ] Closed schemas distinguish human approval actions from agent capabilities.
  - [ ] Native contracts are reused where suitable; internal operations do not gain unnecessary HTTP endpoints.
- **Commits:** ≤5.

##### P1-S5 — Callable skeleton and typed client

- **What:** implement route scaffolding and `api-client`, leaving unfinished operations explicitly unavailable instead of building stateful domain simulations.
- **Acceptance criteria:**
  - [ ] Scripted client calls exercise the intended browser surfaces through the actual backend, with authentication and boundary-input validation rather than frontend-only alerts.
  - [ ] Tests cover success for implemented platform operations and distinct authentication/validation/ownership failures before not-implemented responses. Include malformed unfinished-route requests so an unconditional placeholder response cannot pass. Use genuine isolated platform records where implemented ownership checks require them; never bypass those checks to force an unavailable response. Unimplemented domain semantics are not claimed as verified.
  - [ ] Unfinished commands cause no product-state mutation, approval or paid/provider work. Do not add fake lifecycle stores or application scenario-seeding endpoints.
  - [ ] Controlled provider responses remain test/qualification-only. Static contract examples or read-only component data may support tests, but cannot stand in for persisted application work.
- **Commits:** ≤5.

#### Open Questions

No unresolved product-scope decision is carried for this phase. The exact compatible package cohort and native-runtime behavior remain implementation-time qualification work within the stories above, not established capabilities. A material qualification failure requires revisiting the execution choice before treating the phase as complete.

#### References

- [Architecture](../architecture.md)
- [API inventory](../architecture.md#api-surface)
- [Background execution and safeguards](../architecture.md#background-jobs)
- This spec’s §§4–7: architecture/interfaces, integrations, data and environment.

#### Done When

- [ ] All phase stories are complete.
- [ ] The frontend has a coherent, callable interface to build against, with honest not-implemented responses for unfinished operations.
- [ ] Native integration evidence, including Stop isolation and the saved-before-start crash case, supports those contracts.
- [ ] Every surface has an intended consumer; actual frontend wiring is audited in Phase 2.
- [ ] Contract/runtime tests and required regression checks pass, with evidence recorded.
- [ ] No unresolved framework incompatibility is hidden behind a mock.

#### Background-execution clarification

This execution model does not expand P1-S3 into implementation of the finished generation system.

- The persistent Railway backend—not an ongoing assistant turn—executes background work through Mastra workflows.
- After human batch approval, an application tool saves Generation Requests and their stable workflow identities, starts the workflows asynchronously, and returns. Application writes and native workflow starts are separate operations requiring recoverable hand-offs.
- Workflow steps perform submission, waiting/status checks, result transfer, validation and finalization. Waiting does not require repeated LLM calls. The final application supplies the production rules and provider adapters.
- Browser disconnection ends observation, not the backend process or the separately started workflow. Stopping an assistant turn must not propagate its cancellation into independent generation work.
- Postgres stores state; it does not execute work. During backend downtime, application polling and downloads pause, while an external provider may continue.
- On restart, native workflow recovery and narrow application reconciliation must recover persisted execution and saved-but-not-started work. This behavior requires executable qualification against the selected package set.
- Recovery may re-enter a step. Persistence is not exactly-once provider execution: ambiguous paid submissions must not be blindly repeated, and cancellation does not guarantee remote work or charges stop. Full application-side submission/publication safeguards are implemented and verified with their features.
- P1-S3 uses a small real workflow, real Postgres and fake external jobs to observe asynchronous execution, disconnection, waiting, process restart, step re-entry and cancellation. Its evidence becomes regression coverage, not a parallel scheduler.
- pg-boss remains an alternative only for a demonstrated gap that cannot be handled simply; it is not an additional runner alongside native workflows.

### Phase 2 — Connected Frontend and Surface Audit

**Outcome:** a React frontend whose intended controls connect through `api-client` to Phase 1's actual backend. Implemented platform operations work; unfinished operations visibly report “Not implemented yet” without pretending to save, approve, generate or export work.

This proves **frontend/API wiring and interface coverage**, not a complete simulated or functional filmmaking journey. Static sample content may support layout/component checks, but no stateful fake application or simulated end-to-end lifecycle is required.

The existing design references guide the MVP screens. Phase 2 covers missing control layouts and basic loading, empty, error and not-built states. Detailed feature-specific failure/recovery behavior is designed and verified with its functional slice. The Editor and Project workspace remain excluded.

#### Modules

Primarily `web`, `api-client` and the playback interface in `player`, plus Phase 1's route skeleton and surface catalog. Production business logic and private-media integration remain for the feature phases.

#### Flows Delivered

Connect the browser-facing interactions for §8.1–8.7: starting/resuming, bringing material, developing work, approving batches, reviewing/choosing versions, exporting and stopping/cancelling. These are wiring targets, not claims that the underlying flows are complete.

Existing implemented Phase 1 functionality remains real. Native inference/streaming qualification may use the explicit test harness; the ordinary application does not invent assistant replies. Unfinished interactions return not-implemented responses and leave saved state unchanged. Usage inspection remains internal—no analytics dashboard is added.

For controls whose prerequisites are not implemented, use read-only sample props in isolated component/wiring tests to exercise the actual frontend consumer through `api-client` against the backend skeleton. Record the missing prerequisite and later owning phase. Do not seed a fake application lifecycle just to make a complete journey appear to work; a generic API test without a real frontend consumer is not wiring evidence.

#### Dependencies

- Phase 1's callable contracts and qualified native conversation integration.
- Existing design tokens, components and approved flows.
- Reproducible synthetic or appropriately licensed sample content for layout/component tests—not private, ignored demo assets. Real R2 transfer/playback qualification accompanies the first functional media slice; it is not a prerequisite for an unavailable-feature response.

#### Stories

Each story is bounded to **≤5 logical commits**, with verification included. The acceptance checks below concern Phase 2 wiring; references to later feature verification assign future obligations, not prerequisites for completing this phase.

##### P2-S1 — Complete the MVP interface skeleton

- **What:** map the existing demo to the approved MVP; resolve missing proposal/cost presentation and upload, cancellation and export controls. Use the existing design system for basic loading, empty, error and not-built states.
- **Acceptance criteria:**
  - [ ] Obtain visual approval for missing layouts/states before implementing them; record the approved references and approval in the existing design guide/history.
  - [ ] Inventory detailed feature-specific states and assign them to their functional slices: stale saves/upload validation, generation-status/cancellation presentation and export progress/failure/currentness in Phase 3; actual agent/provider outcomes and late-publication qualification in Phase 4. Their design approval still precedes implementation, but no simulated backend is built to demonstrate them in Phase 2.
  - [ ] No Editor, credits, spending-cap, model-selector or deletion UI.
- **Commits:** ≤5.

##### P2-S2 — Application shell and navigation

- **What:** implement sign-in/session presentation, New video, Recents, Library and the four workspace tabs.
- **Acceptance criteria:**
  - [ ] Verify desktop/narrow navigation.
  - [ ] Prevent stale responses from appearing in another conversation or account.
- **Commits:** ≤5.

##### P2-S3 — Conversation and question interactions

- **What:** connect messages, supported native streaming/queued-input/Stop interfaces, and pending-question controls. Own the exact proposal-bound batch-approval presentation: scope, inputs, provider/model disclosure and informational estimate.
- **Acceptance criteria:**
  - [ ] Exercise option-answer wiring and ordinary typed-message wiring while a question is pending through backend contracts. Batch-approval actions carry the saved question/proposal identity; not-implemented responses leave the decision pending rather than showing approval.
  - [ ] Use P1-S2's native-integration test harness with controlled providers for stream/queue/Stop browser checks. Unbuilt assistant functionality reports unavailable and clears loading instead of producing fake replies in the ordinary application.
  - [ ] Reconnection must not replay commands; closing observation must not send Stop or generation cancellation. Human-answer/superseded-binding and saved-approval tests belong to Phase 3; actual agent question/proposal creation and authorized generation execution are qualified in Phase 4.
- **Commits:** ≤5.

##### P2-S4 — Script, Assets and version controls

- **What:** render scripts, reference sheets, viewers and version history. Connect manual saves and explicit use/approval actions.
- **Acceptance criteria:**
  - [ ] A not-implemented or transport-error response preserves the creator's unsaved input and does not display a new saved version. Stale-save semantics are verified with real versioning in Phase 3.
  - [ ] Viewing alone sends no approval action; use/save controls identify the exact version and do not manufacture an approved result.
- **Commits:** ≤5.

##### P2-S5 — Storyboard and Videos workspace

- **What:** implement Shot/Panel views and controls for planning edits, generation status, candidate review and chosen versions. Own separate Generation Request cancellation wiring.
- **Acceptance criteria:**
  - [ ] Choice/cancellation controls target the exact version/request; cancellation never calls assistant Stop. Stop targets the turn, while disconnect sends neither command.
  - [ ] Not-implemented responses do not change chosen versions, approvals or request status. Read-only examples are identified as examples, not account-owned work.
  - [ ] Cancellation feedback does not promise remote cancellation or stopped charges. Persisted status reads, guarded cancellation state and exact-version choices are implemented/verified in Phase 3; actual generation progress, provider cancellation and late-publication races are qualified in Phase 4.
- **Commits:** ≤5.

##### P2-S6 — Playback interface and controls

- **What:** wire single-clip playback controls to the source-access and `player` interfaces, displaying an unavailable state when the media feature is not built.
- **Acceptance criteria:**
  - [ ] Controls request exact versions without changing selections. `api-client` obtains/refetches sources through authorized backend contracts; `player` consumes supplied sources and grants no access itself.
  - [ ] Unavailable source responses produce clear feedback, not pretend playback. Any isolated playback checks using synthetic clips are local component evidence only, not proof of private-media transport.
  - [ ] Audit evidence marks private-media transport as unimplemented, with qualification assigned to Phase 3's first real media slice. Neither a fake media server nor R2 qualification is required to claim this wiring complete.
  - [ ] No timeline editing, sequential Play all or comparison playback.
- **Commits:** ≤5.

##### P2-S7 — Material inputs

- **What:** wire pasted text, uploads and Library attachments.
- **Acceptance criteria:**
  - [ ] Input controls call their intended contracts; not-implemented responses leave attachments unchanged. Do not claim a transfer or confirmation occurred when upload initiation is unavailable.
  - [ ] Test the actual frontend upload/confirmation consumers in isolation where unfinished prerequisites prevent a full flow. Real transfer/confirmation and upload validation belong to Phase 3; agent model resolution and media-provider execution belong to Phase 4.
  - [ ] Controls use backend results rather than frontend-only pretend saves.
- **Commits:** ≤5.

##### P2-S8 — Export interactions

- **What:** wire direct Export from Videos and status/history/download controls to their contracts, showing not-implemented feedback where appropriate.
- **Acceptance criteria:**
  - [ ] An unavailable export produces no fake export record, completion or download. Assign stale-submission, captured-versus-current selections/order and incompatible-clip rejection to Phase 3's real export verification.
  - [ ] No deletion controls are wired; Artifact/version, conversation and account deletion are deferred from this release.
- **Commits:** ≤5.

##### P2-S9 — Wiring walkthrough and surface stocktake

- **What:** run automated browser navigation/action checks through the actual backend, including clear not-implemented feedback. Audit actual route exposure and frontend consumers without claiming a complete filmmaking journey.
- **Acceptance criteria:**
  - [ ] Record each route's consumer, observed wiring evidence and functional/unimplemented status. For paths blocked by unfinished prerequisites, use the actual frontend consumer in isolated wiring tests and identify the later phase that completes the flow—not an arbitrary test caller or invented UI button.
  - [ ] Inspect development and production-configured exposure: only intended native/product/operational routes are available; test-only providers and qualification controls are absent from production. No deployed production environment is required for this build/configuration check.
  - [ ] Record missing wiring, redundancy and justified exceptions. Send substantial corrections to their owning story or a bounded follow-up rather than expanding this audit into a rewrite. Required Phase 2 corrections must be completed before closing the phase; later business functionality stays explicitly deferred.
  - [ ] Record separate intended consumers for agent tools and internal operations. Explicitly list panel-change notice → workspace refetch as unimplemented with the `api-client`/workspace consumer and Phase 3 owner; native chat-stream wiring alone is not evidence of panel-update handling.
- **Commits:** ≤5.

#### Surface-audit output

Extend Phase 1's catalog with:

**Surface → owner → consumer → flow → observed wiring evidence → functional/unimplemented/test-only → disposition**

A route is not justified merely because a test calls it. It needs a genuine product or operational purpose. Distinguish browser-observed wiring, isolated tests of the actual frontend consumer, and completed-flow evidence; neither of the first two proves unfinished business behavior. Agent tools are not given browser endpoints just to make the inventory look complete.

#### Open Questions

Bounded skeleton visual decisions belong to P2-S1; feature-specific states follow their functional slices. Approving this phase does not approve unseen designs or mark unimplemented features functional. Story sizes are checked during sprint packaging; split work that cannot fit the stated bounds rather than hiding business implementation inside a wiring story.

#### References

- [Generate flows/demo](../design/generate-flows.html)
- [Design guide](../design/design.md)
- This spec’s §§4–9: architecture through flows and verification.

#### Done When

- [ ] All stories are complete: intended frontend controls are connected to the actual backend and unfinished actions clearly report not implemented, without static "next demo page" shortcuts or fake successful work.
- [ ] Frontend requests use `api-client`; native protocols are not reimplemented.
- [ ] Every exposed browser product route has a genuine frontend consumer with browser or isolated-consumer wiring evidence; tools/internal/operational surfaces have justified non-browser consumers. Blocked complete-flow checks name their later owning phase.
- [ ] Desktop/narrow layouts, keyboard interaction, focus handling and basic loading/empty/error/not-built states are verified.
- [ ] Development and production-configured exposure are checked; unfinished actions cause no paid work or product-state changes, and test-only providers/controls cannot be used in production.
- [ ] Browser, contract and required regression checks pass, with evidence recorded. Functional filmmaking flows remain the responsibility of Phases 3–4.

### Phase 3 — Frontend Capabilities and Shared Backend

#### Outcome

Implement the backend behavior behind the frontend's existing MVP interactions, including the shared domain operations that Phase 4's agent tools will later reuse. Uploads, saved edits, Library reuse, media access, playback, human decisions, request controls and export stop being placeholder actions.

This is a **frontend/backend capability milestone**, not the completed agent-directed filmmaking journey. It does not implement creative agent tools, skill adaptation, initial agent-authored questions/proposals, or image/video generation. Basic native chat is a frontend operation; its connection, messages and supported text replies do not mean that the assistant can save production work or run tools.

Some frontend operations consume records that the Phase 4 agent will create: a Script/Shot plan to edit, a question to answer, a proposal to approve, or a Generation Request to cancel. Their backend/UI behavior is implemented here against real persisted records, with those prerequisites supplied by isolated test setup where needed. The ordinary application shows an honest empty/waiting state when no such records exist. **Do not add a manual screenplay/storyboard builder, structured-document import API, production seed endpoint or fake agent just to manufacture these prerequisites.** A fresh account is not promised a complete blank-workspace-to-film journey before Phase 4.

Export itself must actually process uploaded/chosen clips and produce a verified downloadable MP4 in Phase 3. Its integration/browser tests may begin with a valid persisted Shot plan, then exercise real upload, selection and export. Such a test proves export, not that the unbuilt agent produced the plan.

#### Scope

**Included**

- Authenticated conversation creation/listing/resumption; native chat/history/queue/Stop behavior and available usage for any live model calls enabled here.
- Shared Artifact/Artifact Version reads and writes, version history, manual text/planning edits, exact human use/approval/selection, dependencies and change records.
- Actual image/video uploads, media verification/posters, private image/video access, Library reuse and single-clip playback.
- Exact saved human answers and approvals of read-only proposals; typed requests reach the assistant as ordinary messages.
- Backend reads for generation status/results and guarded cancellation of existing requests, without building generation submission or provider execution.
- Workspace refresh/reconnect, including manual changes and real export workflow updates.
- Export capture, compatibility checks, stream-copy assembly, processing/status/history/downloads, recovery and output independence.
- Functional UI states, real-service qualification and automated verification for these operations.

**Excluded / Phase 4**

- Registering production Artifact/Library/model tools for the agent, even when their underlying domain operations are already available here.
- Agent-driven script/reference/Shot planning, local-skill-to-hosted adaptation, the `ask` tool and initial agent-authored question/proposal preparation.
- Generation-request creation/submission, image/video provider adapters, provider polling/result import/publication and saved assistant outcome reports.
- Agent-side workspace-context consumption/report acknowledgment and full tool-driven approval/recovery journeys.

No Editor, timeline editing, pixel-editing UI, separate audio generation/mixing, multi-scene Project, spending controls, public analytics dashboard, signup/invitation administration, deletion, creator-selectable models, clip conversion or sequential/comparison playback is added. PDF/Word and standalone-audio uploads remain excluded. Media allowlists and technical limits are explicit rather than claiming universal format support.

#### Operation inventory and phase ownership

Classify operations by their intended callers, not by their folder name. A frontend command may invoke internal helpers or workflows; that does not make those helpers agent tools. Shared domain logic is implemented once, and agent tools later call it in process, not through HTTP. Shared implementation never gives a model human approval authority.

| Operation / intended caller | Phase 3 backend and frontend work | Phase 4 addition / dependency |
| --- | --- | --- |
| Sign in/out; create/list/load conversations; send/queue text; subscribe; Stop — frontend | Real Auth/native interfaces and configured baseline chat; no second conversation store. P3-S1. | Production tool/skill integration, not another chat transport. |
| Read saved work, versions, references and Library — shared | Owned queries, schemas, views and pagination needed by the frontend. P3-S2/S4. | Agent tools/context adapters reuse the same queries; not every route needs a matching tool. |
| Save text/planning versions — shared core, different authority | Immutable versioning and manual-save command, base-revision checks, human link effects and change records. P3-S2/S5. | Agent save tools reuse the core with assistant provenance and unapproved output; no human-save impersonation. |
| Explicitly use/approve a version or choose a Shot's video — human frontend | Exact version/intended-use checks and saved decision/selection. P3-S4/S5. | No model approval/selection tool is implied. |
| Authorize/confirm an upload; view/download owned media — frontend | Real R2 transfer, verification, immutable publication and scoped access. P3-S3/S10. | Provider-result acquisition/publication remains generation work; common storage mechanics are reused. |
| Read a current question/proposal — shared | Owned authoritative records and exact review presentation. P3-S7. | Initial question/proposal creation and `ask` are agent-only work. |
| Answer/approve a question — human frontend | Validate the question revision and record the exact human decision; a typed message is an ordinary turn that leaves the question pending. P3-S7. | Agent proposal creation, supersession and execution reuse these contracts. The initial producer is absent in Phase 3. |
| Read generation requests/results — shared | Real persisted statuses, failures, unknowns, partial results and bounded browser refresh. P3-S8/S9. | Agent tools/context and actual providers populate the records; no fake progress producer is added here. |
| Cancel an existing Generation Request — frontend | Guard local state/batch effects, request qualified native cancellation and define the provider-cancellation seam. P3-S8. | Real provider cancellation support and cancellation-versus-publication races are qualified with the execution adapters. |
| Request/read/download an export — frontend | Exact input capture, asynchronous processing, verified output and history. P3-S11–S13. | No export tool is assumed merely because the frontend can export. Generation results use the same export backend later. |
| Record/query usage — internal support | Record available usage for native model calls enabled by P3-S1; no browser-submitted usage or dashboard. | Extend trusted recording to media and additional model calls with their Phase 4 integrations. |
| Draft creative work, initially ask/propose, start generation and report outcomes — agent-only | No production tools or agent-only execution backend for these capabilities. | Backend functionality plus tool/skill integration and complete-flow verification. |

##### Data-producer and verification boundary

- Test setup may insert valid, owner-scoped Script/Shot/question/proposal/request records into **isolated real Postgres**, then exercise the actual UI, `api-client`, routes and domains. It must not implement an alternate product state machine or expose a seed endpoint in the application.
- Report implemented operations separately from complete journeys. For example, “answering a saved question is implemented; agent question creation arrives in Phase 4” is accurate. “The agent approval workflow works” is not yet accurate.
- No additional manual creative-authoring or structured-document import screens are assumed beyond the already intended frontend inputs and edits. Initial creative production and automatic prose-to-structured-work conversion stay in Phase 4. Pasted text can be a native message or an edit; sending prose does not automatically create a Script Artifact Version.
- Local generation cancellation and status reads can be verified on real records and a controlled native workflow. Mocking the external cancellation boundary does not qualify a real provider, late generated-result publication or stopped charges. Phase 4 owns those proofs before live generation is accepted.
- Question answering commits the decision independently of its native notification. A recorded approval is not a claim that Generation Requests exist or execution started. Agent-side continuation with production tools is a Phase 4 dependency.
- The first functional media slice includes actual development-R2 signing, stored-byte/type/size confirmation, CORS/range access, expiry/reacquisition or explicit failure, and authorized download. Later player stories add full product playback/sequence evidence, not a delayed replacement for transport qualification.

#### Modules

- `artifacts`: shared saved-work/version/use rules, the selection revision, frontend edits/decisions, question-answer state and upload/dependency/change records.
- `generation`: the records, approval checks, status queries and cancellation transitions required by frontend operations—not its agent submission/provider execution engine.
- `exports`: export snapshots, statuses, workflow correlation, guarded publication and currentness.
- `usage`: trusted per-attempt consumption records for calls actually enabled here. `model-catalog` stays configuration consumed by Phase 4 proposals; no creator-facing catalog or preference operation is built.
- `application`: shared use cases, transaction coordination and recoverable hand-offs through domain public interfaces; no domain SQL or imports of agent/native bootstrap.
- Backend `mastra` and `agent/mastra`: thin browser/native adapters and qualified native conversation integration in one runtime. No production creative tools/skills are added.
- `storage` / `db`: private objects, bounded media processing and connection/transaction mechanics. Domains own their tables/SQL; application composition coordinates their interfaces.
- `contracts`, `web`, `api-client`, `player`: shared structural schemas, actual frontend operations, authoritative refresh, access-controlled sources and playback only. Backend domains retain authoritative rules.

Use Phase 1's single qualified background-execution mechanism for export. Do not add a parallel runner, custom scheduler, new HTTP server or another agent loop. Never modify Mastra-owned schemas.

#### Flows Delivered

- **8.1:** frontend conversation start/resume, native text chat and restore of available saved work/decisions.
- **8.2:** actual uploads and exact Library reuse; pasted text reaches its intended message/edit operation without fabricated adaptation.
- **8.3 / 8.5:** frontend inspection, manual editing and human review of existing creative records. Agent drafting/planning remains Phase 4.
- **8.4:** read-only proposal review and exact human authorization operations, but not the agent-created proposal → provider execution journey.
- **8.6:** real export of chosen full clips, including compatibility checks, stream-copy assembly, preserved existing audio, download and independent completed output.
- **8.7:** native Stop/reconnect, frontend request-cancellation state and real export recovery. Generation-provider recovery/reporting remains Phase 4.
- **8.9:** usage for native model calls enabled here; media/provider extensions follow their actual integrations.

#### Dependencies

- Phase 1's actual built-server/Auth/Postgres/native-workflow qualification and Phase 2's connected frontend/contracts. Preserve their required checks; mocks cannot replace failed native qualification.
- The configured assistant integration for frontend chat, a declared media upload/playback allowlist and export compatibility rules/limits. Choose concrete versions, formats and technical bounds during sprint packaging; verify real response shapes before integration-specific handling and qualify behavior before feature acceptance.
- Dedicated development Supabase/R2 and separately authorized real-model/service verification. Tests use isolated data and synthetic/licensed media, never customer records or private demo assets.
- Existing design references. New conflict, progress, expired-source and export states need visual approval before implementation; Phase approval does not approve unseen screens.
- Hosted content schemas/validation needed for frontend edits preserve `CONTEXT.md` distinctions and exact references. Adapting the local creative skills into hosted agent workflows remains Phase 4. The existing local assembly helper proves compatible stream-copy behavior; the hosted export reuses that approach with hosted storage, records and native recovery rather than adding conversion.
- The saved-record producer dependencies above remain explicit. They do not justify bringing an agent tool into Phase 3 or inventing a frontend creator to change its category.

#### Stories

Each story targets **≤5 logical commits including verification**. Split oversized stories during sprint packaging without dropping their checks or moving an agent-only capability into this phase. This milestone may span multiple sprints. A partial export implementation is not exposed as a working export; its capture, processing and safety stories must be complete before enabling the command.

##### P3-S1 — Frontend conversation operations and native chat

- **What:** finish actual frontend Auth/conversation operations and qualify the configured native text-chat integration, without product tools or creative skills.
- **Acceptance criteria:**
  - [ ] Sign-in/out, session refresh, New video, Recents, history, send/queue/subscribe and exact-turn Stop work through qualified native interfaces. Reconnect never replays a command; disconnect and Stop do not cancel independent export work. Late responses cannot populate another account/conversation.
  - [ ] Qualify selected-model responses/errors/streaming and interrupted versus saved output. Automated checks use harness-supplied controlled providers; real-model qualification remains separately authorized. Chat text is not a saved production Artifact; no tool-driven save, question creation or generation is advertised.
  - [ ] Record available native assistant/framework-model usage per attempt with actual model, account/conversation/turn correlation and reported/calculated/estimated/unknown provenance. Deduplicate observations, not real additional calls. Bound calls/retries/output/concurrency; disable optional unobservable billable features. No spending gate or sensitive logging.
- **Commits:** ≤5.

##### P3-S2 — Shared saved-work and manual-version operations

- **What:** implement owned Artifact/version queries and the shared persistence rules behind history, workspace reads and manual text/planning saves.
- **Acceptance criteria:**
  - [ ] Real Postgres stores validated immutable versions, exact dependencies and conversation uses. Reject foreign references. Serving credentials cannot perform privileged schema preparation.
  - [ ] Real frontend edits create a version against the expected base, move the human's use approved and start no turn. Stale/conflicting saves preserve unsaved input and earlier versions. Viewing/history never grants approval.
  - [ ] The common domain interface preserves producer provenance and pinned approved versions; nonhuman writes cannot claim a human decision. Verify those domain rules directly without registering agent tools. Do not add agent-only creative operations or new frontend authoring/structured-document import screens.
- **Commits:** ≤5.

##### P3-S3 — Real uploads, private access and R2 qualification

- **What:** complete file selection → authorized transfer → verified confirmation → saved/viewable image or video.
- **Acceptance criteria:**
  - [ ] Upload through `api-client` to private R2, inspect actual bytes/type/size and supported media, create bounded metadata/posters and link the confirmed version for the human's intended use. Neither a signed URL nor transfer completion alone creates usable work.
  - [ ] Reject malformed/unsupported/oversized or mismatched content. Confirmation is repeat-safe; an upload URL cannot overwrite published media. Failed/expired transfers retain safe cleanup references without publishing a version.
  - [ ] Use real development R2 and a browser to qualify signing, CORS, range access, stored-object checks, expiry/reacquisition or explicit failure, image display and authorized download. Test owner isolation and interrupted confirmation. Synthetic/licensed media and redacted evidence only.
- **Commits:** ≤5.

##### P3-S4 — Library reuse and reference controls

- **What:** make Library browsing, reference viewing/attachment and exact-version use work over the shared domain.
- **Acceptance criteria:**
  - [ ] List owned work and bounded read-only built-in examples; inspect versions and media with authorized access. Library items do not have conversation-specific Draft/Ready state.
  - [ ] Human use records the exact version and purpose without copying files. Reuse across conversations keeps independent decisions; later versions do not silently replace pinned uses. Existing reference descriptions/associations use the manual-save rules.
  - [ ] Foreign references and mutations of built-ins are rejected; viewing never chooses a version. Missing reference coverage remains visible. Automatic reference planning/sheet creation by the assistant stays in Phase 4.
- **Commits:** ≤5.

##### P3-S5 — Storyboard edits and exact video choices

- **What:** implement the existing frontend planning-edit, Panel-association and Shot-video choice controls, not automatic Shot creation or a new storyboard-authoring product.
- **Acceptance criteria:**
  - [ ] Read/edit existing Shot/Panel planning with stable identities/order and exact source references; preserve the distinction between multiple Panels and a single Shot. Reuse saved-version/stale-base protections rather than introducing another document store.
  - [ ] Human attachment/use targets the exact intended reference/Panel/Shot. Playing a clip or attaching it as a reference does not choose it as the Shot's video. Explicit choice persists and reloads without substituting newer versions.
  - [ ] Relevant upstream/manual changes identify affected work and retain change/dependency records; they do not automatically regenerate, rewrite Script intent or erase unrelated historical approvals. Use persisted planning fixtures where the initial agent-created plan is unavailable; do not claim that planning generation is implemented.
- **Commits:** ≤5.

##### P3-S7 — Human question answers and proposal review

- **What:** implement frontend review of saved questions/proposals and exact human answers/authorization over read-only cards.
- **Acceptance criteria:**
  - [ ] Read authoritative records and show exact scope, versions, model/settings/disclosures and informational estimate with its provenance/unknowns. Only a listed option approves; typed text is sent as an ordinary message and never counts as approval. Model claims and stale/superseded bindings cannot approve.
  - [ ] The card has no editable fields and no amendment operation. A typed request leaves the question pending; when the assistant later saves a new proposal, the old question becomes superseded and its controls stop acting. Do not rewrite an approved snapshot or add an initial proposal-creation UI.
  - [ ] Atomically save the decision and applicable link/proposal authority with a stable native hand-off identity. Duplicate answers and interrupted notification cannot reapply approval or pretend execution started. Qualify the hand-off against native saved evidence with real records; initial agent question/proposal production, `ask` and tool-driven continuation remain Phase 4.
- **Commits:** ≤5.

##### P3-S8 — Generation status and cancellation operations

- **What:** implement the frontend's real generation-record queries and cancellation backend without building the generation producer.
- **Acceptance criteria:**
  - [ ] Render authoritative queued/running/terminal states, failures, partial results and unknown information from persisted records. Missing progress/cost is not invented. Normal empty state stays empty until requests exist; tests supply isolated real records rather than a simulated product.
  - [ ] Cancellation identifies and owns one request, guards terminal transitions and batch effects once, and requests cancellation of its qualified native run when applicable. It never calls assistant Stop or retries a submission. Test repeats/races with terminal state and a controlled native workflow.
  - [ ] Define/test the narrow provider-cancellation boundary without implementing provider adapters here. Report the local outcome separately from unknown remote completion/charges. Real provider cancellation, active-job status production and late-result publication races must be verified in Phase 4 before enabling generation.
- **Commits:** ≤5.

##### P3-S9 — Workspace refresh and reliable return

- **What:** complete authoritative frontend refresh/reconnect over real saved changes and active work.
- **Acceptance criteria:**
  - [ ] Manual changes and actual export workflow updates reach open views via the qualified panel-change notice, authoritative fetch and bounded active-work polling/reconnect mechanism. Native chat text is not a panel snapshot; no second event protocol/store is added.
  - [ ] Preserve exact choices, history and pending decisions after reload/process restart; settle loading/error states and ignore stale account/conversation responses. Observe existing work rather than resubmitting commands or restarting exports.
  - [ ] Store manual change information without consuming it on a read. Actual agent-originated changes, next-turn product-context consumption and saved-report acknowledgment are Phase 4 proofs. Generation polling consumers can be tested on real changing test records without claiming a real generation producer.
- **Commits:** ≤5.

##### P3-S10 — Private single-clip playback

- **What:** complete actual product playback of individual versions and chosen clips.
- **Acceptance criteria:**
  - [ ] Play/pause/seek use exact backend-provided versions. Verify picture and embedded audio; viewing does not change any selection or create an exported file.
  - [ ] `api-client` obtains/reacquires authorized sources; `player` only consumes them. Verify real R2 cross-origin/range behavior and URL expiry, ownership failures, switching conversations and loading/interruption states through the actual consumer.
  - [ ] Individual uploaded-video playback requires no Script/Shot plan; local public clips alone do not qualify private product playback. No sequential Play all, comparison playback, timeline editing or audio mixing.
- **Commits:** ≤5.

##### P3-S11 — Export request, snapshot and frontend lifecycle

- **What:** implement direct Export from Videos, exact request capture and the status/history/download interfaces, using shared saved work and access rules.
- **Acceptance criteria:**
  - [ ] Validate ownership, complete choices and the supplied selection revision against the conversation's current selection revision inside the capture transaction; capture exact Shot/version IDs server-side. Missing/stale inputs start no work. Repeated command ID/payload returns the same export; conflicting reuse fails.
  - [ ] Persist the request/stable workflow identity before separate background start. Return the saved identity promptly and show actual status/history; do not enable submission as working until the processing/publication path is complete. No placeholder queued jobs or fake downloads.
  - [ ] The frontend distinguishes captured sources from current choices and retains earlier exports. Source/settings changes do not mutate a running/completed snapshot; a successful older output is not falsely called current. Required error/progress/history designs are approved before implementation.
- **Commits:** ≤5.

##### P3-S12 — Verified stream-copy assembly and publication

- **What:** process the captured full clips through a bounded export workflow and publish one verified MP4 Artifact Version.
- **Acceptance criteria:**
  - [ ] Validate that all captured clips share a compatible codec, geometry, timing and audio profile, then join them by stream copy in captured Shot order without re-encoding. Preserve full clips, geometry and embedded audio; no silent crop/stretch/audio loss or overwrite of originals. Incompatible combinations fail explicitly with a message naming the mismatch; conversion/normalization is deferred.
  - [ ] Bound transfers, FFmpeg concurrency/time/temp resources and shutdown. Use safe argument arrays and controlled paths, not shell interpolation or arbitrary remote FFmpeg inputs. Verify decoded order/duration/geometry/audio against known synthetic clips, not just file existence or process exit.
  - [ ] After verification, recheck lifecycle/input validity and guard publication of exactly one output/version. Stable export-owned storage references and repeat-safe finalization prevent overwrite/duplicate completion; failed/cancelled work publishes no completed output. Download the real result through current authorized access; technical completion grants no creative approval.
- **Commits:** ≤5.

##### P3-S13 — Export recovery, invalidation and independence

- **What:** qualify the complete browser/backend/workflow/storage export path under interruption and source/lifecycle changes before enabling it as finished functionality.
- **Acceptance criteria:**
  - [ ] With the actual built server/Postgres and processing pipeline, kill/restart around saved-before-start, processing and publication boundaries. Reconcile the same export without stranded intents, extra completed versions or silent loss; disconnection/assistant Stop does not cancel it.
  - [ ] An invalid input blocks unfinished publication; ordinary selection/order changes advance the selection revision and leave the captured export intact but distinguish it from the current workspace. Exercise cancellation racing finalization, using a defined serialization point rather than an earlier stale check.
  - [ ] After success, changing choices does not mutate the completed video's independent bytes or make its download depend on current choices. Verify failure/temp/orphan cleanup and retained retry references; feature checks are not deferred to later combined-product acceptance or deployment.
- **Commits:** ≤5.

##### Deferred Phase 3 stories (P3-S6, P3-S14, P3-S15, P3-S16)

Deferred from this release by explicit user decision and retained only as identifiers: media catalog and conversation model preferences (P3-S6), Artifact/version deletion and retention (P3-S14), conversation deletion (P3-S15) and account deletion (P3-S16). No hidden operator substitute, partial implementation or not-implemented control is built for them, and nothing in this phase depends on them. Their later reintroduction needs its own flows, data/barrier decisions, stories and review.

##### P3-S17 — Frontend capability acceptance and Phase 4 hand-off

- **What:** verify the phase's actual browser operations and shared backend contracts, with an honest producer-dependency inventory for Phase 4.
- **Acceptance criteria:**
  - [ ] Exercise real uploads, Library reuse, owned views/manual edits, choices and playback. Starting with a valid persisted Shot plan, upload/select actual clips, submit an export, observe processing, download/decode it and reopen the same saved result. State the setup prerequisite; do not pretend an agent or new manual builder created the plan.
  - [ ] Exercise human answers, typed-while-pending messages, cancellation and stale/foreign-input cases against real persisted test records. Distinguish real-native/storage/model qualification from controlled external responses. Required feature verification accompanies its story, not only this walkthrough.
  - [ ] Update the surface catalog with implementation status, actual frontend consumer, record-producer dependency and remaining agent/provider qualification. Phase 4 receives stable domain interfaces, trusted actor/approval rules and regression tests—not duplicate backend business logic. No production seed controls, hidden tool execution, unimplemented-success claims or missing required checks.
- **Commits:** ≤5.

#### Open Questions

No additional manual creative-authoring/structured-document import product is assumed. This milestone deliberately keeps agent-created prerequisites in Phase 4 and makes their consumer tests explicit. The user approved this milestone and its limits; implementation, live verification and unseen designs retain their separate approval boundaries.

Exact dependency/model choices, configured model mappings, supported media/compatibility limits and implementation-level native behavior remain bounded story qualification work, not claimed compatibility. If a genuine production frontend consumer or a native capability contradicts this allocation, resolve that specific scope/contract before implementation rather than inventing a shortcut or widening a tool's authority.

#### References

- [Phase sequence and caller-based allocation](#10-phases)
- [Architecture and interfaces in this spec](#4-architecture)
- [Architecture: API operations and entry points](../architecture.md#api-surface)
- [Architecture: module ownership/version rules](../architecture.md#modules)
- [Architecture: turn updates](../architecture.md#turn-rules) and [background execution](../architecture.md#background-jobs)
- [Canonical terminology](../../CONTEXT.md)
- [Design guide](../design/design.md) and [frontend flow references](../design/generate-flows.html)
- [Existing local assembly boundary](#source-contract-references)

The approved spec scope supersedes older architecture/design language about spending gates, a fixed assistant provider, Editor/audio scope or the former Phase 5 export allocation. Local skills are references, not already-qualified hosted implementations.

#### Done When

- [ ] Frontend-only/shared backend operations and their actual browser consumers are implemented, with their valid-record prerequisites and real behavior demonstrated—not just success-shaped responses.
- [ ] Shared rules preserve exact versions, human-only authority, stale-write rejection, owner isolation and the Phase 4 integration boundary; no production creative tool was smuggled into this phase.
- [ ] Upload/private access/playback have actual development-R2 evidence, including range/CORS/expiry; usage is recorded from the first live model calls enabled here.
- [ ] Export actually produces a verified downloadable video and passes exact-input/currentness, compatibility-rejection, restart, finalization-race and completed-output-independence tests.
- [ ] Functional UI designs are approved; desktop/narrow keyboard/focus/loading/error checks, relevant automated suites and existing application-repository checks pass with reproducible evidence and no sensitive logs.
- [ ] Agent-created prerequisites, tools/skills, provider execution and complete agent-driven flows remain explicitly assigned to Phase 4. Phase 4 now also owns remaining combined-product acceptance and release, not deferred Phase 3 feature correctness.

### Phase 4 — Agent Capabilities, Media Generation and Release

#### Outcome

Make the assistant capable of developing and saving creative work, asking exact review questions, preparing generation proposals and carrying out explicitly authorized image/video generation. Use Phase 3's shared backend and real frontend consumers rather than building a second versioning, approval, storage or playback system.

This closes Phase 3's deliberately absent record producers. A creator can start from an idea or pasted material, reuse appropriate existing work, approve a Script and visual plan, review generated candidates and choose clips. Actual agent-created records now drive the Script · Assets · Storyboard · Videos workspace. Generation runs independently of the assistant turn; its saved results, failures and uncertainty remain visible after reconnect or restart.

Phase 3 already owns functional export. This phase proves that generated candidates can be reviewed, chosen and passed to that existing export path, then closes the supported combined-product checks in P4-S18. There is no separate QA phase: feature correctness, approval enforcement and recovery proof stay with their owning stories. P4-S19 owns the distinct final deliverable: the reviewed MVP actually deployed to the intended hosting, with a bounded deployment smoke check and operating handoff—not just another test report.

#### Scope and operation ownership

**Included**

- Hosted adaptation of relevant creative skill guidance, with explicit mapping from local file/Pi contracts to hosted records, native tools and human decisions.
- Agent context and thin read/save tools over Phase 3's shared domains, with assistant provenance and draft semantics.
- Initial saved questions, Script/reference/Shot planning, panel instructions and generation proposals, plus continuation from Phase 3's exact human answers.
- Authorized batches and requests, independent native execution, selected image/video adapters, result acquisition/verification and guarded candidate publication.
- Actual agent/generation workspace updates, recoverable saved outcome reporting, provider-aware cancellation, recovery safety and per-attempt usage recording.
- Functional browser, native-runtime, real-service and regression verification with the capability that needs it; P4-S18 closes remaining combined-product coverage without postponing feature proof.
- P4-S19: production deployment of the reviewed build to the already selected hosting/services, verification of deployment-specific wiring and an operating handoff. No new product feature or CI/CD platform is added.

**Not included**

- Reimplementing Phase 3's frontend operations or shared business rules, or making tools call application HTTP routes.
- Model authority to grant human use/approval/selection or trigger exports merely because corresponding browser operations exist. Linking a new draft for review is not granting human approval.
- A general shell/filesystem/network tool, sub-agents, another conversation store, a parallel scheduler or a custom inference loop. Skill delegation means normal-agent guidance and bounded domain tools, not additional reasoning agents.
- An Editor, Project/multi-scene composition, separate audio generation/mixing, audio-reference input, voice cloning, new document-import product, spending controls or an analytics dashboard.
- Copying local HTML packages, manifests, CLI approvals or caller-supplied identity claims into the hosted application as authority. Existing local skills remain unchanged.

| Operation | Existing Phase 3 responsibility reused | Phase 4 responsibility |
| --- | --- | --- |
| Read workspace, versions, Library, references and request results | Owned queries and safe configured-model lookups | Bounded agent tools/context adapters over those queries; no one-tool-per-route requirement |
| Save Script/reference/Shot work | Shared immutable content/version/dependency core | Assistant save adapters and initial creative producers; preserve unapproved output and pinned human choices |
| Ask a question / initially prepare a proposal | Read-only human review, exact answer/approval and notification hand-off | Agent-only creation, binding, supersession after a typed request, and continuation; no model approval tool |
| Start image/video work | Existing approval records and request-status/cancel consumers | Validate exact authority; create batches/requests; execute qualified provider adapters independently |
| Publish generated media | Private object/media mechanics and Artifact Version core | Generation-specific acquisition, provenance, validation, one-result publication and batch finalization |
| Report outcomes / refresh context | Native conversation/queue, browser notices/refetch and persisted records | Real producer notices, next-turn context and acknowledgment against a correlated saved assistant report |
| Cancel | Human cancellation commands and guarded request transitions | Actual remote-cancel support where available, provider/result races and suppression of late writes/wake-ups |
| Choose/play/export clips | Human choices, playback and functional export | Supply truthful generated candidates and qualify the hand-off; do not add selection or export tools |
| Record usage | Trusted per-attempt records and native-chat observations | Instrument additional native/tool-associated calls and media attempts with honest unknowns; cross-path completeness proof is deferred |

#### Hosted skill and execution boundaries

##### Preserve creative intent without copying the local runtime

- **Script:** adapt an idea or selected prose into ordered visible/audible action. Preserve dialogue and sound intentions; do not invent a multi-scene Project or fabricate chapter metadata for an idea. An explicitly approved complete Script precedes script-based storyboarding. Existing approved work can be reused without forcing unnecessary rewriting.
- **References:** keep character, environment, style, prop and composition roles explicit. Library membership, viewing and model suggestion do not approve a reference for this use or external disclosure. Reference planning may identify missing material; it does not itself generate or approve it.
- **Storyboard:** textual Shot Definitions, ordered Storyboard Panels and image Frames remain different things. Preserve stable Shot/Panel identities, intended state progression, neighboring context and review criteria. Human review of the plan and relevant references precedes dependent generation. A generated prior Panel cannot become the next approved conditioning input merely because its request succeeded.
- **Generation:** prepare a concise production brief and exact provider prompt/settings/reference order. Technical validation produces a candidate, never creative approval, a chosen clip or a finished-film claim. No automatic provider/model substitution or paid replacement request.
- **Production:** map approved Shot intent to supported video conditioning and candidly explain limitations. Review actual motion and any embedded audio, not just a poster or sampled stills. Proposed changes to staging, Panels, timing or Shot boundaries return through the affected review gates.
- Local YAML/JSON/HTML layouts, shell flags, spend-limit fields, portable handoff packages and local sequential orchestration are not automatically hosted product requirements. The approved hosted scope uses exact versioned decisions, informational estimates, bounded independent workflows and usage tracking only. Preserve the underlying creative/provenance safeguards; record the mapping and escalate a material unresolved policy conflict rather than silently weakening it.

The adaptation is implemented with supported configuration/skill-loading seams of the selected normal Mastra agent. A local Markdown filename is not proof that hosted guidance is loaded or that the agent follows it. Authority checks belong in domain/tool execution, not only in prompts. Do not build a second skill engine to avoid qualifying the selected native integration.

##### Existing skills and helper reuse map

Adapt the existing authored workflows rather than inventing Script/storyboard guidance from scratch. These are local agent instructions and mechanical helpers, not ready-made hosted tools. Helper paths below are relative to the named skill unless otherwise specified. P4-S1 records the concrete hosted owner, reuse/adapt/local-only disposition and applicable test/evaluation cases for each source below; it does not wrap every CLI or duplicate Phase 3's backend.

| Existing source | Hosted disposition | Existing story owners |
| --- | --- | --- |
| [create-scene-script](#source-contract-references) and [Script validator](#source-contract-references) | Adapt creative guidance and meaningful structure/order/delivery rules to hosted content. Local YAML loading and chapter/file conventions do not create a hosted import API or mandatory Python runtime. | Shared validation: P3-S2. Agent production/review: P4-S1/S3–S5. |
| [create-storyboard](#source-contract-references), [Reference Package validator](#source-contract-references), [renderer](#source-contract-references) and [image validation](#source-contract-references) | Adapt reference/Shot/Panel guidance and validation. Preserve reference-role, Panel-dependency and coverage-lineage checks embedded in the renderer even though standalone HTML is not ported. File/ImageMagick assumptions need a qualified hosted disposition. | Shared content/media/views: P3-S2–S5. Agent planning/generation: P4-S6/S7/S11/S12. |
| [generate-image](#source-contract-references), its prompt-preparation contract and `scripts/{openai-client,openai-run,openai-files,minimax-client}.mjs` | Adapt brief, prompt, inspection and provider-safety behavior. Reuse suitable mechanics only after qualification; local defaults, CLI confirmation and historical prompt budgets do not select hosted models or grant authority. | P4-S7–S11. |
| [generate-video](#source-contract-references), `scripts/{generation-approval,production-provenance,generation-manifest,generation-runner}.mjs` and `scripts/providers/minimax-v2-*.mjs` | Adapt capability, exact-request and same-task recovery rules. Hosted records/native workflows replace the local manifest/lock execution boundary; no second runner. | P4-S8–S10/S12/S13/S15/S16. |
| [produce-scene](#source-contract-references) and `scripts/{production-validation,production-takes}.mjs` | Adapt source review, Shot criteria, Take findings, neighboring continuity and change handling. Local review HTML, relocated handoff packages and spend-limit fields remain local-only. | Human choices: P3-S5. Agent Production/review: P4-S12/S13/S15/S18. |
| [assemble-video](#source-contract-references) and `scripts/{assembly-runner,assembly-schema,assembly-probe,assembly-files,assembly-digest}.mjs` | Reuse or study exact ordering, compatibility, decoded-media verification and non-clobber mechanics. Its stream-copy implementation is the model for hosted export; hosted storage, records and native recovery are added rather than conversion. No agent export tool is added. | Export: P3-S11–S13. Generated-input integration: P4-S18. |
| Shared [FFmpeg](#source-contract-references) and [ffprobe](#source-contract-references) adapters | Reuse/adapt narrowly mechanical process/probe behavior where suitable; qualify hosted bounds, shutdown and concurrency separately. | Media/export mechanics: P3-S3/S12. Generated-result path: P4-S10. |

[`create-production`](#source-contract-references) is a legacy redirect to `produce-scene`, not another workflow. Preserve the source repository's local behavior and checks there; do not copy its tests into the application repository. Use meaningful source test/evaluation scenarios as reference material for independently written hosted behavior proofs—Script ordering/speakers, reference roles and inherited coverage, changed-anchor/sibling invalidation, mandatory image-state failures, unsupported timed Panels, known versus uncertain submissions, Take replacement and decoded assembly order/audio—only where they protect the enabled hosted capability. Old scores, prose-presence assertions and offline preparation-result validation do not prove hosted execution or image quality.

Shared content/media/export rules stay with the Phase 3 backend; Phase 4 adds agent guidance, producers and consumers. These refinements add no new phase/story, frontend authoring product, export-eligibility gate or exception-management UI. Any genuinely new shared/frontend contract discovered during mapping must be surfaced under the caller-based allocation rather than silently assigned to Phase 4.

##### Submission and recovery contract

1. Resolve an exact, currently valid human-approved proposal. Its immutable snapshot binds purpose, provider/model, prompt, settings, count, ordered input versions, disclosures and estimate basis/unknowns. Resolve account/conversation authority from trusted native context, never model arguments.
2. Persist the batch, one Generation Request per candidate and stable native run identities before asynchronous start. The same authorized execution resolves to the same batch even if the tool is repeated with another call ID; generating extra candidates requires fresh authority. Reconcile a saved-but-not-started hand-off using the Phase 1-qualified execution mechanism.
3. Recheck eligibility and atomically save `submitting` before the paid network call. SDK, workflow and tool retries cannot bypass this guard. An ambiguous response or recovered unreceipted submission becomes `failed` with `outcome_unknown`, not permission to submit again.
4. **Asynchronous adapters:** persist the real provider task identity before `running`; poll only that task using bounded native waits. **Synchronous adapters:** retain the bounded response/result receipt and finalize through the same owned-result path; do not invent a remote task, polling API or cancel guarantee. Lost synchronous responses have the same paid-submission uncertainty rule. HTTP correlation IDs are not resumable task IDs.
5. Acquire and verify returned bytes under stable private request-owned storage. A provider-success response or temporary URL is not yet an Artifact Version. Reconcile available receipts/staged bytes on re-entry; do not overwrite published media or regenerate to fix download/validation failures.
6. In one application transaction, guard the terminal transition, at most one unapproved result version per request and one batch decrement. Domains own their SQL; the composition layer coordinates them. No transaction spans provider calls, downloads or media processing.
7. Persist batch outcomes before notification. Reading context, emitting a signal or finishing a stream does not acknowledge reporting. Correlate acknowledgment with a genuinely saved native assistant report; reconcile an uncertain save before another report attempt. This does not promise one physical wake-up or exactly-once inference.

Independent ready requests may share an approved batch. A later request that needs a not-yet-generated or unapproved reference is not ready: obtain the intervening human decision and a new exact proposal instead of preapproving imaginary version IDs. Preserve successful siblings in a partial batch; failure never authorizes replacement work.

Disconnect ends observation; Stop ends the observed assistant turn; request cancellation targets that request. Neither Stop nor its abort signal is inherited by independently started generation/export. Remote work or charges may continue after local cancellation.

#### Modules

- `agent`: assistant guidance, trusted context and tools; `agent/mastra` owns supported native Agent/tool, queue/wake and saved-turn/report integration.
- `artifacts`: existing shared version/use/dependency rules, with agent-owned question creation and assistant-write semantics; no second approval authority.
- `generation`: exact proposals, batches/requests, provider adapters, guarded submission/result transitions, recovery and saved-report correlation.
- `model-catalog`: existing configured media mappings/capabilities and server defaults. Adapters resolve and record the actual selected mapping; no creator selection, user-supplied endpoints or secret exposure.
- `usage`: trusted attempt observations and cost provenance; no totals, admission balance or spending gate.
- `application`: shared in-process use cases, transactions and narrow recoverable hand-offs across owners, without domain SQL or imports of agent/native bootstrap.
- Backend `mastra`: native bootstrap, HTTP and independent workflow adapters composed with `agent/mastra` in one runtime. Domains do not import peers or modify native schemas; no second execution owner.
- `storage` / `db`: existing bounded object/media and connection/transaction mechanics, not provider policy or a scheduler.
- `contracts`, `web`, `api-client`, `player`, `exports`: existing shared structural schemas, consumers and export engine, with only the integration/state refinements genuinely needed for actual agent/generation producers.
- Release configuration and operating documentation for the existing web/backend/Auth/database/storage/telemetry integrations: P4-S19 deployment work, not a new application domain, inference loop or execution service.

#### Flows Delivered

- **8.1–8.3:** start/resume with authoritative creative context; develop and save drafts from supported inputs; ask and continue from exact human decisions.
- **8.4:** actual proposal → human authorization → independent provider execution → candidate result/partial outcome, using supported selected models.
- **8.5:** creator review and targeted revision with exact history/dependency effects; assistant saves never silently replace approved choices.
- **8.6:** generated chosen clips reach the existing Phase 3 export path. No new export authority or Editor is introduced.
- **8.7:** real turn interruption, request cancellation, unknown submissions, process recovery and saved report acknowledgment.
- **8.9:** additional assistant/framework/media attempts contribute available correlated usage with honest unknowns.

#### Dependencies

- Approved Phases 1–3, including actual native execution qualification, shared domain interfaces, human review/answer operations, real private media, cancellation controls and functional export. A failed native gate cannot be replaced by a mock or another unapproved runner.
- The selected native package cohort and configured assistant model must support the actual tool-call, context, question-ending, persistence and correlation behavior used here. Basic text-chat qualification is insufficient; prove these seams before dependent features rely on them.
- Select launch media providers/models, supported input modes and concrete limits during sprint packaging. Check current official contracts and sanitized real responses before writing integration-specific parsers where feasible and authorized. Enable only the qualified subset; documentation or earlier local smoke tests do not establish hosted qualification.
- Use isolated real Postgres and controlled external responses for automated tests. Separately authorized development-service calls use synthetic/licensed material, dedicated Supabase/R2 and the actual built server. Permission for this plan is not permission for such calls.
- Approve any genuinely new functional UI states before implementation, using the existing design system. Reuse Phase 3's controls instead of adding screens to manufacture tool consumers.
- Record concrete request/body/reference/output limits, provider pacing/deadlines, concurrency and subprocess bounds before enabling their paths. Bounds are technical safeguards, not user spending caps or a capacity promise.
- P4-S19 depends on accepted feature/combined-product evidence for the release build and separately authorized production targets, access/exposure settings, schema preparation, credentials and any paid smoke calls. Use authorized test accounts and synthetic/licensed material; this story does not select public-signup/invitation policy or authorize a public launch announcement.

#### Stories

Each story targets **≤5 logical commits including verification**. Split oversized stories during sprint packaging without dropping their acceptance checks. Story numbering is not a requirement to expose partial functionality: an enabled generation path requires its proposal, authority, adapter, publication, cancellation and recovery dependencies to be complete. This phase may span several sprints.

##### P4-S1 — Hosted creative-skill contracts and native integration qualification

- **What:** map the relevant local creative contracts to hosted guidance, records and tool boundaries, then qualify the native seams used by the implementation.
- **Acceptance criteria:**
  - [ ] Document each retained creative/approval rule and its hosted owner, including differences in file handling, human identity, model configuration, batch execution and usage-only scope. Do not change local skill behavior or add local package/export products. Unresolved material policy conflicts block the affected capability.
  - [ ] Complete the named skill/helper reuse map above, identifying concrete validator/provider/media helpers and meaningful test/evaluation cases with their hosted owner and reuse/adapt/local-only disposition. Preserve validation embedded in presentation helpers; shared rules remain in Phase 3's backend. Write focused hosted behavior tests for the retained contracts and run the application repository's existing regressions; do not import local test suites or treat their evidence as hosted qualification.
  - [ ] Using the actual built server/native runtime and isolated Postgres, prove guidance availability, tool-call context, structured tool results/errors, supported turn-ending behavior and stable saved-message/tool correlation with controlled providers. Qualify the configured live assistant's tool behavior through separately authorized evidence before accepting its enabled use.
  - [ ] Keep one normal agent and the existing execution mechanism. Explicitly bound guidance/context/tools, retries and model calls; keep controlled providers confined to the test harness and disable optional unobservable billable features. Editorial review checks prose mapping; executable tests prove runtime behavior, not Markdown keyword presence.
- **Commits:** ≤5.

##### P4-S2 — Authoritative next-turn context and read tools

- **What:** give the agent a bounded, owned view of current work, exact decisions, references, configured models and pending activity using existing domain queries.
- **Acceptance criteria:**
  - [ ] Derive owner/conversation from trusted native context. Supply relevant exact versions, human uses/choices, current question, configured model defaults, pending manual changes and request outcomes; fetch further owned details through narrow read tools rather than loading the entire Library/media corpus.
  - [ ] Qualify a durable turn-consumption checkpoint for change summaries. An interrupted preparation cannot lose changes; browser/context reads neither acknowledge reports nor discard unhandled changes. Refresh before material tool effects and reject stale/foreign bindings rather than relying on stale prompt context.
  - [ ] Actual native-turn integration tests cover manual edits between turns, account/conversation isolation, bounded pagination/context and malicious instructions in uploaded/Library/tool content. Data cannot supply authority, credentials, arbitrary network targets or new tools. Distinguish actual supported media inspection from metadata, prompts or user descriptions; do not claim unseen motion/audio was reviewed. No model selector for the assistant or tool that writes the creator's defaults is added.
- **Commits:** ≤5.

##### P4-S3 — Assistant draft-save tools over shared versioning

- **What:** register bounded save tools that reuse Phase 3's immutable content/version core with assistant provenance.
- **Acceptance criteria:**
  - [ ] Save schema-valid Script/reference/Shot content against expected bases, exact dependencies and a trusted operation identity. Initial saves create visible work; revisions remain unapproved and do not impersonate manual-save effects or replace pinned approved versions/selected videos.
  - [ ] Repeated execution of the same tool effect or uncertain response reconciles the original saved result without duplicate versions or replayed link effects. Stale bases and forged approval fields fail without partial writes; preserve recoverable evidence when a save succeeded before the turn was interrupted.
  - [ ] Exercise actual native tool → domain → Postgres → panel-change/refetch → workspace behavior, including a model claiming approval and a human edit racing the tool. The browser reads the authoritative version; assistant prose alone never counts as saved work.
- **Commits:** ≤5.

##### P4-S4 — Saved questions and human-answer continuation

- **What:** implement `ask` and the agent side of Phase 3's question/answer hand-off.
- **Acceptance criteria:**
  - [ ] Persist one current question with its exact version/proposal/use bindings and allowed human choices, then end the turn through the qualified native path. Guard against subsequent/parallel model tool effects bypassing that stop. Repeated calls do not create duplicate pending decisions.
  - [ ] Only the listed option on the current card answers, reusing Phase 3's authority rules. Typed messages are ordinary turns that leave the question pending; the assistant may respond by saving a new question/proposal that supersedes the old one. Model text, tool arguments, stale/superseded controls and foreign versions grant no authority. A valid revision replaces the binding without mutating an already approved snapshot.
  - [ ] Continue through the existing recoverable native notification/queue, re-reading the saved decision. Test active-turn queuing, lost notification, restart and duplicate delivery without repeating approval effects. Approving a Script or plan does not authorize a provider call whose exact proposal was never approved.
- **Commits:** ≤5.

##### P4-S5 — Idea/prose to saved, reviewed Script

- **What:** deliver the first complete hosted creative journey using the actual context, save and question tools.
- **Acceptance criteria:**
  - [ ] From an ordinary new conversation, develop one scoped video/Narrative Scene from an idea or pasted text, save a structured Script and present the actual version for review. Preserve ordered visible/audible events, dialogue and sound intent; clarify missing creative choices instead of fabricating source approval or forcing chapter metadata.
  - [ ] Reuse an appropriate human-approved Library Script without unnecessary rewriting. Revisions preserve earlier versions and require the correct new decision; script-based storyboarding is blocked until the complete relevant Script version is approved.
  - [ ] Browser/native integration tests use actual tools/persistence rather than seeded Script records. Add representative creative-quality evaluation with concrete pass/fail criteria for fidelity, observability and review boundaries; record reproducible human review where semantic judgment cannot be automated meaningfully. No generation is performed merely by saving or approving the Script.
- **Commits:** ≤5.

##### P4-S6 — Reference planning and exact approved reuse

- **What:** let the assistant prepare the visual-reference plan and identify reusable or missing material without granting itself use/disclosure authority.
- **Acceptance criteria:**
  - [ ] Save role-specific character/environment/style/prop reference descriptions and intended assignments, tied to exact owned versions where available. Preserve required views/adjoining zones of a logical environment and dedicated canonical references for continuity-relevant props; an incidental depiction or wide master cannot silently replace required coverage. Distinguish approved Library reuse, uploaded candidates and still-missing images; never invent observed visual details or silently substitute a newer version.
  - [ ] Reuse the human review/use controls for exact references and roles. A proposed reference package can remain draft while coverage is incomplete; dependent production requires its relevant approved content. Viewing, suggesting or listing an asset does not approve it or disclose it to a provider.
  - [ ] Tool/browser tests cover creation from the approved Script, reuse across conversations, missing views/coverage, conflicting incidental prop depictions, stale references and targeted changes that preserve unrelated choices. New reference-image generation proceeds through the later exact proposal/adapter path, not a hidden call inside planning.
- **Commits:** ≤5.

##### P4-S7 — Shot plans, Panel instructions and dependency-aware revision

- **What:** create the saved storyboard planning records that Phase 3 could only consume.
- **Acceptance criteria:**
  - [ ] From the exact approved Script and relevant reference decisions, save textual Shot Definitions with stable IDs/order, intended action/state progression, neighboring context, review criteria and one or more ordered Panel descriptions. Text plans, generated Panels and selected videos remain distinct.
  - [ ] Record each Panel's establishing/continuation/new-Shot/return mode, exact ordered supplied references and complete Direct/Inherited/Not-visible coverage of its Shot's canonical requirements. When conditioning on references, use one dominant approved anchor and the smallest sufficient set with property-specific responsibilities. Inherited coverage must trace through approved, non-stale Panels to the canonical reference; missing, conflicting or untraceable coverage blocks dependent generation. Reuse shared content validation rather than putting these rules only in prompts.
  - [ ] Present the real plan for human review before dependent generation. Save concise image requirements preserving required content, spatial/contact constraints, screen direction and reference roles; hand the approved continuity/coverage and preserve/change/rejection requirements to P4-S11's image preparation. Preparation is neither a paid call nor final creative approval; proposed intent changes return to the owning Shot/reference approval gate.
  - [ ] Obtain explicit approval of the complete relevant storyboard content before storyboard-driven Production; individually approved Panels are not a substitute. Check complete Script coverage, Panel descriptions versus spoken dialogue, exact dialogue/delivery, ordering and continuity against the reviewed versions. Use existing human questions/views, not a new standalone HTML deliverable.
  - [ ] Actual tool/browser tests cover initial creation, coverage validation, manual-edit conflicts, reordered/changed Shots and complete-board approval. A changed anchor invalidates affected transitive dependents; a changed Shot plan also revalidates affected sibling Panels without explicit anchor edges. Preserve unrelated work and ask about unknown impact; revalidation is not automatic regeneration. Prior-Panel conditioning requires that Panel's approved image (a `panel_image` use) to be exact and non-stale; do not batch across missing human reviews or automatically promote storyboard-local images to Library references.
- **Commits:** ≤5.

##### P4-S8 — Exact generation proposals and model resolution

- **What:** implement the initial agent-only proposal producer over the configured model defaults and the read-only human review interface.
- **Acceptance criteria:**
  - [ ] Save an immutable review snapshot with purpose/Shot or reference association, resolved provider/model, exact prompt/settings, candidate/request breakdown, ordered input versions and hashes where applicable, external disclosure and informational estimate basis or explicit unknowns. Estimate the actual submission plan; one candidate per request must not be priced as a different provider batching arrangement.
  - [ ] Validate supported capabilities, input approval/use, reference order, technical limits and current owner/lifecycle state. Defaults affect future proposals only. A change the creator types in chat produces a new proposal and question from the assistant, superseding the old card; every change requires fresh approval of the new card. No silent fallback, arbitrary provider URL, hidden count or model-selected safety-limit increase.
  - [ ] Native tool and browser tests cover correct configured-default resolution, stale/superseded answers, changed references and wrong-owner data. Creating, viewing or discussing a proposal starts no provider work; execution revalidates the exact human-approved snapshot rather than trusting model claims.
- **Commits:** ≤5.

##### P4-S9 — Authorized batches and independent native execution

- **What:** implement the agent-only generation admission/start operation and request workflows using the qualified native mechanism.
- **Acceptance criteria:**
  - [ ] Commit the approved batch, one request per candidate and stable run identities before starting work. Repeated execution against the same authority returns the existing batch, not extra calls; conflicting reuse fails. Return the durable identity and end the assistant's work without waiting or repeatedly reasoning during provider polling.
  - [ ] Recover a saved-before-start gap by checking actual native state before starting missing work. Atomically claim eligibility/save `submitting` before network submission; SDK/native retries and repeated tool calls cannot bypass it. Recovery revalidates the persisted human authority before submission; credentials alone do not authorize work. Admission and publication honor existing cancellation barriers.
  - [ ] Actual built-server/Postgres tests with controlled adapters prove creation, independent start, Stop/disconnect isolation, queued work, re-entry, lost start acknowledgment and bounded admission. No artificial public generation-submit API, second scheduler or blanket authorization for future dependent requests is added.
- **Commits:** ≤5.

##### P4-S10 — Owned result acquisition, verification and publication

- **What:** implement the shared generation-result pipeline used by image and video adapters, reusing Phase 3 storage/media mechanics.
- **Acceptance criteria:**
  - [ ] Accept bounded inline bytes or qualified provider result locations, preserve recoverable receipts/staging and acquire private owned media without leaking URLs/credentials. Validate redirects/destinations and prevent private-network access; never forward provider authorization to an output host. Expired links are refreshed only through a supported existing-task operation, not another generation.
  - [ ] Verify actual type, size, decodeability and the declared image/video contract; retain measured dimensions/timing/streams and create appropriate metadata/posters. Record discrepancies honestly, preserve available paid-output evidence under scoped cleanup rules and never present corrupt/incompatible media as a usable candidate. Originals are not silently cropped, stretched, muted or overwritten.
  - [ ] In one coordinated application transaction, guard one result version, terminal transition and batch decrement with exact request/input provenance and input validity. The result is unapproved; cancellation/failure cannot publish a success. Test repeated finalization, interrupted transfer/processing, storage failure, mismatched bytes and partial batch success through real domain/native integration.
- **Commits:** ≤5.

##### P4-S11 — Image provider execution and generated Assets/Panels

- **What:** connect the qualified image adapter(s) to exact proposals, independent requests and owned candidate publication.
- **Acceptance criteria:**
  - [ ] Implement only selected, documented and qualified image modes, including ordered approved references where supported. Handle the actual synchronous response or asynchronous task contract, bounded bodies/decoding and supported errors/usage; disable hidden SDK paid retries. Validate cardinality/settings and record requested/resolved/reported identities without inventing omitted provider fields.
  - [ ] Authorized successful calls produce actual candidate image versions at the proposal's exact target (reference role or Shot/Panel); a candidate becomes the Panel's image or an approved reference only through the human `panel_image`/`reference` use. Partial failures preserve successful siblings; failures/unknowns do not regenerate or switch providers. A newly generated reference or prior Panel requires the intervening human decision before dependent generation.
  - [ ] Carry a concise requirements brief through selective clarification, compact prompt drafting and critique/simplification before freezing the exact proposal. Applicable requirements are resolved, not applicable with a reason, or blocked by a named material question; a blocked brief cannot be called ready. Preserve approved intent and reference responsibilities without inventing constraints or mechanically truncating required content. Readiness is not execution authorization.
  - [ ] Return criterion-based findings from actual available image evidence; provider success or decoding does not establish creative quality. Distinguish a faulty approved plan from prompt/reference execution problems. Return intent changes to the parent approval gate rather than automatically adding instructions/references or retrying. If the configured assistant cannot perform a required inspection, disclose the limitation and retain human review rather than claiming a pass; qualify any enabled multimodal path and its usage/disclosure. No extra inference provider or autonomous approval is implied.
  - [ ] Cover native tool → exact human answer → provider adapter → private stored image → real browser review, plus moderation, rejection, ambiguous submission, malformed/missing results and local validation failures. Adapt meaningful preparation/inspection cases: unresolved briefs cannot proceed as ready, mandatory visual failures cannot be excused by aesthetics, and proposed plan changes return for review without a paid retry. Add separately authorized hosted-provider response/usage evidence and image/private-access checks for the enabled contract; distinguish observed behavior, semantic review and controlled fixtures.
- **Commits:** ≤5.

##### P4-S12 — Shot-video planning and capability constraints

- **What:** translate approved Shot intent and Panels into a reviewable, supported video request without weakening the storyboard to fit an adapter.
- **Acceptance criteria:**
  - [ ] For storyboard-driven Production, require the exact complete-storyboard approval from P4-S7, not just individual Panel decisions. Preserve the complete ordered Panel progression and exact approved endpoint/reference roles. State requested duration, framing/motion/audio intent, supported conditioning strategy and measured-output tolerances/disclosures needed for the selected model; planning approval alone is not paid-call authorization.
  - [ ] Check declared capability from text/metadata before preparing provider-input media. Do not read/decode those input bytes for an already-known unsupported strategy. Do not treat appearance references as timed keyframes, submit a storyboard sheet as an individual Frame, drop an intermediate required state or invent a cut. If the selected adapter cannot express required control—such as three or more timed Panels on an endpoint-only model—stop and propose an explicitly reviewed supported alternative or revised Shot/Panel plan.
  - [ ] Integration/evaluation cases cover text-only and supported image-conditioned planning, missing/stale complete-board or input approvals, incompatible staging, unsupported timing/audio requests and model changes. A known unsupported request must stop before provider-input byte reads or provider calls. Do not promise identity, exact motion, dialogue fidelity or audio quality from capability documentation; no separate audio tool or automatic fallback is added.
- **Commits:** ≤5.

##### P4-S13 — Video provider execution and candidate Takes

- **What:** execute the approved Shot-video proposal through selected adapters and publish verified candidate video versions.
- **Acceptance criteria:**
  - [ ] Implement the actual submit/status/result/cancel capabilities, saving real task identities before resumable polling. Use bounded provider-aware waits/deadlines and same-task result recovery; absent remote cancellation or status capabilities remain explicit. Preserve exact Script/storyboard/Shot/Panel/model/request provenance.
  - [ ] Own and validate actual returned video through P4-S10, recording requested versus measured duration, geometry/frame rate and embedded audio. Provider success is not publication or creative selection. Native audio remains original clip audio; no separate generation/mixing or unsupported voice/temporal-control claim.
  - [ ] Present playable Takes against their exact approved Shot intent, creative/technical criteria and neighboring selected-clip continuity. Record specific findings and creator feedback through existing questions/selection controls. Replacing a Take reopens affected neighboring review while preserving unrelated choices; it does not trigger automatic regeneration or selection. Technical export success is not continuity or final-film approval, and no new export-eligibility gate or exception-management UI is added.
  - [ ] Tool/browser tests cover the supported modes, success/partial failure, moderation, lost submit response, unavailable/expired task/result, timeout, delivery mismatch and affected neighboring review after Take replacement. Obtain separately authorized hosted-provider shape/usage and real playback evidence; human review uses motion and sound, not posters alone. Preserve originals and use Phase 3's explicit choice controls.
- **Commits:** ≤5.

##### P4-S14 — Saved outcome reports and real workspace updates

- **What:** complete the real producer → workspace and batch outcome → saved assistant report paths.
- **Acceptance criteria:**
  - [ ] Persist each terminal outcome and batch readiness before notification. Actual tools/workflows emit qualified short change notices; the browser refetches authoritative content and uses bounded active-work polling/reconnect. No panel snapshots or invented progress are streamed as product truth.
  - [ ] Reconcile pending outcomes into short normal-agent turns, queuing behind an active turn. Reports accurately distinguish saved candidates, failures, cancellations and unknowns and reference exact outcomes. Acknowledge only after a correlated native assistant report is durably saved; a read, signal, empty/unrelated message or stream completion is insufficient.
  - [ ] Real native/Postgres tests kill before/after report save and before acknowledgment, lose notifications and repeat delivery. Reconcile saved history before another attempt; no lost logical report or repeated approval/publication. Unavailable or failed report inference cannot falsely acknowledge the pending report. Real extra model calls remain distinct usage attempts rather than an exactly-once inference claim.
- **Commits:** ≤5.

##### P4-S15 — Cancellation and uncertainty with actual generation

- **What:** connect Phase 3's human cancellation controls to real adapter behavior and finalization races.
- **Acceptance criteria:**
  - [ ] Cancel queued/submitting/running requests through guarded local transitions and supported native/provider operations. Report local cancellation separately from remote status/charge uncertainty. Known accepted tasks are not resubmitted; ambiguous submission stays `outcome_unknown` unless actual evidence resolves it. Any replacement needs a new exact approval.
  - [ ] Exercise cancel-versus-submit, cancel-versus-result/publication and timeout races. Revalidate authority/input validity at the appropriate guarded boundaries; late responses/transfers cannot create a result, another batch decrement or a new turn for a cancelled request.
  - [ ] Ordinary upstream edits/new choices preserve captured provenance and expose affected/stale work rather than silently retargeting a running request. Preserve successful unrelated candidates, existing chosen videos and completed exports. Real remote-cancel qualification is required where supported; controlled races prove local safety and never claim stopped provider charges.
- **Commits:** ≤5.

##### P4-S16 — Generation crash recovery and resource bounds

- **What:** qualify the actual built-server generation lifecycle under process replacement, re-entry and constrained resources.
- **Acceptance criteria:**
  - [ ] Kill/restart around saved intent/native start, submission before/after provider receipt, polling, owned-object acquisition, finalization and pending report acknowledgment. Reuse the same known task/results; unreceipted submissions are not blindly retried. Assert no stranded start intent, duplicate candidate, double decrement or late publication.
  - [ ] Bound active calls, polling frequency/deadlines, downloads, response bodies, temporary storage and media processing across generation and existing exports. Test overload/backpressure and shutdown with the single serving instance; waiting jobs do not keep an LLM active or hold a database transaction/connection across remote waits.
  - [ ] Run real native workflow/process/Postgres tests with faithful controlled external behavior, plus bounded separately authorized provider/service recovery checks where feasible. Document untestable remote behavior and fail closed where needed; mocks, source inspection and local-skill tests cannot replace the actual native recovery gate. No account-capacity or zero-downtime claim.
- **Commits:** ≤5.

##### Deferred Phase 4 story (P4-S17)

Cross-path usage completeness, aggregation and internal totals are deferred by explicit user decision. Each enabled integration still records its own per-attempt usage with provenance and honest unknowns under its owning story (P3-S1, P4-S11, P4-S13, P4-S14); no completeness proof, totals query or dashboard is part of this release.

##### P4-S18 — Complete MVP acceptance

**Closing amendment:** approved by the user after presentation; this retains the existing acceptance story and absorbs the remaining combined-product checks, not feature implementation or a new QA phase.

- **What:** demonstrate that the real agent producers drive the ordinary product, every enabled path has its feature-level evidence, and remaining combined-path coverage is complete for the declared supported MVP.
- **Acceptance criteria:**
  - [ ] A real browser journey starts with an ordinary empty conversation, creates/reviews a Script, references and Shot/Panel plan through actual tools, authorizes image/video work, reviews candidates and explicitly chooses clips. No seeded creative/proposal/request records substitute for these producers. Include focused pasted-text, upload and Library entry/reuse journeys without forcing unnecessary stages.
  - [ ] Pass chosen generated and uploaded clips through existing Phase 3 playback/export and download/decode a real MP4; verify order, geometry, duration and existing audio. Close the declared supported model/media compatibility matrix, including compatible mixed generated/uploaded clips and clear rejection of incompatible ones. Reuse feature evidence and add missing combinations; do not repeat every test, claim universal format support or postpone an adapter's first functional proof to this story.
  - [ ] Exercise targeted revision, stale/superseded approvals, configured model defaults, partial results, interrupted turns, cancellation, restart and saved reports using actual product paths. Include relevant combined generation/export activity, account/conversation switching and cancellation races, reusing feature-level recovery tests rather than creating another execution harness. Keep controlled-provider automation, actual service observations and human creative/visual review evidence distinct; outstanding required live qualification is not a pass.
  - [ ] Update the surface/capability and verification inventory: actual consumer, owner, enabled model/mode, authority checks, functional/recovery proof, private-data/usage safeguards and known restrictions. All Phase 4 producers promised to Phase 3 are present; no public route/tool is retained solely for a test. Required repository suites, whole-workspace desktop/narrow keyboard/focus/loading/error states and relevant Phase 3 regressions pass. Fix gaps with their owning functionality; P4-S19 receives an accepted build, not unfinished features.
- **Commits:** ≤5.

##### P4-S19 — Production deployment and operating handoff

**Status:** approved for planning as part of the presented closing amendment. Actual implementation, production actions and paid checks still require separate authorization.

- **What:** deliver the reviewed, verified MVP at its intended hosted URLs using the selected Cloudflare static frontend, one Railway backend, Supabase Auth/Postgres and private R2, with deployment-specific evidence and a usable operating handoff.
- **Acceptance criteria:**
  - [ ] After explicit authorization of target resources and exposure, deploy the exact reviewed build and perform reviewed application/native-store schema preparation through supported mechanisms. Record build/commit identity and deployed targets. Keep serving database privileges restricted and setup privileges separate; do not modify native-owned schemas by hand, introduce a second server/runner or require a new CI/CD platform. Planning approval alone is not deployment permission.
  - [ ] Verify deployed configuration: server-only secrets, correct API origins/Auth redirects/private-R2 access and CORS, qualified model mappings, production exclusion of test-only providers/controls, and the required configuration for qualified model integrations. Apply the already qualified pool/concurrency/media/shutdown limits and verify existing readiness/error-reporting integration with sanitized evidence. Credentials alone cannot start paid work; do not add signup/invitation administration, billing or new feature behavior here.
  - [ ] Run bounded automated browser/API smoke checks against the actual deployed URLs using authorized accounts and synthetic/licensed material. Prove authentication, intended API access, private upload/playback/download and a representative saved-work-to-export path. Verify production wiring of enabled AI integrations only through separately authorized live calls/exact media proposals, with outcomes and usage correlation; no production fake provider, seed endpoint or automatic replacement on uncertainty. This is environment-specific smoke coverage, not a rerun of the entire feature matrix. Tie passing existing/feature suites to the released build; failed, unrun or unauthorized required checks remain non-pass.
  - [ ] Hand over reproducible deployment/configuration, bounded stop/start/redeploy, diagnosis and recovery instructions, release evidence and known supported limits. Demonstrate the intended startup/shutdown procedure with a single executing backend; do not assume overlapping workers or zero downtime. Retain saved work and task identities across the qualified restart path, never wipe them or blindly resubmit to repair a release. If deployment or verification fails, report the actual state and follow the documented stop/recovery procedure rather than claiming release success.
- **Commits:** ≤5, including verification. Split only if concrete sprint packaging demonstrates that this bounded deployment story exceeds the existing story-size rule; do not recreate a generic QA phase.

#### Open Questions and qualification work

Concrete dependency versions, launch media providers/models, exact technical limits and unseen UI details remain the previously approved sprint-packaging/qualification work, not assumed runtime facts. Record selections before dependent implementation; obtain separate design/live-service and production authorization where applicable. A capability that fails a required gate stays disabled and blocks acceptance of that promised capability rather than being silently substituted or deferred to a later QA phase.

The synchronous/asynchronous adapter distinction makes the existing generic background diagram precise for different real APIs; it does not add a new execution mechanism or relax uncertain-submission safety. The local-skill mapping similarly preserves creative authority while adopting the already approved hosted scope, rather than promising that the local workflows run unchanged.

#### References

- [Architecture and interfaces in this spec](#4-architecture) · [phase sequence](#10-phases) · [approved Phase 3 operation/dependency inventory](#phase-3--frontend-capabilities-and-shared-backend).
- [Architecture](../architecture.md) · [canonical terminology](../../CONTEXT.md) · [design guide](../design/design.md) · [Generate flow references](../design/generate-flows.html).
- [Scene Script skill](#source-contract-references) and [schema](#source-contract-references).
- [Storyboard skill](#source-contract-references), [reference-package contract](#source-contract-references), [storyboard contract](#source-contract-references) and [panel strategy](#source-contract-references).
- [Image skill](#source-contract-references), [prompt preparation](#source-contract-references) and [OpenAI response/authorization reference](#source-contract-references).
- [Video skill](#source-contract-references) and [MiniMax V2 capability/response reference](#source-contract-references). These are candidate adapter evidence, not launch-provider selection or hosted-runtime qualification.
- [Production skill](#source-contract-references) and [production record/change/recovery contract](#source-contract-references). Hosted use does not inherit its local spend fields, CLI execution or portable review/handoff product.
- [Mastra request context](https://mastra.ai/docs/server/request-context) and [model-provider documentation](https://mastra.ai/models/providers); verify selected-cohort APIs rather than treating documentation or old source inspection as executable proof.

#### Done When

The final acceptance/release additions are approved for planning; all gates below remain implementation requirements, not completed work.

- [ ] Actual agent producers and thin tools drive the already implemented frontend/shared backend, with no duplicate business logic, human-authority impersonation or artificial product surfaces.
- [ ] Script/reference/Shot/Panel workflows preserve exact creative decisions and produce saved reviewable work from ordinary inputs; dependent stages do not skip required human approvals.
- [ ] Enabled image/video paths execute only exact authorized snapshots and produce privately owned, technically verified, unapproved candidates. Selected capabilities have actual hosted-provider evidence and honest limits; no silent substitution or blind paid retry.
- [ ] Native independent execution, next-turn context, real workspace updates, partial outcomes and saved-report acknowledgment pass their actual integration/recovery gates. Stop, disconnect and request cancellation remain distinct.
- [ ] Cancellation races, input invalidation and late-publication suppression are verified with real generation paths; successful unrelated work and independent completed exports remain intact.
- [ ] Usage covers enabled native/media attempts with provenance and unknowns; bounds and production exclusion of test-only providers/controls are verified. No spending/billing or parallel-runner scope has appeared.
- [ ] Real browser journeys use the agent producers and generated-media-to-export path; feature-specific and remaining combined-product compatibility, failure, service, security/data, creative-review, visual/accessibility and regression evidence is recorded under the owning stories and P4-S18. No separate QA phase or deferred feature proof remains.
- [ ] Under separately granted production/live-call authorization, the exact reviewed MVP is deployed to its intended hosting, deployment-specific smoke checks pass and the operating/recovery handoff is complete. An undeployed build, missing authorization or unrun required smoke check does not satisfy the final release deliverable.

---

*Created: 2026-10-26*
