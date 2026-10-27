# Native runtime qualification — foundation and admission

## Scope and evidence identity

The historical sections below record **Story 1 / P1-S1 foundation evidence**. The Story 2 section records backend Auth admission and exposure observations. Neither qualifies conversations, history, streaming, Stop, independent workflows, process recovery or a live Muse integration. One exported `Mastra` instance owns the backend; no Agent, provider, workflow, telemetry exporter or alternative server/store/runner is registered. The browser is a minimal React shell, not an approved product design.

The core implementation checks below were reproduced at **`4c5c75208eb8bed0d4280f6008e82638464e8e19`** on 2026-10-27; the ambient-target smoke extension passed at **`a08da9ae4ad8000624f67c9b95c484e04c5c1465`**. The story PR records the subsequent documentation-inclusive head and its fresh checks. These are implementer observations; independent review and orchestrator acceptance remain separate.

## Exact cohort and dependency purposes

All direct versions are exact; `pnpm-lock.yaml` pins the transitive graph and runtime download. pnpm selects repository-local Node through `devEngines.runtime`, not a global runtime upgrade.

| Dependency | Exact version | Why it exists |
| --- | --- | --- |
| Node | 24.22.1 | Pinned application/tool/test runtime; built-in `node:test`, fetch, process and filesystem APIs avoid a separate test framework |
| pnpm | 11.28.8 | Workspace/frozen installation and local runtime management |
| TypeScript | 6.0.3 | Strict browser/backend/setup/test compilation |
| React / react-dom | 19.3.1 / 19.3.1 | Minimal actual browser mount; no feature UI or component framework |
| Vite | 8.3.5 | Browser TypeScript/JSX build, development and local built-output preview; no React plugin is needed for this shell |
| `@mastra/core` | 1.79.0 | Single native backend composition and supported storage interfaces |
| `mastra` | 1.35.0 | Native build/development server generation; the built native entry starts directly with Node |
| `@mastra/pg` | 1.32.0 | Supported native Postgres storage/initialization, not application-authored native SQL |
| `pg` | 8.23.1 | Bounded native pool, privilege checks and isolated fixture role/database setup |
| `zod` | 4.6.7 | Explicit native/CLI schema peer: clean-export dev startup demonstrated that relying on a transitive installation fails |
| ESLint / `@eslint/js` | 10.13.0 / 10.0.1 | Executable JavaScript/TypeScript lint and recommended base rules |
| `typescript-eslint` | 8.72.1 | TypeScript-aware lint compatible with this TypeScript/ESLint cohort |
| dependency-cruiser | 18.7.0 | Resolved-import architecture checks and forbidden-import controls |
| `@types/node` / `@types/pg` | 24.19.2 / 8.23.1 | Typed runtime/database interfaces |
| `@types/react` / `@types/react-dom` | 19.3.0 / 19.3.0 | Typed browser mount/JSX |

Dependency lifecycle builds are not enabled; esbuild's install script is explicitly denied and its platform binary worked in frozen clean-export builds. The selected TypeScript-ESLint 8.72.1 packages have narrow exact-version release-age exceptions, not a globally disabled age policy. Installation reported no peer incompatibilities. `pnpm audit --json` returned **zero info/low/moderate/high/critical findings**, with no advisory suppression (569 total dependencies reported). This is an observed package audit, not a claim that dependencies are vulnerability-free indefinitely; rerun on the delivered head and future updates.

The Docker fixture pins Postgres **17.11** by immutable image digest:

```text
postgres@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b
```

Qualification ran locally on macOS/arm64 with Docker client/engine 28.1.1, not a deployed or shared Supabase database. No new CI, deployment, R2, media, provider SDK or account provisioning integration is included.

## Native interfaces, storage and privileges

