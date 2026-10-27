# Sprint 001 — Backend foundation and native-runtime qualification

**Date:** Planning approved 2026-10-27; execution is not scheduled and ends only when the completion gates pass.
**Goal:** From a clean application checkout, build and start one authenticated native backend and a typed client, pass real-Postgres conversation and process-recovery checks, and demonstrate that unfinished product operations return validated, side-effect-free not-implemented responses.
**Status:** 🟡 Planning

---

## Handoff

### Project Context
- **Repo:** Workprint; every command/path below is relative to its root. The user authorized publication of the spec and sprint plan. Application implementation has not been authorized or started.
- **Tech stack:** TypeScript, pinned Node/pnpm workspaces, React/Vite shell, one Mastra server/runtime with its supported Postgres integration, Supabase Auth, plain `pg`, strict type/lint/dependency-cruiser checks. Docker supports isolated Postgres tests. Select a coherent exact package cohort in Story 1 and qualify it in Stories 2–3 before dependent contracts are finalized.
- **Current state:** No hosted application code or inherited tests. The source repository's local Pi tools and 313 Node + 7 Python tests remain there; none is imported, counted as an application baseline, or treated as hosted proof. No live assistant/media integration is qualified by this sprint.
- **Implementation spec:** [Implementation Spec 001](../specs/implementation-spec-001.md), especially §§4–7 and Phase 1, P1-S1–S5. The fresh-repository baseline applies; older source-checkout assumptions do not require importing local code/tests.

### Sprint-Wide Context
- **Sprint type:** Mixed — application foundation / tooling / native-integration qualification.
- **Shared context:** Five implementation stories map one-to-one to P1-S1–S5, followed by final verification. Scope and proposed verification groups V1–V10 were individually approved in planning; no implementation AC or runtime check is completed by that approval. Work sequentially, with each story independently reviewed and no more than five logical commits including verification.
- **Non-goals:** Full workspace UI; creative agent skills/tools; Artifact business persistence/editing/approval; uploads/private-media integration; image/video generation; export; exact launch-model qualification/live inference; deployment or CI/CD changes; billing/spending controls; deletion; model selectors; importing old tests. No parallel HTTP server, scheduler, agent loop, conversation store or fake product lifecycle.

**Application model direction:** the user selected Meta's Muse model family. Verify exact assistant/image/video model IDs, capabilities and API contracts with their owning integration stories; this is not a claim that any Muse path is already qualified. The user will supply the API key through the new repository's ignored `.env` after the move, using the provider's verified server-only configuration name. Do not put keys in source, browser configuration, prompts or logs. Sprint 001 uses harness-supplied controlled providers and makes no live AI calls; credentials do not replace paid-call authorization.

**Planning handoff:** the spec and sprint plan are versioned alongside public product/architecture/design references; research and original local-skill sources are not included. Obtain required source material from the maintainer before dependent adaptation. The original 5/5 verdict predates migration and the user-directed configuration simplification; it is historical, not a verdict on this revision. At execution, record the actual baseline/checks; zero inherited tests is not permission to discard checks added since planning.

Before Story 2, separately authorize dedicated development Supabase access, two existing authorized test identities, supported native/schema preparation and private configuration. Account provisioning remains outside the app. Automated persistence tests use isolated real Postgres, not shared development/customer records. Setup privileges never become the serving connection. Missing access or failed native qualification blocks dependent acceptance; it is not a reason to mock identity/persistence away. R2 access and paid AI calls are not prerequisites for this sprint.

**Incremental initial structure:** use the spec's names and dependency direction, but introduce each path only when the owning story puts real content there.

```text
repository-root/
├── apps/
│   ├── web/src/                  # Story 1: minimal buildable shell only
│   └── api/
│       ├── src/
│       │   ├── mastra/           # Stories 1–3: one entry/server, Auth and workflow wiring
│       │   ├── agent/mastra/     # Story 2: supported Agent/conversation bindings
│       │   ├── db/               # Stories 1–2: setup/connection/transaction mechanics
│       │   └── application/      # Stories 4–5: named operations and unavailable boundaries
│       └── test/                 # Stories 2–3: shared native/process qualification fixtures
├── packages/
│   ├── api-client/               # Story 2: native transport; Story 5: application transport
│   └── contracts/                # Story 4: browser-safe application schemas/errors
├── docs/
│   ├── specs/
│   └── sprints/
└── scripts/                      # Only actual setup/check helpers needed by commands
```

