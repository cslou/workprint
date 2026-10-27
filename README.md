# Workprint

A chat-first filmmaking workspace: the assistant prepares the work; the creator directs, reviews and chooses.

## Status

The application foundation supplies a minimal React shell and **one native Mastra backend** backed by Postgres. Only the native `GET /health` endpoint is exposed; assistant, Auth, conversations and filmmaking features are not available yet. Reference screens are not implemented behavior. Muse is the intended model family, not a qualified integration.

## Development

Prerequisites: a working Docker engine, Git/tar for the clean-export smoke, and pnpm **11.28.8** (Corepack can select the version in `package.json`). pnpm downloads the repository-local Node **24.22.1** runtime; no global Node upgrade is needed. Exact dependencies and qualification limits are recorded in [native runtime qualification](docs/native-runtime-qualification.md).

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm db:local
```

Keep that terminal open. The development-only helper creates a uniquely labelled, ephemeral Docker Postgres on a loopback-only ephemeral port, creates separate setup/serving roles, runs the supported native initialization through `pnpm db:prepare`, and grants serving DML access. It writes credentials only to ignored, mode-0600 `outputs/local-database.env`; it refuses to overwrite an existing file. It does not use your Supabase stacks or private `.env`.

In a second terminal:

```sh
WORKPRINT_ENV_FILE=outputs/local-database.env pnpm dev
```

Open `http://127.0.0.1:5173`; the backend health endpoint is `http://127.0.0.1:4111/health`. `PORT` and `WEB_PORT` override those loopback ports. Stop the apps first, then Ctrl-C the database helper: it stops only its owned container and removes its unchanged environment file. **Fixture data is temporary and is lost on stop.** If the file was edited, the helper preserves it and reports that fact. After an uncatchable host/process kill, inspect the exact `workprint-fixture-<UUID>` container and its matching `workprint.fixture` label before stopping that container; never reset another stack or prune Docker resources broadly.

To build and serve the built apps while that database helper remains open:

```sh
pnpm build
WORKPRINT_ENV_FILE=outputs/local-database.env pnpm start
```

`pnpm start` uses the actual Mastra build output plus Vite preview (a local verification server, not deployment configuration). `pnpm build` needs no database or private environment file. The native production artifact is `apps/api/.mastra/output/`; browser output is `apps/web/dist/`. Setup code is compiled separately into `apps/api/dist/`; test helpers compile only into ignored `.test-build/` and are not part of the native production bundle.

### Privately configured development storage

The isolated fixture is sufficient for this foundation. For separately authorized, dedicated development storage, copy `.env.example` to ignored `.env` and privately supply the exact target and **different restricted serving / setup credentials**. Then run `pnpm db:prepare` before `pnpm dev`. The setup role must own native objects and have database CREATE privilege; serving must not have database/schema CREATE, object ownership, superuser, role-creation or database-creation privileges. The process rejects privileged serving connections. Reapply narrowly scoped serving grants after supported native upgrades; the local fixture does this automatically.

`db:prepare` calls **`PostgresStore.init()`**, never application-authored native DDL. There are no application-owned tables or migrations yet. When an owning feature introduces them, use the Supabase CLI migration workflow under `supabase/`, excluding native schemas; do not add a custom SQL migration runner. Shared/production targets still require separate authorization.

Story 2 requires privately supplied dedicated Supabase Auth configuration, two existing authorized test identities, and setup/serving connections identifying the approved target. Do not provision accounts, substitute a trusted-identity bypass, or use an arbitrary shared project. R2, media tooling and real model keys are not prerequisites here.

## Configuration and safety

- `DATABASE_URL` is serving-only. `MIGRATION_DATABASE_URL` is setup-only; root development/start commands remove it from the native child environment.
- `DEFAULT_ASSISTANT_MODEL` is required and checked for `provider/model` identifier syntax before startup. URLs, missing values and test-provider prefixes are rejected. No model is resolved or enabled. The **development fixture only** supplies `unqualified/disabled`, an inert identifier, not a real model, provider or assistant response.
- Exact Muse IDs, credential names and real-provider compatibility are not yet qualified. No provider SDK/Agent is configured and no missing provider key is silently substituted. Provider-specific credential validation belongs with the actual integration before enabling calls; identifier syntax is not that qualification.
- Actual credentials belong only in ignored private files/environment, never browser configuration, prompts or logs. Vite receives no backend environment, does not load dotenv files, and restricts development filesystem serving to the web app and installed dependencies—not private research or outputs. There is no public environment contract yet; backend `VITE_*` settings are rejected.
- Root commands force Mastra telemetry disabled, offline tooling and explicit dotenv handling. Interrupted or failed compilation stops the pipeline; no later build/setup stage may launch. No inference, paid work, telemetry exporter, test provider or qualification endpoint is registered. Credential presence is not call authorization.
- Expected idle Postgres disconnects are logged with a sanitized SQLSTATE, not credentials or raw error payloads. The native pool discards failed idle clients and can replace them on demand. Docker fixture cleanup is registered before acquisition, verifies the preselected name/owner and exact ID, and retains both acquisition and cleanup errors if ownership cannot be established.

## Verification

```sh
pnpm check
pnpm test
pnpm test:smoke
pnpm test:security
pnpm audit
```

`check` runs strict TypeScript, ESLint and dependency-cruiser, including temporary forbidden-import controls removed in `finally` cleanup. `test` compiles TypeScript and runs all implemented `node:test` cases; focused commands select the same cases, not duplicate suites. Smoke exports **committed HEAD** with Git (commit source changes before testing that candidate), installs frozen, builds, initializes fresh isolated storage, serves built/development apps within deadlines, verifies real responses and shuts down owned resources. Security checks configuration rejection, privileges, excluded routes, secret sentinels and absence of observed non-loopback Node network attempts. Missing Docker or other prerequisites fail, not skip. Logs stay in temporary directories named in test output; redirect verbose command output to local log files.

No inherited application tests or behavior existed; application baseline regression is N/A. These checks become regression coverage for later stories. No live AI calls, Auth/account isolation, conversation/recovery qualification, deployed-capacity or product-visual acceptance is claimed.

## Documentation

- [Implementation spec](docs/specs/implementation-spec-001.md) and [Sprint 001](docs/sprints/sprint-001.md) — approved scope and story sequencing; planning is not completion evidence.
- [Native runtime qualification](docs/native-runtime-qualification.md) — exact dependency purposes, interfaces, privileges and observed foundation verification.
- [Architecture background](docs/architecture.md) — intended direction; current approved scope takes precedence.
- [Product strategy litepaper](docs/litepaper.md) — longer-term vision and unvalidated hypotheses.
- [Production terminology](CONTEXT.md) — canonical distinctions for planning and review.
- [Brand book](docs/design/brand-book.html) and [design guide](docs/design/design.md) — visual references, not application code or approval of unseen states.

Specs and plans are versioned here. Private research remains gitignored; obtain required source material from the maintainer before dependent adaptation.
