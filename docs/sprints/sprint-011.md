# Sprint 011 — Storyboard

**Date:** 2026-11-03, stacked on `sprint-010` (Lou: "Go: 010 then 011 stacked") – End after completion gates and Lou's QA
**Goal:** In a local build, a signed-in user asks the agent to storyboard the script. The agent saves a storyboard of Shots from the current script: each Shot carries its purpose, framing, action, dialogue, camera note, the reference sheets it uses with each one's job, and one or two panels, whose images become the video's first and last frames. The agent makes each panel's image from that Shot's chosen sheet views (and, for a second panel, the first panel's image), then makes each Shot's video from its panel images and the Shot's text. The Storyboard tab shows the Shots and panel images, and the Videos tab plays each Shot's video, live and after a reload.
**Status:** 🟡 Implemented; Lou's QA passed on 2026-11-03 (see Final Review; the merge waits for Lou's command)

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`. Branch `sprint-011` from `sprint-010` at `514c033` (Sprint 010 complete and under Lou's QA, PR #113 open into `main`), stacked so this sprint starts before 010 merges; story branches from `sprint-011`. If Sprint 010 changes after QA, those commits are merged into `sprint-011`. This doc was drafted with Sprint 010's and re-checked against its Final Review below.
- **Tech stack:** as Sprint 010, plus MiniMax Video V2 (`MiniMax-H3`, 768P, 24 fps) from Sprint 009.
- **Current state (expected after Sprint 010):**
  - **Subjects and sheets.** The script lists its subjects (`subjects: [{id, kind: character | place | prop, name}]`, read through `scriptSubjects`), with ids kept across versions. The agent makes a subject's light reference sheet with `generate-sheet` (the later views made from the first) and files other images under subjects. Images in a sheet are named "Mara · Face close-up", and read-workspace lists each subject with its sheet's `views: [{view, versionId}]`; Assets shows each subject with its sheet and images (`subjectGroups`). Nothing yet turns chosen sheet views into image inputs: generate-image takes only plain `inputImages` (Lou, 2026-11-03), and that step is this sprint's Story 3.
  - **A saved storyboard exists, but nothing makes one.**
    - Content (`packages/contracts/src/saved-content.ts:35-43`): `{schemaVersion 1, sourceScriptVersionId, shots[1..100]}`; a Shot is `{shotId, order, intent, panels[1..100]}`; a panel is `{panelId, order, description, references[]}`, and panel references must be reference versions (`apps/api/src/artifacts/content.ts`).
    - A script has exactly one scene (`savedScriptContentSchema`, `scenes` max 1), so a storyboard covers that scene. Script dialogue is `{character, text, delivery?: voice_over | off_screen}`.
    - People edit an existing storyboard's text only (`apps/api/src/artifacts/storyboard.ts`, `apps/web/src/storyboard/planning-editor.tsx`); nothing creates one.
  - **Panel images and Shot videos are uses.** `panel_image {shotId, panelId}` and `shot_video {shotId}` bindings must target the storyboard the video currently uses (`apps/api/src/artifacts/uses.ts:47-82`). The workspace projects them as each panel's `candidateImageVersions` and `approvedImageVersionId`, and each Shot's `candidateVideoVersions` and `chosenVideoVersionId` (`apps/api/src/artifacts/store.ts:121-130`). Only people create these uses today, and a person's use always approves.
  - **UI.** The Storyboard tab (`apps/web/src/storyboard/storyboard.tsx`) shows Shots and panels with image candidates and "Use". The Videos tab lists Shot rows from `shot_video` candidates and the Generated videos list (`apps/web/src/videos/`).
  - **Video jobs (Sprint 009).** `application/video-jobs.ts` runs a MiniMax job to its end with Stop, deadlines, restart and resume; `generation.requests` stores the job with its frames, but no target (`supabase/migrations/20261107000000_generation_requests.sql`). A finished clip is saved as a draft `video` use (`apps/api/src/artifacts/generated-videos.ts`). Panel images already count as images the video uses, so they can be frames.
- **Re-check against Sprint 010's Final Review (2026-11-03):** what 010 actually shipped, and what it changes here:
  - **The room check.** Sprint 010 has no shared room error: `artifacts/use-room.ts` (`useRoom`, read-only) counts the room, and only the sheet save raises its own `no_room` (`SheetSaveError`). Stories 1, 4 and 5 use `useRoom` and raise their own save's `no_room`; `requireUseRoom` still reports `integration_failure`. The `useRoom` collaborator sits on `AssistantSheets`; generate-panel and generate-shot get their room check through their own application capability, not the sheets one.
  - **Subjects read under the lock.** `artifacts/script-reads.ts` (`scriptSubjectsNow`) is the locked read of the current script's subjects; Story 1 uses it to check Shot references. `currentSubjects` (contracts) reads them from a workspace.
  - **Optional ids.** `application/optional-id.ts` (`optionalId`) is the shared rule for an empty, whitespace or `"null"` id; every new tool uses it.
  - **The listing's budget.** read-workspace gives the subjects with their sheets at most 10 KiB (5/8) of its 16 KiB. Story 2's storyboard listing steps down within what remains after the script and subjects, with a budget case holding 50 full subjects and a 100-Shot storyboard.
  - **Sheets in the listing.** read-workspace lists each subject's first current sheet only; a second current sheet (possible only from people's sheets) is an item. Story 3 resolves a reference through `subjectGroups`' first sheet, which is the same sheet.
  - **The sheet recheck.** Sprint 010's sheet save rechecks used images by accepting any `panel_image` use (Story 2's accepted P2). Story 4 narrows it to panel uses of the current storyboard when it adds the assistant's panel uses.
  - **Re-added subjects.** A subject removed from the script and added back by name gets its old id again, so a Shot reference to it resolves again (Lou's open question; nothing here depends on the answer).
  - **Names.** `mediaVersionName(labels, version, sheetViews)` names sheet views "Mara · Face close-up" (Story 3's labels); the web's `kindLabel` gives "Character", "Place" and "Prop" (Story 6).
- **Implementation spec:** `docs/specs/implementation-spec-001.md` (§8.3, §8.5 storyboard, §8.7 video jobs, §10 Agent tool guidance). Sources: `~/projects/animation-studio/.pi/skills/create-storyboard/SKILL.md`, `references/storyboard-schema.md` (Shot fields, reference assignments with roles) and `references/panel-generation-strategy.md` (anchor first, narrow responsibilities, preserve / change only / reject if).

### Sprint-Wide Context
- **Sprint type:** Feature
- **Shared context:**
  - **Lou's decisions (2026-11-03):**
    - **Order.** Reference sheets (010), then this storyboard sprint, then joining clips (012) and questions (013).
    - **Separate thin tools.** `save-storyboard` writes the text, `generate-panel` makes a panel's image, and `generate-shot` makes a Shot's video. Each is a thin tool over shared application functions: no paid-call, save or job code is duplicated.
    - **The agent picks a panel's images; the tools wire them.** The agent chooses which images a panel is made from, guided by the tool description: usually the relevant views of the Shot's sheets, and any other image the video uses (for example one in Mara's group) when the person asks. The server adds the earlier panel, orders and labels the inputs, and picks and a Shot video's frames and text from the storyboard. Tests assert exactly what reaches Meta and MiniMax. Sheet views reach images only through panels; generate-image gets no sheet input.
    - **At most 2 panels per Shot,** used as the video's first and last frame.
    - **Dialogue in Shot videos.** Dialogue is voiced, narration is voiced by a narrator, and context is never voiced:
      - a line with no delivery is spoken by its character on screen;
      - `off_screen` is spoken by its character off screen;
      - `voice_over` is voice-over: a scene character's own voice-over, or narration by a narrator otherwise;
      - context stays in the Shot's action and panel descriptions, never in dialogue.
    - **No badges, no approval.** Assistant panels and Shot videos are drafts with no status pill. A panel's current image is the one a person chose, or else the assistant's current version.
    - **System prompt later.** A system prompt covering the agreed workflow (script, sheets, storyboard, panels, Shot videos) and how they fit together comes right after this sprint (B-041). This sprint's guidance lives in the three tools' descriptions.
  - **Shot fields (additive to schema version 1).** Optional on every Shot so existing storyboards stay valid; the agent's saves fill them:
    - `framing` (for example wide, medium, close, insert), `action` (the visible progression), `dialogue` (script dialogue lines), `cameraNote`;
    - `references: [{subjectId, role, purpose}]`: subjects in the source script, with `role` `identity | environment | prop | composition`, compatible with the subject's kind (identity → character, environment → place, prop → prop; composition → any), and a one-line purpose of at most 120 characters. A Shot names subjects, not sheet versions, so a redone sheet is used at once;
    - `intent` stays the Shot's purpose.
    - Shot `references` are the authority for the agent's inputs. The source script and the referenced subjects' current sheets at save time become version dependencies. For assistant saves, panel `references` is `[]`. Dialogue speakers must be characters in the script's scene unless the line is `voice_over`, as in scripts.
  - **One image artifact per panel, one video artifact per Shot.** A panel's assistant images are successive versions of one image artifact; a Shot's assistant videos are likewise versions of one video artifact. Earlier versions stay in history.
    - **Identity.** That artifact's id is derived by the server from the video, Shot and panel (a hash of the conversation id, `shotId` and `panelId`; for a Shot video, of the conversation id and `shotId`). It is never found through whatever a person chose for the panel or Shot, so a sheet view or Generated video a person "Use"s there is never versioned by the assistant.
    - **The use rule** keeps a person's choice intact without changing `useVersion` (`uses.ts`), where a person's "Use" on a version that already has a use flips that row to approved and demotes the binding's other uses. The assistant looks only at the use on its own artifact's latest version:
      - if that use is a draft, the new version moves it;
      - otherwise (a person approved it, or there is none yet), the new version gets a new draft use, and every other use stays as it is.

    So the use count grows by one per panel or Shot, plus one each time a person chooses an assistant version that is later remade. Lines name them as the workspace does: "Saved Shot 1 · Panel 1.2 · Version 2".
  - **The use cap, one rule for all three tools.** When a save would need a new use and the video's saved-use limit (`requireUseRoom`) is reached, the tool refuses before any paid call or save: "Not made: this video has too many saved items" (save-storyboard: "Not saved: …"). generate-panel and generate-shot check this before calling Meta or creating a MiniMax job; a save that only moves an existing draft use needs no room. A paid result that still meets the cap at save time (a race) is handled per kind: a Shot job stays `interrupted` and resumable, and the line says the video couldn't be saved yet; a panel image can't be kept without a use, so the line reads "Not saved: this video has too many saved items" and the result says the image was made but not kept.
  - **A panel's current image** is the version a person chose, or else the assistant's current version. One helper in `packages/contracts` (`currentPanelImage`, Story 2) is the only implementation; Stories 3–6 use it.
  - **Assistant saves are not journaled (B-036).** An assistant storyboard save writes no `manual_changes` row, like assistant script saves (spec §8.3), but advances the selection revision when Shot order changes or a Shot is dropped, as a person's edit does.
  - **Tool rules (spec §10).** As Sprint 010: own directories, application functions, trusted scope, account- and video-scoped resolution, no nullable inputs, harmless wrong values.
- **Non-goals:**
  - The system prompt (B-041), approval of panels or Shot videos, and choosing between candidates beyond today's "Use".
  - Joining Shot videos (Sprint 012), questions (Sprint 013).
  - Animation-studio's coverage ledger (Direct / Inherited / Not visible) and recursive invalidation; a changed sheet does not mark panels stale.
  - People editing the new Shot fields by hand; the planning editor keeps editing intent and panel descriptions.
  - More than one scene per storyboard, timings or an animatic.
  - MiniMax's reference-image mode (it can't be combined with frames).

### Affected Flows
- **Existing flows affected:**
  - §8.1 Start or resume work (the chat): new tool lines for saving the storyboard, making a panel and making a Shot video ("Making a video… · 2 min" as Sprint 009).
  - §8.3 Develop script, references and storyboard: the agent saves the storyboard, beside its script and sheet saves, with the same draft and no-journal exception.
  - §8.5 Review, revise and choose: assistant draft panel images and Shot videos sit beside a person's chosen ones; the Storyboard tab shows them. A person's planning edit of an agent storyboard keeps the agent's Shot fields.
  - Videos tab: Shot rows include assistant draft Shot videos.
  - Assets: each subject entry lists the Shots that reference it.
  - §8.7 Stop, cancel and recover (video jobs): a job can carry a Shot target; Stop, restart and resume keep it, and a resume saves the clip to that Shot.
  - read-workspace: lists the storyboard's Shots, panels and their current images.
- **New flows introduced:**
  - The agent storyboards the script, makes panels from sheets and makes Shot videos from panels. Folded into spec §8.3 (creation), §8.5 (review and choice) and §8.7 (Shot jobs) before the completion deep gate.

### Verification Strategy

For executable behavior (code, config/scripts, and actual machine-consumed contracts or workflows), define functional and relevant regression proof before implementation. Policy/workflow prose alone is not proof of executable behavior. For descriptive-only docs/design prose, record functional and regression N/A with rationale and use editorial review for accuracy/completeness/consistency. Do not add persistent prose/heading assertion suites. Keep applicable existing checks and design visual/safety/consistency/approval checks under the design skill.

Verification has two categories:

- **Functional verification:** proof of executable behavior introduced or changed by this sprint, or justified N/A for descriptive-only work.
- **Regression verification:** proof of relevant existing behavior, or justified N/A for descriptive-only work.

Each implementation story must include:

- Functional verification for executable behavior it delivers, or justified N/A for descriptive-only scope.
- Targeted regression verification for existing behavior at risk, or justified N/A for descriptive-only scope.

At sprint completion, run the applicable regression suite on the combined sprint branch plus planned cross-story checks not covered by that suite. Do not rerun each story's checks separately when the suite already covers them. For descriptive-only work, use editorial review and applicable existing checks. Reusable functional checks become future regression checks; one-off editorial review is evidence, not a persistent suite.

**Lou's core tests:**
Lou's four (2026-11-03), with the stories that prove each:
1. **The agent saves the storyboard's text** (Shots, dialogue, sheet references, panels), and each panel's image attaches as it is made: Stories 1, 2 and 4.
2. **It can be seen in the Storyboard tab**, text and panel images, with each Shot's video playing in the Videos tab: Story 6.
3. **The agent makes a panel from the images it picks**, sent in a fixed order with each one's job: Stories 3 and 4.
4. **The agent makes a Shot's video** with its frames and text taken from the storyboard: Story 5.

**No paid calls in tests.** The Meta and MiniMax fakes record what they receive; tests assert the exact images, frames and prompt text. Real calls happen only at Lou's QA.

**Budget (Lou, MVP testing budget).** Targeted tests per story plus the commit and push gates; new cases in existing files and harnesses; no screenshot or visual suites.

### Tests requiring extra consideration

1. **Integration cases on the shared test stack** in `apps/api/test/integration/tool-activity.test.ts` with storage, the checker and both fakes (Stories 1, 2, 4 and 5; Story 3 is a pure function proven by unit cases). Only real turns prove that versions, uses and jobs land together and what reaches each provider. One stack start per story.
2. **A migration** (Story 5): a nullable `target` on `generation.requests`. `generation-jobs.test.ts` covers it, including a restart with a targeted job.
3. **One browser journey** (Story 6) in `test/e2e/shots.spec.ts`: scripted turns save a storyboard, make two panels and a Shot video; the Storyboard tab shows the Shot's text and both panel images, and the Videos tab plays the Shot video, live and after a reload. About 1–2 min.
4. **Deep gate at Sprint Completion**, and again on the `main` pre-merge.

### Stories
**Constraints:** Target 5-8 stories per sprint. Each story should be small enough to review, verify, and merge independently. Split stories that combine unrelated outcomes or cannot be verified with a clear functional/regression verification plan.

This sprint has 6 stories: the storyboard save, its tool, panel inputs, generate-panel, generate-shot and the tabs.

#### Story 1: Assistant storyboards
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P2 — the contracts test file wasn't named; no rule for an id not in the base or a panel moved under another Shot.
  - Resolution: The test file is `apps/api/test/unit/artifacts/content.test.ts`; both ids are invalid, with integration cases.
  - Fresh review: P1 — a person's planning edit dropped the new Shot fields and Shot-reference dependencies (`editedPlan`). P2 — the selection-revision rule disagreed with `shotOrderChanged`; the revised use's state and a built-in base were unstated; the role field wasn't named.
  - Resolution: An AC and a `storyboard-revisions.test.ts` case keep the fields; the rule follows `shotOrderChanged`; the use moves as a draft and a built-in base starts an owned storyboard; the field is `shots[N].references[M].role`.
  - Final review: P1 — the strict workspace `shot` contract would refuse the new fields; the cap was unreachable through `requireUseRoom`. P2 — dependency rule on a person's edit; field bounds. Resolved: the contract is extended with a read case; Sprint 010's room error with a cap case; the base's dependencies are copied; bounds pinned with cases.
- **As a** filmmaker, **I want** the agent's storyboard saved with each Shot's text and sheets, **so that** panels and videos can be made from it.
- **Dependencies:** Sprint 010
- **Acceptance criteria:**
  - [x] **Schema.** `savedStoryboardContentSchema` gains the optional Shot fields in Shared context, still `schemaVersion: 1`: `framing` free text of at most 80 characters, `action` and `cameraNote` at most 2,000, `dialogue` at most 20 lines, `references` at most 10 with each `subjectId` at most once per Shot. Existing storyboards and built-in work still parse.
  - [x] **The workspace contract.** The strict workspace `shot` (`packages/contracts/src/models.ts`) gains the same optional fields, so a workspace holding an agent storyboard still parses (`store.ts` spreads every saved Shot field into the projection).
  - [x] **Save.** A new `apps/api/src/artifacts/assistant-storyboards.ts` saves the video's storyboard, following `assistant-scripts.ts`:
    - the source is the video's current script version, chosen by the server; with no script the save is refused "Not saved: there is no script yet";
    - 1–2 panels per Shot and Shot references to subjects in the source script, each role compatible with the subject's kind; a subject not in the script is invalid with the field `shots[N].references[M].subjectId`, and a mismatch with `shots[N].references[M].role`; a subject with no sheet yet may be referenced;
    - new Shots and panels get server-made ids; a Shot or panel given an id from the base version keeps it, so its images and videos stay attached; an id that isn't in the base, or a panel id moved under another Shot, is invalid (`shots[].shotId` or `panels[].panelId`), so a typo never silently detaches work;
    - a new storyboard is version 1 with a draft `storyboard` use; with a base that is the current version it is the next version, and the same use moves to it as a draft, as `assistant-scripts.ts` does; an earlier base is stale; when the video uses a built-in storyboard, the save starts a new owned storyboard on the same use, keeping the given ids;
    - Shot references and the source script are the version's dependencies; panel `references` is `[]`; a dialogue speaker not in the script's scene (and not `voice_over`) is invalid;
    - no journal row; the selection revision advances when the Shot sequence changes (`shotOrderChanged`): a reorder, a drop, an added Shot or the first save.
  - [x] **A person's edit keeps the agent's fields.** `editedPlan` (`artifacts/storyboard.ts`) carries each Shot's `framing`, `action`, `dialogue`, `cameraNote` and `references` from the base unchanged, and `editStoryboard` copies the base version's sheet dependencies unchanged.
- **Functional verification:**
  - [x] Integration (`artifact-writes.test.ts`, calling the save directly): a save with two Shots (one with two panels) is version 1 with the current script as source, the script and the referenced subjects' sheets as dependencies, and a draft use; a revision keeping one Shot's ids keeps that Shot's existing `panel_image` use attached; a revision that reorders Shots, and one that adds a Shot, advance the selection revision and one that only changes text leaves it; a revision moves the same use as a draft; a save over a built-in storyboard starts an owned one on the same use; an unknown Shot id and a panel id moved to another Shot are invalid; a subject not in the script is invalid with its field; a role that doesn't match the subject's kind is invalid with its field; a speaker not in the scene is invalid; an earlier base is stale; no script is refused.
  - [x] Unit (`apps/api/test/unit/artifacts/content.test.ts`): the Shot fields parse; an old storyboard without them parses; an 81-character framing, 11 references and a subject referenced twice in one Shot are refused.
  - [x] Integration (`artifact-reads.test.ts`): a workspace holding an agent storyboard with every Shot field set parses and returns those fields.
  - [x] Integration (`artifact-writes.test.ts`): at the use cap, a first storyboard save is `no_room` and a revision saves.
- **Regression verification:**
  - [x] `storyboard-revisions.test.ts` (a person's planning edits approve, and stale edits are rejected), with one new case: a person edits the intent of an agent storyboard with every Shot field set, and the fields survive and the new version's dependencies are exactly the base's; `built-ins.test.ts` (built-in storyboards still read) and `artifact-writes.test.ts` pass, with `test/e2e/saves.spec.ts`.
- **Editorial/design verification:** N/A.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(contracts): Add Shot fields to the storyboard`
  2. `Feat(artifacts): Save the assistant's storyboards`
