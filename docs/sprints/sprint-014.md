# Sprint 014 — Shots that match, and a tidier app

**Date:** 2026-11-04 planning, starting from `main` after Sprint 013 merged (#146) – End after completion gates and Lou's QA
**Goal:** In a local build, a signed-in user asks for a short video (for example "make a 20-second video of Mara finding a key in a gallery"), and its Shots match across the cuts.
- The storyboard starts a new Shot only when the camera set-up changes; continuous action in one space stays in one Shot.
- Every Shot names its place, so even a close-up keeps the room.
- Every Shot states where people and key objects start and end in the frame and which way they move, and its panel and video prompts carry that, with the previous Shot's ending.
- A person sees and can change those positions in "View storyboard".
- The app shows the word "Workprint" in Italiana as its makeshift logo, without the composer's upload limits line, the "Attach photos" label or the Videos tab's Export card.
- Muse Wonder (`meta/muse-wonder-1.0`) is the default chat model, once a live check on Lou's go shows it works with the tools.

**Status:** 🔵 In Progress. Drafted 2026-11-04 from Lou's Sprint 012/013 QA discussion and approved by Lou the same day, with one paid live run of the gallery video after Story 4 ("yup approved. feel free to run the test"). Questions (B-014, B-016) move to Sprint 015. Lou asked for a lean test set ("Lets not go too crazy with the tests").

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`.
  - Branch `sprint-014` was cut from `main` at `8a56128` (Sprint 013, #146) and holds this plan. Story branches come from `sprint-014`, and the sprint PR targets `main`.
  - Story 1's work is already committed on `feat/ui-wordmark` (`b558a85`, cut from `main` at `8a56128`); its PR targets `sprint-014`.
  - PR #148 (docs only, into `main`) records Lou's QA of Sprints 012 and 013 and archives B-020, B-041 and B-043.
- **Tech stack:** as Sprint 013. Muse Spark 1.3 chat through Mastra's model router (`apps/api/src/agent/mastra/model.ts`); Meta `muse-image-1.0` panels; MiniMax-H3 reference-to-video Shots; the media sandbox.
- **Current state:**
  - **The QA finding (Lou, 2026-11-04).** A 3-Shot gallery video's Shots didn't match. Shot 1 had Mara walking toward the right of the room; in Shot 2 she was on the left picking up the key; Shot 3 (a close-up) wasn't in the gallery at all. The QA host's saved data shows why:
    - the storyboard split one continuous action (walk to the bench, notice, kneel, pick up) into two Shots, so the cut between them had to be matched by two separate generations;
    - Shot 3 named only Mara and the key, not the gallery, so neither its panel nor its video got the gallery's sheet;
    - each Shot's first panel is made from the sheets alone (`application/panel-inputs.ts`): nothing tells Meta where people stood or which way they moved in the Shot before;
    - Shots 2 and 3 were sent to MiniMax within the same second.
  - **What exists:** each Shot has intent, framing, action, dialogue, a camera note, its subjects (`references`, each with a role), a length and 1–2 panels (`packages/contracts/src/shot-fields.ts`). save-storyboard already says "each Shot is one uninterrupted camera view" but doesn't say when to cut. The panel prompt is a code-written preface plus the agent's prompt (`application/panels.ts:54`); the Shot video prompt is `shotVideoPrompt` (`application/shots.ts:101`). A person can change a Shot's intent and length in "View storyboard" (`apps/web/src/storyboard/`, `storyboardEditSchema` in `packages/contracts/src/models.ts:56`, `editedPlan` in `artifacts/storyboard.ts`).
  - **The model:** `assistantModels` (`apps/api/src/agent/limits.ts:39`) allows only `meta/muse-spark-1.3`, and `mastra/config.ts` refuses any other `DEFAULT_ASSISTANT_MODEL`, so changing `.env` alone fails at startup. Mastra's registry lists `meta/muse-wonder-1.0` under the Meta provider. Title calls use per-model provider options (`model.ts` `titleOptions`).
- **Implementation spec:** `docs/specs/implementation-spec-001.md`: §8.3 (Storyboard, Videos), §10 (agent tool guidance, Phase 3 packaging).

### Sprint-Wide Context
- **Sprint type:** Mixed (feature, UI clean-up, model qualification).
- **Shared context:**
  - **Decisions (Lou, 2026-11-04):**
    - continuity is fixed in the storyboard, not by passing the previous video's last frame or the previous panel: "lets remove the last frame bit". Both stay ideas for later, only if the cuts still don't match;
    - a Shot is a camera set-up; "Shot 1 and 2 should have been in just one video";
    - the field is called positions, not blocking, and holds a start and an end;
    - the logo is the word "Workprint" in Italiana; remove the upload limits line, "Attach photos" and the Export card;
    - the default model becomes Muse Wonder.
  - **Research (an X search Lou ran, 2026-11-04):** people keeping multi-shot AI video consistent state screen geography in plain words ("frame left", "toward frame right", which side the camera is on), name the camera as shot size, angle and one movement, and always give the location reference. The prompts already label each image's job.
  - **No paid calls in tests.** The Meta and MiniMax fakes record what they receive. Paid calls happen only at Lou's QA, the live gallery run he approved, and Story 5's live check, on his go.
  - **A lean test set.** Each story keeps the few tests that prove its rules and updates the existing suites its change breaks; no new suites.
- **Non-goals:**
  - the previous video's last frame or the previous Shot's panel as an input;
  - making Shots in order (the system prompt is unchanged);
  - a second panel per Shot by default;
  - Questions (B-014, B-016), moved to Sprint 015;
  - a designed logo, a model picker, or removing the export module itself (only its card is hidden).

### Affected Flows
- **Existing flows affected:** spec §8.3 Storyboard (save-storyboard, "View storyboard" editing), panels and Shot videos (their prompts); the shell, entry pages, composer and Videos tab (Story 1); every chat turn and video title (Story 5).
- **New flows introduced:** None. Positions are a new Shot field inside the existing storyboard flows.

### Verification Strategy
- **Functional:** unit tests for the storyboard tool's schema and refusals and for the prompts; integration through real turns (`tool-activity.test.ts`) for a save refused without a place and a save with positions; e2e for editing positions and for Story 1's UI; one live gallery run after Story 4 and one live chat check for Story 5.
- **Regression:** the storyboard, panel and Shot video suites (`tool-activity.test.ts` storyboard and generate blocks, `storyboard-revisions.test.ts`, `shot-video-choice.test.ts`), `agent-loop.test.ts`, `shots.spec.ts` and `chat.spec.ts`; the unit tier and `pnpm check` per story; the deep gate once at completion.
- **Whether the Shots match** is a model result no automated test can prove. The live gallery run gives an early answer before Lou's QA, which judges it.

### Tests requiring extra consideration
- `shots.spec.ts` (about 1.5 min) for editing positions; it already covers editing a Shot's length.
- The live gallery run (paid Muse, Meta and MiniMax calls, approved by Lou on 2026-11-04) runs once after Story 4.
- Story 5's live chat check makes paid Muse Wonder calls, run once on Lou's go.

### Stories
**Constraints:** Target 5-8 stories per sprint. Each story should be small enough to review, verify, and merge independently. Split stories that combine unrelated outcomes or cannot be verified with a clear functional/regression verification plan.

**Order:** Story 1 is already built and merges into `sprint-014` first, so Stories 2–5 branch after it and its `shots.spec.ts` and `design.md` edits. Stories 2, 3 and 4 then go in order, followed by the live gallery run (on Muse Spark). Story 5 comes last, before Lou's QA, so the QA judges Muse Wonder.

#### Story 1: A makeshift wordmark and a tidier composer and Videos tab
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P2s: no check of the accessible name, the docked label or the licence; the manual look had no pass condition.
  - Resolution: the accessible name is what the e2e finds the button by; a `chat.spec.ts` case checks the docked "+ Attach"; the licence is kept in the repo beside the font (it isn't a served file); the look is Sprint Completion's QA item 4.
- **As** Lou, **I want** the app to show its name as a simple wordmark and to drop text and controls that promise nothing, **so that** it looks finished enough to show.
- **Dependencies:** None. Built on `feat/ui-wordmark` (`b558a85`, from `main` at `8a56128`).
- **Acceptance criteria:**
  - [x] The sidebar's top left and the entry pages show the word "Workprint" in Italiana (`--font-family-brand`, regular, 28px); the "a" mark is gone. The font file (`apps/web/src/ui/fonts/italiana-latin.woff2`, Latin subset) is bundled and served with the app, not loaded from Google Fonts; its SIL OFL licence is kept beside it in the repo.
  - [x] The composer no longer shows "JPEG or PNG only · Up to 10 MiB · 4096 × 4096 pixels. Video uploads are temporarily unavailable."; a refused file still explains the limits in its upload status.
  - [x] The composer's attach button is "+" alone, with the accessible name "Attach a file", both before and after the first message. Only the question composer, which isn't shown until Questions (Sprint 015), keeps "+ Attach". (Changed from "the docked composer keeps + Attach" during the story, under Lou's delegation of 2026-11-04: the only docked composer is the question composer, and Lou asked for the "Attach photos" word to go.)
  - [x] The Videos tab shows no Export or Export history (B-009); the export module itself stays.
- **Functional verification:**
  - [x] E2E `auth.spec.ts` (sign-in test): the entry link and the sidebar wordmark use Italiana and the face is loaded; the button found by the accessible name "Attach a file" reads "+"; no limits line. `shots.spec.ts` (Generated videos test): no Export button. Pass: 2/2; both fail on the code before the change (checked by stashing it).
  - [x] E2E `chat.spec.ts` (first-reply test): after the first message, the conversation's attach button reads "+". Pass: green; on the code before the change it read "+Attach photos". (Planned as a docked "+ Attach" check, but the docked composer is only the question composer, which isn't shown yet.)
- **Regression verification:**
  - [x] `pnpm check`. Pass: green.
  - [x] `chat.spec.ts`, `uploads.spec.ts` (an image upload still verifies and stays attached) and `auth.spec.ts` whole. Pass: all green (26/26 after the assertion fix). A refused file's limits text lives in `apps/web/src/uploads/status.tsx`, which this story doesn't change; no test refuses a file, so that clause rests on the unchanged code and QA item 4.
- **Editorial/design verification:** design.md: the brand font token, the Logo section ("Makeshift"), the composer copy under the image-only restriction, and the Export consumers marked not shown for now.
- **Manual-only behavior verification:** Sprint Completion's QA item 4.
- **Planned commits:**
  1. Feat(web): Italiana wordmark, simpler composer
  2. Test(web): The conversation's attach button is bare
- **Technical notes:** Italiana has one weight (400); a bolder weight would be synthesised, so the wordmark stays regular.

#### Story 2: Every Shot names its place and its positions
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P1: the place rule's save paths weren't stated, so a person's length edit on an earlier storyboard, or a script with no place, could be refused. P2s: no length bound; keyword tests of the description prove nothing; three deliverables in one story.
  - Resolution: the place rule applies only to the agent's save-storyboard, and only when the script lists a place; a person's edits are never refused for it (regression case added). `start` and `end` are at most 300 characters. The description's rules are editorial, judged at Lou's QA. The prompt work is now Story 3. Round 2 (4/5), P2s: every suite with scripted saves is listed in regression, and reading a storyboard without positions has a case. Trimmed at Lou's approval: the no-place script and the old-storyboard read are unit cases, not separate turns.
- **As** a filmmaker, **I want** the storyboard to cut only where the camera changes, name every Shot's place and say where everyone starts and ends, **so that** my Shots can match across the cuts.
- **Dependencies:** Story 1 merged.
- **Acceptance criteria:**
  - [x] **Positions.** `shotFields` gains an optional `positions: { start, end }`, each 1–300 characters: where people and key objects are in the frame and which way they move, in frame-left / frame-right terms, and the camera's side. save-storyboard requires it for every Shot (a required object of two required strings), and read-workspace gives it when the storyboard is read in full by its versionId; the listing leaves it out, like action and camera note. Saved content without it still reads. (Changed from "read-workspace lists it" during the story: the listing is the compact view and stays within its byte bound.)
  - [x] **A place in every Shot.** When the script lists at least one place subject, an agent save in which a Shot names no subject with the environment role is refused with "Not saved: Shot N names no place. Add the place it happens in to its references, with the environment role." and nothing is saved. A script with no place subject is unaffected.
  - [x] **Person edits are never refused for the place rule**: a length, intent or positions edit of an earlier Shot with no place still saves.
  - [x] **When to cut.** save-storyboard's description says: a new Shot only when the camera set-up changes (a new angle or shot size) or time or place jumps; continuous action in one space stays in one Shot, up to 15 s; when the action continues from the previous Shot, its start follows that Shot's end; every Shot names its place, even a close-up; the camera note is shot size, angle and at most one movement, for example "Medium, from her left, camera slowly follows her".
- **Functional verification:**
  - [x] Unit (`apps/api/test/unit/agent/save-storyboard.test.ts`): a Shot without positions, without an end, or with a blank or 301-character start is refused by the tool's schema, and 300 characters pass through; the place refusal's line and message ("Not saved: Shot 2 names no place. …"). Pass: 3/3. A saved Shot without positions still parses: the length-edit case in `storyboard-revisions.test.ts` edits one.
  - [x] Integration (`tool-activity.test.ts`, real turns): a save whose Shot names no place (the script lists the gallery) ends with the refusal and no new version; a save with positions gives them in the next read-workspace of the storyboard's versionId. Pass: green.
  - [x] A script with no place is unaffected: the generate-video tests' `shotBoard` fixture in `tool-activity.test.ts` saves Shots with no environment reference under a character-only script. Pass: green.
  - [x] Integration (`storyboard-revisions.test.ts`): a person's edit of an assistant storyboard whose script lists a place its Shot doesn't name saves, keeping the Shot's positions. Pass: a new version (the existing intent-edit case, given a place and positions).
- **Regression verification:**
  - [x] The existing suites whose scripted saves now need positions, run once after updating them: `tool-activity.test.ts`, `storyboard-revisions.test.ts`, `shot-video-choice.test.ts`, `agent-loop.test.ts` and `shots.spec.ts`. Pass: green. Integration: 104/110 on the full run; the 6 generate-panel cases failed because their fixture's second Shot named no place, and passed (6/6) once it named the gallery. `shots.spec.ts` 4/4. Unit tier 221/221 and `pnpm check` green.
- **Editorial/design verification:** the cutting and camera rules are prose for the model, checked by reading the description and judged at Lou's QA items 1–2, not by keyword tests. Spec §8.3 Storyboard and §10's save-storyboard guidance name positions, the place rule and the cutting rule.
- **Manual-only behavior verification:** Lou's QA items 1–2.
- **Planned commits:**
  1. Feat(agent): Shots name their place and positions (one commit: the contract, the save and the description change together)
- **Technical notes:** the place refusal is a new `StoryboardSaveError` reason in `artifacts/assistant-storyboards.ts`, the agent's save path, not `editedPlan`. Muse Spark sends non-null values for nullable arguments, so `positions` is required in the tool's schema, not nullable.

#### Story 3: Panel and video prompts carry the positions
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P2s: only one line format was fixed; a Shot whose previous Shot has no positions wasn't covered; the system prompt's check wasn't named; no check at the longest positions.
  - Resolution: both formats are given; that case is covered; `agent-loop.test.ts`'s byte-identical test is named; a unit case at 300-character positions. Trimmed at Lou's approval: the panel preface is proven by its unit case, so only generate-shot has a turn.
- **As** a filmmaker, **I want** each panel and Shot video to be told where everyone starts and ends, and where the previous Shot ended, **so that** the pictures follow the plan.
- **Dependencies:** Story 2.
- **Acceptance criteria:**
  - [x] The panel prompt's code-written preface (built in `application/panel-inputs.ts`) and `shotVideoPrompt` (`application/shots.ts`) add `Positions: starts <start>; ends <end>.` for a Shot with positions, and `Previous Shot ended: <end>.` when the Shot before it in story order has positions and the two name a place in common, or neither names one. One helper builds both (`positionLines`, `application/shot-positions.ts`). (The place condition was added during the story, under Lou's delegation: Story 2's review found that after a cut to another place the previous end doesn't carry on.) For a Shot with positions, the panel preface also says which moment the panel shows ("This panel shows the Shot as it starts." for the first panel, "… as it ends." for a later one), added at review so a Shot's first panel, which frames its video, is drawn at the start.
  - [x] The first Shot, a Shot without positions, and a Shot whose previous Shot has none get no line for what's missing.
  - [x] A video prompt over MiniMax's limit is still refused `too_long` before any job is saved; 300-character positions on an ordinary Shot fit.
  - [x] The system prompt is unchanged.
- **Functional verification:**
  - [x] Unit (`shots.test.ts`, `panel-inputs.test.ts`): the exact lines for each case above, including another place, one Shot without a place, story order and a punctuation-only position; the lines' place in the video prompt and the panel preface with its moment; a job with 300-character positions is sent. Pass: green.
  - [x] Integration (`tool-activity.test.ts` generate-shot): the MiniMax fake receives Shot 1's positions line, and Shot 2's lines with where Shot 1 ended. Pass: green.
- **Regression verification:**
  - [x] `tool-activity.test.ts` whole and `agent-loop.test.ts` ("the static prompt and tool list are byte-identical across turns"). Pass: 89/89. Unit tier 222/222; `pnpm check` green.
- **Editorial/design verification:** spec §8.3 Videos and Storyboard's panel bullets name the lines.
- **Manual-only behavior verification:** Lou's QA item 3.
- **Planned commits:**
  1. Feat(application): Positions in Shot prompts
- **Technical notes:** the previous Shot is the one before in the storyboard's story order.

#### Story 4: A person changes a Shot's positions
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P2s: no state for a Shot without positions or text for the refusal; the unchanged edit and the next panel weren't verified; the place rule could refuse a person's edit.
  - Resolution: "Positions · not set" and both fields required; the refusal text is given; unit and e2e cases added; Story 2 keeps person edits out of the place rule. Round 2 (4/5), P2s: the display strings and the summary row have checks, and the server applies the same bounds, with a refusal case. Trimmed at Lou's approval: the summary row and the overlong edit rest on the shared schema and the unit cases; the e2e checks one fake request.
- **As** a filmmaker, **I want** to see and correct where people start and end in each Shot, **so that** I can fix a mismatch before paying for panels and videos.
- **Dependencies:** Story 3.
- **Acceptance criteria:**
  - [x] "View storyboard" shows each Shot's positions as "Starts: … / Ends: …", or "Positions · not set" for an earlier Shot without them; the tab's summary row doesn't show them.
  - [x] A person edits them the way a Shot's length is edited: a storyboard edit of that Shot's positions alone (`storyboardEditSchema`, `editedPlan`), saved as the next storyboard version; `storyboardEditSchema` uses Story 2's 1–300 bounds, so the API refuses what the editor would. Both fields are needed, including when adding positions to an earlier Shot; an empty one is refused with "Write where the Shot starts and where it ends." An unchanged edit just closes.
  - [x] The next panel and Shot video use the edited positions.
- **Functional verification:**
  - [x] Unit (`apps/web/test/unit/storyboard/storyboard-edit.test.ts`): the edit body carries only that Shot's positions; an empty field is refused with its text; an unchanged edit sends nothing; the display strings "Starts: … / Ends: …" and "Positions · not set". Pass: as stated.
  - [x] Integration (`storyboard-revisions.test.ts`): a positions edit saves the next version and changes nothing else; an empty edit is refused by the API with no new version. Pass: as stated.
  - [x] E2E (`shots.spec.ts` journey): edit Shot 1's end, reload and see it; the next generate-shot's MiniMax request (fake) carries it. Pass: as stated.
- **Regression verification:**
  - [x] `shots.spec.ts` whole (the length and intent edits still work). Pass: green.
- **Editorial/design verification:** design.md's Storyboard section names the positions editor beside the length.
- **Evidence (2026-11-04):** unit tier 223/223; `storyboard-revisions.test.ts` 14/14; `shots.spec.ts` 4/4, whose journey edits Shot 1's end, sees it in "View storyboard" after a reload, and finds it in the next fake MiniMax request's prompt; `pnpm check` green. The board's length and positions editors share one hook (`use-shot-edit.ts`), so the length edit in the same journey is the regression check for that move. The next panel reads the same saved positions through `positionLines` (Story 3), so the e2e checks the Shot video request only, as trimmed at approval.
- **Manual-only behavior verification:** Lou's QA item 2.
- **Planned commits:**
  1. Feat(artifacts): Edit a Shot's positions
  2. Feat(web): Show and edit positions in the board
- **Technical notes:** copy `shot-length.tsx`'s editor and `lengthText`'s "not set" pattern (`storyboard-edit.ts:44`).

#### Story 5: Muse Wonder is the default chat model
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P2s: no failure path; the live check's tool wasn't named; server start, Spark staying allowed and the QA host weren't checked; the spec locations were vague.
  - Resolution: a failure path; the live check calls save-storyboard (nested `positions`) and read-workspace; config unit cases; the QA host script and the exact spec lines are named. Round 2 (4/5), P2: on the failure path, one live Spark save-storyboard call confirms the nested argument before QA.
- **As** Lou, **I want** the agent to run on Muse Wonder, **so that** the workflow gets the stronger model.
- **Dependencies:** Story 2 (the live check uses its save-storyboard schema).
- **Acceptance criteria:**
  - [ ] **Live check first, on Lou's go:** `scripts/live/chat.mjs` with `meta/muse-wonder-1.0` streams a reply, calls read-workspace and save-storyboard (a required nested `positions` object) and reads their results, and makes a title. The response shapes are saved as a fixture beside `muse-spark-live-shapes.json`, with any differences from Muse Spark (reasoning options, nullable or nested arguments) recorded.
  - [ ] `assistantModels` gains `meta/muse-wonder-1.0` with its own title options. There is no code default: the server still takes the model only from `DEFAULT_ASSISTANT_MODEL`. Both ids start it; an unlisted one is refused; Muse Spark's title options are unchanged.
  - [ ] `.env.example` and the Sprint 014 QA host script (`outputs/qa/sprint-014/<sha>/host.mjs`, its `DEFAULT_ASSISTANT_MODEL`) use `meta/muse-wonder-1.0`. Lou sets it in the root `.env` himself.
  - [ ] **If the live check fails:** the differences are recorded, Muse Spark stays the default, Story 5 is closed as deferred in `## Final Review`, and before Lou's QA one live `chat.mjs` save-storyboard call on `meta/muse-spark-1.3` confirms Spark sends the nested `positions` (on Lou's go); then his QA runs on Spark.
- **Functional verification:**
  - [ ] Unit (`config.security.test.ts`, `video-title.test.ts`): both ids accepted, each with its title options; an unlisted id refused. Pass: as stated.
  - [ ] The live check above, once. Pass: reply, both tool calls and title as stated.
- **Regression verification:**
  - [ ] `agent-loop.test.ts` and the chat e2e (scripted provider). Pass: green.
- **Editorial/design verification:** spec §10 MVP plan → Decisions → Models, §8.1 Chat's "sent as one Muse Spark turn", and the README's model line name Muse Wonder as the default.
- **Manual-only behavior verification:** the live check is a paid call and needs Lou's go.
- **Planned commits:**
  1. Feat(agent): Qualify Muse Wonder as a chat model
  2. Chore(env): Make Muse Wonder the default
- **Technical notes:** the key is the same `META_API_KEY`. If Wonder rejects `reasoningEffort: 'minimal'` for titles, its title options leave it out.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [ ] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [ ] Run the applicable regression suite on the combined sprint branch (`.checks/regression.sh --tier=deep`).
- [ ] Run any planned cross-story checks not covered by that suite: spec §8.3 and §10, design.md and this doc against the code; and spec §10's Phase 3 packaging table and its Agent tool guidance line ("until B-014 lands (Sprint 014)") renumbered: 014 is this sprint and Questions is Sprint 015.
- [ ] **Live gallery run** (paid; approved by Lou on 2026-11-04; once, after Story 4, before Story 5). On a local build with the real providers, the QA prompt "make a 20-second video of Mara finding a key in a gallery", saying yes to each step through the Shot videos and a join. Record the storyboard (Shots, places, positions), the panels and the joined video beside the earlier QA finding. Pass: QA items 1–3 below hold as judged from the saved storyboard and the joined video's frames; Lou sees the result before QA. A fail is recorded, and the fix is planned with Lou before QA.
- [ ] **Lou's QA** (manual; on a QA host when he asks; live Muse Wonder, Meta and MiniMax calls on his go). In a fresh video, ask "make a 20-second video of Mara finding a key in a gallery" and say yes to each step. Pass:
  1. the storyboard keeps continuous action in one Shot and cuts only where the camera changes;
  2. every Shot names the gallery and shows start and end positions, which he can change in "View storyboard";
  3. the Shot videos, joined, match across the cuts: Mara on the same side, the same room, the key where it was;
  4. the Italiana wordmark is at the sidebar's top left and on the entry pages with no "a" mark, and the composer and Videos tab look as Story 1 says.
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
