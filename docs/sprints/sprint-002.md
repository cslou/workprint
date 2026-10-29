# Sprint 002 — Approved UI foundations and core wiring

**Date:** Start authorized 2026-10-28; end follows acceptance gates
**Goal:** Render the approved core workspace as reusable React components, with real application-client wiring for questions and Script/Assets controls, truthful unavailable outcomes, and page-by-page visual parity evidence.
**Status:** 🟢 Complete

**Start gate:** independent planning pass 2 scored **5/5**, no findings, including the revised main-page coverage and phase-2 sequencing. User authorized execution of both sprints. The checked planning gates below confirm readiness, not implemented acceptance; pass-1 notes are retained as history. Functional/design ACs remain unchecked until evidence exists.

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`
- **Tech stack:** pinned React 19/Vite/TypeScript/pnpm; browser-safe contracts and api-client; one Mastra backend; Supabase admission/Postgres. React Aria is the specified component foundation but is not installed yet. No browser test runner exists yet.
- **Current state:** Sprint 001 merged through PR #9 at `71dd8a4`. The web app is a minimal shell, not an implemented demo. Nineteen application operations authenticate and return structured unavailable results; native client methods return unavailable locally. Historical verified baseline: 13 passing cases plus two separately failing B-001 ingress cases. Refresh the actual baseline before execution. Sprint 001's document retains historical pending-delivery wording; the merged PR is the delivery record. Its final docs-only head did not complete re-review before the maintainer merged it; do not invent a current-head verdict.
- **Implementation spec:** `docs/specs/implementation-spec-001.md`, Phase 2 P2-S1–S4 and §§4, 7–9. This sprint splits P2-S2 into connectivity and navigation, without changing phase ownership.

### Sprint-Wide Context
- **Sprint type:** Feature
- **Delivery authorization:** the user authorized both Phase 2 sprints on 2026-10-28. Create `phase-2` from current main; create `sprint-002` from phase-2 and target story PRs at sprint-002. After verified/reviewed sprint completion, merge sprint-002 into phase-2 (explicitly authorized), then branch sprint-003 from that updated phase-2. Only after both sprints are accepted hand phase-2 → main back to the user for final review; never merge that integration without fresh approval. This assigned-base workflow supersedes the default main-based sprint sequencing for this phase only. Pause for genuine blockers/unseen-design approvals, not routine story transitions.
- **Shared context:** The user confirmed `docs/design/brand-book.html`, its components, linked demo and approved flows as the visual starting point: translate, do not redesign. Use `docs/design/design.md` for canonical tokens and approved interaction decisions. Reuse presentational components and narrow shared behavior; do not copy entire mockup pages or create a generic UI framework. Preserve exact-version/human-authority distinctions. Use React Aria where appropriate; pin compatible dependencies and document rationale in the implementing PR. No requirement to add a router, global state library or component-workbench service.
- **Non-goals:** functional Supabase sign-in/reset/session refresh (P3-S1a), conversations/streaming/queue/Stop (P3-S1a–S1c), business persistence, generation, actual media transfer, export processing, R2/live AI, public deployment, Editor/Project, Play all/comparison, deletion, credits/spending caps and model selection. Session presentation is not an implemented login flow. No stateful fake backend, production demo mode or seed endpoints.
- **Safety:** B-001 remains an explicit private/local Phase 1–2 exception. Run and report its known-failing qualification separately; do not weaken it or call client settlement server cleanup. Resolve early admission/body limits before Phase 3 native-runtime qualification AND public deployment. No listener migration is authorized by this plan. B-002 is a second user-approved private/local exception, added 2026-10-28. It covers the inherited low-severity `deepmerge` audit advisory GHSA-gcqx-w48m-w2h4, reached through Mastra build tooling and with no patched version. Report `pnpm audit` as NON-PASS separately, with no suppression, override or vendor patch. Revisit it before shared/public deployment or when an upstream fix ships.
- **Documentation:** schemas/code own implemented contracts. Put page/reference mappings, wiring evidence and dependency decisions in story PRs and this sprint's Final Review, not new permanent catalogs. The two historical reference documents are optional ignored copies under `docs/research/sprint-001/`; no checkout/test depends on them. Update existing design guide/history only for genuinely new visual approvals. Missing layouts block their affected UI slice, not reopening already approved pages.

### Affected Flows
- **Existing flows affected:** §8.1 start/resume presentation; §8.2 Library/material viewing; §8.3 questions and creative-work review; §8.4 read-only batch proposal/answer presentation; §8.5 exact-version inspection/edit controls; §8.7 unavailable native controls and account/conversation switching. Root build/dev/check/test workflows gain browser coverage while retaining their current safeguards.
- **New flows introduced:** no new product flow. Actual browser consumers for these existing intended flows become available; unfinished operations remain unavailable. Test-only isolated mounts permit authentic frontend consumers to be exercised without creating fictitious product records.

### Verification Strategy
- **Functional verification:** establish `pnpm test:browser` for automated real-browser component/navigation/wiring checks and `pnpm test:visual` for reproducible reference/application captures and comparisons. These commands are planned deliverables, not existing passes. Wire them into the aggregate verification entry point or explicitly required root verification sequence; final verification must not omit them. Use a pinned Playwright browser/toolchain, local servers, bounded setup/teardown and synthetic/licensed fixtures. Reuse existing process, Auth and built-server fixtures where their interfaces fit; do not duplicate another backend or identity verifier.
- **Real path versus isolated evidence:** application-action wiring goes through the production component → actual api-client → real built backend with actual Workprint development Supabase tokens. Test bootstrap may obtain tokens using the approved synthetic accounts and supply the normal token-provider seam in an isolated test composition; never inject a backend identity bypass or ship test credentials/session injection. Missing private prerequisites fail, not skip. Read-only schema-valid props may supply absent question/version/conversation prerequisites to an actual component; they are test data, not owned saved work. Controlled response delays/errors may test UI races separately, but do not replace real 401/501 wiring evidence. Native unavailable methods must cause zero token/network/native execution attempts.
- **Regression verification:** retain all existing tests, clean-install → db:local → dev before build smoke, actual Auth/route exposure, restricted database roles, browser secret/filesystem isolation, compiler cancellation and client/schema checks. Run `pnpm test`, `pnpm check`, `pnpm build` and dependency audit/frozen installation when dependencies change. At final verification run the full available suite, browser/visual checks and separate `pnpm qualify:ingress` with approved private prerequisites. Record failed/ambiguous/unrun checks honestly; only B-001 and B-002 have accepted exceptions. Do not count selected focused cases again.
- **Visual contract (latest user scope):** capture the main implemented pages/views beside screenshots of their corresponding full-size approved flow/demo references linked from the brand book—not thumbnails. The user narrowed the requirement to main pages, not every demo step, transient state, dialog or unimplemented function. Include representative Library/viewer/dialog layouts where they are a main review surface; normal interaction/state tests still protect implemented behavior. Use the Main-page checklist below to make coverage bidirectional without building the demo lifecycle. Start with Flow 1 `r64/r83–r90`, Flow 2 `r73–r82`, demo pages and `library-picker-r92.html`; record the exact reference path/state/hash per capture, filtering out excluded Editor/Project/comparison behavior. Use the same content, synthetic placeholders, browser build, OS/font environment, zoom, device scale and viewport for each pair. Required viewports: 1440×900 desktop and 390×844 narrow; also check the 820/821px layout boundary. Capture full pages and inspect overflow, not only above-fold crops. Wait for fonts/layout, disable animations consistently and fix timestamps/media frame where relevant.
- **Visual pass/fail:** produce paired images, overlay/difference images and a per-view result covering typography, colours, borders, component dimensions, alignment, padding, margins and gaps. No unexplained layout/style difference passes. Start with zero intentional geometry/style drift; record any measured rasterization-only tolerance before using it. No automatic baseline acceptance, blanket masks or threshold inflation. Masks cannot conceal controls, text geometry or spacing. Existing mockup/token conflicts and scope-mandated changes (such as absent Editor or truthful unavailable feedback) must be explicitly identified and approved, not silently copied or ignored. A truly missing state requires a scoped approved reference before its implementation and capture; absence of a reference is blocked/unrun, not a visual pass.
- **Visual evidence and human inspection:** store captures locally under ignored `outputs/verification/sprint-002/<revision>/`; retain reference identity, reproducible commands and per-page dispositions in PR/Final Review. Re-render references from tracked HTML and safe assets; never depend on old private screenshots. Automated comparisons supplement, not replace, side-by-side human visual review. Lou accepts deviations/new visual states. This manual visual judgment is necessary because pixel equality alone cannot establish correct scope or design intent; missing comparisons or unresolved differences block visual acceptance. Screenshot verification stays with each story and is rerun across the delivered main pages in the final story. No exhaustive screenshot enumeration of all 18 steps or detailed states is required.

### Main-page checklist

Record reference → actual component/page → screenshot pair → result or explicit later-owner/exclusion in the owning PR and Final Review. Reuse a representative approved page when several demo steps share the same layout; do not add next-demo links or fabricated successful state transitions.

| Main surface / representative demo steps | Owning story | Coverage disposition |
| --- | --- | --- |
| Opening/session shell and four-tab navigation — demo 01 / Flow 1 opening | 002/S1–S3 | Main desktop/narrow comparison; actual login and conversation creation remain Phase 3 |
| Conversation and question/proposal review — demo 02–04, 09–11, 14, 16–17 | 002/S4 | Shared option/media review presentation; inspect is not choose; representative layout comparisons, not working generation |
| Script/edit/history — demo 02–03 | 002/S5 | Main view and representative editing/version controls |
| Assets/reference sheets/viewer — demo 04, 09–11 | 002/S5 | Main Assets and reference review layout; read-only prerequisites where needed |
| Library picker — demo 05–08 / library-picker-r92 | 002/S2–S3 Library read consumer and feedback/empty states; 003/S3 populated picker and attachment (user reassignment 2026-10-28) | Sprint 002: wired Library dialog and approved feedback/empty states; the shared search control is only region-matched against `library-picker-r92.html` `.lp-head`. Sprint 003 Story 3: the picker layout in the actual Library dialog (header/search, category pills, tile grid, selection), with categories/selection checked behaviorally; no pretend attachment |
| Storyboard/Shot/Panel planning — demo 12–13 | 003/S1 | Main board and representative planning edit layout |
| Videos/candidates/version review — demo 15–18 | 003/S1–S2 | Individual versions only; Play all/comparison excluded |
| Material input and single-clip access — demo 08–11, 15–17 | 003/S2–S3 | Main input/viewer surfaces; real transfer/private playback remain Phase 3 |
| Direct Export entry/read presentation — demo 18, in-scope Videos export direction | 003/S4 | Honest unavailable entry; scoped approval only for missing basic layout |
| Editor/Project/scene playback continuation | None | Explicitly excluded, not missing Phase 2 work |

### Stories
**Constraints:** Five implementation stories, each independently reviewable and targeting ≤5 logical commits including verification. Follow the order below. No source folders named after sprint/story IDs.

#### Story 1: Approved tokens and reusable UI foundations (P2-S1)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — independent sprint-doc-reviewer pass 1 found no Story 1 issues.
  - Resolution: N/A. Overall plan scored 4/5; final-story reporting clarification addressed below. Start checklist is confirmed at execution authorization.
- **As a** creator, **I want** the approved visual language implemented consistently, **so that** every workspace view uses familiar, accessible controls rather than divergent copies.
- **Dependencies:** accepted Sprint 001. Existing design approval applies to its in-scope pages; genuinely absent states require scoped visual approval before implementation.
- **Acceptance criteria:**
  - [x] Map the core pages/states to exact brand-book-linked references and record actual gaps in the PR. No broad redesign or reapproval of existing pages. Resolve proposal/estimate, session, basic error/loading/empty/unavailable gaps only where missing; detailed recovery remains assigned to P3/P4. Record new approvals in existing design guide/history.
  - [x] Implement canonical semantic tokens and only the shared primitives needed by this sprint: buttons/inputs, tabs, panels, dialog/popover and status/feedback presentation. Consumers share these modules; no copied page CSS, duplicate DTOs or premature general-purpose renderer. Preserve approved keyboard cues and focus treatment rather than imposing a conflicting style.
  - [x] Pin the needed React Aria and browser-test dependencies, prove compatibility with the existing cohort, and establish the browser/visual commands and deterministic capture environment described above. Test-only mounts are separate from production and cannot be selected through a production query flag.
  - [x] Approve any real token/mockup discrepancy and capture reference/application comparisons for the foundations used by downstream pages. Do not add excluded historical controls merely to match pixels.
- **Functional verification:**
  - [x] Browser component tests prove keyboard activation, disabled controls, tab selection, dialog focus entry/return and dismiss behavior; each assertion observes actual rendered controls. Visual captures compare the implemented primitives in their reference context.
  - [x] Run the screenshot comparator against a deliberate temporary spacing change; it must fail, then pass after restoration. No persistent defect or source-string test remains.
- **Regression verification:**
  - [ ] Run existing aggregate/check/build and frozen install/audit after dependency additions; clean smoke still starts without private browser settings and existing Vite private-file denial remains effective. *Final verification: aggregate/check/build/frozen install, clean smoke and Vite filesystem denial PASS; `pnpm audit` NON-PASS under user-approved exception B-002, so this item stays unchecked.*
- **Editorial/design verification:** compare token mappings and reference inventory with the existing guide; obtain scoped approval for new states/deviations. Record per-view evidence, not a new design system document.
- **Manual-only behavior verification:** side-by-side visual judgment under the shared Visual contract; pass only with no unexplained differences. Keyboard behavior is automated, not manual-only.
- **Planned commits:**
  1. Add pinned component/browser testing foundation and reproducible local capture commands.
  2. Implement shared tokens and focused primitives with interaction and visual checks.
  3. Record approved reference mappings, deviations and dependency evidence in existing records.
- **Technical notes:** keep presentation in web; React-free contracts/client stay React-free. Story 1 establishes the browser runner; Story 2 extends it to real backend wiring, avoiding a dependency cycle. No new global state framework is implied.

**Story 1 delivery:** [PR #11](https://github.com/cslou/workprint/pull/11), accepted code head `156b3635b8822e17e5c922e7cda4f23f21c521f8`, merged into sprint-002 at `3dd9cfd816aa8a96c84733d23d8555f21f6fa18e`. Seven independent checks completed with no findings, meta-review 5/5. Current-head aggregate 13/13, browser 5/5, foundation-region visual comparisons 24/24, check/build/frozen install/audit passed; two B-001 ingress leaves still failed separately. Zero pixel drift in compared primitive regions and temporary spacing negative control proved sensitivity. Orchestrator inspected paired desktop opening and narrow viewer screenshots; this is AI inspection, not new human approval. These fixtures are reference-context primitive mounts, not implemented product pages. Main-page human review remains at Phase 2 handoff; absent session/proposal/error/export layouts remain scoped approval gates for their owning slices. Post-merge check passed; complete evidence and gap inventory are in PR #11. No new layout/deviation was approved, no planning file was changed by the worker, and no main merge occurred.

#### Story 2: Browser-to-backend connectivity and scoped request handling (P2-S2a)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — independent sprint-doc-reviewer pass 1 found no Story 2 issues.
  - Resolution: N/A. Start checklist is confirmed at execution authorization.
- **As a** developer, **I want** one safe browser client composition and reusable request-state handling, **so that** genuine UI actions reach the backend without leaking secrets or replaying commands.
- **Dependencies:** Story 1; existing api-client and actual authorized development Auth fixtures.
- **Acceptance criteria:**
  - [x] Supply an explicit public API-origin configuration seam without passing backend environment/secrets through Vite or weakening backend rejection of browser config. Missing configuration is explicit and cannot fall back to a production endpoint. Credential-free build/health-only smoke remains supported.
  - [x] Connect an actual Library view consumer to api-client and the built backend; valid synthetic Auth receives 501 and missing/invalid Auth receives 401 with distinct user feedback. No arbitrary API-test button is added to production. Qualify browser-origin/preflight behavior for local dev and built serving; any CORS adjustment stays narrowly scoped to intended origins/methods/headers and existing route restrictions.
  - [x] Share request settlement, error presentation and scope invalidation only where used. Cancellation/unmount/scope change discards late results and never retries mutations. Support the injected token-provider interface, without implementing or pretending a sign-in/session-refresh product.
  - [x] Browser network instrumentation rejects non-authorized egress and proves the guard using a deliberate blocked request. Real test tokens are ephemeral and absent from bundles, captured logs and screenshots. Isolated test mounts/props are absent from the production build.
- **Functional verification:**
  - [x] Actual browser Library load crosses its intended origin boundary into real admission and renders distinct unavailable/unauthenticated outcomes. Observe request method/path and verify no domain/native writes or inference.
  - [x] Controlled delayed/failing response tests show timeout/error settles loading and a late result from old scope is discarded; unmount/reconnect never duplicates a mutation. These are UI-race evidence, not real backend success claims.
- **Regression verification:**
  - [x] Retain client deadline/no-native-network and real Auth/route matrices; run check/build, browser secret scan and Vite filesystem-denial tests after public-config/import changes. No wildcard origin or broad workspace filesystem allowlist replaces current restrictions.
- **Editorial/design verification:** compare the Library empty/unavailable/error presentation to approved references and scoped new-state approvals; include its paired screenshots.
- **Manual-only behavior verification:** shared Visual contract; all transport and race assertions automated.
- **Planned commits:**
  1. Add minimal public configuration and shared browser client/request composition with tests.
  2. Connect Library consumer and extend browser harness to real Auth/backend with safe cleanup.
  3. Verify dev/built origin, exposure, credentials and UI error-state evidence.
- **Technical notes:** reuse `apps/api/test/auth-built-fixture.ts` through a narrow test interface rather than importing test code into production. Public browser settings and backend settings have separate whitelists. API contract expansion or a new server is not part of this story.

**Story 2 delivery:** [PR #12](https://github.com/cslou/workprint/pull/12), accepted code head `180ec4269a51bd048e8bf8c0338c3c9f48626e29`, merged into sprint-002 at `e7b442c60d812ba761c7966b411d3bbb6ff08d90`. Before implementation, the user approved one scoped visual state: the Library's five feedback messages (sign-in required, unavailable, loading, error, missing configuration) reuse the `demo-05.html#lib-yours` two-line empty-state treatment with no new banner, colours or recovery controls. The approval is recorded in `docs/design/design.md#library-feedback` and `docs/design/history.md`; it does not cover session, proposal or export layouts. Initial review at `ac443a9` (seven checks) found one P2 logic issue, meta-review 4/5: an A → null → A scope with a stable client briefly resurrected settled feedback. Fix cycle 1 added render-phase invalidation and a red/green layout-effect regression; `/review-fix` coverage was complete with no regressions, 5/5. Current-head aggregate 13/13, browser 11/11, visual 48/48 (24 Library pairs with zero region and full-page drift), check/build/frozen install passed. `pnpm audit` became NON-PASS that day on inherited `deepmerge@4.3.1` (GHSA-gcqx-w48m-w2h4); the user approved deferring it as private/local exception B-002, so it is reported separately, not as a pass. Two B-001 ingress leaves still failed separately. Earlier head `7b05c48` was a browser NON-PASS from a Vite dependency-discovery reload, fixed by explicit prebundling rather than retries. Orchestrator inspected the desktop 401 pair at 1440; this is AI inspection, not human approval. Post-merge check passed. No planning file was changed by the worker, and no main merge occurred.

