# Sprint 008 — Images

**Date:** Start 2026-11-02, from `main` after PR #84 (`3c7a048`) – End after completion gates and Lou's QA
**Goal:** In a local build, a signed-in user asks the agent for an image. The agent calls Meta `muse-image-1.0`, and the image is checked, saved privately as an assistant-made image, and shown in the chat and in the Assets tab, live and after a reload. The tool also accepts saved images as inputs with the prompt, using every option Meta's image API offers that our storage can keep.
**Status:** 🟢 Complete (Lou's QA and the merge to main pending)

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`. Branch `sprint-008` from `main` at `3c7a048`; story branches from `sprint-008`. This sprint doc, the backlog reorder and the spec packaging update are committed first on `sprint-008`.
- **Tech stack:**
  - Strict TypeScript, React with React Aria, Vite.
  - Mastra 1.79.0 with Muse Spark 1.3 (`meta/muse-spark-1.3`), served through the app-owned `@mastra/hono` entry.
  - Supabase Auth/Postgres, SeaweedFS (S3-compatible private storage), pnpm.
  - The media checker: byte rules, ffprobe and an ffmpeg decode in a Docker sandbox (`apps/api/src/artifacts/uploads/`, `apps/api/src/storage/media/`).
  - Tests: Node test runner and Playwright, with one shared test stack per run (`scripts/test-stack.mjs`).
- **Current state:**
  - **Chat and tools work (Sprints 006–007).**
    - The tool registry is in `apps/api/src/agent/tools/` (`define.ts`, `index.ts`), and the tools are `read-workspace` and `update-script`.
    - Collaborators are wired in `apps/api/src/mastra/backend.ts`.
    - The trusted account and video come from the run (`agent/mastra/tools.ts` `trustedScope`).
    - The scripted provider can script calls to any tool name.
  - **Uploads save human images only.**
    - `createUploadCoordinator` (`artifacts/uploads/coordinator.ts`) does the work: it checks the bytes with `createMediaVerifier`, publishes to private storage, then calls `completeUpload`.
    - `publishVersion` (`artifacts/publication.ts:11,34`) types media as `createdBy: 'human'` and hard-codes provenance `'upload'`.
    - `media_objects.object_key` must reference `upload_objects`, which must reference an `uploads` row, which needs a staging key and an operation id (`supabase/migrations/20261031000000_private_uploads.sql:10-71`).
    - The database already allows provenance `'assistant'` with `created_by = 'assistant'`.
  - **The media checker refuses Meta's PNGs.**
    - The PNG byte rule allows only `IHDR`, `IDAT`, `IEND` and `pHYs` (`artifacts/uploads/media-bytes.ts:16`).
    - The planning live calls returned an `iTXt` chunk: Adobe XMP, 407 bytes, carrying the IPTC "trainedAlgorithmicMedia" AI-generated label (Shared context).
    - The decode sandbox runs one job at a time and answers a second with `capacity` immediately (`storage/media/sandbox.ts:46`).
  - **Image reads.**
    - `createMediaAccess` (`artifacts/uploads/access.ts`) returns signed URLs, scoped by account but not by video.
    - No function returns an image's bytes.
    - read-workspace lists images as `Image N · Version R` with their exact version id (`agent/tools/read-workspace/projection.ts`).
  - **Assets.**
    - `workspace()` (`artifacts/store.ts:96-127`) lists the video's `reference` uses as `assets`.
    - Image and video rows show a text placeholder, not a picture (`apps/web/src/materials/assets.tsx:27`).
    - Sprint 007's refresh (`onToolDone` → `refresh()`) already re-reads the workspace after a tool finishes.
  - **Tool lines.**
    - Live tool activity and saved history both project through `projectToolActivity` (`agent/tool-activity.ts`).
    - Each side has a closed field allowlist: `isToolActivity` in `packages/api-client/src/native-activity.ts` and `withActivity` in `apps/web/src/conversation/chat-session.ts`.
    - There is no field for an image.
  - **Provider calls.** Chat goes through Mastra's model router, and there is no image client.
    - `loadServerConfig` reads the server-only `META_API_KEY` (`mastra/config.ts`).
    - Tests swap providers through the composition (`apps/api/test/support/chat-composition.ts`), and `guardNetwork` blocks non-loopback calls.
- **Implementation spec:** `docs/specs/implementation-spec-001.md` (§8.2 Bring or reuse material, §8.3, §10 MVP plan and Agent tool guidance).

### Sprint-Wide Context
- **Sprint type:** Feature
- **Shared context:**
  - **Lou's decisions (2026-11-02):**
    - **Order.** AskUserQuestion (B-014) and image options (B-016) move after video generation. This sprint is images (B-015) only. The backlog and the spec's sprint packaging are updated on this branch.
    - **Delete.** Deleting saved work goes to the backlog as B-037 (Later). It is not in this sprint.
    - **Full Meta functionality.** The client follows what Meta's API offers, not a reduced set. The tool exposes every option Meta allows that our storage can keep: prompt, input images, image count, size (a shape, not exact pixels), reasoning strength, and Meta's built-in search and shell tools.
    - **Stop.** Stop can't cancel a generation already running at Meta. That is accepted. Stop cancels our side, and the copy never claims Meta stopped or didn't charge (B-029 is Later).
    - **Live calls run only on request.** The live image check never runs in the commit, push or merge gates. This sprint's live runs use a prompt only; an input-image live run waits for a later sprint.
    - **No approval before paid calls** (MVP plan; B-030 and B-033 are Later).
  - **Meta image API, observed in two live calls on 2026-11-02** (evidence in `outputs/verification/sprint-008/`, gitignored):
    - **Generation:** `POST https://api.meta.ai/v1/images/generations` with `{model: 'muse-image-1.0', prompt, n, size: '1536x1024', response_format: 'b64_json', output_format: 'png', tool_enablement: {enable_image_search, enable_web_search, enable_shell}}`. Response 200 in 9.7 s.
    - **Edit:** `POST https://api.meta.ai/v1/images/edits` with the same fields plus `images: [{image_url: 'data:image/png;base64,…'}]`. Response 200 in 9.4 s.
    - **Response:** `{created, data: [{b64_json}], output_format: 'png', background: 'opaque', usage: {input_tokens, output_tokens, total_tokens}}`. Headers include `x-request-id`, `x-ratelimit-limit-requests: 150` and `x-ratelimit-remaining-requests`.
    - **Size is a shape, not pixels.** `size: '1536x1024'` returned 1920×1280, and the edit returned 1920×1280 from a 1920×1280 input. The PNGs were 2.8–3.0 MB, 8-bit RGB, non-interlaced.
    - **Chunks:** `IHDR`, one `iTXt` (`XML:com.adobe.xmp`, 407 bytes, uncompressed, IPTC `DigitalSourceType` = `trainedAlgorithmicMedia`), `IDAT` and `IEND`.
    - **Documented and not yet observed** ([Meta image generation](https://dev.meta.ai/docs/image-generation)):
      - `n` from 1 to 10;
      - `size` as `"WxH"` or `"auto"`, with ratios beyond 16:1 refused;
      - `response_format` `b64_json` or `url`;
      - `output_format` `webp` (the default), `png` or `jpeg`;
      - `reasoning_strength` `high` (the default) or `low`;
      - all three built-in tools on by default;
      - `images` of 1–10 items, each `image_url` or `file_id`;
      - errors as `{error: {type, code?, param?, message}}`: 400 for validation and `content_policy_violation`, 415, 503 retryable, 500 not retryable;
      - $0.01 per image, with failed and filtered images not billed.
  - **Tool rules (backlog intro, spec §10).**
    - Each tool lives in its own directory under `agent/tools/` and calls application functions in process.
    - Account and video come from the trusted run scope, never from model arguments.
    - The system prompt and tool list stay static.
    - Every image id from the model resolves through an account- and video-scoped query, or the result is not-found.
    - Muse Spark doesn't reliably send `null` for optional arguments (Sprint 007), so no tool input is nullable and a wrong optional value is harmless or refused with a readable message.
  - **The AI-generated label is kept (Lou, 2026-11-02).** The PNG byte rule accepts exactly one bounded XMP `iTXt` chunk for images the assistant saves. Uploads stay as strict as today.
- **Non-goals:**
  - Images as question options and AskUserQuestion (B-014, B-016), which come after video.
  - Deleting images or other saved work (B-037).
  - Approval before paid calls, spending limits and usage records (B-030, B-033, B-010).
  - Cancelling a running generation at Meta (B-029).
  - **Kept out of the tool, each with a reason:**
    - WebP output, because private storage accepts only PNG and JPEG.
    - `response_format: url`, because the temporary signed URL adds a second download and the result is the same.
    - Streaming partial images, because the result is saved whole.
    - The Responses API's multi-turn editing, because the edits endpoint covers editing with saved inputs.
    - Meta's Files API (`file_id`), because inputs go as base64 from private storage.
    - The `user` field, because no account identifier is sent to Meta.
  - A new image-editing UI, a lightbox redesign, or saving an edit as a new version of its input image. An edit is a new image that records its inputs as dependencies.
  - Reference sheets, the storyboard and video (B-017 to B-020).

### Affected Flows
- **Existing flows affected:**
  - §8.1 Chat: a new tool line, "Making an image…", and for a direct request the image under it, live and after reload.
  - §8.2 Bring or reuse material: Assets rows show the image (uploads and generated), and assistant-made images join the video's Assets as drafts.
  - Upload checks: unchanged for uploads. The XMP allowance applies only to assistant saves.
  - read-workspace: lists generated images like uploads.
  - §8.7 Stop: Stop during a generation ends the tool line as incomplete, and nothing is saved from a response that arrives after it (Story 3).
  - Media access (`media` operation): also serves assistant-made images (Story 2).
- **New flows introduced:**
  - The agent generates or edits images. It is folded into spec §8.3, with a cross-reference from §8.2, before the completion deep gate.
  - Developer commands: `pnpm live:image` (new, opt-in) and a generate-image step in `pnpm live:chat`.

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
1. **Live image call:** opt-in only. Story 1 builds `pnpm live:image`; it runs at completion only if Lou asks. The planning calls already recorded the real shape.
2. **The agent calls the tool:** Story 3.
3. **The image is saved:** Story 2.
4. **The image is retrieved:** the server reads bytes for inputs in Story 2; the browser shows the image in Stories 4 and 5.

Delete is B-037, not tested here.

**Budget (Lou, MVP testing budget).** Each story runs only its targeted tests plus the commit (quick) and push (standard) gates. New tests go into existing files or harnesses. The new fake Meta server in Story 1 is the only new test support module. No screenshot, visual or new fixture suites.

### Tests requiring extra consideration

These tests use Docker, a browser build or paid calls. Each is listed once for the sprint.

1. **The fake Meta image server** (Story 1): a loopback HTTP server in `apps/api/test/support/`, modelled on `scripted-provider.ts`.
   - It serves the two image endpoints with the observed response shape, records requests, and can be told to refuse (400 `content_policy_violation`, 503).
   - It returns small valid PNGs built in the test, carrying the same XMP `iTXt` chunk as Meta's.
   - It is the only way to drive the tool deterministically without paid calls. It costs nothing at runtime.
2. **Integration cases on the shared test stack:**
   - **Story 2:** the save and input-read cases go in a new `describe` in `apps/api/test/integration/image-upload.test.ts`, which already starts storage and the real decode sandbox.
   - **Story 3:** the tool cases go in `apps/api/test/integration/tool-activity.test.ts`, adding storage, media and the fake Meta through the composition.
   - Only the database, storage and a real turn prove the version, the stored object and the draft use land together. Cost: one stack start (about 30–60 s) per story, plus seconds of test time.
   - Targeted stack runs use the real decode sandbox, which the shared test stack starts with the pinned ffmpeg toolchain (`test/support/test-stack.ts`). So every targeted run needs that toolchain in this checkout, as the deep gate does. Cases that need a busy or failing checker inject a `verifyMedia` wrapper and run as unit tests.
3. **One new browser journey and one added assertion:**
   - **Story 4** adds a journey to `test/e2e/chat.spec.ts`: a scripted turn calls generate-image against the fake Meta. The image shows under the tool line and in Assets without a reload, and both again after reload.
   - **Story 5** adds one assertion to the existing image-upload journey in `test/e2e/uploads.spec.ts`: the Assets row's image loads.
   - Each targeted run is one stack start plus one vite build, about 1–2 min.
4. **Paid live checks, only when Lou asks** (never in gates):
   - **`pnpm live:image`** (Story 1): one prompt-only generation through our client against Meta. It saves the sanitized response shape and checks the result parses into a PNG. About $0.01.
   - Neither blocks completion when Lou doesn't ask for it; the QA build, where Lou makes real images, stands in for them.
   - **`pnpm live:chat --live`, generate-image step** (Story 3): Muse Spark is asked for an image and must call `generate-image` with valid arguments; the image is saved. About $0.01 in images plus the existing chat steps.
5. **Deep gate at Sprint Completion** (`.checks/regression.sh --tier=deep`). It covers check, unit, build, tooling, integration and browser on one stack, plus audit; about 4–18 min. It needs the pinned ffmpeg toolchain in this checkout. The `main` pre-merge gate runs deep once more on the final head.

### Stories
**Constraints:** Target 5-8 stories per sprint. Each story should be small enough to review, verify, and merge independently. Split stories that combine unrelated outcomes or cannot be verified with a clear functional/regression verification plan.

#### Story 1: Meta image client
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1 (2/5 overall): P1 live-call rule inconsistent; P1 timeout, config and redaction unverified; P2 module location open; cross-story P1 live check needed Story 2's byte rule. Pass 2 (4/5): none.
  - Resolution: Story makes no paid call; live:image checks parsing only and has a free dry mode; unit cases for timeout, redaction and config; module named `generation/meta-image.ts`.
- **As a** developer, **I want** a server-only client for Meta's image generation and edit endpoints, plus a fake Meta for tests and an opt-in live check, **so that** the tool can call Meta and every routine test runs without paid calls.
- **Dependencies:** None
- **Acceptance criteria:**
  - [x] **Client.** `apps/api/src/generation/meta-image.ts`, exported through `generation/index.ts`, provides `createMetaImageClient({ apiKey, baseUrl, timeoutMs?, fetch? })` with `generate(request, signal)` and `edit(request, signal)`. The spec gives provider adapters to the `generation` domain. It owns no SQL yet and imports no peer domain, which the existing `generation-no-peers` and `domains-no-composition` rules enforce.
    - The request types follow Meta's documented fields: `prompt`; `n` (1–10); `size` (`"WxH"` or `"auto"`); `outputFormat` (`webp`, `png` or `jpeg`); `reasoningStrength` (`high` or `low`); `tools` (`imageSearch`, `webSearch`, `shell`); and for `edit`, `images` (1–10 items, each `{ dataUrl }` or `{ url }`). Each is validated before sending.
    - The client always asks for `response_format: b64_json`.
  - [x] **Results.** A success returns `{ images: { bytes, contentType }[], requestId, usage }`. `contentType` comes from `output_format` and is confirmed from the bytes' signature; a mismatch is an error.
  - [x] **Errors** map to a closed set:
    - `content_policy` for 400 `content_policy_violation`;
    - `invalid_request` for other 400s and 415, carrying Meta's `param` and no echoed input;
    - `unavailable` for 503, after one retry with backoff;
    - `failed` for 500, a network error or a malformed body;
    - `aborted` when the signal fires.
    - No error or log contains the key, the prompt, or image bytes.
  - [x] **Timeout.** The request has a 120 s limit by default (observed calls took about 10 s), and a timeout maps to `unavailable`. The caller's signal aborts it as `aborted`.
  - [x] **Config.** Production builds the client from the existing server-only `META_API_KEY` and `https://api.meta.ai/v1` in `loadServerConfig`. Tests pass a loopback `baseUrl` through the composition, as the chat provider does. The client lives under `apps/api/`, which the existing `browser-no-server` dependency rule keeps out of the browser bundle.
  - [x] **Fake Meta** (`apps/api/test/support/meta-image-fake.ts`):
    - serves both endpoints with the observed response shape;
    - returns test-built PNGs with Meta's XMP `iTXt` chunk at a chosen size;
    - records each request with its parsed body;
    - can script a refusal (400 `content_policy_violation`), a 503 then success, and a 500.
  - [ ] **Opt-in live check.** `pnpm live:image` (`scripts/live/image.mjs`) runs one prompt-only `generate` through the client against Meta. It reads the key only from the root `.env`, never prints it, and saves the sanitized response shape to `outputs/verification/`. It asserts that the response parses into at least one result with a PNG signature. The assistant byte rule is proven live by the `live:chat --live` step, which saves the image. No gate, hook or `pnpm test` script runs it.
- **Functional verification:**
  - [x] Unit tests drive the client against the fake Meta:
    - the request bodies match the documented field names for generate and edit;
    - two images come back as two results;
    - each error code maps as listed, including one retry on 503 and none on 500 or 400;
    - an aborted signal returns `aborted`, and a 50 ms `timeoutMs` against a fake that never answers returns `unavailable`;
    - a WebP body labelled `png` is refused;
    - with a sentinel key, prompt and image bytes, no error message or log line contains any of them.
  - [x] `pnpm live:image` runs in a dry mode against the fake Meta (no network, no cost), so the script is proven without a paid call. The config unit test checks the image client's base URL and that its key comes from `META_API_KEY`.
  - [x] An invalid `n` (0 or 11), a ratio beyond 16:1 and an eleventh input image are refused before any request (the fake records zero requests).
- **Regression verification:**
  - [x] `pnpm check` and the unit suite pass. `loadServerConfig` still refuses to start without `META_API_KEY`, covered by the existing config unit test.
  - [x] `pnpm live:chat` in its default scripted mode still passes; the shared composition change must not affect chat.
- **Editorial/design verification:** N/A — no visible change.
- **Manual-only behavior verification:** None. The story makes no paid call. The planning calls on 2026-11-02 recorded the real shapes the fake copies, and the paid run waits for completion, on Lou's request only.
- **Planned commits:**
  1. `Feat(api): Add the Meta image client`, covering the client, config wiring and unit tests.
  2. `Test(api): Add a fake Meta image server`
  3. `Test(api): Add an opt-in live image check`
- **Technical notes:**
  - Use `fetch` with `AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])`, and tell the two apart by which signal fired.
  - Base64 responses are about 4 MB, so read the body as text once and decode each item. Don't buffer twice.
  - Keep Meta field names inside the client; the rest of the app uses the camelCase request type.
  - Add the client to `TurnComposition` in `mastra/backend.ts` next to the chat model, so tests inject the fake the same way.

#### Story 2: Save generated images and read image inputs
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P1 read-workspace marker unverified; P2 migration constraint, built-in input, capacity timeout, migrations test; cross-story P1 media access didn't cover generated images; P1 stub decode claim wrong. Pass 2 (4/5): none.
  - Resolution: Marker dropped; one-source constraint with a database refusal case; built-in input and capacity-timeout cases; migrations test in the run; media access widened and tested; real decode stated.
- **As a** creator, **I want** images the agent makes to be checked and saved privately as my video's images, and my saved images to be usable as inputs, **so that** generated images are as safe as uploads and stay in my work.
- **Dependencies:** None (independent of Story 1)
- **Acceptance criteria:**
  - [x] **Byte rule.** `inspectMediaBytes` gains an `origin` of `upload` or `assistant`.
    - For `assistant` PNGs it also accepts at most one `iTXt` chunk, before the first `IDAT`, with keyword `XML:com.adobe.xmp`, compression flag 0 and data no larger than 4 KB.
    - Everything else stays refused, including any `iTXt` for uploads.
    - JPEG and video rules are unchanged.
  - [x] **Migration.** Assistant-made media can be stored without an upload record.
    - A new `artifacts.generated_objects` table holds the account, object key (unique), sha256, byte size and content type.
    - `media_objects` gains a reference to it. A check constraint requires exactly one source: an upload object or a generated object.
    - The upload chain and its constraints are unchanged for uploads.
    - `published/` keys are reused, and no fake `uploads` rows are created.
  - [x] **Save.** `saveGeneratedImage(account, video, { bytes, contentType, inputs })` in `apps/api/src/application/` (artifacts writes inside) does six things:
    - checks that the video is owned;
    - runs the media checker with origin `assistant`;
    - publishes the bytes to private storage;
    - in one transaction, creates a new image artifact at version 1 with `createdBy: 'assistant'`, provenance `assistant`, media facts and the input version ids as dependencies;
    - in the same transaction, creates the video's `reference` use with state `draft`;
    - returns `{ versionId, width, height }`. The tool (Story 3) takes the label, for example "Image 2 · Version 1", from read-workspace's naming of the saved image, since `application` can't import the agent's naming.
  - [x] **Refusals.** A check failure (`invalid_input` or `unsupported`) saves nothing and leaves no stored object, cleaning up anything published. A missing or foreign video is not-found. The decode sandbox's `capacity` answer is waited out with bounded retries (up to 30 s) instead of failing.
  - [x] **Input read.** `readImageInputs(account, video, versionIds)` in `apps/api/src/application/` returns each image as `{ versionId, dataUrl }`.
    - Only image versions this video uses (any use state) and this account owns, or built-ins, are returned.
    - The bytes are read from storage with the size cap, and the sha256 is checked against `media_objects`.
    - Any id that isn't one of those is not-found for the whole call, and nothing else is read.
  - [x] **Media access.** The `media` operation (`createMediaAccess`) and the input read both resolve assistant-made images as well as uploads, so the browser can show them and they can be used as edit inputs.
  - [x] **Workspace.** After a save, the workspace read lists the image in `assets` as a draft.
- **Functional verification:**
  - [x] Unit tests for `inspectMediaBytes`:
    - an assistant PNG with one XMP `iTXt` passes;
    - the same bytes as an upload are refused;
    - two `iTXt` chunks, a non-XMP keyword, a compressed chunk, or one over 4 KB are refused;
    - an `iTXt` after `IDAT` is refused.
  - [x] Cases for the save and input read with a wrapped checker and storage, in the same integration run (the save needs the database):
    - **checker busy:** a decode that answers `capacity` once and then succeeds saves once; one that stays busy past the wait bound fails with a readable error and saves nothing;
    - **tampered bytes:** stored bytes whose sha256 differs from the record give an error, not a data URL.
  - [x] Integration cases in a new `describe` in `apps/api/test/integration/image-upload.test.ts`, with real storage and the real decode:
    - **save:** one artifact at version 1, `created_by = 'assistant'`, provenance `assistant`, a `draft` reference use, one stored object whose sha256 matches, the workspace lists it, and the `media` operation returns a signed URL for it. A `media_objects` row with both sources, or neither, is refused by the database;
    - **refused bytes:** a PNG with a `tEXt` chunk leaves zero versions, uses and stored objects;
    - **foreign video:** not-found and nothing written;
    - **input read:** returns the exact bytes for an uploaded image, a generated image and a built-in image this video uses;
    - **foreign input:** an id owned by another account, or by another video of the same account, is not-found.
- **Regression verification:**
  - [x] The existing `image-upload.test.ts` and upload unit tests pass in the same targeted run: human uploads keep provenance `upload`, the strict PNG rule and the upload chain.
  - [x] `apps/api/test/integration/migrations.test.ts` passes in the same run.
  - [x] `pnpm check` passes, including the migration lint and dependency-cruiser. The new application functions import no agent or Mastra code.
- **Editorial/design verification:** N/A — no visible change.
- **Manual-only behavior verification:** N/A
- **Planned commits:**
  1. `Feat(artifacts): Accept the AI label on images`, the byte rule and its unit tests.
  2. `Feat(artifacts): Save assistant-made images`, the migration, the save function and its integration cases.
  3. `Feat(artifacts): Read owned images as inputs`, the input read and its cases.
- **Technical notes:**
  - Reuse `publishVersion` by widening its media type to allow `createdBy: 'assistant'` with provenance `assistant`. Don't add a parallel writer.
  - Use one object key per image (`published/<generated-id>/<generated-id>`) with put-if-absent, as uploads do.
  - Widen the media access join to both sources once, and use it for both the `media` operation and the input read. Add the video-use check from read-workspace's `workspaceItem` for inputs.

#### Story 3: Generate-image tool
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P1 partial saves, refusals and model messages unverified; P1 Stop not an AC; P2 size over 4096, partial-save summary, collaborator name. Pass 2 (4/5): P2 stub-decode wording; P2 failed-check line and two model messages unasserted.
  - Resolution: Stop AC added; unit tests of `execute` cover partial save, every refusal line and message, and Stop; size guidance documented; names aligned; wording fixed.
- **As a** creator, **I want** to ask the agent for an image, optionally based on my saved images, **so that** it makes and saves the image without me leaving the chat.
- **Dependencies:** Stories 1 and 2
- **Acceptance criteria:**
  - [x] **Tool.** A `generate-image` tool lives in `apps/api/src/agent/tools/generate-image/` and is registered in the production tool list. Its input has no nullable fields; omitted optional fields take the defaults below.
    - `prompt`: text, required.
    - `inputImages`: a list of 0–10 image version ids from read-workspace, default empty. Empty calls generate; one or more calls edit.
    - `count`: 1–10, default 1.
    - `size`: `"auto"` or `"WxH"` within Meta's ratio limit, default `"auto"`. The description says it sets the shape, not exact pixels, and to keep the long side at 2048 or less. An image Meta returns over 4096 px fails the checks and is refused like any other failed image.
    - `reasoning`: `high` or `low`, default `high`.
    - `imageSearch`, `webSearch`, `shell`: booleans, default `true` (Meta's defaults).
    - `showInChat`: boolean, default `false`. The description tells the agent to set it when the user asked for an image directly.
    - The tool always requests PNG.
  - [x] **Flow.** The tool does five things in order:
    - resolves `inputImages` through `readImageInputs`;
    - calls the client's `generate` or `edit` with the run's abort signal;
    - saves each returned image through `saveGeneratedImage`, with the inputs as dependencies;
    - returns `{ images: [{ versionId, label, width, height }], showInChat }` to the model;
    - never puts base64 in the result, history or logs.
  - [x] **Tool line.**
    - The phrase is "Making an image…", or "Making 3 images…" when `count` is above 1.
    - The done summary is "Saved Image 2 · Version 1", or "Saved 3 images".
    - Refusals end the line as done with no prompt text:
      - "Not made: the request was refused" (content policy);
      - "Not made: an input image wasn't found";
      - "Not made: Meta is unavailable" (`unavailable` or `failed`);
      - "Not saved: the image didn't pass checks";
      - "Not made: the request wasn't valid", with Meta's `param` in the model message only.
  - [x] **Model messages.** Each refusal returns a short message the model follows:
    - for content policy, rephrase or ask the user;
    - for a missing input, call read-workspace and use an image id it lists;
    - for unavailable, tell the user and don't retry more than once.
  - [x] **Partial saves.** If Meta returns several images and one fails checks, the others are saved, the summary reads "Saved 1 of 2 images", and the model result lists the saved ids and the failed count.
  - [x] **Stop.** When the run's signal aborts during a generation, the client call ends as `aborted`, nothing is saved from a response that arrives later, and images already saved before the abort stay. The line ends as incomplete through the existing Stop handling. No copy claims Meta stopped or didn't charge.
  - [x] **Description.** It carries the prompt guidance adapted from `~/projects/animation-studio/.pi/skills/generate-image/references/prompt-preparation.md`: the brief, one visible moment, the compact block prompt, and draft-critique-simplify. It drops that skill's OpenAI provider, approval gate and file workflow.
  - [x] **Scope.** The only model-supplied ids are `inputImages`, and they resolve through `readImageInputs`. Account and video come only from the run.
- **Functional verification:**
  - [x] Integration cases in `apps/api/test/integration/tool-activity.test.ts`, each driving a scripted `generate-image` call through a real turn with the fake Meta, storage and the real decode from the stack:
    - **generate with options:** `count: 2`, `size: "1536x1024"`, `reasoning: "low"` and all three tools `false` reach the fake's generations request as `n: 2`, `size`, `reasoning_strength: "low"`, the matching `tool_enablement` and `output_format: png`. Two images are saved; the line shows "Making 2 images…" then "Saved 2 images"; and the next model request's tool result holds both version ids and no base64;
    - **edit:** with an image the video uses as input and the other fields omitted, the fake receives an edits request with Meta's defaults and one image that is a `data:image/png;base64` URL of the exact stored bytes. The saved image lists that input as a dependency, and the line ends "Saved Image 2 · Version 1";
    - **foreign input:** an image id from another account or another video gives "Not made: an input image wasn't found", and the fake records zero requests;
    - **content policy:** gives the refusal line and saves nothing.
    - The 503 retry is proven in Story 1's unit tests, and the failed-check save in Story 2's cases; the tool's own line and messages for those paths are in the unit tests below.
  - [x] Unit tests of the tool's `execute` with fake collaborators (no stack), for the paths that don't need a real turn:
    - **partial save:** two images, one refused by checks, give "Saved 1 of 2 images" and a result with one id and one failure;
    - **refusal mapping:** content policy, a missing input, `unavailable`, `failed`, `invalid_request` and a failed check each give their line text and model message (content policy says rephrase or ask the user; a missing input says call read-workspace), and Meta's `param` appears only in the model message;
    - **Stop:** an abort during the client call saves nothing, and an abort after the first of two saves keeps one image and saves no second.
  - [x] `pnpm live:chat` gains a generate-image step. In the default scripted mode it runs against the fake Meta at no cost; in `--live` mode it runs only on Lou's request.
- **Regression verification:**
  - [x] The existing `tool-activity.test.ts` cases (read-workspace, update-script, history redaction) pass in the same targeted run.
  - [x] `pnpm live:chat` (scripted) passes every existing step.
- **Editorial/design verification:** Review the tool description against the prompt-preparation sections it adapts, and record what was kept and dropped in the PR. There is no prose test.
- **Manual-only behavior verification:** N/A
- **Planned commits:**
  1. `Feat(agent): Add the generate-image tool`, covering the tool, registration, collaborators and integration cases.
  2. `Test(agent): Add a generate-image live step`
- **Technical notes:**
  - Collaborators gain `images` (the Story 1 client's `generate` and `edit`), `readImageInputs` and `saveGeneratedImage`, wired in `mastra/backend.ts`. The tool imports no application or Mastra internals.
  - Validate `size` with `^(auto|\d{2,5}x\d{2,5})$` and a ratio of 16 or less. The tool doesn't pass `webp`.
  - Save images one at a time in Meta's order, so labels are numbered in order and the decode sandbox isn't contended.

#### Story 4: Image in the chat
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P2 filter vs refuse unclear; P2 failure copy, viewer and reserved box unverified. Pass 2 (4/5): P2 manual review step lacked a pass condition.
  - Resolution: Projection filters and validator refuses, each unit-tested; journey checks viewer and preset size; failure copy is a recorded manual step with a pass condition.
- **As a** creator who asked for an image, **I want** to see it in the chat under the tool line, **so that** I don't have to open Assets to see what the agent made.
- **Dependencies:** Story 3
- **Acceptance criteria:**
  - [x] **Projection.** The tool registry gains an optional `shownImages(output)` hook. `generate-image` returns the saved version ids when `showInChat` is true, and nothing otherwise.
    - `projectToolActivity` filters: it adds `images: string[]` to a done activity, keeping only UUIDs and at most 10, both live and in saved history.
    - `isToolActivity` refuses: an activity whose `images` isn't an array of at most 10 UUIDs is invalid, like any other unknown shape. `withActivity` copies the field and nothing more.
  - [x] **Rendering.** Under a done "Saved …" line the chat shows each image.
    - Each image is fetched through the owned-image read: `useOwnedImage` with the version from the workspace assets, or the `version` operation when the workspace hasn't refreshed yet.
    - Each image is 240px tall at most, keeps its aspect ratio and has `--radius-lg`.
    - The alt text is the label, for example "Image 2 · Version 1".
    - Clicking opens the existing media viewer.
    - While loading, the image's space is held. A failed read shows "This image couldn't be shown", and the line stays.
  - [x] **No image.** A line with `showInChat` false, or a refusal, shows no image.
  - [x] **Design.**
    - An inert preview `docs/design/chat-states/generated-image.html`, at 1440 and 390, shows the done line with one image and with two.
    - It is approved under Lou's delegation (as Sprint 006's chat states were), and Lou ratifies it at QA.
    - `docs/design/design.md` gains the treatment under Activity lines.
- **Functional verification:**
  - [x] One browser journey in `test/e2e/chat.spec.ts`. A scripted turn calls `generate-image` with `showInChat: true` against the fake Meta. Pass:
    - the line reads "Saved Image 1 · Version 1";
    - an image with that alt text is visible under it, with natural width greater than 0;
    - without a reload, the Assets tab lists "Image · Version 1";
    - after reload, the saved message shows the same image under the line.
    - A second scripted call with `showInChat: false` shows its line and no image.
  - [x] Unit tests:
    - `projectToolActivity` drops a non-UUID and an eleventh id;
    - `isToolActivity` accepts up to 10 UUIDs and refuses a non-UUID, an eleventh id or an extra key.
  - [ ] In the same journey, clicking the chat image opens the media viewer, and before the image loads its `img` already has the version's width and height attributes, so the thread's follow-to-bottom isn't thrown off.
  - [x] Not automated, by budget (manual-only, below): the "This image couldn't be shown" failure copy.
- **Regression verification:**
  - [x] `test/e2e/chat.spec.ts` and `test/e2e/navigation.spec.ts` pass in the same targeted run: tool lines, history after reload, follow-to-bottom and the reply dot.
  - [x] The existing native-activity unit tests pass.
- **Editorial/design verification:** Check the preview against design.md's activity-line and media-tile rules, and record the result in the PR. Lou ratifies at QA.
- **Manual-only behavior verification:** On the story's targeted browser stack, block the `media` read for the chat image (Playwright `page.route` returning 404 for that request) in a one-off run, recorded in the PR. Pass: the line stays, and "This image couldn't be shown" appears where the image was.
- **Planned commits:**
  1. `Feat(agent): Project shown images on tool lines`
  2. `Feat(web): Show generated images in the chat`, covering rendering, the journey, the preview and design.md.
- **Technical notes:** The thread follows to the bottom on DOM changes (PR #84). An image that loads later changes height without a DOM change, so give each image its box from the version's media width and height before it loads.

#### Story 5: Images in the Assets tab
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P2 placeholders and alt text unspecified. Pass 2 (4/5): P2 manual review step lacked a pass condition.
  - Resolution: Key image is `alt=""`; failed-read fallback is a recorded manual step with a pass condition.
- **As a** creator, **I want** each image in Assets to show the picture, **so that** I can tell my images apart without opening each one.
- **Dependencies:** None (independent of Stories 1–4)
- **Acceptance criteria:**
  - [x] **Key image.** Each image row in the Assets tab shows a 56px key image, as specified for Item rows in design.md. It is cropped to cover with `--radius-md` and fetched through `useOwnedImage`, instead of the "Image" placeholder. It is decorative (`alt=""`), so the row's accessible name doesn't change.
    - Video rows keep their placeholder.
    - A failed read keeps the placeholder text.
  - [x] **Unchanged.** Clicking a row opens the existing media viewer.
- **Functional verification:**
  - [x] One added assertion in the existing image-upload journey in `test/e2e/uploads.spec.ts`, with no new journey: after the upload, its Assets row holds an image with natural width greater than 0, and the row's accessible name still contains "Image · Version 1".
  - [x] Not automated, by budget (manual-only, below): a failed read keeping the placeholder. Video rows keep the existing placeholder code unchanged.
- **Regression verification:**
  - [x] `test/e2e/uploads.spec.ts` and `test/e2e/library.spec.ts` pass in the same targeted run: the upload receipt, Library reuse and the media viewer.
- **Editorial/design verification:** The row matches design.md's Item rows (56px key image, name, type line, status pill).
- **Manual-only behavior verification:** In a one-off run of the upload journey, block the row image's `media` read (Playwright `page.route` returning 404), recorded in the PR. Pass: the row shows the "Image" placeholder and still opens the media viewer.
- **Planned commits:**
  1. `Feat(web): Show images in Assets rows`
- **Technical notes:** `useOwnedImage` needs the full `Version`, which the workspace assets already carry. Reuse it and don't add a thumbnail endpoint.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [x] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [x] Fold the agent image flow into spec §8.3 (cross-referenced from §8.2) before the deep gate. Record the generated-objects storage and the assistant XMP allowance in §4's `storage` and `artifacts` rows and the upload-confirmation contract row (`POST /uploads/:id/confirm`), and correct the `generation` and `storage` rows' sprint numbers to the new order.
- [x] Run the applicable regression suite on the combined sprint branch: the deep gate (Tests requiring extra consideration, item 5).
  - Audit moderates stay the existing B-004/B-008 non-pass.
  - While a QA host holds 4179/4180, use `WORKPRINT_PREVIEW_PORT=4185`.
- [x] Run any planned cross-story checks not covered by that suite:
  - [ ] Only if Lou asks: `pnpm live:image`, then `pnpm live:chat --live`.
    - Pass for the chat run: Muse Spark calls `generate-image` with valid arguments, and the image is saved and listed by the workspace read. One rephrase is allowed.
    - If Lou doesn't ask, record both as not run. They are optional and don't block `🟢 Complete`; the QA build stands in for them.
  - [x] Then a QA build for Lou (web 4179, API 4180, live Muse Spark and live Meta images), so Lou can ask for an image and a follow-up edit.
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

- **Outcome:** goal achieved in the scripted build. Every story AC is met except Story 1's opt-in live check, which stays unchecked only for its optional paid run; the checklist says that run doesn't block 🟢. Each story merged into `sprint-008` after an independent reasoning-model review of its final head reached at least 4/5 with no open P0/P1. The verdicts come from the orchestrator's review runs and are not posted on the PRs:
  - Story 1, #85 (Meta image client).
  - Story 2, #86 (save generated images and read inputs).
  - Story 3, #87 (generate-image tool).
  - Story 5, #88 (Assets key images).
  - Story 4, #89 (image in the chat): 5/5 after two fix rounds. The first review found that every chat and Assets image was read again and blanked on each workspace refresh, and `useOwnedImage` now keeps one object per version id. Its positive control fails without the fix.
- **Combined-branch verification:** deep gate at `9d611b3` (`.checks/regression.sh --tier=deep`, 238 s): PASS.
  - Results: unit 165/165, tooling 6/6, integration 110/110, browser 28/28. The chat flake seen once in Story 4 did not recur.
  - Audit is NON-PASS, as approved: the same 2 moderate advisories, `@hono/node-server` GHSA-rmxm-3fg6-px4f (B-004) and `minimatch` GHSA-g3hv-75wg-m249 (B-008). There are no high or critical advisories.
  - Logs: `outputs/verification/sprint-008/deep-9d611b3/`.
  - `9d611b3` is the code of `sprint-008` at `786d2e5` plus the spec fold. The `main` pre-merge gate runs deep again on the final head.
- **Manual-only steps, recorded in the story PRs:**
  - "This image couldn’t be shown": a 404 on the chat image's media read (#89). Pass.
  - The Assets row placeholder on a failed read (#88). Pass.
- **Not run (optional, not requested):** `pnpm live:image --live` and `pnpm live:chat --live`. Their dry and scripted modes passed (#85, #87). Live image shapes are not yet re-confirmed through the tool; the QA build stands in for them.
- **QA build for Lou:** running at `9d611b3`.
  - Web is http://127.0.0.1:4179 and the API is :4180, with live Muse Spark 1.3 and live Meta `muse-image-1.0` (paid calls).
  - Private loopback object storage and the pinned media decode sandbox are on, so uploads work too.
  - It uses a dedicated synthetic account. Its credentials are in the 0600 file `outputs/qa/sprint-008/9d611b37084e/credentials.json`.
  - Stop it with `node outputs/qa/sprint-008/9d611b37084e/stop.mjs`. It expires after 8 hours.
  - Lou ratifies the Story 4 chat-image design at QA.
- **Deviations, recorded:**
  - **Story 1:** the fake ships with the client, so two commits instead of three.
  - **Story 2:**
    - The save returns no label; the tool takes "Image N · Version 1" from read-workspace, because `application` can't import its naming.
    - The busy-checker and tampered-bytes cases are integration cases, not unit cases.
    - Two commits instead of three: the save and the read share their integration setup.
  - **Story 4:** the `img` element appears once its private bytes are ready. Before that, a box sized from the version's width and height holds the space. So the Functional item "before the image loads its `img` already has the width and height" is left unchecked: it is met by the box, not the element.
- **Pending:** Lou's QA, including ratifying the Story 4 chat-image design.
- **Unresolved issues, accepted:**
  - Stop ends our request but cannot cancel the generation or its charge at Meta (B-029). Nothing from a late response is saved (Lou, by design).
  - A publish that fails after the storage write can leave an orphaned object if the removal fails too; the save reports it.
  - Story 4 accepted P2s:
    - a 240×240 placeholder until the version is known;
    - no automated pre-load box check;
    - the UUID pattern, the limit of 10 and the "Image N" ordinal are duplicated between the server and the browser.
  - Story 3 open P2s from the #87 re-review:
    - the count cap past Meta's returned images is untested;
    - the label fallback and the phrase bound are untested;
    - the no-null schema check lacks a positive control.
  - Deleting generated images is B-037.
- **Review:** completion records, pending the resulting-head review. The sprint-integration PR is reviewed on its own head.
- **Spec/flow changes:** the agent image flow is folded into §8.3, with a cross-reference from §8.2. The generated-objects storage and the assistant XMP allowance are in §4's `artifacts` and `storage` rows and the upload-confirm row. The `generation`, `storage`, `model-catalog` and §5 qualification sprint numbers follow the new order.
- **QA follow-up (Lou's QA at `9d611b3`, 2026-11-02):** generating, Assets and editing worked. Four issues were fixed in two PRs into `sprint-008`, each reviewed at 4/5 or better with no open P0/P1:
  - **"Image service unavailable" on three images**, and **a third image not shown, none after a refresh:** server storage and browser reads both refused past two at once, and every image, including those in the hidden Assets panel, loaded together. Fixed in #92: bounded queues on both sides, lazy loading near view and one shared copy per version per session. The upload confirm now waits out a busy checker, which closes the accepted issue above.
  - **Draft badge in Assets:** images and videos show no status pill until they can be approved or chosen (#92, `design.md`).
  - **Everything "Version 1":** an edit of one image is now its next version, with history in the Assets viewer. Variations stay separate images until the looks picker (Sprint 012). Fixed in #93.
  - **Also in #92:** chat and Assets use one name per image, a server that can't save images makes no paid call, a repeated input is read once, the Meta fetch refuses redirects and oversized bodies, and the flaky pending-dot journey that failed #91's deep pre-merge waits for the hold.
  - **Backlog, after video generation (Lou):** small previews (B-038) and caching across reloads (B-039).
- **New Dependencies:** None.
