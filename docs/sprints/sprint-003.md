# Sprint 003 — Media controls and frontend wiring acceptance

**Date:** Authorized 2026-10-28; begins after Sprint 002 integrates into phase-2
**Goal:** Complete the approved Storyboard/Videos, playback, material-input and export consumers, and demonstrate every intended Phase 2 application surface through actual frontend wiring with complete visual comparison evidence.
**Status:** 🟢 Complete

**Planning result:** independent pass 2 scored **5/5**, no findings in this plan; the earlier delta-reporting clarification is resolved. Execution is authorized but waits for Sprint 002 acceptance/integration into phase-2 and a fresh baseline check. Confirm the start checklists then; prior review notes below remain historical. **Start (2026-10-28):** Sprint 002 integrated into `phase-2` at `1b5aa39`; `sprint-003` branched from it. Baseline refreshed in Current state. A sprint-doc-reviewer start re-check scored 4/5 ("Ready to start") with one Story 3 P2, resolved below. Start checklists confirmed.

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`
- **Tech stack:** React/Vite/TypeScript, React Aria and the pinned browser test toolchain delivered by Sprint 002; framework-free api-client/contracts; one Mastra backend with real Supabase admission/Postgres. Framework-free `player` is introduced only for an actual single-clip interface, not an empty package.
- **Current state:** Sprint 002 is accepted and merged into `phase-2` at `1b5aa39` (integration [PR #17](https://github.com/cslou/workprint/pull/17); stories PRs #11–#16, plus integration fixes PR #18). Delivered and reusable: canonical tokens; React Aria primitives (`apps/web/src/ui/`); public API-origin config and the scoped-read/settlement hook (`api/`); the responsive Shell with session/native-unavailable presentation and four tabs (`shell/`); the Library read consumer with feedback/empty states (`library/`); question/proposal review and the composer with a scope-owned draft (`conversation/`); and Script/Assets/reference viewer with exact-version edit/history/use (`materials/`, `versions/`). Storyboard and Videos tabs show only their approved empty text. The Library dialog renders nothing for a successful read, and has no picker header/search, categories or tiles; Story 3 now owns these (user decision 2026-10-28). Verification toolchain: `pnpm test:browser` and `pnpm test:visual` (Playwright 1.64.1, pngjs comparator, test mounts under `apps/web/test/` with a shared reference loader). **Fresh baseline at the `phase-2` tree (identical to the fully verified `02c4cf8`):** frozen install, check and build PASS; aggregate 13/13; browser 75/75; visual 136/136 with zero drift. `pnpm qualify:ingress` NON-PASS (B-001, two leaves) and `pnpm audit` NON-PASS (B-002). Post-merge `pnpm check` PASS at `1b5aa39`. Open Phase 2 handoff items carried from the Sprint 002 Final Review: human main-page review, the test-only "Open conversation" link, untyped content and input display names (B-003), and same-scope re-read presentation (Phase 3).
- **Implementation spec:** `docs/specs/implementation-spec-001.md`, Phase 2 P2-S5–S9; §§4 and 8.2/8.4–8.7. Prerequisite plan: `docs/sprints/sprint-002.md`.

### Sprint-Wide Context
- **Sprint type:** Feature
- **Delivery authorization:** the user authorized both Phase 2 sprints. After sprint-002 is accepted and merged into phase-2, branch sprint-003 from updated phase-2; story PRs target sprint-003. Reviewed/verified sprint-003 integration into phase-2 is explicitly authorized. Hand the completed phase-2 → main PR back to the user for final review; do not merge main without fresh approval. No routine pause between authorized sprints; genuine blockers and unseen-design approvals remain gates. This phase-specific assigned base replaces the normal main-based sprint sequence.
- **Shared context:** implement existing approved pages from `docs/design/brand-book.html`, its linked demo/flows, storyboard examples and Library picker. Reuse Sprint 002 tokens, primitives, shell, version viewers, request-state handling and browser harness. DRY means one implementation of genuinely shared behavior, not a configurable god component or speculative framework. Keep feature-specific state in its owner; packages do not depend on app features. This sprint finishes wiring, not filmmaking functionality.
- **Non-goals:** real uploads/private R2 access, business persistence/approvals, actual generation/cancellation, export processing, native chat/queue/Stop, real sign-in/reset/session refresh, paid AI or deployment. No Editor/Project, timeline, Play all/comparison, standalone audio, PDF/Word, deletion, credits/spending controls or model selector. No fake provider, seeded product lifecycle, production demo mode or custom stream/store/scheduler.
- **Safety:** B-001 remains known-failing and accepted ONLY for private/local Phase 1–2. Report both ingress failures separately. Resolve early admission/body limits before Phase 3 native-runtime qualification AND public deployment; no implicit listener migration or permission to weaken other checks. B-002, the inherited low-severity `deepmerge` audit advisory (GHSA-gcqx-w48m-w2h4), is also accepted only for private/local use. Report `pnpm audit` as NON-PASS separately, with no suppression, override or vendor patch. Revisit it before shared/public deployment or when an upstream fix ships.
- **Evidence placement:** maintain surface-to-consumer/status evidence in the Story 5 PR and this sprint's Final Review, not another permanent catalog. Code/contracts and the tracked spec remain authoritative. Optional historical copies in ignored `docs/research/sprint-001/` are not build/test prerequisites. Capture new visual approvals in existing design guide/history only where genuinely needed; existing pages do not require redesign.

### Affected Flows
- **Existing flows affected:** §8.2 paste/upload/Library attachment; §8.3 storyboard review; §8.4 generation proposal/request presentation; §8.5 candidate review/choice/playback; §8.6 export controls; §8.7 distinct Stop/disconnect/generation cancellation. Sprint 002 shell/navigation/question/Script/Assets views share components with the new views and remain regression targets.
- **New flows introduced:** none beyond the spec. Actual browser consumers are added for intended operations; fulfilled backend outcomes are not fabricated. Single-clip component playback with a synthetic supplied source is isolated component evidence, not functional private-media playback.

### Verification Strategy
- **Functional verification:** extend Sprint 002's `pnpm test:browser` and `pnpm test:visual`; do not create another browser/backend harness. Tests mount actual production consumers and use actual api-client → real built backend → configured development Supabase admission with two synthetic accounts. Missing domain prerequisites may be supplied as schema-valid read-only props in isolated test mounts; never create a fake lifecycle or production seed hook. Verify payload identities, real 401/501 feedback and unchanged selections/attachments/status. Test-only credentials, props and routes are excluded from built production assets/exposure.
- **Regression verification:** retain all Sprint 001 and Sprint 002 checks, including actual Auth/route restriction, clean export/start, Vite private-file denial, secrets, database-role safety, client deadlines, account/conversation invalidation, no replay and every previously accepted screenshot. Use aggregate, browser, visual, check/build and audit/frozen install for dependency changes. Final verification runs the full available suite and separate ingress qualification; B-001 and B-002 are not silently skipped or counted as passing. Focused suites select existing cases without double-counting.
- **Visual contract (latest user scope):** screenshot all MAIN implemented pages and their corresponding full-size approved brand-book-linked flow/demo references. The user explicitly narrowed coverage to main pages, not every demo step, transient state or unimplemented function. Use Sprint 002's Main-page checklist as the shared mapping and record this sprint's results in its PRs/Final Review. Representative Library/viewer/dialog layouts are included where they are main review surfaces; interaction tests still cover implemented behavior. Reuse Sprint 002's deterministic environment: 1440×900 desktop, 390×844 narrow and 820/821px boundary checks; same browser/OS/fonts/device scale/zoom/content/placeholders, stable media frame and disabled animations. Render references from tracked HTML, not ignored historical screenshot assets. Initial sources include Flow 2 `r78–r82`, `storyboard-example-r31.html`, `storyboard-editing-r32.html`, demo `12–18`, and `library-picker-r92.html`; map exact reference/state/hash for each implemented view. Historical Editor/Play all/comparison controls do not expand approved scope.
- **Visual pass/fail:** paired reference/application images plus overlays/diffs must reveal differences in typography, colours, borders, dimensions, alignment, padding, margins, spacing and full-page overflow. No unexplained geometry/style difference passes. Reuse the established measured rasterization-only tolerance; no blanket masking, new threshold inflation, automatic baseline updates or hidden layout differences. Existing token/mockup contradictions and mandatory scope changes need a recorded approved disposition. Truly missing states require a scoped approved reference before implementation; do not claim a reference-free state visually passed. Screenshot parity may use labelled isolated sample props; it never proves successful product work.
- **Evidence and approval:** captures/logs stay ignored at `outputs/verification/sprint-003/<revision>/`; commands, reference identities, page checklist and dispositions live in PRs/Final Review. Automated diffs accompany human side-by-side review. Lou approves new states/deviations. Final verification re-captures all required Phase 2 main pages, including Sprint 002 views affected by shared styling. It does not require an exhaustive 18-step or transient-state screenshot matrix. New screenshot artifacts are not silently uploaded or published. Existing approved design is reused, not reapproved wholesale.

### Stories
**Constraints:** Five implementation stories, each targeting ≤5 logical commits including verification. Execute in order. Refresh scope/verification against Sprint 002's actual accepted result before starting; material differences return for planning adjustment.

#### Story 1: Storyboard, Videos and request cancellation controls (P2-S5)
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
  - Resolution: N/A. Overall plan scored 4/5; final-story reporting clarification addressed below. Start checklist is confirmed after Sprint 002 acceptance and execution authorization.
- **As a** creator, **I want** the approved Shot/Panel and candidate views with explicit choice/cancellation controls, **so that** viewing and requesting an action never misrepresent an actual choice or stopped job.
- **Dependencies:** Sprint 002 accepted and merged; exact shared contracts and scoped visual approval for any absent cancellation/unavailable state.
- **Acceptance criteria:**
  - [x] Compose Storyboard and Videos from shared shell/viewer/version components, retaining distinct Shot/Panel IDs and order. Planning edit calls carry exact base/version and Shot/Panel identities; no new storyboard-authoring product or generated progress simulation.
  - [x] Wire generationRequest/generationRequests, editStoryboard, exact useVersion choice and cancelGeneration consumers to the existing API client. Choice targets an exact version/Shot or Panel; cancellation targets the exact request, never assistant Stop. Closing observation/navigation sends neither cancellation nor Stop.
  - [x] 501/error leaves chosen versions, approvals, request status and unsaved planning input unchanged. Feedback never promises remote cancellation or stopped charges. Normal app has honest empty/unavailable states; isolated examples are explicitly test examples, not account-owned records.
- **Functional verification:**
  - [x] Through actual browser consumers and built backend, assert exact read/edit/choice/cancel requests, distinct failures and unchanged state on 501. Use request spies to prove viewing/unmount sends no mutation and cancellation never uses native Stop.
  - [x] Capture each delivered storyboard, editing, candidate/version and cancellation-feedback view against its matched approved reference at desktop/narrow sizes.
- **Regression verification:**
  - [x] Run Sprint 002 shell/question/Script/Assets and shared viewer/keyboard/visual checks; retain client/schema and Auth/exposure tests. A shared component fix must not change earlier spacing or account-scoped state behavior.
- **Editorial/design verification:** preserve `CONTEXT.md` terms and approved grouping/order; explicitly exclude sequential/comparison playback even where historical demo references contain it. Detailed lifecycle states remain P3-S5/S8 and provider outcomes P4-S15/S16.
- **Manual-only behavior verification:** side-by-side visual review under the shared contract; action identity and unchanged state are automated.
- **Planned commits:**
  1. Compose Storyboard/Videos views with shared components and exact public projections.
  2. Wire edit/choice/request-read/cancel actions with honest feedback.
  3. Add browser identity/no-effect checks and reference screenshot comparisons.
- **Technical notes:** share exact-version views, not authority logic. Do not add workflows, provider APIs or backend domain writes merely to animate controls.

**Story 1 delivery:** [PR #19](https://github.com/cslou/workprint/pull/19), accepted code head `75e3fcc81fcebd6fef0d9b6acb38cd83312e329e`, merged into sprint-003 at `56744113dc6b6c82f2590662b225cb87e34093ab`. Before implementation, the user approved three new layouts (2026-10-28):
- the shared viewer dialog for an exact Panel version, captioned like "Shot 1 · Panel 1.1 · Version 1", with "Use this version";
- Shot intent and Panel description editing inside the storyboard dialog, reusing the Script edit box with Cancel then Save;
- a Videos "Generation requests" list: one card per request, a status pill, a "Request details" disclosure, and Cancel only on unfinished requests.

The request copy was approved with two simplifications: no per-card "Last known request state" line, and no extra line on cancelled cards. The approved Save, Use-version, workspace-read and empty texts are reused. Recorded in `docs/design/design.md` and `history.md` (`4d8d084`). Video choice is `useVersion` with `shot_video`, Panel choice `panel_image`, and cancellation `cancelGeneration`, never assistant Stop. Untyped fields (camera, duration, rich text, images) come only from labelled read-only prerequisites, and production fails closed.

Initial review at `948eed1` (seven checks) scored 2/5 with six P1s:
- P1-A: an older detail could downgrade a request, and closing the details disclosure brought Cancel back on a finished request.
- P1-B: candidates for the same Shot could each show Chosen.
- P1-C: a delayed list dropped requests known from a newer workspace.
- P1-D: no edit-view pairs.
- P1-E: display fields and exact-version bindings were unproven.
- P1-F: the planning transport-failure path was unproven.

Fix cycle 1 added scope-owned monotonic request observations, per-Shot selection, identity-merged membership, edit pairs at 1440/390 (a representative state, so not the 820/821 boundary) and the missing proofs. Red at `948eed1` showed 4 failing; all passed after. `/review-fix` coverage was complete, all P1s resolved, 4/5. One P2 is carried to Story 2: `scripts/browser/tests/display-prerequisites.spec.ts` imports `Version` from `contracts/src/models.js` instead of the public entry. A sixth commit fixed a nondeterministic 1-pixel board capture (20/20 repeat proof) without changing tolerance. Captures now go to `outputs/verification/sprint-003/<sha>/` through `WORKPRINT_BROWSER_OUTPUT`.

Current-head aggregate 13/13, browser 101/101, visual 165/165 (166 comparison records; the 136 prior comparisons unchanged; new pairs zero drift with two-sided geometry). Check, build and frozen install passed. `pnpm audit` was NON-PASS under B-002 and two B-001 ingress leaves still failed; both are reported separately. Post-merge check passed. No planning file was changed by the worker, and no main merge occurred.

#### Story 2: Single-clip playback interface and unavailable media (P2-S6)
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
  - Resolution: N/A. Start checklist is confirmed after Sprint 002 acceptance and execution authorization.
- **As a** creator, **I want** consistent single-clip controls and honest source-unavailable feedback, **so that** attempting to view a version never changes its selection or pretends private playback works.
- **Dependencies:** Story 1; Sprint 002 shared viewer/client/request infrastructure.
- **Acceptance criteria:**
  - [x] api-client requests/reacquires media for the exact version; `player` consumes supplied source/events through a narrow framework-free interface and owns no authentication, resource access or selection. Reuse that interface from viewers rather than independent players per tab.
  - [x] 501/source failure produces explicit feedback with no pretend timeline progress or loaded media. Source/version/scope switches dispose listeners/resources and discard stale source results without selecting a clip.
  - [x] Bound this story to interface/control wiring. A small deterministic synthetic local clip may prove supplied-source play/pause/seek and event cleanup; it is not R2/private-access qualification. No fake media service, sequential Play all, comparison player, timeline editing or export side effect. Any required Mediabunny dependency is pinned/justified only for the implemented seam; full private-media support stays P3-S3/S10.
- **Functional verification:**
  - [x] Actual frontend viewer → media client → built backend requests exact version and renders unavailable, with zero use/selection/export commands. Controlled delayed-source switching proves old media cannot populate a new scope.
  - [x] If supplied-source playback is implemented, browser tests use a generated/licensed local clip to prove play/pause/seek/events and teardown. Record format and fixture origin; no universal codec claim. Compare player/unavailable visuals with matching references at both sizes.
- **Regression verification:**
  - [ ] Re-run Story 1 exact choices/cancellation and Sprint 002 viewer/account-switch tests; verify package/browser dependency boundaries, cleanup and no external egress. Run audit/frozen install if dependencies change. *Open: every behavioural, boundary, cleanup and egress check passes and frozen install passes, but `pnpm audit` is NON-PASS (B-002, plus candidate B-004 pending Lou's decision). It stays unchecked, as Sprint 002's audit item did.*
- **Editorial/design verification:** record single-clip versus private-transport evidence distinctly. Existing approved playback appearance is reused; absent unavailable/control states require only scoped approval.
- **Manual-only behavior verification:** shared visual comparison; playback commands/event behavior automated. Human motion/audio inspection is not used to claim private transport or generated quality here.
- **Planned commits:**
  1. Add narrow player/source interface and shared single-clip controls.
  2. Wire exact-version access/unavailable handling and source cleanup.
  3. Add isolated supplied-source checks, actual-backend failure proof and visual comparisons.
- **Technical notes:** no React dependency in player; web owns UI. Player does not fetch credentials or resolve resource IDs. Later source-access implementation plugs into the same seam rather than another transport stack.

**Story 2 delivery:** [PR #20](https://github.com/cslou/workprint/pull/20), accepted head `37f20774366115a0f28b03606e2d49bfe3e1c034`, merged into sprint-003 at `71dc72f7cb17491c09bde5fae680235c573a3a35`.

Implementer: `deepseek/deepseek-flash` at `max` thinking. This was the user's trial override for this story, run in a fresh worker; the gpt-6.1-sol worker was stopped.

Design: the user was away and had delegated decisions, so the orchestrator provisionally approved four states from concrete previews (2026-10-29), pending Lou's ratification at the Phase 2 handoff:
- the Videos metadata line as a quiet playback trigger, with no visible change;
- the single-clip viewer in the shared viewer dialog, paused and playing, from `flow1-step9-r90.html#take-1`;
- "Loading this video…" in a 16:9 dashed surface;
- the approved workspace-read lines, unchanged, for 401, 501 and source failure, with no player chrome or retry.