- `apps/api/src/mastra/index.ts` exports the single `Mastra` instance. `mastra build` generates the actual native server; `pnpm start` runs `apps/api/.mastra/output/index.mjs`. Development uses `mastra dev`, not a second custom HTTP server.
- `PostgresStore({ schemaName: 'mastra', pool, disableInit: true })` is the serving adapter. The native health response observed over HTTP is `200 { "success": true }`. A native `getStore('memory')` / `listThreads({ page: 0, perPage: 10 })` read using the restricted serving connection returns the real empty store; it is not conversation history qualification.
- `pnpm db:prepare` compiles/runs the separate setup entry, checks database CREATE privilege, constructs `PostgresStore` and awaits **`store.init()`**, then `store.close()`. Supported initialization succeeded twice. No native table creation, alteration, migration or version stamping is authored by the application.
- Application-owned tables do not exist yet. Their eventual owners must use **Supabase CLI migrations under `supabase/`**, excluding native schemas. There is no custom application migration runner or empty schema inventory.
- The isolated fixture creates a new `workprint` database owned by `wp_setup`, plus a distinct `wp_serving` login. Passwords are generated per fixture. Setup owns native objects. Serving receives CONNECT, native schema USAGE, table SELECT/INSERT/UPDATE/DELETE and existing sequence USAGE/SELECT, not ownership or CREATE. The fixture performs privilege grants only after native initialization; it does not edit native schema definitions.
- Observed serving permissions: database CREATE=false; `mastra` schema CREATE=false; `public` schema CREATE=false; superuser/CREATEROLE/CREATEDB=false. All observed native table owners were `wp_setup`. Serving `db:prepare` fails both before and after privileged setup. Native serving startup also rejects the setup connection.
- Important native observation: after stores were already initialized, calling the native initializer with serving credentials could return success as a no-op. The setup command therefore has an explicit privilege precondition; native no-op behavior is not evidence that serving may perform DDL. Normal serving always uses `disableInit: true`.
- The caller-owned pool registers its idle-client error listener before the startup query. It logs only a bounded SQLSTATE (or `connection_error`), not raw exceptions/connection data. Real idle termination and native-read recovery are covered by the review-correction checks below.
- Connection mode is direct Postgres TCP with one supplied `pg.Pool`: serving max=4, connection acquisition timeout=5s, idle timeout=5s, statement timeout=10s. Setup uses max=1, acquisition=5s and statement timeout=30s. These are local safety bounds, not throughput/capacity or Supabase transaction-pooler qualification. TLS/remote connection mode must be qualified against the separately authorized target.

## Configuration, exposure and no-call boundary

`DATABASE_URL` must be a credentialed Postgres URL; `DEFAULT_ASSISTANT_MODEL` must be a nonempty `provider/model` identifier, not an endpoint URL or a `test`/`mock`/`fake` provider prefix. Port parsing is strict and bounded to 1–65535. The loader rejects setup credentials entering the native serving environment and rejects backend `VITE_*` configuration. Root start/dev commands strip `MIGRATION_DATABASE_URL` from the native child.

**No exact Muse ID or provider credential variable is qualified here.** The required default-model check is structural admission only, not real-model/key validation. No provider is constructed, so there is no call path on missing credentials and no invented assistant response. The development/test fixture's `unqualified/disabled` identifier is inert and never resolved; it is not a production test provider, fallback model or evidence of compatibility. Real provider-specific required-key validation and selected-model qualification must precede enabling that integration.

Root tooling forces `MASTRA_TELEMETRY_DISABLED=1`, `MASTRA_OFFLINE=1` and `MASTRA_SKIP_DOTENV=1`. Builds do not load the private root environment file or require a database. Vite receives a minimal tooling environment, not backend secrets, and has dotenv loading disabled. Its explicit strict filesystem allowlist includes only the browser app and the real installed dependency directory; the workspace root, private research and outputs are not allowed. The safe example intentionally leaves real connection/model values blank. No R2/media key is required.

The native middleware permits only GET health; security verification observed 404 for GET `/__qualification`, POST `/__qualification/release`, GET `/api/agents`, GET `/api/workflows`, POST `/api/tools/test/execute`, GET `/swagger-ui`, GET `/openapi.json` and POST `/health`. Production source imports of test fixtures are forbidden by the resolved dependency graph. Supplied test-provider/barrier environment flags did not register a provider or expose a control. Story 2 must qualify the intended authenticated native surface before opening it.

