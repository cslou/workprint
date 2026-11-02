# Sprint 009 — Video

**Date:** Start 2026-11-02, from `main` after PR #91 (`57ecc93`) – End after completion gates and Lou's QA
**Goal:** In a local build, a signed-in user asks the agent for a video. The agent calls MiniMax Video V2 with a prompt and up to two of the video's saved images as first and last frames. The tool waits in the turn while the chat shows the elapsed minutes. The job is saved before any waiting, so Stop, a deadline or a restart never loses it or submits it twice. The finished clip is checked, saved privately as an assistant-made video, and plays in the chat and in a new "Generated videos" list in the Videos tab, live and after a reload.
**Status:** 🟡 Awaiting Lou's QA (all stories merged into `sprint-009`; completion gates passed 2026-11-03)

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`. Branch `sprint-009` from `main` at `57ecc93`; story branches from `sprint-009`. This sprint doc, the backlog update and the spec packaging update are committed first on `sprint-009`.
- **Tech stack:**
  - Strict TypeScript, React with React Aria, Vite.
  - Mastra 1.79.0 with Muse Spark 1.3, served through the app-owned `@mastra/hono` entry.
  - Supabase Auth/Postgres, SeaweedFS private storage, pnpm.
  - The media checker: byte rules, ffprobe and an ffmpeg decode in a Docker sandbox with a pinned toolchain (`apps/api/src/artifacts/uploads/`, `apps/api/src/storage/media/`).
  - Tests: Node test runner and Playwright on one shared test stack per run (`scripts/test-stack.mjs`).
- **Current state:**
  - **The image path is the template (Sprint 008).**
    - Client and fake: `apps/api/src/generation/meta-image.ts` (closed errors, `redirect: 'error'`, bounded bodies, injectable `baseUrl`/`fetch`) and `apps/api/test/support/meta-image-fake.ts`.
    - Save: `apps/api/src/artifacts/generated-images.ts` checks ownership, verifies with `verifyWhenFree` and `origin: 'assistant'`, stores the object, then writes the version, `generated_objects`, `media_objects` and a draft use in one transaction, removing the object on failure. `application/generated-images.ts` wraps it as `saved | refused | not_found | unavailable`, and `createImageInputReader` returns the video's own images as data URLs.
    - Tool: `apps/api/src/agent/tools/generate-image/` with `phraseFor`, `doneSummary` and `shownImages`. Composition supplies the image client only with storage and the checker (`apps/api/src/mastra/backend.ts`).
    - Chat shows images from the done line's ids (`apps/web/src/conversation/shown-images.tsx`), lazily and through one shared copy per version (`apps/web/src/api/owned-image-cache.ts`).
    - Live check: `scripts/live/image.mjs` (`pnpm live:image`), dry against the fake by default.
  - **Generation records exist only as a browser contract and a Videos-tab component.**
    - `generationRequestSchema` (`packages/contracts/src/models.ts:33-35`) has status `queued | submitting | running | succeeded | failed | cancelled`, no `interrupted`, requires `batchId` and `proposalId`, and allows targets `reference_image | panel_image | shot_video` only.
    - `generationRequest`, `generationRequests` and `cancelGeneration` return `not_implemented` (`apps/api/src/application/index.ts`). No table exists, and `workspace()` returns `videos: [], activeWork: []` (`apps/api/src/artifacts/store.ts:124`).
    - `apps/web/src/videos/requests.tsx` renders request cards with details and "Cancel request". `targetDisplay` returns null for a target it can't name, which blanks the whole list.
  - **Videos.** The Videos tab lists candidates only per storyboard Shot (`apps/web/src/videos/videos.tsx`), from `shot_video` uses. Playback is `SingleClipViewer` over `packages/player`, using the signed URL from the `media` read. Video uploads are switched off (`apps/api/src/artifacts/uploads/policy.ts:16`). `generated_objects` allows only PNG/JPEG up to 10 MiB and forbids posters (`supabase/migrations/20261106000000_generated_media.sql`).
  - **The video check is strict.** `apps/api/src/artifacts/uploads/media-probe.ts` and `media-bytes.ts`/`media-avc.ts` require H.264 Constrained Baseline, SAR exactly 1:1, yuv420p, progressive, at most 1920×1080, constant frame rate up to 60 fps, at most 120 s, AAC-LC, top-level boxes `ftyp/moov/mdat/free`, brand `isom` and one SPS/PPS pair. A MiniMax H3 clip from September (probed with Homebrew ffprobe 8.0.1, not the pinned toolchain) was High profile with no `sample_aspect_ratio`, 1344×768, 24 fps, 5.17 s, AAC-LC 32 kHz stereo, boxes `ftyp free mdat moov`; it fails today's check.
  - **The sandbox** runs one job at a time (`capacity`), 30 s and 1 CPU per job, with writes capped at 8 MiB, and exposes `probe`, `decode` and `poster` on one read-only input (`apps/api/src/storage/media/sandbox.ts`, `sandbox-config.ts`). Each verify attempt has 20 s (`media-verifier.ts`).
  - **Turns.** `turnMs` is 35 min (`apps/api/src/agent/limits.ts:29`), applied as the model's total timeout (`agent/mastra/native-turns.ts:69`). A global Hono `timeout(180000)` applies to every route (`apps/api/src/mastra/server.ts:37`). No test has held a streamed turn past 3 minutes. Stop is an exact-turn abort; disconnect only ends viewing (spec §8.7). Durable-agent auto-recovery is off; Mastra's own docs say it re-issues model calls and re-executes tools. The activity line shows elapsed time only as `{n}s` (`apps/web/src/conversation/activity-line.tsx:15`).
  - **Config.** `loadServerConfig` (`apps/api/src/mastra/config.ts`) knows nothing about MiniMax. `MINIMAX_API_KEY` is in the root `.env` (Lou, 2026-11-01); it is server-only and never printed.
- **Implementation spec:** `docs/specs/implementation-spec-001.md` (§4 module rows, §8.3 Images as the precedent, §8.5–8.7, §10 MVP plan, Agent tool guidance and Phase 3 sprint packaging).

### Sprint-Wide Context
- **Sprint type:** Feature
- **Shared context:**
  - **Lou's decisions (2026-11-02):**
    - **Order.** Video runs before reference sheets, which wait for Lou's details (B-017). The spec's packaging table, the §9 goal-to-delivery rows and the §10 reuse map move video to Sprint 009 and joining clips to Sprint 010 on this branch.
    - **Scope.** Like images: the agent calls a video tool that can take images as frames, the video shows in the chat, and it shows in the Videos tab. Joining clips (B-020) moves to the next sprint. B-040 stays in the backlog.
    - **Check.** Assistant-made videos may use MiniMax's format (High profile, no aspect-ratio tag), still fully decoded, measured and given a poster. Uploads stay as strict as today.
    - **Orientation.** Assistant-made videos may be portrait or landscape (long side at most 1920, short side at most 1080); uploads stay landscape-only (Lou, 2026-11-02, after planning review).
    - **Placement.** Generated videos appear in a "Generated videos" list in the Videos tab, named "Video N · Version 1". Linking a clip to a Shot comes with the storyboard sprint.
    - **Restart.** A restart marks waiting jobs as interrupted with their task id kept. The agent resumes the same job only when asked. Nothing is ever resubmitted, and nothing polls in the background.
    - **One paid live call.** Story 1 makes one MiniMax call (about $0.40, 768P, 5 s) to confirm the current response shapes and give Story 4 a real clip. Other live runs happen only on Lou's request.
    - **No approval before paid calls** (MVP plan; B-030 and B-033 are Later). Stop cannot cancel a MiniMax task, and no copy claims it did (B-029 is Later).
  - **MiniMax Video V2, from the reference** (`~/projects/animation-studio/.pi/skills/generate-video/references/minimax-video-v2.md`, verified from the docs on 2026-09-06, one live observation):
    - `POST https://api.minimax.io/v2/video_generation` with `Authorization: Bearer <key>` returns `{ task_id }`. `GET /v2/query/video_generation/{task_id}` returns `task.{ id, model, status, content.url, resolution, duration, usage, ratio, … }`. Statuses: `queued`, `running`, `succeeded`, `failed`, `cancelled`. Poll about every 10 s. Tasks can be queried for 7 days. No cancel endpoint is documented.
    - Request: `model`, `content[]` (one text item of at most 7000 characters, plus `image_url` items with role `first_frame` or `last_frame`), `resolution`, integer `duration`, and for prompt-only a `ratio` of `21:9`, `16:9`, `4:3`, `1:1`, `3:4` or `9:16`. With frames the ratio is `adaptive`, derived from the inputs. The body is at most 64 MB; frames may be data URLs of at most 30 MB, 256–5760 px per side, ratio 0.4–2.5. Last-frame-only is unverified, so a last frame needs a first frame.
    - `MiniMax-H3`: `768P` or `2K`, 4–15 s, 24 fps. 2K exceeds the check's 1920×1080 limit, so the tool uses 768P.
    - `content.url` is time-limited and may carry credentials: never stored or logged. Query the task again for a fresh one.
    - Errors include 400/2013, 401/1004, 402/1008, 422/1026, 429/1002 and 500/1000; a failed task carries `task.error.{ code, message }`. Limits: 300 requests/min, 30 tasks in flight.
  - **Tool rules (spec §10).** Each tool lives in its own directory under `agent/tools/` and calls application functions in process. Account and video come from the trusted run scope. Every id from the model resolves through an account- and video-scoped query, or the result is not-found. No tool input is nullable, and a wrong optional value is harmless (Muse Spark nullable-args note).
  - **Words.** A *job* is the stored Generation Request for one MiniMax *task*, in the `generation.requests` table. A *clip* is the saved generated video; "video" alone means the user's workspace (the approved label "Video N · Version 1" stays as is).
  - **Abort reasons.** Stop, the turn deadline and the poll deadline make a job interrupted. A server shutdown leaves it running, and the next start marks it interrupted.
  - **Polling never fails a paid task.** A query error (network, timeout, 5xx, 429, 401, a malformed or oversize body) keeps polling until the poll deadline, then leaves the job `interrupted`. Only MiniMax's own `failed` or `cancelled` task status fails a running job.
  - **The create is never cut off.** Once a job is `submitting`, the create runs to its own 20 s timeout even after Stop, so it ends with a task id (then `interrupted` if Stop came) or with an unknown outcome (`failed`, `outcome_unknown`). No job is ever `interrupted` without a task id. Stop during a create therefore settles within those 20 s; past spec §8.7's 8 s the chat shows its existing "We couldn't confirm the reply stopped" notice, and the line ends as "Stopped waiting for the video" once the job is saved. This is accepted MVP behaviour, folded into §8.7.
  - **Test seams.** The fake MiniMax and the loopback download seam reach the server only through test composition options, as the Meta image fake does; no environment variable or config turns them on. The QA build uses real MiniMax.