These are recorded in `docs/design/design.md` and `history.md` (`6ba9fcc`).

Behavior: the framework-free `packages/player` plays supplied sources and owns no fetch, IDs or selection. Only `apps/web` may import it, enforced by dependency-cruiser. The web media read requests the exact version, reacquires once per expiry and fails terminally if the refreshed source is still expired. The viewer's "Use this version" goes through Story 1's per-Shot selection owner. Viewing, playing, seeking and closing send no commands. No new third-party dependency was added. The synthetic clip is a VP8 WebM, 320×180, 2 s, generated with ffmpeg `testsrc2`; there is also a deliberately invalid `corrupt.webm`. The fixture notes in `apps/web/test/fixtures/README.md` make no codec-universality claim. Decoded playing frames are functional evidence only; the zero-tolerance player pair uses the supplied poster.

Review:
- **Initial review** at `c998ffe` (seven checks) scored 2/5, with eight P1s:
  - unbounded reacquire on an expired `expiresAt`;
  - play rejections overwriting failed;
  - loading and error feedback pushed outside the 16:9 surface;
  - five verification gaps: missing loading pairs and two-sided geometry, DOM-only teardown, no pending-scope race, unproven reacquire replacement, and no native error path.
- **Fix cycle 1** resolved six. P1-E (teardown) and P1-F (scope race) remained partial, and a new P1-I appeared: a pause during a pending play became sticky failed. P1-I came from the orchestrator's own over-narrow rejection rule, which was corrected in the next assignment.
- **Fix cycle 2** resolved P1-E and P1-F. Its P1-I proof stubbed `play()`, so the AbortError branch was unreached.
- **Fix cycle 3** added a native AbortError proof and a current-attempt branch test, shown red→green. `/review-fix` coverage was complete, scoring 4/5. The orchestrator ruled that `ready` (not `paused`) is the truthful status for a pause issued before load, since nothing has played.

