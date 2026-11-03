# Sprint 012 — Reference-to-video Shots and the workflow prompt

**Date:** 2026-11-03 planning, starting after Sprint 011's QA fixes merge (stacked on `sprint-011`) – End after completion gates and Lou's QA
**Goal:** In a local build, a signed-in user asks the agent to make a short video.
- The agent follows the workflow its system prompt sets out: script, then reference sheets, then a storyboard where every Shot has a length, then panels, then Shot videos. It shows the person each step before the next paid one.
- Each Shot's video is made with MiniMax's reference-to-video mode. The inputs are the sheet views of the subjects the Shot names, plus its panels as the framing guide, each labelled in the prompt. The clip is 16:9 and runs for the Shot's length.
- A Shot has a second panel only when its picture changes a lot, for example when the camera moves from one part of the room to another.
- A person sees and can change a Shot's length in "View storyboard".

**Status:** 🟡 Planned; Lou approved the plan on 2026-11-03. Not started.

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`.
  - Branch `sprint-012` is cut from `sprint-011` after Sprint 011's QA fixes (PR #130) merge, stacked as 011 was on 010. Story branches come from `sprint-012`.
  - Sprint 010 (PR #113 into `main`) and Sprint 011 (its integration PR into `sprint-010`) wait for Lou's merge command. Their later commits are merged into `sprint-012`.
- **Tech stack:** as Sprint 011.
  - MiniMax Video V2: `MiniMax-H3`, 768P, `POST /v2/video_generation`. Today the client sends only `first_frame` / `last_frame` images.
  - Meta images: `requestOneImage`, PNG, with `size` either `auto` or a shape `WxH`. Meta returns its own pixels for a shape, so asking for `1536x1024` gives 1920×1280.
  - Mastra on Muse Spark.
- **Current state (Sprint 011 plus its QA fixes):**
  - **Storyboard.**
    - Shot fields are `framing`, `action`, `dialogue`, `cameraNote` and `references`, all optional (`packages/contracts/src/shot-fields.ts:25-31`). They are additive to schema version 1, stored in `artifacts.versions.content`, and need no migration.
    - The agent gives a Shot 1–2 panels: `maxShotPanels = 2` (`apps/api/src/artifacts/assistant-storyboards.ts`) and the save-storyboard panel input `.max(2)`. A saved storyboard allows up to 100 panels per Shot (`saved-content.ts`), so a person's or a built-in Shot can have more.
    - People edit only the Shot intent and the panel descriptions: `storyboardEditSchema` (`models.ts:56`), `editedPlan` (`artifacts/storyboard.ts:25`) and `PlanningEditor` (`apps/web/src/storyboard/planning-editor.tsx`).
    - "View storyboard" is the detailed view (Sprint 011 QA fixes).
  - **Shot videos use frames.**
    - `makeShot` (`application/shots.ts`) sends the first and last panels' current images (only those two need images) as `first_frame` / `last_frame`. With frames, MiniMax ignores the requested ratio and follows the panel's shape, so Shot videos come out 3:2.
    - `shotVideoPrompt` is the action (or intent), the camera note, the voiced dialogue (or "No one speaks.") and the motion text.
    - The length comes from generate-shot's `durationS` argument (default 6), not from the Shot.
  - **Job inputs are capped at 2:**
    - the database check `cardinality(inputs) <= 2` (`supabase/migrations/20261107000000_generation_requests.sql:14`; `20261110000000_request_targets.sql` freezes `inputs` after insert);
    - `generation/jobs.ts:82`;
    - `artifacts/generated-videos.ts:32` `framesSchema` (`.max(2)`; the frames become the clip's dependencies);
    - `application/video-jobs.ts:140-175`, which takes `[firstFrame, lastFrame]` and reads them with `readImageInputs` (cap 10, original bytes as data URLs).
  - **Panels.**
    - generate-panel sends the model's `size` (default `auto`) for a Shot's first panel. A second panel takes the first's measured size (`application/panel-inputs.ts:44`, `panels.ts:56`).
    - The second panel always gets panel 1's image first, with the job "keep camera, setting and staging" (`panel-inputs.ts:9,40-45`). In QA, Shot 2's "close on her hand" panel came out as the same wide picture.
  - **System prompt.** Three static lines (`apps/api/src/agent/mastra/native-turns.ts:23`). The workflow lives only in tool descriptions.
- **Evidence from Lou's QA (2026-11-03).** Two paid MiniMax-H3 reference-to-video runs on the QA host's images:
  - **Run 1:** 3 PNGs (Mara's front view, the gallery, the key) plus a written action.
  - **Run 2:** Shot 1 with Mara's front and face views, the gallery and Shot 1's panel, as 1,536 px JPEGs. The request body was 1.3 MB.
  - **Both** kept the subjects, followed the panel's framing and came out 16:9 at 1344×768.
  - **Lou:** "I would say this test passes." The audio was right, but the lips didn't match the line, "we will fix that later". The motion "just cuts off".
  - The scripts and clips are kept outside the repo, in the session scratchpad. The request shape is recorded under Story 2's technical notes.
- **Research (2026-11-03), from MiniMax's official H3 prompt guides on Hugging Face and the V2 API reference.**
  - H3 always makes sound, and no parameter turns it off.
  - Speech is written with a speaker id and a dialogue tag: `Mara (S1) says: <d>[English] …</d>`.
  - Voice-over is written "says in an off-screen voiceover: <d>[English] …</d> while her lips remain completely closed".
  - `reference_audio` can carry a voice. That is backlog work, not this sprint's.
  - Third-party advice: about 2.5 spoken words per second, with silence at both ends.
- **Implementation spec:** `docs/specs/implementation-spec-001.md`. The relevant parts are §8.3 (Storyboard, Videos), §8.7 (Shot jobs), §10 (agent tool guidance) and the Phase 3 packaging table, which this sprint renumbers.

### Sprint-Wide Context
- **Sprint type:** Feature
- **Shared context:**
  - **Lou's decisions (2026-11-03):**
    - **Reference-to-video replaces first and last frames for Shot videos.** generate-video, the free-form tool, keeps its frames.
    - **Sprint 012** is reference video (B-043) plus B-041, the system prompt. Join clips moves to 013 and Questions to 014.
    - **The agent sets each Shot's length** when it saves the storyboard. A person sees it and can change it in "View storyboard". Making the video uses it.
    - **One key panel per Shot.** A second only when the picture changes a lot within the Shot (Lou: for example two different parts of the room, as the camera moves from one to the other), made from the sheet views, not as an edit of panel 1. Panels keep their current shape; the video's 16:9 is set by the request.
    - **Lip sync, consistent voices and narration tracks are later work** (backlog). This sprint only writes dialogue in MiniMax's documented form.
  - **How a Shot's reference images are picked** (one rule, Story 3), at most 9 images, no image twice. The panels' slots are kept first, so a Shot naming many subjects still sends its panels:
    - For each subject the Shot names, in Shot order: its sheet's first view, up to 9 minus the number of panels sent.
    - Then the Shot's first panel's current image, then its last panel's when it has more than one. Middle panels of a person's longer Shot are not sent, as today.
    - Then, in subject order and while room remains, each subject's second view.
    - A subject with no sheet adds nothing.
    - A Shot whose first or last panel has no image is refused, as today ("make the Shot's panels first").
  - **The prompt labels every image:**
    - "Image N: Mara, <subject description>. Keep Mara's face, hair, build and clothing as shown." The keep wording depends on the subject's kind (`character`, `place`, `prop`) and names the subject, never a pronoun. The description is the sheet's, cut to 300 characters at a word.
    - The first panel's label is "Image N: the storyboard panel for this Shot. Frame the Shot like this panel." The last panel's is "Image N: the Shot's last storyboard panel. End the Shot on this framing."

    - After the labels come the action, the camera note, the dialogue in MiniMax's form, and a closing line: the action completes and the Shot ends on a settled moment.
    - It must fit 7,000 characters, or the Shot is refused `too_long` as today.
  - **Images are sent as they are stored.** No downscaling: 9 sheet PNGs come to about 36 MB as Base64, under the 64 MiB cap. The client keeps its per-image checks: PNG or JPEG, 256–5,760 px, aspect 0.4–2.5, at most 30 MB.
  - **No paid calls in tests.** The MiniMax and Meta fakes record what they receive; tests assert the exact `content` items, roles, labels and ratio. Paid calls happen only at Lou's QA, on his go.
  - **Budget (Lou, MVP testing budget).** Targeted tests per story, plus the commit and push gates; new cases in existing files and harnesses; no screenshot or visual suites.
- **Non-goals:**
  - Lip sync, `reference_audio` voices, MiniMax TTS (B-044) and separate narration tracks (B-045).
  - Joining clips and transitions between Shots (Sprint 013, B-020).
  - Questions (Sprint 014).
  - Shrinking or re-encoding images (B-046).
  - Reference videos.
  - Changing generate-video's frames.
  - More than 2 panels per Shot.
  - Approval of panels or Shot videos.
  - People editing other new Shot fields beyond the length.

### Affected Flows
- **Existing flows affected:**
  - §8.3 Develop script, references and storyboard:
    - save-storyboard saves each Shot's length;
    - a second panel is made from the sheets, only when the picture changes a lot.
  - §8.5 Review, revise and choose: "View storyboard" shows and edits a Shot's length; the Storyboard tab's summary shows it.
  - §8.7 Stop, cancel and recover (Shot jobs): a job carries up to 9 reference inputs instead of 2 frames. Stop, restart and resume keep them.
  - Videos: Shot clips are 16:9, the Shot's length, and depend on their reference images.
  - The chat: the agent follows the workflow prompt.
  - §10 Agent tool guidance: generate-shot loses its `durationS` input; save-storyboard gains `durationS`.
  - Developer live checks: `pnpm live:video` gains `--references`.
- **New flows introduced:**
  - None. The flows above change. **Each story updates its own spec section in its PR** (Story 1 §8.3/§8.5, Story 2 §8.7, Story 3 §8.3 Videos/§8.7, Story 4 §8.3, Story 5 §10). The Phase 3 table is renumbered with this sprint's planning commit. Sprint Completion reviews the spec against the shipped code.

### Verification Strategy

For executable behavior (code, config/scripts, and actual machine-consumed contracts or workflows), define functional and relevant regression proof before implementation. Policy/workflow prose alone is not proof of executable behavior. For descriptive-only docs/design prose, record functional and regression N/A with rationale and use editorial review for accuracy/completeness/consistency. Do not add persistent prose/heading assertion suites. Keep applicable existing checks and design visual/safety/consistency/approval checks under the design skill.

Verification has two categories:

- **Functional verification:** proof of executable behavior introduced or changed by this sprint, or justified N/A for descriptive-only work.
- **Regression verification:** proof of relevant existing behavior, or justified N/A for descriptive-only work.

Each implementation story must include:

- Functional verification for executable behavior it delivers, or justified N/A for descriptive-only scope.
- Targeted regression verification for existing behavior at risk, or justified N/A for descriptive-only scope.

At sprint completion, run the applicable regression suite on the combined sprint branch plus planned cross-story checks not covered by that suite. Do not rerun each story's checks separately when the suite already covers them. For descriptive-only work, use editorial review and applicable existing checks. Reusable functional checks become future regression checks; one-off editorial review is evidence, not a persistent suite.

**Lou's core tests,** with the stories that prove each:
1. **A Shot has a length** that the agent sets and a person can change, and its video runs for it: Stories 1 and 3.
2. **A Shot's video is made from references,** meaning its subjects' sheet views and its panels, each labelled, at 16:9: Stories 2 and 3.
3. **A second panel is made only when the picture changes a lot,** from the sheets: Story 4.
4. **The agent follows the workflow** and shows each step before the next paid one: Story 5.

### Tests requiring extra consideration

1. **Integration cases on the shared test stack** in `apps/api/test/integration/tool-activity.test.ts` and `generation-jobs.test.ts`, with storage, the checker and both fakes (Stories 1–4). Only real turns prove that a Shot's references land in the job, survive a restart and reach MiniMax in order. One stack start per story.
2. **A migration** (Story 2) that raises the job input cap from 2 to 9. `generation-jobs.test.ts` covers it, including a restart with a 9-input job.
3. **The Shot browser journey** (`test/e2e/shots.spec.ts`), extended in Stories 1 and 3: the length in the board and its edit, and the Shot video made after the edit. About 1–2 minutes.
4. **The deep gate at Sprint Completion,** and again at the `main` pre-merge.

### Stories
**Constraints:** Target 5-8 stories per sprint. Each story should be small enough to review, verify, and merge independently. Split stories that combine unrelated outcomes or cannot be verified with a clear functional/regression verification plan.

#### Story 1: A Shot has a length
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1 (3/5): re-save could reset a person's length; edit-bound refusal untested; spec notes missing. Pass 2 (4/5): the no-length board state, the read-workspace listing test, one test location.
  - Resolution: `durationS` is required in the tool and an agent save sets what it sends (the description says to keep a person's length); edit refusal tested in `storyboard-revisions.test.ts`; spec §8.3/§8.5 added; "Length · not set" and a read-workspace case added.
- **As a** user, **I want** each Shot to carry how long it runs, set by the agent and changeable by me, **so that** its video is made at a length that fits its action and lines.
- **Dependencies:** None
- **Acceptance criteria:**
  - [ ] **The field.** `shotFields` gains `durationS`, an optional whole number from 4 to 15. Saved storyboards without it stay valid. read-workspace's storyboard listing shows it per Shot when present (`agent/workspace-entries.ts`).
  - [ ] **The agent sets it.** save-storyboard's Shot input requires `durationS` (a whole number, 4–15) and saves it on every Shot it writes. An agent save sets what it sends, as it does for every other Shot field, so a person's length is kept only when the agent sends it back. The description says so: read-workspace shows each Shot's current length, and the agent keeps a person's length unless asked to change it.
    - The description says how to choose it: about 2.5 spoken words per second of dialogue, plus the time the action needs, with a beat of silence at each end, rounded up to a whole second.
    - Like the other Shot fields, it is threaded through `AssistantShotInput` and `plannedShots` (`artifacts/assistant-storyboards.ts`).
  - [ ] **A person changes it.**
    - "View storyboard" shows "Length · 6 s" beside the Shot intent, or "Length · not set" for a Shot without one (an older or built-in storyboard). An Edit control opens a number field from 4 to 15 with Cancel and Save, using the same editor states as the intent.
    - Saving is a person's storyboard edit: `storyboardEditSchema` and `editedPlan` accept `durationS`. Every other Shot field is kept.
    - A value outside 4–15, or not a whole number, is refused in the field, with nothing saved.
  - [ ] **The Storyboard tab's summary** reads "medium · 6 s · 2 panels" when the Shot has a length. A Shot without one shows no length.
  - [ ] **generate-shot uses the Shot's length.** Its `durationS` input is removed, and the job's duration is the Shot's `durationS`, or 6 when the Shot has none. The tool description says the length comes from the storyboard and the person can change it.
- **Functional verification:**
  - [ ] Unit (`save-storyboard.test.ts`, and a contracts case for `shotFields` and `storyboardEditSchema`): `durationS` 4 and 15 pass; 3, 16, 6.5 and (in the tool schema) a missing value fail; an old saved storyboard without it parses. Pass: each case as stated.
  - [ ] Unit (`read-workspace.test.ts`): a Shot with `durationS: 8` is listed with 8; a Shot without one lists no length.
  - [ ] Unit (`generate-shot.test.ts`, `application/shots.test.ts`): a Shot with `durationS: 9` starts a job with `durationS: 9`; one without starts with 6; the tool's schema no longer accepts `durationS`.
  - [ ] Integration (`tool-activity.test.ts`, the save-storyboard block): a saved Shot keeps `durationS`. A person's edit of only the length keeps the agent's action, dialogue and references. A later agent save that sends the person's 8 keeps 8.
  - [ ] Integration (`storyboard-revisions.test.ts`): a person's length edit to 8 changes only that Shot's `durationS`; one with 16 is refused and the storyboard version is unchanged.
  - [ ] E2E (`shots.spec.ts` journey): the board shows "Length · 6 s". Editing it to 8 and saving shows "8 s" in the tab's summary, before and after a reload. The Shot video choice test's storyboard (no length) shows "Length · not set".
- **Regression verification:**
  - [ ] The existing Story 6 journey and planning-edit tests: intent and panel description edits still save. Pass: `shots.spec.ts` and `saves.spec.ts` green.
  - [ ] read-workspace's budget cases (`read-workspace.test.ts`) still fit 16 KiB with the new field on 100 Shots.
- **Editorial/design verification:** `docs/design/design.md` Storyboard board and Storyboard shots: the length line, its editor and the summary's length, reviewed against the existing editor rules (Cancel then Save, plain feedback). Spec §8.3 (the Shot's length, save-storyboard) and §8.5 (a person edits it).
- **Manual-only behavior verification:** N/A
- **Planned commits:**
  1. Contracts and save: `durationS` in `shotFields`, save-storyboard input and guidance, the read-workspace listing.
  2. A person's edit: the edit schema, `editedPlan`, the board's Length editor and the tab's summary.
  3. generate-shot uses the Shot's length; design.md and spec §8.3/§8.5.
- **Technical notes:**
  - `planning-editor.tsx` has two paths: `ManualVersionEditor` for text leaves and `BoundPlanningEditor` with `editStoryboard`. The length is a number, so add it as an edit field on the bound path, not as a text leaf.
  - `storyboard/presentation.ts`'s `duration` fact is for display compositions only. The real length comes from the Shot.

#### Story 2: Reference images in the video client and job store
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: untested reference checks, the 9-vs-10 cap, the frozen-inputs regression. Pass 2: one stale "2 to 10"; `references` named like a Shot's subject references.
  - Resolution: Per-reference, `validateVideoRequest`, duplicate and exclusivity cases added; cap is 9 everywhere with 10 refused; the freeze is asserted; fields renamed `referenceImages` / `referenceImageIds`.
- **As a** maintainer, **I want** the video client and job store to carry up to 9 reference images, **so that** a Shot's video can be made from its subjects and panels instead of two fixed frames.
- **Dependencies:** None
- **Acceptance criteria:**
  - [ ] **Client.** `VideoRequest` (`generation/minimax-video.ts`) gains `referenceImages`: 1–9 images. (Named apart from a Shot's `references`, which are subjects.)
    - `requestBody` sends each as `{type: 'image_url', image_url: {url}, role: 'reference_image'}`, after the text item and in the given order, with the requested `ratio`.
    - `referenceImages` together with `firstFrame` or `lastFrame` is `invalid_request` (`detail: 'referenceImages'`). So are more than 9.
    - Each reference passes `checkFrame`'s limits, and the whole body stays at or under 64 MiB.
    - `validateVideoRequest` applies the same checks.
  - [ ] **Job store.**
    - A new migration lets `generation.requests.inputs` hold up to 9 ids (MiniMax's reference limit), replacing the `<= 2` check. Inputs stay frozen after insert.
    - `generation/jobs.ts` accepts up to 9 inputs.
    - `artifacts/generated-videos.ts` accepts up to 9 input ids, which become the clip's dependencies.
  - [ ] **Job runner.** `NewVideo` gains `referenceImageIds` (version ids), exclusive with `firstFrame` / `lastFrame`.
    - `video-jobs.ts` `start` reads them with `readImageInputs`, stores them as the job's `inputs`, builds the request with `referenceImages` and the ratio, and saves the clip with them as dependencies.
    - A duplicate id is refused before anything is read.
    - Stop, restart and resume keep the references, as they keep frames today.
  - [ ] **Live script.** `pnpm live:video` gains `--references <png>…`. It is dry by default, against the loopback fake, and makes a paid call only with `--live`.
- **Functional verification:**
  - [ ] Unit (`minimax-video.test.ts`): the body has the text item, then 3 `reference_image` items in order, with `ratio: '16:9'`. Each of these is `invalid_request` with no request sent, through both `create` and `validateVideoRequest`: mixed frames and references, 10 references, one 200 px reference, one reference with aspect 3.0, and an oversize body.
  - [ ] Unit (`video-jobs` cases in `apps/api/test/unit/application/`): a duplicate reference image id, and reference images with `firstFrame`, are refused before any image read or job row.
  - [ ] Integration (`generation-jobs.test.ts`): a job with 9 inputs is stored and survives a restart with the same inputs; 10 is refused by the database check. An UPDATE of a 9-input row's `inputs` is still rejected. The finished clip's dependencies are those 9 versions.
  - [ ] `pnpm live:video --references …` in dry mode reports `"mode": "dry", "pass": true`. Log under `outputs/verification/sprint-012/story-2/`.
- **Regression verification:**
  - [ ] generate-video with frames and without: same bodies as today (the existing `minimax-video.test.ts` and `generate-video` cases).
  - [ ] Sprint 011 Shot jobs with 2 frames still restart and resume (`generation-jobs.test.ts`).
- **Editorial/design verification:** N/A. No UI.
- **Manual-only behavior verification:** N/A
- **Planned commits:**
  1. The client: `references` in `VideoRequest`, with its checks.
  2. The migration, `jobs.ts` and `generated-videos.ts` caps; spec §8.7 (a job's inputs).
  3. The job runner and the live script.
- **Technical notes:**
  - The request shape that passed both of Lou's tests: `{model: 'MiniMax-H3', resolution: '768P', duration, ratio: '16:9', content: [{type: 'text', text}, …{type: 'image_url', image_url: {url: 'data:image/…;base64,…'}, role: 'reference_image'}]}`. Query: `/v2/query/video_generation/{task_id}`, as today.
  - The 768P result for 16:9 is 1344×768.

#### Story 3: Shot videos are made from references
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1 (P1): Shots with more than 2 panels; label length and `too_long`; dedupe and no-sheet cases; wording contradiction. Pass 2: many subjects could crowd out the panels; dialogue forms not written in full.
  - Resolution: First and last panels only, as today; descriptions cut to 300 characters with a `too_long` case; exact 9-image list and dedupe/no-sheet cases; names, never pronouns; panel slots kept first with a 9-subject case; all four dialogue forms written out.
- **As a** user, **I want** each Shot's video made from its subjects' sheets and its panels, **so that** the people, places and objects stay the same while the Shot moves freely, at 16:9.
- **Dependencies:** Stories 1 and 2
- **Acceptance criteria:**
  - [ ] **`makeShot` picks the references** by the sprint's rule:
    - each named subject's first sheet view, up to 9 minus the panels sent;
    - then the first panel's current image, and the last panel's when there is more than one;
    - then second views, in subject order, while room remains;
    - at most 9 in all, no image twice; a subject without a sheet adds nothing.
    
    It starts the job with `referenceImageIds`, `ratio: '16:9'` and the Shot's length. It no longer sends frames.
  - [ ] **`shotVideoPrompt` writes, in order:**
    - one "Image N: …" line per reference, as the sprint's labels say (descriptions cut to 300 characters);
    - the action (or intent);
    - the camera note;
    - each dialogue line in MiniMax's form, written out exactly (speaker ids S1, S2… in order of first line, stable within the Shot):
      - on screen: `Mara (S1) says: <d>[English] You came.</d>`
      - off screen: `Ben (S2), off-screen, says: <d>[English] I did.</d>`
      - a scene character's voice-over: `Mara (S1) says in an off-screen voiceover: <d>[English] He always did.</d> while Mara's lips remain completely closed.`
      - narration: `A narrator (S3) says in an off-screen voiceover: <d>[English] Years passed.</d> while every character on screen keeps their lips closed.`

      "No one speaks." when there's no dialogue.
    - then the motion text;
    - then "The action completes within the Shot, and it ends on a settled moment."
    
    Over 7,000 characters is `too_long`, as today.
  - [ ] **generate-shot.** The description says the video is made from the Shot's sheets and panels, with the Shot's text and length. Refusal and invalid messages point to panels and sheets, not frames (`agent/tools/generate-shot/index.ts`, `video-shared.ts`). generate-video's frame text is unchanged.
  - [ ] **The clip** is saved to the Shot as today, with its references as dependencies.
