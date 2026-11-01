# Regression gates

Workprint's map for the harness regression command contract. `.checks/regression.sh` owns the commands and `.checks/config.json` owns the targets, budgets and limits.

## Tiers

| Tier | Trigger | Checks, in order | Budget | Observed |
|---|---|---|---|---|
| quick | commit | `pnpm check`, `pnpm test:unit` | 180 s | 51 s |
| standard | push, story merge | quick, then `pnpm build`, `pnpm test:tooling` | 300 s | 60 s |
| deep | delivery merge | standard, then integration and browser journeys on one shared stack, then `scripts/audit.mjs` | 1200 s | 138 s |
| full, routine | — | not configured; exits 2 | — | — |

Hooks run these through each clone's `git config --local core.hooksPath <harness root>/githooks` (per clone, not committed). Each budget includes a 90 s cleanup reserve. Don't run `pnpm test:*` by hand during a gate run; it rebuilds the shared test build. A step that ends without failing but has something to report prints a `GATE-NOTICE:` line. The gate prints that line again in its summary, and it must appear in the report.

## Merge targets

Run `.checks/pre-merge.sh --base <base> --head <40-hex sha>` with a clean tracked tree, once GitHub shows the new head.

| Base | Class | Tier |
|---|---|---|
| `main`, `develop` | delivery | deep |
| `phase-3` | story | standard |

The gate refuses any base that has no entry here. Never guess a class from the branch name. Each head branch also needs a `story_checks` entry, and the only allowed value is `[]`. Each feature PR adds its own entry, which is the author's declaration and not an independent approval.

## Incomplete runs

A failed, interrupted or over-budget run keeps `.checks/.incomplete.json` and its logs in `.checks/.logs/`, and later runs refuse to start. Clear it like this:
1. Read the marker and logs.
2. Fix the cause.
3. Confirm nothing from the run is still alive. Check for leftover `outputs/fixtures/stack/*` folders, stopped `workprint-media-*` containers, a listener on the preview port, and orphaned API or Vite processes. Remove only what this run owned.
4. Move the marker aside and record the diagnosis.

Never delete the marker just to rerun.

## Existing checks inventory

| Check | Tier | Change |
|---|---|---|
| `pnpm check`, `pnpm test:unit` | quick | Unchanged. |
| `pnpm build` | standard | Unchanged. |
| `pnpm test:integration` | deep | Its three Docker-free tooling files moved to `pnpm test:tooling`, which runs in standard. |
| `pnpm test:browser` | deep | Unchanged; it now shares the integration stack. |
| `pnpm audit` | deep | Blocks only on high or critical advisories. Lower ones are reported as a non-pass under B-002, B-004 and B-008, which is the existing policy. |

There is no CI and no branch protection, and this gate replaces neither.

## Approval

Lou approved the tiers, triggers, budgets, target classes and audit threshold on 2026-11-01 (PR #70).