Root manifests, lockfile, safe environment examples and compiler/lint/boundary configuration accompany their owners. Colocate narrow tests with their implementation; `apps/api/test/` owns process/native/cross-boundary qualification, not all future tests. Add `supabase/` only for actual application-owned schema/setup content; native tables are initialized through supported native mechanisms, not edited by application migrations. Test-work intent tables belong to isolated qualification fixtures, not a production generation schema. Do not precreate empty `artifacts`, `generation`, `exports`, `usage`, `model-catalog`, `storage`, `player` or root cross-app `test/` folders. Catalog future owners now; create their source modules when an actual implementation needs them. Documentation such as the surface catalog and native qualification record is added by its owning story, not as an empty transfer inventory.

### Affected Flows
- **Existing flows affected:** Spec §8.1 conversation start/resume and §8.7 Stop/disconnect/recovery gain internal platform qualification, not a finished creator-facing flow. The API boundaries for §8.2–8.6 and request cancellation are callable but unavailable; §8.9 remains a later real-integration obligation. The source repository's local skill workflows are unchanged.
- **New flows introduced:** Fresh-checkout application development, validated provider configuration, isolated native-runtime qualification and scripted client-to-backend calls. These are the spec's Phase 1 developer flows; no new product flow or approval authority is introduced.

### Verification Strategy

For executable behavior (code, config/scripts, and actual machine-consumed contracts or workflows), define functional and relevant regression proof before implementation. Policy/workflow prose alone is not proof of executable behavior. For descriptive-only docs/design prose, record functional and regression N/A with rationale and use editorial review for accuracy/completeness/consistency. Do not add persistent prose/heading assertion suites. Keep applicable existing checks and design visual/safety/consistency/approval checks under the design skill.

Verification has two categories:
- **Functional verification:** proof of executable behavior introduced or changed by this sprint, or justified N/A for descriptive-only work.
- **Regression verification:** proof of relevant existing behavior, or justified N/A for descriptive-only work.

Each implementation story must include functional verification for executable behavior it delivers and targeted regression verification for existing behavior at risk, or justified N/A for descriptive-only scope. The Final Verification Story runs all applicable sprint functional verification plus the full available existing regression suite. Reusable functional checks become future regression checks; one-off editorial review is evidence, not a persistent suite.

**Lean coverage contract:** each test must name an observable behavior or credible failure it protects. Use the cheapest effective independent boundary, not a mandated test pyramid or a test-count/coverage-percentage target. Reuse fixtures and parameterized cases; do not repeat equivalent proof at unit, service and HTTP layers. Small unit/schema tests are appropriate only for distinct branching rules or failures not adequately covered by the boundary checks. Do not require production exports/flags solely to inspect private implementation details. Meaningful configuration, public-contract, security and architecture checks remain valuable even when static.

**Approved coverage groups — planned, not run:** these are ten proof groups, not ten test files/cases. Exact implemented case counts are recorded during execution, without count-filling or double-counting a case referenced by several stories.

| ID | Essential proof | Owner / canonical type |
| --- | --- | --- |
| V1 | Clean frozen-lockfile installation, build and startup work without hidden files or automatic inference | Story 1; E2E / smoke |
| V2 | Missing/invalid provider configuration fails before calls; test providers/controls stay test-only; secrets stay private | Stories 1–2; Security / dependency |
| V3 | Real Auth/account isolation and intended route exposure; serving credentials cannot prepare schemas | Stories 1–2, extended in Story 5; Security / dependency |
| V4 | Actual native history, streaming, queued input, reconnect without replay and interrupted-versus-saved completion | Story 2; Integration / contract |
| V5 | Tool-started independent work survives exact-turn Stop and observer disconnect | Story 3, using Story 2's turn-scoping proof; Integration / contract |
| V6 | Real process death after saved intent but before start recovers the same work without an extra logical run | Story 3; Integration / contract |
| V7 | Waiting/restart, step re-entry, explicit cancellation and terminal failure have honest observable outcomes | Story 3; Integration / contract |
| V8 | Configured concurrency, deadlines and capacity release work; no application transaction spans external waits | Story 3; Performance / load — bounded safety, not a capacity benchmark |
| V9 | Shared schemas and actual typed-client/server wiring reject invalid input and return truthful side-effect-free unavailable/error outcomes | Stories 4–5; Integration / contract |
| V10 | Strict types, lint and enforced import/dependency boundaries remain clean | Story 1, retained throughout; Static / local checks |

