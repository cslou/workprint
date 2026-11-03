# Sprint 013 — Join clips

**Date:** 2026-11-03 planning, starting from `main` after Sprint 012 merged (#141) – End after completion gates and Lou's QA
**Goal:** In a local build, a signed-in user asks the agent to join saved clips, for example a storyboard's Shot videos in Shot order.
- The agent calls join-videos with the clips' exact versionIds in the order asked.
- A new draft video is saved. It plays in the chat and in the Videos tab: the clips' pictures, unchanged and in that order, each with its own sound in step.
- The original clips are unchanged.
- Clips that don't share a codec, size and frame rate are refused with one plain message naming the clip and the difference, and nothing is saved.

**Status:** 🔵 In Progress; both stories merged into `sprint-013` and the completion gates passed. Lou's QA is still open.

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`.
  - Branch `sprint-013` was cut from `main` at `6410c63` (Sprint 012, #141) and holds this plan. Story branches come from `sprint-013`, and the sprint PR targets `main`.
  - Lou approved this two-story plan on 2026-11-03 ("go ahead"), after asking to keep the tool simple. Merging into `main` waits for his QA and his merge command.
- **Tech stack:** as Sprint 012.
  - The media sandbox (`apps/api/src/storage/media/`) runs the pinned FFmpeg n8.1.3 toolchain in one throwaway Docker container per job: no network, read-only, 768 MiB of memory, 1 CPU and a 30 s deadline. It has a fixed argv and no shell.
  - That toolchain has the concat demuxer, the `concat`, `atrim`, `apad` and `aresample` filters and the native `aac` encoder (checked 2026-11-03). Its H.264 encoder makes only Constrained Baseline, so re-encoding the picture isn't an option.
- **Current state:**
  - **Media sandbox.** `createMediaSandbox().use(input, work)` takes one input, bind-mounted read-only at `/input.bin`. A session can only `probe()`, `decode()` and `poster()`.
    - One job runs at a time. A second job is refused with `capacity`, and `verifyWhenFree` waits for its turn.
    - The only file a job writes is the poster, capped by `fsize` at 8 MiB (`sandbox-config.ts`).
    - Child output is capped at 64 KiB (`child.ts`).
  - **Saved clips.** Generated clips and Shot videos are saved by `createGeneratedVideos().save` (`artifacts/generated-videos.ts`):
    - the bytes are checked by the media verifier (probe, full decode and poster);
    - the clip and its poster are stored privately;
    - the clip is saved as a draft with `frames` as its dependencies.
    - `frames` can only be images.
    - Uploaded videos are saved by the upload path, with the same checks.
  - **The video check refuses more than 120 s** or 7,200 frames (`artifacts/uploads/media-probe.ts`), for uploads and assistant clips alike, and wants the audio within one frame of the picture.
  - **The clips themselves.** Four independent MiniMax-H3 768P clips were probed (2026-11-03, the Sprint 009 live clip and the Sprint 011–012 paid tests kept in the session scratchpad). All are H.264 High at 24 fps, with AAC-LC at 32 kHz stereo, and each one's AAC starts with a 1,024-sample priming packet (`skip_samples=1024`).
    - The three 16:9 clips (prompt-only, and two reference-to-video runs) are 1344×768, level 3.2, with the same codec configuration (SPS/PPS hash `eae0cee…`). So independently made 16:9 clips join.
    - The first/last-frame Shot clip from Sprint 011 is 1152×768, level 3.1, with a different configuration. It would be refused.
  - **Listing.** read-workspace lists every clip as an item, with use `generated video` or `shot video`, its name (for example "Shot 1 · Video · Version 2"), its state and its length.
  - **System prompt.** The static `systemPrompt` (`agent/mastra/native-turns.ts`) has five steps that end at Shot videos.
- **Spike (2026-11-03, pinned toolchain).**
  - The command: `-copyts -auto_convert 0 -f concat` over an `ffconcat` list giving each clip's picture length, video `-c copy`; each clip's audio `apad,atrim=end=<its picture length>`, joined by the `concat` filter and encoded once as AAC.
  - The three independent 16:9 clips joined to exactly 18.333333 s of picture (5.166667 + 6.583333 + 6.583333) and 18.334 s of audio, both starting at 0, and decoded with no error.
  - On the Sprint 009 clip and its cut, the video packets came out byte-identical to the inputs' in order. Without `auto_convert 0`, the first keyframe gained 39 bytes; without `-copyts`, the video started 31 ms after the audio.
  - A 124 s join decoded in 3.3 s with one thread at the sandbox's limits.
- **Implementation spec:** `docs/specs/implementation-spec-001.md`. The relevant parts are §8.3 Videos, §10's agent tool guidance and Production bullet, the Phase 3 packaging table (013 is Join clips), and the reuse-map row for `assemble-video` (its stream-copy rule; this sprint does not copy its approval digests or reports).

### Sprint-Wide Context
- **Sprint type:** Feature
- **Shared context:**
  - **Decisions (Lou, 2026-11-03: "Lets not overengineer at this stage. Try to keep the tool simple"; plan approved with "go ahead"):**
    - **Picture is copied, never re-encoded.** Clips join only when each has one H.264 4:2:0 video stream first and at most one sound track (no other streams), with the same profile, level, size, frame rate, time base and codec configuration as clip 1. Otherwise the join is refused with one message, for example "Clip 3 is 768×1344; clip 1 is 1344×768." Nothing is converted to make clips fit.
    - **Sound is re-encoded once, in step.** Copying MiniMax's primed AAC would add 32 ms of drift at each join. So each clip's audio is padded or trimmed to exactly its picture length (silence for a clip without audio) and encoded once as AAC-LC at clip 1's sample rate and channels (32 kHz stereo when clip 1 has none). If no clip has audio, the joined video has none. A different sample rate or channel count, or no sound, never makes a later clip incompatible. A clip with more than one sound track is refused, and so is clip 1 when its sound can't be encoded as AAC-LC (a rate off the list, or more than 2 channels) (review finding).
    - **Check:** the joined file goes through the same video check as every saved clip (probe, full decode, poster), and its picture length must be the clips' lengths added up, within one frame. No frame-by-frame comparison.
    - **Limits:** 2 to 20 distinct clips, at most 120 s together (the video check's own limit) and at most 100 MB of saved clips (the sandbox's job limit, a Story 2 review finding; Lou: "we can deal with the limit later").
    - **What can be joined:** video versions this video uses: generated clips, each Shot video version that still has a use (its chosen and its latest), and videos among its assets. Uploads are image-only today, so in practice these are generated clips and Shot videos (Story 2 finding).
    - **What a join saves:** one new draft generated clip (`purpose: 'video'`, made by the assistant), whose dependencies are the joined versions in order. It shows in Videos' Generated videos list and, with `showInChat`, in the chat. It is never approval, never changes a Shot's chosen video, and is not export (B-009).
    - **Free, no yes, no job record.** Joining makes no paid call. It runs inside the tool call, in seconds; Stop ends it and nothing is saved.
  - **Identity rule (spec §10 agent tool guidance):** every clip id comes from model arguments, so each must resolve, through an application function and an account- and video-scoped read, to an exact video version this video uses. A foreign, missing or non-video id is not-found and nothing is joined. Tests use a foreign account's clip id.
  - **Fixtures.** Tests use the existing `minimax-clip.mp4` (4.041667 s, 97 frames, with audio) and two fixtures derived from it with the pinned toolchain, with their commands in `apps/api/test/support/fixtures/README.md`:
    - `minimax-clip-silent.mp4`: its video only, by stream copy (compatible, no audio);
    - `minimax-clip-small.mp4`: re-encoded at 672×384 with square pixels and `+faststart`, so it passes the upload rules (Constrained Baseline, AAC-LC) and can be saved as an upload, but is incompatible.
- **Non-goals:**
  - Re-encoding, scaling, frame-rate conversion, trims, transitions or titles of the picture.
  - Longer joins than 120 s (later, with the video check's limit).
  - A frame-by-frame proof of the output, approval digests or assembly reports (the `assemble-video` skill's extras).
  - Export, download or publishing (B-009). Narration or voice tracks (B-044, B-045).
  - A Videos-tab editor for ordering clips; Shot video ids in read-workspace's storyboard listing.
  - A job record, resume or background joins.
  - The Sprint 012 refactors left for later (the 9-image cap in three places, a `NewVideo` / `VideoRequest` union, `ShotLength` / `PlanningEditor`'s shared save).
  - Paid calls: the stories make none.

### Affected Flows

- **Existing flows affected:**
  - Spec §8.3 Videos: a saved clip can be a join of other clips, listed under Generated videos.
  - The media sandbox (spec §4's `storage` module row): a second kind of bounded job.
  - §10's agent tool guidance and Production bullet: a new tool and a sixth workflow step in the system prompt.
- **New flows introduced:** The agent joins saved clips into a new video (join-videos), in the chat.

### Verification Strategy

For executable behavior (code, config/scripts, and actual machine-consumed contracts or workflows), define functional and relevant regression proof before implementation. Policy/workflow prose alone is not proof of executable behavior. For descriptive-only docs/design prose, record functional and regression N/A with rationale and use editorial review for accuracy/completeness/consistency. Do not add persistent prose/heading assertion suites. Keep applicable existing checks and design visual/safety/consistency/approval checks under the design skill.

Verification has two categories:

- **Functional verification:** proof of executable behavior introduced or changed by this sprint, or justified N/A for descriptive-only work.
- **Regression verification:** proof of relevant existing behavior, or justified N/A for descriptive-only work.

Each implementation story must include:

- Functional verification for executable behavior it delivers, or justified N/A for descriptive-only scope.
- Targeted regression verification for existing behavior at risk, or justified N/A for descriptive-only scope.

At sprint completion, run the applicable regression suite on the combined sprint branch plus planned cross-story checks not covered by that suite. Do not rerun each story's checks separately when the suite already covers them. For descriptive-only work, use editorial review and applicable existing checks. Reusable functional checks become future regression checks; one-off editorial review is evidence, not a persistent suite.

- **This sprint's proof:**
  - Joining runs in the real sandbox with the pinned toolchain, in the integration tier. The test stack already starts Docker and verifies the toolchain.
  - The tool, its refusals and its save are checked with unit tests and scripted-model integration tests.
  - The user's path is checked by one step added to the Shot e2e journey.
- **Commands:** as Sprint 012. Integration and e2e run with `WORKPRINT_PREVIEW_PORT=4185`, and each story runs its targeted tests only.

### Tests requiring extra consideration

- **Sandbox joins in the integration tier** (`apps/api/test/integration/media-join.test.ts`, new): about 5 cases, one Docker job of a few seconds each. Only the real toolchain shows the copy, the sound and the refusals.
- **The Shot journey e2e** (`test/e2e/shots.spec.ts`) gains one join step after Shot 1's second video version, about 5–10 s. It is the only check that a joined video reaches the chat and Videos and plays.
- No new suite, container or toolchain.

### Stories
**Constraints:** Target 5-8 stories per sprint. Each story should be small enough to review, verify, and merge independently. Split stories that combine unrelated outcomes or cannot be verified with a clear functional/regression verification plan.

This sprint has two stories, at Lou's request to keep it simple (2026-11-03). B-020 is one small item: Story 1 is the media job, and Story 2 is everything the agent and the user see.

#### Story 1: Join clips in the media sandbox
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1 on the four-story draft (2/5) is superseded by Lou's two-story rewrite; its 120 s verifier-cap and clip-compatibility P1s were resolved by the cap and the probe of four real clips. Pass 2 (2/5): no source for the codec configuration (P1); `use` regressions after the shared lifecycle, the 20-clip bound, the whitelist and `-safe 0`, and a test file spanning two modules. Pass 3 (4/5): the audio layout and rate must not be probe text; where the output file lives; the probe whitelist wording.
  - Resolution: the join's probe adds `-show_data_hash` for `extradata_hash` and `level`; a capacity case, the poster `fsize` assertion, a 20-clip argv case and a 20-copy real join; the whitelist and list notes; unit tests split between `storage` and `artifacts`; fixed `mono`/`stereo` names and an allowed-rate check refused before Docker; the output is a pre-created mounted host file read back with the poster's checks.
- **As a** maintainer, **I want** the media sandbox to join an ordered list of clips with one fixed ffmpeg command, **so that** joining is as bounded as every other media job.
- **Dependencies:** None
- **Acceptance criteria:**
  - [x] **One join job.** `createMediaJoiner(sandbox)` (beside `createMediaVerifier`) joins 2 to 20 clips, at most `MEDIA_JOB_BYTES` in total, and returns either `{ kind: 'joined', bytes, frames, lengthS }` or `{ kind: 'incompatible', clip, difference }` (clip is 1-based).
    - The sandbox gains a join job: the same container rules, deadline, identity checks and cleanup as `use`, with each clip mounted read-only at a fixed path. The output is a pre-created host file mounted like `/poster.png` and read back with the poster's file checks (`O_NOFOLLOW`, one link, at most `MAX_UPLOAD_VIDEO_BYTES`). The join container's process-wide `fsize` limit is `MAX_UPLOAD_VIDEO_BYTES`.
    - It shares the one-job-at-a-time rule with `use`, so a join while another job runs is refused with `capacity`.
    - Fewer than 2 clips, more than 20, or too many bytes are refused before Docker is called.
  - [x] **Compatibility first.** Each clip is probed inside the job with the join's own probe arguments, which add `-show_data_hash sha256` so each stream carries `extradata_hash` (its SPS/PPS) and `level`. A clip without exactly one H.264 4:2:0 video stream first and at most one sound track, or whose video doesn't match clip 1's profile, level, size, frame rate, time base and `extradata_hash`, gives `incompatible` with a short difference, for example `768×1344; clip 1 is 1344×768`. Nothing is joined.
  - [x] **The join.** One fixed argv; no caller text reaches it.
    - Picture: `-copyts -auto_convert 0 -f concat` over an `ffconcat` list of the mounted paths, each with its measured picture length, and video `-c copy`.
    - Sound: each clip's audio, or silence for a clip without any, padded and trimmed to its picture length, joined, resampled to clip 1's rate and channels, and encoded once as AAC-LC. No audio stream when no clip has audio.
    - `+faststart` MP4.
  - [x] **The check.** The output's video frame count is the sum of the clips', and it decodes with no error. Otherwise the job fails and returns no bytes.
- **Functional verification:**
  - [x] Unit (`apps/api/test/unit/storage/media/join.test.ts`):
    - the join argv for 3 clips holds only fixed paths, fixed options and the measured lengths;
    - for 20 clips, the container and join argv stay within `runMediaChild`'s `CHILD_MAX_ARGS` (raised from 128 to 256 in review for per-input whitelists) and 4,096 characters per argument;
    - the poster job's container args still carry the 8 MiB `fsize`, and the join's carry `MAX_UPLOAD_VIDEO_BYTES`;
    - 1 clip, 21 clips, too many bytes, a sample rate off the AAC list and a channel count other than 1 or 2 are refused without calling Docker.
    - Pass: each case as stated.
  - [x] Unit (`apps/api/test/unit/artifacts/uploads/media-joiner.test.ts`, renamed in review): the compatibility comparison, from join-probe JSON with `extradata_hash` and `level`, accepts two MiniMax-shaped clips and names a size, a frame-rate and a codec-configuration difference. Pass: each case as stated.
  - [x] Integration (`apps/api/test/integration/media-join.test.ts`, real sandbox):
    - `minimax-clip.mp4`, `minimax-clip.mp4`, `minimax-clip-silent.mp4` give 291 frames and 12.125 s of picture within one frame, with AAC audio within one frame of the picture, and the output passes `createMediaVerifier` as an assistant video;
    - two silent clips give a video with no audio stream;
    - `minimax-clip-small.mp4` second gives `incompatible` at clip 2, naming the size;
    - 20 copies of `minimax-clip.mp4` (80.8 s) join within the job's 30 s deadline, with 1,940 frames;
    - a join while a `use` job runs is refused with `capacity`, and the `use` job still finishes;
    - an abort during the join rejects with `cancelled` and leaves no `workprint-media-*` container.
    - Pass: each case as stated.
- **Regression verification:**
  - [x] Single-input jobs still work: `image-upload.test.ts` and `artifact-writes.test.ts`. Pass: green.
- **Editorial/design verification:** Spec §4's `storage` module row gains the join job. N/A for design: no UI.
- **Manual-only behavior verification:** N/A
- **Planned commits:**
  1. Fixtures `minimax-clip-silent.mp4` and `minimax-clip-small.mp4`, with their commands in the fixtures README.
  2. The sandbox's join job and `createMediaJoiner`, with unit tests.
  3. The integration tests and spec §4's `storage` row.
- **Technical notes:**
  - Keep `use` unchanged; share its container lifecycle rather than copying it. Put the join argv beside `PROBE_ARGS` / `DECODE_ARGS` in `sandbox-config.ts`.
  - `storage` stays mechanical: the probe parsing and compatibility rule live with `createMediaVerifier` in `artifacts/uploads/`, which `storage` must not import.
  - The `ffconcat` list needs the probed lengths. Write it host-side into a pre-created file mounted read-only, the way the poster file is pre-created, before the join command runs. Its entries are the fixed mounted paths, so the join uses `-safe 0`, and its `-format_whitelist` is `concat,mov`. The join's probe uses `-format_whitelist mov`; `PROBE_ARGS` is unchanged.
  - Audio in the filter graph: `[N:a]aresample=<rate>,aformat=channel_layouts=<layout>,apad,atrim=end=<length>` for a clip with audio, `anullsrc=r=<rate>:cl=<layout>,atrim=end=<length>` for one without, then `concat=n=<count>:v=0:a=1`. The lengths are probed numbers; the rate must be an integer on the upload rules' AAC list, and the layout is the fixed name `mono` or `stereo` for 1 or 2 channels, never the probe's text. Anything else is refused before Docker.

#### Story 2: The join-videos tool
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 2 (2/5): a regression test that doesn't exist (P1); which Shot version to join; waiting on a busy sandbox; an oversize join. Pass 3 (4/5): none.
  - Resolution: `image-upload.test.ts`'s assistant-made clips block; "each Shot's chosen video, else its latest" in the prompt, the description and QA; a capacity-wait AC and unit case; an oversize join is `unavailable`, accepted.
- **As a** user, **I want** to ask the agent to join my clips, **so that** I can watch my Shots as one video in the chat and in Videos, with the originals kept.
- **Dependencies:** Story 1
- **Acceptance criteria:**
  - [x] **The tool.** `agent/tools/join-videos/` is registered in `productionTools`, with the activity line "Joining clips…".
    - Input: `clips`, 2 to 20 versionIds in order, and `showInChat`.
    - Its description says it joins saved clips from read-workspace, in the order given, into a new draft video and keeps the originals; that the clips must have matching video (size, frame rate and encoding), otherwise it says which clip differs; that together they may run at most 120 s; that it makes no paid call; and to set `showInChat` when the user asked for it directly.
  - [x] **Exact, owned clips.** `joinVideos` in `application/joins.ts` checks the ids before any bytes are read:
    - each must be a video version this video uses (a generated clip, a Shot video version with a use, a video asset); a foreign account's version, an image, or an unknown id is not found;
    - a version named twice is refused; their saved lengths over 120 s are refused, and so are their saved sizes over the sandbox's 100 MB job limit (review finding: checked before any bytes are read).
    - The join, like the check after it, waits its turn when the sandbox is busy (`capacity`), with the same 30 s `sandboxTurn` wait as `verifyWhenFree` (`joinWhenFree`).
  - [x] **The save.** Each clip's stored bytes are read privately, joined (Story 1), and saved by `createGeneratedVideos().save`, which gains a `joined` input: the clip ids, checked again in the save as videos this video uses (before its transaction, as frames are; the plan said inside it, changed in review: ownership can't change in between, and a clip that stops being used in that moment is the same narrow window frames already have), become the new version's dependencies in order. The normal video check runs, and the saved length must be the clips' lengths added up within one frame. It is a draft generated clip; the originals' versions, uses and chosen Shot videos are unchanged. A video with no use room is refused.
  - [x] **Results.** A join returns `made: true` with the versionId, length in seconds and clip count; the done line reads "Joined 2 clips", and with `showInChat` the chat shows the video like a generated clip. Every refusal returns `made: false` with one line that says nothing was saved; an incompatible clip names the clip and the difference. A sandbox, storage or check failure, including a joined file over `MAX_UPLOAD_VIDEO_BYTES`, is `unavailable`, logged without bytes (accepted: at 120 s a join is about 12 MB). A server without storage or the media sandbox has no joins, and the tool says videos can't be joined on this server; a clip whose stored object is missing is not found. Stop ends the turn as other tools do, and nothing is stored.
  - [x] **The system prompt** gains a sixth step: "6. When the user asks, join the Shot videos in Shot order into one video (join-videos): each Shot's chosen video, else its latest. Joining is free and needs no yes." The tool description gives the same rule. The prompt stays static: the same bytes on every turn and every video.
- **Functional verification:**
  - [x] Unit (`apps/api/test/unit/application/joins.test.ts` and `apps/api/test/unit/agent/tools/join-videos.test.ts`, fake collaborators): the input schema refuses 1 and 21 clips; each refusal (not found, repeated, too long, incompatible, no room, unavailable) maps to its result and message, and the joiner is never called for an id refusal; an aborted signal stores nothing; a joiner busy once (`capacity`) still joins; `shownMedia` is the clip only with `showInChat`. Pass: each case as stated.
  - [x] Integration (`tool-activity.test.ts`, a join-videos block, real database, storage and sandbox):
    - a scripted model joins two saved clips; the stream shows "Joining clips…" then "Joined 2 clips"; the new version's dependencies are the two ids in order, it is listed under Generated videos as a draft at 8.083 s within one frame, and both originals are unchanged;
    - a foreign account's clip id ends "Couldn't join those clips" with no new version or stored object;
    - a saved `minimax-clip-small.mp4` second is refused naming clip 2.
    - Pass: as stated.
  - [x] Integration (`agent-loop.test.ts`): the system prompt is byte-identical on two fresh videos and a second turn, with the new step. Pass: green.
  - [x] E2E (`shots.spec.ts` journey, after "Saved Shot 1 · Video · Version 2"): the scripted model makes one generated clip, then joins Shot 1's video (Version 2; Version 1 has no use once Version 2 took its draft use) and that clip with `showInChat`. The chat shows the joined video, Videos' Generated videos list has it at `0:08`, and its viewer plays (`currentTime` advances). Pass: as stated.
- **Regression verification:**
  - [x] Generated and Shot clip saves: `image-upload.test.ts` (the assistant-made clips block), `generation-jobs.test.ts` and `shot-video-choice.test.ts`. Pass: green.
  - [x] The other tools and the chat's clips: `tool-activity.test.ts` whole, `chat.spec.ts` video and poster tests, and `shots.spec.ts` whole. Pass: green.
- **Editorial/design verification:** Spec §8.3 Videos (a joined video, its dependencies, a draft, not export) and §10 (join-videos, its identity rule, the sixth step). `docs/design/design.md` Generated videos: a joined video is a row like any other.
- **Manual-only behavior verification:** N/A here; the live check is Lou's QA under Sprint Completion.
- **Planned commits:**
  1. Artifacts and application: private reads of a stored clip's bytes, `joined` in the clip save, and `joinVideos`, with unit tests and composition in `mastra/backend.ts`.
  2. The tool, its registration and the system prompt step, with unit tests.
  3. The tool-activity block, the e2e join step, spec §8.3/§10 and design.md.
- **Technical notes:**
  - `usedImageVersions` (`artifacts/workspace-images.ts`) is the pattern for the video equivalent, over `assets`, `generatedVideos` and each Shot's `candidateVideoVersions`.
  - The sandbox runs one job at a time: the join and then the check both wait their turn, as `verifyWhenFree` does.
  - Composition supplies the joiner; `application` must not import `storage` (AGENTS.md).
  - Reuse `video-shared.ts`'s `savedClip` for the shown clip. The fake MiniMax returns `minimax-clip.mp4` (4.041667 s) for every clip, so the journey's two versions are compatible and join to 8.08 s.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [x] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [x] Run the applicable regression suite on the combined sprint branch: the deep gate (`.checks/regression.sh --tier=deep`), with `WORKPRINT_PREVIEW_PORT=4185`.
- [x] Run any planned cross-story checks not covered by that suite: a read-only review of spec §4's `storage` row, §8.3 and §10 against the code, then the Phase 3 table's 013 row, the reuse-map row for `assemble-video`, and the module map rows for `storage/media` and the agent tools.
- [x] Record results and unresolved issues in a brief `## Final Review`.
- [ ] **Lou's QA** (manual, because whether the live model follows the sixth step can't be scripted; on a QA host when he asks, which makes live Muse Spark calls on his go):
  1. In a video whose Shots already have 16:9 videos (from Sprint 012's QA, or new Shot videos on his go), ask "join the Shots into one video". Pass: the agent calls join-videos with each Shot's chosen video (else its latest) in Shot order without asking for a yes, and the joined video plays as one in the chat and in Videos, each Shot's sound in step.
  2. In a Sprint 011 video, ask to join its 3:2 Shot video after a 16:9 one (or two Shot videos of different sizes). Pass: refused, naming the clip and the size, and nothing is saved.

For descriptive-only work, use editorial review and applicable existing checks. Preserve applicable design checks and approval gates. Failed, ambiguous, or unrun required checks remain non-pass.

### Rules
- Before authorized delivery, read canonical `docs/conventions/delivery-workflow.md` (resolved via AGENTS.md §12) for sprint branching, PRs and review/fix/merge mechanics; shared gates remain in AGENTS.md.
- Work through already-authorized stories sequentially, subject to explicit pause/no-merge instructions. Planning approval alone does not authorize implementation. After all implementation stories are complete, perform the Sprint Completion checklist.
- Only the orchestrator updates planning records. Every resulting head must pass verification and independent review before acceptance.
- After the Sprint Completion checklist passes, follow the delivery workflow for sprint integration and its explicit user merge command.
- Record new dependencies in `## Final Review`, or record `None` when no dependencies were added.
- Paid calls (Meta, MiniMax) only on Lou's go. This sprint plans none.

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

- **Outcome:** the goal is met in the scripted build. Every story's ACs and verification items are met, with the deviations below. Lou's live QA is still open (Sprint Completion above). Each story merged into `sprint-013` after an independent review of its final head scored at least 4/5 with no open P0 or P1:
  - Story 1, #143 (join clips in the media sandbox): 4/5 (P2s only), then two review-fix rounds, the last 4/5.
  - Story 2, #144 (the join-videos tool): one P1, then 4/5. The P1 was that the joined save's refusals were never tested against the real save; the tool-activity block now calls it directly.
- **Combined-branch verification:** the deep gate (`.checks/regression.sh --tier=deep`, 515 s, run `.checks/.logs/run-ashjkstf`) passed at `ec0b4ba`, the `sprint-013` head after Story 2.
  - Results: unit 298/298, tooling 6/6, integration 206/206, browser 34/34.
  - Audit is NON-PASS, as approved: the same 2 moderate advisories, `@hono/node-server` GHSA-rmxm-3fg6-px4f (B-004) and `minimatch` GHSA-g3hv-75wg-m249 (B-008). There are no high or critical advisories.
  - Logs: `outputs/verification/sprint-013/deep-ec0b4ba/`.
- **Cross-story checks:** a read-only review of spec §4, §8.3, §10, the reuse map, design.md and this doc against the code at `ec0b4ba` found one P1 and eight stale or imprecise statements. All were fixed in this completion PR:
  - the reuse-map row for `assemble-video` claimed its exact ordering, compatibility and decoded-verification rules were reused; it now says what was adapted and what wasn't (the sound is re-encoded, the output check is frames, decode and length, and the skill's extras aren't ported);
  - §4's `storage` row and this doc give the whole compatibility rule (one H.264 4:2:0 picture first, at most one sound track, clip 1's time base too) and the 100 MB job limit;
  - this doc no longer says sound never makes clips incompatible: two sound tracks, or clip 1's sound off the AAC list, are refused;
  - §8.3 names the "can't be joined on this server" and missing-object refusals and the length's rounding allowance; §10's 013 row gives the 100 MB limit;
  - Story 1's joiner result has `frames` and `lengthS`; Story 2's wait is `joinWhenFree` with the same `sandboxTurn` as the check, not one shared wait.