- **Non-goals:**
  - Joining clips (B-020, next sprint).
  - Linking a generated video to a Shot, choosing a Shot video from it, or the storyboard (B-018).
  - Cancelling at MiniMax (B-029), approval before paid calls and spending limits (B-030, B-033), usage records (B-010).
  - Automatic resume after a restart, a background poller or a workflow (AGENTS.md: no new scheduler).
  - Video uploads, deleting saved work (B-037), previews (B-038) and caching across reloads (B-039).
  - 2K output, last-frame-only input, MiniMax's file uploads (`mm_file://`) and several videos per call. One call makes one video; the agent may call the tool again.
  - Reference sheets (B-017), questions (B-014, B-016) and B-040.

### Affected Flows
- **Existing flows affected:**
  - §8.1 Chat: a new tool line, "Making a video… · 2 min", and for a direct request the video under it, live and after reload. Long turns stay open past 3 minutes.
  - §8.7 Stop, deadline and disconnect: Stop or a deadline during a video job ends the line as stopped waiting and keeps the job; disconnect still only ends viewing.
  - §8.7 server start and shutdown: shutdown aborts running tools with reason `shutdown`; start marks `running` jobs interrupted and `submitting` jobs failed before serving turns.
  - Videos tab: a "Generated videos" list and job cards that show saved status after a reload.
  - Media access (`media` operation): also serves assistant-made videos and their posters.
  - read-workspace: lists generated clips with exact version ids.
  - Assets: assistant-made clips are not listed there (Story 4).
  - Upload checks: unchanged for uploads. The MiniMax allowance applies only to assistant-made videos.
- **New flows introduced:**
  - The agent generates a video, optionally from saved images, and resumes an interrupted job on request. Folded into spec §8.3 (a Videos block beside Images) and §8.7 before the completion deep gate.
  - Developer command: `pnpm live:video` (new, opt-in, dry by default).

### Verification Strategy

For executable behavior (code, config/scripts, and actual machine-consumed contracts or workflows), define functional and relevant regression proof before implementation. Policy/workflow prose alone is not proof of executable behavior. For descriptive-only docs/design prose, record functional and regression N/A with rationale and use editorial review for accuracy/completeness/consistency. Do not add persistent prose/heading assertion suites. Keep applicable existing checks and design visual/safety/consistency/approval checks under the design skill.

