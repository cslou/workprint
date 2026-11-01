# Sprint 006 — Chat

**Date:** Start 2026-11-01, after `phase-3` (including the MVP planning docs, PR #69, and the regression gates, PRs #70–#71) merged into `main` – End after completion gates and Lou's QA
**Goal:** On a local build, a signed-in user sends a message in a video and gets a streamed Muse Spark reply. While the reply runs, a real read-workspace tool shows its activity phrase. Stop ends the turn, the video gets a generated title in Recents, and the conversation, including tool lines, survives reload.
**Status:** 🔵 In progress

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`. Branch `sprint-006` from `main`; story branches from `sprint-006`.
- **Tech stack:**
  - Strict TypeScript, React with React Aria, Vite.
  - Mastra 1.79.0 (`@mastra/core`, `@mastra/memory` 1.39.0, `@mastra/pg` 1.32.0), served through the app-owned `@mastra/hono` 1.7.21 entry.
  - Supabase Auth/Postgres, SeaweedFS (S3-compatible), pnpm.
  - Tests: Node test runner and Playwright.
- **Current state:**
  - **No model is connected.** `apps/api/src/mastra/server.ts` calls `createBackend()` without a model, so `bindNativeTurns` never runs in a real build.
  - **The bound agent is text-only.** `apps/api/src/agent/mastra/native-turns.ts`: "Do not use tools", `maxSteps: 1`, 64 output tokens, 8 s budget.
  - **The pre-Mastra route admission exists:** send, queue, subscribe, observe and abort, with ownership checks (`apps/api/src/mastra/native-turns.ts`, `native-run-admission.ts`).
  - **The client methods exist:** `@workprint/api-client` has `sendText`, `queueText`, `subscribe`/`consume` and exact-turn `stop`.
  - **The composer is not connected.** It calls `native.sendText()` with no input and shows "Sending messages is not available yet".
  - **History is text-only.** `GET /memory/threads/:threadId/messages` throws "Unsupported native history" on any non-text part, so tool calls would break history.
  - **Chat tests are gone.** The MVP test cleanup (PRs #65–#68) deleted every chat/turn test. Tests now live in three places:
    - `<package>/test/unit/` for unit tests (for example `apps/api/test/unit/mastra/config.security.test.ts`)
    - `apps/api/test/{http,integration,tooling,support}` for API tests
    - `test/e2e/` at the repo root for browser journeys
  - **One shared test stack per run** (PR #67, `scripts/test-stack.mjs`, `apps/api/test/support/test-stack.ts`).
  - **Mastra knows the model.** Its 1.79.0 registry lists `meta/muse-spark-1.3` at `https://api.meta.ai/v1` (OpenAI-compatible via `@ai-sdk/openai`, key variable `META_MODEL_API_KEY`).
  - **The key is present.** The root `.env` has `META_API_KEY` and `DEFAULT_ASSISTANT_MODEL=meta/muse-spark-1.3` (set by Lou, 2026-11-01). `scripts/tasks.mjs` loads one env file (`WORKPRINT_ENV_FILE`, default `.env`). `pnpm db:local` writes `outputs/local-database.env`, and today both it and the shared test environment set `DEFAULT_ASSISTANT_MODEL=unqualified/disabled`, a chat-off placeholder from earlier sprints.
- **Implementation spec:** `docs/specs/implementation-spec-001.md` §10 MVP plan and Phase 3 sprint packaging; backlog B-012, B-021, B-022, B-023, B-034.

### Technical findings at sprint start (2026-11-01)
A read-only code scan before Story 1 found gaps the stories must close. None changes a goal:
- **Story 1:** server admission caps input at 8 KiB (`nativeTurnLimits.inputBytes`); `loadServerConfig` accepts any `provider/model`, including `unqualified/disabled`, and reads no key; the `completedText` guard, `TokenLimiterProcessor(64)` and `maxSteps: 1` block tool loops; Mastra 1.79.0 has no no-data stall timeout (only `totalMs`/`stepMs`/`firstChunkMs`), so the stall limit wraps the model stream; a busy send is merged into the running turn (default `ifActive: 'deliver'`), `queue-message` is admitted and contracts have no `busy` code; no scripted provider exists.
- **Story 2:** the api-client caps input and reply text at 8 KiB and observation at 9 s (`native-transport.ts`); the first send would remount the chat (`shell.tsx` keys on the conversation id); `accountBrowserFixture` cannot take a test composition; Mastra has no regenerate API, so Retry resends (B-035); `design.md` still says typing while busy is queued.
- **Story 3:** the api-client history validator and the history route reject non-text parts, and the stream decoder drops tool chunks.
- **Story 5:** Memory `generateTitle` accepts a `model` and, on the durable path, runs whenever the title is empty; whether it can be bounded is checked at story start.

### Sprint-Wide Context
- **Sprint type:** Feature
- **Shared context:**
  - **Model:** Muse Spark `muse-spark-1.3`, configured as `DEFAULT_ASSISTANT_MODEL=meta/muse-spark-1.3`. Map `META_API_KEY` explicitly on the server; never print it.
  - **Limits (Lou, 2026-11-01; output cap and per-call deadline revised the same day):**
    - input up to 32 KiB
    - output up to 32,768 tokens per model call, including reasoning tokens (Meta: "Reasoning tokens count toward your output-token budget")
    - at most 100 steps per turn
    - a 35-minute overall turn deadline
    - a model call fails if no data arrives for 120 s (a stall limit, not a total duration, so slow reasoning and long replies are not cut off)
  - **One active turn per video,** with no queue. The composer shows the agent is busy, and the server rejects a second send.
  - **Prompt caching:** the system prompt and tool list stay static (no workspace state, no timestamps), so Meta's automatic prefix caching holds.
  - **Tool rules:**
    - Each tool lives in its own directory, `apps/api/src/agent/tools/<tool>/`, and calls application functions in process.
    - Account and video scope come from the trusted server context, never from model arguments.
    - Each tool defines its own activity phrase, for example read-workspace: "Getting up to date on our progress…".
  - **No spending ceiling.** Lou set none for live calls during MVP development. Deterministic tests use a scripted fake provider; live calls only confirm real behaviour.
  - **Scripted provider:** an OpenAI-compatible fake server under `apps/api/test/support/`. It streams scripted text and tool calls, and can hold and release each one. It is excluded from the production build.
- **Non-goals:**
  - writing tools (update-script is Sprint 007)
  - tab refresh (B-024)
  - questions, images or video
  - message queueing (B-026) or reconnecting to a running reply (B-027)
  - usage records (B-010)
  - deployment (B-031)
  - Mastra upgrade (B-007)
  - Muse Wonder, or any model picker

### Affected Flows
- **Existing flows affected:**
  - §8.1 start or resume work: New video, Recents, opening history, sign-out scope clearing.
  - §8.7 Stop and recover: exact-turn Stop, observer disconnect.
  - Composer draft and upload behaviour.
  - Local dev and test-stack server startup. The shared test environment supplies the real model name and a placeholder key; `pnpm dev`, `pnpm start` and `pnpm db:local` runs take the model and real key from the root `.env` through the layered env.
- **New flows introduced:** Real browser text chat with Muse Spark:
  - send, then stream
  - tool activity lines
  - Stop
  - interrupted and failed notices
  - automatic video title
  - reload with tool lines kept

### Verification Strategy

For executable behavior (code, config/scripts, and actual machine-consumed contracts or workflows), define functional and relevant regression proof before implementation. Policy/workflow prose alone is not proof of executable behavior. For descriptive-only docs/design prose, record functional and regression N/A with rationale and use editorial review for accuracy/completeness/consistency. Do not add persistent prose/heading assertion suites. Keep applicable existing checks and design visual/safety/consistency/approval checks under the design skill.

Verification has two categories:

- **Functional verification:** proof of executable behavior introduced or changed by this sprint, or justified N/A for descriptive-only work.
- **Regression verification:** proof of relevant existing behavior, or justified N/A for descriptive-only work.

Each implementation story must include:

- Functional verification for executable behavior it delivers, or justified N/A for descriptive-only scope.
- Targeted regression verification for existing behavior at risk, or justified N/A for descriptive-only scope.

At sprint completion, run the applicable regression suite on the combined sprint branch plus planned cross-story checks not covered by that suite. Do not rerun each story's checks separately when the suite already covers them. For descriptive-only work, use editorial review and applicable existing checks. Reusable functional checks become future regression checks; one-off editorial review is evidence, not a persistent suite.

**Sprint specifics:**
- **Per change:** run only the targeted tests for that change.
- **Suites:** `pnpm check`, `pnpm build`, `pnpm test:unit`, `pnpm test:tooling` (Docker-free build and dev-task tests in `apps/api/test/tooling`), `pnpm test:integration` and `pnpm test:browser`, through the shared test stack (PR #67).
- **Gates** ([regression gates](../regression-gates.md)): every commit runs quick and every push runs standard. Story merges into `sprint-006` run standard through `.checks/pre-merge.sh`; the `sprint-006` → `main` merge runs deep. Don't run `pnpm test:*` by hand while a gate runs.
- **Live check:** one small script, `pnpm live:chat`. By default it runs scripted (fake provider, placeholder key, network guarded). Only `pnpm live:chat --live` makes a handful of real Muse Spark calls. It is never part of the default suites. The live mode runs in Story 1 and once at Sprint Completion.
- **Logs:** redirect full logs to ignored files under `outputs/verification/sprint-006/<sha>/`, and report only results and paths.
- **Design:**
  - `docs/design/demo-02.html` is the reference for "Working… · Stop" and the tool lines.
  - Failed and interrupted notices are simple and ChatGPT-like (Lou, 2026-11-01). They get inert previews approved under delegation before implementation, and Lou ratifies them at QA.
  - No screenshot suites.

### Stories
**Constraints:** Five small stories, in order. Each is one PR into `sprint-006`, independently reviewed and verified.

#### Story 1: Muse Spark agent loop
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1 (2/5): P1 the scripted provider can't hold tools, so test-tool injection was missing; P1 `live:chat` was built only here; P2s on single bad-config outcome, 32 KiB rejection, key leakage, static prompt, deadline proof and build exclusion. Pass 2 (3/5): P1 requiring the key at startup would break every test and dev boot that uses `unqualified/disabled`; P2s on the step-cap outcome, the 60 s timeout test and `live:chat` being blocked by the network guard.
  - Resolution: Added test-only tool and limit injection, the shared `live:chat` script, and the named configuration error, size, leakage, prompt-cache and build checks. Lou (2026-11-01) rejected a chat-off mode: the server always requires the model and key. The shared test environment supplies the model and a placeholder key behind the network guard; `db:local` runs take the model and key from the root `.env`, with the helper's database file layered over it. Step cap ends as failed with a notice; the timeout test overrides to 1 s; `live:chat` uses its own unguarded environment only with `--live`.
- **As a** user, **I want** the backend to run a real Muse Spark agent loop that can call tools, **so that** chat produces real replies.
- **Dependencies:** None (the planning docs are on `main`).
- **Acceptance criteria:**
  - [ ] **Real composition binds the model.** The server composition (`apps/api/src/mastra/server.ts` → `createBackend`) always binds the model from `DEFAULT_ASSISTANT_MODEL`, accepting only `meta/muse-spark-1.3` for the MVP, with the key mapped explicitly from `META_API_KEY`. There is no chat-off mode (Lou, 2026-11-01): the `unqualified/disabled` value is removed from the configuration, the test setups and the README.
  - [ ] **Test and helper setups use the real configuration shape.** The shared test environment (`apps/api/test/support/environment.ts`) sets `DEFAULT_ASSISTANT_MODEL=meta/muse-spark-1.3` and a placeholder `META_API_KEY`; its existing network guard still blocks every non-loopback call, so no test can reach Meta. `pnpm db:local` (`local-database.ts`) stops writing a model line; its file holds only database settings.
  - [ ] **Bad configuration makes no calls.** A missing `META_API_KEY`, an empty or unsupported model, or a `test/`, `mock/` or `fake/` model makes `loadServerConfig` throw `Invalid or missing server configuration: <NAME>`, so the server does not start and makes zero provider requests. The key never appears in logs, errors or browser config.
  - [ ] **One agent loop with a tool registry.** The agent takes its tools from a registry (one directory per tool, `apps/api/src/agent/tools/<tool>/`) and runs up to 100 steps.
    - Limits: 32 KiB input at route admission, 32,768 output tokens per model call, a 120 s no-data stall limit per model call, a 35-minute overall turn deadline. The limits live in one exported limits object.
    - Zero automatic provider retries and no model fallback.
    - A turn whose final allowed step (step 100) ends with a tool call ends as failed, with the notice "Stopped after too many steps." If that step ends with a normal stop, the turn is completed.
    - The system prompt is static text in the agent module, with no state or timestamps.
  - [ ] **The model must really finish.** The existing `completedText` guard is adapted so a tool-call step counts as a valid step end. A turn is completed only when its final step ends with a normal stop; a tool-call end at the step cap means failed. An incomplete provider end still never counts as completion.
  - [ ] **One active turn per video.** A send while a turn is active returns a typed `busy` error and starts no model call.
  - [ ] **Tool folders stay framework-neutral.** A dependency-cruiser rule forbids `apps/api/src/agent/tools/` from importing `apps/api/src/agent/mastra/`, `apps/api/src/mastra/` or `@mastra/*`; `pnpm check` enforces it.
  - [ ] **One composition seam.** `createBackend` passes `bindNativeTurns` one collaborator object: the application functions tools call, the tool registry and the limits. Production passes the real registry and limits. There is no module-level registry that tests change at runtime.
  - [ ] **Test-only tool injection.** Through that seam, the test-only composition (`apps/api/test/support/`) can register extra tools and override limits. The tools are: a gated tool that runs until the test releases it and observes its abort signal; a tool with a unique phrase and done summary; and a registered tool with no phrase. Production registers only real tools and the real limits. Stories 3 and 4 use this.
  - [ ] **One layered env for local and QA runs.** For `dev`, `start` and `db:prepare`, `scripts/tasks.mjs` loads the file named by `WORKPRINT_ENV_FILE` (if any) first, then `.env` in the current working directory. Node's `loadEnvFile` never overwrites a set value, so precedence is shell, then `WORKPRINT_ENV_FILE`, then `.env`. `build` still loads no env file. Full layering is intended: a local run uses the developer's whole `.env` (Auth, storage, provider keys), with the helper file overriding only the database settings. So `WORKPRINT_ENV_FILE=outputs/local-database.env pnpm dev` and the QA host take the database from the helper file and the model and key from `.env`, and the key never appears in a command argument, log line or another file. The README's local-run section is updated to match, and its sentence that `db:local` runs never use the private `.env` is removed. Lou has set `DEFAULT_ASSISTANT_MODEL=meta/muse-spark-1.3` in the root `.env`.
  - [ ] **The live check confirms real behaviour.** `pnpm live:chat --live` (`scripts/live/chat.mjs`) starts the built API through the test-only composition, with real Muse Spark and a test-only echo tool. In live mode it uses its own environment with only the Meta key mapped and no network guard; it never reuses the guarded test-environment fixture. It sends a few synthetic messages, including one that triggers the tool, and confirms the real stream, tool-call and finish shapes. It also confirms Meta accepts the 32,768 output cap and records time to the first chunk, so the 120 s stall limit can be tuned. Sanitized observed shapes are saved as test fixtures, and the run is recorded in the PR. Without `--live`, the script runs the same steps against the scripted provider: it replaces `META_API_KEY` with the same placeholder the shared test environment uses, removes `META_MODEL_API_KEY` and `MINIMAX_API_KEY`, turns on the loopback network guard, passes each step on the scripted outcome, and fails if any non-loopback request is attempted. Stories 3–5 extend the script; only Story 1 and Sprint Completion run `--live`.
- **Functional verification:**
  - [ ] Integration tests in `apps/api/test/integration/agent-loop.test.ts`, run against the built server with the scripted provider:
    - [ ] Text reply and two-turn history: the second request contains the first turn's saved text.
    - [ ] A tool call runs and its result reaches the next step. With the cap overridden to 3, a loop that keeps calling tools ends as failed with "Stopped after too many steps." after exactly 3 provider requests, and a turn whose third step ends with a normal stop is completed.
    - [ ] The output-token cap reaches the provider request. The 100-step cap, stall limit and overall deadline are asserted on the limits object passed through the composition seam (not by waiting 35 minutes).
    - [ ] An input over 32 KiB is rejected at admission with zero provider requests.
    - [ ] The system prompt and tool list are byte-identical across two turns (protects prompt caching).
    - [ ] Provider error, timeout and an incomplete stream each end with a typed failure and no retry (provider request count asserted). The stall case holds the stream mid-reply with the stall limit overridden to 1 s in the test composition. A stream that keeps sending chunks past that time is not cut off.
    - [ ] A second send while busy is rejected with zero extra provider requests.
  - [ ] Tooling test for env layering in `scripts/tasks.mjs` (`apps/api/test/tooling/tasks.test.ts`, run by `pnpm test:tooling`, temp working directory with fixture files): with a `.env` holding the model, a sentinel key and `DATABASE_URL`/`MIGRATION_DATABASE_URL`, and an override file holding different database URLs, the `dev`, `start` and `db:prepare` children receive the model, the key and the override file's database URLs; a shell value beats both; `build` loads neither file; a canary key in the repo's own `.env` never reaches the child.
  - [ ] A `pnpm dev`-style boot with that layering and the sentinel key: the sentinel never appears in server logs or the browser config.
  - [ ] `pnpm live:chat` (scripted, the default) passes with zero non-loopback requests.
  - [ ] `pnpm check`: a fixture import of `@mastra/core` from `agent/tools/` fails the new dependency rule (verified once, not kept).
  - [ ] Unit tests for configuration (`apps/api/test/unit/mastra/config.security.test.ts`): `meta/muse-spark-1.3` with a key loads; a missing key, an empty model, `unqualified/disabled` or another unsupported model throws the named configuration error; the error text and captured server logs never contain the key value. The browser public config contains no key (existing `tooling/web-bundle` sentinel check in `pnpm test:tooling`, with the key added as a sentinel).
  - [ ] `pnpm live:chat --live` passes once, and the result is recorded.
- **Regression verification:**
  - [ ] `pnpm test:integration`, including `conversation-ownership`, `http/admission` and `http/native-navigation`: ownership, foreign threads and route admission are unchanged, and every existing suite boots with the model and placeholder key and makes zero non-loopback requests.
  - [ ] `pnpm test:browser`: the existing journeys still boot and pass with the model and placeholder key.
  - [ ] `pnpm check`: the `production-no-tests` dependency rule keeps `apps/api/src` from importing `apps/api/test/support/` (scripted provider, test composition, test tools), and the API build compiles only `apps/api/src` (`apps/api/tsconfig.build.json`). `tooling/web-bundle` and `web-files` (`pnpm test:tooling`) keep test code and keys out of the web bundle.
- **Editorial/design verification:** N/A — no UI change.
- **Manual-only behavior verification:** N/A — the live check is scripted.
- **Planned commits:**
  1. `Feat(agent): Bind Muse Spark with a tool loop` — configuration, binding, limits and registry.
  2. `Test(agent): Add scripted provider and loop tests` — fake provider, integration tests and the live-check script.
- **Technical notes:**
  - Tool directories (`agent/tools/<tool>/`) hold framework-neutral definitions: schema, phrase, done summary and an execute function over injected collaborators. `agent/mastra` turns the registry into native Mastra tools.
  - Confirm in the installed 1.79.0 typings how to set the output cap (`max_tokens`) and a no-data stall timeout rather than a total request timeout. If only a total timeout exists, reset it on each received chunk.
  - Confirm in the installed 1.79.0 typings how to pass `{ id: 'meta/muse-spark-1.3', apiKey }` (and a base URL for the test-only composition) to the Mastra model router.
  - The scripted provider is reached only through a test-only composition under `apps/api/test/support/` that calls `createBackend(..., model)`. Production has no URL override.
  - Check how the durable agent's `sendMessage` with `ifIdle: { behavior: 'wake' }` behaves on a busy thread. If it would queue as a signal, reject the send in pre-Mastra admission instead.

#### Story 2: Send, stream and saved history
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P2s on the Retry history result, busy/account-switch/upload tests, reload mid-turn, missing regression suites and an unneeded busy preview. Pass 2 (3/5): P2 no server signal for an active turn after reload; P2 unknown Retry mechanism in Mastra 1.79.
  - Resolution: Added the tests and regression suites; dropped the busy preview. Lou (2026-11-01) accepted no "Working…" after reload (B-027) and a possible repeated user message on Retry (B-035). Added a story-start check of Mastra's regenerate support.
- **As a** user, **I want** to type a message and watch the reply stream in, **so that** I can talk to the agent in a video.
- **Dependencies:** Story 1.
- **Acceptance criteria:**
  - [ ] **The composer sends.** It sends through `native.sendText` with the verified scope, then streams the reply text into the conversation as it arrives.
  - [ ] **Keyboard behaviour.** Enter sends once; Shift+Enter inserts a newline; Enter during IME composition does not send. Whitespace-only input is never sent. Input over 32 KiB is blocked in the composer with a short message, and the draft is kept.
  - [ ] **New video stays client-only until the first accepted send.** The first accepted send creates the native thread, whose id becomes the video id (`/app?conversation=<id>`, listed in Recents). If the first send fails, no video appears in Recents and the draft is kept. If its outcome is unknown, the draft is kept and Send stays blocked with "We couldn't confirm your message was sent". The client re-reads that thread's history once: if the message is there, it is shown and the video may appear in Recents. If not, the outcome is still unknown: the notice stays, with "Check again" (another history read; finding the message behaves exactly like the first re-read finding it) and an explicit "Send anyway" (which may create a duplicate message and turn). It never resends automatically.
  - [ ] **States:** sending, streaming, completed, interrupted and failed.
    - Failed and interrupted show a simple ChatGPT-like inline notice under the affected message, using the approved previews.
    - Retry is an explicit button, never automatic. It makes exactly one new attempt. If native memory can regenerate a reply for the saved user message, Retry does that. Otherwise Retry resends the same text, and history may show the user message twice (accepted by Lou, 2026-11-01; cleanup is B-035).
    - The interrupted rendering is triggered and verified in Story 4.
    - A lost send acknowledgment never resends; the draft stays until acceptance is known.
  - [ ] **Busy composer.** While a turn started in this page is active, the composer shows "Working…" as in demo-02, and Send is unavailable. A server `busy` rejection keeps the draft and shows "The agent is still working on the last message."
  - [ ] **Scope switches are clean.** Switching video or account mid-stream drops late events, so nothing renders in the wrong video. Same-video upload or workspace changes do not unmount the chat or lose the draft.
  - [ ] **Reload shows the saved conversation,** with message order and text intact.
  - [ ] **Reload during an active turn** (accepted by Lou, 2026-11-01): the page shows the saved history as loaded, with no "Working…", no live text and no Stop. A send attempted while the turn still runs gets `busy` and keeps the draft. The finished reply appears on a later reload. Re-attaching is B-027.
- **Functional verification:**
  - [ ] Browser journey `test/e2e/chat.spec.ts` against the real built stack with the scripted provider:
    - [ ] New video → type → Enter → streamed text appears incrementally → completed.
    - [ ] Reload shows the same messages; Recents lists the video.
    - [ ] Shift+Enter and whitespace-only input send nothing (provider request count asserted).
    - [ ] A failed first send creates no Recents entry and keeps the draft.
    - [ ] A lost first-send acknowledgment (the response dropped after the server accepts) shows the unconfirmed notice, makes no second send, and after the history re-read shows the message once, with one video in Recents.
    - [ ] A lost acknowledgment where the message is absent on the re-read keeps the notice and the draft, with Send blocked; "Check again" reads history again; only "Send anyway" sends.
    - [ ] Provider failure mid-stream shows the failed notice. Retry makes exactly one more provider request, and after a reload history ends with one completed reply (a repeated user message is allowed).
    - [ ] Switching video mid-stream shows no late text in the other video. Signing out mid-stream and back in as another account shows none of the first account's reply.
    - [ ] An image upload finishing during a stream in the same video keeps the chat mounted and the draft intact.
    - [ ] Reload mid-turn (provider held): a send gets `busy`, the notice shows and the draft is kept. After release and another reload, the completed reply is shown and a send works.
  - [ ] Unit tests for the composer state machine: IME composition, the 32 KiB limit, a server `busy` rejection keeping the draft, and lost acknowledgment without resend.
- **Regression verification:**
  - [ ] `pnpm test:browser`: the `navigation`, `auth`, `uploads` and `saves` journeys still pass. History anchoring, the upload draft and sign-out scope clearing are unchanged.
  - [ ] `http/native-navigation` and `integration/conversation-ownership`: thread listing, paging and ownership are unchanged, apart from the intended hiding of threads with no accepted message.
- **Editorial/design verification:**
  - Inert previews of the failed, interrupted and unconfirmed-send ("Check again" / "Send anyway") states at 1440 and 390 widths (busy reuses demo-02's "Working… · Stop"), in `docs/design/chat-states/`, approved under delegation before implementation. Lou ratifies at QA.
  - Copy never claims a message was delivered or stopped when that is unknown.
- **Manual-only behavior verification:** N/A — automated.
- **Planned commits:**
  1. `Docs(design): Add chat failure state previews`
  2. `Feat(chat): Send and stream replies` — composer, stream view, states.
  3. `Test(chat): Cover send, stream and reload`
- **Technical notes:**
  - If thread creation and the first send cannot be atomic, keep an unconfirmed thread out of Recents and routing until a message is accepted. For example, filter threads with no accepted message in the list route; deletion stays deferred.
  - Reuse `api-client` `consume` for text deltas.
  - At story start, check whether Mastra 1.79.0 native memory can regenerate the assistant reply for an already-saved user message. Use it if so; otherwise use the resend fallback. Record which in the PR.

#### Story 3: Tool activity phrases and the read-workspace tool
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P2s on a numeric size bound, server-sourced phrases, the tool result reaching the model and fail-closed history. Pass 2: P2 read-workspace is too fast to prove the running state; P2 "unknown tool" had two meanings; P2 `live:chat` extension had no pass condition or non-live run.
  - Resolution: Bounds set to 50 items / 16 KiB / 200 characters with a truncation flag; added the tests. The running state is proven with the gated test tool and read-workspace proves the done line; "unknown" now means a registered tool with no phrase. The extension runs against the scripted provider and has a pass/decline rule.
- **As a** user, **I want** to see what the agent is doing while it works, and have it know my video's saved work, **so that** long turns don't look frozen and the agent answers from real data.
- **Dependencies:** Story 2.
- **Acceptance criteria:**
  - [ ] **read-workspace (B-023).** A `read-workspace` tool in `apps/api/src/agent/tools/read-workspace/` reads the video's saved work through the existing owned workspace reads, scoped from trusted context.
    - Listing mode returns a compact list: names, kinds, exact version ids and short text (at most 200 characters per item), with at most 50 items and 16 KiB in total, plus a truncation flag.
    - Item mode fetches one item in full.
    - It calls a new application function that reads the workspace for a trusted account and video. The function is exported through `application/index.ts` and reaches the tool through the Story 1 collaborator object; the tool never imports `application` internals, the HTTP-shaped boundary or the `artifacts` domain directly. The size projection lives in the tool directory.
    - A foreign or missing id returns not-found without disclosure.
  - [ ] **Activity phrases.** Each tool defines its activity phrase in its own directory. read-workspace's is "Getting up to date on our progress…".
    - While a tool runs, the chat shows its phrase with elapsed time.
    - When it finishes, the line becomes a done line; a tool may supply a short done summary.
    - A registered tool with no phrase shows "Working…".
    - The browser never hard-codes tool phrases.
  - [ ] **Tool lines survive reload.**
    - The history route returns a safe tool-activity part: tool name, phrase, state and done summary, never arguments or payloads.
    - Text-only history is unchanged.
    - Unsupported parts still fail closed rather than showing partial history.
- **Functional verification:**
  - [ ] `pnpm live:chat` (scripted) passes with the read-workspace step.
  - [ ] Integration tests run read-workspace against real saved work for two accounts: correct listing, item fetch, foreign-id not-found, and the 50-item / 16 KiB / 200-character bounds with the truncation flag.
  - [ ] Integration test: the history route with tool parts returns only the safe activity fields; no arguments or results are present. A message with an unsupported part (neither text nor tool activity) still makes the route fail closed with the existing error.
  - [ ] Browser journey (extends `chat.spec.ts`):
    - [ ] With an uploaded image, the scripted provider calls read-workspace, then holds before its next step → the read-workspace done line is visible.
    - [ ] On release → the streamed answer. The scripted provider asserts that the tool result it received contains the uploaded image's name and exact version id.
    - [ ] Reload shows both the done line and the answer.
    - [ ] The gated test tool with a unique phrase and done summary, while held, shows that exact phrase with elapsed time; on release it shows the summary. This proves the running state and that the phrase comes from the server.
    - [ ] The registered test tool with no phrase shows "Working…".
- **Regression verification:**
  - [ ] `http/native-navigation` and `integration/artifact-reads` pass: text history and owned reads are unchanged.
  - [ ] `pnpm test:browser`: the `uploads` and `library` journeys still pass.
- **Editorial/design verification:** Tool lines follow demo-02's activity style. Copy check: phrases describe the work and claim no result before it finishes.
- **Manual-only behavior verification:** N/A — automated.
- **Planned commits:**
  1. `Feat(agent): Add read-workspace tool`
  2. `Feat(chat): Show tool activity phrases` — stream and history parts, UI.
  3. `Test(chat): Cover tool lines and reload` — also extends `live:chat` with a read-workspace step.
- **Technical notes:**
  - First confirm on 1.79.0 that native Memory saves tool-call parts with the assistant message, and which stream chunk types carry tool calls and results.
  - The phrase reaches the browser through a server-owned path: in the observed stream, and in the safe history part. It is not a web-side table.
  - One function exported from `agent` projects tool parts to the safe activity fields and looks up phrases. A new stream adapter module in `apps/api/src/mastra/` (for example `native-stream.ts`) wraps the observed stream and uses it, and so does the history route (`mastra/native-navigation.ts`), so redaction is written once. `mastra/native-turns.ts` stays admission only.
  - Must fix (Story 1 review, PR #72): native `error` chunks reach the browser with the raw error, including a stack trace with server paths. The same stream adapter replaces each error with a safe name and message before it leaves the server.
  - The `live:chat` read-workspace step passes when an explicit request ("Check our progress on this video") produces a read-workspace call. If the model declines, rephrase once; a second decline is recorded as a finding, not a sprint failure.

#### Story 4: Stop
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P2 no test that closing the page sends no Stop. Pass 2: P2 that test was an integration test of browser behaviour; P2 "saved or marked interrupted" conflicted with the browser check.
  - Resolution: The close-page check is a browser journey. Lou (2026-11-01) accepted saved partial text with the interrupted marker shown live only (B-035), so the history route is unchanged.
- **As a** user, **I want** to stop the agent mid-reply, **so that** I'm not stuck waiting on, or paying for, work I don't want.
- **Dependencies:** Story 3.
- **Acceptance criteria:**
  - [ ] **Stop targets the exact turn.** Stop (beside "Working…", as in demo-02) calls the existing exact-turn `native.stop` with the captured run id.
  - [ ] **Stop ends the whole turn,** including a tool that is still running: tools receive the abort signal.
  - [ ] **Bounded settlement.** The acknowledgment wait is capped at 5 s, and the UI settles within 10 s of the click.
  - [ ] **Honest outcome.** The partial reply text is saved. The live view marks it interrupted; after a reload it shows as plain partial text with no marker (accepted by Lou, 2026-11-01; B-035). The history route is unchanged. "Stopped" shows only when the stop is confirmed, otherwise "We couldn't confirm the reply stopped". The composer becomes available again.
  - [ ] **No cross-turn effects.** A delayed Stop cannot affect a newer turn. Closing the browser sends no Stop.
  - [ ] **No claims about the provider.** Copy never claims the provider stopped work or charges.
- **Functional verification:**
  - [ ] Integration tests with the scripted provider:
    - [ ] Stop during streaming text, and Stop during a held tool: the tool observes the abort, the turn ends and the provider request count is unchanged afterwards.
    - [ ] A delayed old Stop does not affect the next turn.
    - [ ] A stalled acknowledgment settles within 5 s.
  - [ ] Browser journey (extends `chat.spec.ts`):
    - [ ] Stop mid-reply → interrupted notice within 10 s → composer usable → reload shows the saved partial text.
    - [ ] Closing the page mid-turn sends no `threads/abort` request, and the turn completes (its reply is in history on reopening).
  - [ ] `pnpm live:chat` (scripted) passes with the Stop step.
- **Regression verification:**
  - [ ] Story 2–3 journey cases still pass.
  - [ ] `pnpm test:integration`: native ownership and admission are unchanged; Stop on a foreign thread affects nothing.
- **Editorial/design verification:** Use the approved interrupted notice from Story 2; Stop placement follows demo-02.
- **Manual-only behavior verification:** N/A — automated.
- **Planned commits:**
  1. `Feat(chat): Stop the active turn`
  2. `Test(chat): Cover Stop timing and isolation` — also extends `live:chat` with a Stop step.
- **Technical notes:** The api-client `stop` and the admission's `expectedRunId` check already exist from Sprint 004. Neither a Stop acknowledgment nor a local abort proves remote billing ended.

#### Story 5: Automatic video titles
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P2s on the title timeout and token cap, a timeout test, the heading assertion, regression and tagging title requests. Pass 2: P2 the failed-title-then-second-message case was untested.
  - Resolution: Capped at 32 tokens and 15 s with no retry; added the tests and tagging. The rule is now at most one attempt per message until a title exists, with a test for the follow-up attempt.
- **As a** user, **I want** each video named from my first message, **so that** Recents is easy to scan.
- **Dependencies:** Story 2.
- **Acceptance criteria:**
  - [ ] **One title per video.** After the first accepted message, one model call generates a short title, saved on the native thread. The call is capped at 32 output tokens and a 15 s timeout, with no retry, and the title is trimmed to 60 characters.
  - [ ] **The title shows everywhere it should.** Recents and the sr-only history heading show it, and it survives reload.
  - [ ] **A failure never hurts the chat.** If the title call fails or times out, the video keeps "Untitled video", and the chat turn is unaffected. While a video has no title, each later accepted message makes at most one title attempt; once a title is saved, no further attempts are made.
- **Functional verification:**
  - [ ] `pnpm live:chat` (scripted) passes with the title step.
  - [ ] Integration test with the scripted provider: the first message produces exactly one title request and a saved title; the second message makes no title request. A failing title call, and a title call held past 15 s (timeout overridden to 1 s in the test composition), each leave the title empty and the turn completed. After a failed title, the next message makes exactly one title attempt.
  - [ ] The scripted provider tags title requests separately, so Stories 1–4's provider-request counts exclude them.
  - [ ] Browser journey (extends `chat.spec.ts`): after the first reply, Recents shows the scripted title, the history heading's accessible name is that title, and both persist after reload.
- **Regression verification:**
  - [ ] `pnpm test:browser`: the `navigation` journey passes. Recents paging and the untitled fallback for existing threads are unchanged.
  - [ ] `chat.spec.ts` and `integration/agent-loop.test.ts` still pass with title requests excluded from their counts.
- **Editorial/design verification:** N/A — reuses existing Recents and heading presentation.
- **Manual-only behavior verification:** N/A — automated.
- **Planned commits:**
  1. `Feat(agent): Generate video titles`
  2. `Test(agent): Cover title generation` — also extends `live:chat` with a title step.
- **Technical notes:**
  - Default to one explicit bounded call after an accepted turn while the title is empty. Mastra Memory's `generateTitle` (set to `false` in `native-text-memory.ts`) is a first-turn namer on 1.79.0, so use it only if it can be bounded (one call, timeout, no retry) and also retries on a later message while the title is empty. That call lives in `agent/mastra` next to `native-text-memory.ts`; composition only triggers it through the injected collaborator.
  - **Deviation found in QA (2026-11-02):** a 32-token cap produces no title on Muse Spark 1.3. The model always reasons first and counts that reasoning as output tokens: about 480–750 tokens at its default effort, and 130–230 at `reasoning_effort: "minimal"`, the lowest it accepts. It then reports `stop` with no text. The title call therefore sends `minimal` effort with a 1,024-token cap. A probe of three live calls took 1.1–1.3 s each, used 148–240 tokens and saved a title. The 15 s deadline, no retry and the 60-character trim are unchanged.
  - Recents lists a video only when its thread metadata has `workprintStarted` (Story 2, PR #73). Save the title without dropping that key: write the title alone (`patchThread` with `title` only), never metadata copied from an earlier read. Mastra's durable `generateTitle` writes `metadata: currentThread.metadata` from a read taken before the turn, so if it is used, a test must show the video is still listed afterwards.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [ ] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [ ] Run the applicable regression suite on the combined sprint branch: the deep gate, `.checks/regression.sh --tier=deep` (check, unit, build, tooling, integration and browser on one shared stack, then audit). The audit blocks only on high or critical advisories; moderate ones are reported as the existing B-002/B-004/B-008 non-pass. If the head is unchanged, this run is also the `sprint-006` → `main` pre-merge evidence; don't run it twice.
- [ ] Run any planned cross-story checks not covered by that suite:
  - [ ] `pnpm live:chat --live` once on the combined head with real Muse Spark. Each step passes when:
    - send: a streamed reply completes;
    - read-workspace: an explicit request produces the tool call and a reply (one rephrase allowed; a second decline is a recorded finding, not a failure);
    - title: a non-empty title of at most 60 characters is saved;
    - Stop: a Stop mid-reply settles within 10 s.
    Any other failure is a non-pass, fixed before integration.
  - [ ] Then a QA build for Lou using the layered env from Story 1 (model and key from the root `.env`).
- [ ] Fold the new chat flow into spec §8.1 and §8.7 (send, stream, tool lines, Stop, titles) before integration.
- [ ] Record results and unresolved issues in a brief `## Final Review`.

For descriptive-only work, use editorial review and applicable existing checks. Preserve applicable design checks and approval gates. Failed, ambiguous, or unrun required checks remain non-pass.

### Rules
- Before authorized delivery, read canonical `docs/conventions/delivery-workflow.md` (resolved via AGENTS.md §12) for sprint branching, PRs and review/fix/merge mechanics; shared gates remain in AGENTS.md.
- Work through already-authorized stories sequentially, subject to explicit pause/no-merge instructions. Planning approval alone does not authorize implementation. After all implementation stories are complete, perform the Sprint Completion checklist.
- Only the orchestrator updates planning records. Every resulting head must pass verification and independent review before acceptance.
- After the Sprint Completion checklist passes, follow the delivery workflow for sprint integration and its explicit user merge command.
- Record new dependencies in `## Final Review`, or record `None` when no dependencies were added.

### Definition of Done
- All implementation stories pass acceptance criteria.
- Functional verification evidence is recorded for executable stories; descriptive-only stories justify N/A and record editorial/design evidence.
- Targeted regression verification evidence is recorded for executable stories; descriptive-only stories justify N/A.
- Sprint Completion checklist passes with evidence from the combined sprint branch, or editorial evidence and applicable existing checks for descriptive-only work.
- Failed, ambiguous, manual-only, or unrun verification items are documented in `## Final Review`.
- Sprint doc status is `🟢 Complete` only when completion criteria are met.
- Sprint doc includes a brief `## Final Review` with completion evidence, unresolved issues, and a New Dependencies field containing dependencies or `None`.
- Sprint-integration PR is reviewed, passes the required gates, and is merged only after the explicit user merge command.
- If the sprint introduces new flows, they are folded into the implementation spec before sprint integration.