Use the real built backend, actual native runtime and isolated real Postgres where those boundaries are under test. A controlled model provider uses supported native interfaces to produce deterministic responses/streams/errors/tool calls and record calls; it is not a fake conversation store or an alternate application. Harmless controlled external work exercises workflows, not finished generation/export. Qualification registration, barriers and fixtures remain test-only composition around the built runtime; production does not import or expose them. Missing provider configuration or unbuilt assistant functionality returns an explicit error, never pretend assistant replies. Config rejection needs no live model call; actual provider compatibility and response quality are not claimed.

**Planned command interface:** Story 1 introduces `pnpm install --frozen-lockfile`, `pnpm db:prepare`, `pnpm dev`, `pnpm build`, `pnpm check`, `pnpm test`, `pnpm test:smoke` and `pnpm test:security`. Story 2 adds `pnpm test:native`; Story 3 adds `pnpm test:workflow`; Story 4 adds `pnpm test:contracts`, extended by Story 5. These names are planned deliverables, not currently runnable commands. `pnpm test` discovers/runs all implemented application tests; focused commands select the same tests, not duplicate suites. Prefer `node:test` with compiled TypeScript and existing compiler/build tools unless a specific documented need justifies another dependency. Test startup fails clearly on missing prerequisites; required checks are not silently skipped.

Record exact versions, setup/serving roles, native interfaces, connection mode, configuration, supported limits and observed outcomes in `docs/native-runtime-qualification.md` as Stories 1–3 establish them. Story 4 owns `docs/api-surface.md`; schemas/native types remain the executable source of contract shapes. Story PRs record tested revisions, exact commands, case names/results and redacted evidence locations; logs go to temporary or ignored storage, never private tokens/creative data. No account-capacity, exactly-once external execution or deployed-production claim follows from this sprint.

**Excluded extra suites:** visual snapshots/accessibility journeys for the unbuilt UI; creative-quality/model evals; media/provider/export tests; production load benchmarks; framework-internal tests; documentation wording/folder inventories; incidental source snapshots and duplicate wrapper tests. Feature owners add relevant proof when those features exist. Final verification reuses this sprint's tests rather than building another acceptance harness. No manual-only behavior verification is planned; explanatory documentation still receives editorial review.

### Stories
**Constraints:** Five implementation stories, then Final Verification. Each is independently reviewable and verifiable, targets at most five logical commits including verification, and merges sequentially. An essential native gap stops dependent work for a bounded approved decision; it is not permission to grow a second runner or defer required proof.

#### Story 1: Application and development foundation
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — initial independent sprint-doc review on 2026-10-27 returned 5/5, with no per-story or cross-story findings.
  - Resolution: N/A — no findings to resolve. Planning readiness only; implementation and verification remain unperformed.
- **As a** developer, **I want** reproducible application setup and safe defaults, **so that** native qualification starts from a real, bounded foundation.
- **Dependencies:** Approved repository/document handoff and separate implementation authorization; maps to P1-S1.
- **Acceptance criteria:**
  - [ ] S1-AC1: Pin a compatible Node/pnpm/TypeScript/web/native package cohort and deterministic lockfile. The minimal web and single native backend build/start using the documented root commands; no second server or empty future-domain scaffolding is introduced.
  - [ ] S1-AC2: Validate required provider configuration and keep secrets server-side. Test providers and qualification controls remain test-harness-only. Do not require R2/media credentials for absent features. Imports/builds/startup perform no inference or paid work merely because credentials exist. Native error handling is qualified in Story 2.
  - [ ] S1-AC3: Provide safe environment examples and reproducible isolated-Postgres setup/teardown, with explicit target isolation and separate setup/serving credentials. `db:prepare` uses supported native initialization and application-owned mechanisms; no direct native-schema edits or shared/customer database reset. Document privately supplied Supabase prerequisites for Story 2.
  - [ ] S1-AC4: `pnpm check` runs strict types, lint and dependency-cruiser. Enforce no cycles, upward/private imports, browser/server leakage or production imports of test fixtures; `application` must not import `agent`, either Mastra integration subtree or assembled bootstrap. Record each added dependency's purpose and run the package manager's dependency audit, recording unresolved findings rather than suppressing them.