Verification has two categories:

- **Functional verification:** proof of executable behavior introduced or changed by this sprint, or justified N/A for descriptive-only work.
- **Regression verification:** proof of relevant existing behavior, or justified N/A for descriptive-only work.

Each implementation story must include:

- Functional verification for executable behavior it delivers, or justified N/A for descriptive-only scope.
- Targeted regression verification for existing behavior at risk, or justified N/A for descriptive-only scope.

At sprint completion, run the applicable regression suite on the combined sprint branch plus planned cross-story checks not covered by that suite. Do not rerun each story's checks separately when the suite already covers them. For descriptive-only work, use editorial review and applicable existing checks. Reusable functional checks become future regression checks; one-off editorial review is evidence, not a persistent suite.

**Lou's core tests (2026-11-02):**
1. **The agent calls the video tool**, with or without frames: Story 5.
2. **The video shows in the chat:** Story 6.
3. **The video shows in the Videos tab:** Story 7.

**Paid-job safety** is proven without paid calls: every Stop, deadline, restart, resume and expiry case runs against the fake MiniMax and asserts how many times the fake was asked to create a task.

**Budget (Lou, MVP testing budget).** Each story runs only its targeted tests plus the commit (quick) and push (standard) gates. New tests go into existing files or harnesses, except `generation-jobs.test.ts` for the new domain. The fake MiniMax server is the only new test support module. Timeouts, poll intervals and the 429 backoff are injectable, so no test waits minutes. No screenshot or visual suites.

### Tests requiring extra consideration

These tests use Docker, a browser build or a paid call. Each is listed once for the sprint.

1. **The fake MiniMax server** (Story 1): a loopback server in `apps/api/test/support/`, modelled on `meta-image-fake.ts`. It serves create, query and the clip download with the observed shapes, steps a task through `queued → running → succeeded | failed`, can hang, refuse (400, 402, 429, 500) and serve an oversize or redirecting download, and counts create requests. Once Story 4's MiniMax-shaped clip exists, the fake serves it as the download, so Story 5–7 cases pass the real checks. It is the only way to drive the tool deterministically. Cost: nothing at runtime.
2. **A MiniMax-shaped test clip** (Story 4): integration needs a small clip with MiniMax's traits (High profile, no SAR, AAC priming, `ftyp free mdat moov`). Build it with the pinned toolchain in the test stack if that build can encode High profile; otherwise keep a clip of at most 1 MB cut by stream copy from Story 1's live clip as a committed fixture. Either way it is exactly 4 s, and tests read its expected duration from one constant. Cost: one sandbox decode per case.
3. **Integration cases on the shared test stack:**
   - **Story 2:** a long held tool in `apps/api/test/integration/stop.test.ts` (or `tool-activity.test.ts`), with the route timeout and turn deadline shrunk through composition options.
   - **Story 3:** the job store's cases in a new `apps/api/test/integration/generation-jobs.test.ts`, since the generation domain has no integration file yet; the restart case runs the start step against a database holding running jobs.
   - **Story 4:** save cases in `apps/api/test/integration/image-upload.test.ts`, which already starts storage and the real decode sandbox.
   - **Story 5:** tool cases in `apps/api/test/integration/tool-activity.test.ts`, adding the fake MiniMax through the composition.
   - Only the database, storage, the sandbox and a real turn prove that the job, the stored object and the draft use land together. Cost: one stack start (about 30–60 s) per story. Targeted runs need the pinned ffmpeg toolchain in this checkout.
4. **Browser journeys:** Story 3 adds one seeded-jobs case and Story 7 one journey to `test/e2e/shots.spec.ts`; Story 6 adds one journey to `test/e2e/chat.spec.ts`. Each targeted run is one stack start plus one vite build, about 1–2 min.
5. **Paid live call** (Story 1): one `pnpm live:video --live` run, approved by Lou (about $0.40). It saves the sanitized create and query shapes, the clip's probe from the pinned toolchain and the clip itself under `outputs/verification/sprint-009/` (gitignored). No gate runs it.
6. **Deep gate at Sprint Completion** (`.checks/regression.sh --tier=deep`): check, unit, build, tooling, integration and browser on one stack, plus audit; about 4–18 min. The `main` pre-merge runs deep again on the final head.

### Stories
**Constraints:** Target 5-8 stories per sprint. Each story should be small enough to review, verify, and merge independently. Split stories that combine unrelated outcomes or cannot be verified with a clear functional/regression verification plan.

#### Story 1: MiniMax video client
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1 (2/5): `query` union incomplete and `cancelled` unmapped (P2); no frame size/ratio precheck, backoff not injectable (P2). Pass 2 (3/5): frame type lacked width/height; a malformed 2xx on create was not `outcome_unknown`; the create timeout and local-validation error were unnamed (P2).
  - Resolution: All addressed: full query union with `cancelled`; size/ratio prechecks on `{ dataUrl, width, height }`; injectable 2 s backoff; 20 s create timeout; a malformed or oversize 2xx is `outcome: 'unknown'`; local validation is `invalid_request` with no code via `validateVideoRequest`.