Two P2s are carried to Story 3:
- an unreachable `attempt.then(...)` re-pause branch in `packages/player/src/index.ts`;
- the 51- and 54-character subjects on `d307ae9` and `d627bf1`, recorded only, with no history rewrite.

The Story 1 carried P2 (public contracts import) is fixed. The story has ten commits: five planned and five fix-cycle commits, all append-only after the PR opened.

Current-head results: aggregate 13/13, browser 121/121, visual 177/177. That is twelve new media pairs (the player at 1440/390/820/821; loading, 501, 401 and error at 1440/390), with prior comparisons unchanged and two-sided geometry. Check, build and frozen install passed. `pnpm audit` was NON-PASS under B-002, and the two B-001 ingress leaves still failed; both are reported separately. Post-merge check passed. No planning file was changed by the worker, and no main merge occurred.

#### Story 3: Paste, upload and Library attachment consumers (P2-S7)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None — independent sprint-doc-reviewer pass 1 found no Story 3 issues. Start re-check (2026-10-28, after the picker reassignment): P2/check-4, category and selection behaviour lacked explicit pass conditions.
  - Resolution: Added the explicit picker pass conditions below ("Start refinements"); no executable scope or check weakened. Start re-check scored 4/5, ready to start.
- **As a** creator, **I want** the approved material-input controls connected to their intended operations, **so that** unavailable inputs do not appear as saved or attached work.
- **Dependencies:** Stories 1–2; Sprint 002 Library, Script/edit, conversation and request-state components.
- **Acceptance criteria:**
  - [x] Reuse the approved composer/picker/viewer and shared Library queries. Pasted prose in chat uses the unavailable native method; editing an existing Script uses its manual-save control. No prose-to-Script conversion, new structured import or fake saved attachment.
  - [x] File selection invokes requestUpload with the intended conversation/use and actual filename/type/size metadata. If unavailable, no bytes are transferred and confirmUpload is not called. Do not claim completion from a selected local file.
  - [x] Exercise the real confirmUpload consumer independently with a read-only upload identity supplied by isolated test setup; it calls the actual route and handles 501 without a usable version. No mock successful initiation or pretend transfer is needed to reach this consumer. Library attach/use preserves the exact version/purpose and leaves existing attachments unchanged on failure.
- **Functional verification:**
  - [x] Browser tests cover paste and actual picker/file controls through their intended clients; observe metadata/identity, 501 feedback, retained input and zero transfer/confirmation after unavailable initiation.
  - [x] Isolated actual confirmation and Library attach consumers call built backend with valid synthetic Auth and preserve state on unavailable/error. Screenshot picker/filter/selection/input and feedback views against matching approved references.
- **Regression verification:**
  - [x] Re-run Library navigation, manual edits, question pending-text, viewer and single-clip isolation tests. Confirm attachment attempts cannot silently approve an unrelated target, select video or invoke a provider.
- **Editorial/design verification:** use `library-picker-r92.html`, demo `05–08` and approved material controls; record true gaps only. Real transfer/validation/confirmation belongs to P3-S3/S4, not this wiring milestone.
- **Manual-only behavior verification:** shared visual comparison; file input/paste/requests/state assertions automated with synthetic files.
- **Planned commits:**
  1. Compose material controls from existing input/Library primitives.
  2. Wire initiation, isolated confirmation and exact Library use without simulated transfer.
  3. Add browser/no-transfer checks and complete input/picker visual evidence.
- **Technical notes:** local browser file selection is not an Artifact Version. Do not persist test props in product state. Preserve scoped unsaved text without leaking it across account transitions.
- **User decisions (2026-10-28):** the populated Library picker moves here from Sprint 002. Sprint 002 delivered the wired Library dialog and its approved feedback/empty states. The shared search control is only region-matched; the dialog has no picker header/search yet, and a successful read renders nothing (`apps/web/src/shell/shell.tsx`, Library children). This story builds the `library-picker-r92.html` layout in the actual Library dialog: header/search, category pills, tile grid and selection. Production Library reads stay 501, so items come from labelled read-only prerequisites. Check categories and selection behaviourally, and add full-page pairs at 1440, 390 and 820/821. No pretend attachment.
- **Start refinements (2026-10-28, orchestrator):** explicit picker pass conditions. Category is not a typed Library field: `GET /library` accepts only `kind` (script, reference, storyboard, image, video), plus cursor and limit, and has no search term. Character, place, prop and look categories therefore live in untyped content, the same gap as Story 5 content and B-003.
  - Categories: only from labelled read-only display facts in isolated compositions. With facts, a pill shows exactly the matching tiles and "All" shows every tile. Production never guesses categories from untyped content. If an honest production presentation without categories is not in the approved reference, the design gate applies before implementation. No pill sends a request with an invented `kind` or search term.
  - Search: filters only the loaded tiles by displayed name, locally; no request carries a search term.
  - Selection: pressing a tile toggles only its pressed state (and any approved selection count); selection alone sends no request and creates no attachment. Attaching sends the exact version and purpose. On 401, 501 or error, the selection and existing attachments are unchanged.
  - Proof: browser assertions for each condition above, plus full-page pairs of the populated picker at 1440, 390 and 820/821.