- **Functional verification:**
  - [ ] V1 — `pnpm test:smoke`: in a clean temporary checkout/export, install from the frozen lockfile, build, prepare isolated storage and start the built shell/backend with valid nonproduction configuration. Pass only when both respond within a bounded startup deadline, no untracked source is required, the lockfile is unchanged and no model/provider work occurs. Close processes and remove only fixture-owned resources.
  - [ ] V2/V3 foundation — `pnpm test:security`: cover missing/invalid required provider configuration and production exclusion of test providers/controls without live calls. A harmless server-secret sentinel stays out of built browser assets, returned errors and captured logs. Setup can prepare stores; serving credentials cannot perform privileged schema setup. These are foundation checks, not completed native error-handling/Auth proof.
  - [ ] V10 — `pnpm check`: zero type/lint/boundary failures. During rule setup, temporary representative forbidden imports must fail for the intended boundary; remove controls afterward. Do not test compiler internals or freeze source text.
- **Regression verification:**
  - [ ] S1-RV1: Inventory the actual new repository baseline before changes and run any checks already present. If it is the approved empty application baseline, record `N/A — no pre-existing application behavior/tests`; do not import or count the source skill suite. Re-run V1/V2/V10 after the complete foundation change to protect its setup/configuration paths.
- **Editorial/design verification:** Review README/setup instructions against actual commands and observed versions/privileges; record evidence in the story PR and native qualification record. No new product visual design is accepted by a blank buildable shell.
- **Manual-only behavior verification:** N/A — setup, configuration, privilege and build checks are automated.
- **Planned commits:**
  1. Pinned workspace and minimal web/native backend build/start configuration.
  2. Safe environment handling, supported database setup and isolated verification fixtures.
  3. Smoke/security/static checks and reproducible development instructions.
- **Technical notes:** Root commands may use narrow real helpers under `scripts/`; no generic setup framework is required. Keep schema initialization separate from serving. Select exact versions here rather than treating past registry research as a tested cohort. Tests and examples contain no real credentials.

#### Story 2: Authenticated native conversation proof
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — initial independent sprint-doc review on 2026-10-27 returned 5/5, with no per-story or cross-story findings.
  - Resolution: N/A — no findings to resolve. Planning readiness only; implementation and verification remain unperformed.
- **As a** developer, **I want** authenticated persisted conversations through supported native interfaces, **so that** later frontend wiring relies on proven identity, history and turn behavior.
- **Dependencies:** Story 1 and separately authorized development Supabase/test-identity access; maps to P1-S2. The thin native portion of `api-client` starts here; Story 5 extends it rather than inventing another transport.
- **Acceptance criteria:**
  - [ ] S2-AC1: One assembled Mastra instance exposes supported create/list/load/history/send/queue/subscribe/Stop interfaces through the typed native client adapter. Supabase verification supplies trusted account/conversation context; no browser-supplied owner claim, duplicate conversation store or custom stream protocol.
  - [ ] S2-AC2: With actual built server/native storage and controlled model responses, saved history reloads, responses stream and input queues without loss/duplication. Reconnection observes existing work without resending. Interrupted output is distinguishable from saved completion; Stop names the exact turn and a delayed old-turn Stop cannot affect a newer one.
  - [ ] S2-AC3: Missing provider configuration or unavailable assistant functionality returns an explicit error before provider calls and settles the client without exposing credentials. Controlled providers are supplied by the test harness, not the ordinary application; unqualified optional billable features stay disabled.
  - [ ] S2-AC4: Missing/invalid/expired authentication and foreign conversation references are rejected without data exposure or mutation. Only intended native/product/operational routes are reachable; framework administration/direct tool execution and qualification controls are unavailable in production configuration. Record actual APIs, pooling choice, statuses and limits in the native qualification record.
- **Functional verification:**
  - [ ] V2/V3 — extend `pnpm test:security` over the real built server, supported Supabase verification and isolated Postgres using two authorized test identities. Pass when valid owned calls work, invalid/foreign calls fail, missing/invalid provider configuration causes no provider calls, secret sentinels remain absent from outputs, and unintended routes/test controls are inaccessible. Use real platform records and actual verification, not an injected trusted identity bypass.
  - [ ] V4 — `pnpm test:native`: create/send/stream, queue while a controlled turn is active, reload history, interrupt and reconnect through the native client. Assert correct saved identities/order, no reconnect resend and honest interrupted-versus-completed state. Verify exact-turn Stop including the old-turn/new-turn case; independent-work isolation is added in Story 3.
- **Regression verification:**
  - [ ] S2-RV1: `pnpm test:smoke`, the retained foundation cases in `pnpm test:security`, and `pnpm check` still pass after Auth/native storage/client integration. New identity requirements must not enable model calls at startup or leak server configuration into the web build.
