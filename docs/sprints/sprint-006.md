# Sprint 006 — Muse Wonder chat

**Date:** Start after Wave 1 integration and B-007 qualification – End after completion gates
**Goal:** An authenticated creator can send, queue, observe, stop and reopen real Muse Wonder conversations through the single qualified native runtime, without usage records or creative tools.
**Status:** 🟡 Planning

**Planning review:** Final independent review 5/5, no open findings; four first-pass P2s resolved in the story blocks. Pre-start checklists remain open until prerequisite integration and kickoff revalidation; this is not implementation/live-call authorization.

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`; implementation branches start from integrated `phase-3`, not the currently unintegrated Sprint 004/005 heads.
- **Tech stack:** Strict TypeScript, React, Hono official Mastra adapter, native Mastra Agent/Memory/client, Supabase Auth/Postgres, pnpm, Playwright. Exact post-B-007 versions must be recorded before implementation; do not assume current online documentation matches installed APIs.
- **Current state:** Sprint 004 implementation is on `0496afd`; its combined evidence reports 197 API, 237 browser and 351 visual passes, but completion/integration/human ratification remain pending. Native controlled send/queue/observe/Stop exists; browser Send is still unavailable. Sprint 005 is incomplete. Neither partial clone is the accepted combined baseline.
- **Implementation spec:** `docs/specs/implementation-spec-001.md`, reduced-delivery amendment, P3-S1c and native P3-S1b/S18/S19 limits.

### Sprint-Wide Context
- **Sprint type:** Feature
- **Shared context:** Lou approved Muse Wonder and deferred usage records/export to prioritize core functionality. Four independently useful implementation stories are deliberate rather than padding to five. Story 4 delivers the actual live binding/activation gate; it is not the Sprint Completion checklist. No production model call occurs in Stories 1–3. Sprint 007 follows integration of this sprint.
- **Non-goals:** Usage schema/persistence/aggregation/dashboard/spend gate (B-010), export (B-009), creative tools, initial questions/proposals, generation submission/providers, image/video model input, hosted search, new conversation store or event protocol, deployment.
- **Entry gates:** Both Wave 1 integrations, B-007 qualification on their combined head, B-004/B-008 reassessment and exact selected API compatibility. Do not bypass release-age policy or inherit a Wave 1 audit exception without reassessment. Missing essential native support blocks affected work; no vendor patch or second execution owner.
- **Model research:** Official Meta docs identify preview model `muse-wonder-1.0`, base `https://api.meta.ai/v1`, Bearer authentication and Chat Completions/Responses surfaces. Mastra documents `meta/muse-wonder-1.0` with Chat Completions default. Plan the minimal text-only Chat Completions route through the existing native owner; do not add Responses/background storage or hosted tools. Multi-turn text history is required, encrypted reasoning continuity is not claimed. Confirm installed public APIs in Story 1; incompatibility is a blocker, not permission for silent protocol/model fallback.
- **Research sources:** [Meta models](https://dev.meta.ai/docs/models#muse-wonder), [authentication](https://dev.meta.ai/docs/authentication), [protocols](https://dev.meta.ai/docs/protocols), [Chat streaming](https://dev.meta.ai/docs/protocols/chat-completions#streaming), [errors](https://dev.meta.ai/docs/error-handling), [Mastra Meta](https://mastra.ai/models/providers/meta). These are documentation findings, not observed authenticated responses. Provider docs use `MODEL_API_KEY`; Mastra documents `META_MODEL_API_KEY`; explicitly supply the root `META_API_KEY` server-side without renaming/exposing its value or assuming automatic discovery.
- **Safety budget:** Initial supported text envelope: existing 8 KiB input limit, maximum 1,024 output tokens, zero automatic provider retries/fallbacks, one active model attempt per account and bounded queue of three messages per conversation. Reject overflow explicitly. Proposed stream idle deadline 30 seconds and total attempt deadline 90 seconds; verify cancellation/cleanup against native limits rather than holding a database transaction. If installed support cannot enforce this envelope, remain unavailable pending a decision. These are application limits, not an invoice guarantee or claim remote inference stopped.
- **Live-call gate:** Story 4 requires Lou's separate explicit approval for at most eight inference attempts, concurrency one, synthetic input only, at most 4,000 input tokens and 1,024 output tokens per attempt, no retries/search/tools and a $1 qualification ceiling. Published token-price arithmetic suggests about $0.30 for that envelope, but billing/entitlement must be checked first. Do not increase limits to obtain a pass. Key presence and this plan are not authorization. Sanitized one-off qualification evidence is not a product usage ledger.

### Affected Flows
- **Existing flows affected:** Sign-in/out and session expiry; New video/Recents; native conversation history, composer draft and keyboard behavior; same-scope workspace manual edits/uploads; native Stop versus independent workflow cancellation.
- **New flows introduced:** Real browser text Send/stream/queue/reconnect/Stop with selected Muse Wonder; explicit unavailable/error/uncertain outcomes without automatic resend. Chat text is not an Artifact or human approval.

### Verification Strategy
- **Functional verification:** Built server, official native client and isolated real Auth/Postgres with test-only controlled providers for deterministic behavior; separately authorized Meta calls for actual model compatibility. Reuse `apps/api/test/native-turn*.test.ts`, `native-turn-control*.test.ts`, native fixtures and `scripts/browser/tests/{chat,conversation-history,conversation-races}.spec.ts`. Tests must exercise ordinary navigation, not success-shaped client stubs. Record commands, revision, red→green where reproducing a defect, sanitized observed response shapes and exact native identities.
- **Regression verification:** Preserve ownership/non-disclosure, persisted history ordering, unknown outcomes, late-stop safety, independent-work survival, Auth teardown, image uploads/manual-save recovery and production exclusion. Relevant checks accompany each story; combined completion runs frozen install → `pnpm check` → `pnpm build` → `pnpm test` → `pnpm test:browser` → `pnpm test:visual` → `pnpm qualify:ingress` → `pnpm audit` → `pnpm qualify:auth-evidence`. Audit non-pass remains explicit and blocks where no current exception exists. No redundant per-story suite replay at completion.
- **Design/evidence:** New states require inert 1440/390 previews and orchestrator approval under delegation before implementation, with Lou ratification pending. Tracked independent references, main surfaces at 1440/390/820/821 and representative states at 1440/390, zero pixel drift, geometry/no overflow, keyboard/focus and scroll retention. Keep file-backed logs and sanitized evidence under ignored `outputs/verification/sprint-006/<sha>/`; PR and Final Review retain results/limitations without secrets, signed URLs or private prompts.

### Stories
**Constraints:** Four small implementation stories, sequential. Preserve separate live authorization and completion; no manufactured final verification story.

#### Story 1: Bounded server-only model binding
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: First planning review 4/5; final review 5/5, no open findings; no Story 1 findings. Cross-story P2: distinguish qualification access from ordinary activation.
  - Resolution: Explicit separately authorized bounded qualification access added; ordinary inference remains disabled until Story 4 passes. External entry gates remain unfulfilled.
- **As a** maintainer, **I want** one bounded, fail-closed model binding, **so that** enabling chat does not introduce another agent loop or uncontrolled calls.
- **Dependencies:** Sprint entry gates; actual integrated native interfaces and installed cohort inspected first.
- **Acceptance criteria:**
  - [ ] Bind the exact configured Meta model through the public native model interface; explicit server-only key mapping and typed availability/error state. Missing/invalid configuration starts no provider work. Do not read/print key values during planning or expose them through browser config/logs/errors.
  - [ ] Enforce the sprint's input/output/active-call/queue/time bounds and zero hidden retry/fallback policy. Native lifecycle owns streams and cleanup; no transaction spans inference. Ordinary inference remains off until Story 4 passes. Story 4 may use the bounded qualification runner through the same binding after separate live authorization; this does not enable general product inference.
  - [ ] Controlled adapters prove streaming terminal errors, interruption and unknown outcome separately from successful completion, including errors after HTTP 200. Preserve native accepted-signal/message/run identities without promising terminal run retention. No usage persistence or monetary totals.
- **Functional verification:**
  - [ ] Extend native binding/transport tests through the built server: missing config causes zero calls, overflow is explicit, exact model/limits reach controlled adapter, error/timeout releases capacity and settles client state within the declared bounds, zero retries on uncertain outcomes.
- **Regression verification:**
  - [ ] Run native ownership/transport/control suites and production config/private-file exclusion; foreign scope fails before provider work and controlled adapters never ship in production.
- **Editorial/design verification:** No new visible surface in this story; review configuration/error documentation and model-ID/protocol decision against installed public interfaces. Credential values excluded.
- **Manual-only behavior verification:** N/A — deterministic behavior automated; live integration is explicitly Story 4.
- **Planned commits:**
  1. `Feat(chat): Add bounded model binding` — server-only mapping and native limits.
  2. `Test(chat): Prove binding failure bounds` — real admission/controlled transport regression evidence.
- **Technical notes:** Reuse `apps/api/src/agent/mastra/native-turns.ts` and `mastra/backend.ts`; current controlled defaults of 64 output tokens and 3/7/8-second model budgets are not silently presumed suitable for live chat. Protocol changes beyond the planned public binding require a scoped decision.

#### Story 2: Browser send, stream and saved history
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: Planning review P2: specify Enter/Shift+Enter/IME outcomes.
  - Resolution: Send/newline/composition behavior and corresponding browser assertions specified.
- **As a** creator, **I want** my text and the assistant's response to survive reopening, **so that** chat is usable rather than a transient demo.
- **Dependencies:** Story 1; approved inert chat states; controlled provider only until Story 4.
- **Acceptance criteria:**
  - [ ] Ordinary signed-in New video/Recents navigation reaches the real composer using `native.sendText` and stream consumption. One explicit send produces one native accepted input; successful native message text/IDs/order survive reload. Enter sends one nonempty message; Shift+Enter inserts a newline without sending; Enter during IME composition does not send, and composition end alone does not submit. Empty/whitespace-only input is not sent.
  - [ ] New video stays client-only until the first accepted send: opening New video writes nothing. The first accepted `native.sendText` creates the native thread, and that thread id is the video id from then on (it is routed as `/app?conversation=<id>` and listed in Recents). A failed or unknown first send creates no visible video and keeps the draft. Reconciling an unknown first send uses the same no-resend rule as below.
  - [ ] Distinguish sending, streaming, completed, interrupted, unavailable and unknown states. A lost acknowledgment never triggers automatic resend; preserve draft until acceptance is known and reconcile through supported native evidence rather than guessing from newest-message chronology.
  - [ ] Account/conversation changes discard late events, clear scoped state and preserve other conversations' persisted messages. Same-scope upload/workspace refresh does not unmount chat or discard manual-edit/recovery state. Chat writes no production Artifact/approval.
- **Functional verification:**
  - [ ] Real browser + built backend + Postgres controlled stream: send, inspect incremental text, reload/reopen and compare exact IDs/text/order; lose acknowledgment and prove no additional provider call; switch scopes mid-stream and prove no cross-scope render/write. Assert Enter sends once, Shift+Enter and IME composition send zero times, and whitespace-only input starts no call.
- **Regression verification:**
  - [ ] Run chat/navigation/history/Auth and manual-save/upload races on integrated baseline; history anchoring and retained unsaved text/unknown-save identity remain intact. Retain private transport and no-production-fixture checks.
- **Editorial/design verification:** Approve new states before implementation; compare main/representative widths under sprint design rules, including empty, long response, error and reconnect entry; inspect keyboard/focus/scroll.
- **Manual-only behavior verification:** N/A — behavior automated; human visual ratification is a separate approval gate.
- **Planned commits:**
  1. `Feat(chat): Connect browser native streams` — exact-scope composer/history consumption.
  2. `Test(chat): Cover persistence and scope races` — real browser proof and independent visual references.
- **Technical notes:** Replace unavailable argumentless composer calls, not native ownership. Reuse `packages/api-client/src/native-turns.ts`, `conversation/composer.tsx` and existing history reconciliation. No second message cache/store as an authority.

#### Story 3: Queue, reconnect and exact-turn Stop
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: Planning review P2: Stop acknowledgment/settlement bounds need measurable criteria.
  - Resolution: Five-second acknowledgment and ten-second local observation deadlines specified; expiry is unknown, not successful remote cancellation.
- **As a** creator, **I want** bounded queued messages and truthful reconnect/Stop, **so that** interruptions do not duplicate calls or stop unrelated work.
- **Dependencies:** Story 2 and Sprint 004's exact-turn/independent-work qualification.
- **Acceptance criteria:**
  - [ ] Up to three queued messages retain native order and distinct accepted identities; overflow rejects before another call. No ambiguous queue acknowledgment automatically resends. Scope switches and multiple observers do not duplicate queue consumption.
  - [ ] Reconnect observes the same exact turn without invoking send/queue; observer close sends no Stop. Respect the native three-second replay window and report unavailable/unknown after expiry or restart rather than inventing terminal status from persisted text.
  - [ ] Stop targets the captured exact run, caps acknowledgment waiting at five seconds and local observation settlement at ten seconds after the click, and separates requested Stop from evidenced termination. Deadline expiry displays unknown and releases local observation resources without claiming remote termination. A delayed old Stop cannot affect a successor; independent workflows continue after Stop/disconnect. UI settles on failed or unknown outcomes.
- **Functional verification:**
  - [ ] Browser/native tests enqueue while streaming, reconnect inside/outside replay window, delay old Stop until successor, close observation and stop assistant during independent controlled workflow. Assert exact call counts/identities/order, unchanged workflow identity and honest UI state; stalled Stop acknowledgment settles within five seconds and local observation within ten seconds, without being labelled successful remote cancellation.
- **Regression verification:**
  - [ ] Run native control/client/workflow suites, history/scroll, Auth teardown and browser scope races; no new durable status store, subscription leak, hidden retry or application connection held across waits.
- **Editorial/design verification:** Approve queue/Stop/unknown/replay-expiry states; independent references and all required widths, focus and announcements. Reuse approved elements rather than adding a new control surface.
- **Manual-only behavior verification:** N/A — races use deterministic controlled providers and real native persistence.
- **Planned commits:**
  1. `Feat(chat): Wire queue and exact turn controls` — bounded native client integration.
  2. `Test(chat): Prove reconnect and stop isolation` — negative/race/cleanup and visual evidence.
- **Technical notes:** `native-control.ts`, `native-outcome.ts` and `docs/native-turn-control.md` define distinct run/message IDs. Neither Stop acknowledgment nor local abort proves remote billing ended.

#### Story 4: Authorized Muse Wonder qualification and activation
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: Planning review P2: require concrete saved-history context proof in the two-turn live case.
  - Resolution: Synthetic nonce context assertion and second-response pass condition added; qualification access separated from product activation. Live authorization is not granted by this document.
- **As a** creator, **I want** the selected real model to work through ordinary chat, **so that** successful controlled tests are not mistaken for live integration.
- **Dependencies:** Stories 1–3; Lou explicitly authorizes the exact bounded live envelope above; valid Meta entitlement/billing; no shared infrastructure mutation implied.
- **Acceptance criteria:**
  - [ ] Observe actual Meta responses and streaming shapes through the installed native binding before finalizing provider-specific parsing. Capture sanitized fixtures/model/protocol/version provenance and distinguish documented error shapes from observed ones. Test malformed/error/incomplete streams offline; do not deliberately provoke paid overload or auth incidents.
  - [ ] Within the authorized envelope, prove synthetic ordinary browser send, two-turn saved-history context, reload and explicit Stop/local abort. First turn supplies a random synthetic nonce; after reload, second turn asks for that nonce without repeating it. A sanitized binding-boundary assertion must show the saved first-turn text in the actual second request, and the second response must contain the exact nonce. Failure is inconclusive qualification, not permission to retry beyond the budget. Record remote-stop/billing uncertainty rather than claiming it solved. No hosted tools, creative generation or automatic fallback. If limits prevent a conclusive result, record blocked/inconclusive rather than increasing them.
  - [ ] Activate the configured production chat path only after evidence passes and independent review; absent/unqualified configuration stays unavailable with no calls. Keep secrets server-side and controlled adapters out of the production build. Usage records remain deferred; do not add a table to store qualification receipts.
- **Functional verification:**
  - [ ] Authorized real-browser/backend Meta smoke with exact model and synthetic inputs, observed response/error-shape evidence, bounded attempt count and persisted native messages; scripted negative fixtures prove terminal errors/missing fields cannot masquerade as completion. Record every attempted call, outcome and remaining uncertainty in sanitized one-off evidence.
- **Regression verification:**
  - [ ] Re-run native controlled suites and actual browser chat/control/config exclusion tests on the activation head. Unconfigured startup must make zero provider requests; check/build/audit and security checks cover any provider dependency addition.
- **Editorial/design verification:** Reuse approved chat states; verify truthful model/availability/Stop language and no claim of exact spend or remote cancellation. New visible states require previews rather than ad-hoc copy.
- **Manual-only behavior verification:** N/A — live smoke is scripted after authorization. Human authorization and visual ratification are approval gates, not substitutes for tests.
- **Planned commits:**
  1. `Test(chat): Qualify Muse Wonder integration` — sanitized observed fixtures and bounded live runner.
  2. `Feat(chat): Enable qualified model binding` — activation/configuration and operating limitations.
- **Technical notes:** Do not log credentials/private text. API refusal, billing/permission error, model substitution or unresolved native compatibility stops qualification. No actual calls have been made during planning.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [ ] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [ ] Run the applicable regression suite on the combined sprint branch.
- [ ] Run any planned cross-story checks not covered by that suite: chat during image upload/manual-save recovery, account teardown during queued work and assistant Stop while independent native work continues; reuse suite evidence where already covered.
- [ ] Record results and unresolved issues in a brief `## Final Review`, including actual model/protocol/cohort, live authorization/evidence, deferred usage/export and remote cancellation uncertainty.

For descriptive-only work, use editorial review and applicable existing checks. Preserve applicable design checks and approval gates. Failed, ambiguous, or unrun required checks remain non-pass.

### Rules
- Before authorized delivery, read canonical `docs/conventions/delivery-workflow.md` (resolved via AGENTS.md §12) for sprint branching, PRs and review/fix/merge mechanics; shared gates remain in AGENTS.md.
- Work through already-authorized stories sequentially, subject to explicit pause/no-merge instructions. Planning approval alone does not authorize implementation. After all implementation stories are complete, perform the Sprint Completion checklist.
- Only the orchestrator updates planning records. Every resulting head must pass verification and independent review before acceptance.
- After the Sprint Completion checklist passes, follow the delivery workflow for sprint integration and its explicit user merge command.
- Record new dependencies in `## Final Review`, or record `None` when no dependencies were added.

### Definition of Done
- All implementation stories pass acceptance criteria.
- Functional verification evidence is recorded for executable stories; descriptive-only stories justify N/A and record editorial/design evidence.
- Targeted regression verification evidence is recorded for executable stories; descriptive-only stories justify N/A.
- Sprint Completion checklist passes with evidence from the combined sprint branch, or editorial evidence and applicable existing checks for descriptive-only work.
- Failed, ambiguous, manual-only, or unrun verification items are documented in `## Final Review`.
- Sprint doc status is `🟢 Complete` only when completion criteria are met.
- Sprint doc includes a brief `## Final Review` with completion evidence, unresolved issues, and a New Dependencies field containing dependencies or `None`.
- Sprint-integration PR is reviewed, passes the required gates, and is merged only after the explicit user merge command.
- If the sprint introduces new flows, they are folded into the implementation spec before sprint integration.