**Story 3 delivery:** [PR #21](https://github.com/cslou/workprint/pull/21), accepted head `13f1474bdd7985b8dc430663b200d6b942ddb579`, merged into sprint-003 at `5a72c1040cd2386437aca26cc711a6d81db4a92a`.

Implementers:
- `deepseek/deepseek-flash` at `max` thinking (the user's trial override) built the design gate and the implementation.
- The orchestrator then switched back to `openai-codex/gpt-6.1-sol` at `xhigh` for all three fix cycles. The trigger had been declared before the story: proof weaker than specified (the binding red→green rule was only partly followed) and an approved plan item not delivered (the shared `useVersion` path).

Design: the user was away and had delegated decisions, so the orchestrator provisionally approved the following (2026-10-29), pending Lou's ratification at the Phase 2 handoff. Recorded in `docs/design/design.md` and `history.md` (`3d008e7`).
- **Picker:** the populated picker from `library-picker-r92.html#lib-yours`/`#attached`, titled "Library", with Examples removed. Picker geometry applies only to a populated read; every other Library state keeps the approved 560px dialog.
- **Facts:** categories, singular tile labels, names and images come only from labelled read-only facts keyed by exact `latestVersion.id`, with a typed-kind fallback.
- **Search:** local only, hidden at ≤820.
- **Attach:** attach-specific copy, rather than the Use-version "selection" lines, because attaching is not selection. A partial-success line covers sequential multi-attach. With no conversation, Attach is disabled.
- **Upload:** four upload lines and a confirm line.
- **No match:** a no-match state.

Behavior:
- Paste stays composer text on the unavailable native send.
- The composer's file input calls `requestUpload` with the exact kind, filename, contentType, byteSize and reference use. There is no transfer or confirm.
- `confirmUpload` is a production consumer exercised only by an isolated mount.
- Attach sends one `useVersion` (`purpose: 'reference'`) per selected exact version through a new shared `apps/web/src/api/use-version.ts`, which `VersionUse` also uses. Selection is latched while attaching, and only succeeded IDs leave the selection.
- Exact consumable request allowances, including Library query shape, prove that pills, search, selection, close, unmount, the chooser and stale scope resends send nothing extra.

**Visual determinism root cause, sprint-wide.** A pre-existing intermittent flake (`versions reference parity at 1440`, 8/20 failing at base) and the new picker pairs were traced by orchestrator probes to Chromium capturing a stale text re-raster on either side. GPU flags had no effect. A CDP LayerTree compositor-commit pulse in the shared `settleCapture` fixes it, and every visual spec now settles through it. Evidence: 40/40 per flaky test and 567/567 over three full visual repeats, with no tolerance, masks or retries. Story 2's `c998ffe` font-smoothing change was likely a response to the same flake.

Review:
- **Initial review** at `b48964a` scored 2/5, with eight P1s:
  - an attach race;
  - the shared path not extracted;
  - the compositor fix bypassed by two specs;
  - five verification gaps: request-spy blind spots, missing real 401s, unobserved existing state, partial red→green, and weak category/search proof.
- **Fix cycle 1** resolved seven. Two of the trial model's "red" logs were found to have passed and were relabelled.
- **Fix cycle 2** made the request allowances consumable and moved three older Sprint 002 visual specs onto `settleCapture` (a pre-existing item).
- **Fix cycle 3** put the three race specs under the observer, with stale-resend red controls. `/review-fix` coverage was complete, scoring **5/5**.

The PR has 28 commits: 21 from the trial phase, including two disclosed empty commits (`f5f1f6e`, `67768ab`), and seven fix commits. All are append-only.

Current-head results: aggregate 13/13, browser 141/141, visual 195/195 (196 zero-drift records; prior pairs unchanged). New pairs:
- the populated picker at 1440/390/820/821;
- filtered, selected and no-facts at 1440/390;
- search and no-match at 1440 only, because search is hidden at ≤820;
- attach, upload and confirm 501 at 1440/390.

Check, build and frozen install passed. `pnpm audit` was NON-PASS under B-002, and the two B-001 ingress leaves still failed; both are reported separately. Post-merge check passed. No planning file was changed by either worker, and no main merge occurred.

#### Story 4: Direct Export, history/status and download consumers (P2-S8)
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
  - Resolution: N/A. Start checklist is confirmed after Sprint 002 acceptance and execution authorization.
- **As a** creator, **I want** direct Export and its intended read/download controls, **so that** I can see honest availability without visiting an excluded Editor or receiving a fake result.
- **Dependencies:** Stories 1–2; shared request/dialog/status components. No actual export record producer is introduced.
- **Acceptance criteria:**
  - [x] Wire Videos Export to createExport with exact conversation, operation ID and displayed selection revision. Wire export list/detail consumers to their corresponding routes. No Editor requirement, new export options contract or deletion control.
  - [x] 501/error produces no queued/completed record, fake progress or download. Download consumer takes an exact output-version identity from read-only test prerequisites and calls existing media access; unavailable response creates no file/navigation to an invented URL.
  - [x] Separate captured-versus-current presentation as read-only contract data where displayed; do not implement stale-submission rules or an export state machine. Real snapshot/currentness/compatibility/progress/recovery designs and behavior remain P3-S11–S13.
- **Functional verification:**
  - [x] Actual browser Export/read/history/detail/download consumers call built backend with exact identifiers/revision. Assert unavailable feedback, unchanged exports and zero file/download/selection effects.
  - [x] Compare Export entry, basic dialog/history/status/download-unavailable views against approved references; any missing basic layout gets scoped approval before implementation, not a screenshot of a fabricated working export.
- **Regression verification:**
  - [x] Re-run Videos choice/cancel/playback and shared dialog/keyboard/account-switch tests; command replay tests prove remount/reconnect never resubmits Export. Retain schema/client failure distinctions.
- **Editorial/design verification:** reuse approved direct-Export direction and in-scope components; historical Editor export mockups are not approved functional profiles. Record any needed basic layout approval in existing design records.
- **Manual-only behavior verification:** shared visual comparison; payload/no-record/no-download behavior automated.
- **Planned commits:**
  1. Compose direct Export and read/history/detail views from shared components.
  2. Wire exact export/source consumers with honest unavailable outcomes.
  3. Add browser no-effect/no-replay and reference screenshot evidence.
- **Technical notes:** exports reuse media access; no special download transport or fake export URL. Backend processing and private media remain unavailable.

**Story 4 delivery:** [PR #22](https://github.com/cslou/workprint/pull/22), accepted head `a8873e5a5e24e02555ec48ee830612a6e01e9c18`, merged into sprint-003 at `698a7f7938fbf0a49a9dfa664e424a2bea3773df`.

Implementer: a fresh `openai-codex/gpt-6.1-sol` worker at `xhigh` thinking. It was fresh because the Story 3 fix worker's context was at 73%. It used 5 prompts.

Design:
- The direct Export entry and its four unavailable pairs were already user-approved in Sprint 002.
- The design gate found the populated history and detail layouts missing, and previewed them first. The user was away and had delegated decisions, so the orchestrator provisionally approved the structure with copy rules on 2026-10-29, pending Lou's ratification at the Phase 2 handoff. Recorded in `docs/design/design.md` and `history.md` (`bf89e57`).
  - **History card:** titled "Export", with a capitalized status pill and one currentness line from the typed `current` field: "Uses your current chosen versions." or "Uses earlier chosen versions."
  - **Detail:** "Shots in this export", with each source resolved by exact ID to `Shot {n} · Version {revision}` or "Not in the current Videos list". "Can't be combined" appears only when the export is incompatible, and "Why it failed" shows the literal reason.
  - Creators see no IDs, order numbers or selection revisions.

Behavior:
- Export sends one `createExport` per press, with the exact conversation, a fresh operation ID and the displayed selection revision. Double presses, remounts and same-mount reconnects (after pending and after failed attempts) never resend.
- History and detail reads are scoped; stale responses are discarded in both completion orders.
- **Download stays unavailable in Phase 2 even when media access succeeds** (orchestrator decision in fix cycle 1). The media operation is called for the exact `outputVersionId`, but no anchor or navigation is rendered on any outcome; the approved Download lines are shown. Trusted origin and attachment delivery belong to P3-S10.
- The shell composes Videos and Exports through a generic slot; neither feature imports the other.
- The paged read policy (duplicate ID, repeated cursor, cancellation) is shared in `apps/web/src/api/paged-read.ts` by exports and generation requests.
- Populated records appear only through labelled read-only prerequisites in isolated mounts.

Review:
- **Initial review** at `7055358` scored 2/5, with three P1s: history requests didn't assert their 401/501 status, same-mount reconnect replay was untested, and Videos imported Exports. It also had three P2s: an arbitrary-URL download anchor, duplicated pagination and duplicated pair mechanics.
- **Fix cycle 1** resolved all six with genuine red controls. Regression scans were clean, and `/review-fix` coverage was complete, scoring **5/5**.

The PR has three commits, all append-only.

Current-head results: aggregate 13/13, browser 161/161, visual 215/215. The 20 new Export pairs are the entry at 1440/390/820/821 and the states at 1440/390. Prior pairs are unchanged, and the 72 affected PNGs are byte-identical across the fix. Check, build and frozen install passed. The two B-001 ingress leaves still failed. `pnpm audit` was NON-PASS under B-002, plus a newly published moderate `@hono/node-server` advisory that the PR did not introduce, recorded as candidate B-004 in `docs/backlog.md` for Lou's decision. Post-merge check passed. No planning file was changed by the worker, and no main merge occurred.

#### Story 5: Phase 2 browser walkthrough and surface stocktake (P2-S9)
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
  - Resolution: N/A. Start checklist is confirmed after Sprint 002 acceptance and execution authorization.
- **As a** maintainer, **I want** an honest inventory and browser walkthrough of all intended consumers, **so that** Phase 3 receives connected controls rather than fake functionality or unused routes.
- **Dependencies:** Stories 1–4 and all Sprint 002 consumers.
- **Acceptance criteria:**
  - [x] In the PR and Final Review record surface → owner → genuine consumer → §8 flow → observed evidence → functional/unimplemented/test-only → disposition. Reconcile all 19 application operation keys from code: workspace, artifactVersions, version, library, saveVersion, useVersion, editStoryboard, question, answerQuestion, proposal, requestUpload, confirmUpload, media, generationRequest, generationRequests, cancelGeneration, createExport, exports and export. Reuse prior consumer evidence; fill gaps with actual consumer checks, not arbitrary API callers or extra UI buttons.
  - [x] Distinguish ordinary browser navigation, isolated actual-consumer tests with absent prerequisites and completed-flow evidence. Record native unavailable/no-network methods, operational health and intended non-browser agent/internal owners; no tool gets an HTTP/browser surface just to satisfy coverage. Explicitly assign panel-change notice → api-client/workspace refetch to P3-S9, not implemented chat behavior.
  - [x] Verify both dev and built production-configured serving: only intended routes are exposed; test mounts, props, providers, identity bypasses and qualification controls cannot enter production. Real Auth remains enforced. No deployed infrastructure is required or authorized. *Accepted state: runtime checks prove that the production build and preview exclude every test entry, module and fixture (binary-safe), and that real Auth rejects missing, malformed and expired tokens on all 19 operations. The dev/built comparison found that the default dev server also serves `apps/web/test/` mounts on loopback. The orchestrator accepted this for private Phase 2 development under Lou's delegation (2026-10-29, pending ratification) and recorded the hardening as backlog B-005.*
  - [x] Walk all in-scope pages/actions with pointer/keyboard, honest empty/error/unavailable feedback and account/conversation transitions. Reuse existing tests and fix required small wiring gaps; substantial corrections return to their owning story or a bounded approved follow-up, never an unreviewed rewrite.
- **Functional verification:**
  - [x] Run actual browser navigation/action coverage through the backend, plus isolated consumers where recorded prerequisites prevent a full journey. Every retained product operation has observed intended-consumer evidence and no fake mutation/provider effect.
  - [x] Extend existing exposure/build checks to production exclusion of browser fixture entrypoints/assets and test controls; compare dev and built routes. No source-keyword-only assertion substitutes for runtime exclusion.
- **Regression verification:**
  - [x] Re-run touched consumer, keyboard, scoped-state, secret and exposure suites; audit 19-route coverage against prior schema/client matrix without duplicating test counts. Final story still owns the full-suite run.
- **Editorial/design verification:** review all Phase 2 reference/page mappings and DRY ownership, flag missing screenshots or style inconsistencies, and resolve them with the owner. Evidence stays in existing sprint/PR records; no new permanent surface document.
- **Manual-only behavior verification:** shared visual comparison and final scope review. Navigation/action tests remain automated; recording a route in prose is not proof it works.
- **Planned commits:**
  1. Extend cross-app browser walkthrough and production-exposure checks for remaining meaningful gaps.
  2. Apply bounded wiring corrections with targeted regression proof, if needed.
  3. Record complete surface/consumer evidence and Phase 3 dependencies in the PR; orchestrator carries the summary into Final Review.
- **Technical notes:** this audit does not reimplement all feature tests or supply their first proof. Root `test/` may own cross-app journeys; keep component checks near their owners and reuse the established harness. Implementers never edit sprint/planning records themselves.

**Story 5 delivery:** [PR #23](https://github.com/cslou/workprint/pull/23), accepted head `62473ecffad9288230b85c32b2ecfa6e4fd1260b`, merged into sprint-003 at `afcb8e7787e33ac05dad116d95cd11866b45ead1`.

Implementer: a fresh `openai-codex/gpt-6.1-sol` worker at `xhigh` thinking. It was fresh because the Story 4 worker's context was at 75%, and this audit is cross-cutting. It used 5 prompts and hit the harness timeout twice. Both times its checkpoint was intact; the second time the orchestrator launched its prepared proof runner unchanged.

Inventory (PR #23 body): all 19 operation keys, reconciled from code with no differences, each mapped to an owner, a genuine consumer, a §8 flow, cited evidence and a later owner.
- Evidence classes: ordinary navigation (N), isolated actual consumers with labelled prerequisites (I) and completed flows (C). There are **no completed flows in Phase 2**.
- Native unavailable methods, operational `/health` and intended non-browser owners (agent tools, generation admission, export processing, providers and usage) are recorded without adding routes.
- Panel-change notice → api-client/workspace refetch is **unimplemented, owned by P3-S9**.

Verification added:
- **Exposure, at runtime:** the default production build and preview exclude every test entrypoint, module and fixture. The check is binary-safe: it inspects build inputs, compares the sha256 of every emitted file and searches for inlined forms. The default dev server was compared with the build.
- **Built-backend Auth:** missing, malformed and expired tokens are rejected for all 19 operations.
- **Exclusions:** qualification, test, fixture, Studio and static paths return 404.
- **Walkthrough:** existing actual-consumer cases now cover keyboard as well as pointer, through the consumable observer, with a per-control pointer/keyboard audit. No new UI, visual state, dependency or production code.

Orchestrator decisions:
- **Dev-only exposure accepted:** the default dev server serves `apps/web/test/` mounts. This is accepted for private loopback Phase 2 development; the deny-policy hardening is recorded as backlog B-005.
- **Duplicate reads deferred:** each Videos candidate makes two exact-version GETs, and hidden Videos panels make one list GET. The observer budgets these exactly; consolidation is deferred to P3-S2/S5.

**Visual determinism fix, sprint-wide.** The fix-cycle full run exposed a pre-existing flake in an unchanged Sprint 002 spec, `proposal main reference at 1440`. The reference side intermittently rendered 2 pixels, each off by 1, at a rounded image edge inside a reverse-flex scroller at a fractional origin. Measured failures: 14/120 at base `76079df` (orchestrator probes) and 7/120 before the fix. The fix is a transient image settlement in the shared `settleCapture`, applied identically to both sides, with no lasting style and a guard that throws on any layout or opacity change. After the fix: **0/120**, then three consecutive full visual suites at 215/215, with no tolerance, masks, retries or baseline changes.

Review:
- **Initial review** at `6f403c0` scored 2/5, with two P1s: the binary fixture exclusion could falsely pass, and keyboard replacements had removed pointer coverage for Pause and chip removal.
- **Fix cycle 1** resolved both with genuine red controls, and the determinism fix was verified. `/review-fix` coverage was complete, scoring **4/5**.
- One P2 is carried to the Final Story: `config.spec.ts:63-66` skips the encoded-bytes scan above `assetsInlineLimit`, so a forced `?inline` of a larger binary could go undetected; the resolved-input check covers the ordinary path.

The PR has four commits, all append-only; the fourth is the explained capture fix.

Current-head results: aggregate 13/13, browser 162/162 (one new case), visual 215/215. Check, build and frozen install passed. The two B-001 ingress leaves still failed, and `pnpm audit` was NON-PASS under B-002 plus candidate B-004. Post-merge check passed. No planning file was changed by the worker, and no main merge occurred.

#### Final Story: Sprint Verification & Completion
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Uses the story sections above and the existing regression suite as the verification source of truth
  - [x] Defines where final verification evidence will be recorded
  - [x] Includes full regression verification, not only areas believed to be touched
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1, P2/check-8 — explicitly require all canonical verification types, including zero-count rows and reasons for Unknown counts. Overall 4/5, ready to start subject to dependencies and authorization.
  - Resolution: Added the complete reporting requirement to the acceptance criterion below; no executable scope or checks weakened. Descriptive correction reviewed editorially.
- **As a** maintainer, **I want** all sprint functional verification and all available regression verification run, **so that** the sprint can be integrated with evidence that new behavior works and existing behavior did not regress.
- **Dependencies:** All implementation stories.
- **Acceptance criteria:**
  - [x] Every story’s acceptance criteria are evaluated against implementation evidence.
  - [x] Every story’s functional verification checkboxes are run, checked, or explicitly marked failed/ambiguous/unrun.
  - [x] Every story’s targeted regression verification checkboxes are run, checked, or explicitly marked failed/ambiguous/unrun.
  - [x] The full available regression verification suite is run, including existing unit, integration, e2e, smoke, simulator/browser/device, static, and manual-only checks where applicable. *Accepted state: every automated suite ran at `cad28fa`, which is code-identical to `sprint-003` at `351c7f0`. The manual-only human side-by-side visual review was not performed here; as in Sprint 002, it belongs to Lou's Phase 2 (`phase-2` → `main`) review and stays open below.*
  - [x] Failed, ambiguous, manual-only, or unrun verification items are documented. B-001's two failed ingress leaves remain separately reported under the unchanged private-only exception, not passed or silently removed. B-002's audit advisory likewise remains reported as NON-PASS.
  - [x] Reusable new functional checks are identified as future regression verification; one-off editorial evidence is not counted as a suite.
  - [x] Verification delta reports all 11 canonical types: Unit; Integration / contract; E2E / smoke; Simulator / device; AI / model evals; Static / local checks; Performance / load; Security / dependency; Accessibility / visual; Manual-only; Other verification. Include every row, even zeros, with before sprint, added this sprint, removed, pending/not yet run, and after sprint totals. Explain any Unknown count; classify each method under its most specific type and avoid duplicate counts. Report command groups separately from behavioral cases. Use Sprint 002's actual accepted baseline, not invented future counts.
  - [x] The sprint doc status is updated to `🟢 Complete` only if completion criteria are met.
  - [x] A `## Final Review` section is appended to the sprint doc with the final completion message quoted for auditability.
  - [x] Screenshot all required Phase 2 MAIN pages from the shared Main-page checklist against approved full-size flow/demo references at desktop/narrow sizes, including earlier Sprint 002 pages after shared styling changes. Inspect pairs/overlays for typography, colours, geometry, padding, margins and spacing; no missing required comparison or unexplained difference passes. Record Lou's approval of deviations or genuinely missing basic layouts. Representative state captures suffice; do not implement fake functionality to advance through all demo steps. *Accepted state: all 216 comparison records (215 cases) pass with zero drift and two-sided geometry, including every Sprint 002 page re-captured. Dialog and inline-feedback states use region pixel comparisons, now with full-context captures and two-sided page-overflow and containment checks (PR #24). The missing basic layouts in Stories 2–4 were previewed first and provisionally approved by the orchestrator under Lou's delegation (2026-10-29). Lou's ratification of those, and his human side-by-side review, stay open below.*
  - [x] Hand off the genuine-consumer inventory and later feature owners without claiming functional sign-in, native turns, private media, saved decisions, generation or export. B-001 remains a prerequisite before Phase 3 native qualification/public exposure, not silently carried into an enabled feature.
- **Functional verification:**
  - [x] Run all functional verification items from every story and record pass/fail evidence, including real-browser wiring, native unavailable/no-network outcomes, isolated source checks and screenshot comparisons.
- **Regression verification:**
  - [x] Run all targeted regression verification items from every story and record pass/fail evidence.
  - [x] Run the full available regression verification suite and record pass/fail evidence: aggregate, all browser/visual cases, check/build, frozen install/audit as applicable and separate ingress qualification. Retain earlier foundation/security/contract/clean-start coverage.
- **Editorial/design verification:** reconcile all 19 operations and intended non-browser surfaces with the walkthrough; complete page/reference checklist and accepted visual dispositions. Summarize within Final Review/PR; captures/logs remain ignored. No prose-presence suites or new permanent catalogs.
- **Manual-only behavior verification:** human side-by-side review of every required main-page reference/application pair under the shared Visual contract, with pass/fail and approved differences recorded. Pixel equality alone is not functional acceptance; required behavior remains automated.
- **Planned commits:**
  1. Record final verification evidence, surface handoff, canonical delta, new dependencies and sprint completion state.
- **Technical notes:** worker gathers evidence and stops; orchestrator verifies it and owns the Final Review/completion records, then verifies/reviews the resulting head before acceptance under canonical `workflow-prompts/handle-sprint-completion.md`. Failed/unrun remains non-pass. The user explicitly authorized sprint-003 → phase-2 integration after acceptance. Final phase-2 → main needs the user's review and fresh merge approval. Do not start Phase 3 or a runtime migration automatically.

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
- All required Phase 2 main-page reference comparisons are complete, with consistent shared styling and no unexplained spacing/layout differences; functional feature and B-001 limitations remain explicit.

## Final Review

> **Mergeability:** Pending — resulting-head review required. Story PRs #19–#23 and the follow-up PR #24 were each accepted on their own heads (4/5 or 5/5); that is history, not a verdict on this record.
>
> ### Sprint objective + accomplishments
>
> **Objective:** complete the approved Storyboard/Videos, playback, material-input and export consumers, and demonstrate every intended Phase 2 application surface through actual frontend wiring with complete visual comparison evidence.
>
> **What was accomplished:**
> - **Story 1 — Storyboard, Videos and request cancellation controls** ([PR #19](https://github.com/cslou/workprint/pull/19)). Storyboard and Videos are composed from shared shell, viewer and version components. Exact Shot/Panel planning edits, exact Panel and video choices, and request list, detail and cancel consumers all reach the built backend. Failures leave choices, approvals, request status and drafts unchanged.
> - **Story 2 — Single-clip playback interface and unavailable media** ([PR #20](https://github.com/cslou/workprint/pull/20)). A framework-free `@workprint/player` seam drives a supplied `HTMLVideoElement`. The web media hook performs the exact-version read with bounded reacquire, and stale sources never populate a new scope. A generated VP8 clip proves play, pause, seek and teardown; this is component evidence, not private media.
> - **Story 3 — Paste, upload and Library attachment consumers** ([PR #21](https://github.com/cslou/workprint/pull/21)). Paste stays composer text on the unavailable native send. The file chooser sends exact `requestUpload` metadata with no transfer or confirm, and the populated Library picker filters and selects locally. Attach sends exact `useVersion` calls through a shared path, and the isolated `confirmUpload` consumer hits the real route.
> - **Story 4 — Direct Export, history/status and download consumers** ([PR #22](https://github.com/cslou/workprint/pull/22)). Export carries the displayed selection revision with no replay. History and detail are scoped reads presenting typed fields only. Download stays unavailable even when media access succeeds, and Videos and Exports are composed at the shell.
> - **Story 5 — Phase 2 browser walkthrough and surface stocktake** ([PR #23](https://github.com/cslou/workprint/pull/23)). The 19-operation inventory (below) is recorded with runtime dev/built exposure checks, an all-operation Auth matrix and pointer plus keyboard coverage of every consumer. A pre-existing visual flake was root-caused and fixed in the shared capture settlement.
> - **Final Story follow-up** ([PR #24](https://github.com/cslou/workprint/pull/24), test-only). The final evidence found 17 cropped visual records that could not reveal page overflow. They now record full-context captures and two-sided overflow and containment checks. The encoded-fixture scan covers every size.
>
> ### Final-run command results (`cad28fad4d4616c2c648b3d865380e5eab409413`, code identical to `sprint-003` at `351c7f0`)
>
> | Command | Result |
> | --- | --- |
> | `pnpm install --frozen-lockfile` | PASS |
> | `pnpm check` | PASS (strict types, lint, dependency boundaries and negative controls) |
> | `pnpm build` | PASS |
> | `pnpm test` (aggregate, private loopback Auth fixtures) | **13/13 PASS** |
> | `pnpm test:browser` | **162/162 PASS** |
> | `pnpm test:visual` | **215/215 PASS**: 216 comparison records, all zero drift |
> | `pnpm qualify:ingress` | **NON-PASS** (exit 1): the two unfinished-upload deadline leaves fail; user-approved private/local exception **B-001** |
> | `pnpm audit` | **NON-PASS** (exit 1): low `deepmerge` GHSA-gcqx-w48m-w2h4 (user-approved **B-002**), plus moderate `@hono/node-server` GHSA-rmxm-3fg6-px4f (**candidate B-004, not approved, pending Lou**) |
>
> The evidence-only final run at `9b86d70`, before PR #24, produced the same counts and NON-PASS items. Logs are in `/tmp/workprint-s003-final/` and `/tmp/workprint-s003-visual-context/`; captures are in ignored `outputs/verification/sprint-003/<revision>/`. None are committed.
>
> **Candidate B-004** is a newly published advisory on the existing `mastra` CLI → `@mastra/deployer` → `@hono/node-ws` → `@hono/node-server@1.19.17` chain. No Phase 2 change introduced it. Both `serveStatic` uses in the built API are gated by `options.studio`, and the generated entry passes `studio: false`. No compatible patched release exists. It is recorded in the local backlog for Lou's decision.
>
> ### Main-page checklist results
>
> All records compare tracked HTML/CSS references (hashes in `/tmp/workprint-s003-final/reference-hashes.tsv`), plus approved or provisionally approved substitutions recorded in `design.md` and `history.md`. Zero tolerance, no masks or retries, two-sided geometry, and every capture through `settleCapture`.
>
> | Main surface | Reference (tracked) | Pairs at 1440 / 390 / 820 / 821 | Result |
> | --- | --- | --- | --- |
> | Storyboard/Shot/Panel planning | `flow2-step1-r73.html` shell, `flow2-step7-r79.html#board`, r82 history/controls | 5 / 5 / 3 / 3 = 16 | Zero drift, full page |
> | Videos/candidates/version review and requests | r73 / r79 / r82, plus request, disclosure and status substitutions | 4 / 4 / 3 / 3 = 14 | Zero drift, full page |
> | Single-clip viewer (player, loading, unavailable, sign-in, error) | `flow1-step9-r90.html#take-1` | 5 / 5 / 1 / 1 = 12 | Zero drift in the modal region; full-context captures with two-sided overflow and containment checks |
> | Material input: upload and confirm feedback | `flow2-step1-r73.html` composer | 2 / 2 / 0 / 0 = 4 | Zero drift in the region; full context plus bounds. Confirm is an isolated consumer, so page placement is N/A |
> | Library populated picker, filters, search, selection, attach | r73 shell, `library-picker-r92.html#lib-yours`/`#attached` | 7 / 5 / 1 / 1 = 14 | Zero drift; main picker full page at all widths; attach-feedback dialog region with full context plus bounds |
> | Direct Export entry, history, detail and feedback | `demo-18.html#p-takes`, r73 shell, `app-r11.css` viewer/card/status | 9 / 9 / 1 / 1 = 20 | Zero drift; entry full page; dialogs as modal region with full context |
> | Sprint 002, re-captured after shared changes | Shell 52, question/proposal 12, Script 12, Assets 12, Library feedback 24, foundation regions 24 | 136 | Zero drift; foundations are primitive regions, not page acceptance |
> | Editor/Project/scene playback | — | — | Excluded |
>
> ### Phase 2 surface inventory (Story 5; full table and citations in PR #23)
>
> Evidence classes: **N** = ordinary browser navigation; **I** = isolated actual production consumer with labelled read-only prerequisites; **C** = completed flow. **There are no completed flows in Phase 2.** All 19 operations return structured 501 for valid Auth and 401 without it.
>
> | Surface | Genuine consumer | §8 flow | Evidence | Status | Later owner |
> | --- | --- | --- | --- | --- | --- |
> | `workspace` | Shell workspace → tabs | 8.1, 8.3, 8.7 | I (`shell-admission.spec.ts`); N empty tabs | Wired; business unimplemented | P3-S2; native entry P3-S1; refresh P3-S9 |
> | `artifactVersions`, `version` | Version history; exact-version reads | 8.3–8.5 | I (`version.spec.ts`, `question.spec.ts`) | Wired; records test-supplied | P3-S2 |
> | `library` | Library dialog → picker | 8.2 | I (`connectivity.spec.ts`); N (`shell.spec.ts`) | Wired; items test-supplied | P3-S4 |
> | `saveVersion` | Script inline Save | 8.5 | I (`version.spec.ts`) | Wired; no saved version | P3-S2 |
> | `useVersion` | Shared Use path: Script/reference, Panel, Videos, Library Attach | 8.2, 8.5 | I (`version`, `storyboard`, `videos`, `material-inputs` specs) | Wired; failures preserve exact state | P3-S2/S4/S5 |
> | `editStoryboard` | Shot/Panel planning editor | 8.3, 8.5 | I (`storyboard.spec.ts`) | Wired; no new version | P3-S5 |
> | `question`, `answerQuestion`, `proposal` | Question review, exact option, proposal disclosure | 8.3, 8.4 | I (`question.spec.ts`) | Wired; no approval or generation | P3-S7; B-003 |
> | `requestUpload` | Composer file chooser | 8.2 | I (`material-inputs.spec.ts`) | Wired; no transfer or confirm | P3-S3 |
> | `confirmUpload` | Production confirm consumer | 8.2 | I only; the upload ID is a test prerequisite | Test-only invocation | P3-S3 |
> | `media` | Single-clip viewer; export download read | 8.2, 8.5, 8.6 | I (`media.spec.ts`, `exports.spec.ts`) | Wired; private access unavailable; synthetic clip is component-only | P3-S3, P3-S10, P3-S12/13 |
> | `generationRequest`, `generationRequests`, `cancelGeneration` | Videos request list, details, explicit Cancel (never Stop) | 8.4, 8.7 | I (`videos.spec.ts`) | Wired; no progress or remote cancellation claimed | P3-S8 |
> | `createExport`, `exports`, `export` | Direct Videos Export, history, details | 8.6, 8.7 | I (`exports.spec.ts`, `export-races.spec.ts`) | Wired; no record, file or download | P3-S11–S13 |
> | Native send/queue, Stop, New video, Recents, Open conversation, sign-in/account | Composer, Shell controls, Account dialog | 8.1, 8.3, 8.7 | N/I (`chat`, `shell`, `shell-admission` specs) | Local unavailable and no network. Open conversation is reachable only in tests | P3-S1a–c |
> | **Panel-change notice → api-client/workspace refetch** | Shell workspace refetch | 8.3–8.7 | None. The unavailable native subscription is not evidence | **Unimplemented** | **P3-S9** |
> | Operational `GET /health` | Local operator and smoke | 8.7 | `foundation.smoke.test.ts` | Functional health only | P4-S19 |
> | Agent tools, generation admission, export processing, storage, providers, usage | Intended in-process tools and workflows; no HTTP or browser route | 8.2–8.9 | None registered | Unimplemented; no artificial endpoint | P3/P4 owners per PR #23 |
> | Delete work/account | None | 8.8 | — | Deferred by scope | Later release |
>
> ### Verification delta
>
> | Verification type | Before sprint | Added this sprint | Removed | Pending / not yet run | After sprint | Notes |
> | --- | ---: | ---: | ---: | ---: | ---: | --- |
> | Unit | 3 | +3 | 0 | 0 | 6 | Shared paged-read policy (pure) |
> | Integration / contract | 45 | +82 | 0 | 0 | 127 | Actual consumer → client → built backend; races; player; exact payloads |
> | E2E / smoke | 20 | 0 | 0 | 0 | 20 | Existing navigation journeys and clean-export smoke retained |
> | Simulator / device | 0 | 0 | 0 | 0 | 0 | Not applicable; Chromium is browser verification |
> | AI / model evals | 0 | 0 | 0 | 0 | 0 | No enabled model |
> | Static / local checks | 0 | 0 | 0 | 0 | 0 | `pnpm check` is reported as a command group |
> | Performance / load | 0 | 0 | 0 | 0 | 0 | Not applicable |
> | Security / dependency | 13 | +1 | 0 | 0 | 14 | Runtime dev/production exposure case; includes the 2 failing B-001 leaves. Audit NON-PASS is a command result |
> | Accessibility / visual | 145 | +80 | 0 | 0 | 225 | 79 visual cases plus the media 16:9 geometry case |
> | Manual-only | 0 | 0 | 0 | 0 | 0 | Human side-by-side review is an open gate, not a counted case |
> | Other verification | 0 | 0 | 0 | 0 | 0 | Editorial evidence is not a suite |
> | **Total** | **226** | **+166** | **0** | **0** | **392** | 390 passing plus 2 B-001 failing leaves |
>
> **Counting basis:** unique Node leaf cases plus expanded Playwright cases, each classified once, as in Sprint 002. The before figure is the `phase-2` baseline `1b5aa39`: Sprint 002's 223 plus 3 cases from integration fix PR #18, reconciled source-by-source (`/tmp/workprint-s003-final/before-verification-cases.tsv`). There are no Unknown counts.
>
> **Command groups**, reported separately: frozen install, check, build, aggregate, browser, visual, ingress and audit. PR #24 strengthened existing cases without adding any.
>
> **Regression summary:** 0 existing cases pending. All 226 before-sprint cases were retained and executed; 392 cases plus 8 command groups are referenced.
>
> ### Why ready
> - Every story's acceptance criteria, functional and regression items were evaluated against implementation evidence at the final head (`/tmp/workprint-s003-final/story-evaluation.md`). All pass except Story 2's regression item, which is held by the audit NON-PASS. Story 5's dev-exposure criterion passes as an accepted state.
> - All functional verification passes at the final head: real-browser consumers → client → built-backend 401/501, exact payloads, no-effect and no-replay proofs, scope races, and every visual comparison at zero drift.
> - The full regression suite ran. Its only non-passes are B-001, B-002 and candidate B-004, each reported separately and never counted as passes.
> - Each story PR passed the seven-check review, with `/review-fix` after any fix cycle, and was accepted at ≥4/5 with no open P0/P1 before merge. This record's head still needs its own review.
>
> ### Open for your decision
> - [ ] **Human side-by-side review** of all Phase 2 main-page pairs (Sprints 002 and 003), at Lou's Phase 2 (`phase-2` → `main`) review. Automated comparisons show zero drift; orchestrator AI inspection is not human approval.
> - [ ] **Ratify the provisional design approvals** made by the orchestrator under Lou's delegation on 2026-10-29:
>   - Story 2: the Videos metadata trigger, viewer, loading surface and media lines.
>   - Story 3: picker facts, local search, attach-specific copy and no-match.
>   - Story 4: populated Export history/detail copy rules.
>   - All are recorded in `docs/design/design.md` and `history.md`.
> - [ ] **Candidate B-004** (`@hono/node-server` advisory): approve it as a private/local exception like B-002, or direct another disposition.
> - [ ] **B-005**: default-dev serving of `apps/web/test/` mounts, accepted by the orchestrator for private loopback development.
> - [ ] **Carried Phase 2 handoff items:**
>   - the test-only "Open conversation" link;
>   - untyped content, picker categories and proposal input names (B-003);
>   - same-scope workspace re-read presentation;
>   - duplicate exact-version reads in Videos, deferred to P3-S2/S5.
> - [ ] **B-001 and B-002** (and B-004 if approved) must be resolved before Phase 3 native-runtime qualification and any shared or public deployment.
>
> ### Delivered
>
> | Story | Item | Status | Evidence |
> | --- | --- | --- | --- |
> | 1 — Storyboard/Videos/requests | AC-1–AC-3, F-1, F-2, R-1 | ✅ | `storyboard.spec.ts`, `videos.spec.ts`, `request-races.spec.ts`, `selection-races.spec.ts`, `display-prerequisites.spec.ts`; storyboard, request and request-feedback visual specs (30 pairs) |
> | 2 — Single-clip player | AC-1–AC-3, F-1, F-2 | ✅ | `media.spec.ts`, `player.spec.ts`; `media-visual.spec.ts` (12 pairs, with full context and bounds after PR #24); `apps/web/test/fixtures/README.md` |
> | 2 — Single-clip player | R-1 | ⚠️ NON-PASS (audit) | Everything else passes; audit holds B-002 plus candidate B-004 |
> | 3 — Material inputs/picker | AC-1–AC-3, F-1, F-2, R-1 | ✅ | `material-inputs.spec.ts`, `material-input-races.spec.ts`, `library-attach-races.spec.ts`, `upload-confirm-races.spec.ts`, `attachment-state.spec.ts`; picker and upload visual specs (18 pairs) |
> | 4 — Direct Export | AC-1–AC-3, F-1, F-2, R-1 | ✅ | `exports.spec.ts`, `export-races.spec.ts`, `paged-read.spec.ts`; `export-visual.spec.ts` (20 pairs) |
> | 5 — Walkthrough/stocktake | AC-1, AC-2, AC-4, F-1, F-2, R-1 | ✅ | PR #23 inventory and this record; `config.spec.ts`; `auth-built-fixture.ts`; extended pointer and keyboard consumer cases |
> | 5 — Walkthrough/stocktake | AC-3 | ✅ Accepted state | Production exclusion and Auth proven; dev-only exposure accepted (B-005, pending ratification) |
> | Final — Verification | Automated suites, evidence, follow-up and records | ✅ | This record; PR #24; `/tmp/workprint-s003-final/evidence.md` |
> | Final — Verification | Manual-only human side-by-side review and design ratification | ⏸️ Deferred to Lou | See Open for your decision |
>
> ### Drift from spec
> - **No new product flow, operation, route or contract change.** Contracts, the api-client and API production source are unchanged across the sprint.
> - **Player mechanism:** the single-clip seam drives a supplied `HTMLVideoElement` with no new dependency, rather than the Mediabunny/WebCodecs mechanism named in the spec's background module table. This is consistent with the bounded P2-S6 seam. Private playback qualification (P3-S10) decides the production mechanism, and the spec is unchanged.
> - **Export download is stricter than bare access wiring:** it stays unavailable even after successful media access, until trusted origin and attachment delivery are qualified in P3-S10/S12.
> - **Display facts:** rich Storyboard, Videos and picker display facts come only from labelled read-only prerequisites, and production fails closed. The B-003 typed-content gap now also covers picker categories.
> - The populated Library picker moved from Sprint 002 to Story 3 within Phase 2 (user decision, 2026-10-28).
>
> ### New Dependencies
> - None external: no registry package was added, upgraded or removed.
> - Internal workspace package `@workprint/player` (private, no dependencies), consumed by `apps/web` only. Dependency-cruiser enforces that boundary (PR #20).