- **Editorial/design verification:** Compare recorded native APIs/error mapping/exposure with executable evidence; distinguish controlled native qualification from real-model compatibility and from later browser sign-in/reset UI. Evidence: story PR and `docs/native-runtime-qualification.md`.
- **Manual-only behavior verification:** N/A — native/Auth/client behavior is automated; obtaining authorized development access is a prerequisite, not a manual test substitute.
- **Planned commits:**
  1. Supported Auth/context/native-storage integration and restricted server exposure.
  2. Thin native client transport, controlled provider fixture and conversation/Stop proof.
  3. Admission/isolation security checks and the qualified interface record.
- **Technical notes:** The configured model interface is connected to a deterministic test provider, not a live paid model. Standard existing-account email/password/reset remains the product Auth choice; do not add account administration or a custom auth service. Use supported native observations, not mutations of Mastra-owned tables. Test-only composition must exercise the same built runtime paths without becoming another application.

#### Story 3: Independent native work and process recovery
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — initial independent sprint-doc review on 2026-10-27 returned 5/5, with no per-story or cross-story findings.
  - Resolution: N/A — no findings to resolve. Planning readiness only; implementation and verification remain unperformed.
- **As a** developer, **I want** independent native work to survive turn interruption and process replacement, **so that** later generation/export can use one qualified execution owner.
- **Dependencies:** Stories 1–2, including actual native/Auth/Postgres proof; maps to P1-S3. Failure blocks dependent contract acceptance.
- **Acceptance criteria:**
  - [ ] S3-AC1: A test-only native tool saves a small work intent/stable run identity, starts an independent workflow and returns without waiting for it. Stopping the still-active assistant turn or disconnecting observation does not cancel that workflow. Explicit workflow cancellation remains separate.
  - [ ] S3-AC2: Killing the actual built process after the intent commits but before native start, then restarting/reconciling, recovers that same work. Repeated reconciliation creates no extra logical run and leaves no stranded intent; use actual saved native state and supported start/recovery interfaces.
  - [ ] S3-AC3: Waiting/restart, step re-entry, explicit cancellation and terminal external failure have observable native/application outcomes. Demonstrate the narrow guarded effect needed when a test step repeats and record the actual re-entry behavior; no exactly-once provider claim or finished generation/publication system.
  - [ ] S3-AC4: Record and enforce concrete test-work concurrency, external-wait deadlines and shutdown/cleanup bounds before enabling qualification. Excess work is explicitly queued/rejected, stalled work terminates visibly and capacity becomes available again. No application transaction/connection spans the external wait.
  - [ ] S3-AC5: One native execution owner passes the required cases without a parallel scheduler/runner. An essential incompatibility is recorded with reproduction and blocks dependent work until a simpler supported solution or the spec's conditional pg-boss replacement receives approval; it is never silently added alongside native workflows.
- **Functional verification:**
  - [ ] V5 — `pnpm test:workflow` starts a workflow through an actual controlled tool call while the turn remains active, then tests Stop and observer disconnection separately. Pass only when the turn/observer ends as intended, the independently started work finishes under its existing identity, and disconnect sends neither Stop nor cancellation.
  - [ ] V6 — the same command kills the built server at a deterministic test-harness barrier after durable intent commit/before native start. Restart and repeat reconciliation; assert the same intent/run completes without extra logical runs. An in-process thrown exception or mocked database is not this proof.
  - [ ] V7 — reuse that harness to restart during a native wait, exercise step re-entry, explicitly cancel work and inject a terminal controlled external failure. Pass when saved work is recovered, repeated test effects are guarded and cancellation/failure remains visible rather than hanging or becoming false success. Record supported statuses and repeat behavior.
  - [ ] V8 — with a small recorded concurrency limit, submit more controlled work than the limit and stall one operation. Assert the active limit, explicit excess-work disposition, deadline outcome, capacity reuse and absence of an application transaction held during the wait. This bounded safety scenario is not a load benchmark or a production-capacity promise.
- **Regression verification:**
  - [ ] S3-RV1: `pnpm test:native`, `pnpm test:security`, `pnpm test:smoke` and `pnpm check` still pass with workflow registration/recovery. In particular, exact-turn Stop, missing-configuration rejection and production exclusion of qualification fixtures remain intact.
- **Editorial/design verification:** Record versions, native observations, required application safeguards, selected bounds and unsupported cases in the story PR and native qualification record. Explicitly separate framework proof from later media submission/publication/cancellation safety.
- **Manual-only behavior verification:** N/A — process kills, waits, failure/cancellation and bounded-resource cases are automated.
- **Planned commits:**
  1. Small qualification workflow/tool and isolated durable intent fixture over the built runtime.
  2. Stop/disconnect and saved-before-start recovery checks with narrow reconciliation.
  3. Waiting/re-entry/cancel/failure and bounded-resource checks, plus qualified limits/evidence.
