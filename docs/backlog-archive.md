# Backlog Archive

Convention: `docs/conventions/backlog-management.md` (selected harness root; AGENTS.md §12)

### B-005 — Retire test pages
- Problem: The default Vite dev server served `apps/web/test/*.html` mounts and fixtures (development and loopback only; production builds excluded them).
- Outcome: No test pages remain, so no dev server serves them.
- Work: [PR #66](https://github.com/cslou/workprint/pull/66) "Phase-3 test clean-up and e2e journeys" deleted the pages; PR #68 moved the remaining unit tests into `apps/web/test/unit/`.
- Closed: 2026-11-01
- Resolution: Done
- Evidence: On `phase-3` at `c83bacf`, `apps/web/test/` holds only `unit/`, and the only web HTML entry is `apps/web/index.html`.

### B-002 — Clear the inherited deepmerge audit advisory
- Context: `pnpm audit` reported GHSA-gcqx-w48m-w2h4 (low) on `deepmerge` 4.3.1. It was reached only through the Mastra CLI build tooling: `mastra` → `@mastra/deployer` → `@rollup/plugin-node-resolve`.
- Outcome: `pnpm audit` no longer reports the advisory, through a durable dependency change.
- Work: Sprint 004 Story 1a, [PR #34](https://github.com/cslou/workprint/pull/34). The app-owned Hono entry removed the `mastra` CLI and with it the only `deepmerge` path. Integrated into `phase-3` by PR #58.
- Closed: 2026-11-01
- Resolution: Done
- Evidence: `deepmerge` is absent from `pnpm-lock.yaml` at `eb98e49`. The Sprint 005 Final Review audit lists only B-004 and B-008 and records that B-002 "is no longer reported".

### B-001 — Bound incoming requests before native body parsing
- Context: Mastra's generated server read POST/PUT JSON bodies before authentication and request deadlines, so an unfinished upload could hold resources before Auth. That is pre-authentication resource exposure, not data access.
- Outcome: Bounded body size and time, with early authentication rejection, through the real serving path.
- Work: Lou approved the app-owned `@mastra/hono` entry on 2026-10-29. Sprint 004 Story 1a ([PR #34](https://github.com/cslou/workprint/pull/34)) moved the server onto it, and Story 1b ([PR #35](https://github.com/cslou/workprint/pull/35), "Bound ingress before native parsing") added the pre-Mastra route catalog, Auth and bounded intake (`apps/api/src/mastra/ingress.ts`, `body.ts`). Integrated into `phase-3` by PR #58.
- Closed: 2026-11-01
- Resolution: Done
- Evidence: PR #35 merged after review on `sprint-004`, and the sprint integrated into `phase-3`. Later, the MVP test trim removed the standalone `qualify:ingress` run from the default checks (Lou's direction, recorded in `docs/sprints/sprint-004.md`). Re-qualify before any public deployment.
