# Regression gates

Workprint's map for the harness regression command contract. `.checks/regression.sh` owns the commands and `.checks/config.json` owns the deep merge bases, budgets and limits.

## Tiers

| Tier | Trigger | Checks, in order | Budget | Observed |
|---|---|---|---|---|
| quick | commit | `pnpm check`, `pnpm test:unit` | 180 s | 82 s (x64 orb) |
| standard | push, merge into any other branch | quick, then `pnpm build`, `pnpm test:tooling` | 300 s | 101 s (x64 orb) |
| deep | merge into `main` or `develop` | standard, then integration and browser journeys on one shared stack, then `scripts/audit.mjs` | 1200 s | 138 s |
| full, routine | — | not configured; exits 2 | — | — |

Hooks run these through each clone's `git config --local core.hooksPath <harness root>/githooks` (per clone, not committed). Each budget includes a 90 s cleanup reserve. Don't run `pnpm test:*` by hand during a gate run; it rebuilds the shared test build. A step that ends without failing but has something to report prints a `GATE-NOTICE:` line. The gate prints that line again in its summary, and it must appear in the report.

The gate compiles package declarations and API/web/client tests once during setup; `check`, unit and tooling reuse that output. Standalone `pnpm check` and test commands compile afresh, removing stale emitted tests first. Root type checking covers the web app; the compile step checks API and shared packages, and E2E has its own type check. Production builds remain separate from test output.

Only the explicit unit group runs independent files concurrently, bounded by `.checks/config.json` (currently two workers). `CHECKS_JOBS=1 pnpm test:unit` selects serial execution; values above the configured limit are rejected. Integration, tooling and the default all-tests invocation remain serial. The x64 timings above are observations, not revised budgets or fresh deep qualification; the older deep timing came from a different environment.

## Merges

Run `.checks/pre-merge.sh --base <base> --head <40-hex sha>` with a clean tracked tree, once GitHub shows the new head.

Quick and standard apply to every branch. Only a merge into a base listed in `deep_merge_bases` (`main` and `develop`) runs deep. A merge into any other branch, such as a sprint branch, runs standard. No branch needs its own config entry.

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

Lou approved the tiers, triggers, budgets and audit threshold on 2026-11-01 (PR #70). The same day Lou replaced the per-branch merge targets: quick and standard apply to all branches, and only merges into `main` or `develop` run deep.
