# Sprint 007 — Human decisions and generation records

**Date:** Start after Sprint 006 integration – End after completion gates
**Goal:** A creator can inspect and answer exact saved questions/proposals and inspect/cancel owned generation requests, with durable human authority and truthful native outcomes, without implementing their producers.
**Status:** 🟡 Planning

**Planning review:** Independent review 5/5, no findings. Pre-start checklists remain open until prerequisite integration and kickoff revalidation; planning does not authorize implementation.

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`; branch from integrated `phase-3` after Sprint 006, not an unintegrated dependency branch.
- **Tech stack:** Strict TypeScript/React, native Mastra execution, official Hono adapter, Supabase Auth/Postgres, pnpm and Playwright; use the B-007-qualified integrated cohort.
- **Current state:** Existing contracts expose question/proposal reads, `answerQuestion`, generation list/detail and cancellation, but their application operations are unavailable. Sprint 004 proves controlled native lifecycle/recovery, not production question continuation. Partial Sprint 005 provides saved-work interfaces but must finish/integrate first. Normal conversations contain no produced questions or generation requests until Phase 4; no production fixture shortcut is authorized.
- **Implementation spec:** `docs/specs/implementation-spec-001.md`, reduced-delivery amendment and P3-S7/S8, with P3-S18/S19 native prerequisites; canonical vocabulary in `CONTEXT.md`.

### Sprint-Wide Context
- **Sprint type:** Feature
- **Shared context:** Lou approved splitting core work into 006 chat and 007 decisions/status/cancellation, with export and usage records deferred. Four stories reflect independently testable outcomes, not a target count. Plan is approved scope for drafting, not authorization to implement or make live calls. Sequential start avoids stacking branches or replacing 006's message consumer.
- **Non-goals:** Export (B-009), usage persistence/totals/spend gates (B-010), initial question/proposal creation, `ask`, creative tools, generation submission/provider adapters, generation simulation in production, proposal amendment UI, new workflow scheduler, public deployment.
- **Entry gates:** Integrated Sprints 004–006, B-007 qualified cohort, B-004/B-008 reassessed; inspect final 005 interfaces/migrations before implementing. Do not copy its partial use/selection implementations or assume fixture-only workflow recovery is already a business hand-off. A missing essential native capability blocks its consumer rather than authorizing a second ledger/loop.
- **Ownership:** `artifacts` owns question/proposal/decision SQL and public transaction-local effects; `generation` owns request/batch transitions and SQL. `application` coordinates through narrow collaborators without importing native bootstrap/agent. Native adapters own start/notification/cancel. No peer-domain SQL calls, no transaction held across native/provider waits, no private run/task/secret state in browser DTOs.
- **Contracts:** `answerQuestion` accepts `{operationId, questionRevision, optionId}` and returns question, effects and `continuationId`; cancellation accepts `{operationId}` and returns request plus `remote: requested|unsupported|unknown`. Preserve existing operation names; additive typed display fields/correlation may be introduced only where needed and independently tested. Informational proposal estimates remain required disclosures, not measured usage.
- **Operational bounds:** Paginated list default 20, maximum 100 records; browser retains at most 200 request rows with explicit return-to-first-page access. Active-view polling no faster than every three seconds, at most one in flight; stop on terminal state, hidden/closed view or scope teardown. Native waits/cancellation acknowledgment use bounded adapter deadlines and the qualified seven-second total shutdown budget. Do not reset saved workflow deadlines on restart or promise remote cancellation/billing cutoff.

### Affected Flows
- **Existing flows affected:** Question/proposal cards and typed-message composer; exact-version human use/approval; workspace pending-question projection; generation list/detail/cancel; account/conversation isolation, manual-edit recovery and native independent-work shutdown.
- **New flows introduced:** Real owned saved review records and listed-option decisions, recoverable native continuation hand-off, persisted generation-record observation and exact request cancellation. Existing empty states remain empty without Phase 4 producers.

### Verification Strategy
- **Functional verification:** Real built backend, isolated Postgres/Auth and ordinary browser consumers. Setup creates isolated real business records directly through test-only fixtures, never production seed routes or fabricated successful responses. Reuse `apps/api/test/{surface.contracts,native-workflow-outcome,native-workflow-persistence,native-recovery}.test.ts` and `scripts/browser/tests/{question,videos,request-races,display-prerequisites}.spec.ts`; extend native tests where business hand-off is newly exercised. Kill/restart the actual process for durable hand-off proof.
- **Regression verification:** Every story covers owned/foreign/missing records, exact versions, stale revisions, repeated operation IDs, late responses, Auth teardown and retained unsaved state. Complete the full ordered combined suite: frozen install → `pnpm check` → `pnpm build` → `pnpm test` → `pnpm test:browser` → `pnpm test:visual` → `pnpm qualify:ingress` → `pnpm audit` → `pnpm qualify:auth-evidence`. Native chat/Stop and image/manual-save/playback regressions remain enabled. No redundant rerun of every story where the suite covers it.
- **Design/evidence:** Inert 1440/390 previews before new states; orchestrator approval under delegation, pending Lou ratification. Independent tracked references, main widths 1440/390/820/821, representative states 1440/390, zero drift/no masks, geometry/no overflow, keyboard/focus/announcements. Logs/evidence under ignored `outputs/verification/sprint-007/<sha>/`, with durable PR summaries; no credentials/private text/signed URLs. Manual approval is not behavior verification. Failed/unrun checks remain non-pass.

### Stories
**Constraints:** Four sequential implementation stories, each independently reviewed and verified. Native business hand-off is a bounded capability gate, not permission for an agent tool or generation producer.

#### Story 1: Owned question/proposal reads and input names
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: Independent planning review 5/5; no Story 1 or cross-story findings.
  - Resolution: N/A — no findings. Integrated predecessor gates remain unfulfilled.
- **As a** creator, **I want** exact read-only review facts, **so that** I can understand what an answer would authorize.
- **Dependencies:** Sprint entry gates; final 005 owned-read/use interfaces; approved card/loading/error states.
- **Acceptance criteria:**
  - [ ] Owned question/proposal operations and workspace pending-question projection load authoritative records. Foreign IDs disclose nothing; absent pending record shows the normal empty/no-question state. Saved pending/answered/superseded state is rendered without granting authority on read.
  - [ ] B-003 supplies a typed, ownership-checked display name bound to each exact input version; display ordered input name/version, target/scope, model/settings/disclosures and estimate provenance/unknowns. Never derive names from arbitrary `content`, role or IDs. Any missing required fact fails closed for approval while preserving ordinary typed chat.
  - [ ] Cards have no editable fields/amendment operation. Scope changes reject late results; reading a newer artifact cannot replace pinned proposal inputs. Estimates remain informational even though actual usage persistence is deferred.
- **Functional verification:**
  - [ ] Built Auth/API plus browser tests use isolated persisted questions/proposals and exact versions: ordered names/settings render, missing names prevent approval, foreign/missing/superseded records do not expose or mutate data; reload preserves exact bindings.
- **Regression verification:**
  - [ ] Run read/privacy/pagination, proposal display-prerequisite, manual-save/history and chat tests. Reading approval candidates performs zero decision/use writes and no inference/generation call; stale scope never populates another conversation.
- **Editorial/design verification:** Compare approved cards and error/missing-fact states across required widths; keyboard/focus and model/estimate labels must not imply creative approval or measured cost.
- **Manual-only behavior verification:** N/A — records/reads/visual geometry automated; human design ratification separate.
- **Planned commits:**
  1. `Feat(review): Add owned proposal facts` — domain reads and typed version-bound names.
  2. `Feat(review): Connect saved review cards` — browser consumption, negative and visual tests.
- **Technical notes:** Reuse `contracts/models.ts`, `conversation/{proposal,review-reads,question}` and final saved-work collaborator. Store identity-bound name facts in the owning domain; no untyped caller-supplied display authority. Local backlog B-003 points here.

#### Story 2: Exact human answers and durable continuation
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: Independent planning review 5/5; no Story 2 findings.
  - Resolution: N/A — no findings. Production continuation qualification remains an explicit capability gate.
- **As a** creator, **I want** only my exact listed answer to grant authority once, **so that** retries or ordinary chat cannot authorize different work.
- **Dependencies:** Story 1; Sprint 006 typed-message consumer; integrated artifact/use interfaces and native durable-start qualification.
- **Acceptance criteria:**
  - [ ] Validate authenticated human, question revision/status, listed option and exact proposal/version/use bindings inside the decision transaction. Commit answer and applicable approval/use/batch authority plus stable continuation identity atomically; stale/superseded/foreign or assistant-originated claims cannot approve. Same operation/payload returns the same result; conflicting reuse rejects.
  - [ ] Notify/start the qualified native continuation only after commit, using saved identity and recoverable narrow hand-off. Preserve one logical continuation across committed-before-notify, lost acknowledgment and process restart; no second conversation store or custom replay loop. Native notification does not mean model inference or generation started. No automatic model call or tool-driven continuation is added here.
  - [ ] UI validates returned binding/state, refreshes authoritative records without losing same-scope drafts and settles duplicates/uncertainty. Typed requests use 006 chat and leave the question pending; only a later saved superseding proposal disables the original question. No card amendment and no approval inferred from assistant text.
- **Functional verification:**
  - [ ] Real PG/API concurrency tests race duplicate, conflicting, stale and superseded answers; assert one decision/effect/continuation identity and zero unauthorized effects. Kill/restart built process before native notification and after actual acknowledgment; verify same saved identity and no duplicate effect.
  - [ ] Browser typed-while-pending proof uses controlled native inference, asserts no decision write; listed answer persists/reloads exact effects, lost response is reconciled with original operation ID and no automatic resend. A test-only native recipient proves delivered notification, not merely an intent row.
- **Regression verification:**
  - [ ] Run native recovery/persistence-failure and saved-use/approval suites; chat Stop/disconnect does not cancel independent continuation; account teardown drops late UI results. Human saves, failed/conflicted edits and image upload refresh retain text/base/recovery identity.
- **Editorial/design verification:** Approve pending/answered/superseded/unknown-handoff feedback and keyboard/focus recovery. Copy must distinguish saved human decision from work started, and must not advertise generation execution.
- **Manual-only behavior verification:** N/A — real process kill/restart and race barriers automated with test-only controls.
- **Planned commits:**
  1. `Feat(review): Commit exact human decisions` — transaction/idempotency/public effects interface.
  2. `Feat(review): Deliver durable answer handoffs` — native adapter and business recovery proof.
  3. `Feat(review): Settle browser answer outcomes` — exact response validation and typed-message/regression tests.
- **Technical notes:** `continuationId` is durable business correlation, not assumed retained terminal turn `runId`. Use supported native saved evidence. If the public native API cannot prove recoverable delivery without speculative inference, block this story for a simpler approved design; do not manufacture a successful acknowledgment.

#### Story 3: Truthful generation-record observation
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: Independent planning review 5/5; no Story 3 findings.
  - Resolution: N/A — no findings.
- **As a** creator, **I want** authoritative saved request status, **so that** I can distinguish pending, failed, partial and uncertain work without invented progress.
- **Dependencies:** Story 2; integrated artifact/result ownership and final 005 media interfaces. Actual generation producer remains Phase 4.
- **Acceptance criteria:**
  - [ ] Implement owned generation list/detail with bounded pagination/status filtering; normal conversations stay empty. Records include supported queued/running/terminal state, failure, partial/result references and known remote disposition. No invented percentage, spend or inferred missing fields. Browser contracts omit native credentials/private task controls.
  - [ ] Same-status enrichment (new result/failure/remote information) reaches the view without ranking terminal outcomes or reverting newer observations. Use an authoritative ordering/revision contract where needed rather than a status-only heuristic. Reload/poll/late-response ordering preserves exact request identities.
  - [ ] Bounded view-driven polling follows sprint limits, stops when inactive and never submits/retries generation. Missing result access is an honest error; viewing does not choose a Shot video or approve any version. Do not create requests from the UI or a production seed route.
- **Functional verification:**
  - [ ] Built server/PG/browser tests observe real changing isolated records through same-status enrichment, terminal outcomes, partial results, foreign IDs and more than 200 rows; assert bounded retained UI data, accessible first-page return, no stale overwrite and no submission effects.
- **Regression verification:**
  - [ ] Run videos/request/selection races, exact media access, ownership and shell/manual-save/chat suites. Request observation cannot change chosen versions, reset editors or issue provider calls; production build excludes all fixture producers.
- **Editorial/design verification:** Approve empty/loading/error/partial/remote-unknown detail states and bounded-list controls; compare main/representative widths, keyboard navigation and live announcements without fabricated progress.
- **Manual-only behavior verification:** N/A — deterministic persisted record changes and browser polling are automated.
- **Planned commits:**
  1. `Feat(generation): Read owned request records` — domain SQL and bounded browser contracts.
  2. `Feat(generation): Show truthful request state` — ordering/enrichment/pagination and browser evidence.
- **Technical notes:** Existing `videos/observations.ts` only accepts forward status changes and drops enrichment; correct at the owner boundary with a meaningful freshness contract. Optional usage fields stay absent/unknown, not synthesized as zero or persisted in a new usage system.

#### Story 4: Exact request cancellation and native settlement
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: Independent planning review 5/5; no Story 4 or Sprint Completion findings.
  - Resolution: N/A — no findings.
- **As a** creator, **I want** to cancel one owned request without stopping chat or unrelated work, **so that** local and remote outcomes remain accurate.
- **Dependencies:** Story 3; Sprint 004 native cancellation/readback/recovery; saved authority/batch records from Story 2. Real provider cancellation remains Phase 4.
- **Acceptance criteria:**
  - [ ] Validate owned exact request and idempotent operation, serialize terminal transition and once-only batch effects. Repeated cancellation is safe; concurrent success/failure is retained rather than relabeled cancelled. No retry submission or assistant Stop call.
  - [ ] Persist cancellation intent before external native notification, reconcile after crash and target only the saved exact run/workflow/resource. Native cancel promise alone is insufficient: verify saved terminal evidence or report pending/unknown with bounded settlement; do not release uncertain capacity or erase original deadlines.
  - [ ] Define a narrow provider-cancellation collaborator without an adapter; return/display local status separately from `remote: requested|unsupported|unknown`. Unknown remote completion/charges remain unknown. Normal missing-provider paths are honest; controlled fixtures do not enable actual generation.
- **Functional verification:**
  - [ ] Real built server/PG and controlled native workflows: repeat cancellation, race terminal success/failure, lose acknowledgment, kill/restart after intent, inject native persistence failure and cancel one of two active jobs. Assert one batch effect, exact saved identity/outcome, retained uncertain capacity and unrelated chat/work survival.
  - [ ] Browser request detail consumes returned remote disposition, preserves terminal winner and settles failed/unknown cancellation without resubmission. Foreign/missing targets cause zero cancellation calls; closed observation makes no cancellation request.
- **Regression verification:**
  - [ ] Run native workflow outcome/persistence/recovery and exact-turn Stop suites, generation reads/ordering and auth/scope/browser request races. Verify total shutdown bound and no connection held over native wait. Provider-specific late-result publication remains explicitly unqualified until Phase 4, not falsely passed here.
- **Editorial/design verification:** Approve local-requested/settled/unknown and remote-unsupported copy; keyboard/focus and required-width exact comparisons. No claim of refunds, stopped remote processing or generation capability.
- **Manual-only behavior verification:** N/A — deterministic actual native/PG races and restart proof; live generation-provider cancellation is out of scope and not credited.
- **Planned commits:**
  1. `Feat(generation): Guard request cancellation` — intent/idempotency/once-only effects and adapter seam.
  2. `Feat(generation): Reconcile native cancellation` — saved terminal readback and recovery tests.
  3. `Feat(generation): Show cancellation uncertainty` — browser response/remote outcome and visual proof.
- **Technical notes:** A resolving `Run.cancel()` can hide failed persistence; reuse qualification safeguards rather than equating promise resolution with cancellation. No native schema changes, alternate scheduler or provider retry loop.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [ ] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [ ] Run the applicable regression suite on the combined sprint branch.
- [ ] Run any planned cross-story checks not covered by that suite: typed chat while exact question remains pending; accepted answer/restart/authoritative reload; request cancellation concurrent with chat Stop and unsaved manual edit; scope teardown during polling. Reuse suite evidence where already covered.
- [ ] Record results and unresolved issues in a brief `## Final Review`, including actual native hand-off proof, empty production producer inventory, deferred export/usage, native/remote cancellation limitations and new dependencies.

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
