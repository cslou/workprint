# Sprint 001 — Authenticated API foundation

**Date:** Initially approved 2026-10-27; revised scope approved during replanning. Completion remains subject to evidence and delivery gates.
**Goal:** Build on the accepted application foundation to expose authenticated, closed application contracts through a typed client, with validated, side-effect-free not-implemented responses. No functional conversations or background execution.
**Status:** 🔵 In Progress — Stories 1–2 accepted; Stories 4–5 and Final Verification explicitly authorized. Integration into `main` still requires a separate merge command.

---

## Handoff

### Project Context
- **Repo:** Workprint; paths are relative to the repository root. Sprint integration into `main` still requires an explicit user merge command.
- **Tech stack:** TypeScript, pinned Node/pnpm, React/Vite shell, one Mastra server, Supabase Auth/Postgres, plain `pg`, strict types/lint/dependency-cruiser. Keep the accepted package cohort unless a demonstrated need requires a separately reviewed change.
- **Current state:** Story 1 merged through [PR #3](https://github.com/cslou/workprint/pull/3). Its acceptance and seven regression cases are retained below. Auth, native conversations/workflows and live AI remain unqualified. The planning branch contains Story 1 application code, not the deferred Story 2 implementation.
- **Implementation spec:** [Implementation Spec 001](../specs/implementation-spec-001.md), §§4–7 and revised Phase 1. P1-S3 is relocated, not an active sprint dependency.

### Sprint-Wide Context
- **Sprint type:** Application/API foundation and security.
- **Shared context:** Active stories are 1, 2, 4 and 5, then Final Verification. Original identifiers remain stable; Story 3 is relocated. Revised stories passed independent planning review (5/5, no findings); historical readiness was not reused to approve their new scope. Each story targets at most five logical commits including verification and is independently reviewed.
- **Execution selection:** Latest user override for revised Story 2: `openai-codex/gpt-6.1-sol`, `medium`, with 900,000 ms (15-minute) execution windows and orchestrator progress inspection between calls. Use a fresh worker because scope and thinking differ from the deferred worker. This override expires after Story 2; the prior remaining-sprint `high` preference otherwise remains. Story 2 implementation is authorized; later stories are not started by that authorization.
- **Non-goals:** Functional conversation CRUD/history/chat/streaming/queue/Stop; workflow execution/recovery; frontend product UI; creative tools; Artifact persistence; uploads, generation, export, live inference, deployment/CI/CD, account administration, billing, deletion and model selectors. No parallel server, scheduler, agent loop, conversation store or fake lifecycle.
- **Model direction:** Muse remains the intended family, not qualified model IDs/API support. Credentials stay private; this sprint makes no live AI calls.

**Preserved deferred work:** [PR #4](https://github.com/cslou/workprint/pull/4), branch `feat/s001-native-conversations`, head `045f70ba3360cb337518d2d68de3ea699e8e9ee9`, is unmerged and unaccepted. Paused fixes remain in stash `c62b84d6961caf87027ec5320c58f7c2a11b2f48`. Do not resume, close, discard or merge it automatically. Reuse requires a bounded assignment and current review, including outstanding exposure, subscription cancellation/deadline, saved-output correlation, client pagination, persisted-text and token-lifetime findings. Environment-specific Supabase naming in that deferred work must be corrected before reuse. Historical planning review was not implementation acceptance.

**Supabase configuration:** one Supabase integration serves all environments through configured URLs and credentials. Use environment-neutral modules/helpers; no separate local/production integration folders or adapters. The standard `supabase/` directory is for CLI configuration and application migrations when needed. The prior authorization permits a Workprint-only development CLI/Docker stack on unused loopback ports, supported initialization, separate setup/serving roles and two synthetic accounts provisioned outside the product. Keep credentials ignored/private. This does not authorize other projects, hosted/production changes or account-administration features. Tests use actual Supabase verification, not a trusted-identity bypass. Supabase Auth and native resource ownership are different checks: the latter arrives with actual conversations in Phase 3.

**Incremental structure:** keep the existing `apps/web` shell, `apps/api/src/mastra` composition and `db` mechanics. Story 2 adds only backend admission/configuration and its tests. Story 4 introduces browser-safe `packages/contracts`, `docs/api-surface.md` and named unavailable-operation boundaries where needed. Story 5 adds `packages/api-client` application transport and route adapters. Native conversation bindings under `agent/mastra`, native stream transport and workflow fixtures arrive in Phase 3. Create no empty future-domain folders. Application migrations use the Supabase CLI; supported native initialization remains separate and native schemas are never hand-edited.

### Affected Flows
- **Existing flows affected:** Developer startup/configuration and protected API boundaries. Spec §8.1/8.7 conversations/Stop/recovery remain later functional obligations; §8.2–8.6 application operations remain unavailable.
- **New flows introduced:** Real backend authentication, closed contract validation and typed-client → built-server calls with honest unavailable/error outcomes. No creator-facing filmmaking flow is completed.

### Verification Strategy

Define functional and relevant regression proof before executable changes. Descriptive planning/catalog prose receives editorial review, not persistent heading/keyword tests. Retain all accepted Story 1 checks. Reuse fixtures and boundary matrices; add unit/schema cases only for distinct risks not already covered. No test-count target or duplicate test pyramid.

| ID | Essential proof | Revised owner |
| --- | --- | --- |
| V1 | Clean frozen install, build/start and no automatic inference | Accepted Story 1; retained |
| V2 | Safe configuration, private secrets and production exclusion of test controls | Story 1; extend in 2/5 only where affected |
| V3 | Actual Supabase admission, distinct trusted identities, intended route exposure and restricted serving privileges | Story 1 foundation; Stories 2/5 admission/exposure; conversation resource isolation moves to P3-S1a |
| V4 | Persisted native history/text, stream/queue/reconnect and exact-turn interruption | Relocated to P3-S1a–S1c, not a Sprint 001 gate |
| V5 | Independent work survives Stop/disconnect; tool-started proof | P3-S18 shared isolation; P4-S9 actual tool-started work |
| V6 | Saved-before-start process-death recovery | P3-S19, then feature-specific P3-S13/P4-S16 |
| V7 | Waiting/restart/re-entry/cancel/failure | P3-S18/S19, extended by feature owners |
| V8 | Concurrency/deadlines/capacity release; no transaction over external waits | P3-S18, extended by feature owners |
| V9 | Closed shared schemas and typed-client/server unavailable/error behavior | Stories 4–5 |
| V10 | Strict types, lint and dependency boundaries | Story 1; retained throughout |

Relocated groups are planned obligations, not removed existing tests or passes. No accepted regression suite is weakened. Backend security uses the actual built runtime and configured Supabase verification with two synthetic identities. A test-only protected probe may expose verified context to the harness; production must exclude it. Do not implement conversation storage merely to test authentication. Ownership is required for implemented resources; unavailable domains get no fake records, ownership stores or claimed business-rule proof.

Existing commands: `pnpm install --frozen-lockfile`, `pnpm db:prepare`, `pnpm dev`, `pnpm build`, `pnpm check`, `pnpm test`, `pnpm test:smoke`, `pnpm test:security`. Story 4 adds `pnpm test:contracts`, extended in Story 5; focused commands select the same cases as the aggregate suite. `test:native` and `test:workflow` are later-phase deliverables, not this sprint's commands. Missing required prerequisites fail clearly rather than silently skipping.

Record actual Supabase admission/exposure and configuration evidence in `docs/native-runtime-qualification.md` without claiming conversation/workflow compatibility. Story 4 owns `docs/api-surface.md`; schemas/native types are contract-shape sources of truth. Story PRs record revision, exact commands, results, dependency rationale and redacted evidence. Verbose logs remain temporary/ignored. No live model, product visual, deployed-capacity or exactly-once claim.

### Stories
**Constraints:** Four active implementation stories (one accepted) plus Final Verification. Preserve identifiers and accepted evidence. Failed essential integration blocks its consumers; do not add a fallback identity system or hide behavior behind mocks.

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
  - [x] S1-AC1: Pin a compatible Node/pnpm/TypeScript/web/native package cohort and deterministic lockfile. The minimal web and single native backend build/start using the documented root commands; no second server or empty future-domain scaffolding is introduced.
  - [x] S1-AC2: Validate required provider configuration and keep secrets server-side. Test providers and qualification controls remain test-harness-only. Do not require R2/media credentials for absent features. Imports/builds/startup perform no inference or paid work merely because credentials exist. Native error handling is qualified in Story 2.
  - [x] S1-AC3: Provide safe environment examples and reproducible isolated-Postgres setup/teardown, with explicit target isolation and separate setup/serving credentials. `db:prepare` uses supported native initialization and application-owned mechanisms; no direct native-schema edits or shared/customer database reset. Document privately supplied Supabase prerequisites for Story 2.
  - [x] S1-AC4: `pnpm check` runs strict types, lint and dependency-cruiser. Enforce no cycles, upward/private imports, browser/server leakage or production imports of test fixtures; `application` must not import `agent`, either Mastra integration subtree or assembled bootstrap. Record each added dependency's purpose and run the package manager's dependency audit, recording unresolved findings rather than suppressing them.
- **Functional verification:**
  - [x] V1 — `pnpm test:smoke`: in a clean temporary checkout/export, install from the frozen lockfile, build, prepare isolated storage and start the built shell/backend with valid nonproduction configuration. Pass only when both respond within a bounded startup deadline, no untracked source is required, the lockfile is unchanged and no model/provider work occurs. Close processes and remove only fixture-owned resources.
  - [x] V2/V3 foundation — `pnpm test:security`: cover missing/invalid required provider configuration and production exclusion of test providers/controls without live calls. A harmless server-secret sentinel stays out of built browser assets, returned errors and captured logs. Setup can prepare stores; serving credentials cannot perform privileged schema setup. These are foundation checks, not completed native error-handling/Auth proof.
  - [x] V10 — `pnpm check`: zero type/lint/boundary failures. During rule setup, temporary representative forbidden imports must fail for the intended boundary; remove controls afterward. Do not test compiler internals or freeze source text.
- **Regression verification:**
  - [x] S1-RV1: Inventory the actual new repository baseline before changes and run any checks already present. If it is the approved empty application baseline, record `N/A — no pre-existing application behavior/tests`; do not import or count the source skill suite. Re-run V1/V2/V10 after the complete foundation change to protect its setup/configuration paths.
- **Editorial/design verification:** Review README/setup instructions against actual commands and observed versions/privileges; record evidence in the story PR and native qualification record. No new product visual design is accepted by a blank buildable shell.
- **Manual-only behavior verification:** N/A — setup, configuration, privilege and build checks are automated.
- **Planned commits:**
  1. Pinned workspace and minimal web/native backend build/start configuration.
  2. Safe environment handling, supported database setup and isolated verification fixtures.
  3. Smoke/security/static checks and reproducible development instructions.
- **Technical notes:** Root commands may use narrow real helpers under `scripts/`. Application schema changes use the Supabase CLI migration workflow rather than a custom migration runner. Keep schema initialization separate from serving. Select exact versions here rather than treating past registry research as a tested cohort. Tests and examples contain no real credentials.

**Story 1 execution evidence:** [PR #3](https://github.com/cslou/workprint/pull/3), accepted head `562e8d93faea622412bf3a1735162e59412de61d`, merge `418877a71b9d9880f31be1e2ce1e14d03a81d4d5`. Frozen install/build/check, all seven aggregate cases (including clean-export smoke), focused security/smoke and zero-finding dependency audit passed at the accepted head. Orchestrator independently ran check/test/build there and again after merge. Twelve temporary forbidden-import controls rejected the intended boundaries and were removed. Initial seven-check review found one P1 and three P2s; two fix-review cycles resolved all findings, final mergeability 5/5 with complete coverage. README/environment/native-record editorial review passed; no product visual acceptance. Six additive commits were needed to close review findings while preserving published history, exceeding the five-commit planning target by one. Logs remain local; durable evidence and dependency rationale are in the PR and `docs/native-runtime-qualification.md`. Baseline regression N/A; the seven new cases are now retained regression coverage. Local Supabase/Auth remains Story 2 work.

**Historical-reference clarification:** Story 1 above is preserved verbatim as accepted evidence. Its future-facing Story 2 references predate replanning: backend Auth stays in Story 2; native conversation/error behavior moves to P3-S1a–S1c. Its environment-specific Supabase wording is historical, not the naming convention for new work.

#### Story 2: Backend authentication and route security
- **Story Checklist:**
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Functional and relevant regression verification defined
  - [x] Bounded independently reviewable outcome
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:** Revised-plan sprint-doc-reviewer: 5/5, no findings. Old Story 2 approval is superseded; this is planning readiness, not executable acceptance or resumption.
- **As a** developer, **I want** actual Supabase admission on the existing backend, **so that** protected API scaffolding trusts verified identity without implementing conversations.
- **Dependencies:** Accepted Story 1 and authorized development Supabase target/two synthetic identities; maps to revised P1-S2.
- **Acceptance criteria:**
  - [x] S2-AC1: Verify actual configured Supabase tokens and derive trusted account context. Missing, malformed, expired and invalid tokens fail without leaking credentials; caller owner claims cannot replace verified identity. Bound verification failures/timeouts.
  - [x] S2-AC2: Use one environment-configured Supabase integration and neutral helper/module names. Provisioning remains separate from serving; the approved development stack binds only to loopback. No alternate environment-specific application implementation/folder, custom credential service or account administration.
  - [x] S2-AC3: Expose only intended operational/application routes. Health remains the explicit operational exception. Native conversations, administration, direct tools and test controls remain inaccessible in production configuration; no inference or workflows are enabled.
  - [x] S2-AC4: A test-only protected probe observes distinct verified identities through the same built admission path, without conversation/domain records. Production composition excludes the probe. Record actual verification APIs, route policy and configuration in the qualification record.
- **Functional verification:**
  - [x] V3 — extend `pnpm test:security` against the actual built server and Supabase verifier with two synthetic identities. Pass when verified accounts remain distinct, invalid/expired/missing tokens reject, forged owner claims do not alter identity and verifier failure settles within a declared deadline. Obtain fresh tokens at test execution, not before a lengthy build.
  - [x] V2/V3 — inspect production-configured HTTP exposure and built browser/output/log secret sentinels. Pass when unintended routes/probe are inaccessible, secrets remain private and no provider work occurs. If provisioning configuration is added, verify loopback-only publication and cleanup of only fixture-owned resources.
- **Regression verification:**
  - [x] `pnpm test`, `pnpm check`, `pnpm build`: retain the seven foundation cases, clean-export smoke, setup/serving separation and no-startup-inference behavior. Focused security runs select existing aggregate cases rather than duplicating them.
- **Editorial/design verification:** Compare README and qualification record against actual configuration/admission/exposure; explicitly distinguish identity proof from conversation ownership. No product visual change.
- **Manual-only behavior verification:** N/A — automated; authorized setup is a prerequisite, not a substitute.
- **Planned commits:**
  1. Environment-configured Supabase verification and restricted admission.
  2. Built-server identity/exposure tests and setup/documentation evidence.
- **Technical notes:** Do not import PR #4 wholesale. No native conversation client or domain stores are required. Test registration exercises the real admission path but stays outside production composition.

**Story 2 execution evidence:** Accepted [PR #5](https://github.com/cslou/workprint/pull/5) head `964157e886489ab32dc5b798a8ef697838a8a196`, merged into `sprint-001` at `b73d083aae00c7be745ecaef2216fb15c82e0585`. Actual configured Supabase verification, distinct synthetic identities, invalid/expired/forged token rejection, bounded failure and production exclusion passed. Initial independent review identified a pre-existing framework-public route bypass; the additive fix reproduced then closed it, and independent fix verification plus security/logic/modularity scans returned 5/5 with no remaining findings. Current-head and post-merge `pnpm test` (8/8, zero failed/skipped/cancelled), `pnpm check` and `pnpm build` passed; aggregate includes clean-export smoke and all seven foundation cases. Orchestrator independently ran current-head check and inspected post-merge evidence. README/configuration/qualification editorial review passed; no visual/live-model acceptance. Durable evidence: [acceptance comment](https://github.com/cslou/workprint/pull/5#issuecomment-6446237499). No new dependencies.

**Remaining execution selection:** User authorized completion of Stories 4–5 and Final Verification. The Story 2-only `medium` override has expired; use the previously requested `openai-codex/gpt-6.1-sol`, `high` for remaining work, retaining 15-minute execution windows and progress inspection. Story 4 uses a fresh worker because both its contract-focused scope and thinking differ from the stopped Auth worker. Later worker reuse is decided at each story boundary. Preserve lean aggregate verification and all required coverage.

#### Story 3: Relocated — independent native work and process recovery

Not active Sprint 001 work. P3-S18 owns independent workflow isolation/cancellation/bounds; P3-S19 owns durable start/process recovery. P4-S9 owns actual tool-started work; P3-S13/P4-S15/S16 retain feature-specific safety. V5–V8 move with these owners. This is a scope relocation, not completed implementation or permission to drop accepted tests.

#### Story 4: Closed surface catalog and shared contracts
- **Story Checklist:**
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Functional and relevant regression verification defined
  - [x] Bounded independently reviewable outcome
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:** Revised-plan sprint-doc-reviewer: 5/5, no findings on dependencies or unavailable-native boundary. Implementation checks remain unrun.
- **As a** developer, **I want** closed shared contracts and explicit owners/consumers, **so that** later features do not invent competing APIs or mistake declarations for functionality.
- **Dependencies:** Stories 1–2; maps to P1-S4. No native conversation/workflow qualification dependency.
- **Acceptance criteria:**
  - [ ] S4-AC1: `docs/api-surface.md` catalogs §4 application routes plus intended native/tool/internal operations: owner, caller, flow, inputs/outputs, authorization, errors, idempotency, implementation/qualification status and later owner. Native API references are declared supported interfaces, not claimed runtime proof. Tools/internal operations acquire no unnecessary HTTP routes.
  - [ ] S4-AC2: Browser-safe closed schemas preserve operation IDs, exact version/question/proposal/Shot/Panel bindings, option-only answers, targets and selection revision. Reuse supported native types; no copied stream protocol or private rows/provider state. Shared request/response shapes do not implement domain rules.
  - [ ] S4-AC3: Define structured error/unavailable handling and named application boundaries: authenticate → closed-input validation → ownership for implemented resources → not implemented. Native capabilities remain unexposed; the client reports explicit unavailable without a custom route or network attempt. Do not add fake ownership stores, mutation ledgers or domain implementations.
  - [ ] S4-AC4: Separate human actions from agent capabilities. No public generation-submit, amendment, deletion, model-preference or totals endpoint. Future ownership checks are assigned to functional stories, not falsely claimed tested here.
- **Functional verification:**
  - [ ] V9 — add `pnpm test:contracts` for shared schemas/error decoding. Representative valid requests parse; malformed/extra fields, forged authority, missing operation IDs and invalid conditional targets reject for the intended reason. Keep only distinct branches; Story 5 owns HTTP proof.
  - [ ] V10 — `pnpm check` confirms browser-safe shared types and import direction, without duplicating native protocol definitions.
- **Regression verification:**
  - [ ] `pnpm test`, `pnpm check`, `pnpm build`: retain foundation/Auth/exposure checks. No native/workflow suite is a prerequisite before those features exist.
- **Editorial/design verification:** Compare catalog with the closed spec inventory; record genuine consumers, declared versus verified native behavior and later owners. No prose-presence test or new product visual approval.
- **Manual-only behavior verification:** N/A — executable schemas automated; prose reviewed editorially.
- **Planned commits:**
  1. Surface catalog and closed browser-safe schemas/errors.
  2. Named unavailable boundaries, focused contract checks and evidence.
- **Technical notes:** Structural DTOs only; no domain SQL or production operations. `application` receives narrow collaborators and never imports assembled bootstrap or agent/native subtrees.

#### Story 5: Callable backend skeleton and typed application client
- **Story Checklist:**
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Functional and relevant regression verification defined
  - [x] Bounded independently reviewable outcome
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:** Revised-plan sprint-doc-reviewer: 5/5, no findings on the application-only boundary. Implementation checks remain unrun.
- **As a** frontend developer, **I want** callable authenticated application routes and a typed client, **so that** Phase 2 can wire controls without pretending unfinished work succeeds.
- **Dependencies:** Stories 1–2 and 4; maps to P1-S5. No dependency on relocated Story 3 or PR #4.
- **Acceptance criteria:**
  - [ ] S5-AC1: Mount the cataloged application routes on the existing Mastra server and expose typed `api-client` methods derived from shared schemas. Every application browser route has a scripted client → real backend call. Native conversations remain unavailable/unexposed, not a parallel chat protocol.
  - [ ] S5-AC2: Requests enforce real authentication, closed input validation and ownership only for implemented resources before unavailable results. Invalid identity/input, actual resource ownership failure, unavailable features and transport failures remain distinguishable; client calls settle within bounded deadlines/cancellation. No unconditional placeholder hides earlier guards.
  - [ ] S5-AC3: Unavailable operations create no product records, approval, model/provider work or success-shaped results. No conversation/domain seed store or mutation/idempotency ledger is needed. Catalog resource ownership and business semantics as unimplemented until their owners deliver them.
  - [ ] S5-AC4: Record mounted route/client evidence and production exposure; test controls remain inaccessible. A test caller proves transport, not a genuine frontend consumer; Phase 2 owns frontend wiring.
- **Functional verification:**
  - [ ] V9 — extend `pnpm test:contracts` with a parameterized typed-client → built-server matrix for every application route. Valid authenticated payloads return structured unavailable; missing/invalid/expired identity and representative malformed/extra fields fail at their earlier boundary. Transport errors, stalled requests and cancellation settle without hanging. Native unavailable calls make no network request or custom stream.
  - [ ] V9/V3 — observe applicable real state and provider-work boundaries before/after unavailable requests; no writes/calls or success-shaped output. Exercise guard order with malformed inputs as well as valid requests. No claim of unimplemented conversation/domain isolation; test actual owned-resource rejection when such resources exist.
- **Regression verification:**
  - [ ] `pnpm test`, `pnpm check`, `pnpm build`: retain Story 1 smoke/security and Story 2 Auth/exposure plus Story 4 schema cases. Focused runs reuse the aggregate cases.
- **Editorial/design verification:** Reconcile actual routes/client/examples/catalog with spec; identify later functional owners and honest unavailable status. No frontend visual acceptance.
- **Manual-only behavior verification:** N/A — scripted actual client/server checks.
- **Planned commits:**
  1. Authenticated validated application route adapters.
  2. Typed application client and bounded unavailable/transport handling.
  3. Shared HTTP matrix, no-side-effect/exposure checks and catalog evidence.
- **Technical notes:** Shared handlers may remove repetition, not bypass route-specific schemas. Preserve one server and one client boundary; no self-HTTP calls from tools.

#### Final Story: Sprint Verification & Completion
- **Story Checklist:**
  - [x] Uses active story sections and existing regression suite as source of truth
  - [x] Defines evidence location
  - [x] Includes full regression verification
  - [x] Ready for Lou
- **Planning review:** Revised-plan sprint-doc-reviewer: 5/5, no findings on the completion boundary. Final execution verification has not occurred.
- **As a** maintainer, **I want** current functional and regression evidence, **so that** integration accepts only the revised API foundation.
- **Dependencies:** Active Stories 1, 2, 4 and 5; not relocated Story 3 or deferred PR #4.
- **Acceptance criteria:**
  - [ ] Evaluate every active story AC and functional/regression item against implementation evidence; record failed, ambiguous, manual-only and unrun items as non-pass.
  - [ ] Run all sprint functional checks and the full available regression suite, including checks established during execution. Preserve accepted Story 1 coverage.
  - [ ] Identify reusable new checks and report verification delta by canonical type; relocated planned V4–V8 are neither removed tests nor completed checks.
  - [ ] Reconcile spec, catalog, qualification record and README; no claimed native conversation/workflow or filmmaking capability.
  - [ ] Update status to `🟢 Complete` only after completion gates; append `## Final Review` with the quoted final completion message, evidence and New Dependencies (or `None`).
- **Functional verification:**
  - [ ] Run current V1/V2/V3/V9/V10 at the final candidate revision. Keep final verification short by reusing existing aggregate suites and concise evidence, not adding an acceptance harness or duplicating focused runs already included. Required coverage is unchanged. Native Stop/crash checks belong to the relocated stories, not this candidate.
- **Regression verification:**
  - [ ] Run `pnpm test`, `pnpm check`, `pnpm build` and clean-checkout smoke plus any additional established required checks. Record how aggregate/focused commands overlap so cases are counted once.
- **Editorial/design verification:** Review documentation against observed admission, contract and exposure behavior. Feature qualification is explicitly pending; no product design/live-service/deployment acceptance.
- **Manual-only behavior verification:** N/A planned. If automation is genuinely impractical, record rationale, reproducible steps and pass/fail conditions before acceptance; missing required evidence remains non-pass.
- **Planned commits:**
  1. Verified completion evidence and orchestrator-owned planning update.
- **Technical notes:** The worker gathers evidence and stops. For a completed evidence-only boundary with no implementation PR, it returns `incomplete` with evidence and completed boundary in `summary`; the orchestrator verifies, updates records and creates/updates delivery rather than resuming finished evidence gathering. Failed/ambiguous/unrun verification is not completion. Follow canonical `docs/conventions/implementation-handoff.md` and `workflow-prompts/handle-sprint-completion.md`; review the resulting current head, never reuse a stale verdict after record changes.

Final evidence identifies revision, commands/environment, package cohort, safe fixture identities, results and limitations. Include all canonical delta rows even when zero: Unit; Integration / contract; E2E / smoke; Simulator / device; AI / model evals; Static / local checks; Performance / load; Security / dependency; Accessibility / visual; Manual-only; Other verification; Total. Columns: Before sprint, Added this sprint, Removed, Pending / not yet run, After sprint. State counting unit; assign each case its most specific type once, explain Unknown and distinguish planned proof groups from implemented cases. Keep raw logs temporary/ignored and durable redacted evidence in the final-story PR and Final Review.

### Rules
- Follow canonical delivery workflow before Git/PR delivery; only the orchestrator accepts/merges and updates planning records.
- Remaining Stories 4–5 and Final Verification are explicitly authorized, sequentially after each acceptance gate. Do not resume deferred PR #4 or merge the sprint into `main` without its separate approval.
- Stories are sequential and independently verified/reviewed; Final Verification is last. New dependencies require rationale and applicable audit evidence.
- Sprint integration requires the user's explicit merge command. No production/shared infrastructure changes or live AI calls are authorized by this plan.

### Definition of Done
- All active stories have accepted ACs, functional verification and relevant regression evidence; descriptive-only scope records justified N/A and editorial evidence.
- Final Verification runs all applicable functional checks and full available regressions; required failed/ambiguous/unrun items remain non-pass.
- Final Review records the quoted completion message, candidate/commands/results, delta table and new dependencies.
- Spec/catalog/qualification records reflect actual capability and later owners; no relocated feature is claimed completed.
- Integration PR passes independent review/check/conversation gates and merges only after explicit user authorization.
