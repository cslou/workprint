# Sprint 005 — Saved work, uploads and media

**Date:** Planned and started 2026-10-29
**Goal:** Make owned saved-work reads, manual saves, exact uses/choices, image/video upload and private single-clip playback persist and reload through the existing frontend, with local storage proof and mandatory real development-R2 qualification.
**Status:** 🔵 In Progress

**Planning result:** sprint-doc-reviewer **4/5**, "Ready to start" (2026-10-29), with one P2 resolved below. The independent dependency review of the Phase 3 packaging returned "sound with fixes"; all its fixes are applied. Lou authorized Phase 3 Wave 1 on 2026-10-29. [Story 001](../stories/story-001.md) merged into `phase-3` at `a7444a2` ([PR #33](https://github.com/cslou/workprint/pull/33)), and `sprint-005` branches from that head. Story 9 still needs the development R2 bucket. Lou's 2026-10-29 start decisions (two clones, built-in examples ignored, SeaweedFS, real-R2 check kept in this sprint) are recorded below. The start checklists are confirmed.

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`, executed in the separate clone `/Users/lou/projects/workprint-2`
- **Tech stack:** React/React Aria/Vite/TypeScript; browser-safe contracts/api-client and framework-free player; one Mastra backend, Supabase Auth and Postgres; Supabase CLI migrations, AWS SDK v3 S3 client/presigner and bounded FFmpeg/ffprobe introduced by their owning stories.
- **Current state:** `main` = `c1397c3`, Phase 2 merged 2026-10-29. Existing `materials/`, `versions/`, `library/`, `uploads/`, `storyboard/`, `videos/` and `media/` consumers receive real 401/501, not successful persistence. Backend currently has `application/`, `db/` and `mastra/`; no application domain tables or `supabase/` migrations. Existing built-server/Auth/Postgres fixtures and browser/visual suites are reused. Foundation baseline at `9afa670` (tree equal to `a7444a2`): frozen install, check and build PASS; test 15/15; browser 163/163; visual 215/215 with zero drift, including a concurrent run in this clone on ports 4279/4280. `qualify:ingress` NON-PASS on the two B-001 leaves; audit NON-PASS on B-002/B-004 only. Mastra stays on the pinned 1.79.0 set (CLI 1.35.0, `@mastra/pg` 1.32.0); Lou moved the 1.80.x upgrade to after Wave 1 on 2026-10-29 (backlog B-007).
- **Implementation spec:** `docs/specs/implementation-spec-001.md`, P3-S2–S5/S10 and §§4, 6, 8; approved packaging [Phase 3 sprint packaging](../specs/implementation-spec-001.md#phase-3-sprint-packaging). Canonical vocabulary: `CONTEXT.md`.

### Sprint-Wide Context
- **Sprint type:** Feature
- **Story count:** nine implementation/qualification stories plus Final. This deliberately exceeds the usual 5–8 target: Lou asked for smaller stories where they improve quality and reviewability. The split separates persistence, saves, transfer, inspection, reuse, planning, choice, playback and external R2 qualification so each PR proves one boundary.
- **Delivery authorization:** authorized by Lou on 2026-10-29 (Phase 3 Wave 1). Standalone `docs/stories/story-001.md` merged into `phase-3` at `a7444a2`. It delivered a configurable browser-test port, the trusted owned-conversation collaborator and the test-only supported-native conversation fixture helper; the Mastra upgrade is deferred to after Wave 1. Branch `sprint-005` from that updated `phase-3`; in the separate clone `~/projects/workprint-2` (Lou chose two plain clones over worktrees), one implementer, sequential story PRs targeting `sprint-005`. Integration into `phase-3` needs Lou's explicit merge command; `phase-3` → `main` is Lou's.
- **Shared context:** implement existing operations `workspace`, `artifactVersions`, `version`, `library`, `saveVersion`, `useVersion`, `editStoryboard`, `requestUpload`, `confirmUpload`, `media` from `packages/contracts/src/index.ts`. Contracts already exist; change them only for a demonstrated consumer need, with corresponding spec review/update. Every conversation-scoped read/write uses the foundation's trusted owned-conversation collaborator; indirect upload/use lookups derive and check the stored conversation, never caller ownership claims. No dependency on Sprint 004 conversation UI or execution work.
- **Ownership / architecture:** own `supabase/`, API `db/`, `artifacts/`, `storage/`, `application/`, artifact/upload/media route files; web `materials/ versions/ library/ uploads/ storyboard/ videos/` (choice only), `media/ workspace/`; `packages/player` and matching contracts/api-client files. Domains own SQL and never call peer domains; application coordinates narrow interfaces and transactions without importing agent, either Mastra subtree or bootstrap. Components own styles; features import only shared `ui/` and `api/`, shell composes features. Packages never import apps; only web imports player; dependency-cruiser enforces boundaries. Keep one Mastra instance/execution owner; never alter native-owned schemas or add a server, scheduler, stream protocol or conversation store. Code names never contain sprint/story IDs.
- **Parallel wave:** Sprints 004 and 005 run concurrently, without mutual dependencies. Edit only owned modules; shared contracts/api-client indexes, `apps/api/src/mastra/application-routes.ts`, backend registration/bootstrap, shell composition and `storage/` index take additive edits only, with logic in owned files. Resolve lockfile conflicts by rerunning `pnpm install`, never hand-merging. The second integrator first merges `phase-3` into its sprint branch (no rebase), then reruns the full suite on the combined head, requalifying the conversation collaborator and native cohort. Stop/escalate any discovered need for wave-mate work; do not substitute it. Both clones share one local Supabase stack and its two fixture accounts: no test may change their passwords, sessions or sign-in state; tests that need to (sign-out, reset, expiry) create and delete their own throwaway accounts.
- **Non-goals:** leave question/proposal, generation/status/cancellation and export operations untouched for wave 2; workspace's unavailable producer sections stay honestly empty, not simulated. No creative tools, live model calls, agent producers, manual screenplay/storyboard builder, structured import, automatic reference planning/sheet creation, public deployment, deletion, Editor/Project/timeline, conversion, audio-only/PDF/Word upload, Play all, comparison or audio mixing. Next-turn change consumption/notice-refresh is P3-S9/Phase 4, not a new update protocol here.
- **Safety:** private/local development only. B-002 (`deepmerge`) and B-004 (`@hono/node-server`) remain user-approved audit NON-PASS, separately reported and never counted as passes; no upstream fix as of 2026-10-29. They gate shared/public deployment, not this wave. Report `qualify:ingress` as observed: B-001 NON-PASS until Sprint 004 Story 1 has integrated and qualified it, otherwise PASS only with fresh evidence. No suppression, weakened checks or implicit exception for new failures.
- **Additional audit decision (2026-10-31, B-008):** The orchestrator approves, under Lou’s delegated intermediate decisions, a temporary private/local Wave 1 exception for GHSA-g3hv-75wg-m249 on the 35 independently inspected inherited development paths: 33 ESLint/typescript-eslint paths plus Mastra CLI → archiver → readdir-glob using minimatch 10.2.6, and Mastra CLI → serve-handler using 3.1.5. Independent static review found no production closure or application-controlled glob; inspected 10.2.6 callers do not enable the vulnerable optimizationLevel ≥2, and 3.1.5 lacks that implementation despite the advisory’s broad range. Audit remains NON-PASS. No suppression, override, age-policy bypass, unrelated upgrade or shared/public deployment is authorized. Reassess at Wave 1 completion/before Wave 2 and immediately on dependency, caller/options, input-trust or production-closure changes. Compatible remediation is tracked as local backlog B-008; this is not blanket coverage for new paths or vulnerabilities.
- **Design / evidence placement:** reuse approved designs, not historical unseen states. Before implementing new conflict/upload/progress/expiry/download states, present inert previews at 1440/390 and record exactly: "Provisionally approved by the orchestrator on <date> under Lou's delegation; pending Lou's ratification at the Phase 3 handoff." Records belong in `docs/design/design.md` and `docs/design/history.md`. Story PRs and Final Review hold SHA/command/results, surface-to-consumer mapping, producer prerequisites, dependency rationale and design dispositions; logs/captures stay ignored under `outputs/verification/sprint-005/<sha>/`. No secrets, tokens, signed URLs or private media in evidence; no automatic upload. AI inspection is not human approval.
- **Built-in examples (Lou, 2026-10-29):** ignored for now. No real built-in examples ship in Phase 3, and the Examples switch removed from the approved Phase 2 picker stays removed. Story 5 keeps only the contract's bounded read-only `builtIn` semantics, proven with test-only records.

### Approved temporary video-upload restriction

Lou explicitly approved disabling video uploads and continuing the remaining sprint stories on 2026-10-31. This supersedes Story 4’s end-user MP4-upload acceptance criteria for this delivery, not its verified-image requirements. Reject video authorization and confirmation server-side, including previously issued video uploads; browser messaging must accurately state the restriction. No usable video version may be published through upload confirmation while disabled. Preserve image upload verification, ownership, idempotency and private-media controls.

The unresolved conflicting-MP4-sample-table validation defect in PR #41 remains deferred, not fixed or manually qualified. Re-enablement requires a separately authorized correction and independent verification. Do not resume the blocked parser-correction assignment as part of this scope change. Stories 5–9 continue: video choice/playback qualification may use isolated qualified test fixtures, never production seed endpoints or a claim that user video upload works. Real-R2 qualification remains mandatory for delivered capabilities. Final review must distinguish accepted reduced scope from deferred video-upload behavior; no original-scope completion claim is authorized.

### Affected Flows
- **Existing flows affected:** §8.1 saved-work restoration only; §8.2 actual uploads, Library reuse/reference attachment; §§8.3/8.5 existing-record manual edits, exact Panel-image approval and Shot-video choice, individual playback; §8.7 reload/interrupted upload/source recovery only. Preserve unavailable native/chat/question/generation/export consumers and their no-effect behavior.
- **New flows introduced:** application-owned Supabase CLI migration/grant workflow against isolated Postgres; authenticated local S3-compatible fixture and bounded media inspection/poster pipeline; dedicated real-R2 qualification. No new creative-authoring flow.

### Verification Strategy
For executable behavior (code, config/scripts, and actual machine-consumed contracts or workflows), define functional and relevant regression proof before implementation. Policy/workflow prose alone is not proof of executable behavior. For descriptive-only docs/design prose, record functional and regression N/A with rationale and use editorial review for accuracy/completeness/consistency. Do not add persistent prose/heading assertion suites. Keep applicable existing checks and design visual/safety/consistency/approval checks under the design skill.

Verification has two categories:
- **Functional verification:** proof of executable behavior introduced or changed by this sprint, or justified N/A for descriptive-only work.
- **Regression verification:** proof of relevant existing behavior, or justified N/A for descriptive-only work.

Each implementation story must include:
- Functional verification for executable behavior it delivers, or justified N/A for descriptive-only scope.
- Targeted regression verification for existing behavior at risk, or justified N/A for descriptive-only scope.

The Final Verification Story runs all applicable sprint functional verification plus the full available existing regression suite. Reusable functional checks become future regression checks; one-off editorial review is evidence, not a persistent suite.

- **Functional verification:** design tests before executable changes; extend existing owner tests, `apps/api/test/` built-server/Auth/Postgres fixtures and browser suites. Use real built backend, real Supabase Auth with two synthetic accounts and isolated real Postgres. Foundation's helper creates owned native conversations through supported APIs; valid Script/reference/Shot records may be inserted through domain interfaces in isolated setup only. Exercise actual consumers → api-client → routes → persistence/storage, then reload. Every new behavior test records a genuine red→green log, including negative/race controls; a baseline pass is not red evidence. Descriptive changes use editorial review, not prose-presence tests.
- **Regression verification:** retain Auth-before-validation, restricted-role, clean committed-export smoke, private-file/secret/test-control exclusion, client bounds/cancellation, pagination, stale-scope/no-replay, keyboard/focus, player teardown and all existing visual coverage. Update obsolete 501 expectations only for implemented operations, replacing them with equal/stronger real success/denial/no-effect proof; leave wave-2 expectations intact. Every functional browser spec uses consumable `scripts/browser/material-network.ts`; transfers/read/range requests need exact allowances, not a general egress bypass. Extend observer query handling only for actual supported kind/limit/cursor reads.
- **Storage and external boundary:** Stories 3–4 and 8 develop/test against credential-configured SeaweedFS `chrislusf/seaweedfs:4.51`, resolved and pinned by immutable digest before first run. Use AWS SDK v3 S3 client and presigner, private isolated bucket and `PutBucketCors` for exact browser origins/methods/headers. Emulator evidence is not R2 qualification; Story 9 must pass real R2. Lou confirmed SeaweedFS over Cloudflare's experimental local R2 on 2026-10-29 (reasons in the spec's Phase 3 sprint packaging). Retain default loopback egress guards; only the explicit qualification run may allow the exact supplied dev-bucket origin, redacting query signatures/headers/bodies from reports and disabling secret-bearing traces.
- **Visual contract:** main surfaces at 1440/390/820/821; representative success/loading/error/conflict/expired states at 1440/390, with pointer/keyboard/focus checks. Use tracked brand-book HTML/references, matched fonts/content/posters and all captures through `settleCapture` (`scripts/browser/capture.ts`). Zero tolerance, no masks, no retries; paired images/overlays/diffs plus two-sided geometry/overflow checks. Decoded-motion proof is separate from deterministic poster parity. Human side-by-side review passes only when all differences have an approved disposition.
- **Test-page retirement:** B-005: when an ordinary real page/flow replaces `apps/web/test/*.html`, retire that mount and migrate browser/visual/race coverage at equal or greater strength. If the ordinary entry still depends on unintegrated Sprint 004, retain the isolated real consumer temporarily and disclose that boundary; never implement substitute sign-in/conversation creation or drop coverage to delete a page. Test-only providers, helpers, records and routes remain excluded from production build/exposure using `scripts/browser/tests/config.spec.ts` and `apps/api/test/web-files.security.test.ts` patterns.
- **Commands / baseline:** after foundation, record a fresh accepted-head baseline; this clone always uses `WORKPRINT_BROWSER_PORT=4279` and `WORKPRINT_PREVIEW_PORT=4280` (Sprint 004 uses the defaults in the other clone). Set `WORKPRINT_AUTH_FIXTURE="$PWD/outputs/local-supabase.setup.json"`, `WORKPRINT_AUTH_SIGNING_FIXTURE="$PWD/outputs/local-supabase.status.json"`, `WORKPRINT_BROWSER_OUTPUT="$PWD/outputs/verification/sprint-005/<sha>"`. In order run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, `pnpm test`, `pnpm test:browser`, `pnpm test:visual`, `pnpm qualify:ingress`, `pnpm audit`. Redirect each command's full stdout/stderr to local logs; report exit/result and path, inspect bounded excerpts on failure. Missing fixtures/service authorization fail or block, never skip/pass. Final verification runs every story's functional/targeted checks plus the full available regression suite; reusable checks become future regressions, one-off editorial evidence does not.

### Stories
**Constraints:** Nine implementation/qualification stories plus Final, in the approved split/order (story-count rationale in Sprint-Wide Context). Each is independently reviewable. The target is ≤5 logical commits including verification; Lou allowed exceeding it where that makes history clearer (2026-10-29). Subjects use `Type(scope): Capitalized description`, ≤50 characters.

#### Story 1: Schema foundation and owned reads (P3-S2, S2-1)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P2 [story-sizing] — the nine-story rationale sat under Stories/Constraints rather than Sprint-Wide Context.
  - Resolution: Moved the rationale to a Sprint-Wide Context "Story count" bullet.
- **As a** creator, **I want** owned saved work and history to reload, **so that** views describe actual persistent versions and uses.
- **Dependencies:** authorized execution and merged foundation; no Sprint 004 dependency.
- **Acceptance criteria:**
  - [ ] Establish pinned Supabase CLI config/migrations under `supabase/`, excluding native schemas; document/apply migrations to uniquely owned isolated Postgres via the CLI, not a custom SQL runner. Reuse `apps/api/test/postgres.ts` owner/serving roles and supported native initialization. Serving cannot migrate/prepare/own schemas or reach privileged roles; startup never inherits `MIGRATION_DATABASE_URL`. Bound pool/query/transactions; domains own SQL.
  - [ ] Store validated schema-versioned immutable Artifact Versions, exact dependencies and conversation uses with trusted owner/provenance, uniqueness and referential checks. Wire `workspace`, `artifactVersions`, `version` and owned `library` reads/history/accessible pagination to existing consumers; workspace derives Draft/Ready from conversation uses, not Library versions. Empty work is honest; no generated records or wave-2 implementation.
  - [ ] Apply owned-conversation collaborator to every scoped read/write, including fixture/domain entry points; reject foreign/unknown versions, dependencies, uses and conversations without existence leakage or mutation. Cursors stay account/filter scoped, bounded and stable; loading/errors settle and late results never cross account/conversation scope.
- **Functional verification:**
  - [ ] CLI migration/reapply and built-serving tests on isolated Postgres prove expected schema/grants, native-schema integrity, rejected privileged serving and rejected serving DDL/setup; browser tests prove actual stored content/history, next-page access, empty state, two-account denials and stale-read suppression. Persist valid records through supported test setup, not a seed route.
- **Regression verification:**
  - [ ] Run foundation native/conversation collaborator, Auth/security/role/smoke/client/schema tests and existing material/version/library/paged-read/scope browser and visual checks; retain wave-2 501/no-mutation behavior.
- **Editorial/design verification:** audit public projection/schema vocabulary; reuse approved views and shared visual contract, preview any new successful-read/pagination state before implementation.
- **Manual-only behavior verification:** shared side-by-side visual review; migration, isolation and pagination automated.
- **Planned commits:**
  1. `Feat(db): Add owned artifact migrations` — CLI workflow, role-safe schema and fixture application.
  2. `Feat(artifacts): Serve owned saved work` — domain reads, additive adapters, consumer wiring and verification.
- **Technical notes:** introduce only needed files; `db/` supplies connections/transactions, not domain queries. Later stories own write authority and selection-revision advancement; read default revision is zero until established. No hand-authored native DDL or duplicate conversation table.

#### Story 2: Manual saves and human-use effects (P3-S2, S2-2)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** creator, **I want** safe immutable manual saves, **so that** my edits persist without losing input or granting an assistant human authority.
- **Dependencies:** Story 1; inert conflict/error previews before new UI.
- **Acceptance criteria:**
  - [ ] Implement `saveVersion` for existing script/reference/planning content with domain kind/schema validation and exact dependencies. Expected base must be the latest Artifact Version; concurrent stale/conflicting saves have no partial effects and retain unsaved input and previous versions. A human save with intended use atomically moves that exact use approved and records the manual change, starting no turn.
  - [ ] Shared in-process write interface enforces trusted producer provenance/capability: assistant writes are unapproved drafts and cannot claim human approval or replace pinned approved uses. Verify directly, registering no agent tool. Viewing/history changes nothing; fresh saves without intended use do not invent decisions. No new authoring/import screen or agent producer.
  - [ ] Scope operation identity by trusted owner/command context; identical retries return the original saved version/use, conflicting payload reuse fails `invalid_input`. Version/dependency/use/change effects commit together; reads never consume pending changes. Narrow core supports later exact-use commands, not an unrestricted authority flag.
- **Functional verification:**
  - [ ] Built API/Postgres and actual editor tests prove save/reload/history, intended-use approval, no native turn, stale concurrent saves preserving typed input, transaction rollback and lost-response retry without extra versions. Direct domain tests reject nonhuman decision impersonation/foreign dependencies and preserve pinned human versions.
- **Regression verification:**
  - [ ] Rerun Story 1 reads/pagination/role/isolation, editor races/account switching, history/view no-write observer checks and unchanged question/generation/export unavailability; shared visual/keyboard coverage remains intact.
- **Editorial/design verification:** preview stale/conflict states under shared approval contract; distinguish manual save, exact-use approval and selection in design/evidence.
- **Manual-only behavior verification:** shared visual review; concurrency, provenance and retained input automated.
- **Planned commits:**
  1. `Feat(artifacts): Save immutable manual versions` — expected-base, actor, operation and atomic change/use rules.
  2. `Feat(versions): Persist edits with conflicts` — real editor integration and red→green verification.
- **Technical notes:** domain functions are reusable without HTTP self-calls; no external/native wait inside SQL transactions. Later storyboard edits reuse this core and cannot bypass revision rules.

#### Story 3: Private storage and upload coordination (P3-S3, S3-1)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** creator, **I want** authorized private transfers, **so that** incomplete or repeated uploads cannot overwrite saved work.
- **Dependencies:** Stories 1–2; local emulator only, not Lou's R2 bucket.
- **Acceptance criteria:**
  - [ ] Pin `chrislusf/seaweedfs:4.51` by verified digest in the owned test fixture before first run; configure credentials, private bucket, dynamic loopback port and bucket CORS through AWS SDK v3 `PutBucketCors`. Pin/justify `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`; use the same adapter for emulator and later R2, recording sanitized observed SDK success/error shapes before parsers.
  - [ ] Implement `requestUpload` and repeat-safe `confirmUpload` coordination: verified conversation owner/intended use, server-owned staging key, declared type/size/expiry, actual stored-byte checks and guarded one-version publication. An issued URL or successful PUT is never usable work. Verification is mandatory; until Story 4 supplies real media inspection, confirmation fails explicitly without publication rather than trusting metadata or a production stub.
  - [ ] Stable identities reconcile duplicate/lost confirmations; payload conflicts and foreign/expired uploads fail safely. Separate writable staging from immutable published keys, so replayed PUTs cannot alter published bytes/posters. Interrupted/failed/late transfers and cleanup failures retain owner-scoped retry/cleanup references; document issued-URL lifetime and actual replay semantics, never claim S3 signatures alone are single-use. Bound transfer bodies/time/concurrency; no transaction spans storage waits.
- **Functional verification:**
  - [ ] Real built backend/Auth/Postgres/emulator tests authorize and PUT actual bytes; assert unsigned/foreign access denial, configured CORS/preflight, mismatched stored sizes, expiry, duplicate/interrupted confirmation, guarded publication coordination and retained cleanup references. Confirmation without a verifier publishes nothing; exercise no-overwrite with immutable known objects and replayed staging URLs. Browser transfer uses exact observer allowances without API bearer leakage to S3.
- **Regression verification:**
  - [ ] Run manual-save/owned-read/role tests, upload-initiation/confirm race and stale-scope browser coverage, production exclusion/secret scans; frozen install/audit report new dependency effects separately from B-002/B-004.
- **Editorial/design verification:** no new working-upload success claim; reuse input appearance, preview any new authorization/transfer failure state before wiring it.
- **Manual-only behavior verification:** shared visual review only; storage/signing/cleanup automated locally. Real R2 is mandatory Story 9, not manually waived.
- **Planned commits:**
  1. `Feat(storage): Add private S3 transfer adapter` — digest-pinned authenticated emulator, SDK, CORS and bounded mechanics.
  2. `Feat(uploads): Guard transfer and confirmation` — upload records, routes, retry/publication core and failure verification.
- **Technical notes:** artifacts owns upload state/publication policy; storage owns mechanical transfer/signing. Cleanup removes only verified fixture/staging objects, not general Artifact deletion; no background scheduler is introduced.

#### Story 4: Verified media and browser upload states (P3-S3, S3-2)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** creator, **I want** verified uploads with honest progress/failure states, **so that** only supported saved media becomes usable.
- **Dependencies:** Stories 1–3; approved inert upload-state previews; digest-pinned authenticated SeaweedFS 4.51.
- **Acceptance criteria:**
  - [ ] Pick and pin an FFmpeg/ffprobe build/version plus immutable artifact digest before processing; record source, platform/licensing considerations and new-dependency rationale (actual decoding/probing/posters cannot be proved by MIME/HEAD or current libraries). Define bounded process adapter in `storage/` for later export reuse: argument arrays, controlled local paths, no shell/remote URLs, concurrency/deadline/output/temp/memory bounds, termination and cleanup on failure/shutdown.
  - [ ] Verify actual object bytes/type/size against authorization, decode supported media and persist measured metadata/posters before guarded publication/use. Planned initial allowlist: JPEG/PNG still images ≤10 MiB and 4096×4096; MP4 H.264 8-bit yuv420p video ≤100 MiB, 1920×1080, 60 fps, 120 s, optional embedded AAC mono/stereo ≤48 kHz. Qualify accepted variants and reject all unqualified formats/streams explicitly; no conversion, standalone audio or universal-codec claim. Report accurate measured discrepancies; reject malformed/truncated, unsupported, oversized, spoofed or mismatched content with no usable version.
  - [ ] Complete actual file chooser → api-client authorization → presigned byte transfer → repeat-safe verified confirm → saved exact version/intended human use, then image/poster display via owned `media`. Uploading, verifying, success, expiry/interruption and rejection settle loading; no usable attachment from selection/PUT alone. Scope change discards late UI results without undoing a committed version or replaying confirmation. No transaction spans probe/storage work; pin immutable verified bytes despite staging mutation races.
- **Functional verification:**
  - [ ] Actual browser/backend/Postgres/emulator tests upload known synthetic image and audio/video, reload exact versions/use, compare original/owned bytes and measured dimensions/duration/audio/poster decoding. Negative/boundary and staging-swap tests publish nothing; interrupted/duplicate confirmation publishes once. Process stall/output/temp/concurrency/shutdown controls prove finite cleanup and capacity release. All new cases include red→green logs and observed exact network effects.
- **Regression verification:**
  - [ ] Rerun Story 3 signing/no-overwrite/expiry/cleanup, saves/owner isolation and existing input/confirmation/scope races; retain production exclusion, private-file denial, bounded clients, keyboard and visual checks; report dependency audit.
- **Editorial/design verification:** preview progress, verified-success and rejection states at 1440/390; capture main upload/image surfaces at all four widths under shared zero-drift contract. Record build/allowlist limitations and test fixture origin, not creative approval.
- **Manual-only behavior verification:** shared visual review; byte/decode/media-process behavior automated. Real-R2 evidence stays mandatory in Story 9.
- **Planned commits:**
  1. `Feat(storage): Verify media and create posters` — pinned bounded process adapter, bytes/allowlist verification and tests.
  2. `Feat(uploads): Complete verified file uploads` — real upload/confirm/image consumers and state/race/visual proof.
- **Technical notes:** metadata/posters come from owned verified bytes, not filename, caller metadata or process exit alone. Keep immutable publication interface reusable by future export/generation owners without implementing their lifecycles.

#### Story 5: Library reuse and reference controls (P3-S4)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** creator, **I want** exact Library reuse, **so that** the same owned work can serve separate conversations without sharing their decisions.
- **Dependencies:** Stories 1–4. Built-in examples are ignored for now (Lou, 2026-10-29).
- **Acceptance criteria:**
  - [ ] Complete bounded `library` browsing/filter/pagination and exact `version`/history/media inspection for owned work and test-only read-only built-ins. Library items never show conversation-specific Draft/Ready; empty/no-match/loading/error remain truthful. Real built-in examples are ignored for now (Lou): do not restore the removed Examples switch or ship examples; retain the `builtIn` contract/read-only semantics, proven with test-only records.
  - [ ] Implement human `useVersion` for script/reference/storyboard with exact version/purpose/role and current owned conversation. Reuse across conversations records independent approvals without copying objects; later versions never move pinned uses. Viewing/search/picker selection grants no approval. Reference description/association edits reuse expected-base manual-save rules and preserve unsaved input on conflict.
  - [ ] Reject foreign references and all writes to built-in content/versions; permitted reuse creates only a human's own conversation-use record, not a mutation of the example. Missing/inherited reference coverage remains visible rather than invented. Operation retries reconcile once; payload conflicts/partial multi-attach failures preserve successful and pending exact choices. Assistant reference planning/sheet production stays Phase 4.
- **Functional verification:**
  - [ ] Browser/backend/Postgres/emulator tests browse paged work, inspect private image/video metadata and attach one exact version to two owned conversations; edit/create a newer version and reload both pinned independent uses without object copies. Two accounts and bounded test-only built-ins prove denials/read-only reuse, no state on tiles, inert viewing, missing coverage and conflict/partial-attach recovery.
- **Regression verification:**
  - [ ] Run owned reads/manual saves, history/picker/attachment-state/attach-race tests, scope invalidation, upload/image security, keyboard and visual comparisons; verify built-in fixtures cannot appear through production assets/routes.
- **Editorial/design verification:** record Lou's decision to ignore built-in examples for now and the current picker substitutions; names/categories/thumbnails derive only from validated supported content/projections, never guessed IDs/opaque JSON. Preview any necessary typed display extension and retain closed-contract discipline.
- **Manual-only behavior verification:** shared visual review; built-in immutability, reuse and independent decisions automated.
- **Planned commits:**
  1. `Feat(artifacts): Reuse exact Library versions` — owned uses, read-only example semantics and reference checks.
  2. `Feat(library): Persist reference attachments` — actual picker/view/edit paths and regression/visual proof.
- **Technical notes:** conversation use is separate from global Artifact ownership/read-only content; approving reuse is not approving every version or selecting a Shot video. No production catalog seed endpoint.

#### Story 6: Storyboard edits and selection revision (P3-S5, S5-1)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** creator, **I want** safe edits to existing Shot/Panel plans, **so that** exact references and downstream effects survive revisions.
- **Dependencies:** Stories 1–5; valid persisted planning prerequisites via isolated setup, not an agent or manual builder.
- **Acceptance criteria:**
  - [ ] Implement `editStoryboard` and persisted planning reads with stable Shot/Panel identities and order, multiple Panels per Shot and exact source/reference versions. Shared expected-base save/validation rejects stale bases, duplicate/inconsistent identities/orders, foreign references and wrong-target associations; preserve input/history. No automatic Shot creation, planning generation or new authoring product.
  - [ ] Establish one monotonic conversation selection revision in artifacts-owned persistence. Every saved Shot-order change advances it in the same transaction as new version/use/change records and returns it in edit/workspace responses; rejected/repeated operations do not advance twice. No order change leaves a mismatched revision; generic planning saves cannot bypass this invariant. Description-only edits do not masquerade as order/choice changes.
  - [ ] Exact reference/Panel-image use validates intended Shot/Panel and image kind; candidates never become approved images from display alone. Retain transitive dependencies, affected Shot siblings and `affected` IDs for relevant upstream/manual changes, including coverage/anchor lineage and unknown impact. Changes require revalidation, never regeneration, Script rewriting, silent reference substitution or erasing unrelated historical approvals; reads do not consume change records.
- **Functional verification:**
  - [ ] Real browser/built API/Postgres tests edit a persisted multi-Panel plan and exact associations, reload stable IDs/order/approval and reject stale/foreign/wrong-target edits without losing text. Concurrent reorder/retry/rollback tests prove atomic version/use/revision/change effects; upstream-edit fixtures prove affected lineage/coverage stays visible and unrelated approvals/history remain intact, with no generation/native command.
- **Regression verification:**
  - [ ] Run common save/provenance/reuse/owner checks and existing storyboard/edit/reference/account-scope races, keyboard and visual suites; assert viewing/reloading does not mutate selection revision or consume changes.
- **Editorial/design verification:** use Shot, Storyboard Panel and Frame distinctly; preview any absent order/conflict/affected-work state, preserving approved planning layout and shared comparison rules.
- **Manual-only behavior verification:** shared visual review; stable identities, references, revision atomicity and stale-save behavior automated.
- **Planned commits:**
  1. `Feat(artifacts): Persist storyboard revisions` — stable planning, selection revision and affected/change rules.
  2. `Feat(storyboard): Save exact planning edits` — actual controls, Panel bindings and race/visual verification.
- **Technical notes:** selection revision is artifacts-owned conversation metadata keyed by native identity, not another conversation store. Future export capture consumes this interface; do not implement export here.

#### Story 7: Exact Shot-video choice (P3-S5, S5-2)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** creator, **I want** explicit exact-version Shot-video choices, **so that** playback and reference attachment cannot silently choose my film.
- **Dependencies:** Stories 1–6; persisted Shot plan and actual verified uploaded clips, not a generation producer.
- **Acceptance criteria:**
  - [ ] Implement `useVersion` with `shot_video`: validate owned conversation, existing intended Shot and verified video kind; persist one exact current choice per Shot and return/reload it without substituting a newer version. Every saved choice change advances the conversation selection revision atomically with use/dependency/change effects. Identical operation retries return the original result; conflicting reuse, foreign/wrong-kind/wrong-target inputs and failed transactions produce no partial choice or revision change.
  - [ ] Actual choice controls use owned version reads and exact Shot bindings; viewing, playing, seeking, closing and reference attachment never choose a Shot video. Preserve historical decisions and unrelated approvals; upstream/manual changes retain affected/dependency/change records without automatic regeneration or Script rewriting. No generation endpoints, fabricated requests or new planning builder are needed.
- **Functional verification:**
  - [ ] Browser → built backend → isolated Postgres/emulator tests choose uploaded versions for persisted Shots, change/reload choices and assert exact IDs and one current choice. Concurrent choice/reorder, rollback, duplicate/lost-response and two-account tests prove revision serialization and no partial effects; observer proves viewing/reference attachment sends no `shot_video` command. Every new case has red→green evidence.
- **Regression verification:**
  - [ ] Run planning/stale-save/reorder, Library/reference/Panel approval, provenance, selection-race and scope-switch tests; preserve wave-2 generation/export unavailability and approved keyboard/visual behavior.
- **Editorial/design verification:** reuse approved exact-version Use/Chosen presentation; preview any missing uploaded-version-to-Shot entry state under the shared contract, without adding generation controls.
- **Manual-only behavior verification:** shared visual review; exact choice/revision/race effects automated.
- **Planned commits:**
  1. `Feat(artifacts): Persist exact Shot choices` — transactional choice/revision and change records.
  2. `Feat(videos): Choose owned video versions` — actual controls and identity/race/visual proof.
- **Technical notes:** compose choice-only changes additively; do not require generation-request reads to succeed. Tests may supply valid persisted planning prerequisites, not substitute a generation lifecycle. No export capture is implemented here.

#### Story 8: Private single-clip playback (P3-S10)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** creator, **I want** private playback of an individual exact version, **so that** I can inspect picture and embedded audio without changing selection.
- **Dependencies:** Stories 1–7; credential-configured SeaweedFS `chrislusf/seaweedfs:4.51` pinned by digest, AWS SDK v3 S3 client/presigner and `PutBucketCors` configuration from Story 3.
- **Acceptance criteria:**
  - [ ] Complete owned `media` acquisition/reacquisition through api-client; player only consumes supplied sources/events and owns no Auth, resource lookup or selection. Play/pause/seek use exact backend versions, including chosen clips; verify actual decoded picture and embedded audio. An individual uploaded video is reachable for inspection without a Script/Shot plan; public fixture clips alone are not private playback proof.
  - [ ] Browser consumer proves cross-origin private GET/range behavior, measured metadata/poster access, URL expiry with bounded exact-version reacquisition or explicit terminal failure, ownership denial, loading/interruption and conversation/account switching. Dispose old sources/listeners and discard late results; no reacquisition loop, command replay, selection change or exported file. Use the same owned media access for authorized download without enabling export operations; preview any missing download affordance first.
  - [ ] No sequential Play all, comparison, timeline editing, audio mixing or export processing. Issued signed URLs are time-limited bearer capabilities; do not claim account switching revokes an already issued URL before expiry. Real-R2 transport/player acceptance remains mandatory in Story 9.
- **Functional verification:**
  - [ ] Real browser/built-backend/Auth/Postgres/emulator tests upload and play a known synthetic audio/video without planning records, pause/seek and verify expected decoded frames/audio signal plus downloaded-byte hash. Assert 206/Content-Range and correct byte slices, denied unsigned access, actual expiry/reacquisition, failed refresh settlement and old-scope teardown; observer asserts zero selection/export mutations. Record red→green for new behavior.
- **Regression verification:**
  - [ ] Run player/source-race/cleanup/client-deadline tests, upload verification/no-overwrite, exact choices, reference attachment, two-account isolation and production exposure/secret checks; retain all existing media/keyboard/visual comparisons.
- **Editorial/design verification:** approved single-clip appearance is reused; preview missing loading/interruption/expiry/download states at 1440/390 and capture main surfaces at 1440/390/820/821 with shared zero-tolerance/two-sided geometry rules.
- **Manual-only behavior verification:** shared visual review; picture/audio correctness, controls and private transport automated with synthetic fixtures, not subjective creative-quality claims.
- **Planned commits:**
  1. `Feat(media): Serve private version sources` — owned access/download and bounded reacquisition.
  2. `Feat(player): Qualify private clip playback` — actual consumer transport/decode/race and visual tests.
- **Technical notes:** keep framework-free player and source-access responsibilities separate; reuse the bounded media adapter, not another playback or download protocol. No edits to wave-2 export consumers are required.

#### Story 9: Real R2 qualification (P3-S3 / P3-S10)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: None
  - Resolution: N/A
- **As a** maintainer, **I want** actual development-R2 browser evidence, **so that** emulator compatibility is not mistaken for qualified private delivery.
- **Dependencies:** Stories 1–8; before this story starts, Lou provides the dedicated dev bucket, a token limited to object read/write in that bucket, and the bucket's CORS rule, following the orchestrator's setup steps. Missing bucket/access blocks execution, never completion with an open gate.
- **Acceptance criteria:**
  - [ ] Against that bucket, use the production AWS SDK v3 adapter and real browser/api-client/built backend/Auth/isolated Postgres path to qualify signing, the bucket's exact-origin CORS rule (set once by Lou; the token cannot change bucket settings, so tests verify the rule rather than set it), preflight from allowed and disallowed origins, image display, private playback, range responses and byte slices, actual URL expiry/reacquisition or explicit failure, stored bytes/type/size/decode/posters and authorized download. Synthetic/licensed files only; record sanitized observed response shapes and concrete expiry/bounds, not complete signed URLs.
  - [ ] Repeat owner/foreign/unsigned denial, mismatched/unsupported/oversized bytes, interrupted/duplicate confirmation and staging-URL replay/no-overwrite checks on R2; confirmed versions/uses remain unique and published hashes unchanged. Compare decoded picture/embedded audio and downloaded hashes through actual consumers; qualify exact-version choice/view separation. Preserve cleanup references on failure and remove only this run's authorized staging/test objects, never unrelated bucket contents.
  - [ ] Credentials load only from an ignored file under each clone's `outputs/`, like the Supabase fixtures, backend-only; tokens, credentials, presigned query strings and private media never enter logs, screenshots, traces, browser bundles or evidence. Exact bucket-origin egress allowance exists only in the explicit qualification run; normal loopback guards remain. **Sprint 005 cannot be Complete until this story passes; there is no open-gate completion.**
- **Functional verification:**
  - [ ] Run a dedicated repeatable qualification selection in the existing harness with consumable network allowances and red→green behavior controls; record SHA, redacted target identity, fixture hashes, observed results and log paths for every real-R2 AC above. Failed/unrun/ambiguous evidence blocks this story and sprint completion; an emulator pass cannot substitute.
- **Regression verification:**
  - [ ] Rerun local emulator upload/playback/retry suites, owner/security/secret/exposure checks and default egress-denial controls after R2-specific adjustments; no provider-specific fallback, loosened CORS or weakened observer allowance is accepted.
- **Editorial/design verification:** audit redacted evidence and reuse approved views; no new design is implied by changing storage target. Any discovered new state follows inert-preview approval first.
- **Manual-only behavior verification:** N/A for service behavior — browser/storage qualification is automated. Lou supplying the bucket is a prerequisite, not verification evidence; shared visual review remains applicable.
- **Planned commits:**
  1. `Test(storage): Qualify development R2` — repeatable real-service tests, scoped configuration and redaction guards.
  2. `Fix(storage): Resolve qualified R2 gaps` — only demonstrated compatibility corrections and renewed regression proof, if needed.
- **Technical notes:** this story carries all real-R2 ACs of P3-S3/P3-S10 deferred by approved local-first packaging. It authorizes neither production/shared deployment nor live model calls. Escalate an essential R2/contract mismatch rather than fake transport success.

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
  - [ ] Story 9 real-R2 evidence passes at the delivered head; all ten implemented operations have genuine consumer/persistence evidence with producer prerequisites disclosed. Questions/proposals/generation/export remain wave 2. Migration privileges, every conversation-scoped ownership check and production fixture exclusion retain executable proof.
  - [ ] Run the shared ordered command sequence with SHA-bound logs under `outputs/verification/sprint-005/<sha>/`; report B-002/B-004 audit NON-PASS separately and ingress as observed (PASS or B-001 NON-PASS). No other missing gate, including real R2, is absorbed into those exceptions. If integrating second, merge updated `phase-3` without rebase and rerun the full combined-head suite, including collaborator/native qualification.
  - [ ] Reconcile retired mounts with equal/stronger real-flow coverage, required main/state visual comparisons and provisional approvals. Report all 11 canonical verification types, including zero rows: Unit; Integration / contract; E2E / smoke; Simulator / device; AI / model evals; Static / local checks; Performance / load; Security / dependency; Accessibility / visual; Manual-only; Other verification. Explain Unknown counts; count each case once, separate commands from behavioral cases, and use the fresh post-foundation baseline.
- **Functional verification:**
  - [ ] Run all functional verification items from every story and record pass/fail evidence.
- **Regression verification:**
  - [ ] Run all targeted regression verification items from every story and record pass/fail evidence.
  - [ ] Run the full available regression verification suite and record pass/fail evidence.
- **Editorial/design verification:** audit terminology, consumer/producer boundaries, dependency rationales, built-in decision, all required paired captures and design/history approval records; preserve Lou's Phase 3 ratification gate. No persistent prose-presence tests.
- **Manual-only behavior verification:** shared human side-by-side visual review: inspect each required reference/application pair and overlay at its prescribed widths; pass only with no unexplained difference and recorded approval of deviations. AI inspection cannot satisfy this gate; service behavior remains automated.
- **Planned commits:**
  1. `Docs(sprint): Record verification evidence` — orchestrator records final evidence, verification delta, New Dependencies and completion only after confirming gates.
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