- **Technical notes:** Follow `artifacts/assistant-scripts.ts` (owner lock, base, stale versus not-found) with an `application/assistant-storyboards.ts` saver wired in `mastra/backend.ts`. Extend `assertContentDependencies` (`artifacts/content.ts`) for Shot references. Reuse `selection.ts`'s `shotOrderChanged` and `advanceSelectionRevision` as `storyboard.ts:90` does, without its `manual_changes` insert. A first save at the use cap (`useRoom` read under the owner lock, as `assistant-references.ts` does) raises the storyboard save's own room error, which the saver maps to `no_room` (`requireUseRoom` alone reports `integration_failure`); a revision needs no room. Add `artifact-reads.test.ts` to the regression run.

#### Story 2: save-storyboard tool and the agent's view of it
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P2 — the two `tool-activity.test.ts` files were ambiguous; the storyboard listing had no bound; the use-cap line was missing.
  - Resolution: Both paths are spelled out; the listing stays within 50 items and 16 KiB with a `truncated` fallback and a unit case; the cap line is added (Shared context's one cap rule).
  - Fresh review: P2 — ids plus 200-character intents can still overflow 16 KiB; the per-candidate items were unstated.
  - Resolution: A stepped fallback with a 200-character-intent case; per-candidate items stay.
  - Final review: P2 — base outcomes; "job" used for role. Resolved: both base lines; the role line.
- **As a** filmmaker, **I want** to ask the agent to storyboard the script, **so that** I get Shots planned from it.
- **Dependencies:** Story 1
- **Acceptance criteria:**
  - [x] **Tool.** `apps/api/src/agent/tools/save-storyboard/` takes `shots` (each with optional `shotId`, `intent`, `framing`, `action`, `dialogue`, `cameraNote`, `references`, and 1–2 `panels` of `{panelId?, description}`) and `base` (empty for a first save). Order comes from array order. No input is nullable. The line reads "Saving the storyboard…", then "Saved Storyboard · Version 1", or a readable refusal:
    - "Not saved: there is no script yet";
    - "Not saved: the storyboard changed since you read it" (an earlier base, or an empty base when a storyboard exists);
    - "Not saved: that storyboard wasn't found" (a base that isn't this video's storyboard);
    - "Not saved: that subject isn't in the script; add it to the script first";
    - "Not saved: a subject's role doesn't match its kind" (with Story 1's `shots[N].references[M].role` field);
    - "Not saved: the storyboard wasn't valid" (with the field);
    - "Not saved: this video has too many saved items";
    - "Not saved: saved work is unavailable".
  - [x] **Guidance.** The description carries the storyboard steps from the animation-studio skill, adapted: read the whole script first; use as few Shots as tell it clearly; one uninterrupted camera view per Shot; a second panel only when action or camera changes without a cut; dialogue lines with their delivery, and context in the action, not in dialogue; name each Shot's sheets with one job each; show the person the Shot plan before making panels.
  - [x] **Current image.** `currentPanelImage(panel)` in `packages/contracts` returns the version a person chose, else the assistant's current version, else none. It is the only implementation of the rule.
  - [x] **read-workspace.** The listing gives the storyboard once with its version, and per Shot its id, intent, framing, sheet references, and each panel's id, description and current image version id from `currentPanelImage`, within the listing's existing 50-item and 16 KiB bounds (spec §8.1): when the Shots don't fit, the listing steps down to Shot ids and intents (each clipped to 200 characters, as the listing clips text), then to Shot ids only, then to the first Shots that fit, saying `truncated` at each step; item mode on the storyboard returns its full content. The per-candidate panel-image and Shot-video items stay as today, within the same bounds.
- **Functional verification:**
  - [x] Integration (`tool-activity.test.ts`): a scripted save-storyboard turn saves version 1 and the line reads "Saved Storyboard · Version 1"; a following read-workspace turn lists its Shots and panel ids; a second save with `base` set keeps the ids given.
  - [x] Unit (`save-storyboard.test.ts`): empty and `"null"` optional values are harmless; every refusal has its line; no input is nullable.
  - [x] Unit (`apps/api/test/unit/contracts/current-panel-image.test.ts`): chosen beats assistant's, assistant's when none chosen, none when empty. Unit (`read-workspace.test.ts`): the listing uses it, and a 100-Shot storyboard with 200-character intents steps down with `truncated` and stays within 16 KiB.
- **Regression verification:**
  - [x] `apps/api/test/integration/tool-activity.test.ts`, `apps/api/test/unit/agent/tool-activity.test.ts` and `apps/api/test/unit/agent/read-workspace.test.ts` pass in full.
- **Editorial/design verification:** Tool lines follow design.md's activity-line rules.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(agent): Add the save-storyboard tool`
  2. `Feat(agent): List the storyboard's Shots`
- **Technical notes:** Panel and Shot names already come from `workspace-entries.ts` ("Shot N · Panel N.M"); keep them. Keep the tool description within the provider's tool-description budget; the storyboard steps are a compact adaptation, not the skill.

#### Story 3: Panel inputs from sheets
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Moved from Sprint 010, whose `sheets` field on generate-image Lou dropped (2026-11-03). Its review left P2s: the 10-input count before or after de-duplication, where labels come from, the return type, which layer reads image data and re-checks ids, and the exact preface line.
  - Resolution: All are pinned below. The function serves generate-panel only, so it takes the Shot's references rather than free sheet lists.
  - Fresh review: P1 — a Shot reference went stale once its sheet was revised. P2 — the anchor's label source and panels after the second; `readImageInputs` doesn't catch storyboard changes.
  - Resolution: References resolve to the sheet's current version by artifact; every later panel anchors on panel 1 with a defined label; the read rule is reworded, each with a case.
  - Final review: P2 — the removed subject's name; a subject referenced twice; `size` for later panels. Resolved: named by its sheet or id; once per Shot; `size` for every later panel, each with a case.
- **As a** filmmaker, **I want** the images the agent picks for a panel sent in a fixed order with each one's job, **so that** the image model knows what each image is for.
- **Dependencies:** Story 2
- **Acceptance criteria:**
  - [x] **One pure function.** `panelInputs(workspace, { shot, panel, images })` in `apps/api/src/application/panel-inputs.ts` is the only place that turns the picked images, the Shot's sheets and its earlier panel into a panel's inputs. It reads only the workspace projection and returns:
    - `{ kind: 'resolved', inputs: [{ versionId, label, job }], preface, size? }`, where `size` is panel 1's current image width and height for every panel after a Shot's first;
    - `{ kind: 'not_found' }` when the Shot or panel isn't in the current storyboard;
    - `{ kind: 'needs_first_panel' }` for a second panel whose first panel has no current image;
    - `{ kind: 'image_not_found' }` when a picked image isn't one the video uses;
    - `{ kind: 'too_many', count }` when more than 10 inputs remain;
    - `{ kind: 'subject_gone', subjectName }` (above).
  - [x] **Subjects to sheets.** Each Shot reference resolves through its subject to the subject's current sheet (`subjectGroups`' first sheet), so a redone view is used at once. A referenced subject with no sheet contributes no images. A referenced subject no longer in the current script is `{ kind: 'subject_gone', subjectName }`, named by its sheet's own `subject.name`, or by its id when it has no sheet. Story 1 allows each subject once per Shot, so each sheet view has one role and purpose.
  - [x] **The anchor.** For every panel after a Shot's first (a person's or built-in Shot can have more than two), panel 1's current image (`currentPanelImage`) comes first, with the job "keep camera, setting and staging".
  - [x] **The images.** With `images` given, exactly those are passed: a view of a referenced subject's sheet takes that reference's role and purpose; any other image the video uses (another image of the subject, an upload, a view of an unreferenced subject's sheet) is passed after them in the given order. With `images` empty, every referenced sheet is passed whole.
  - [x] **Order.** The anchor, then sheets by role: identity, environment, prop, composition; within a role, in the Shot's reference order; within a sheet, in view order; then the other picked images. A repeated image keeps its first place. The 10-input limit counts after that.
  - [x] **Labels and jobs.** Each label is the workspace's name for that image (`mediaVersionName` with Sprint 010's sheet names, so "Mara · Face close-up", and for the anchor "Shot N · Panel N.M" with no version suffix, from the same numbering as `workspace-entries.ts`). Each sheet view's job is the Shot reference's purpose; another picked image's job is "as the prompt describes".
  - [x] **The preface.** One line per input, "Input N: <label> — <job>", in input order, joined by newlines. Purposes are at most 120 characters, so the preface stays under 2,500 characters.
  - [x] **Who reads the images.** The function returns version ids only. Its caller (Story 4) reads the data through `readImageInputs`, which checks again that each image is still used by the video: an anchor whose panel was dropped reads as not found. Other storyboard changes during the call are caught by Story 4's save-time "panel is gone" rule.