A harmless `SUPABASE_SECRET_KEY` sentinel and an Authorization-header sentinel were absent from built browser assets, captured command/server logs, configuration failures and returned errors. Each process harness first proves its network tripwire rejects a deliberate non-loopback fetch, clears that control observation, then requires **zero non-loopback Node TCP/fetch attempts** during build/setup/startup/dev/security work. Dependency installation is separately allowed network access. The instrumentation is test-only and not an OS sandbox or a proof about arbitrary native binaries; combined with no registered inference/provider path, it bounds the observed no-automatic-call claim. No live AI request, paid operation or telemetry upload was authorized or made.

## Reproducible fixtures and concrete bounds

`pnpm db:local` hosts the same test-owned Postgres fixture used by qualification. It binds only loopback on an ephemeral port, labels a UUID-named container, keeps data on ephemeral tmpfs and checks its exact container ID/owner label before stopping it. It does not inspect/reset another database's contents or broadly prune Docker resources. It writes an ignored mode-0600 environment file with create-exclusive semantics and removes it only if its contents still match. A closed stdin does not terminate the fixture before signal-driven cleanup. The helper explicitly supplies its owned setup URL to the preparation child, overriding any ambient `MIGRATION_DATABASE_URL`; the clean-export smoke supplies an unreachable non-owned local URL as a negative control.

Tests allocate temporary tracked Git exports and logs. Their app subprocess/process-group IDs are recorded from creation and only those groups are signalled: TERM, then bounded KILL escalation (tool supervisor 5s; outer test harness 7s). Database startup and each HTTP startup have 30s deadlines; HTTP readiness attempts have 1s request timeouts. Fixture Docker commands have 30s limits (container creation 60s), container stop requests a 5s shutdown and cleanup then observes exact-ID auto-removal for up to 10s. Name/owner cleanup is installed before acquisition so a lost CLI response can be recovered without stdout. A verified `created` (never-started) container is explicitly removed by exact ID with its owned volumes, because stop alone cannot trigger auto-removal. Expected disappearance or removal-in-progress races are confirmed through inspection and bounded removal observation; other command/inspection failures remain errors. Unexpected acquisition plus cleanup failures are retained together in an `AggregateError`. Process lifetimes/commands default to 120s; the security case is bounded to 240s, smoke to 300s. Uncatchable host/process kills can leave fixture resources; follow the exact-identity recovery instructions in README rather than deleting unknown resources.

The smoke confirms actual backend health, actual browser HTML/JS responses, closed application listeners after both built/dev shutdowns, removal of the unchanged fixture environment file and an unchanged frozen lockfile. It uses no untracked application source or supplied private credentials. Temporary logs/exports are retained outside source for diagnosis, not committed.

## Initial verification inventory and observed results

There were no pre-existing application tests/behavior: **baseline application regression N/A**. No local Pi skill tests were imported or counted. All new behavior below becomes regression coverage; focused commands select the same cases as the aggregate command.

| Command / group | Concrete persistent cases / outcome |
| --- | --- |
| `pnpm test:security` — V2/V3 foundation | **2 `node:test` cases**: `missing or malformed configuration fails without echoing values`; `built backend rejects unsafe config, separates setup privileges and excludes controls/secrets`. Both passed, using real isolated Postgres and the actual built backend. |
| `pnpm test:smoke` — V1 | **1 `node:test` case**: `clean tracked export installs frozen, prepares, builds and serves built/development apps without provider activity`. Passed on committed HEAD; no hidden source/private files, changed lockfile or observed outbound runtime attempt. |
| `pnpm test` | **3 total cases, 3 passed, 0 failed/skipped/cancelled**; includes the complete clean-export smoke, not just the focused security cases. |
| `pnpm check` — V10 | Strict compilation, ESLint and resolved dependency graph passed. **12 temporary import-control scenarios** each failed with a nonzero exit and the intended rule name, then were removed. These are static controls, not extra product-test cases. |
| `pnpm install --frozen-lockfile`, `pnpm build` | Both passed; no lockfile delta. Build needs no private configuration or live storage/provider. |
| `pnpm audit --json` | Passed; zero findings at every reported severity; no unresolved/suppressed advisory. |

The 12 boundary controls cover application → agent, agent/Mastra, backend/Mastra and bootstrap; mechanics → application; cross-owner private db imports; peer domain imports; browser → backend; package → app; production → fixture; browser → Node; and cycles. The maintained rules also restrict shared browser-safe packages and native-framework imports. No temporary future-owner folders remain.