#### Story 3: Responsive shell, session presentation and navigation (P2-S2b)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — independent sprint-doc-reviewer pass 1 found no Story 3 issues.
  - Resolution: N/A. Start checklist is confirmed at execution authorization.
- **As a** creator, **I want** the approved navigation and four workspace tabs, **so that** I can find each area and understand which capabilities are unavailable.
- **Dependencies:** Stories 1–2.
- **Acceptance criteria:**
  - [x] Implement desktop/narrow shell, New video, Recents, Library, session/sign-in presentation and Script/Assets/Storyboard/Videos tabs. Working navigation does not manufacture a saved conversation or successful login. Native create/list/load actions use the existing no-network unavailable methods; unavailable session actions are labelled honestly pending P3-S1a.
  - [x] Workspace/Library reads use the actual application client where scope exists. Absent scope shows a deliberate empty/unavailable state, not a synthetic account or guessed conversation ID. Only isolated component tests supply read-only scope/data prerequisites.
  - [x] Switching account/conversation or clearing the session presentation clears scoped view state; late responses cannot repopulate another scope. Focus/navigation work at desktop, narrow and the breakpoint; no inaccessible hidden-only navigation replaces missing narrow controls.
- **Functional verification:**
  - [x] Browser tests navigate every shell destination by pointer and keyboard, preserve intended tab navigation and show unavailable native outcomes without HTTP/token calls. Delayed response tests switch two accounts/conversations and assert old content never appears in the new scope.
  - [x] Screenshot each shell/session/Library/empty-tab view at matched desktop/narrow reference states, checking dimensions, paddings, spacing and overflow.