- **Functional verification:**
  - [x] Unit (`apps/api/test/unit/application/panel-inputs.test.ts`, on built workspace projections):
    - a Shot with identity, environment and prop references and two chosen views from the character's sheet and one from the place's sheet resolves to exactly those three in role order, with the exact preface text;
    - empty `images` passes every referenced sheet whole, in role and reference order;
    - a picked image filed under Mara that isn't in her sheet, and a view of an unreferenced subject's sheet, come after the sheet views with the job "as the prompt describes";
    - a second panel puts panel 1's current image first with its job and returns panel 1's size; a person's chosen panel 1 image is the anchor over the assistant's;
    - a second panel with no panel 1 image is `needs_first_panel`; an unknown Shot or panel is `not_found`; a picked image the video doesn't use is `image_not_found`;
    - 11 listed images that de-duplicate to 10 resolve; 11 distinct images are `too_many` with count 11;
    - a `composition` reference to a character sorts after prop;
    - a sheet redone after the storyboard save resolves to its current views; a referenced subject with no sheet adds nothing; a subject removed from the script is `subject_gone` with its sheet's name, and one with no sheet is named by its id; a third panel's `size` is panel 1's;
    - a third panel of a person's three-panel Shot anchors on panel 1, labelled "Shot 1 · Panel 1.1".