- **Real clips (Story 1, one-off, not committed):** the joiner joined three independent 16:9 MiniMax clips from Sprints 009 and 012 (18.33 s, passes the video check) and refused Sprint 011's 3:2 Shot clip after a 16:9 one: `1152×768; clip 1 is 1344×768`.
- **QA build for Lou:** not started. A QA host starts only when Lou asks, and it makes live Muse Spark calls; joining itself makes no paid call. Its pass items are in Sprint Completion above.
- **Deviations, recorded in the story PRs:**
  - **Story 1:**
    - commit `cf955f0`'s subject is 51 characters, accepted because history isn't rewritten after a PR opens;
    - each sound input carries its own protocol and format whitelist, so `CHILD_MAX_ARGS` rose from 128 to 256;
    - one AAC rate list, `VIDEO_AUDIO_RATES`, now lives in contracts for uploads and joins;
    - the output's length is checked within `verifyDecodedFrames`' 50 ms, with an exact frame count; Story 2's save checks it within one frame;
    - a docker command aborted by a job's own deadline now reports `deadline`, not `cancelled`, for every media job.
  - **Story 2:**
    - a Shot video version whose draft use moved on is not one the video uses, so "any Shot video version" means each Shot's chosen and latest, and the journey joins Shot 1's Version 2 with a generated clip instead of its Versions 1 and 2;
    - uploads are image-only, so the incompatible case saves `minimax-clip-small.mp4` as a generated clip, and Lou's QA step 2 uses a Sprint 011 3:2 Shot video;
    - the save re-checks the clips before its transaction, as frames are, not inside it as planned;
    - clips over 100 MB together are refused as too large before any bytes are read (review);
    - the image and video reads share one checked read, and the sandbox wait lives in `artifacts` (`joinWhenFree`, `sandboxTurn`).
- **Unresolved, for later:** the 120 s limit (Lou: "we can deal with the limit later"); a joined-plus-target save has no test of its own (the same refusal as joined-plus-frames).