- **As a** developer, **I want** a server-only client for MiniMax Video V2, a fake MiniMax for tests and one live check, **so that** the tool can submit, follow and download a video, and every routine test runs without paid calls.
- **Dependencies:** None
- **Acceptance criteria:**
  - [x] **Client.** `apps/api/src/generation/minimax-video.ts`, exported through `generation/index.ts`, provides `createMiniMaxVideoClient({ apiKey, baseUrl, timeoutMs?, fetch?, download? })` with:
    - `submit(request, signal)` returning `{ taskId }`. The request type is `{ prompt, durationS, ratio?, firstFrame?, lastFrame? }`, frames as `{ dataUrl, width, height }`. `validateVideoRequest(request)` is exported separately, and `submit` runs it too, so a refusal sends nothing: prompt 1–7000 characters, duration an integer from 4 to 15, `ratio` one of the six documented values and required without frames, a last frame only with a first frame, and each data URL a PNG or JPEG of at most 30 MB. Frames carry their saved width and height, and each side must be 256–5760 px with a width-to-height ratio of 0.4–2.5. The client sends `model: 'MiniMax-H3'`, `resolution: '768P'`, and `ratio: 'adaptive'` with frames.
    - `query(taskId, signal)` returning one of `{ status: 'queued' | 'running' }`, `{ status: 'succeeded', result: { url, durationS?, resolution? } }`, `{ status: 'failed', failure: { code } }` (MiniMax's `task.error.code`) or `{ status: 'cancelled' }`. The URL is returned to the caller and never logged.
    - `download(url, signal, maxBytes)` streaming at most `maxBytes` (100 MiB) with no API credentials sent, `redirect: 'manual'` re-checking each hop, and refusing non-HTTPS URLs and private or loopback addresses. Tests pass a loopback-allowing seam through the composition, never production.
  - [x] **Errors** map to a closed set: `invalid_request` (local validation with no code, or 400 and 422 carrying MiniMax's status code only), `unauthorized` (401), `payment_required` (402), `rate_limited` (429, after one retry with an injectable backoff, 2 s by default), `unavailable` (5xx, network error, timeout), `failed` (malformed body, oversize body or download, refused redirect), `aborted` (the caller's signal). Bodies are size-bounded. No error or log contains the key, the prompt, a frame or a result URL.
  - [x] **No retry of a create** that may have reached MiniMax: `submit` times out after 20 s by default, and a timeout, network error, 5xx, or a malformed or oversize 2xx body maps to `outcome: 'unknown'` and is never retried. Only a 429 before acceptance is retried.
  - [x] **Config.** `loadServerConfig` reads the server-only `MINIMAX_API_KEY` and `https://api.minimax.io` as the base URL. Without the key, the server still starts and composition supplies no video client (as with storage for images). The client lives under `apps/api/`, which `browser-no-server` keeps out of the browser.
  - [x] **Fake MiniMax** (`apps/api/test/support/minimax-video-fake.ts`): serves create, query and the download with the reference's shapes; steps each task `queued → running → succeeded` over scripted queries, or to `failed` with an error; can hang, refuse with 400, 402, 429 or 500, serve an oversize or redirecting download; records each request with its parsed body; counts creates.
  - [x] **Live check.** `pnpm live:video` (`scripts/live/video.mjs`) runs dry against the fake by default. With `--live` it makes one prompt-only 768P 5 s call through the client, polls to completion, downloads the clip, and saves the sanitized create and query shapes (task id kept, URL removed), the clip and its probe from the pinned toolchain to `outputs/verification/sprint-009/`. It reads the key only from the root `.env` and never prints it. No gate, hook or `pnpm test` script runs it.
- **Functional verification:**
  - [x] Unit tests against the fake MiniMax: request bodies match the documented field names for prompt-only, first-frame and first-and-last-frame; query maps each status; each error code maps as listed, with one retry on 429 and none on 400, 402 or 500; a create that times out, and one answered with a malformed 2xx, each return `outcome: 'unknown'` and the fake counts one create; an aborted signal returns `aborted`.
  - [x] Download: an oversize stream fails after reading at most `maxBytes` plus one chunk; a redirect to a private address and a non-HTTPS URL are refused; no `Authorization` header reaches the download host.
  - [x] Refused before any request (the fake records zero): duration 3 or 16, a 7001-character prompt, a missing ratio without frames, a last frame without a first, a WebP data URL, a 200 px frame and a 3:1 frame.
  - [x] Query maps a `cancelled` task to `{ status: 'cancelled' }`.
  - [x] With a sentinel key, prompt, frame and result URL, no error message or log line contains any of them.
  - [x] `pnpm live:video` dry mode passes against the fake.
- **Regression verification:**
  - [x] `pnpm check` and the unit suite pass. The config unit test still refuses to start without `META_API_KEY` and now starts without `MINIMAX_API_KEY`.
  - [x] `pnpm live:image` and `pnpm live:chat` dry modes still pass.
- **Editorial/design verification:** N/A — no visible change.
- **Manual-only behavior verification:** The one approved `pnpm live:video --live` run. Pass: the saved shapes parse through the client, the clip downloads within the limit, and its pinned-toolchain probe is recorded for Story 4. If the shapes differ from the reference, the client and fake follow the live shape and the PR records the difference.
- **Planned commits:**
  1. `Feat(generation): Add the MiniMax video client` (client, config, unit tests)
  2. `Test(api): Add a fake MiniMax video server`
  3. `Test(api): Add an opt-in live video check`
- **Technical notes:**
  - Follow `meta-image.ts` for timeouts (`AbortSignal.any`), bounded reads and redaction. Keep MiniMax field names inside the client.
  - Read the animation-studio `providers/minimax-v2-*.mjs` and the generate-video scripts for the download and redirect checks before writing them.
  - Inject the poll interval elsewhere (Story 5); the client only submits, queries and downloads.

#### Story 2: Turns that wait for minutes
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: unnamed margin, shutdown budget and minute rounding (P2). Pass 2: Node server timeouts unverified; Stop during a create can exceed §8.7's 8 s notice (P2).
  - Resolution: Margin 60 s, shutdown 7 s, whole minutes rounded down with boundary cases; Node timeouts are `startServer` options with a shrunk-value case, and QA runs a turn of at least 6 minutes; the 20 s Stop-during-create wait shows the existing §8.7 notice, recorded as accepted MVP behaviour.
- **As a** creator, **I want** a turn to stay open while a tool waits several minutes, and to see how long it has waited, **so that** a video job can finish in the same turn.
- **Dependencies:** None
- **Acceptance criteria:**
  - [x] **Route timeout.** The native turn stream routes are exempt from the global 180 s Hono timeout and bounded instead by the turn deadline (35 min) plus 60 s. Every other route keeps 180 s. Both values come from `startServer` options, so tests can shrink them.
  - [x] **Why a tool's signal fired.** `ToolContext` gains `abortReason(): 'stop' | 'deadline' | 'shutdown' | undefined`, set from the exact-turn Stop, the turn deadline and server shutdown. The story first records, in the PR, how Mastra 1.79 reports each case (signal reason, whether `timeout.totalMs` aborts a running tool) and builds the reason on that evidence.
  - [x] **Shutdown.** A shutdown aborts running tools with reason `shutdown` within the existing 7 s shutdown budget (`shutdownLimits.totalMs`), and the turn ends as incomplete, as today.
  - [x] **Node timeouts.** The PR records Node's server `requestTimeout`, `headersTimeout` and `keepAliveTimeout` for the API server, and sets any that would end a 35-minute streamed response. They are `startServer` options, so a test can shrink them.
  - [x] **Minutes.** The activity line shows `· 45s` under a minute and whole minutes rounded down from 60 s (`· 1 min` at 60–119 s, `· 2 min` at 120 s), in tabular figures, live only (design.md activity-line rules).
- **Functional verification:**
  - [x] Integration: with the global route timeout set to 1 s and a held test tool (`chat-tools.ts` `test-gated`) released after 2 s, the turn completes and its reply is saved; a non-turn route still times out at 1 s; with Node's request and headers timeouts also shrunk to 1 s, the held turn still completes.
  - [x] Integration: Stop during the held tool gives `abortReason() === 'stop'`; a 2 s turn deadline gives `'deadline'`; closing the server gives `'shutdown'`. The test tool records what it saw.
  - [x] Unit: the activity line formats 59 s as `· 59s`, 60 s and 119 s as `· 1 min`, and 120 s as `· 2 min`.
- **Regression verification:**
  - [x] `apps/api/test/integration/stop.test.ts` (Stop during a held tool aborts it; disconnect only ends viewing) and the chat journeys in `test/e2e/chat.spec.ts` pass.
- **Editorial/design verification:** design.md's activity-line bullet gains the minute form; checked against the existing tabular-figures rule.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Fix(mastra): Let turns outlast the route timeout`
  2. `Feat(agent): Tell tools why they were stopped`
  3. `Feat(web): Show waits in minutes`
- **Technical notes:** Keep the reason in the trusted run context, not model arguments. Check Node's server request and headers timeouts for a long streamed response as part of the first commit.

#### Story 3: Saved video jobs
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: transitions and failure reasons not closed; contract optionality vs existing variants; browser case not costed; unknown-target fallback unverified (P1 cross-story). Pass 2: polling errors could fail a paid task (P1); the clip save and `succeeded` were separate writes (P2).
  - Resolution: Closed transitions and reasons with card copy; only the `video` variant omits `batchId`/`proposalId`; the seeded case is listed and covers a missing-Shot card and Cancel hidden on a Shot job; query errors keep polling and end `interrupted`, only MiniMax's own failure fails a running job; the save and `succeeded` commit together, with a rollback and no-second-clip case. The pass-2 P1 fix has not had a third review (2-pass cap).
- **As a** creator, **I want** every paid video job saved before it is waited on, with an honest status, **so that** Stop, a deadline or a restart never loses a job or pays for it twice.
- **Dependencies:** None
- **Acceptance criteria:**
  - [x] **Store.** A migration adds `generation.requests`, the jobs table, owned by account and video: purpose, prompt digest, inputs (exact image version ids), status, task id, submitted-at, failure reason, result version id and a revision. The `generation` module owns its SQL and calls no peer domain; `application` coordinates it.
  - [x] **States.** The allowed transitions, checked in SQL so a stale writer can't move a finished job:
    - `submitting` (written before the paid create) → `running` with the task id; → `failed` `outcome_unknown` when the create's outcome is unknown; → `failed` with `invalid_input` or `provider_error` when the create was certainly refused (400, 422, 401, 402, or 429 after its retry).
    - `running` → `succeeded` with the result clip, written in the same transaction as the clip's save so a crash can't leave a saved clip on a `running` job; → `failed` only for MiniMax's `failed` or `cancelled` task status or `check_refused`; → `interrupted` (task id kept).
    - `interrupted` → `running` only through resume; → `failed` `expired`.
    - **Failure reasons, closed:** `invalid_input` (MiniMax refused the request), `provider_error` (MiniMax failed or cancelled the task, or refused for payment or rate), `outcome_unknown` (the create may have reached MiniMax), `expired` (past MiniMax's 7-day window), `check_refused` (the clip didn't pass checks).
  - [x] **Contract.** `generationStatusSchema` gains `interrupted`. `failureReason` gains `expired` and `check_refused`. `generationRequestSchema` gains a `video` variant with no target and no `batchId` or `proposalId` (the MVP has no batches or proposals). Only that variant omits them; existing variants keep their shape.
  - [x] **Reads.** `generationRequests` and `generationRequest` return the video's jobs through owned, bounded reads; a foreign or missing id is not-found. `cancelGeneration` stays `not_implemented` (B-029).
  - [x] **Expiry.** Reading or resuming a job interrupted or running past 7 days from submission moves it to `failed` `expired` first, with no MiniMax call.
  - [x] **Restart.** At server start, before serving turns, `running` jobs become `interrupted` and `submitting` jobs become `failed` with `outcome_unknown`. No job is polled or resubmitted.
  - [x] **Videos tab.** Job cards show the saved status after a reload. A `video` job's card is titled `Video request`. Copy per state:
    - `Interrupted`: "Stopped waiting. Ask the agent to resume it."
    - `failed`: `outcome_unknown` "MiniMax may have started this video, but its result is unknown." `expired` "MiniMax no longer keeps this video." `check_refused` "The video didn't pass checks." `invalid_input` and `provider_error` "MiniMax couldn't make this video."
    - "Cancel request" is hidden for every job, since cancellation is not implemented.
    - A job whose Shot isn't in the current storyboard no longer blanks the list: that card alone shows "This request can't be shown".
- **Functional verification:**
  - [x] Integration: the state transitions above, including a stale transition refused and a certainly refused create; a foreign account's job is not-found; an expired job is `failed` `expired` with no network (the network guard would fail any call).
  - [x] Integration: a save that fails after the clip is stored rolls back both the clip rows and the `succeeded` transition; a second success for the same job is refused, so a resume never saves a second clip.
  - [x] Integration: the boot step on a database with one running, one submitting and one succeeded job leaves interrupted, failed `outcome_unknown` and succeeded.
  - [x] Browser (`test/e2e/shots.spec.ts`): three seeded jobs, an interrupted `video` job, a `shot_video` job for an existing Shot and one for a missing Shot. After a reload the first shows its card and copy, the second shows normally, the third alone shows "This request can't be shown", and no card has a Cancel button.
- **Regression verification:**
  - [x] Contract unit tests for the existing generation variants; `test/e2e/shots.spec.ts` Videos journeys pass.
- **Editorial/design verification:** The interrupted copy and the single-card fallback follow design.md's generation-request rules (existing tokens, the one line about remote charges unchanged); recorded in the PR and design.md.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(generation): Save video jobs`
  2. `Feat(generation): Interrupt waiting jobs at start`
  3. `Feat(web): Show saved video job status`
- **Technical notes:** Put the boot step in backend composition, next to the existing startup, as a one-time pass, not a scheduler. Count jobs against nothing in the 100-use limit; only saved videos are uses.

#### Story 4: Save generated videos
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: allowance not an explicit list; no verify-time pass condition; poster read unchecked; portrait clips refused after payment (P1 cross-story); Assets exclusion sat in Story 7. Pass 2: verify time had no checkbox; mixed unit/integration bullet; frame dimensions not supplied by the input read (P2).
  - Resolution: Explicit allowance list from the live probe, anything more goes to Lou; orientation-independent limit for assistant clips with a portrait case; 6 s verify bar with a measured checkbox and a fallback assertion; poster read asserted; Assets exclusion moved here; bullets split; the input read returns width and height; fixture fixed at 4 s.
- **As a** creator, **I want** videos the agent makes checked and saved privately as my video's generated clips, **so that** they are as safe as uploads and stay in my work.
- **Dependencies:** Story 1 (the live clip's probe)
- **Acceptance criteria:**
  - [x] **Check.** For `origin: 'assistant'` videos only, the check accepts an explicit list of allowances taken from Story 1's pinned-toolchain probe and recorded in the PR: H.264 Main or High profile, a missing `sample_aspect_ratio` (treated as 1:1), the clip's top-level box order, and either orientation (long side at most 1920, short side at most 1080, so a portrait 768P clip fits). Any other trait the live clip fails goes back to Lou before it is allowed. Everything else stays: full decode with matching frame count and duration, constant frame rate, at most 120 s, AAC-LC. Uploads keep every current rule, including 1920×1080 landscape.
  - [x] **Save.** `artifacts/generated-videos.ts` (or a video branch of the generated-media save) checks ownership and that each frame input is an image this video uses, verifies with `verifyWhenFree`, stores the clip and its poster privately, and in one transaction writes the assistant-made video version with the frames as dependencies, its `generated_objects` and `media_objects` rows and a draft `video` use. It removes stored objects on failure. A migration widens `generated_objects` to `video/mp4` up to 100 MiB with a poster, and adds the `video` binding purpose to the uses check and `useBindingSchema`. *(Met with a deviation, recorded in the Final Review: a clip has its own draft `clipUseSchema` rather than a `useBindingSchema` option, so the browser can never pass `video` as a binding; the database check gains `video`.)*
  - [x] **Application.** A wrapper maps the save to `saved | refused | not_found | unavailable`, taking the job id so the save and the job's `succeeded` transition commit together (Story 3). Frames reuse `createImageInputReader`, which also returns each image's saved width and height with its data URL.
  - [x] **Reads.** The `media` read serves the clip and its poster. read-workspace lists clips as `Video N · Version R` with exact version ids (`assetLabels` counts videos per kind).
  - [x] **Assets.** Assistant-made clips are not listed in Assets; they appear in Videos (Story 7).
  - [x] **Time.** The 5 s live clip verifies in under 6 s in the sandbox, so a 15 s clip fits the 20 s verify attempt. If it doesn't, the tool's `durationS` maximum drops to what fits, and the PR records it.
- **Functional verification:**
  - [x] Integration (real sandbox): the MiniMax-shaped clip saves as an assistant video with a poster, a draft `video` use and its frame dependencies; its signed media URL serves the exact bytes, and the poster's URL serves the saved poster image.
  - [x] Unit (media-probe tests): for the assistant, a long side over 1920 or a variable frame rate is refused, and a portrait 768×1344 probe passes; for uploads, High profile and a missing SAR are still refused.
  - [x] Integration: the same clip as an upload is still refused; a frame that isn't this video's image is not-found and nothing is stored; a busy checker is waited out.
  - [x] Measured: the sandbox verify time of Story 1's live clip, recorded in the PR against the 6 s bar. If the bar is missed, Story 5's unit test asserts the lowered `durationS` maximum.
  - [x] Unit: read-workspace names a generated video `Video 1 · Version 1`.
- **Regression verification:**
  - [x] `apps/api/test/integration/image-upload.test.ts` (uploads and generated images) and the media-probe unit tests pass unchanged for uploads; `test/e2e/uploads.spec.ts` Assets journeys pass.
- **Editorial/design verification:** N/A — no visible change in this story.
- **Manual-only behavior verification:** N/A (the live clip from Story 1 is the qualification evidence, recorded in the PR).
- **Planned commits:**
  1. `Feat(uploads): Allow MiniMax's video format for the assistant`
  2. `Feat(artifacts): Save generated videos`
- **Technical notes:** The sandbox's 30 s job and 8 MiB write caps fit a 5–15 s 768P decode and a poster; record the measured verify time in the PR. Keep the allowance list in one place beside the XMP allowance.

#### Story 5: generate-video tool
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: resume inputs and non-interrupted refusals unspecified; post-success download/storage failure state undefined; shutdown, unknown create, late download, failed task and restart cases missing; Stop during `submitting` (P1 cross-story). Pass 2: local validation ran after saving `submitting`; `submitting` missing from resume refusals (P2).
  - Resolution: Resume ignores prompt/frames/duration/ratio and refuses every non-interrupted state; post-success `unavailable` leaves `interrupted`, a refused check fails `check_refused`; all listed cases added, including restart with one create and polling errors; the create is never cut off, so no interrupted job lacks a task id; validation runs before any job is saved.
- **As a** creator, **I want** to ask the agent for a video, optionally from my images, and have it wait for the result, **so that** I get a saved clip without leaving the chat.
- **Dependencies:** Stories 1–4
- **Acceptance criteria:**
  - [x] **Tool.** `apps/api/src/agent/tools/generate-video/` with input `prompt`, `durationS` (4–15, default 6), `ratio` (default `16:9`, ignored with frames), `firstFrame` and `lastFrame` (image version ids from read-workspace, empty for none), `resume` (a job id, empty for a new job) and `showInChat`. With `resume` set, `prompt` may be empty and the prompt, frames, duration and ratio are ignored; `showInChat` still applies. No input is nullable, and a wrong optional value is harmless or refused with a readable message. The description says how to write a motion prompt and when to resume.
  - [x] **New job.** Frames resolve through the owned input read, and the request passes `validateVideoRequest`, before anything is saved; a foreign or unused id is "an input image wasn’t found", and a refused request is "the request wasn’t valid" with the reason, each with no job and no create. The tool then saves `submitting`, calls `submit`, saves `running` with the task id, polls every 10 s (injectable) up to 30 minutes (injectable), downloads the result, saves it through Story 4, and marks the job `succeeded` with the version. After MiniMax succeeds, a download or storage that is `unavailable` leaves the job `interrupted` and resumable (MiniMax keeps the task for 7 days); a clip the check refuses fails the job `check_refused`. The line reads "Making a video…", then "Saved Video N · Version 1".
  - [x] **Stop and deadlines.** Stop, the turn deadline or the poll deadline mark the job `interrupted` and end the line as "Stopped waiting for the video". Shutdown leaves it `running` for Story 3's start step. A create already sent is waited out first, so no interrupted job lacks a task id (Shared context). Nothing is saved from a download that finishes after Stop.
  - [x] **Resume.** With `resume`, the job must be this account's and video's (else not-found). It is expired first if due. An `interrupted` job returns to `running` and is polled with the same task id; no create is sent. Other states refuse with a line: `submitting` or `running` "That video is still being made", `succeeded` "That video is already saved" (with its label), `failed` "That video failed and can't be resumed".
  - [x] **Failures.** Each client error and a MiniMax `failed` or `cancelled` task has its own line and a message the agent follows; a create with an unknown outcome is `failed` with `outcome_unknown` and is never retried.
  - [x] **Composition.** The video client is supplied only with storage, the checker and the key; otherwise the tool refuses before any MiniMax call, as generate-image does.
- **Functional verification:**
  - [x] Integration against the fake MiniMax: a prompt-only job and a first-and-last-frame job each end saved, with one create; the frames reach the fake as data URLs and become dependencies.
  - [x] Integration: Stop while polling leaves the job interrupted with its task id and one create; a resume in the next turn completes it with still one create; a poll deadline of 1 s gives interrupted; a resume of an expired job fails it with no call; a foreign job id is not-found.
  - [x] Integration: a disconnected observer doesn't stop the job; the video is saved and the turn ends normally.
  - [x] Integration: Stop during a hung create (released after Stop with a task id) leaves the job `interrupted` with that task id and one create; a create that times out leaves `failed` `outcome_unknown`, one create and nothing resumable.
  - [x] Integration: closing the server during a held poll leaves the job `running` with one create; the next start marks it `interrupted`, and a resume saves the clip with still one create.
  - [x] Integration: a download released after Stop saves nothing; a MiniMax `failed` task fails the job `provider_error`; an `unavailable` download after success leaves it `interrupted`; a query 500 and a 429 mid-poll keep polling, and at the poll deadline the job is `interrupted` and resumes with still one create; resuming a `succeeded` job refuses with no call.
  - [x] Unit: a last frame without a first and a 200 px frame are refused with no job and no create; the refusal lines, the harmless-optional rule (`firstFrame: "null"` is refused with a readable message; `resume: ""` is a new job) and the no-client refusal with zero creates.
- **Regression verification:**
  - [x] `apps/api/test/integration/tool-activity.test.ts` generate-image cases and `stop.test.ts` pass.
- **Editorial/design verification:** Tool-line phrases follow design.md's activity-line rules ("Making a video…", "· 2 min", "Stopped waiting for the video").
- **Manual-only behavior verification:** N/A. A live tool run happens at QA, where Lou makes real videos.
- **Planned commits:**
  1. `Feat(application): Run a video job to its end`
  2. `Feat(agent): Add the generate-video tool`
  3. `Feat(agent): Resume an interrupted video job`
- **Technical notes:** Put the submit-poll-download-save loop in `application` over the generation, artifacts and client interfaces, so the tool stays thin. The tool's signal and `abortReason()` from Story 2 decide interrupted versus shutdown.

#### Story 6: Video in the chat
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: old `shownImages` done-line shape unprotected; failed-poster fallback unverified (P1 cross-story). Pass 2: no findings.
  - Resolution: Old-shape projection case added; the journey refuses one poster read and asserts the fallback.
- **As a** creator, **I want** a video I asked for shown under its line in the chat, **so that** I can watch it where I asked.
- **Dependencies:** Story 5
- **Acceptance criteria:**
  - [x] When `showInChat` is set, the done line carries the saved video id through the same projection and allowlists as shown images (`agent/tool-activity.ts`, `packages/api-client/src/native-activity.ts`, `apps/web/src/conversation/chat-session.ts`).
  - [x] The chat shows the video's poster under the line, sized from the version before it loads, at most 240px tall, with a play mark and the alt text `Video N · Version 1`. It loads lazily through the shared owned-image copy (the poster). Clicking opens `SingleClipViewer`, which plays the clip.
  - [x] Saved history shows the same after a reload. A failed poster read shows "This video couldn’t be shown", and the line stays.
- **Functional verification:**
  - [x] Browser (`test/e2e/chat.spec.ts`): a scripted turn calls generate-video against the fake MiniMax with `showInChat`; the poster shows under the line, the viewer plays (the player reports `playing` or advances `currentTime`), and both again after reload; a turn without `showInChat` shows no video; with the poster read refused once, the line stays and shows "This video couldn’t be shown".
- **Regression verification:**
  - [x] The chat image journeys in `test/e2e/chat.spec.ts` pass.
  - [x] Unit (projection and browser parse): a done line saved before this sprint, in the old `shownImages` shape, still shows its images.
- **Editorial/design verification:** Follows design.md's shown-images rules extended to video (one bullet added for the play mark); the play mark reuses the Videos thumbnail overlay. Lou ratifies at QA.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(agent): Show a made video in the chat` (the scripted generate-video turn helper goes in `test/e2e/fixtures.ts`)
- **Technical notes:** Generalise `shownImages` to shown media ids with a kind, rather than adding a second list.

#### Story 7: Generated videos in the Videos tab
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: duration and job-card order unchecked; depended on Story 6's turn without saying so. Pass 2: `0:05` didn't match the fixture; shared helper location unnamed (P2).
  - Resolution: Asserts the fixture's 4 s duration and DOM order; its own turn via the helper Story 6 adds to `test/e2e/fixtures.ts`; depends on Stories 3–6.
- **As a** creator, **I want** every video the agent made listed in the Videos tab, **so that** I can find and play them later.
- **Dependencies:** Stories 3–6 (it reuses the scripted generate-video turn helper Story 6 adds to `test/e2e/fixtures.ts`)
- **Acceptance criteria:**
  - [x] `workspace()` returns the video's `video` uses, and the Videos tab shows a "Generated videos" list above the Shot rows: one row per clip, named `Video N · Version R`, with its poster (lazy, shared copy), duration and a button that plays it in `SingleClipViewer`. No status pill.
  - [x] The list updates after the tool finishes without a reload (the existing `onToolDone` refresh) and is the same after a reload. With no clips and no Shots, the tab shows its existing empty state.
  - [x] Job cards (Story 3) stay under the list.
- **Functional verification:**
  - [x] Browser (`test/e2e/shots.spec.ts`): its own scripted generate-video turn; the Videos tab lists `Video 1 · Version 1` with its duration (the fixture's, `0:04`) without a reload; it plays; after reload it is still listed, above the job cards in DOM order.
- **Regression verification:**
  - [x] `test/e2e/shots.spec.ts` Shot video journeys pass.
- **Editorial/design verification:** The list reuses the Videos row treatment (`.wp-video-row`, thumbnail, number badge omitted); design.md gains a "Generated videos" bullet under Videos. Lou ratifies at QA.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(web): List generated videos in Videos`
- **Technical notes:** Name rows with `assetLabels` over the `video` uses so chat, read-workspace and Videos agree.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [x] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [x] Run the applicable regression suite on the combined sprint branch.
  - [x] `.checks/regression.sh --tier=deep` on `sprint-009` with the pinned toolchain; the audit's two known moderate advisories (B-004, B-008) are the approved non-pass.
- [ ] Run any planned cross-story checks not covered by that suite.
  - [x] Fold the video flow into spec §8.3 and §8.7 (and the §4 `generation` row) before the deep gate.
  - [x] `pnpm live:video`, `pnpm live:image` and `pnpm live:chat` dry modes pass on the combined branch (no gate runs them).
  - [ ] A QA build for Lou (web 4179, API 4180, live Muse Spark, live Meta images and live MiniMax video, with storage and the sandbox). Pass conditions: a real turn of at least 6 minutes (past Node's 5-minute defaults; two videos in one turn if one is quicker) completes, showing `· N min` while it waits; a video from a prompt and one from a saved image each play in the chat and in Generated videos; Stop leaves an `Interrupted` card; asking to resume it saves the clip with exactly one MiniMax task for that job.
- [x] Record results and unresolved issues in a brief `## Final Review`.

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

## Final Review

- **Outcome:** the goal is met in the scripted build; Lou's live QA is pending. Every story AC and verification item is met, with the deviations recorded below. Each story merged into `sprint-009` after an independent review of its final head scored at least 4/5 with no open P0/P1. The verdicts come from the orchestrator's review runs and are recorded in the PR bodies:
  - Story 1, #95 (MiniMax video client): 4/5. All 17 P2s were fixed.
  - Story 2, #96 (turns that wait for minutes): 4/5. All 5 P2s were fixed.
  - Story 3, #97 (saved video jobs): 4/5, with eight P2s disposed in the PR.
  - Story 4, #98 (save generated videos): 4/5 after fixes.
  - Story 5, #99 (generate-video tool): 4/5 after four fix cycles. The first review's P1 was a create sent after a Stop during the frame read.
  - Story 6, #100 (video in the chat): 5/5 after one fix round.
  - Story 7, #101 (Generated videos): 5/5 after one fix round. The first review's P1 was empty-state evidence that never opened the Videos tab.
- **Combined-branch verification:** the deep gate (`.checks/regression.sh --tier=deep`, 322 s) passed at `5087b4d`, which is `sprint-009` plus these records.
  - Results: unit 199/199, tooling 6/6, integration 141/141, browser 32/32.
  - The first deep run, at `688f29e`, failed 2 integration tests. Both were expectations Sprint 009 made stale. The built admission check still expected the generation-request reads to be unimplemented (Story 3), and the empty workspace lacked `generatedVideos` (Story 4). Neither file was in the stories' targeted runs. Both expectations are fixed in `Test: Expect the video reads in older suites`; the diagnosis is in `.checks/.logs/run-lp4ufvxd/diagnosis.md`.
  - Audit is NON-PASS, as approved: the same 2 moderate advisories, `@hono/node-server` GHSA-rmxm-3fg6-px4f (B-004) and `minimatch` GHSA-g3hv-75wg-m249 (B-008). There are no high or critical advisories.
  - Logs: `outputs/verification/sprint-009/deep-5087b4d/` and `deep-688f29e/`.
- **Live checks:** at `5087b4d`, `pnpm live:video` and `pnpm live:image` pass in dry mode, and `pnpm live:chat` passes in scripted mode, its default. Logs: `outputs/verification/sprint-009/live-dry-5087b4d/`. The one approved paid MiniMax call was Story 1's (`outputs/verification/sprint-009/minimax-video-live-2026-11-02.json`).
- **QA build for Lou:** at `5087b4d`.
  - Address: http://127.0.0.1:4179, API :4180.
  - Live services: Muse Spark 1.3, Meta `muse-image-1.0` and MiniMax-H3 768P video. All are paid calls.
  - Storage: private loopback object storage and the pinned decode sandbox.
  - Account: a dedicated synthetic account, in a 0600 file under `outputs/qa/sprint-009/5087b4de9cc8/`.
  - Pass conditions, from the checklist and still to be run by Lou:
    - a real turn of at least 6 minutes completes, showing `· N min`;
    - a video from a prompt and one from a saved image each play in the chat and in Generated videos;
    - Stop leaves an `Interrupted` card;
    - a resume saves the clip with one MiniMax task for that job.
- **Deviations, recorded in the story PRs:**
  - **Story 4:**
    - The test clip is 97 frames (4.04 s), not 4 s, because of the cut points in MiniMax's B-frame groups.
    - The High-profile `avcC` tail is allowed for assistant clips (Lou, 2026-11-02).
    - A clip's use is its own `clipUseSchema`, not a new `useBindingSchema` option.
  - **Story 5:**
    - Two commits instead of three.
    - A download error after MiniMax succeeds leaves the job resumable. Only a clip too large fails it.
    - One image used as both frames is refused.
    - The commit subject `Fix(application): Name an unused frame only with one` is 52 characters. It was not amended.
  - **Story 6:**
    - The play mark is the player's own play control, shared at 40px, since the Videos thumbnail has no overlay.
    - `SingleClipViewer` takes its use props together or not at all.
  - **Story 7:**
    - Rows are named through the shared `workspaceMediaLabels` and `mediaVersionName`.
    - The poster itself is the play button.
    - The Videos panel mounts only while open until the video has a script, assets or Shots.
- **Unresolved issues, accepted:**
  - Stop cannot cancel a MiniMax task or its charge (B-029). Background execution is B-032.
  - The tooling test `tasks.test.js:138` failed once with `kill EPERM` on a push gate and passed when rerun. `test/support/process.ts` `stop()` treats only ESRCH as gone, and on macOS a process group whose members have all exited can answer EPERM. Diagnosis: `.checks/.logs/run-v4p4efgx/diagnosis.md`. Not fixed this sprint.
  - Story 3 left one P2 unchanged: the shared admission/parse/validate envelope is repeated across application boundary files.
- **New Dependencies:** None. `pnpm live:video` is a new script.
- **Pending:** Lou's QA, then the merge to `main` on Lou's command.
