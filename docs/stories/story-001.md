# Workprint — Story: Shared foundation for parallel Phase 3 sprints

<!-- Canonical naming: docs/stories/story-NNN.md, exactly story- plus a 3-digit zero-padded index; no title suffix. Keep the title above inside the file. Creation workflow: skills/create-story/SKILL.md in the canonical harness root (AGENTS.md §12). -->

**Date:** 2026-10-29
**Type:** Feature
**Status:** 🟡 Planning
**Planning review:** an independent review (2026-10-29) found one P1 (the port scope missed about 100 hardcoded references and the fixed 4180 preview server) and two P2s (exception pass conditions, and the target-branch exception). All three are resolved; re-check **5/5**. Implementation awaits Lou's authorization.
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
- **Problem/current behavior:** Sprints 004 and 005 must run concurrently in separate worktrees without depending on each other. Both need:
  1. the same Mastra version;
  2. one trusted answer to "does this native conversation belong to this verified account?";
  3. browser-test ports that don't collide.

  Today none of these exist, and building any of them inside either sprint would create a cross-sprint dependency or a duplicate.
- **Expected behavior/outcome:**
  - `phase-3` carries the upgraded Mastra 1.80.x version set with the full suite unchanged.
  - A per-checkout browser-test port is available.
  - A backend-composed owned-conversation check is supplied to `application`, with a test-only helper that creates native conversations for an account through supported native APIs.
  - Both sprints then branch from this head.

## Story

**As a** maintainer, **I want** one shared, verified Phase 3 base for the native version set, conversation ownership and concurrent test ports, **so that** Sprints 004 and 005 can run in parallel without building on each other or duplicating foundations.

- **Scope:** a dependency upgrade, a test-harness port setting, and one narrow trusted read collaborator plus its test-only fixture helper.
- **Non-goals:**
  - conversation create/list/load routes, UI or Recents (Sprint 004, Story 3);
  - the B-001 fix (Sprint 004, Story 1), though this story records the upgraded ingress result;
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
- [ ] Ready for implementation

## Affected Flows

- **Existing flows affected:**
  - developer browser/visual verification, which gains a per-checkout port;
  - build/dev/start and native storage preparation, on the upgraded Mastra version.
  
  No product flow changes: every application operation and native capability keeps its current outcome.
- **New flows introduced:** the internal trusted conversation-ownership check used by later conversation-scoped operations. It has no browser-facing route of its own.

## Acceptance Criteria

- [ ] **Mastra version set.**
  - `mastra` becomes the current 1.36.x and `@mastra/core` the current 1.80.x. `@mastra/pg` and the other Mastra packages move to their matching compatible releases; the transitive `@mastra/deployer` becomes 1.80.x.
  - The versions are exact, with a frozen lockfile and no other dependency changes.
  - `pnpm install --frozen-lockfile`, `check`, `build` and `test` pass. `test:browser` passes with its count unchanged, and `test:visual` passes with zero drift.
  - **Exceptions:**
    - `qualify:ingress` may fail only on the two existing B-001 leaves;
    - `audit` may report only the existing B-002 and B-004 advisories;
    - each is recorded leaf by leaf or advisory by advisory and never counted as a pass;
    - a new or worsened failure, or any new advisory, fails the story. If B-001 now passes, record it.
  - A breaking change that needs more than version-mechanical adaptation stops the story for escalation.
- [ ] **Browser-test ports.**
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
- [ ] **Owned-conversation check.**
  - `application` declares a narrow collaborator. Given a verified account ID and a conversation ID, it returns `owned` or `not_found`, plus a typed unavailable outcome when native storage cannot answer.
  - Backend composition implements it over the supported Mastra native storage API: thread lookup, with ownership equal to the thread's resource identity matching the verified account. It is supplied through bootstrap, so `application` still imports no agent, Mastra subtree or bootstrap, and dependency-cruiser passes.
  - The check is read-only and leaks no existence: foreign and absent conversations give the same `not_found`. A malformed ID returns an invalid or not-found outcome, never a raw query error.
  - Before mapping, the observed native thread shape is recorded in redacted form. The account-to-resource mapping becomes the documented rule that Sprint 004 must use when creating conversations.
- [ ] **Test-only fixture helper.**
  - Under `apps/api/test/`, a helper creates native conversations, and optionally messages, for a given account in isolated real Postgres through the supported native API.
  - It is excluded from production build inputs, assets and runtime, and the existing exposure checks are extended to cover it.
  - Neither a production route nor a seed endpoint is added.

## Implementation Plan