- **Technical notes:** Use one reusable process/Postgres harness with synchronization barriers, not arbitrary sleep-based crash timing or a second execution engine. Fixture SQL/state is isolated and never exposed as a production scenario API. Production composition does not import fixture tools, fake work or barriers. Do not implement Generation Requests, media adapters or export under this story.

#### Story 4: Closed surface catalog and shared contracts
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — initial independent sprint-doc review on 2026-10-27 returned 5/5, with no per-story or cross-story findings.
  - Resolution: N/A — no findings to resolve. Planning readiness only; implementation and verification remain unperformed.
- **As a** developer, **I want** closed, shared interfaces with genuine consumers and explicit authority, **so that** the frontend and later agent capabilities do not invent competing APIs.
- **Dependencies:** Stories 1–3 and their qualified native interface record; maps to P1-S4. Native gaps are resolved before freezing dependent contracts.
- **Acceptance criteria:**
  - [ ] S4-AC1: `docs/api-surface.md` maps every spec §4 v1 application operation and intended native/tool/internal operation to owner, genuine caller, flow, input/output schema/native API, authorization, errors, idempotency and implemented/unavailable/test-only status. Internal helpers/tools do not acquire browser routes merely to appear in the inventory. No widening/removal of the spec's operations.
  - [ ] S4-AC2: Browser-safe `contracts` defines closed application requests/responses/errors and explicit bounds; native protocol types are reused. Preserve `operationId`, exact version/question/proposal/Shot/Panel bindings, option-only question answers, production targets and selection revision. Schema shape is not proof that approval/version/export business behavior works.
  - [ ] S4-AC3: Named application operation interfaces and structured unavailable results preserve authenticate → closed-input validation → ownership for implemented resources → not-implemented ordering. Native/client error mapping distinguishes unavailable from authentication, invalid input, not-found/ownership and integration failures without exposing sensitive internals.
  - [ ] S4-AC4: Human actions and agent-only capabilities have separate closed inputs/authority descriptions. No public generation-submit, amendment, deletion, model-preference or totals route is introduced. Do not build empty domain packages, fake lifecycle state or mutation/idempotency ledgers for unavailable features.
- **Functional verification:**
  - [ ] V9 contract portion — `pnpm test:contracts` exercises shared schemas and error decoding with representative valid and invalid public payloads, including unknown/forged authority fields, a missing required operation identity, option-only answers and conditional Shot/Panel targets. Pass when intended shapes succeed and invalid/ambiguous shapes fail for the declared reason. Keep only distinct branching cases; Story 5 adds the actual HTTP matrix rather than duplicating all schema permutations there.
  - [ ] V10 — `pnpm check` proves browser/client and server use the shared public types with no copied native protocol, private rows/secrets or forbidden imports. Editorial catalog comparison complements, but does not substitute for, executable contract checks.
- **Regression verification:**
  - [ ] S4-RV1: Run `pnpm test:native`, `pnpm test:security` and `pnpm test:workflow` after introducing shared contracts/application interfaces; native transport, configuration-error handling, ownership and independent recovery stay unchanged. `pnpm test:smoke` and `pnpm check` remain green.
- **Editorial/design verification:** Compare every catalog row with the spec's closed v1 catalog and the observed native APIs; check authority, real caller and implementation status without a prose-presence test. Record discrepancies/resolutions in the story PR; material product changes return for approval.
- **Manual-only behavior verification:** N/A — executable schemas/types/errors are automated; catalog review is editorial, not manual runtime proof.
- **Planned commits:**
  1. Exact surface catalog and browser-safe application schemas/errors.
  2. Named application interfaces and supported native/client error mapping.
  3. Focused public-contract checks and catalog-to-spec editorial evidence.
- **Technical notes:** `contracts` contains structural DTOs, not domain policy/DB rows/provider payloads. `application` uses narrow injected native/conversation collaborators rather than importing assembled agent/bootstrap code. Future domain owners are named in the catalog without implementing their behavior or creating decorative folders.

#### Story 5: Callable backend skeleton and typed application client
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — initial independent sprint-doc review on 2026-10-27 returned 5/5, with no per-story or cross-story findings.
  - Resolution: N/A — no findings to resolve. Planning readiness only; implementation and verification remain unperformed.