- **Functional verification:**
  - [ ] Unit (`application/shots.test.ts`):
    - A Shot naming Mara and the gallery, with 1 panel, sends `references` `[mara view 1, gallery view 1, panel 1, mara view 2, gallery view 2]`.
    - A Shot naming subjects A–E (each with 2 views) and 2 panels sends exactly `[A1, B1, C1, D1, E1, panel 1, panel 2, A2, B2]`.
    - A Shot naming 9 subjects with 2 panels sends the first 7 subjects' first views, then both panels.
    - A Shot whose two panels show the same image sends it once; a named subject without a sheet adds nothing.
    - A 3-panel Shot sends its first and last panels only; its middle panel without an image is not refused.
    - The prompt matches an exact expected string covering all four voicings, the panel labels and the closing line.
    - Long sheet descriptions are cut at 300 characters; a Shot whose prompt still passes 7,000 characters is `too_long` before any job starts.
    - A Shot whose first or last panel has no image is still `needs_panels`.
  - [ ] Integration (`tool-activity.test.ts`, the generate-shot block): a scripted turn saves a storyboard, makes a panel and makes the Shot. The MiniMax fake received `ratio '16:9'`, the Shot's `durationS`, and `reference_image` items whose bytes are the sheet views' and panel's. The clip is saved to the Shot.
  - [ ] E2E (`shots.spec.ts` journey): after the length edit to 8 s, the Shot video's job duration is 8. The fake's recorded request is read through the test backend.
