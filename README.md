# Workprint

A chat-first filmmaking workspace: the assistant prepares the work; the creator directs, reviews and chooses.

## Status

A minimal React shell and **one native Mastra backend** provide authenticated, Postgres-backed conversation transport. Native history, streaming, queue, reconnect and exact-run Stop are qualified with a test-only controlled model. The ordinary application intentionally returns an explicit unavailable error for assistant inference: no live Muse integration, filmmaking features or approved product UI is delivered.

## Local development

Prerequisites: Docker, Supabase CLI **2.84.2**, pnpm **11.28.8**, and Git/tar for smoke verification. pnpm downloads repository-local Node **24.22.1**; do not globally upgrade tools for this repository.

```sh
pnpm install --frozen-lockfile
pnpm local:prepare
WORKPRINT_ENV_FILE=outputs/local-supabase.env pnpm dev
```

`local:prepare` starts only the recorded `workprint-sprint001` Supabase CLI project, using API/DB/shadow ports 55431/55432/55435. It refuses an existing unrecorded project and checks those ports before initial acquisition. It never stops/resets other projects or provisions hosted services. It creates two synthetic **local** test accounts outside the application, separate setup/serving roles, and native stores through `pnpm db:prepare` / `PostgresStore.init()`. Repeat setup reuses private credentials; changed private config is preserved and rejected, not overwritten or rotated. Email/password login is enabled; public signup is disabled.

Actual endpoints, keys, passwords and connection strings stay in ignored mode-0600 `outputs/local-supabase.setup.json` and `outputs/local-supabase.env`. The owner record is also ignored. Never print these files or raw CLI start/status output; the helper captures credentials in memory and emits only redacted progress. CLI `.temp/` and `.branches/` state is ignored. Do not commit, screenshot or upload private files/logs. No R2/media/provider credentials are needed.

The web shell defaults to `http://127.0.0.1:5173`, native health to `http://127.0.0.1:4111/health`; `WEB_PORT` / `PORT` override them. Stop the app with Ctrl-C. **The development Supabase stack and its records remain preserved** independently of application/test processes. To stop only this recorded local project, from this repository use `supabase stop --project-id workprint-sprint001`; retain default backups and private config for the next setup. Never use all-project stop/reset/prune commands. A failed setup leaves an ownership record for targeted diagnosis, not permission to adopt or delete unknown resources.

```sh
pnpm build
WORKPRINT_ENV_FILE=outputs/local-supabase.env pnpm start
```

Build requires no private config/database and initiates no inference. Start uses actual `.mastra/output` plus Vite preview, not deployment infrastructure. Native production output is `apps/api/.mastra/output/`; browser output is `apps/web/dist/`. Test providers/barriers and local account setup are outside the production composition.

### Isolated test storage is different

Automated persistence uses a new UUID-labelled, ephemeral Docker Postgres fixture for each scenario, **not everyday Supabase conversation records**. Real tokens are issued/verified by the Workprint-local Supabase Auth service; no trusted-identity bypass is injected. Fixtures bind loopback/ephemeral ports and clean only recorded IDs after owner-label verification. Never-started owned containers are explicitly removed; wrong owners are preserved and failures remain visible.

The foundation-only `pnpm db:local` helper remains available without Auth. It keeps its temporary database alive in the foreground, writes ignored `outputs/local-database.env`, and removes its unchanged file/container on Ctrl-C. Its data is lost on stop; it is not the preserved development stack. Clean-export smoke exercises this credential-free foundation mode. Without configured Supabase, only native health is exposed.

## Configuration and safety

- `DATABASE_URL` is restricted serving; `MIGRATION_DATABASE_URL` is setup-only and is removed from the native child environment. Serving rejects CREATE/elevated role privileges and always uses `disableInit: true`.
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` enable actual token verification. Only the verified user ID maps to native resource ownership. Browser resource claims must match that identity; headers/execution/model overrides cannot grant authority.
- `DEFAULT_ASSISTANT_MODEL` is structurally validated before startup. The local fixture's inert `unqualified/disabled` identifier is never resolved. Exact Muse IDs/credential names/live compatibility remain unqualified; no production provider or fallback is registered.
- Only intended memory/native send/queue/subscribe/abort routes are admitted. Tool execution, framework administration, model changes and qualification routes are closed. Errors are sanitized; native SDK types/protocol are reused by `packages/api-client`.
- Vite receives no backend environment, does not read dotenv files and serves only browser/dependency directories—not research, outputs or private credentials.
- Tooling disables Mastra telemetry and enables offline/explicit-dotenv handling. Credentials never authorize paid calls. Cancelled/failed compilation cannot launch later stages.
- Native schemas are initialized only through supported APIs. There are no application-owned tables yet; future owner schema changes use Supabase CLI migrations under `supabase/`, not a custom runner or edits to native SQL.

## Verification

After local setup:

```sh
pnpm check
pnpm test
pnpm test:native
pnpm test:security
pnpm test:smoke
pnpm audit
```

The aggregate compiles/runs all implemented `node:test` cases, including native tests and smoke. Focused commands select the same cases; the Auth/ownership case is shared by native/security views and counted once. Expiry verification waits for a previously valid, unchanged local token to expire naturally (local lifetime 60s), rather than using a bad signature. Missing setup/Docker fails clearly, not skips. Run verbose commands into local files; tests print redacted evidence paths and shapes, never credentials.

Smoke exports **committed HEAD**, installs frozen, builds, prepares isolated storage and serves actual built/dev responses within deadlines. Commit candidate source before testing that export. Static checks include strict TypeScript, lint, dependency-cruiser and 12 temporary forbidden-import controls removed after checking. The seven Story 1 cases are retained. Current native capabilities, response shapes, dependency purposes, limits and verification history are in [native qualification](docs/native-runtime-qualification.md). No workflow/process-recovery, live model, deployment, capacity or product-visual acceptance follows from these checks.

## Documentation

- [Implementation spec](docs/specs/implementation-spec-001.md) and [Sprint 001](docs/sprints/sprint-001.md) — approved scope, not self-issued acceptance.
- [Native qualification](docs/native-runtime-qualification.md) — executable evidence and honest limits.
- [Architecture background](docs/architecture.md), [litepaper](docs/litepaper.md) and [terminology](CONTEXT.md).
- [Brand book](docs/design/brand-book.html) and [design guide](docs/design/design.md) — references, not implemented/approved product states.

Private research remains gitignored; obtain required source material before dependent adaptation.
