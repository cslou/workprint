# Regression gates

Use the repository commands below. `.checks/regression.sh` owns their implementation; `.checks/config.json` owns budgets, resource limits and deep merge targets.

## Commands

| Suite | Command | Coverage | When |
|---|---|---|---|
| Quick | `.checks/regression.sh --tier=quick` | Types, lint, boundaries and unit tests | Pre-commit |
| Standard | `.checks/regression.sh --tier=standard` | Quick plus production build and tooling tests | Pre-push |
| E2E / deep | `.checks/regression.sh --tier=deep` | Standard plus integration, browser journeys and dependency audit | When required by the issue, release or merge policy below |

Quick and standard need no Docker or private configuration. Deep requires local Docker and the pinned native Linux x64 or ARM64 media prerequisites described in the [README](../README.md#amp-orbs). Do not run another gate or standalone test command concurrently in the same checkout: they share generated test output and fixture state.

## Hook activation

Run `pnpm setup:hooks` once per standalone clone after installing dependencies. Orb `.agents/setup` runs it automatically. It sets clone-local `core.hooksPath=.githooks`; repeating it is safe and global Git settings remain unchanged.

Existing custom hooks such as `prepare-commit-msg` are preserved through ignored local wrappers. Conflicting pre-commit/pre-push hooks, linked worktrees and worktree-scoped hook paths require explicit integration; activation refuses to replace them silently.

The hooks block on failed checks. They do not fix, stage or stash files, and they do not launch reviewers. Successful pre-push prints the `review` skill reminder.

Hooks check files on disk, not an isolated staged snapshot or arbitrary outgoing commits. Push the checked-out committed candidate with no relevant uncommitted changes.

## Merges

Run `.checks/pre-merge.sh --base <base> --head <40-hex sha>` with a clean tracked tree, once GitHub shows the new head.

Merge verification selects deep for `deep_merge_bases` in `.checks/config.json` (currently `main` and `develop`), otherwise standard. This does not authorize a merge or replace required manual QA.

## Failures and notices

A failed or interrupted gate leaves `.checks/.incomplete.json` and logs in `.checks/.logs/`; later gates refuse to start. Read the logs, fix the cause, and confirm owned fixture containers, processes and private stack records have been cleaned up before archiving the marker with the diagnosis. Never delete it merely to rerun.

Carry every `GATE-NOTICE:` into the result report. Dependency audit blocks on high or critical advisories; lower-severity advisories remain reported non-passes, not a clean audit.

## Approval

The existing tiers, triggers, budgets and audit threshold were approved by Lou on 2026-11-01 ([PR #70](https://github.com/cslou/workprint/pull/70)). This setup documentation does not change that policy.