- **Regression verification:**
  - [x] `apps/api/test/unit/contracts/current-panel-image.test.ts` and `apps/api/test/unit/contracts/sheet-views.test.ts` pass (the rules it builds on unchanged).
- **Editorial/design verification:** N/A — no user-facing copy; the preface is model input, proven by its exact-text case.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(application): Choose a panel's inputs`
- **Technical notes:** Keep it free of I/O so every rule is a unit case; the application function in Story 4 reads the workspace once and passes it in.

#### Story 4: generate-panel tool
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P1 — moving the panel's draft use conflicted with `useVersion`, which flips that same row to approved when a person chooses it. P2 — `views` across several sheets, the cap pre-check, and the description's review.
  - Resolution: Shared context's use rule (a new draft use once the old one is approved; `useVersion` unchanged) with an integration case; the views rule lives in Story 3; the cap is checked before Meta only for a new use, with a case at the cap; the description is reviewed against the panel strategy.
  - Fresh review: P1 — the panel's own image artifact had no identity, so a sheet view a person chose could be versioned, and the chain after a second choice was undefined. P2 — "never dropped" can't hold for a panel at the cap.
  - Resolution: A derived artifact id per panel and a use rule on that artifact's latest version, with cases for both; the panel cap race has its own line.
  - Final review: P2 — creating the derived artifact row; the cap wording and race. Resolved: insert the row first with a prefix; cap only when a new use is needed, with a race case.