- **Regression verification:**
  - [ ] The Shot video choice, restart and resume e2e tests (`shots.spec.ts`) stay green.
  - [ ] The generate-video tool's frame cases are unchanged (`generate-video.test.ts`).
- **Editorial/design verification:** Spec §8.3 Videos and §8.7, and design.md Video rows: "made from the Shot's sheets and panels". Editorial review for accuracy.
- **Manual-only behavior verification:** N/A. Lou makes real Shot videos at QA.
- **Planned commits:**
  1. Reference picking in `makeShot`.
  2. The prompt: labels, dialogue form and closing line.
  3. generate-shot's description and messages; the spec and design notes.
- **Technical notes:**
  - A subject's description comes from its sheet (`content.subject.description`).
  - Keep wording by kind:
    - `character`: "Keep Mara's face, hair, build and clothing as shown."
    - `place`: "Keep The Gallery's layout, architecture and light as shown."
    - `prop`: "Keep The key's design, shape and materials as shown."

#### Story 4: A second panel only when the picture changes a lot
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: the paid call as a dependency; panel 1 first vs Lou's decision; no generate-image size test. Pass 2: `live:image` has no size option; one vs two calls.
  - Resolution: Panel 1 moves after the sheet views as a continuity input. Lou rescoped the story after review (2026-11-03): panels keep their shape, so the 16:9 panel size, its paid Meta check and `live:image --size` are dropped. A re-check of the rescoped story scored 4/5; its P2s (a leftover `live:image` completion check, a QA item for the second panel's picture, the editorial list) were fixed.
- **As a** user, **I want** a second panel only when the picture changes a lot within a Shot, **so that** each panel shows something new and the video knows where the camera ends up.
- **Dependencies:** Story 1 (both edit save-storyboard's description); Story 3 (the last panel is labelled "End the Shot on this framing").
- **Acceptance criteria:**
  - [ ] **The second-panel rule.**
    - save-storyboard's description: "A Shot has one key panel. Add a second only when the picture changes a lot within the Shot, for example when the camera moves from one part of the room to another, or from wide to close. Never add one for a small change of pose or expression."
    - generate-panel's description: a second panel is made from the sheet views, with panel 1 only for continuity, and shows the new picture its description sets out.
  - [ ] **The second panel's inputs** (Lou: made from the sheet views, not as an edit of panel 1).
    - `panelInputs` puts the chosen sheet views first, as for a first panel, and panel 1's image last, with the job "match the setting, people and light; not its camera or framing", replacing panel 1 first with "keep camera, setting and staging".
    - `needs_first_panel` stays: panel 1 is still made first.
  - [ ] **Panels keep their shape.** generate-panel's `size` stays as today, and a second panel keeps the first's measured size. The video's 16:9 comes from its request (Story 3), not from the panel.
- **Functional verification:**
  - [ ] Unit (`generate-panel.test.ts`, the input-order cases): a second panel's inputs are the sheet views, then panel 1 last with the new job line; the image cap still counts panel 1.
  - [ ] Integration (`tool-activity.test.ts`, the generate-panel block): for a scripted second panel, the Meta fake received the sheet views, then panel 1 last, at panel 1's measured size.
- **Regression verification:**
  - [ ] generate-panel's existing cases still pass (`generate-panel.test.ts`, the input order and refusals): a first panel's input order, `needs_first_panel` and the image cap.
- **Editorial/design verification:** Spec §8.3 Storyboard: one key panel; a second only when the picture changes a lot, made from the sheets. The save-storyboard and generate-panel descriptions are reviewed against it (review only, no prose tests).
- **Manual-only behavior verification:** N/A. Lou checks real panels at QA.
- **Planned commits:**
  1. The second panel's inputs and job line, with tests.
  2. The second-panel rule in both descriptions; spec §8.3.
- **Technical notes:** Panels keep today's shape: QA's panels came back 3:2 (1920×1280). With reference images MiniMax follows the requested ratio: Lou's Shot 1 test sent a 3:2 panel and got 16:9.

#### Story 5: The system prompt sets out the workflow (B-041)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: a scripted turn can't prove the pass condition; open test locations; manual steps not discrete. Pass 2: the tester's replies and stopping point.
  - Resolution: The condition is judged at Lou's QA; one integration case in `agent-loop.test.ts`; three pass/fail steps with the tester's replies and stop.
- **As a** user, **I want** the agent to follow one clear workflow and check with me before each paid step, **so that** a short video comes together in order without surprises or wasted calls.
- **Dependencies:** Stories 1–4, so the prompt describes the shipped workflow.
- **Acceptance criteria:**
  - [ ] **One static system prompt** in `agent/mastra/native-turns.ts` replaces the three lines. It covers:
    - the steps in order: script, reference sheets, storyboard with each Shot's length, panels, Shot videos from references;
    - how sheets feed panels, and how sheets, panels and Shot text feed videos;
    - read-workspace before acting on saved work;
    - show the person each step's result and ask before the next paid step (images, videos);
    - one Shot video at a time unless the person asks for more.
  - [ ] **It is static.** No per-turn or per-video text, so provider prefix caching holds. Tool-specific rules stay in the tool descriptions and aren't repeated.
  - [ ] **The B-041 pass condition** (the agent follows the steps in order and asks before paid calls) is judged at Lou's QA, below. Tests prove only that the prompt is sent unchanged.
- **Functional verification:**
  - [ ] Integration (`apps/api/test/integration/agent-loop.test.ts`): on two fresh conversations and on a second turn of one, the scripted provider's first message is byte-identical to the exported `systemPrompt`.
- **Regression verification:**
  - [ ] The chat and tool-activity integration tiers stay green, along with `chat.spec.ts`'s first-reply test.
- **Editorial/design verification:** Lou reviews the prompt text in the PR. Spec §10 Agent tool guidance points to it.
- **Manual-only behavior verification:** at Lou's QA, a fresh conversation asked "make a 20-second video of Mara finding a key in a gallery". The tester answers "yes, go ahead" to each proposal and stops once one Shot video is made. Each is pass or fail:
  1. The first reply proposes or writes the script, with no image or video call.
  2. Sheets come before panels, and panels before Shot videos.
  3. No generate-sheet, generate-panel, generate-image, generate-shot or generate-video call happens unless the person said yes in the turn before.
- **Planned commits:**
  1. The system prompt and its tests.
  2. Spec §10.
- **Technical notes:**
  - Keep it short. Muse Spark follows tool descriptions well, and the prompt should give the order and the ask-first rule, not repeat each tool.
  - A test can't prove how the model will behave. The scripted tests prove only that the prompt is sent, unchanged. Lou's QA judges the behaviour.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [ ] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [ ] Run the applicable regression suite on the combined sprint branch: the deep gate (`WORKPRINT_PREVIEW_PORT=4185 .checks/regression.sh --tier=deep`).
- [ ] Run any planned cross-story checks not covered by that suite: `pnpm live:video --references` in dry mode.
- [ ] Review spec §8.3, §8.5, §8.7 and §10 (updated by each story) against the shipped code.
- [ ] A QA build for Lou with live Muse Spark, Meta and MiniMax, started when Lou asks. Pass:
  - the agent follows the workflow and asks before paid steps;
  - each Shot has a length, and Lou can change it;
  - a Shot has a second panel only where its picture changes a lot, and that panel shows the picture its description sets out, not panel 1's camera or framing;
  - each Shot video is 16:9, at its Shot's length, and keeps the sheets' people, places and objects.
- [ ] Record results and unresolved issues in a brief `## Final Review`.

For descriptive-only work, use editorial review and applicable existing checks. Preserve applicable design checks and approval gates. Failed, ambiguous, or unrun required checks remain non-pass.

### Rules
- Before authorized delivery, read canonical `docs/conventions/delivery-workflow.md` (resolved via AGENTS.md §12) for sprint branching, PRs and review/fix/merge mechanics; shared gates remain in AGENTS.md.
- Work through already-authorized stories sequentially, subject to explicit pause/no-merge instructions. Planning approval alone does not authorize implementation. After all implementation stories are complete, perform the Sprint Completion checklist.
- Only the orchestrator updates planning records. Every resulting head must pass verification and independent review before acceptance.
- After the Sprint Completion checklist passes, follow the delivery workflow for sprint integration and its explicit user merge command.
- Record new dependencies in `## Final Review`, or record `None` when no dependencies were added.
- Paid calls (Meta, MiniMax) only on Lou's go.

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
