# Workprint — Story: Shared foundation for parallel Phase 3 sprints

<!-- Canonical naming: docs/stories/story-NNN.md, exactly story- plus a 3-digit zero-padded index; no title suffix. Keep the title above inside the file. Creation workflow: skills/create-story/SKILL.md in the canonical harness root (AGENTS.md §12). -->

**Date:** 2026-10-29
**Type:** Feature
**Status:** 🟢 Complete
**Planning review:** an independent review (2026-10-29) found one P1 (the port scope missed about 100 hardcoded references and the fixed 4180 preview server) and two P2s (exception pass conditions, and the target-branch exception). All three are resolved; re-check **5/5**.
**Start (2026-10-29):** Lou authorized starting Phase 3 Wave 1, beginning with this story ("lets stick to the plan … Are we ready to commence?"). Working branch `feat/parallel-sprint-foundation` from `phase-3` at `20a9fab`. This authorizes this story's implementation and its PR into `phase-3`, not the sprint branches.
**Scope change (2026-10-29):** Lou moved the Mastra 1.80.x upgrade out of this story ("proceed without the upgrade first … when the sprints are done proceed with the upgrade"). pnpm 11's default 24-hour minimum release age blocked the new versions until about 14:00Z, and nothing in Wave 1 needs them. Both Wave 1 sprints run on the current 1.79.0 set; the upgrade becomes its own standalone story into `phase-3` after Wave 1 and before Wave 2 (backlog B-007). The approved transitive `zod-from-json-schema` 0.5.6→0.5.2 pin goes with it.
**Target branch:** `phase-3`, the Phase 3 integration branch created from `main` at `c1397c3`. This is an explicit exception to the default-branch rule below: Lou approved Phase 3 packaging through `phase-3`, as Phase 2 did through `phase-2` (see Related). `main` changes only through Lou's `phase-3` → `main` merge.
**Working branch:** `feat/parallel-sprint-foundation`
**Related issue/spec/sprint/PR:** [Phase 3 sprint packaging](../specs/implementation-spec-001.md#phase-3-sprint-packaging); prerequisite of [Sprint 004](../sprints/sprint-004.md) and [Sprint 005](../sprints/sprint-005.md)

---

## Handoff

- **Repo:** `/Users/lou/projects/workprint`
- **Tech stack:** pnpm/TypeScript monorepo. React/Vite web with a Playwright browser/visual harness; one Mastra backend (`@mastra/core` 1.79.0, `@mastra/pg` 1.32.0, CLI `mastra` 1.35.0 → `@mastra/deployer` 1.79.0) with Supabase admission and Postgres.
- **Current state:** Phase 2 is merged into `main` (`c1397c3`).
  - **Admission:** supplies a verified `accountId` (`apps/api/src/application/index.ts`). Every application operation still returns an authenticated 501.
  - **Native storage:** prepared separately by `apps/api/src/mastra/prepare.ts` (`PostgresStore`, schema `mastra`). Nothing reads native conversations yet, and no ownership check exists.
  - **Browser harness:** the browser origin `http://127.0.0.1:4179` is hardcoded in about 100 places across about 40 files: the Playwright config, the test Vite config, pair helpers, egress guards, spec allowances and `apps/web/test/*-mount.tsx`. `connectivity.spec.ts` also starts a fixed `4180` preview server. With `reuseExistingServer: false`, a second checkout running browser/visual suites at the same time fails to start. API test ports are already dynamic.
  - **Exceptions:** B-001 (`qualify:ingress`) and B-002/B-004 (`audit`) are user-approved private/local NON-PASS.
- **Problem/current behavior:** Sprints 004 and 005 must run concurrently in two separate clones (`~/projects/workprint` and `~/projects/workprint-2`) without depending on each other. Both need:
  1. the same Mastra version;
  2. one trusted answer to "does this native conversation belong to this verified account?";
  3. browser-test ports that don't collide.

  Today none of these exist, and building any of them inside either sprint would create a cross-sprint dependency or a duplicate.
- **Expected behavior/outcome:**
  - Both sprints use the current Mastra 1.79.0 set; the 1.80.x upgrade is deferred (see Scope change).
  - A per-checkout browser-test port is available.
  - A backend-composed owned-conversation check is supplied to `application`, with a test-only helper that creates native conversations for an account through supported native APIs.
  - Both sprints then branch from this head.

## Story

**As a** maintainer, **I want** one shared, verified Phase 3 base for the native version set, conversation ownership and concurrent test ports, **so that** Sprints 004 and 005 can run in parallel without building on each other or duplicating foundations.

- **Scope:** a test-harness port setting, and one narrow trusted read collaborator plus its test-only fixture helper.
- **Non-goals:**
  - conversation create/list/load routes, UI or Recents (Sprint 004, Story 3);
  - the Mastra 1.80.x upgrade (deferred by Lou on 2026-10-29; see Scope change);
  - the B-001 fix (Sprint 004, Story 1), though this story records the current ingress result;
  - native Agent, send/stream or workflows;
  - application tables or migrations (Sprint 005);
  - any application operation becoming available;
  - production seed routes;
  - any other dependency change.

## Story Checklist

(MUST BE CHECKED OFF BEFORE STARTING WORK)

- [x] Uses this standalone story template
- [x] Scope fits one independently reviewable PR and does not require a full sprint
- [x] Acceptance criteria are specific and testable
- [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
- [x] Affected flows are declared, or explicitly marked as none
- [x] Non-goals are declared
- [x] Ready for implementation

## Affected Flows

- **Existing flows affected:**
  - developer browser/visual verification, which gains a per-checkout port;
  
  No product flow changes: every application operation and native capability keeps its current outcome.
- **New flows introduced:** the internal trusted conversation-ownership check used by later conversation-scoped operations. It has no browser-facing route of its own.

## Acceptance Criteria

- **Mastra version set — moved out of this story** (Lou, 2026-10-29; see Scope change). Manifests, lockfile and release-age settings stay unchanged. The full ordered suite still runs at the final head, under the exceptions in Regression verification.
- [x] **Browser-test ports.**
  - One environment setting (default `4179`) defines the browser origin. It drives:
    - the Playwright `baseURL` and web-server URL;
    - the test Vite server, which uses a strict port;
    - every harness and spec origin, egress guard and network-observer allowance;
    - the test mounts' API origin, derived from the page origin.
  - The `connectivity.spec.ts` preview server gets its own configurable port (default `4180`).
  - After the change, the literals `4179` and `4180` remain only in those defaults; a repository search proves this.
  - `reuseExistingServer` stays `false`, and an occupied port fails loudly without attaching to another checkout's server.
  - The default command behaviour, test counts and visual results are unchanged.
  - **Concurrent proof:** two separate checkouts of the PR head run the complete `pnpm test:browser` and then `pnpm test:visual` at the same time. They use distinct port pairs and `WORKPRINT_BROWSER_OUTPUT` directories, and both pass in full with zero visual drift, with no retries, threshold changes or masks. If CPU contention causes any timing or pixel failure, the story stops for escalation; nothing is loosened.
- [x] **Owned-conversation check.**
  - `application` declares a narrow collaborator. Given a verified account ID and a conversation ID, it returns `owned` or `not_found`, plus a typed unavailable outcome when native storage cannot answer.
  - Backend composition implements it over the supported Mastra native storage API: thread lookup, with ownership equal to the thread's resource identity matching the verified account. It is supplied through bootstrap, so `application` still imports no agent, Mastra subtree or bootstrap, and dependency-cruiser passes.
  - The check is read-only and leaks no existence: foreign and absent conversations give the same `not_found`. A malformed ID returns an invalid or not-found outcome, never a raw query error.
  - Before mapping, the observed native thread shape is recorded in redacted form. The account-to-resource mapping becomes the documented rule that Sprint 004 must use when creating conversations.
- [x] **Test-only fixture helper.**
  - Under `apps/api/test/`, a helper creates native conversations, and optionally messages, for a given account in isolated real Postgres through the supported native API.
  - It is excluded from production build inputs, assets and runtime, and the existing exposure checks are extended to cover it.
  - Neither a production route nor a seed endpoint is added.

## Implementation Plan

- **Touched modules/files:**
  - `scripts/browser/playwright.config.ts`, `apps/web/vite.test.config.ts`, the pair helpers and specs under `scripts/browser/`, the `apps/web/test/*-mount.tsx` origins, and the documented command/environment notes in `README.md`;
  - the collaborator type in `apps/api/src/application/`;
  - its implementation in `apps/api/src/agent/mastra/`, which the spec assigns trusted conversation access;
  - additive composition in `apps/api/src/mastra/`;
  - tests and the helper in `apps/api/test/`.
- **Approach:**
  1. Keep the current Mastra version set; the upgrade is deferred.
  2. Observe the real native thread shape before writing the mapping.
  3. Keep the collaborator to a single question. Sprint 004 builds conversation operations on it; Sprint 005 calls it for every conversation-scoped read or write.
  4. Replace the port literals mechanically through one shared harness origin helper, plus the page origin in mounts.
  5. Run the concurrent check as a scripted pair of full-suite runs in two checkouts, kept as evidence, not as a persistent suite.
- **Risks/rollback:**
  - Rollback is a normal `git revert` of the PR.
- **New dependencies:** None.
- **Planned commits:**
  1. `Test(browser): Make test ports configurable` — one origin setting, preview port, literal replacement and the concurrent full-suite check.
  2. `Feat(api): Add owned-conversation check` — the collaborator, native implementation and bootstrap composition.
  3. `Test(api): Prove conversation ownership` — the fixture helper, two-account tests and exposure-check extension.

## Verification Plan

- **Functional verification:**
  - [x] **Ownership tests (red→green):** in isolated real Postgres with two Supabase-verified synthetic accounts, created through the helper:
    - owned gives `owned`;
    - foreign and absent give identical `not_found`;
    - malformed gives invalid or not-found without a query error;
    - storage unavailable gives the typed unavailable outcome, never `owned`.

    The red log comes from before the collaborator exists.
  - [x] **Concurrent ports:**
    - two checkouts at the PR head run the complete `test:browser` and then `test:visual` at the same time, with distinct port pairs and output directories, and both pass in full;
    - a run against an occupied port exits non-zero with a port error;
    - a repository search shows `4179`/`4180` only as the defaults;
    - logs are saved under `outputs/verification/foundation/<sha>/`.
  - **Upgrade:** moved out of this story (see Scope change). The redacted observed native thread shape and the `qualify:ingress`/`audit` results are still recorded in the PR.
- **Regression verification:**
  - [x] The full ordered suite runs with the standard environment: `pnpm install --frozen-lockfile`, `check`, `build`, `test`, `test:browser`, `test:visual`, `qualify:ingress`, `audit`.
    - `WORKPRINT_AUTH_FIXTURE="$PWD/outputs/local-supabase.setup.json"`
    - `WORKPRINT_AUTH_SIGNING_FIXTURE="$PWD/outputs/local-supabase.status.json"`
    - `WORKPRINT_BROWSER_OUTPUT="$PWD/outputs/verification/foundation/<sha>"`

    These must hold: all 19 application operations keep their Auth-first 401/400/501 outcomes; unintended native routes stay 404; health stays 200; native storage preparation and serving-role restrictions still pass; the production build excludes the helper. Browser and visual counts are unchanged, with zero drift. Every non-exempt check passes. Only the existing B-001 leaves and B-002/B-004 advisories may fail; they are reported separately and never counted as passes. Any new or worsened failure fails the story.
- **Editorial/design verification:** N/A — there is no UI or design change. README command notes are reviewed for accuracy.
- **Manual-only behavior verification:** N/A — all checks are automated or scripted with saved logs.

## Completion Evidence

(Fill this in before marking the story `🟢 Complete`.)

- **PR:** [#33](https://github.com/cslou/workprint/pull/33), `feat/parallel-sprint-foundation` → `phase-3`. The records head is the commit that adds this evidence; code and tests are unchanged from `9afa670c0de4e2915d2a48ea682d5e6538808f20`.
- **Commits:**
  - `01bd801` story start (orchestrator);
  - `78d47c2` `Test(browser): Make test ports configurable`;
  - `fcf795c` `Feat(api): Add owned-conversation check` (collaborator, helper, tests and docs);
  - `0e6d765` `Fix(browser): Canonicalize test origins` (review P2);
  - `9afa670` `Docs(story): Defer Mastra upgrade past Wave 1` (orchestrator, Lou's scope change);
  - plus this completion record.
- **Acceptance criteria evidence:**
  - **Mastra:** moved out by Lou on 2026-10-29 (backlog B-007). Manifests, lockfile and release-age settings are unchanged.
  - **Browser-test ports:** `WORKPRINT_BROWSER_PORT`/`WORKPRINT_PREVIEW_PORT` are owned by `scripts/browser/origin.ts` (canonical `URL.origin`). Strict ports and `reuseExistingServer: false` are kept. The literal search finds runtime `4179`/`4180` only in the two defaults.
  - **Owned-conversation check:** declared in `application/`, implemented in `agent/mastra/`, composed in `mastra/`.
    - Foreign and absent both give `not_found`; malformed IDs are rejected before storage; storage failure gives typed `unavailable`.
    - Observed native thread shape: `{ id, resourceId, title, metadata, createdAt, updatedAt }`.
    - Documented Sprint 004 rule: the verified Supabase `accountId` is used unchanged as the native `resourceId`.
  - **Fixture helper:** under `apps/api/test/`; the production input, asset, filesystem and runtime exposure checks are extended.
- **Functional verification evidence:**
  - **Ownership red→green:** the type check failed before the collaborator existed; the focused tests then passed 2/2. Both cases are included in the final aggregate.
  - **Concurrent proof at `9afa670`** (`workprint` on 4179/4180, `workprint-2` on 4279/4280):
    - browser 163/163 in each, overlapping 10:03:23–10:09:49Z;
    - visual 215/215 in each, overlapping 10:09:50–10:13:45Z;
    - zero drift (216 parity records each), no retries, no masks.
  - **Occupied port:** Playwright and Vite each exit 1 without attaching.
  - **P2 origin fix:** red→green.
  - Evidence: `outputs/verification/foundation/9afa670c0de4e2915d2a48ea682d5e6538808f20/` (local).
- **Regression verification evidence:** at `9afa670`, all of these PASS:
  - frozen install, check and build;
  - test 15/15 (13 baseline cases plus 2 ownership cases);
  - browser 163/163;
  - visual 215/215 with zero drift.
  - All 19 operations keep their Auth-first outcomes; closed native routes, health, native preparation and serving-role restrictions are retained.
- **Editorial/design verification evidence:** N/A, since there is no UI change. README port, environment and ownership notes were reviewed for accuracy.
- **Manual-only behavior verification evidence:** N/A.
- **Failed, ambiguous, or unrun verification:**
  - `qualify:ingress` is NON-PASS on exactly the two existing B-001 leaves (five-second watchdog; failure mode unchanged).
  - `audit` is NON-PASS on B-002 and B-004 only, with B-004 unchanged.
  - These are the approved exceptions and are not counted as passes. Nothing else failed or went unrun.
- **Review evidence:**
  - Early `/review` at `fcf795c`: 7/7 checks, 4/5, one logic P2 (port-80 origin), fixed in `0e6d765`.
  - `/review-fix` cycle 1 at `9afa670`: the security, logic and modularity regression scans plus the verification and semantic checks found nothing; 5/5.
  - This completion record is reviewed at its own head before merge.
- **New dependencies:** None.

## Rules

- Use this template for work small enough to complete, verify, review, and merge as one PR.
- If the work needs multiple independently mergeable stories, shared sprint-wide context, or final sprint verification, create a sprint with `templates/sprint.md` instead.
- Before authorized delivery, read canonical `docs/conventions/delivery-workflow.md` (resolved via AGENTS.md §12) for Git/PR mechanics; shared gates remain in `AGENTS.md`.
- Only the orchestrator updates planning records after the worker stops. Commit/push completion records, then verify and independently review the resulting head before acceptance; never reuse a stale-SHA verdict after record changes.
- PRs for standalone stories target the repo default branch unless the story is part of an active sprint branch.
- Each acceptance criterion and verification item must include a concrete pass/fail condition.
- Prefer automated verification for executable behavior. Use manual-only behavior verification only when automation is not practical, and record reproducible steps. Review descriptive-only content editorially without creating prose-presence suites.
- Mark `Status` as `🟢 Complete` only after acceptance criteria and verification evidence are recorded.

## Definition of Done

- Acceptance criteria are met.
- Functional verification evidence proves executable changes work, or N/A is justified for descriptive-only scope.
- Targeted regression verification evidence proves relevant existing behavior still works, or N/A is justified for descriptive-only scope.
- Editorial/design evidence covers descriptive content and applicable design checks.
- Failed, ambiguous, manual-only, or unrun verification items are documented.
- Completion Evidence is filled in.
- New dependencies are recorded, or `None` is recorded.
- No secrets, debug artifacts, or unrelated changes are included.