- **As a** frontend developer, **I want** callable real backend interfaces through one typed client, **so that** the next sprint can wire controls without pretending unfinished features work.
- **Dependencies:** Stories 1–4; extends Story 2's native client using Story 4's shared schemas/catalog; maps to P1-S5.
- **Acceptance criteria:**
  - [ ] S5-AC1: Mount the intended application routes on the existing native server and implement their typed `api-client` methods. Every browser surface has an actual scripted client-to-server call; implemented platform operations remain real. No HTTP self-calls from tools or second server/stream protocol.
  - [ ] S5-AC2: Actual requests enforce authentication, closed input validation and ownership of implemented references before returning structured not-implemented outcomes. Missing/invalid/expired identity, malformed/extra fields, foreign implemented resources, unavailable features and transport failures remain distinguishable and settle the client; no unconditional placeholder response hides earlier failures.
  - [ ] S5-AC3: Unfinished calls make no product mutation, approval, model/provider call or success-shaped saved result. Tests use genuine isolated native/platform records where ownership exists; they do not bypass ownership, seed unimplemented domains or claim later domain semantics are verified.
  - [ ] S5-AC4: Update the catalog with actual mounted interface/client evidence and native/platform versus unavailable status. Production-configured exposure still excludes test providers/controls and unintended framework routes. A test caller verifies wiring but does not invent a product consumer; actual frontend wiring remains Phase 2.
- **Functional verification:**
  - [ ] V9 HTTP portion — extend `pnpm test:contracts` with one parameterized typed-client → actual built-server matrix. Exercise the intended browser routes and representative shared guard failures: unauthenticated/malformed/foreign-resource requests fail at the correct earlier boundary; valid requests reach implemented platform behavior or explicit unavailable results. Test transport failure without hanging. Reuse the public contract/identity fixtures instead of duplicating equivalent cases at every layer.
  - [ ] V9/V3 — for unavailable actions, compare applicable real saved platform state and observe model/external-work boundaries before/after calls. Pass only when no product save/approval/result or provider work occurs. Repeat with malformed requests so an unconditional unavailable handler cannot pass. Unimplemented-domain invariants are explicitly outside the proof; extend the existing security matrix to newly mounted application surfaces.
- **Regression verification:**
  - [ ] S5-RV1: Run `pnpm test:security`, `pnpm test:native`, `pnpm test:workflow`, `pnpm test:smoke` and `pnpm check`; adding application routes/client methods must not change native history/queue/Stop, admission, isolation, route restrictions, build/start or process recovery. Retain the focused contract cases in the expanded `pnpm test:contracts` command.
- **Editorial/design verification:** Inspect the final catalog/client examples against actual responses and the approved spec. Report unimplemented producer/business prerequisites honestly in the story PR and catalog; no frontend visual or filmmaking acceptance is claimed.
- **Manual-only behavior verification:** N/A — scripted real client/server requests provide the boundary proof.
- **Planned commits:**
  1. Authenticated validated application route adapters on the existing server.
  2. Typed application client methods and explicit error/unavailable handling.
  3. Shared real-server request matrix, no-side-effect/exposure checks and catalog evidence.
- **Technical notes:** No fake lifecycle stores, production seed/scenario endpoints or generic successful saves. Ownership is checked only for resources actually implemented; unavailable domains are not manufactured to force a test outcome. Use the same schemas and qualified native interfaces, not separately handwritten client payload types.

#### Final Story: Sprint Verification & Completion
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Uses the story sections above and the existing regression suite as the verification source of truth
  - [x] Defines where final verification evidence will be recorded
  - [x] Includes full regression verification, not only areas believed to be touched
  - [x] Ready for Lou
- **As a** maintainer, **I want** all sprint functional verification and all available regression verification run, **so that** the sprint can be integrated with evidence that new behavior works and existing behavior did not regress.
- **Dependencies:** All implementation stories
- **Acceptance criteria:**
  - [ ] Every story’s acceptance criteria are evaluated against implementation evidence.
  - [ ] Every story’s functional verification checkboxes are run, checked, or explicitly marked failed/ambiguous/unrun.
  - [ ] Every story’s targeted regression verification checkboxes are run, checked, or explicitly marked failed/ambiguous/unrun.
  - [ ] The full available regression verification suite is run, including existing unit, integration, e2e, smoke, simulator/browser/device, static, and manual-only checks where applicable.
  - [ ] Failed, ambiguous, manual-only, or unrun verification items are documented.
  - [ ] Reusable new functional checks are identified as future regression verification; one-off editorial evidence is not counted as a suite.
  - [ ] Verification delta is reported by canonical type, showing before sprint, added this sprint, removed, pending/not yet run, and after sprint totals.
  - [ ] The sprint doc status is updated to `🟢 Complete` only if completion criteria are met.
  - [ ] A `## Final Review` section is appended to the sprint doc with the final completion message quoted for auditability.
