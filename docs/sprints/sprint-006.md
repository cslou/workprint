# Sprint 006 — Chat

**Date:** Start after the MVP planning branch (`chore/mvp-backlog`) merges into `phase-3` (PRs #67 and #68 are already in) – End after completion gates and Lou's QA
**Goal:** On a local build, a signed-in user sends a message in a video and gets a streamed Muse Spark reply. While the reply runs, a real read-workspace tool shows its activity phrase. Stop ends the turn, the video gets a generated title in Recents, and the conversation, including tool lines, survives reload.
**Status:** 🟡 Planning

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`. Branch `sprint-006` from integrated `phase-3`; story branches from `sprint-006`.
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
  - **The keys are present.** The root `.env` has `META_API_KEY` and `DEFAULT_ASSISTANT_MODEL`.
- **Implementation spec:** `docs/specs/implementation-spec-001.md` §10 MVP plan and Phase 3 sprint packaging; backlog B-012, B-021, B-022, B-023, B-034.

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
  - Local dev and test-stack server startup (`pnpm dev`, shared test environment), which must keep booting with chat off.
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
- **Suites:** `pnpm check`, `pnpm build`, `pnpm test:unit`, `pnpm test:integration` and `pnpm test:browser`, through the shared test stack (PR #67).
- **Live check:** one small script, `pnpm live:chat`, makes a handful of real Muse Spark calls. It is never part of the default suites. It runs in Story 1 and once at Sprint Completion.
- **Logs:** redirect full logs to ignored files under `outputs/verification/sprint-006/<sha>/`, and report only results and paths.
- **Design:**
  - `docs/design/demo-02.html` is the reference for "Working… · Stop" and the tool lines.
  - Failed and interrupted notices are simple and ChatGPT-like (Lou, 2026-11-01). They get inert previews approved under delegation before implementation, and Lou ratifies them at QA.
  - No screenshot suites.

### Stories
**Constraints:** Five small stories, in order. Each is one PR into `sprint-006`, independently reviewed and verified.

#### Story 1: Muse Spark agent loop
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: Pass 1 (2/5): P1 the scripted provider can't hold tools, so test-tool injection was missing; P1 `live:chat` was built only here; P2s on single bad-config outcome, 32 KiB rejection, key leakage, static prompt, deadline proof and build exclusion. Pass 2 (3/5): P1 requiring the key at startup would break every test and dev boot that uses `unqualified/disabled`; P2s on the step-cap outcome, the 60 s timeout test and `live:chat` being blocked by the network guard.
  - Resolution: Added test-only tool and limit injection, the shared `live:chat` script, and the named configuration error, size, leakage, prompt-cache and build checks. Kept `unqualified/disabled` as a valid chat-off value so existing setups boot unchanged, with browser boot added to regression. Step cap ends as failed with a notice; the timeout test overrides to 1 s; `live:chat` uses its own unguarded environment.
- **As a** user, **I want** the backend to run a real Muse Spark agent loop that can call tools, **so that** chat produces real replies.
- **Dependencies:** `chore/mvp-backlog` merged into `phase-3`.
- **Acceptance criteria:**
  - [ ] **Real composition binds the model.** The server composition (`apps/api/src/mastra/server.ts` → `createBackend`) binds the model from `DEFAULT_ASSISTANT_MODEL`, with the key mapped explicitly from `META_API_KEY`. Two values are valid:
    - `meta/muse-spark-1.3`: chat on; `META_API_KEY` required.
    - `unqualified/disabled`: chat off; native turns are unavailable and zero provider requests are made. The shared test environment (`apps/api/test/support/environment.ts`) and `pnpm db:local` (`local-database.ts`) keep using it unchanged.
  - [ ] **Bad configuration makes no calls.** `meta/muse-spark-1.3` without `META_API_KEY`, an empty or unsupported model, or a `test/`, `mock/` or `fake/` model makes `loadServerConfig` throw `Invalid or missing server configuration: <NAME>`, so the server does not start and makes zero provider requests. The key never appears in logs, errors or browser config.
  - [ ] **One agent loop with a tool registry.** The agent takes its tools from a registry (one directory per tool, `apps/api/src/agent/tools/<tool>/`) and runs up to 100 steps.
    - Limits: 32 KiB input at route admission, 32,768 output tokens per model call, a 120 s no-data stall limit per model call, a 35-minute overall turn deadline. The limits live in one exported limits object.
    - Zero automatic provider retries and no model fallback.
    - Reaching the 100-step cap ends the turn as failed, with the notice "Stopped after too many steps."
    - The system prompt is static text in the agent module, with no state or timestamps.
  - [ ] **The model must really finish.** The existing `completedText` guard is adapted so a tool-call step counts as a valid step end. An incomplete provider end still never counts as completion.
  - [ ] **One active turn per video.** A send while a turn is active returns a typed `busy` error and starts no model call.
  - [ ] **Test-only tool injection.** The test-only composition (`apps/api/test/support/`) can register extra tools and override limits. The tools are: a gated tool that runs until the test releases it and observes its abort signal; a tool with a unique phrase and done summary; and a registered tool with no phrase. Production registers only real tools and the real limits. Stories 3 and 4 use this.
  - [ ] **The live check confirms real behaviour.** `pnpm live:chat` (`scripts/live/chat.mjs`) starts the built API through the test-only composition, with real Muse Spark and a test-only echo tool. It uses its own environment with the real key mapped and no network guard; it never reuses the guarded test-environment fixture. It sends a few synthetic messages, including one that triggers the tool, and confirms the real stream, tool-call and finish shapes. It also confirms Meta accepts the 32,768 output cap and records time to the first chunk, so the 120 s stall limit can be tuned. Sanitized observed shapes are saved as test fixtures, and the run is recorded in the PR. Stories 3–5 extend the script; only Story 1 and Sprint Completion run it live.
- **Functional verification:**
  - [ ] Integration tests in `apps/api/test/integration/agent-loop.test.ts`, run against the built server with the scripted provider:
    - [ ] Text reply and two-turn history: the second request contains the first turn's saved text.
    - [ ] A tool call runs and its result reaches the next step. A loop that keeps calling tools ends at the step cap as failed with "Stopped after too many steps." (cap overridden to 3 in the test composition).
    - [ ] The output-token cap and step cap reach the provider request; the stall limit and overall deadline are asserted on the exported limits object passed to the agent (not by waiting 35 minutes).
    - [ ] An input over 32 KiB is rejected at admission with zero provider requests.
    - [ ] The system prompt and tool list are byte-identical across two turns (protects prompt caching).
    - [ ] Provider error, timeout and an incomplete stream each end with a typed failure and no retry (provider request count asserted). The stall case holds the stream mid-reply with the stall limit overridden to 1 s in the test composition. A stream that keeps sending chunks past that time is not cut off.
    - [ ] A second send while busy is rejected with zero extra provider requests.
  - [ ] Unit tests for configuration (`apps/api/test/unit/mastra/config.security.test.ts`): `unqualified/disabled` loads with no key; `meta/muse-spark-1.3` without a key, or a bad model, throws the named configuration error; the error text and captured server logs never contain the key value. The browser public config contains no key (existing `tooling/web-bundle` sentinel check, with the key added as a sentinel).
  - [ ] `pnpm live:chat` passes once, and the result is recorded.
- **Regression verification:**
  - [ ] `pnpm test:integration`, including `conversation-ownership`, `http/admission` and `http/native-navigation`: ownership, foreign threads and route admission are unchanged, and every existing suite still boots with `unqualified/disabled`.
  - [ ] `pnpm test:browser`: the existing journeys still boot and pass with chat off.
  - [ ] `pnpm check`: the `production-no-tests` dependency rule keeps `apps/api/src` from importing `apps/api/test/support/` (scripted provider, test composition, test tools), and the API build compiles only `apps/api/src` (`apps/api/tsconfig.build.json`). `tooling/web-bundle` and `web-files` keep test code and keys out of the web bundle.
- **Editorial/design verification:** N/A — no UI change.
- **Manual-only behavior verification:** N/A — the live check is scripted.
- **Planned commits:**
  1. `Feat(agent): Bind Muse Spark with a tool loop` — configuration, binding, limits and registry.
  2. `Test(agent): Add scripted provider and loop tests` — fake provider, integration tests and the live-check script.
- **Technical notes:**
  - Confirm in the installed 1.79.0 typings how to set the output cap (`max_tokens`) and a no-data stall timeout rather than a total request timeout. If only a total timeout exists, reset it on each received chunk.
  - Confirm in the installed 1.79.0 typings how to pass `{ id: 'meta/muse-spark-1.3', apiKey }` (and a base URL for the test-only composition) to the Mastra model router.
  - The scripted provider is reached only through a test-only composition under `apps/api/test/support/` that calls `createBackend(..., model)`. Production has no URL override.
  - Check how the durable agent's `sendMessage` with `ifIdle: { behavior: 'wake' }` behaves on a busy thread. If it would queue as a signal, reject the send in pre-Mastra admission instead.

#### Story 2: Send, stream and saved history
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P2s on the Retry history result, busy/account-switch/upload tests, reload mid-turn, missing regression suites and an unneeded busy preview. Pass 2 (3/5): P2 no server signal for an active turn after reload; P2 unknown Retry mechanism in Mastra 1.79.
  - Resolution: Added the tests and regression suites; dropped the busy preview. Lou (2026-11-01) accepted no "Working…" after reload (B-027) and a possible repeated user message on Retry (B-035). Added a story-start check of Mastra's regenerate support.
- **As a** user, **I want** to type a message and watch the reply stream in, **so that** I can talk to the agent in a video.
- **Dependencies:** Story 1.
- **Acceptance criteria:**
  - [ ] **The composer sends.** It sends through `native.sendText` with the verified scope, then streams the reply text into the conversation as it arrives.
  - [ ] **Keyboard behaviour.** Enter sends once; Shift+Enter inserts a newline; Enter during IME composition does not send. Whitespace-only input is never sent. Input over 32 KiB is blocked in the composer with a short message, and the draft is kept.
  - [ ] **New video stays client-only until the first accepted send.** The first accepted send creates the native thread, whose id becomes the video id (`/app?conversation=<id>`, listed in Recents). If the first send fails or its outcome is unknown, no visible video appears in Recents and the draft is kept.
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
    - [ ] Provider failure mid-stream shows the failed notice. Retry makes exactly one more provider request, and after a reload history ends with one completed reply (a repeated user message is allowed).
    - [ ] Switching video mid-stream shows no late text in the other video. Signing out mid-stream and back in as another account shows none of the first account's reply.
    - [ ] An image upload finishing during a stream in the same video keeps the chat mounted and the draft intact.
    - [ ] Reload mid-turn (provider held): a send gets `busy`, the notice shows and the draft is kept. After release and another reload, the completed reply is shown and a send works.
  - [ ] Unit tests for the composer state machine: IME composition, the 32 KiB limit, a server `busy` rejection keeping the draft, and lost acknowledgment without resend.
- **Regression verification:**
  - [ ] `pnpm test:browser`: the `navigation`, `auth`, `uploads` and `saves` journeys still pass. History anchoring, the upload draft and sign-out scope clearing are unchanged.
  - [ ] `http/native-navigation` and `integration/conversation-ownership`: thread listing, paging and ownership are unchanged, apart from the intended hiding of threads with no accepted message.
- **Editorial/design verification:**
  - Inert previews of the failed and interrupted states at 1440 and 390 widths (busy reuses demo-02's "Working… · Stop"), in `docs/design/chat-states/`, approved under delegation before implementation. Lou ratifies at QA.
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
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P2s on a numeric size bound, server-sourced phrases, the tool result reaching the model and fail-closed history. Pass 2: P2 read-workspace is too fast to prove the running state; P2 "unknown tool" had two meanings; P2 `live:chat` extension had no pass condition or non-live run.
  - Resolution: Bounds set to 50 items / 16 KiB / 200 characters with a truncation flag; added the tests. The running state is proven with the gated test tool and read-workspace proves the done line; "unknown" now means a registered tool with no phrase. The extension runs against the scripted provider and has a pass/decline rule.
- **As a** user, **I want** to see what the agent is doing while it works, and have it know my video's saved work, **so that** long turns don't look frozen and the agent answers from real data.
- **Dependencies:** Story 2.
- **Acceptance criteria:**
  - [ ] **read-workspace (B-023).** A `read-workspace` tool in `apps/api/src/agent/tools/read-workspace/` reads the video's saved work through the existing owned workspace reads, scoped from trusted context.
    - Listing mode returns a compact list: names, kinds, exact version ids and short text (at most 200 characters per item), with at most 50 items and 16 KiB in total, plus a truncation flag.
    - Item mode fetches one item in full.
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
  - [ ] The extended `live:chat` script runs once against the scripted provider (no live call) and passes.
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
  - The `live:chat` read-workspace step passes when an explicit request ("Check our progress on this video") produces a read-workspace call. If the model declines, rephrase once; a second decline is recorded as a finding, not a sprint failure.

#### Story 4: Stop
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
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
  - [ ] The extended `live:chat` script runs once against the scripted provider and passes.
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
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
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
  - [ ] The extended `live:chat` script runs once against the scripted provider and passes.
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
  - Prefer Mastra Memory's `generateTitle`. `native-text-memory.ts` currently sets it to `false`.
  - If the built-in option cannot be bounded (one call, timeout, no retry) on 1.79.0, make one explicit bounded call after the first accepted turn instead.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [ ] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [ ] Run the applicable regression suite on the combined sprint branch: `pnpm check`, `pnpm build`, `pnpm test:unit`, `pnpm test:integration` and `pnpm test:browser`. Also run `pnpm audit`, which may report only B-004/B-008.
- [ ] Run any planned cross-story checks not covered by that suite:
  - [ ] `pnpm live:chat` once on the combined head with real Muse Spark. Each step passes when:
    - send: a streamed reply completes;
    - read-workspace: an explicit request produces the tool call and a reply (one rephrase allowed; a second decline is a recorded finding, not a failure);
    - title: a non-empty title of at most 60 characters is saved;
    - Stop: a Stop mid-reply settles within 10 s.
    Any other failure is a non-pass, fixed before integration.
  - [ ] Then a QA build for Lou.
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
