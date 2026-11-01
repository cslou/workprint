# Regression gates

This is Workprint's repository map for the harness regression command contract. `.checks/regression.sh` is the only owner of the command list. `.checks/config.json` holds the target classes, budgets and resource limits. The event wrappers only choose a tier.

## Tiers

| Tier | Trigger | Checks, in order | Proof |
|---|---|---|---|
| quick | commit (`.checks/pre-commit.sh`) | `check` (`pnpm check`), then `unit` (`pnpm test:unit`) | Static: strict TypeScript including the browser journeys, ESLint and dependency-cruiser boundaries. Unit: 96 Docker-free tests, plus the runner's refusal of tests under `src/`. |
| standard | push (`.checks/pre-push.sh`), and merges into a story target | quick, then `build` (`pnpm build`), then `tooling` (`pnpm test:tooling`) | Production build. Docker-free build, bundle and dev-task tooling tests. |
| deep | merges into a delivery target | standard, then `stack-suites`, then `audit` (`pnpm audit --audit-level=high`) | Integration: Docker-backed API, database, storage and media tests. E2E: eight browser journeys. Security: dependency advisories. |
| full, routine | not configured | none | Invoking either tier exits 2 with "not configured for this repository". It never passes silently. |

`stack-suites` starts one [shared test stack](../README.md#shared-test-stack-test-only) and runs `node scripts/test.mjs integration` followed by the Playwright journeys inside it, so a deep run starts the stack once. The `unit` step compiles the stack launcher before `stack-suites` runs.

The audit blocks only on high and critical advisories. Moderate and low advisories stay visible in the audit log and must be reported, but they do not fail the gate.

## Merge targets

Merges run through `.checks/pre-merge.sh --base <base> --head <40-hex head sha>`. The gate then checks the base, head SHA and branch against `gh pr view` before it chooses a tier.

| Base | Class | Tier |
|---|---|---|
| `main` | delivery | deep |
| `develop` | delivery | deep |
| `phase-3` | story | standard |

Any other base is refused until it is added to `targets`. Never infer a class from a branch prefix. A new phase branch needs its own entry, made under approval.

Each merge head branch needs an explicit entry in `story_checks`, and the only approved value is `[]`, meaning no extra story checks. A missing entry blocks the merge. Each feature PR adds its own branch entry.

## Budgets and resources

| Tier | Budget | Observed (2026-11-01) |
|---|---|---|
| quick | 120 s | 51 s |
| standard | 300 s | 67 s |
| deep | 1200 s (the contract's hard ceiling) | 153 s |

Every budget includes a cleanup reserve: `teardown_seconds` (10) plus two `cleanup_seconds` slices (20 each). A slice covers the stack launcher's SIGTERM teardown, which has been observed at about 2–3 s.

Resources are `jobs: 2` and `open_files: 4096`. Checks run one at a time. Vite, Playwright and Chromium need the higher open-file limit.

Gate-level `setup` and `teardown` are no-ops. The test stack belongs to `stack-suites`, which removes it when it exits or receives SIGTERM. A SIGKILL or a host crash can still leave owner-labelled `workprint-*` containers behind. In that case, confirm their ownership before removing them.

The end-to-end app uses loopback port 4180. If another checkout is using it, set `WORKPRINT_PREVIEW_PORT` to a free port.

## Running

```sh
.checks/regression.sh --tier=quick      # or standard, deep
.checks/pre-merge.sh --base phase-3 --head "$(git rev-parse HEAD)"
```

Per-step logs are written to `.checks/.logs/run-*/`. Git hooks reach the wrappers through each clone's `git config --local core.hooksPath <harness root>/githooks`. That setting is per clone and is not committed.

## Incomplete runs

A run that fails, is interrupted or exceeds its budget keeps `.checks/.incomplete.json` and its logs, and every later run refuses until someone deals with them. There is no automatic reset:

1. Read the marker and logs.
2. Diagnose and fix the cause.
3. Confirm that no owned processes or containers are still running.
4. Only then move the marker out of its active name, recording the diagnosis.

Do not delete the marker just to rerun the same work.

## Existing checks inventory

Every existing required check is kept, as follows.

| Check | Tier | Change |
|---|---|---|
| `pnpm check`, `pnpm build`, `pnpm test:unit` | quick, standard | Unchanged. |
| `pnpm test:integration` | deep | The three Docker-free tooling test files moved to `pnpm test:tooling`, which runs in standard and so runs more often. |
| `pnpm test:browser` | deep | Unchanged journeys. They now share the integration stack. |
| `pnpm audit` | deep | Blocks on high and critical advisories only. Moderate advisories are reported. |

There is no CI and no branch protection, and this gate replaces neither.

## Approval

Lou approved this map, its triggers, budgets, target classes and the audit threshold on 2026-11-01. The approval came through the planning request for the `chore/regression-gates` PR.