- **As a** filmmaker, **I want** each panel made from the Shot's sheets, **so that** characters and places match across Shots.
- **Dependencies:** Story 3
- **Acceptance criteria:**
  - [x] **Tool.** `apps/api/src/agent/tools/generate-panel/` takes `shot`, `panel`, `prompt`, `images` (image version ids the agent picks from read-workspace; empty means all of the Shot's sheets) and `size`. It makes one image. For a Shot's second panel, `size` is ignored and the image takes the first panel's dimensions, so both frames match.
  - [x] **Inputs, in code.** An application function, `makePanel` in `application/panels.ts`, reads the workspace once and calls Story 3's `panelInputs`, unchanged. Its outcomes are refused before any Meta request:
    - `not_found`: "Not made: that panel wasn't found";
    - `subject_gone`: "Not made: Mara isn't in the script any more; update the storyboard";
    - `needs_first_panel`: "Not made: make the first panel first";
    - `image_not_found`: "Not made: an input image wasn't found";
    - `too_many`: "Not made: too many input images (12); choose fewer images".

    It then reads the images through `readImageInputs` and sends Meta the inputs in order, with the preface before the model's prompt.
  - [x] **Save.** The image is checked and stored as generate-image does, with its inputs as dependencies, but saved as the next version of that panel's own image artifact (its derived id, Shared context), with a `panel_image` use by Shared context's use rule. It gets no `reference` use, so it never appears in Assets. An assistant use never approves, and a person's chosen version stays chosen. The line reads "Saved Shot 1 · Panel 1.2 · Version N"; the image shows under the line.
  - [x] **The panel is gone.** If the panel left the current storyboard while Meta worked, the image is saved as a plain draft image instead, and the line reads "Saved Image 7 · Version 1 (its panel is gone)"; paid work is never lost.
  - [x] **Use cap.** When a new use is needed and the video's saved-use limit is reached (`artifacts/use-room.ts` `useRoom`, see the re-check above), nothing is sent: "Not made: this video has too many saved items". If the last use is taken while Meta works, the line is the same and the result says the image was made but not kept; no version or use is added.
  - [x] **Guidance.** The description says to pick only the images the panel needs, as an artist would: usually the relevant views of the Shot's sheets, not whole sheets; other images, such as one from a character's group, when the person asks; and how to write a panel prompt from the Shot: what to preserve, what changes only, and what to reject (camera drift, changed clothing, duplicate props), after the animation-studio panel strategy.
- **Functional verification:**
  - [x] Integration (`tool-activity.test.ts`): with sheets and a saved storyboard:
    - panel 1 sends Meta exactly the picked images in order with the preface; panel 2 sends panel 1's image first, then its picked images, at panel 1's size; a picked image the video doesn't use is refused with no request;
    - each result is version 1 of its panel's image with a draft `panel_image` use and no `reference` use; a second call on panel 1 saves version 2 and moves the same use;
    - a person "Use"s one of Mara's sheet views on panel 1; the next generate-panel saves version 1 of the panel's own artifact and adds no version to Mara's image;
    - the chain: a person approves version 1, the assistant makes version 2 (a new draft use), the person chooses version 2, and the assistant's version 3 gets a new draft use while version 2 stays approved;
    - a panel from another video is not found and Meta gets no request; panel 2 before panel 1 is refused with no request;
    - a panel dropped by a storyboard save during a held Meta call saves a plain draft image with the "its panel is gone" line;
    - with two referenced sheets and one chosen view, only that view is sent;
    - after a person chooses the assistant's version 1, a new assistant version 2 gets a new draft use and version 1 stays approved;
    - with the last use taken while the fake holds the request, the cap line is returned and no version or use is added;
    - at the use cap, a new panel is refused with no Meta request, and so is a panel whose latest version a person approved; version 2 of a panel whose latest use is a draft is saved.
  - [x] Unit (`apps/api/test/unit/agent/generate-panel.test.ts`): harmless optional values, every refusal's line.
- **Regression verification:**
  - [x] The generate-image block, `apps/api/test/unit/application/panel-inputs.test.ts`, `generate-image.test.ts`, `storyboard-revisions.test.ts` and `shot-video-choice.test.ts` pass (a person's "Use" still approves and demotes; panel inputs unchanged).
- **Editorial/design verification:** The description is reviewed against the animation-studio panel strategy (preserve, change only, reject if), recorded in the PR.
- **Manual-only behavior verification:** N/A. Lou makes real panels at QA.
- **Planned commits:**
  1. `Feat(artifacts): Add the assistant's panel images`
  2. `Feat(agent): Add the generate-panel tool`
- **Technical notes:** `store.ts:141` refuses a use whose purpose differs from the content kind, so the panel save writes its `panel_image` use directly in the transaction, as `generated-videos.ts` writes its clip use, after the target checks in `uses.ts:47-59` (extract them so both paths share one check). Reuse `generated-images.ts`'s verify-and-store step and `publishVersion` with the panel's derived artifact id (no migration: artifact ids are server-chosen text). `publishVersion` inserts the artifact row only when no id is passed, so insert the derived `artifacts.artifacts(owner_id, artifact_id, kind)` row with `ON CONFLICT DO NOTHING` first; prefix the hash input with `panel:` (Story 5: `shot:`). Panel 1's dimensions come from its current image's media facts.

#### Story 5: generate-shot tool
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P1 — the moving draft use conflicted with `useVersion` (as for panels). P2 — no refusal for an over-long Shot text, no cross-video not-found case, no unit file, no cap pre-check.
  - Resolution: Shared context's use rule; the 7,000-character refusal line, the cross-video case, `generate-shot.test.ts` and the cap pre-check before any MiniMax create are added, each with a case.
  - Fresh review: P1 — the "Shot is gone" fallback would be refused as `frame_unused`, since a dropped Shot's panels aren't images the video uses. P2 — `target` wasn't immutable; Shot videos needed the panel identity rule.
  - Resolution: The fallback checks frames as owned versions only, with `frame_unused` kept for plain jobs; `target` joins the immutable columns with a case; the derived id applies to Shot videos.
  - Final review: P2 — cap race and draft-at-cap cases; the voice-over format; the insert grant. Resolved: all added with cases.
- **As a** filmmaker, **I want** each Shot's video made from its panels and its text, **so that** the clip follows the storyboard.
- **Dependencies:** Story 4
- **Acceptance criteria:**
  - [x] **Tool.** `apps/api/src/agent/tools/generate-shot/` takes `shot`, `prompt` (the motion: how the action moves and the camera) and `durationS` (4–15, default 6). No frames, ratio or count.
  - [x] **Frames and text, in code.** An application function resolves the Shot in the current storyboard:
    - first frame: panel 1's current image; last frame: panel 2's, when the Shot has two panels; a panel with no image is "Not made: make the Shot's panels first"; a person's or built-in Shot with more than two panels uses its first and last panels by order;
    - a Shot with no `action` uses its `intent` in its place;
    - the MiniMax prompt is the Shot's action (or intent) and camera note, then its dialogue by the Shared context rules (`Mara says: "…"`, `Mara, off screen, says: "…"`, `Mara, in voice-over, says: "…"` for a scene character, `Narrated in voice-over: "…"` otherwise), then the model's motion prompt; with no dialogue it adds "No one speaks."; it stays within MiniMax's 7,000 characters, or the call is refused before any job is saved: "Not made: the Shot's text is too long for the video prompt".
    - a Shot that isn't in the video's current storyboard (another video's, or unknown) is "Not made: that Shot wasn't found".
  - [x] **Jobs carry the Shot.** `generation.requests` gains a nullable `target` (`{shotId}`), saved with the job. Stop, deadlines, restart and resume keep it; the existing `generate-video` `resume` finishes a Shot job and saves it to its Shot.
  - [x] **Save.** The clip is checked and saved as Sprint 009 saves clips, but as the next version of that Shot's own video artifact (its derived id, Shared context) with a `shot_video` use by Shared context's use rule, instead of a `video` use, so it shows in the Shot's row and not in Generated videos. A person's chosen Shot video stays chosen. The line reads "Saved Shot 1 · Video · Version N".
  - [x] **The Shot is gone.** If the Shot is no longer in the current storyboard when the clip arrives, the clip is saved as a generated video instead, and the line reads "Saved Video 3 · Version 1 (its Shot is gone)"; paid work is never lost. For this fallback, the frames are checked only as the account's image versions (they stay dependencies), not as images the video uses, since a dropped Shot's panels no longer count; a plain Sprint 009 job keeps its `frame_unused` rule.
  - [x] **Guidance.** The description says the frames and the Shot's text are supplied, and the prompt describes only motion and camera.
- **Functional verification:**
  - [x] Integration (`tool-activity.test.ts` generate-video block): a two-panel Shot sends MiniMax panel 1 as `first_frame` and panel 2 as `last_frame`, and a prompt starting with the Shot's action, then `Mara says: "…"` and a narrated line, then the motion prompt; the clip is a draft `shot_video` candidate of that Shot; a one-panel Shot sends only a first frame; a Shot with no dialogue ends with "No one speaks."; a Shot without panel images is refused with no create.
  - [x] Integration: Stop during a Shot job, then `generate-video` resume, saves the clip to the Shot with one create; the poll deadline on a Shot job leaves it `interrupted` with its target, and a resume saves to the Shot; a Shot removed before the clip arrives saves a generated video with the "its Shot is gone" line; a person's or built-in Shot with three panels and no action sends its first and last panels and its intent; an over-long Shot text is refused with no create and no job row; another video's Shot is not found with no create; at the use cap a Shot with no Shot video yet is refused with no create, while a Shot whose latest use is a draft saves its next version; with the last use taken while the fake holds the poll, the job stays `interrupted` and resumable and the line says the video couldn't be saved yet; a `voice_over` line by a scene character renders `Mara, in voice-over, says: "…"`; a person "Use"s a Generated video on a Shot, and the next generate-shot saves version 1 of the Shot's own artifact without versioning that video.
  - [x] Unit (`apps/api/test/unit/agent/generate-shot.test.ts`): harmless optional values and every refusal line.
  - [x] Integration (`generation-jobs.test.ts`): `target` is saved and survives the restart pass; an update that changes `target` is refused.
- **Regression verification:**
  - [x] The whole generate-video block (Sprint 009's Stop, deadlines, restart, resume, failures and the `frame_unused` case), `generation-jobs.test.ts` and `shot-video-choice.test.ts` (a person's chosen Shot video stays chosen; an assistant draft never demotes it) pass.
- **Editorial/design verification:** The description is reviewed (frames and Shot text are supplied; the prompt covers motion and camera only), recorded in the PR.
- **Manual-only behavior verification:** N/A. Lou makes real Shot videos at QA.
- **Planned commits:**
  1. `Feat(generation): Save a job's Shot target`
  2. `Feat(application): Make a Shot's video from its panels`
  3. `Feat(agent): Add the generate-shot tool`
- **Technical notes:** Add `target jsonb NULL` in a new migration, add it to `generation.check_request_transition`'s immutable identity columns and to the `wp_serving` INSERT column grant, and carry it through `jobs.ts` (`begin`, `job()`), `video-jobs.ts` and the saver. The clip saver (`generated-videos.ts`) gains a Shot target path that checks room only when it inserts a new use (today it always calls `requireUseRoom`) and writes the `shot_video` use with the shared target check from Story 4. Reuse `video-jobs.ts`'s `start` with frames and prompt resolved by the new function; no second job runner.

#### Story 6: Storyboard and Shot videos in the tabs
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: P2 — dialogue delivery labels, and no status on the Videos Shot row, weren't asserted.
  - Resolution: The labels are pinned ("Mara", "Mara (off screen)", "Narration") and the journey asserts no `.wp-status` on the Shot row.
  - Final review: P2 — design.md's Assets section. Resolved: added.
- **As a** filmmaker, **I want** to see the storyboard's Shots with their text and panel images, and play each Shot's video, **so that** I can follow the work as the agent makes it.
- **Dependencies:** Story 5
- **Acceptance criteria:**
  - [x] **Storyboard tab.** Each Shot shows its intent, framing, action, dialogue lines labelled by delivery ("Mara" for spoken, "Mara (off screen)", "Narration" for voice-over; a scene character's own voice-over reads "Mara (voice-over)", as the agent decides by the speaker it names, Lou 2026-11-03), camera note and subject names, and its panels with their current images ("Planned panel" placeholder before one exists, design.md Placeholders). No status pills on assistant work. The tab updates after each tool line without a reload. *After Lou's QA (#130): the Shot's text and panel images are in "View storyboard", and the tab is the summary; see the QA follow-up below.*
  - [x] **Videos tab.** A Shot row shows its assistant draft videos and plays them in the existing viewer; Generated videos keeps clips with no Shot.
  - [x] **Assets.** Each subject entry adds the Shots that reference it, as in the demo ("Character · Shots 1 and 2").
  - [x] **Design guide.** design.md's Storyboard shots and Video rows sections describe the Shot fields and the absence of status on assistant drafts, and its Assets section adds the subject entry's Shot line.
- **Functional verification:**
  - [x] Browser journey (`test/e2e/shots.spec.ts`): scripted turns save sheets, a storyboard with one two-panel Shot, both panels and the Shot video.
    - The Storyboard tab shows the Shot's intent, framing, action, a dialogue line with its delivery ("Mara", "Narration"), the camera note and the subject names; both panel images have naturalWidth > 0; no `.wp-status`. *Since #130 the journey proves the intent and framing in the tab's summary line ("medium · 2 panels"), the action, dialogue, camera note and subjects in "View storyboard", and that the tab has no action, dialogue or camera note.*
    - The Videos tab's Shot row has no `.wp-status` and plays the video: `data-player-status` is playing or ended, or `currentTime > 0`, as Sprint 009's journeys check.
    - Assets shows no row for either panel image, and Mara's entry reads "Character · Shot 1".
    - After a reload the same holds.
- **Regression verification:**
  - [x] `test/e2e/shots.spec.ts`, `saves.spec.ts` and `chat.spec.ts` pass in one targeted run (existing Shot video choice, planning edits, Generated videos and the chat unchanged).
- **Editorial/design verification:** Lou checks the Storyboard tab at QA against design.md.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(web): Show the Shot fields and panel images`
  2. `Feat(web): Play assistant Shot videos in Videos`
  3. `Docs(design): Describe the agent's storyboard`
- **Technical notes:** `apps/web/src/storyboard/storyboard.tsx` renders Shots and panel candidates; add the fields and use `currentPanelImage`. `apps/web/src/videos/videos.tsx` already builds Shot rows from `candidateVideoVersions`. Keep the planning editor for intent and panel descriptions only.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [x] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [x] Run the applicable regression suite on the combined sprint branch.
- [x] Run any planned cross-story checks not covered by that suite.
- [x] Record results and unresolved issues in a brief `## Final Review`.

For descriptive-only work, use editorial review and applicable existing checks. Preserve applicable design checks and approval gates. Failed, ambiguous, or unrun required checks remain non-pass.

Sprint-specific completion items:
- [x] Fold storyboard creation into spec §8.3, assistant drafts beside a person's choice into §8.5, and the Shot target into §8.7, with the §4 `artifacts`, `generation` and `agent` rows.
- [x] Deep gate on the combined branch; `pnpm live:image` and `pnpm live:video` pass dry.
- [x] A QA build for Lou with live Muse Spark, Meta and MiniMax: storyboard a short script with sheets, make the panels, and make one Shot video (one paid MiniMax call per Shot Lou asks for). Pass:
  - each Shot shows its fields and 1–2 panel images in the Storyboard tab, with no status pill;
  - in the QA database, each panel's Meta inputs are the images the agent picked, and panel 2's first input is panel 1's image;
  - the Shot video's frames are its panel images, and it plays in the Shot's row after a reload.
- [x] Hand B-041 (the system prompt) to the next planning round.

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

- **Outcome:** the goal is met in the scripted build. Lou's live QA of Sprints 010 and 011 together, on a QA host at `1751b27`, passed on 2026-11-03 (see the QA line below). Every story AC and verification item is met, with the deviations recorded below. Each story merged into `sprint-011` after an independent review of its final head scored at least 4/5 with no open P0/P1. The verdicts are recorded in the PR bodies:
  - Story 1, #115 (assistant storyboards): 3/5, then 5/5. The P1 was a read case that didn't go through the strict workspace contract.
  - Story 2, #116 (save-storyboard and the agent's view): 4/5, then 4/5.
  - Story 3, #117 (panel inputs from sheets): 4/5, then 5/5.
  - Story 4, #118 (generate-panel): 4/5, then 5/5.
  - Story 5, #119 (generate-shot): 4/5, then 5/5.
  - Story 6, #120 (the tabs): 3/5, then 4/5. The two P1s were verification gaps: a regression claim `saves.spec` doesn't cover, and no proof that a person's chosen panel shows. The journey now proves both.
- **Combined-branch verification:** the deep gate (`.checks/regression.sh --tier=deep`, 481 s, run `.checks/.logs/run-qmwlyuup`) passed at `1751b27`. That head is the `sprint-011` code after Story 6, plus this spec fold.
  - Results: unit 265/265, tooling 6/6, integration 185/185, browser 34/34.
  - Audit is NON-PASS, as approved: the same 2 moderate advisories, `@hono/node-server` (B-004) and `minimatch` GHSA-g3hv-75wg-m249 (B-008). There are no high or critical advisories.
  - Logs: `outputs/verification/sprint-011/deep-1751b27/`.
- **Cross-story checks:** none beyond the deep gate. Story 6's journey (`shots.spec.ts`) runs the whole chain in one browser test: script, sheet, storyboard, both panels, Shot video, the tabs and a reload. It is in that gate.
- **Live checks:** at `1751b27`, `pnpm live:image` and `pnpm live:video` pass in dry mode (`"mode": "dry", "pass": true`, against the loopback fakes). The head wasn't saved when they ran: `1751b27` was the last commit before their logs (10:40) and `ad7c790` the next, as the folder's `head.txt` records. Logs: `outputs/verification/sprint-011/live-dry-1751b27/`. This sprint made no paid call. Lou's QA host makes them on his requests.
- **Spec:**
  - §8.3 gains a Storyboard block: save-storyboard, generate-panel, generate-shot and the tabs.
  - §8.5 gains assistant drafts beside a person's choice.
  - §8.7 gains Shot jobs.
  - The §4 `contracts`, `application`, `agent`, `artifacts` and `generation` rows, and the sprint table, name this sprint's parts.
- **QA build for Lou:** at `1751b27` (live Muse Spark, Meta and MiniMax), covering Sprint 010's QA item and this sprint's. Lou reported "it all works" (2026-11-03), including the Shot video playing in its row. In the QA database:
  - each panel's inputs are the images the agent picked;
  - Shot 2's panel 2 has panel 1's image first;
  - Shot 1's video depends on its one panel.
- **B-041** (the system prompt) is first in the backlog's Next, for the next planning round.
- **Lou's decisions during the sprint (2026-11-03):**
  - **Voice-over.** The agent decides by the speaker it names. A scene character's own voice-over reads "Mara (voice-over)" and is voiced as hers; any other voice-over is "Narration". `lineVoice` in contracts is the one rule.
  - **Re-added subjects.** Whether a subject removed and added back by name gets its old work is a Library feature, B-042. Until then it does.
- **Deviations, recorded in the story PRs:**
  - **Story 1:**
    - The saver is wired in Story 2, with its tool.
    - The read case is in `artifact-writes.test.ts`.
    - A kept panel keeps a person's references.
  - **Story 2:**
    - Two refusal lines are shortened to fit 60 characters; the field is in the model's message.
    - A tooling fix for the push gate's EPERM race.
    - One commit subject is 52 characters.
  - **Story 3:** the image naming moved to `packages/contracts/src/storyboard-names.ts` and `application/workspace-versions.ts`, shared rather than copied. The anchor's "Shot N · Panel N.M" comes from `storyboardNames`, not `workspace-entries.ts` as the AC says.
  - **Story 4:**
    - The subject-gone line is shortened.
    - `images` takes up to 20 ids, so over 10 is refused with its count.
    - The gone label uses the workspace's number.
    - Commit 1 has no tests of its own.
    - A cap taken while Meta works reads "Not saved: this video has too many saved items", not the pre-call "Not made: …" line the AC repeats, since the image was made.
  - **Story 5:**
    - The clip shows under the line.
    - "No one speaks." comes before the motion; the ticked test item's "ends with" means the dialogue paragraph.
    - Only the first and last panels need images, and a last image that is the first's sends a first frame only.
    - A Shot job's frames are checked as the account's images whether or not its Shot remains, not only for the gone fallback the AC names. A live Shot's frame that lost its use still saves.
    - The cap-race line is "Not saved yet: …".
    - Shared derived-artifact code.
    - One commit subject is 54 characters.
  - **Story 6:**
    - The voice-over label, as decided above.
    - Videos needed no change, so planned commit 2 became the Assets Shot line.
    - The panel's version links stay.
    - B-042 was added to the backlog.
- **Accepted P2s:**
  - **Story 2:** the envelope cap is pre-existing and still open. Subjects and stopped videos have no hard cap of their own, so a very large read-workspace envelope could still pass 16 KiB. The truncation-wording P2 was fixed in #118.
  - **Story 6:** `lineVoice` and `deliveryLabel` spell out the delivery union instead of using `dialogueLineSchema`'s type; a new delivery would fail to compile, not misbehave. No test drives a panel description edit, which uses the same unchanged editor as the Shot intent edit.
- **New Dependencies:** None.
- **Lou's QA follow-up (2026-11-03):** Lou reported "it all works" and asked for five fixes, made in one PR into `sprint-011`:
  - selecting a panel's image opens its viewer;
  - the panel viewer shows the image (it read only a display composition's supplied images, which the app never sets);
  - "View storyboard" became the detailed view, with each Shot's text and panel images, and the Storyboard tab the summary;
  - a Shot video row shows its poster as the play button;
  - a place's sheet views fill the frame instead of sitting on a plain page, which Meta drew as a framed picture on grey.

  Two paid MiniMax reference-to-video tests on the QA host's images also passed, so Shot videos move from first and last frames to reference images in Sprint 012.
  - **Verification (#130):** the Story 6 journey (`shots.spec.ts`) was extended for each fix: a panel opens its image, a failed read shows its line, the board holds the Shot's action, dialogue, camera note, subjects and images, the tab has no action, dialogue or camera note, and the Shot video plays from its poster. `generate-sheet.test.ts` pins each kind's framing line. `chat.spec.ts`'s poster and Assets cases, the unit tier and the standard push gate passed. #130's review scored 4/5. This PR's pre-merge gate, and the deep gate on #113 before `main`, cover the final combined head.
  - **Lou's recheck (2026-11-03):** on the same QA host (server still at `1751b27`), with its web app rebuilt at `9356191`, Lou checked the panel viewer, the board, the summary tab and the Shot video poster, and reported "QA pass". `9356191` is a Sprint 012 docs commit, but its `apps/web` and `packages` are identical to #130's merge (`3e470e1`) and to #134's head, so Lou rechecked Sprint 011's web code. The only server change between `1751b27` and `3e470e1` is `apps/api/src/application/sheets.ts`, the place framing, so it wasn't live there: it is unverified until the next QA build, and the unit test proves only the prompt.
  - **Report-only conditions:** each Shot showing its fields and 1–2 panel images with no status pill, the Shot video playing in its row after a reload, and the recheck above rest on Lou's report alone. The QA database confirms only the panel inputs and the Shot video's dependency, listed in the QA line.
- **Sprint PR review (#133, 2026-11-03):** all seven checks ran; mergeability 4/5, with P2s only. Fixed in #134 into `sprint-011`:
  - `changedShots` (`artifacts/selection.ts`) now compares every Shot field, not only the intent and panels, so a storyboard version that changes a Shot's framing, action, dialogue, camera note or references journals that Shot's panel images and videos as affected (`test/unit/artifacts/selection.test.ts`).
  - generate-panel takes only a shape a Shot video's frame can use (width ÷ height strictly between 0.4 and 2.5, shared with the video client as `videoFrameRatio`), so a panel asked for in an unusable shape isn't paid for and then refused as a frame (`generate-panel.test.ts`). Remaining risk: with "auto", the default, Meta picks the shape, so a panel could still come back outside the limit. QA's panels came back 3:2. Sprint 012's reference images keep the same per-image check, which refuses before the video's paid call.
  - The spec's §8.3 Tabs line, design.md's Storyboard shots body, the Story 6 items above and this Final Review now describe the tab as the summary and record the #130 verification and Lou's recheck.
  - Accepted: two commit subjects over 50 characters, `ccf5845` (53) and `48a7c87` (51).
  - **Verification (#134):** new `test/unit/artifacts/selection.test.ts` and a shape case in `generate-panel.test.ts`; the unit tier (190/190); integration `storyboard-revisions`, `artifact-writes`, `shot-video-choice` and `tool-activity` on the test stack (106/106); `pnpm check`; the quick commit and standard push gates. Its own review found P2s only, fixed in a second commit set: the shared `videoFrameRatio`, strict limits, the spec's panel refusals and these records.