At the implementation revision above, frozen install/build/check/all-tests logs were `/tmp/workprint-s1-logs/26-frozen.log`, `27-build.log`, `28-check.log`, `29-all.log`; aggregate output reported the security fixture `workprint-foundation-cAuzBF` and clean export `workprint-foundation-W1aZgn` in the OS temporary directory. Logs contain synthetic fixture material only and are not publication artifacts. Current documentation-inclusive revision evidence belongs in the PR.

### Red → green chronology

1. The supplied baseline `pnpm test` failed because the repository had no application manifest; this establishes the empty baseline, not a failed product regression.
2. Configuration tests were introduced before their implementation; compilation failed for the missing configuration module (`02-config-red.log`). The implemented loader and real-process rejection checks subsequently passed.
3. The first real-Postgres security run failed its assumption that serving native init must fail even after setup (`05-security.log`). The explicit setup-privilege precondition fixed that boundary; repeated privileged init and restricted serving read now pass, while serving-role preparation and privileged-role serving startup are rejected as intended.
4. Static positive controls exposed dependency-cruiser's JSON reporter returning zero despite recorded violations. Controls now use its text reporter, requiring both a nonzero exit and the intended named error. All 12 controls pass, with no retained forbidden imports.
5. The pre-commit tracked-export smoke correctly failed without a committed lockfile (`13-smoke-red.log`). The first committed smoke (`20-smoke.log`, revision `03949d47a7c6b7f51c1f10e9654ad08747b3963e`) then caught a genuine clean-dev failure: missing direct Zod peer, plus a fixture lifetime defect with closed stdin. Its one leftover fixture container was identified by exact ID/UUID label and stopped, without touching other stacks. Commit `4c5c75208eb8bed0d4280f6008e82638464e8e19` adds the explicit peer and signal-owned fixture keepalive; `24-smoke.log` and aggregate `29-all.log` passed with successful teardown and no remaining labelled fixture containers observed.

6. Final setup inspection found that ambient environment precedence could redirect fixture setup. The added unreachable-local-target control failed against the prior implementation (`30-target-red.log`), with owned fixture teardown still completing. Explicitly passing the fixture-owned setup URL fixed it; the same clean-export smoke passed at `a08da9ae4ad8000624f67c9b95c484e04c5c1465` (`32-target-green.log`).

## Initial review corrections and added regression coverage

The first independent review at `1de9c102029929d71ac1e07296bc6117ac87b7c4` found one P1 and three P2s. All four were assigned for correction; none was dismissed. The following are implementer fixes/evidence, not a self-issued review verdict. The PR records the new committed revision, complete reruns and the pending independent re-review.

| Finding | Correction and observable regression proof |
| --- | --- |
| P1 — cancelled compilation could launch later stages | The task runner refuses all new spawns after stopping and rejects a cancelled stage even when its child exits zero. Signal exits remain unsuccessful. One process case uses a framed TCP readiness/cancellation handshake over both build/setup pipelines: cancelled compiler exit 0, cancelled exit 7 and ordinary failure exit 7 (six scenarios). No later native build, browser build or setup stage may launch. |
| P2 — workspace-wide Vite filesystem exposure | Strict allowlist covers only browser code and actual installed dependencies. One actual-Vite HTTP case proves transformed browser/React modules work while canonical real-path `/@fs/` requests for synthetic private research and fixture-env files return 403 without the sentinel in responses/logs. Only synthetic files are created in an isolated test workspace. |
| P2 — unhandled caller-owned pool idle error | A separate process imports the actual production composition and accesses its supported native store/pool. The fixture terminates only its identified idle serving PID. The process survives, logs SQLSTATE `57P01` without secrets, performs a native empty-store read and observes a replacement backend PID. No production test hook or recovery endpoint is added. |
| P2 — Docker acquisition could leak before stdout | Cleanup is registered by unique name/owner before `docker run`, resolves and verifies the exact ID, and stops only that identity. One real-Docker case injects CLI failure after actual creation but before stdout. It verifies removal for the correct owner and no stop for a wrong owner; both the primary error and ownership-refusal cleanup error remain visible. Test-only fallback cleanup verifies its own recorded ID/label. |