- **Touched modules/files:**
  - `package.json`, `apps/api/package.json`, `pnpm-lock.yaml`;
  - `scripts/browser/playwright.config.ts`, `apps/web/vite.test.config.ts`, the pair helpers and specs under `scripts/browser/`, the `apps/web/test/*-mount.tsx` origins, and the documented command/environment notes in `README.md`;
  - the collaborator type in `apps/api/src/application/`;
  - its implementation in `apps/api/src/agent/mastra/`, which the spec assigns trusted conversation access;
  - additive composition in `apps/api/src/mastra/`;
  - tests and the helper in `apps/api/test/`.
- **Approach:**
  1. Upgrade first and run the full ordered suite, so later commits sit on the settled version set.
  2. Observe the real native thread shape before writing the mapping.
  3. Keep the collaborator to a single question. Sprint 004 builds conversation operations on it; Sprint 005 calls it for every conversation-scoped read or write.
  4. Replace the port literals mechanically through one shared harness origin helper, plus the page origin in mounts.
  5. Run the concurrent check as a scripted pair of full-suite runs in two checkouts, kept as evidence, not as a persistent suite.
- **Risks/rollback:**
  - Upgrade regressions in the generated server or native storage are caught by the full suite. If a fix needs non-mechanical change, stop for escalation.
  - Rollback is a normal `git revert` of the PR.
  - If the upgrade happens to fix B-001, record that; Sprint 004 Story 1 still owns the qualification and its locking.
- **New dependencies:** None. These are version upgrades of existing Mastra packages.
- **Planned commits:**
  1. `Chore(deps): Upgrade Mastra to 1.80` — exact versions, frozen lockfile and the full ordered suite.
  2. `Test(browser): Make test ports configurable` — one origin setting, preview port, literal replacement and the concurrent full-suite check.
  3. `Feat(api): Add owned-conversation check` — the collaborator, native implementation and bootstrap composition.
  4. `Test(api): Prove conversation ownership` — the fixture helper, two-account tests and exposure-check extension.

## Verification Plan

- **Functional verification:**
  - [ ] **Ownership tests (red→green):** in isolated real Postgres with two Supabase-verified synthetic accounts, created through the helper:
    - owned gives `owned`;
    - foreign and absent give identical `not_found`;
    - malformed gives invalid or not-found without a query error;
    - storage unavailable gives the typed unavailable outcome, never `owned`.

    The red log comes from before the collaborator exists.
  - [ ] **Concurrent ports:**
    - two checkouts at the PR head run the complete `test:browser` and then `test:visual` at the same time, with distinct port pairs and output directories, and both pass in full;
    - a run against an occupied port exits non-zero with a port error;
    - a repository search shows `4179`/`4180` only as the defaults;
    - logs are saved under `outputs/verification/foundation/<sha>/`.
  - [ ] **Upgrade:** the full ordered suite passes on the upgraded version set, as stated in the acceptance criteria. The redacted observed native thread shape and the `qualify:ingress`/`audit` results are recorded in the PR.
- **Regression verification:**
  - [ ] The full ordered suite runs with the standard environment: `pnpm install --frozen-lockfile`, `check`, `build`, `test`, `test:browser`, `test:visual`, `qualify:ingress`, `audit`.
    - `WORKPRINT_AUTH_FIXTURE="$PWD/outputs/local-supabase.setup.json"`
    - `WORKPRINT_AUTH_SIGNING_FIXTURE="$PWD/outputs/local-supabase.status.json"`
    - `WORKPRINT_BROWSER_OUTPUT="$PWD/outputs/verification/foundation/<sha>"`

    These must hold: all 19 application operations keep their Auth-first 401/400/501 outcomes; unintended native routes stay 404; health stays 200; native storage preparation and serving-role restrictions still pass; the production build excludes the helper. Browser and visual counts are unchanged, with zero drift. Every non-exempt check passes. Only the existing B-001 leaves and B-002/B-004 advisories may fail; they are reported separately and never counted as passes. Any new or worsened failure fails the story.
- **Editorial/design verification:** N/A — there is no UI or design change. README command notes are reviewed for accuracy.
- **Manual-only behavior verification:** N/A — all checks are automated or scripted with saved logs.

## Completion Evidence

(Fill this in before marking the story `🟢 Complete`.)

- **PR:**
- **Commits:**
- **Acceptance criteria evidence:**
- **Functional verification evidence:**
- **Regression verification evidence:**
- **Editorial/design verification evidence:**
- **Manual-only behavior verification evidence:**
- **Failed, ambiguous, or unrun verification:**
- **Review evidence:**
- **New dependencies:**

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
