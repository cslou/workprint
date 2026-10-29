# Sprint 004 — Native runtime and conversations

**Date:** Planning suggestion 2026-10-29; execution dates pending authorization and foundation integration
**Goal:** Pass bounded-ingress qualification, deliver standard Auth and owned conversation navigation, and qualify native turn transport and independent workflow recovery through the built backend without enabling application inference.
**Status:** 🟡 Planning

**Planning result:** sprint-doc-reviewer **4/5**, "Ready to start" (2026-10-29), with one P2 resolved below. The independent dependency review of the Phase 3 packaging returned "sound with fixes"; all its fixes are applied. Execution awaits Lou's authorization and the merge of [Story 001](../stories/story-001.md) into `phase-3`. Confirm the start checklists then.

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`
- **Tech stack:** React/Vite/TypeScript and React Aria; framework-free contracts/api-client; one Mastra backend, supported native client/Memory/workflows, real Supabase Auth and Postgres. Foundation supplies the pinned Mastra 1.80.x / CLI 1.36.x cohort before this sprint branches.
- **Current state:** `main` = `c1397c3`, Phase 2 merged 2026-10-29. All 19 closed application operations have browser consumers but return authenticated structured 501; native methods and account controls are unavailable. Phase 2 recorded aggregate 13/13, browser 162/162 and visual 215/215; these are historical counts, not the post-foundation baseline. B-001 ingress has two failing leaves; audit has B-002/B-004. No application tables, Agent or workflow is currently enabled. Refresh facts/checks against the accepted foundation head before starting.
- **Implementation spec:** `docs/specs/implementation-spec-001.md`, Phase 3 P3-S1a, P3-S1b, P3-S18/S19; §§4, 6, 8.1/8.7. Packaging: [Phase 3 sprint packaging](../specs/implementation-spec-001.md#phase-3-sprint-packaging). B-001 source: local `docs/backlog.md` (DATA) and `apps/api/test/ingress.qualification.ts`.

### Sprint-Wide Context
- **Sprint type:** Feature
- **Delivery authorization:** planning only; Lou has not authorized implementation. Execution starts only after Lou authorizes it and standalone `docs/stories/story-001.md` merges into `phase-3` (created from `main`). Foundation delivers the configurable browser-test port, Mastra upgrade, trusted owned-conversation collaborator and test-only native-conversation fixture helper. Then branch `sprint-004` from updated `phase-3` in `~/.worktrees/workprint/sprint-004` via the worktree skill, with one implementer; story PRs target `sprint-004`. Sprint integration into `phase-3` requires Lou's explicit merge command; `phase-3` → `main` is Lou's.
- **Shared context:** owns `apps/api/src/mastra/` serving/auth/native/workflow adapters, `apps/api/src/agent/mastra/` native Agent bindings, web `shell/` account/New video/Recents and native-history parts of `conversation/`, plus corresponding native/Auth api-client and contract files. Reuse the foundation's collaborator; bootstrap supplies it to `application`, never imports upward from application. Existing closed operations are implemented, not reinvented; change contracts only for a demonstrated need and reuse supported native types. Creates no application tables and never modifies Mastra-owned schemas.
- **Parallel wave:** Sprints 004/005 run concurrently and must not depend on each other. Edit only owned modules; shared contracts/api-client indexes, `apps/api/src/mastra/application-routes.ts`, backend registration/bootstrap, shell composition and `storage/` index take additive edits only, with logic in owned files. Resolve `pnpm-lock.yaml` conflicts by rerunning `pnpm install`, never hand-merging. Whichever integrates second first merges `phase-3` into its sprint branch (no rebase), then reruns the full suite on the combined head, requalifying the shared conversation collaborator and native cohort. A discovered wave-mate dependency stops work for escalation, not a substitute implementation.
- **Non-goals:** P3-S1c browser chat consumer, live-model qualification and usage recording belong to wave 2. Normal application inference remains disabled throughout. No signup/invitation administration, creative tools/skills, production seed endpoint, generation/export business schema or execution, saved-work operations owned by Sprint 005, deployment, deletion, model selector or spending controls. Chat text is not a production Artifact; native persistence/technical completion confers no human approval or selection.
- **Safety:** one Mastra instance, listener and execution owner; no vendor patch, parallel server, scheduler, conversation store, stream protocol or agent loop. B-001 must pass Story 1 before native qualification; its Phase 1–2 exception cannot carry this feature. B-002 (`deepmerge`) and B-004 (`@hono/node-server`) remain Lou-approved private/local audit NON-PASS, separately reported and never counted as passes; no upstream fix as of 2026-10-29. They gate shared/public deployment, not this wave. Key presence is not live-call authorization.
- **Architecture:** components own styles; web features import only `ui/` and `api/`, with shell composition. Packages never import apps; only web imports `player`; dependency-cruiser enforces boundaries. Domains own SQL and never call peer domains; `application` coordinates narrow interfaces/supplied collaborators and imports neither agent, Mastra subtree nor bootstrap. No sprint/story IDs in code names.
- **Design and evidence placement:** reuse approved designs. New/unseen states require inert previews at 1440/390 before implementation, recorded in `docs/design/design.md` and `history.md` with the exact label: "Provisionally approved by the orchestrator on <date> under Lou's delegation; pending Lou's ratification at the Phase 3 handoff." AI inspection is not human approval. PRs and Final Review carry revision, commands/results, red→green logs, surface/reference mappings and native observations; logs/captures stay ignored under `outputs/verification/sprint-004/<sha>/`, not uploaded. B-005: when a real flow replaces an isolated `apps/web/test/*.html` mount, retire that mount and migrate its coverage at equal or greater strength; retain mounts not yet replaced.

### Affected Flows
- **Existing flows affected:** §8.1 account/session and New video/Recents/open-history controls; §8.7 admission, observer disconnect and exact-turn Stop boundaries; clean build/start, Auth/exposure, native storage preparation and browser verification workflows. Existing workspace consumers remain honest about Sprint 005 capabilities not yet available.
- **New flows introduced:** functional Supabase sign-in/out/reset/refresh and owned native conversation creation/paginated resumption; developer-only native turn/queue/Stop and independent workflow/restart qualification. No browser send flow or complete filmmaking journey is introduced.

### Verification Strategy
For executable behavior (code, config/scripts, and actual machine-consumed contracts or workflows), define functional and relevant regression proof before implementation. Policy/workflow prose alone is not proof of executable behavior. For descriptive-only docs/design prose, record functional and regression N/A with rationale and use editorial review for accuracy/completeness/consistency. Do not add persistent prose/heading assertion suites. Keep applicable existing checks and design visual/safety/consistency/approval checks under the design skill.

Verification has two categories:
- **Functional verification:** proof of executable behavior introduced or changed by this sprint, or justified N/A for descriptive-only work.
- **Regression verification:** proof of relevant existing behavior, or justified N/A for descriptive-only work.

Each implementation story must include:
- Functional verification for executable behavior it delivers, or justified N/A for descriptive-only scope.
- Targeted regression verification for existing behavior at risk, or justified N/A for descriptive-only scope.

The Final Verification Story runs all applicable sprint functional verification plus the full available existing regression suite. Reusable functional checks become future regression checks; one-off editorial review is evidence, not a persistent suite.

- **Functional execution:** extend existing `apps/api/test/` built-server/Auth/process/Postgres fixtures and `scripts/browser/` suites. Use the real built backend, real Supabase Auth with two synthetic accounts and isolated real Postgres; never bypass identity. Observe native response/status/persistence shapes before writing integration-specific handling and save redacted fixtures/evidence. Every new behavior test requires a genuine red→green log. Missing prerequisites fail, not skip. Browser tests use the consumable `scripts/browser/material-network.ts` observer with exact predeclared allowances, including Auth and newly qualified native reads; no broad exemptions or alternative harness.
- **Regression and exposure:** retain clean-export/build/dev/start, all 19-operation Auth/closed-schema checks, route/CORS denial, storage-role/idle-pool safety, secret/egress controls, deadlines, no replay and existing browser/visual coverage. Test providers, workflow fixtures, barriers, helper routes and credentials must be absent from production build inputs/assets and unavailable at runtime even with test-looking environment flags; extend `scripts/browser/tests/config.spec.ts` and `apps/api/test/web-files.security.test.ts` patterns. Update unavailable-method expectations only for genuinely qualified capabilities, preserving no-effect coverage for the rest.
- **Visual contract:** main Auth/account and conversation-navigation/history surfaces at 1440×900, 390×844 and 820/821px; representative loading/error/reset/expiry/pagination states at 1440/390. Reference HTML comes from tracked brand-book files and recorded approved preview substitutions. All captures use `settleCapture` (`scripts/browser/capture.ts`); zero tolerance, no masks, retries or automatic baseline acceptance. Compare paired full-context images/diffs/overlays and two-sided geometry/overflow/containment; unexplained typography, colour, spacing or geometry differences fail. Pointer/keyboard/focus/accessibility assertions accompany the visuals; human side-by-side review remains explicit.
- **Environment and suite order:** use `WORKPRINT_AUTH_FIXTURE="$PWD/outputs/local-supabase.setup.json"`, `WORKPRINT_AUTH_SIGNING_FIXTURE="$PWD/outputs/local-supabase.status.json"`, `WORKPRINT_BROWSER_OUTPUT="$PWD/outputs/verification/sprint-004/<sha>"` and the foundation's per-checkout browser port. Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, `pnpm test`, `pnpm test:browser`, `pnpm test:visual`, `pnpm qualify:ingress`, `pnpm audit`, in that order. Redirect full noisy stdout/stderr to local log files; report exit/result and paths. Register new tests in existing command discovery/explicit browser lists so the full suite actually executes them. Final evidence distinguishes controlled-native qualification from live-provider evidence (none here).

### Stories
**Constraints:** Seven implementation stories plus Final, strictly in this order; each independently verified/reviewed with ≤5 logical commits including verification. Commit subjects use `Type(scope): Capitalized description`, ≤50 characters. No implementation or checklist completion is implied by this suggestion.

#### Story 1: Bounded ingress before native body parsing (B-001)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** maintainer, **I want** bounded ingress before native JSON parsing, **so that** unfinished requests cannot bypass admission/resource deadlines.
- **Dependencies:** accepted foundation on `phase-3`; Lou's execution authorization. All later stories depend on this gate passing.
- **Acceptance criteria:**
  - [ ] Reproduce both existing `ingress.qualification.ts` leaves on the foundation's already-upgraded 1.80.x serving path; prefer an evidenced supported configuration, not another speculative upgrade. Establish early authentication plus bounded body size/time on the actual serving path, retaining the 1 MiB body limit and two-second body-read deadline.
  - [ ] `pnpm qualify:ingress` passes both leaves unchanged: unfinished unauthenticated POST returns exact 401 `unauthenticated`, authenticated POST exact 400 `invalid_input`, each before 3.5 s and the independent five-second watchdog while the upload is still unfinished. Server-side body/request resources settle, not just the client watchdog.
  - [ ] Public `GET /health`, normal authenticated application requests and closed unintended native routes remain intact. No vendor patch, parallel listener or weakened test. If only an application-owned official-adapter bootstrap works, stop for Lou's approval of the lifecycle change before implementing it; a candidate adapter result is not approval or story completion.
- **Functional verification:**
  - [ ] Run `pnpm qualify:ingress` red→green through the built production entry; supplement with oversized/chunked/slow-body and concurrent follow-up requests proving bounded rejection, released resources and continued health/API service, not a client-only abort.
- **Regression verification:**
  - [ ] Run built admission, client/surface contracts, foundation smoke/security and CORS/exposure tests; health succeeds, valid calls retain documented outcomes, invalid Auth still rejects first and all unintended native routes remain 404.
- **Editorial/design verification:** N/A — no UI; review serving-path evidence and lifecycle ownership against B-001 without treating prose as runtime proof.
- **Manual-only behavior verification:** N/A — built HTTP/resource checks are automated.
- **Planned commits:**
  1. `Fix(api): Bound ingress before native parsing` — supported serving configuration and focused red→green proof.
  2. `Test(api): Preserve serving boundary checks` — resource cleanup and normal/closed-route regression evidence.
- **Technical notes:** baseline reproduction is evidence, not a pass. Preserve one runtime and generated-server lifecycle unless Lou explicitly approves the official-adapter alternative; inability to meet the gate blocks native consumers.

#### Story 2: Standard Supabase account and session flows (P3-S1a-1)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** creator, **I want** standard sign-in/out, password reset and session recovery, **so that** account access settles truthfully without losing saved work.
- **Dependencies:** Story 1; scoped inert-preview approval for unseen Auth/reset/expiry states before implementation.
- **Acceptance criteria:**
  - [ ] Implement email/password sign-in/out, reset request/link consumption/password update and session refresh/expiry using standard Supabase Auth interfaces only. No signup/invitation administration, custom verifier/session store or account provisioning UI; browser configuration exposes only validated public Auth settings, never privileged credentials.
  - [ ] Successful/incorrect sign-in, reset-request failure, invalid/expired/reused reset links, refresh failure and expiry settle loading with actionable approved feedback. Sign-out/expiry clear account-scoped presentation and drafts; late responses cannot restore old-account data. Refresh/reconnect never replays commands or starts provider work.
  - [ ] Actual browser sessions feed api-client's token seam and continue to use verified backend admission. Existing saved native data survives sign-out/expiry; neither credentials nor reset tokens appear in evidence/logs. Composer send remains unavailable.
- **Functional verification:**
  - [ ] Through the real browser and local Supabase, sign in both accounts, sign out, reset and sign in with the changed password; use local Supabase email capture for the link, restoring only the owned synthetic fixture. Exercise bad credentials/links and real refresh/expiry/rejection; assert settled UI, cleared old scope, authenticated backend requests and zero command replay with the network observer.
- **Regression verification:**
  - [ ] Run admission/secret/config/exposure and shell/account/scope-race tests; missing/forged/expired credentials still fail, unrelated review/navigation remains intact and no unavailable native send gains network/provider effects.
- **Editorial/design verification:** preview first; record delegated approval exactly as above, capture Auth/account main surfaces and representative reset/error/expiry states under the visual contract. Migrate replaced account test-mount coverage per B-005 without loss.
- **Manual-only behavior verification:** human side-by-side reference/application review; pass only with no unexplained differences. Auth/reset/session behavior is automated.
- **Planned commits:**
  1. `Docs(design): Record account state previews` — approved inert states and design records.
  2. `Feat(auth): Connect standard Supabase sessions` — account UI and supported Auth/client seam.
  3. `Test(auth): Verify account recovery flows` — real reset/refresh, races, exposure and visual proof.
- **Technical notes:** shell owns account composition; narrow shared Auth mechanics live behind `api/`/api-client. Any SDK dependency must be pinned, justified and audited; do not expose server private configuration to Vite.

#### Story 3: Owned conversation navigation and history (P3-S1a-2)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** creator, **I want** New video, accessible Recents and restored owned history, **so that** I can return to the right conversation without sending a message.
- **Dependencies:** Stories 1–2; foundation's trusted owned-conversation collaborator and supported native-conversation fixture helper, not Sprint 005.
- **Acceptance criteria:**
  - [ ] New video creates native conversation identity; Recents lists/paginates owned conversations and open/load renders persisted native history through supported native interfaces/api-client. Accessible pagination works by keyboard with labelled controls, focus and announced loading/end/error states; no second conversation table/store or inferred ownership.
  - [ ] Use the foundation collaborator for verified-account ownership; two accounts cannot list/read/mutate each other's records, including forged owner/resource/cursor inputs. Foreign and absent references have indistinguishable safe outcomes. Open/load is read-only; qualified native resource routes alone become available, not generic native mutation/admin routes.
  - [ ] Create/list/load empty/error/session-expiry states settle; late create/list/history responses cannot populate another account/conversation. Refresh/reconnect/remount never creates a new conversation or replays a command. Sending remains unavailable in the browser through this entire sprint; do not imply workspace persistence from the wave-mate exists.
- **Functional verification:**
  - [ ] Browser → api-client → built server → real native Postgres creates more than one page, traverses Recents accessibly, opens and reloads exact history identities/text/order. Use only the supported test helper for preexisting native messages. Two-account/foreign/absent/cursor and controlled delayed-response tests prove isolation and no side effects; every functional spec uses the observer and has red→green evidence.
- **Regression verification:**
  - [ ] Run Auth/reset/refresh, shell/tab/keyboard, account/conversation races and production-exposure checks plus native collaborator tests; only explicitly qualified routes change availability, while sending/tools/workflows remain unavailable in production.
- **Editorial/design verification:** reuse approved shell; preview unseen Recents/pagination/history/loading/error states first and capture required widths. Replace the test-only Open conversation entry with real navigation; retire only mounts whose coverage has migrated at equal or greater strength.
- **Manual-only behavior verification:** shared human side-by-side review with no unexplained visual/geometry difference; navigation and accessibility behavior automated.
- **Planned commits:**
  1. `Docs(design): Record conversation previews` — missing native navigation/history states.
  2. `Feat(conversation): Add owned navigation` — native create/list/load and shell/history consumers.
  3. `Test(conversation): Prove owned resumption` — pagination, history, isolation, races and visuals.
- **Technical notes:** native identity/history are not Artifacts or business approvals. Keep new logic in owned files; only additive bootstrap/client-index composition, with no edits to Sprint 005's application/domain logic.

#### Story 4: Native turn send, stream and persistence (P3-S1b-1)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: P2 [check-4] — limit qualification lacked boundary scenarios and pass conditions.
  - Resolution: Added a limit-boundary functional item: stalled send/stream deadlines, output-cap and oversized-send cases, with persisted outcomes and resource release.
- **As a** maintainer, **I want** native turn transport proven through serving and persistence, **so that** later browser chat can consume a qualified interface rather than another protocol.
- **Dependencies:** Story 3; accepted native/client cohort and real response-shape observations before parser/adaptor implementation.
- **Acceptance criteria:**
  - [ ] Compose a native Agent under `agent/mastra/` into the same backend, using a test-only controlled provider in a separately built test composition. Supported native client and api-client both send/observe through the actual built server and persist exact user/assistant text, message/turn/conversation identities and order in native Postgres; reload does not reconstruct history from transient stream state.
  - [ ] Missing configuration/unavailable capabilities fail before provider work; invalid Auth/foreign conversation references cannot send, observe or mutate. Provider failure and incomplete output are not represented as saved completion; interruption qualification completes in Story 5. Declare finite send/stream/output limits and qualify the controls, not just types.
  - [ ] Normal application inference remains disabled; no browser chat consumer, creative tools/skills, provider credentials or usage tables. Controlled provider/controls/routes are excluded from production build/exposure, not selected by a production environment flag. Reuse native transport/types without copying a stream protocol.
- **Functional verification:**
  - [ ] Built-server tests drive native client and api-client separately with real Auth/two accounts and isolated Postgres; stream deterministic chunks, verify exact persisted reload order/identities, then exercise provider errors and missing configuration with zero provider calls for rejected/unavailable requests. Capture redacted observed native shapes and red→green logs.
  - [ ] Limit boundaries:
    - a stalled send and a stalled stream each hit their configured deadline with a typed failure;
    - output at the configured cap succeeds, while output over it ends with the qualified native truncation/failure outcome and is not saved as a completion;
    - an oversized send is rejected before provider work.

    Each case asserts the configured bound, the honest persisted outcome, and released connections, listeners and provider handles, with red→green logs.
- **Regression verification:**
  - [ ] Re-run owned create/list/load, body limits/ingress, admission/CORS/security/client deadlines and build/runtime fixture-exclusion checks; real browser send remains unavailable with no provider effect and all 19 application contracts retain their existing outcomes.
- **Editorial/design verification:** N/A — transport qualification only, no browser chat or new visual surface. Review native observation versus durable completion terminology.
- **Manual-only behavior verification:** N/A — actual HTTP/native persistence and exposure checks automated.
- **Planned commits:**
  1. `Feat(native): Bind supported turn transport` — native Agent/client adapters with inference disabled by default.
  2. `Test(native): Qualify persisted turn streams` — controlled-provider test composition and built/native-client proof.
- **Technical notes:** normal production build must not import the controlled provider. Test-only configuration may enable the harness composition, never application inference; future P3-S1c owns browser chat/live-model qualification and usage.

#### Story 5: Queue, reconnect and exact-turn Stop (P3-S1b-2)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** maintainer, **I want** bounded native queue/observation/Stop semantics, **so that** reconnect never replays work and a delayed Stop cannot interrupt a newer turn.
- **Dependencies:** Story 4; controlled-provider barriers in the separately built test composition only.
- **Acceptance criteria:**
  - [ ] Through native client and api-client against the built server, enqueue text during an active turn, then persist/reload every accepted message exactly once in the observed native order. Distinguish interrupted output from saved completion using native status/message evidence, not a UI flag or end-of-stream assumption.
  - [ ] Reconnect observes the identified work without resend/replay; disconnect ends observation and sends no Stop/cancel. Stop names the exact owned turn; repeated/delayed old-turn Stop cannot affect the next turn. Invalid/foreign turn references affect no work.
  - [ ] Subscription establishment, transport failures and cancellation have finite configured deadlines and settle client loading/resources. Qualification targets are ≤3 s for subscription establishment and ≤3 s for Stop acknowledgment, each under an independent five-second watchdog; stalls must return a typed failure, never fabricate cancellation success. Normal inference remains disabled and no browser chat consumer is added.
- **Functional verification:**
  - [ ] Use controlled barriers, real native state and both clients to prove queued ordering/no duplicates, reconnect without a second send, disconnect without Stop, exact-turn/delayed-Stop races and interrupted-versus-complete persistence. Stall subscription/transport/cancellation independently; assert bounded results/cleanup and no leaked listeners, with red→green logs.
- **Regression verification:**
  - [ ] Re-run Story 4 stream/reload/failure/configuration tests, owned navigation and Auth/ingress/exposure checks. Closed production inference/test controls and browser composer no-send remain verified; queueing does not create a second scheduler or store.
- **Editorial/design verification:** N/A — no browser chat consumer or new UI; record actual native cancellation outcomes and deadline observations honestly for P3-S1c.
- **Manual-only behavior verification:** N/A — barrier-driven real-server races and independent deadline watchdogs automated.
- **Planned commits:**
  1. `Feat(native): Bound queue and turn observation` — supported queue/reconnect/exact-turn Stop adapters.
  2. `Test(native): Prove turn interruption races` — persisted order, delayed Stop and bounded failure tests.
- **Technical notes:** client cancellation/timeout is not proof that the server stopped a turn. If supported APIs cannot preserve exact-turn targeting or native queue semantics, block dependent work and escalate rather than introduce a replacement protocol.

#### Story 6: Independent native execution and bounds (P3-S18)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** maintainer, **I want** independent bounded native workflow behavior qualified, **so that** future request cancellation/export can rely on one execution owner.
- **Dependencies:** Story 5 for real turn/observer separation, not live-model authorization or Sprint 005.
- **Acceptance criteria:**
  - [ ] Through the built server and real Postgres, start a test-harness native workflow independently of an active controlled turn. Stop that exact turn and close observation in separate cases; workflow identity persists and work continues. Explicit workflow cancellation is distinct and affects only its owned run. No production tool/workflow consumer or tool-started claim (P4-S9).
  - [ ] Verify native waiting/resumption, cancellation and terminal failure with saved native outcomes. Qualification targets: at most two concurrent workflow runs, explicit excess-work rejection, five-second maximum fixture wait, ten-second run deadline and seven-second shutdown/drain bound. Stalls terminate honestly, capacity is released and later work can start; cleanup must not rely solely on the harness killing an unbounded process.
  - [ ] No application transaction/connection spans an external/native wait. Keep one native execution owner; record supported controls and actual outcomes. An essential gap blocks consumers pending Lou's approved simpler solution or conditional pg-boss replacement, never a second scheduler alongside native workflows. Fixtures, workflow definitions and control routes remain test-only; no generation/export schema or application tables.
- **Functional verification:**
  - [ ] Built-process tests with real Auth/native Postgres exercise start/wait/resume/cancel/failure while a controlled turn runs; separately Stop and disconnect and assert continued same-run progress. Hold two runs, reject excess, stall/release/replace work and send SIGTERM; inspect persisted statuses, measured deadlines, connection availability and owned-resource cleanup, with red→green logs.
- **Regression verification:**
  - [ ] Re-run native turn queue/reconnect/exact-Stop, owned-history/Auth, storage-role/idle-pool, ingress and production-exclusion checks. Workflow cancellation does not Stop unrelated turns or mutate other runs; rejected/foreign work starts nothing.
- **Editorial/design verification:** N/A — harness-only workflow qualification. PR evidence records concurrency/wait/shutdown values and supported native states, not claims of generation/export execution or live service capacity.
- **Manual-only behavior verification:** N/A — actual serving/process/native-state and resource-bound checks automated.
- **Planned commits:**
  1. `Test(workflow): Add native isolation harness` — minimal native workflow and separate test registration.
  2. `Test(workflow): Qualify execution bounds` — native cancellation/failure, capacity/drain and regression proof.
- **Technical notes:** limits are explicit qualification targets, not assumed Mastra guarantees; unsupported essential controls are blockers. Use narrow owned adapters and supported registration, with additive bootstrap composition only; no production generation/export state machine.

#### Story 7: Durable start and actual process recovery (P3-S19)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** maintainer, **I want** durable start/re-entry qualified across process death, **so that** later feature owners can implement recoverable hand-offs without assuming exactly-once effects.
- **Dependencies:** Story 6; all test barriers/intent/effect fixtures remain excluded from production.
- **Acceptance criteria:**
  - [ ] In isolated real Postgres, commit a minimal test intent and stable native run identity, then kill the actual built process before native start. Restart the same built composition against retained storage and repeat narrow reconciliation; recover the same logical work/run without stranded intent or extra native runs. No mocked restart, alternate scheduler or production intent endpoint.
  - [ ] Kill/restart during native waiting, exercise step re-entry, guarded repeated effects and lost start acknowledgment. Record native statuses/identities and required application safeguards; repeated reconciliation/re-entry creates one guarded fixture effect without claiming exactly-once external execution or automatic replay of uncertain provider work.
  - [ ] Preserve Story 6 bounds and turn/observer independence. Minimal intent/effect records exist only in isolated harness setup, not production migrations or application tables; native state uses supported APIs with no native DDL. No generation/export business schema. Feature owners still prove publication, cancellation races and provider-specific uncertainty before enabling their consumers.
- **Functional verification:**
  - [ ] Barrier-driven real-process kill/restart matrix covers committed-before-start, started-before-ack, waiting and effect-before-step-ack boundaries. Repeat bounded reconciliation and re-entry, inspect actual native run/status/history plus fixture effects, and prove same logical identity, no extra runs/effects, resumed or honestly terminal outcomes and cleanup. Every case retains red→green evidence.
- **Regression verification:**
  - [ ] Re-run all Story 6 isolation/cancellation/resource tests and conversation queue/Stop/reconnect/history/Auth/ingress/security tests after restart. Production still excludes test workflows, ledgers, barriers/provider controls; serving credentials cannot prepare schemas and process recovery does not replay conversation commands.
- **Editorial/design verification:** N/A — no new UI; hand off the observed native recovery recipe, statuses, bounds and feature-owned safeguards in the PR/Final Review without overstating exactly-once behavior.
- **Manual-only behavior verification:** N/A — process death, retained Postgres, re-entry and repeated-effect observations automated.
- **Planned commits:**
  1. `Test(workflow): Qualify durable start recovery` — test-only persisted-intent/barrier and real restart checks.
  2. `Test(workflow): Prove guarded step reentry` — lost acknowledgment/repeated-effect and regression evidence.
- **Technical notes:** the fixture ledger proves the save/start seam, not a production business state machine. Reconciliation is a narrow bounded hand-off using stable identity and supported native state; no polling scheduler or application-owned native schema repair. An essential recovery gap blocks P3-S8/S11–S13 consumers and returns for approval.

#### Final Story: Sprint Verification & Completion
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Uses the story sections above and the existing regression suite as the verification source of truth
  - [ ] Defines where final verification evidence will be recorded
  - [ ] Includes full regression verification, not only areas believed to be touched
  - [ ] Ready for Lou
- **As a** maintainer, **I want** all sprint functional verification and all available regression verification run, **so that** the sprint can be integrated with evidence that new behavior works and existing behavior did not regress.
- **Dependencies:** All implementation stories
- **Acceptance criteria:**
  - [ ] Every story’s acceptance criteria are evaluated against implementation evidence.
  - [ ] Every story’s functional verification checkboxes are run, checked, or explicitly marked failed/ambiguous/unrun.
  - [ ] Every story’s targeted regression verification checkboxes are run, checked, or explicitly marked failed/ambiguous/unrun.
  - [ ] The full available regression verification suite is run, including existing unit, integration, e2e, smoke, simulator/browser/device, static, and manual-only checks where applicable.
  - [ ] Failed, ambiguous, manual-only, or unrun verification items are documented. B-001 must now PASS both leaves; B-002/B-004 audit remains separately reported private/local NON-PASS, never a pass. No new failure is covered by those exceptions.
  - [ ] Reusable new functional checks are identified as future regression verification; one-off editorial evidence is not counted as a suite.
  - [ ] Verification delta is reported by canonical type, showing before sprint, added this sprint, removed, pending/not yet run, and after sprint totals. Include all 11 types (Unit; Integration / contract; E2E / smoke; Simulator / device; AI / model evals; Static / local checks; Performance / load; Security / dependency; Accessibility / visual; Manual-only; Other verification), even zero rows; explain Unknowns, classify each case once and report command groups separately. Baseline is the accepted foundation head, not invented future counts.
  - [ ] The sprint doc status is updated to `🟢 Complete` only if completion criteria are met.
  - [ ] A `## Final Review` section is appended to the sprint doc with the final completion message quoted for auditability.
  - [ ] Record actual frontend/native consumer → owner → flow → evidence → implementation/test-only/deferred status in the PR/Final Review. Hand off P3-S1c browser chat/live model/usage and P3-S8/S11–S13 feature-specific workflow safeguards explicitly; no complete filmmaking/provider-execution claim.
  - [ ] All required main/representative visual comparisons, preview approvals and B-005 coverage migrations are reviewed. If integrating second, merge updated `phase-3` without rebase and repeat the full ordered suite on the combined head, including collaborator/native cohort requalification; no stale-head evidence qualifies.
- **Functional verification:**
  - [ ] Run all functional verification items from every story and record pass/fail evidence, with red→green logs, built/native shape observations and actual process-recovery results at the final revision.
- **Regression verification:**
  - [ ] Run all targeted regression verification items from every story and record pass/fail evidence.
  - [ ] Run the full available regression verification suite and record pass/fail evidence, using the complete ordered command list and environment above, including standalone ingress/audit and all new registered checks.
- **Editorial/design verification:** review terminology, honest capability/producer boundaries, consumer/reference mappings, exact delegated approval records and new dependency rationale. All main Auth/navigation/history comparisons and earlier affected surfaces retain zero drift/two-sided geometry. Functional/regression for the final descriptive completion record itself are N/A; editorial review applies, while underlying executable checks remain required.
- **Manual-only behavior verification:** human side-by-side review of required reference/application pairs, passing only without unexplained differences; record delegated dispositions and pending Lou ratification at the Phase 3 handoff. Runtime/Auth/native recovery checks remain automated.
- **Planned commits:**
  1. `Docs(sprint): Record native runtime evidence` — orchestrator-owned final evidence, canonical delta, new dependencies and completion record after worker handoff.
- **Technical notes:** Use the story sections plus the existing regression suite as the source of truth. The worker gathers evidence and stops; for an evidence-only boundary with no implementation changes/PR, it returns `incomplete` with evidence and the completed boundary in `summary`. Failed, ambiguous or unrun verification remains non-pass. The orchestrator verifies the handoff, updates planning records after the worker stops, including the verification delta and `## Final Review`, and creates/updates the final-story PR instead of resuming completed evidence gathering. Read canonical `workflow-prompts/handle-sprint-completion.md` for the message shape and handoff. Commit/push record changes, then verify and independently review the resulting head before acceptance; never append records after acceptance while reusing a stale-SHA verdict.

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