Red observations were captured before these fixes under `/tmp/workprint-s1-review-fix/`: `06-cancel-red.log` (cancelled build returned success), `10-vite-red.log` (private synthetic file returned 200), `08-idle-red.log` (real idle termination crashed the production-composition process), and `04-docker-red.log` (created container remained after acquisition failure). The Docker red control's leftover was cleaned only by its recorded test ID/owner. An early Vite fixture attempt used the macOS `/var` alias and was not valid red evidence; the retained HTTP case resolves canonical paths, reproducing the exposure before the fix.

The four added cases passed together in `15-corrections-green.log`. The expanded working-tree aggregate then passed **7/7 cases** in `18-all.log`; post-commit full checks and the new-head frozen-export smoke are recorded separately in the PR. Current discovery is **5 security cases + 1 process integration case + 1 clean-export smoke**. Focused security selects those same five; smoke selects the same one. The initial three-case inventory above is retained as historical evidence, not the current total. No dependencies were added or upgraded for these corrections. Cancellation and idle/disconnect tests are boundary regressions, not broader native workflow/Stop qualification.

## Acquisition cleanup follow-up

The first re-review at `1e4572abca951cd1a5b3996b486839f7b5aa691c` identified one residual P2 in the same acquisition boundary: Docker can create the owned container without starting it before the CLI fails. A never-started container remains in `created` state, so `docker stop` does not trigger `--rm`. The extended existing regression reproduced the 10s removal deadline failure before the fix (`/tmp/workprint-s1-cleanup-fix/02-created-red.log`); test-owned fallback cleanup verified its recorded ID/label and explicitly removed it.

Cleanup now distinguishes that inspected state and explicitly removes only the verified exact ID. It tolerates only confirmed absence or an inspected removal-in-progress race, retaining unexpected cleanup errors and both command/inspection errors if status cannot be established. The existing real-Docker regression now covers five scenarios: never-started owned/wrong-owner, running owned/wrong-owner, and a never-started owned container removed concurrently just before the CLI removal. It checks actual Docker state, retained primary errors, absence of false cleanup failures, removal of owned resources and preservation of mismatched owners. No new test case or dependency was added: aggregate discovery remains seven cases. The expanded case passed in `04-created-green.log`; committed-head full checks and evidence are recorded in the PR. This is a narrow additional additive review-correction commit, explicitly authorized to preserve published history rather than leave unsafe cleanup to satisfy the original five-commit size target.

## Remaining qualifications and editorial verification

README commands were compared with the actual frozen-export build, supported setup API, generated paths, ports, role grants and observed shutdowns. The example contains no real credentials or unverified live-model defaults. Documentation-only functional/regression testing is N/A; these are editorial consistency checks, not prose-presence tests.

The historical foundation did not qualify Auth. Story 2 admission evidence follows; no mock trusted identity replaces its actual Supabase prerequisite. Conversation ownership, native conversation transport/error handling, history/queue/Stop, native workflows/recovery, remote/pooler/TLS behavior and live-model compatibility remain **unrun and unclaimed**, not passed by these checks. No deployment, inference, media, visual/accessibility or capacity acceptance follows from these results.

## Story 2 — backend admission and route security

One environment-neutral integration (`src/mastra/auth.ts`) calls configured Supabase **`GET /auth/v1/user`**, with `apikey` and `Authorization: Bearer …` headers. A real request to the separately authorized Workprint development stack observed a JSON user object with string `id`, `aud`, `role`, `email`, timestamps, `app_metadata`, `user_metadata` and `identities`. Admission uses only the verified UUID `id`, never decoded claims, owner headers, query strings or user metadata. Standard password token acquisition outside the product returned `access_token`, `token_type`, `expires_in`, `expires_at`, `refresh_token`, `user` and `weak_password`; tokens are acquired after builds, never stored in source or printed. This is backend identity proof, not sign-in UI/session or conversation ownership qualification.

Required serving configuration is `SUPABASE_URL` plus `SUPABASE_PUBLISHABLE_KEY` (publishable or legacy anon key). HTTPS is required except for loopback; embedded credentials, paths, queries and fragments reject. No admin/service-role or signing key is needed by serving. A single configuration works across environments; there is no environment-specific application adapter. Storage setup still uses the separate privileged entry and serving still checks restricted privileges with native initialization disabled. No new dependency, provisioning helper, CLI configuration, role/account change or shared infrastructure change was added in this story.

