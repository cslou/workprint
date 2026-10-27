# Workprint

A chat-first filmmaking workspace: the assistant prepares the work; the creator directs, reviews and chooses.

## Status

The application foundation supplies a minimal React shell and **one native Mastra backend** backed by Postgres. The 19 closed `/v1` application routes are mounted with verified Supabase admission and structured not-implemented responses; `GET /health` remains public. A framework-free typed application client is available, but no frontend wiring, sign-in UI, assistant, conversations or filmmaking behavior is implemented yet. Reference screens are not implemented behavior. Muse is the intended model family, not a qualified integration.

**Private/local development only (B-001):** the pinned generated server parses POST/PUT JSON before application authentication and incoming-body deadlines. Unfinished uploads can stall before admission; client timeouts do not prove server cleanup. The user approved deferring this known-failing ingress qualification for private/local Phase 1–2 development only. Resolve and verify serving **before Phase 3 native-runtime qualification and before public deployment**. See the [tracked exception](docs/specs/implementation-spec-001.md#phase-1--contracts-and-api-foundation) and [qualification record](docs/native-runtime-qualification.md#b-001--deferred-incoming-request-qualification).

## Development

Prerequisites: a working Docker engine, Git/tar for the clean-export smoke, and pnpm **11.28.8** (Corepack can select the version in `package.json`). pnpm downloads the repository-local Node **24.22.1** runtime; no global Node upgrade is needed. Exact dependencies and qualification limits are recorded in [native runtime qualification](docs/native-runtime-qualification.md).

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm db:local
```

Keep that terminal open. No prior `pnpm build` is needed: `db:local` reuses the test fixture's dependency-ordered compilation of contracts, api-client and API helpers before starting storage. The development-only helper creates a uniquely labelled, ephemeral Docker Postgres on a loopback-only ephemeral port, creates separate setup/serving roles, runs the supported native initialization through `pnpm db:prepare`, and grants serving DML access. It writes credentials only to ignored, mode-0600 `outputs/local-database.env`; it refuses to overwrite an existing file. It does not use your Supabase stacks or private `.env`.

In a second terminal:

```sh
SUPABASE_URL=http://127.0.0.1:1 SUPABASE_PUBLISHABLE_KEY=health-only WORKPRINT_ENV_FILE=outputs/local-database.env pnpm dev
```

These health-only examples explicitly configure an unreachable loopback Auth target: health never calls Auth, while protected application calls cannot authenticate against this target. This is not a token-verification bypass or a working sign-in configuration. For actual admission, supply your separately authorized Supabase URL and publishable/anon key instead.

Open `http://127.0.0.1:5173`; the backend health endpoint is `http://127.0.0.1:4111/health`. `PORT` and `WEB_PORT` override those loopback ports. Stop the apps first, then Ctrl-C the database helper: it stops only its owned container and removes its unchanged environment file. **Fixture data is temporary and is lost on stop.** If the file was edited, the helper preserves it and reports that fact. After an uncatchable host/process kill, inspect the exact `workprint-fixture-<UUID>` container and its matching `workprint.fixture` label before stopping that container; never reset another stack or prune Docker resources broadly.

To build and serve the built apps while that database helper remains open:

```sh
pnpm build
SUPABASE_URL=http://127.0.0.1:1 SUPABASE_PUBLISHABLE_KEY=health-only WORKPRINT_ENV_FILE=outputs/local-database.env pnpm start
```

`pnpm start` uses the actual Mastra build output plus Vite preview (a local verification server, not deployment configuration). `pnpm build` needs no database or private environment file. The native production artifact is `apps/api/.mastra/output/`; browser output is `apps/web/dist/`. Setup code is compiled separately into `apps/api/dist/`; test helpers compile only into ignored `.test-build/` and are not part of the native production bundle.

### Privately configured development storage

The isolated fixture is sufficient for this foundation. For separately authorized, dedicated development storage, copy `.env.example` to ignored `.env` and privately supply the exact target and **different restricted serving / setup credentials**. Then run `pnpm db:prepare` before `pnpm dev`. The setup role must own native objects and have database CREATE privilege; serving must not have database/schema CREATE, native schema/object ownership (direct, inherited or reachable through SET ROLE), superuser, role-creation or database-creation privileges. The process rejects privileged serving connections. Reapply narrowly scoped serving grants after supported native upgrades; the local fixture does this automatically.

`db:prepare` calls **`PostgresStore.init()`**, never application-authored native DDL. There are no application-owned tables or migrations yet. When an owning feature introduces them, use the Supabase CLI migration workflow under `supabase/`, excluding native schemas; do not add a custom SQL migration runner. Shared/production targets still require separate authorization.

Auth qualification requires privately supplied dedicated Supabase Auth configuration, two existing authorized synthetic identities, and restricted serving credentials identifying the approved target. Provisioning/accounts remain outside the product and serving process. Do not substitute a trusted-identity bypass or use an arbitrary shared project. R2, media tooling and real model keys are not prerequisites here.

## Configuration and safety

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are required backend configuration. Supply a publishable or legacy anon key; no service-role/admin credential is needed. HTTPS is required except on loopback, and URLs cannot contain credentials, paths, query strings or fragments. The single integration calls `GET /auth/v1/user` with the bearer token and API key, uses only the verified user `id`, and has a 2-second deadline including response body. Missing/malformed/invalid/expired tokens receive HTTP 401 `unauthenticated`; verifier failures receive HTTP 503 `integration_failure`. Caller owner claims never supply identity.
- `DATABASE_URL` is serving-only. `MIGRATION_DATABASE_URL` is setup-only; root development/start commands remove it from the native child environment.
- `DEFAULT_ASSISTANT_MODEL` is required and checked for `provider/model` identifier syntax before startup. URLs, missing values and test-provider prefixes are rejected. No model is resolved or enabled. The **development fixture only** supplies `unqualified/disabled`, an inert identifier, not a real model, provider or assistant response.
- Exact Muse IDs, credential names and real-provider compatibility are not yet qualified. No provider SDK/Agent is configured and no missing provider key is silently substituted. Provider-specific credential validation belongs with the actual integration before enabling calls; identifier syntax is not that qualification.
- Actual credentials belong only in ignored private files/environment, never browser configuration, prompts or logs. Vite receives no backend environment, does not load dotenv files, and restricts development filesystem serving to the web app and installed dependencies—not private research or outputs. There is no public environment contract yet; backend `VITE_*` settings are rejected.
- Root commands force Mastra telemetry disabled, offline tooling and explicit dotenv handling. Interrupted or failed compilation stops the pipeline; no later build/setup stage may launch. No inference, paid work, telemetry exporter, test provider or qualification endpoint is registered in production. A separately built test composition adds a protected identity probe using the same backend admission code; no environment flag enables that probe in the production artifact. Credential presence is not call authorization.
- Expected idle Postgres disconnects are logged with a sanitized SQLSTATE, not credentials or raw error payloads. The native pool discards failed idle clients and can replace them on demand. Docker fixture cleanup is registered before acquisition, verifies the preselected name/owner and exact ID, explicitly removes never-started owned containers, and retains both acquisition and cleanup errors if ownership cannot be established.

## Verification

```sh
pnpm check
WORKPRINT_AUTH_FIXTURE=/absolute/private/auth-fixture.json WORKPRINT_AUTH_SIGNING_FIXTURE=/absolute/private/cli-status.json pnpm test
pnpm test:smoke
WORKPRINT_AUTH_FIXTURE=/absolute/private/auth-fixture.json WORKPRINT_AUTH_SIGNING_FIXTURE=/absolute/private/cli-status.json pnpm test:contracts
WORKPRINT_AUTH_FIXTURE=/absolute/private/auth-fixture.json WORKPRINT_AUTH_SIGNING_FIXTURE=/absolute/private/cli-status.json pnpm test:security
pnpm audit
```

`check` runs strict TypeScript, ESLint and dependency-cruiser, including temporary forbidden-import controls removed in `finally` cleanup. `test` compiles TypeScript and runs all current-acceptance `*.test` cases (including all 13 retained baseline cases); focused commands select the same cases, not duplicate suites. Smoke exports **committed HEAD** with Git (commit source changes before testing that candidate), installs frozen, builds, initializes fresh isolated storage, serves built/development apps within deadlines, verifies real responses and shuts down owned resources. Security checks configuration rejection, privileges, actual Supabase admission, built-HTTP verifier failures/deadlines, excluded routes, secret sentinels and absence of observed non-loopback Node network attempts. The Auth fixture JSON contains `url`, `anonKey` (publishable/legacy anon key), `servingUrl` and two `accounts` with `email`/`password`. The signing fixture is the authorized development CLI status JSON containing `JWT_SECRET`, used only by the harness to construct a signed expired token. Neither private file is copied into builds or inherited by serving. Keep both ignored and mode 0600; never use a hosted/shared project. The harness gets fresh tokens after building, builds probe/production artifacts in owned temporary directories using frozen workspace dependencies, and fails clearly if prerequisites are missing. Smoke uses only explicit health-only loopback configuration and needs no Auth fixture or Supabase service. Missing Docker or other prerequisites fail, not skip. Logs stay in temporary directories named in test output; redirect verbose command output to local log files.

`test:contracts` selects shared-schema/error, unavailable-boundary, built-server application-client matrix and bounded client transport cases from the aggregate suite. The built Auth case is shared with `test:security`, not duplicated. Browser-safe `@workprint/contracts` contains the closed application inventory; `@workprint/api-client` exposes one method per operation key plus local-only unavailable native capabilities. Creative `content` and provider `settings` are domain-owned JSON data, not implemented creative validation or authority. See the [surface catalog](docs/api-surface.md) for exact DTO choices and later owners. The contracts package reuses the already pinned Zod version; no new third-party version is introduced.

### Deferred ingress qualification — known NON-PASS

```sh
WORKPRINT_AUTH_FIXTURE=/absolute/private/auth-fixture.json WORKPRINT_AUTH_SIGNING_FIXTURE=/absolute/private/cli-status.json pnpm qualify:ingress
```

This explicit command reuses the built Auth fixture and asserts that unfinished unauthenticated uploads receive authentication rejection and authenticated uploads receive bounded `invalid_input`. It currently **fails** its independent five-second watchdogs. `ingress.qualification.ts` is intentionally outside default `*.test` discovery under the approved B-001 exception, not skipped, mocked or counted as a pass. Its nonzero status is reported separately from current-scope regression results; all 13 accepted cases remain in `pnpm test`. Completed oversized JSON still receives application `invalid_input`, but this does not qualify pre-native-parse limits. The client deadline/cancellation tests prove only client-observed settlement.

No inherited application tests or behavior existed; application baseline regression is N/A. These checks become regression coverage for later stories. The Auth case proves distinct verified identities, not conversation/resource ownership. No live AI calls, conversation/recovery qualification, deployed-capacity or product-visual acceptance is claimed.

## Documentation

- [Implementation spec](docs/specs/implementation-spec-001.md) and [Sprint 001](docs/sprints/sprint-001.md) — approved scope and story sequencing; planning is not completion evidence.
- [API surface catalog](docs/api-surface.md) — mounted application schemas/client, unavailable outcomes, intended callers and later functional/qualification owners; transport is not filmmaking behavior.
- [Native runtime qualification](docs/native-runtime-qualification.md) — exact dependency purposes, interfaces, privileges and observed foundation verification.
- [Architecture background](docs/architecture.md) — intended direction; current approved scope takes precedence.
- [Product strategy litepaper](docs/litepaper.md) — longer-term vision and unvalidated hypotheses.
- [Production terminology](CONTEXT.md) — canonical distinctions for planning and review.
- [Brand book](docs/design/brand-book.html) and [design guide](docs/design/design.md) — visual references, not application code or approval of unseen states.

Specs and plans are versioned here. Private research remains gitignored; obtain required source material from the maintainer before dependent adaptation.