- **Functional verification:**
  - [ ] Run all functional verification items from every story and record pass/fail evidence. Reuse V1–V10; do not add a duplicate acceptance harness. Include the actual built-server/Postgres Stop and saved-before-start crash cases at the final candidate revision, not only earlier story results.
- **Regression verification:**
  - [ ] Run all targeted regression verification items from every story and record pass/fail evidence.
  - [ ] Run the full available regression verification suite and record pass/fail evidence: `pnpm test`, `pnpm check`, `pnpm build`, the reproducible clean-checkout V1 smoke, and any additional checks established during execution. Record how aggregate commands include focused suites so cases are not counted twice. The source local-skill suite is not an application dependency or an omitted imported check.
- **Editorial/design verification:** Reconcile the native qualification record, surface catalog, setup commands, initial structure and actual implementation against this sprint/spec. Record honest platform/unavailable status, native limitations and dependency choices in the final-story PR and `## Final Review`. No product visual approval or live-provider qualification is implied.
- **Manual-only behavior verification:** N/A — no manual-only verification required by the approved scope. If genuinely unavoidable later, record why automation is impractical, reproducible steps and pass/fail conditions before acceptance; unrun required checks remain non-pass.
- **Planned commits:**
  1. Final verification evidence and orchestrator-owned sprint completion update, after evidence is verified.
- **Technical notes:** Use the story sections plus the existing regression suite as the source of truth. The worker gathers evidence and stops; for an evidence-only boundary with no implementation changes/PR, it returns `incomplete` with evidence and the completed boundary in `summary`. Failed, ambiguous or unrun verification remains non-pass. The orchestrator verifies the handoff, updates planning records after the worker stops, including the verification delta and `## Final Review`, and creates/updates the final-story PR instead of resuming completed evidence gathering. Read canonical `workflow-prompts/handle-sprint-completion.md` for the message shape and handoff. Commit/push record changes, then verify and independently review the resulting head before acceptance; never append records after acceptance while reusing a stale-SHA verdict.

Final evidence must identify the candidate revision, commands/environment, exact package cohort, safe fixture identities, results, limitations and New Dependencies with rationale or `None`. Include all canonical delta rows, even zero: Unit; Integration / contract; E2E / smoke; Simulator / device; AI / model evals; Static / local checks; Performance / load; Security / dependency; Accessibility / visual; Manual-only; Other verification; Total. State the counting unit; use Before sprint, Added this sprint, Removed, Pending / not yet run and After sprint columns. Use the most specific type once per case; explain any Unknown, and do not confuse the ten planning coverage groups with implemented case counts. Store raw logs temporarily/ignored and durable redacted results in the final-story PR and `## Final Review`. Current planning approval is not a completion report.

### Rules
- Before authorized delivery, read canonical `docs/conventions/delivery-workflow.md` (resolved via AGENTS.md §12) for sprint branching, PRs and review/fix/merge mechanics; shared gates remain in AGENTS.md.
- Work through already-authorized stories sequentially, subject to explicit pause/no-merge instructions. Planning approval alone does not authorize implementation. The Final Verification Story is always last.
- Only the orchestrator updates planning records. Every resulting head must pass verification and independent review before acceptance.
- After the Final Verification Story merges, follow the delivery workflow for sprint integration and its explicit user merge command.
- Record new dependencies in `## Final Review`, or record `None` when no dependencies were added.

### Definition of Done
- All implementation stories pass acceptance criteria.
- Functional verification evidence is recorded for executable stories; descriptive-only stories justify N/A and record editorial/design evidence.
- Targeted regression verification evidence is recorded for executable stories; descriptive-only stories justify N/A.
- Final Verification Story has run all sprint functional verification and the full available regression verification suite.
- Failed, ambiguous, manual-only, or unrun verification items are documented in `## Final Review`.
- `## Final Review` includes a verification delta table showing before sprint, added this sprint, removed, pending/not yet run, and after sprint totals by canonical verification type.
- Sprint doc status is `🟢 Complete` only when completion criteria are met.
- Sprint doc includes `## Final Review` with the final completion message and a New Dependencies field containing dependencies or `None`.
- Sprint-integration PR is reviewed, passes the required gates, and is merged only after the explicit user merge command.
- If the sprint introduces new flows, they are folded into the implementation spec before sprint integration.
