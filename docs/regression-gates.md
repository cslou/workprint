# Regression gates

This is Workprint's repository map for the harness regression command contract. `.checks/regression.sh` is the only owner of the command list. `.checks/config.json` holds the target classes, budgets and resource limits. The event wrappers only choose a tier.

## Tiers

Every tier starts with `setup`, which records a leftover baseline and compiles the tests once. Every tier ends with `teardown`, which fails if the run left resources behind (see [Cleanup](#cleanup)).

| Tier | Trigger | Checks, in order | Proof |
|---|---|---|---|
| quick | commit (`.checks/pre-commit.sh`) | `check` (`pnpm check`), then `unit` (`pnpm test:unit`) | **Static:** strict TypeScript including the browser journeys, ESLint, and dependency-cruiser boundaries. **Unit:** 96 Docker-free tests, plus the runner's refusal of tests under `src/`. |
| standard | push (`.checks/pre-push.sh`), and merges into a story target | quick, then `build` (`pnpm build`), then `tooling` (`pnpm test:tooling`) | Production build. Docker-free build, bundle and dev-task tooling tests. |
| deep | merges into a delivery target | standard, then `stack-suites`, then `audit` (`scripts/audit.mjs`) | **Integration:** Docker-backed API, database, storage and media tests. **E2E:** eight browser journeys. **Security:** dependency advisories. |
| full, routine | not configured | none | Invoking either tier exits 2 with "not configured for this repository". It never passes silently. |

`stack-suites` starts one [shared test stack](../README.md#shared-test-stack-test-only) and runs two suites inside it: `node scripts/test.mjs integration`, then the Playwright journeys. A deep run therefore starts the stack only once. If integration fails, the browser journeys do not run. The step prints a `GATE-NOTICE:` saying so, so the report shows the browser result as unrun rather than failed.

The audit blocks only on high and critical advisories. It lists moderate, low and info advisories in its log and prints a `GATE-NOTICE:` with their counts. These remain a reported non-pass under the existing exceptions in [Sprint 004](sprints/sprint-004.md) and [Sprint 005](sprints/sprint-005.md) (B-002, B-004, B-008). They never count as a pass.

## Reporting

The script prints `PASS` or `INCOMPLETE`, the selected scope, every `GATE-NOTICE:` line from the run, and a path to each step's log. The agent that ran the gate turns this output and the logs into the contract's six-section report:
1. status and score
2. dashboard by category
3. protection changes
4. failures
5. evidence
6. verdict

That report must carry every `GATE-NOTICE:`.

## Merge targets

Merges run through `.checks/pre-merge.sh --base <base> --head <40-hex head sha>`. Before choosing a tier, the gate checks two things:
- The tracked working tree is clean, so the evidence describes the head commit itself.
- The base, the head SHA and the branch match `gh pr view`.

| Base | Class | Tier |
|---|---|---|
| `main` | delivery | deep |
| `develop` | delivery | deep |
| `phase-3` | story | standard |

Any base not in `targets` is refused until it is added. Never infer a class from a branch prefix. A new phase branch needs its own entry, added under approval.

Each merge head branch also needs an entry in `story_checks`, one per line. The only accepted value is `[]`, meaning no extra story checks. A missing entry blocks the merge. Each feature PR adds its own entry, and the delivery merge for a phase removes that phase's merged entries.

The entry is read from the head branch's own config, so it records the PR author's declaration. It is not an independent approval.

## Budgets and resources

| Tier | Budget | Observed (2026-11-01) |
|---|---|---|
| quick | 180 s | 51 s |
| standard | 300 s | 62 s |
| deep | 1200 s (the contract's default ceiling; larger only through an approved exception) | 138 s |

Each budget includes a 90 s cleanup reserve: `teardown_seconds` (10) plus two `cleanup_seconds` slices of 40 s. The work itself must therefore finish within the budget minus 90 s, which is 90 s for quick. A slice is sized for Playwright's 30 s worker force-exit plus the stack launcher's container removal, which takes 2–3 s.

The resources are `jobs: 2` and `open_files: 4096`. No command reads `CHECKS_JOBS`. Concurrency is actually bounded by `--test-concurrency=1`, by Playwright's `workers: 1`, and by the gate running one step at a time. Vite, Playwright and Chromium need the higher open-file limit.

The end-to-end app uses loopback port 4180. If another checkout is using that port, set `WORKPRINT_PREVIEW_PORT` to a free one.

## Cleanup

The test stack belongs to `stack-suites`. It removes the stack on exit, on SIGTERM, and on an interrupt during startup, including during media fixture generation.

Each stack keeps its `outputs/fixtures/stack/<owner>` directory until every container, network and server it started has been released. A directory that is still there therefore marks an incomplete cleanup, for example after a failed removal or a SIGKILL.

Some processes run in their own process groups, so the gate's process-group stop cannot reach them: the API server and Vite started by the journeys, the media `docker` jobs, and Chromium. Their owners stop them during the cleanup reserve.

`setup` records a baseline in the run's log folder (`CHECKS_RUN_DIR`). `teardown` fails the run if either of these is new:
- a stack directory in this checkout;
- a listener on the preview port. This is checked only when the run started the browser journeys, because the port is shared across the host.

Docker resources are not compared, because other checkouts create `workprint-*` containers on the same host.

Teardown only reports. It never removes anything, because a resource is not proven to be owned just because it is new. An API server orphaned on a random port by a forced Playwright worker exit is not detected. Step 3 below covers it.

## Running

```sh
.checks/regression.sh --tier=quick      # or standard, deep
.checks/pre-merge.sh --base phase-3 --head "$(git rev-parse HEAD)"
```

Per-step logs go to `.checks/.logs/run-*/`. Do not run `pnpm test:*` by hand in the same checkout during a gate run, because it recompiles the shared test build.

Git hooks reach the wrappers through each clone's `git config --local core.hooksPath <harness root>/githooks`. That setting is per clone and is not committed.

## Incomplete runs

A run that fails, is interrupted or exceeds its budget keeps `.checks/.incomplete.json` and its logs. Every later run refuses until someone deals with them. There is no automatic reset. To deal with an incomplete run:
1. Read the marker, the logs and any teardown leftovers.
2. Diagnose and fix the cause.
3. Confirm that nothing from the run is still alive: `workprint-*` containers and networks, stack directories, a listener on the preview port, and API or Vite processes started by the browser journeys. Remove only what you have confirmed this run owned.
4. Only then move the marker out of its active name and record the diagnosis.

Do not delete the marker just to rerun the same work.

## Existing checks inventory

Every existing required check is kept, as follows.

| Check | Tier | Change |
|---|---|---|
| `pnpm check` | quick | Unchanged. |
| `pnpm test:unit` | quick | Unchanged. |
| `pnpm build` | standard | Unchanged. |
| `pnpm test:integration` | deep | The three Docker-free tooling test files moved to `pnpm test:tooling`. That group runs in standard, so they now run more often. |
| `pnpm test:browser` | deep | The journeys are unchanged. They now share the integration stack. |
| `pnpm audit` | deep | Now blocks on high and critical advisories only. Lower advisories are reported as a non-pass under B-002, B-004 and B-008, which matches the existing policy. A bare `pnpm audit` still exits non-zero while those advisories exist. |

There is no CI and no branch protection. This gate replaces neither.

## Approval

Lou approved this map, its triggers, its budgets, its target classes and the audit threshold on 2026-11-01. The approval came through the planning request for the `chore/regression-gates` PR (#70).