Verification has a **2-second total request/body deadline**, no retries and no redirects. Bearer input is length/syntax bounded. Missing/malformed tokens and Supabase 401/403 map to HTTP 401 `unauthenticated`; transport/deadline/non-auth upstream errors or malformed user payloads map to HTTP 503 `integration_failure`, with fixed sanitized messages. Raw upstream responses and credentials are never returned/logged. Verified identity overwrites `requestContext.accountId` before a protected handler runs.

`createBackend` owns one Mastra composition. Its middleware permits exact GET `/health` without Auth, then exact method/path matches from explicitly composed protected routes, denying everything else with 404 **before native handlers**. The production entry supplies no protected routes yet. Native administration, memory/conversations, workflows, tools, telemetry, documentation and qualification routes remain closed regardless of a valid token. Later stories must explicitly compose their implemented routes rather than opening the native API wholesale. There is no Agent, model/provider or workflow execution path.

The Auth security case builds production and probe entries in **separate owned temporary roots**, with the pinned native CLI and frozen installed workspace dependency links (`MASTRA_BUILD_SKIP_INSTALL=1`). It neither moves nor replaces shared production output and needs no previous build. The probe is authored only by the harness; production never imports it, and test-looking environment flags do not enable it. Both compositions share the same production admission module. The probe returns verified identity only and creates no conversation/domain records. Health-only smoke uses an explicit unreachable loopback Auth URL/key and never calls that target; real identity qualification always uses actual configured Supabase and two synthetic accounts. Missing private Auth prerequisites fail rather than skip.

The authorized existing stack was observed with API `127.0.0.1:55431` and database `127.0.0.1:55432`; its other Workprint containers had no host publications. Other projects were not modified. Harness-only ignored fixture files supply the two synthetic credentials and the CLI signing secret used to create a genuinely signed expired version of a real token. Observed fresh tokens use ES256 with a 60-second lifetime. The harness first requires actual Supabase admission of the valid legacy-HS256 signing control before testing its expired counterpart; a wrong signing key cannot masquerade as expiry proof. Neither private fixture nor signing secret enters the serving environment or build. No provisioning resources were acquired in this change; the pre-existing development stack is deliberately left intact.

### Verification chronology and boundaries

- Red: the new Auth test failed compilation before the verifier existed (`/tmp/workprint-auth-red.log`).
- Initial isolated probe build attempted dependency installation and timed out; the harness now uses the supported skip-install option and existing frozen dependencies. A subsequent isolated runtime exposed a missing transitive `hono` link; output dependency links now use pnpm's installed transitive dependency directory, not a new package installation.
- A signing-fixture hardening assertion initially assumed fresh tokens used HS256 and failed against observed ES256 tokens. A real Supabase request accepted the valid legacy-HS256 control (200) and rejected the same signed payload after expiry (403). The built-admission case now requires that positive signing control before expiry rejection counts; production verification is unchanged.
- An aggregate run exposed stale emitted tests from deferred work in `.test-build/`. The runner now removes only that generated directory before compilation/discovery; deferred source/branches/stash were not touched. Those failed old emitted cases are not current coverage or accepted tests. All seven foundation source cases remain.
- Current aggregate evidence and exact delivered SHA are recorded in the Story 2 PR. The added single built-HTTP case covers two real identities, forged owner claims, missing/malformed/forged/signed-expired tokens, production route/probe exclusion, and upstream 500/malformed JSON/header-stall/body-stall failures with a 3-second observable settlement bound. It checks credential/sentinel absence in build/server logs and retains the network tripwire. Existing foundation cases retain browser secret scans, setup/serving separation and no-startup-inference proof. Aggregate expected discovery is eight cases; focused security selects the same six security cases, not extra coverage.

README and `.env.example` were compared editorially with configuration loading, actual response shapes, build paths and the production/test composition split. Descriptive edits have functional/regression verification N/A; executable coverage and current-revision results belong to the PR. No conversation, workflow, client/API catalog or later-story implementation is included.