- **Regression verification:**
  - [x] Re-run Story 1 component/visual checks and Story 2 real Library/Auth/config tests; existing root smoke still starts from a clean committed export and excludes private files.
- **Editorial/design verification:** use the brand-book-linked opening/demo/Library references; ask only for genuinely missing session/narrow states. A displayed example must not be presented as account-owned work.
- **Manual-only behavior verification:** shared Visual contract; navigation, keyboard and scope races are automated.
- **Planned commits:**
  1. Compose shell and navigation from shared components with honest session/native-unavailable presentation.
  2. Add scoped navigation state and stale-response protection using shared request handling.
  3. Add real-browser navigation, scope-race and page/reference visual proof.
- **Technical notes:** no custom conversation store, fake recents or hidden sample account. Later feature views replace empty bodies without duplicating shell markup.

**Story 3 delivery:** [PR #13](https://github.com/cslou/workprint/pull/13), accepted code head `ddcb1d2cf1722b30ea985b2ec84521ada573e0dc`, merged into sprint-002 at `8db29adc9687a70b03e67702f03b4bab722f3b46`. Before implementation, the user approved the remaining Phase 2 unseen states from one proposal round, with copy corrections; the preview marker and test-fixture wording were removed. The approved copy is recorded in `docs/design/design.md#shell-and-remaining-phase-2-feedback` and `docs/design/history.md`: Story 3 session/narrow-navigation/native-unavailable states, plus later-story approvals for the Story 4 proposal card, the nine Story 4–5 action-feedback lines and Sprint 003 Story 4 Export. Initial review at `3d3ce97` (seven checks) scored 2/5 with two P1s. P1-A: failed workspace reads showed native-load copy inline. P1-B: the scope-isolation test switched account and conversation together and asserted too early. During the fix the user approved workspace-read failure text in the current tab's dashed empty box (401 "Sign-in required to load this video.", 501 "Loading this video is not available yet.", any other failure "This video could not be loaded. Nothing was changed."). `/review-fix` plus an additional semantic scan had complete coverage, both P1s resolved and no new findings, 5/5. Current-head aggregate 13/13, browser 29/29, visual 100/100 (zero drift), check/build/frozen install passed; `pnpm audit` NON-PASS under B-002 and two B-001 ingress leaves still failed, both reported separately. At `9f59d59` the aggregate was 12/13 from a stale smoke assertion, fixed in `3d3ce97` without weakening it. Orchestrator inspected the 1440 read-error pair; this is AI inspection, not human approval. For the Phase 2 handoff review: an "Open conversation" sidebar link, not in the approved copy, appears only when a conversation ID is supplied, which only test compositions do in Phase 2. Post-merge check passed. No planning file was changed by the worker, and no main merge occurred.

#### Story 4: Conversation-unavailable and exact question/proposal controls (P2-S3)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — independent sprint-doc-reviewer pass 1 found no Story 4 issues.
  - Resolution: N/A. Start checklist is confirmed at execution authorization.
- **As a** creator, **I want** clear question/proposal review and unavailable chat feedback, **so that** I never mistake a typed message or failed action for approval or completed work.
- **Dependencies:** Stories 1–3; scoped visual approval only for proposal/disclosure/estimate or other states not in approved flows.
- **Acceptance criteria:**
  - [x] Actual question/proposal readers and option-answer controls use their application methods. Answer requests preserve question ID/revision/option and operation identity. Show exact scope/inputs/provider/model and informational estimate/basis or unknown; no editable proposal, spending gate or model selector.
  - [x] On 501/error, keep the question pending and show no approval, generation request or completed assistant reply. Typed text never becomes an answer; preserve unsent text when the native method returns unavailable.
  - [x] Send/queue/subscribe/Stop presentation invokes only the existing local unavailable-native boundary, without invented payload/stream protocol. Remount/reconnect never sends/replays commands; disconnect/unmount sends neither Stop nor generation cancellation.
- **Functional verification:**
  - [x] Mount actual production question/proposal components with labelled read-only prerequisites and real token-provider/API client. Observe exact GET/answer requests against built backend, distinct 401/501 and unchanged pending state; no fabricated saved decision.
  - [x] Instrument native calls/network: typing while pending, send/queue/Stop and remount produce local unavailable feedback, zero native requests and no answer/cancel side effect. Compare all delivered question/chat/proposal states with their approved references.
- **Regression verification:**
  - [x] Re-run shell/account-switch, Library and shared dialog/feedback checks; client/schema/error regression suites retain exact-binding and no-network behavior.
- **Editorial/design verification:** compare approved demo question layouts with current spec authority; old demo typed-answer/cost omissions cannot override exact option approval and disclosure. Record approved differences rather than silently replicating obsolete behavior.
- **Manual-only behavior verification:** shared Visual contract; requests, pending-state preservation and no-replay checks automated.
- **Planned commits:**
  1. Add shared question/proposal presentation and intended read/answer consumers.
  2. Wire unavailable-native conversation controls and input preservation.
  3. Add real-backend browser, no-replay and reference screenshot verification.
- **Technical notes:** P3-S7 owns real decisions; P3-S1b/S1c owns native turns; P4-S4/S8/S9 owns creation and execution. Test prerequisites grant no product authority.
- **User decisions (2026-10-28):** question cards render the options carried by the question record, using its labels. The option set and wording are not fixed by design; a later-phase producer, possibly an agent tool that generates the question UI, owns them. The approved composer placeholder is unchanged. The remaining proposal-card copy and action-feedback lines are recorded in `docs/design/design.md#shell-and-remaining-phase-2-feedback`.

**Story 4 delivery:** [PR #14](https://github.com/cslou/workprint/pull/14), accepted code head `a88258e602785e719345904b0a93f37c2e7062f6`, merged into sprint-002 at `0407f7bbfbb8eb93ef6c82452d0a0fb39675521e`. Before implementation, the user approved chat feedback in the approved action-feedback style: Send "Sending messages is not available yet. Your message is kept.", keeping the text, and Stop "Stopping is not available yet.", reachable in Phase 2 only through a labelled working prerequisite. Recorded in `docs/design/design.md` and `history.md`. Shot/Panel numbering derives from the workspace storyboard. Proposal input display names have no typed contract source, so the card fails closed: no proposal details and no proposal approval without a name, and names come only from labelled test prerequisites. This is a known Phase 3 gap disclosed in the PR. Initial review at `5946c45` (seven checks) scored 2/5 with two P1s and two P2s. P1-A: a cached pending read overrode a superseded question. P1-B: prompt/settings/disclosures were unproven. P2-C: an inherited display-name lookup. P2-D: composer styles split across files. Fix cycle 1 resolved all four, but the regression scan found P1-E: a terminal prop blocked a newer server revision. Fix cycle 2 made newer revisions win while terminal props still beat equal or older pending reads; `/review-fix` coverage complete, no new findings, 5/5. Each fix had red/green evidence. Current-head aggregate 13/13, browser 50/50, visual 112/112 (all 12 question/proposal/answer/send pairs zero drift), check/build/frozen install passed; `pnpm audit` NON-PASS under B-002 and two B-001 ingress leaves still failed, both reported separately. Orchestrator inspected the 1440 proposal pair; this is AI inspection, not human approval. Post-merge check passed. No planning file was changed by the worker, and no main merge occurred.

#### Story 5: Script, Assets and exact-version controls (P2-S4)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — independent sprint-doc-reviewer pass 1 found no Story 5 issues.
  - Resolution: N/A. Start checklist is confirmed at execution authorization.
- **As a** creator, **I want** approved Script/Assets views and exact-version edit/use controls, **so that** inspecting work never implies a saved or approved change.
- **Dependencies:** Stories 1–3; shared feedback from Story 4 where applicable.
- **Acceptance criteria:**
  - [x] Render Script, reference sheets, viewers and version history from supplied public projections using shared components. Wire workspace/version/history reads and manual save/use to the intended existing operation keys; do not invent content schemas or a new authoring product.
  - [x] Save carries exact base/version/dependencies and operation ID; use carries exact version/purpose. Not-implemented/transport errors preserve unsaved text and prior displayed versions/uses. Viewing/history sends no approval and never falls back to an unrequested latest version.
  - [x] Empty ordinary app remains empty. Isolated read-only examples exercise real frontend controls through the backend; they do not become production seeded records, persisted edits or working media playback.
- **Functional verification:**
  - [x] Browser component/wiring tests exercise exact reads/save/use on built backend and assert correct payloads, 501 feedback, unchanged version/approval and retained edits. Test viewing with a mutation-request trap; no mutation may occur.
  - [x] Screenshot Script, Assets/reference viewer, version/history, edit and error/unavailable states against matching approved flow/demo references at both required sizes.
- **Regression verification:**
  - [x] Re-run shared shell, dialog, question and account-switch/browser tests plus contracts/client tests; unchanged input must survive error and navigation paths that retain its editing scope without leaking across accounts.
- **Editorial/design verification:** check Script/reference terminology and token consistency; preserve existing approved layout rather than duplicating CSS for each tab. Actual rich content validation and persistence stay with P3-S2/S4/S5.
- **Manual-only behavior verification:** shared Visual contract; edit preservation and action identities automated.
- **Planned commits:**
  1. Compose Script/Assets/version views from shared primitives and public projections.
  2. Wire exact reads/save/use with preserved-input failure handling.
  3. Add actual-consumer browser and complete reference comparison evidence.
- **Technical notes:** extract shared version/viewer logic where used by both areas, without a god component or cross-feature imports. Material attachment and private access remain Sprint 003/Phase 3 respectively.

**Story 5 delivery:** [PR #15](https://github.com/cslou/workprint/pull/15), accepted code head `84849c165e256287a2b45b946ce71f316c60610d`, merged into sprint-002 at `50b2a3c6f3ce18e37cb32239313eddd1f052ec0f`. During implementation, the user approved the Script inline edit state: the section pencil turns the text into a typing box in the same panel, fonts and colours; the buttons are Cancel, then Save; Cancel restores the displayed version; Save keeps the typed text and uses the approved Save feedback. Recorded in `docs/design/design.md` and `history.md`. Script and reference content is untyped domain JSON in the contracts, so production renders typed projections only (such as storyboard Shot intents) and shows the approved empty text otherwise; rich content comes only from labelled read-only test prerequisites. This is a known Phase 3 gap disclosed in the PR. Initial review at `8fc83fd` (seven checks) scored 3/5 with one P1 and three P2s. P1-A: no Save/Use transport-failure proof. P2-B: concurrent Use completions could downgrade the selection. P2-C: no way back to the current version after viewing an earlier one. P2-D: the new `--font-line-height-1-55` token (from approved `app-r11.css`) was missing from the design table. A request for per-state error screenshots was dismissed because the user limited screenshots to main pages with representative states; P1-A proves the exact copy functionally. Fix cycle 1 resolved P1-A, P2-B and P2-D, with a wrong-copy negative control, but the regression scan found P1-E: history navigation discarded unsaved drafts. Fix cycle 2, an orchestrator implementation decision rather than a design approval, made earlier versions viewed from history read-only, because the contract rejects any non-latest `baseVersionId` with `stale_revision`. This removes a control and adds no visual state. The supplied version's body stays mounted, hidden and inert, so its draft survives viewing history and returning; drafts clear on account, conversation or artifact change. `/review-fix` coverage complete, P1-E and P2-C resolved, no new findings, 5/5. Each fix had red/green evidence. Current-head aggregate 13/13, browser 72/72, visual 136/136 (24 Script/Assets/viewer/history/edit/save/use pairs zero drift with two-sided geometry), check/build/frozen install passed; `pnpm audit` NON-PASS under B-002 and two B-001 ingress leaves still failed, both reported separately. A shared-foundation correction (`.wp-panel-body[inert] { display: none; }`) left all earlier comparisons unchanged. Orchestrator inspected the 1440 edit-state pair; this is AI inspection, not human approval. Post-merge check passed. No planning file was changed by the worker, and no main merge occurred.

#### Final Story: Sprint Verification & Completion
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Uses the story sections above and the existing regression suite as the verification source of truth
  - [x] Defines where final verification evidence will be recorded
  - [x] Includes full regression verification, not only areas believed to be touched
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1, P2/check-8 — explicitly require all canonical verification types, including zero-count rows and reasons for Unknown counts. Overall 4/5, ready to start subject to authorization.
  - Resolution: Added the complete reporting requirement to the acceptance criterion below; no executable scope or checks weakened. Descriptive correction reviewed editorially.
- **As a** maintainer, **I want** all sprint functional verification and all available regression verification run, **so that** the sprint can be integrated with evidence that new behavior works and existing behavior did not regress.
- **Dependencies:** All implementation stories.
- **Acceptance criteria:**
  - [x] Every story’s acceptance criteria are evaluated against implementation evidence.
  - [x] Every story’s functional verification checkboxes are run, checked, or explicitly marked failed/ambiguous/unrun.
  - [x] Every story’s targeted regression verification checkboxes are run, checked, or explicitly marked failed/ambiguous/unrun.
  - [x] The full available regression verification suite is run, including existing unit, integration, e2e, smoke, simulator/browser/device, static, and manual-only checks where applicable. *Accepted state: every automated suite ran at `b1a3e1e`. The manual-only human side-by-side visual review was not performed here; the user deferred it to Lou's Phase 2 (`phase-2` → `main`) review on 2026-10-28. Lou performed it there on 2026-10-29.*
  - [x] Failed, ambiguous, manual-only, or unrun verification items are documented. B-001's two failed ingress leaves are reported separately under the unchanged private-only exception, not as passes. B-002's audit advisory is likewise reported as NON-PASS, not as a pass.
  - [x] Reusable new functional checks are identified as future regression verification; one-off editorial evidence is not counted as a suite.
  - [x] Verification delta reports all 11 canonical types: Unit; Integration / contract; E2E / smoke; Simulator / device; AI / model evals; Static / local checks; Performance / load; Security / dependency; Accessibility / visual; Manual-only; Other verification. Include every row, even zeros, with before sprint, added this sprint, removed, pending/not yet run, and after sprint totals. Explain any Unknown count; classify each method under its most specific type and avoid duplicate counts. Report command groups separately from behavioral cases.
  - [x] The sprint doc status is updated to `🟢 Complete` only if completion criteria are met.
  - [x] A `## Final Review` section is appended to the sprint doc with the final completion message quoted for auditability.
  - [x] Capture all delivered MAIN pages in the Main-page checklist against corresponding approved full-size references at desktop/narrow sizes. Record paired screenshots, overlays/diffs, source/revision and style/spacing inspection; no unexplained difference or missing required main-page pair passes. Obtain Lou's approval for deviations or genuinely new layouts. Re-run earlier main-page comparisons after shared-component changes. Representative state screenshots suffice; functional tests still cover implemented interactions without simulating missing features. *Accepted state: every Sprint 002-owned main-page pair is captured with zero drift; the populated Library picker was reassigned to Sprint 003 Story 3 (user decision). No deviations needed approval. Human side-by-side review was deferred to Lou's Phase 2 review, where Lou performed it on 2026-10-29.*
- **Functional verification:**
  - [x] Run all functional verification items from every story and record pass/fail evidence, including real-browser component → client → backend actions, explicit native unavailable outcomes and visual comparison commands.
- **Regression verification:**
  - [x] Run all targeted regression verification items from every story and record pass/fail evidence.
  - [x] Run the full available regression verification suite and record pass/fail evidence: aggregate, browser, visual, check/build, frozen install/audit where applicable, and separate ingress qualification. Preserve earlier security, clean-start, contract and process checks.
- **Editorial/design verification:** reconcile reference/page inventory with all created views and their basic states; inspect DRY component ownership and approved token use. Summarize evidence in this Final Review and PRs; captures/logs remain ignored. No prose-presence tests.
- **Manual-only behavior verification:** perform the shared Visual contract's side-by-side review for every required main-page pair, including padding/margins/gaps and narrow overflow; pass only when all differences have an explicit accepted disposition. No manual substitute for automatable interaction tests.
- **Planned commits:**
  1. Record final verification evidence, canonical delta, new dependencies and sprint completion state.
- **Technical notes:** use story checks plus the actual existing suites as source of truth. Worker gathers evidence and stops; orchestrator updates planning records, verifies and independently reviews the resulting head before acceptance under canonical `workflow-prompts/handle-sprint-completion.md`. Failed/unrun remains non-pass. No new QA harness here. Integration needs explicit user merge authorization. Sprint 002 integrates into phase-2 under the user's explicit authorization; Sprint 003 then branches from updated phase-2, never from unmerged sprint-002. phase-2 → main remains reserved for the user's final review/approval.

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
- Every required main page has its matched reference screenshot and accepted visual comparison, including fine spacing and consistent shared styling. B-001 does not waive visual or other current-scope checks.

## Final Review

> **Mergeability:** Pending — resulting-head review required. Story PRs #11–#15 were each accepted at 5/5 on their own heads; that is history, not a verdict on this record.
>
> ### Sprint objective + accomplishments
>
> **Objective:** render the approved core workspace as reusable React components, with real application-client wiring for questions and Script/Assets controls, truthful unavailable outcomes, and page-by-page visual parity evidence.
>
> **What was accomplished:**
> - **Story 1 — Approved tokens and reusable UI foundations** ([PR #11](https://github.com/cslou/workprint/pull/11)). Canonical semantic tokens and the shared React Aria primitives (controls, tabs/panel, dialog/popover, status), plus pinned Playwright browser and visual commands with a deterministic pixel comparator. The comparator's spacing canary proves it fails on drift.
> - **Story 2 — Browser-to-backend connectivity** ([PR #12](https://github.com/cslou/workprint/pull/12)). An explicit public API-origin seam and an actual Library consumer through api-client to the built backend, showing distinct 401/501 feedback. Includes CORS and egress guards, secret isolation, and scoped request settlement that never resurrects stale results or replays mutations.
> - **Story 3 — Responsive shell, session presentation and navigation** ([PR #13](https://github.com/cslou/workprint/pull/13)). Desktop and narrow shell, four-tab workspace, approved session and native-unavailable presentation, and account-only/conversation-only scope isolation. Workspace-read failures show the approved text in the tab's empty box.
> - **Story 4 — Conversation-unavailable and exact question/proposal controls** ([PR #14](https://github.com/cslou/workprint/pull/14)). Record-owned question options with exact answer payloads, and proposal details that fail closed. Send and Stop stay local and unavailable, keeping typed text. Newer revisions win; terminal state never downgrades.
> - **Story 5 — Script, Assets and exact-version controls** ([PR #15](https://github.com/cslou/workprint/pull/15)). Script, reference sheets, viewer and version history from typed projections, with the approved inline edit. Exact Save and Use payloads; drafts retained across tabs, history and failures without crossing accounts, conversations or artifacts. Earlier versions are read-only.
>
> ### Final-run command results (`b1a3e1e34cbd1670f467e911eeaa4e216d64b4dc`, code identical to merge `50b2a3c`)
>
> | Command | Result |
> | --- | --- |
> | `pnpm install --frozen-lockfile` | PASS |
> | `pnpm check` | PASS (strict types, lint, dependency boundaries and negative controls) |
> | `pnpm build` | PASS |
> | `pnpm test` (aggregate, private loopback Auth fixtures) | **13/13 PASS** |
> | `pnpm test:browser` | **72/72 PASS** |
> | `pnpm test:visual` | **136/136 PASS**, all pairs zero drift |
> | `pnpm qualify:ingress` | **NON-PASS** (exit 1): two unfinished-upload deadline leaves fail; user-approved private/local exception **B-001** |
> | `pnpm audit` | **NON-PASS** (exit 1): inherited low `deepmerge` GHSA-gcqx-w48m-w2h4, no patched version; user-approved private/local exception **B-002** |
>
> Logs are in `/tmp/workprint-s002-final/s002-final-*.log` and captures in ignored `outputs/verification/sprint-002/b1a3e1e34cbd1670f467e911eeaa4e216d64b4dc/`. Neither is committed.
>
> ### Main-page checklist results
>
> | Main surface | Reference (tracked) | Result at 1440 / 390 / 820 / 821 |
> | --- | --- | --- |
> | Opening/session shell and four-tab navigation | `flow2-step1-r73.html#p-script`, `flow1-step4-r85.html#look-a`, plus approved session/menu/native substitutions | 52 full-page pairs, zero pixel drift. Navigation is narrow-only; feedback states at 1440/390 |
> | Conversation and question/proposal review | `flow2-step2-r74.html#q1`, `flow2-step6-r78.html#plan` | 12 pairs, zero drift, two-sided geometry recorded |
> | Script/edit/history | `flow2-step2-r74.html#p-script`, r82 history, approved inline edit | 12 pairs, zero drift, two-sided geometry |
> | Assets/reference sheets/viewer | `flow2-step10-r82.html#p-assets`/`#sheet-vale` | 8 pairs plus Save/Use lines at 1440/390, zero drift, two-sided geometry |
> | Library (Sprint 002 part) | `demo-05.html#lib-yours`; `library-picker-r92.html` `.lp-head` for the search primitive only | 24 Library dialog feedback/empty pairs, zero drift. The search primitive is region-matched inside the reference page, not composed in the Library dialog |
> | Library picker layout | `library-picker-r92.html` | **Reassigned to Sprint 003 Story 3** by the user on 2026-10-28; not built in Sprint 002. The Library dialog has no header/search, categories or tiles yet, and a successful read renders nothing. Integration review found the header/search had been overstated as delivered; corrected here |
> | Storyboard; Videos; material input; Export | — | Later owners: Sprint 003 Stories 1–4 |
> | Editor/Project/scene playback | — | Excluded |
>
> Shell pairs have no separate geometry file. Their full-page captures are pixel-identical, which is stronger evidence for dimensions, padding and overflow. The 24 foundation pairs are region comparisons of primitives, not page acceptance.
>
> ### Verification delta
>
> | Verification type | Before sprint | Added this sprint | Removed | Pending / not yet run | After sprint | Notes |
> | --- | ---: | ---: | ---: | ---: | ---: | --- |
> | Unit | 0 | +3 | 0 | 0 | 3 | Workspace/proposal helpers |
> | Integration / contract | 6 | +39 | 0 | 0 | 45 | Isolated component → client → built backend, races, exact payloads |
> | E2E / smoke | 1 | +16 | 0 | 0 | 17 | Shell navigation/admission journeys; clean-export smoke retained |
> | Simulator / device | 0 | 0 | 0 | 0 | 0 | Not applicable; Chromium is browser verification |
> | AI / model evals | 0 | 0 | 0 | 0 | 0 | No enabled model |
> | Static / local checks | 0 | 0 | 0 | 0 | 0 | `pnpm check` reported as a command group |
> | Performance / load | 0 | 0 | 0 | 0 | 0 | Not applicable |
> | Security / dependency | 8 | +5 | 0 | 0 | 13 | Config/CORS/secret/egress cases; includes two failing B-001 leaves. Audit NON-PASS is a command result, not a case |
> | Accessibility / visual | 0 | +145 | 0 | 0 | 145 | 136 visual comparisons plus 9 keyboard/focus cases |
> | Manual-only | 0 | 0 | 0 | 0 | 0 | Human side-by-side review is one open acceptance gate, not a counted case |
> | Other verification | 0 | 0 | 0 | 0 | 0 | Editorial evidence is not a suite |
> | **Total** | **15** | **+208** | **0** | **0** | **223** | 221 passing plus 2 B-001 failing leaves |
>
> Counting basis: unique Node leaf cases plus expanded Playwright cases, each classified once (inventory `/tmp/workprint-s002-final/verification-cases.tsv`). Command groups are separate: frozen install, check, build, aggregate, browser, visual, ingress and audit. Regression summary: 0 existing regression checks pending; 223 behavioural cases plus 8 command groups referenced.
>
> ### Why ready
> - Every story AC was evaluated against final-run evidence and passes. The populated Library picker was reassigned by the user, not waived.
> - All functional items pass at the final head, including real-browser component → client → built-backend 401/501, local native-unavailable outcomes and all visual comparisons.
> - The full regression suite ran. Its only non-passes are the user-approved B-001 and B-002 exceptions, reported separately; Story 1's audit item therefore stays unchecked.
> - Each story PR passed seven-check review, with `/review-fix` after any fix cycle, and was accepted at 5/5 before merge. This record's head still needs its own review.
>
> ### Open for your decision
> - [x] Human side-by-side review of the Sprint 002 main-page pairs. Deferred to Lou's Phase 2 (`phase-2` → `main`) review, as agreed; **Lou performed it on 2026-10-29.** Automated comparisons show zero drift; orchestrator AI inspection is not human approval.
> - [ ] The "Open conversation" sidebar link. It appears only when a conversation ID is supplied, which only test compositions do in Phase 2, and is not in the approved copy.
> - [ ] Known Phase 3 gaps: untyped Script/reference content and proposal input display names (B-003). Production fails closed; rich content comes only from labelled read-only test prerequisites.
> - [ ] B-001 and B-002 must be resolved before Phase 3 native-runtime qualification and any shared or public deployment.
> - [ ] Same-scope workspace re-read (found in integration review). A new read in the same account and conversation shows the loading skeleton in place of the tab content, discarding open Script drafts. No Phase 2 path triggers it: `main.tsx` creates one connection and nothing re-reads. Phase 3 must design re-read and refresh presentation (stale content versus skeleton) before adding refreshes after saves or turns.
>
> ### Delivered
>
> | Story | Item | Status | Evidence |
> | --- | --- | --- | --- |
> | 1 — Foundations | AC-1–AC-4 | ✅ | PR #11 gap inventory; `design.md`/`history.md`; `interaction.spec.ts`; `config.spec.ts`; `visual.spec.ts` |
> | 1 — Foundations | F-1 keyboard/focus/dismiss; F-2 comparator canary | ✅ | `interaction.spec.ts:5,28,40,71`; `visual.spec.ts` spacing mutation |
> | 1 — Foundations | R-1 aggregate/check/build/frozen/audit | ⚠️ NON-PASS (B-002) | Audit only; everything else passes |
> | 2 — Connectivity | AC-1–AC-4, F-1, F-2, R-1 | ✅ | `connectivity.spec.ts:15,93,117`; `config.spec.ts:4`; client/auth/web-files suites |
> | 3 — Shell | AC-1–AC-3, F-1, F-2, R-1 | ✅ | `shell.spec.ts:15,33,70,86,169`; `shell-admission.spec.ts:6`; `shell-visual.spec.ts` (52 pairs) |
> | 4 — Questions/proposals | AC-1–AC-3, F-1, F-2, R-1 | ✅ | `question.spec.ts:8,16,34,138`; `chat.spec.ts:3`; `question-visual.spec.ts` (12 pairs) |
> | 5 — Script/Assets/versions | AC-1–AC-3, F-1, F-2, R-1 | ✅ | `version.spec.ts:21,41,100,135`; `version-races.spec.ts:3`; `material.spec.ts:3,17`; material visual specs (24 pairs) |
> | Final — Verification | Automated suites, evidence and records | ✅ | This record; `/tmp/workprint-s002-final/evidence.md` |
> | Final — Verification | Manual-only human side-by-side visual review | ✅ Performed by Lou, 2026-10-29 | Lou's Phase 2 review; see Open for your decision |
>
> ### Editorial/design observations (no blocking finding)
> No hard-coded production colours exist outside `ui/tokens.css`. Remaining raw values are layout maxima/viewport deductions (for example 240px, 150px, 78vh and popover maxima), SVG stroke widths and media-query breakpoints, which CSS custom properties cannot express. One sheet kicker repeats the `1.4px` tracking-token value. `VersionUse` styles live in `versions/review.css` and proposal styles in `question.css`, each beside its only consumer. Candidates for tidy-up when those modules are next touched.
>
> ### Drift from spec
> - No new product flow. The populated Library picker moves from Sprint 002 to Sprint 003 Story 3 within Phase 2 (user decision); the implementation spec is unchanged.
> - Earlier versions viewed from history are read-only, following the spec's `stale_revision` rule for non-latest bases.
>
> ### New Dependencies
> - `react-aria-components` 1.22.1: specified accessible primitives (PR #11).
> - `@playwright/test` 1.64.1: pinned real-browser and visual runner (PR #11).
> - `pngjs` 7.0.0 and `@types/pngjs` 6.0.5 (dev): exact pixel diff and overlay output without threshold libraries (PR #11).
> - Internal workspace packages `@workprint/api-client` and `@workprint/contracts` added as web consumers (PR #12); not external dependencies.
