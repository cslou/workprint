# Sprint 014 — Shots that match, and a tidier app

**Date:** 2026-11-04 planning, starting from `main` after Sprint 013 merged (#146) – End after completion gates and Lou's QA
**Goal:** In a local build, a signed-in user asks for a short video (for example "make a 20-second video of Mara finding a key in a gallery"), and its Shots match across the cuts.
- The storyboard starts a new Shot only when the camera set-up changes; continuous action in one space stays in one Shot.
- Every Shot names its place, so even a close-up keeps the room.
- Every Shot states where people and key objects start and end in the frame and which way they move, and its panel and video prompts carry that, with the previous Shot's ending.
- A person sees and can change those positions in "View storyboard".
- The app shows the word "Workprint" in Italiana as its makeshift logo, without the composer's upload limits line, the "Attach photos" label or the Videos tab's Export card.
- Muse Wonder (`meta/muse-wonder-1.0`) is the default chat model, once a live check on Lou's go shows it works with the tools.

**Status:** 🟡 Planning. Drafted 2026-11-04 from Lou's Sprint 012/013 QA discussion; waiting for Lou's approval. Whether Questions (B-014, B-016) joins this sprint is still Lou's call.

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`.
  - Branch `sprint-014` was cut from `main` at `8a56128` (Sprint 013, #146) and holds this plan. Story branches come from `sprint-014`, and the sprint PR targets `main`.
  - Story 3's work is already committed on `feat/ui-wordmark` (`b558a85`, cut from `main` at `8a56128`); its PR targets `sprint-014`.
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
  - **No paid calls in tests.** The Meta and MiniMax fakes record what they receive. Paid calls happen only at Lou's QA, and Story 4's live check, on his go.
- **Non-goals:**
  - the previous video's last frame or the previous Shot's panel as an input;
  - making Shots in order (the system prompt is unchanged);
  - a second panel per Shot by default;
  - Questions (B-014, B-016) unless Lou adds them;
  - a designed logo, a model picker, or removing the export module itself (only its card is hidden).

### Affected Flows
- **Existing flows affected:** spec §8.3 Storyboard (save-storyboard, "View storyboard" editing), panels and Shot videos (their prompts); the shell, entry pages, composer and Videos tab (Story 3); every chat turn and video title (Story 4).
- **New flows introduced:** None. Positions are a new Shot field inside the existing storyboard flows.

### Verification Strategy
- **Functional:** unit tests for the storyboard tool's schema and refusals and for the prompts; integration through real turns (`tool-activity.test.ts`) for a save refused without a place and a save with positions; e2e for editing positions and for Story 3's UI; one live chat check for Story 4.
- **Regression:** the storyboard, panel and Shot video suites (`tool-activity.test.ts` storyboard and generate blocks, `storyboard-revisions.test.ts`, `shot-video-choice.test.ts`), `agent-loop.test.ts`, `shots.spec.ts` and `chat.spec.ts`; the unit tier and `pnpm check` per story; the deep gate once at completion.
- **Lou's QA** judges whether the Shots match; a test can't.

### Tests requiring extra consideration
- `shots.spec.ts` (about 1.5 min) for editing positions; it already covers editing a Shot's length.
- Story 4's live chat check makes paid Muse Wonder calls, run once on Lou's go.

### Stories
**Constraints:** Target 5-8 stories per sprint. Each story should be small enough to review, verify, and merge independently. Split stories that combine unrelated outcomes or cannot be verified with a clear functional/regression verification plan.

#### Story 1: The storyboard plans Shots that match
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: *(pending)*
  - Resolution: *(pending)*
- **As a** filmmaker, **I want** the storyboard to cut only where the camera changes and to say where everyone is, **so that** my Shots match across the cuts.
- **Dependencies:** None.
- **Acceptance criteria:**
  - [ ] **Positions.** `shotFields` gains an optional `positions` (start and end, each a short text): where people and key objects are in the frame and which way they move, in frame-left / frame-right terms, and the camera's side. save-storyboard requires it for every Shot, and read-workspace lists it. Optional in saved content, so earlier storyboards still read.
  - [ ] **A place in every Shot.** A save in which a Shot names no subject with the environment role is refused, naming the Shot ("Shot 3 names no place"), and nothing is saved.
  - [ ] **When to cut.** save-storyboard's description says: a new Shot only when the camera set-up changes (a new angle or shot size) or time or place jumps; continuous action in one space stays in one Shot, up to 15 s; each Shot's start positions follow the previous Shot's end; every Shot names its place, even a close-up.
  - [ ] **The camera note** is described as shot size, angle and at most one movement, for example "Medium, from her left, camera slowly follows her".
  - [ ] **The prompts carry positions.** The panel prompt's code-written preface and `shotVideoPrompt` add this Shot's positions, and the previous Shot's end as "Previous Shot ended: …" when there is one. A Shot without positions (an earlier storyboard) gets neither line.
  - [ ] The system prompt is unchanged (it stays byte-identical across turns).
- **Functional verification:**
  - [ ] Unit (`apps/api/test/unit/agent/save-storyboard.test.ts`): a Shot without positions or without an environment subject is refused with its message; the description's rules. Pass: each case as stated.
  - [ ] Unit (`apps/api/test/unit/application/shots.test.ts` and `panel-inputs.test.ts`): the video prompt and the panel preface carry this Shot's positions and the previous Shot's end; the first Shot and a Shot without positions carry no "Previous Shot" line. Pass: exact text.
  - [ ] Integration (`tool-activity.test.ts`, real turns): a save whose Shot names no place ends with the refusal and no new version; a save with positions lists them in the next read-workspace. Pass: as stated.
- **Regression verification:**
  - [ ] `tool-activity.test.ts` storyboard and generate blocks, `storyboard-revisions.test.ts`, `shot-video-choice.test.ts` and `agent-loop.test.ts`, whole. Pass: all green; earlier storyboards without positions still read, make panels and make Shot videos.
- **Editorial/design verification:** spec §8.3 Storyboard and §10's save-storyboard guidance name positions and the cutting rule.
- **Manual-only behavior verification:** N/A here; Lou's QA under Sprint Completion.
- **Planned commits:**
  1. Feat(contracts): Add a Shot's positions
  2. Feat(agent): Cut by camera set-up and name the place
  3. Feat(application): Put positions in panel and video prompts
- **Technical notes:** the place refusal goes in the storyboard save's existing refusals (`StoryboardSaveError` reasons in `artifacts/assistant-storyboards.ts`), not in the tool, so every save path gets it. A model sends non-null values for nullable arguments (Muse Spark), so `positions` is a required object of two required strings in the tool's schema.

#### Story 2: A person changes a Shot's positions
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: *(pending)*
  - Resolution: *(pending)*
- **As a** filmmaker, **I want** to see and correct where people start and end in each Shot, **so that** I can fix a mismatch before paying for panels and videos.
- **Dependencies:** Story 1.
- **Acceptance criteria:**
  - [ ] "View storyboard" shows each Shot's start and end positions, and the tab's summary row does not.
  - [ ] A person edits them the way a Shot's length is edited: a storyboard edit of that Shot's positions alone (`storyboardEditSchema`, `editedPlan`), saved as the next storyboard version; an unchanged edit just closes; an empty start or end is refused with a plain line.
  - [ ] The next panel and Shot video use the edited positions.
- **Functional verification:**
  - [ ] Unit (`apps/web/test/unit/storyboard/storyboard-edit.test.ts`) and integration (`storyboard-revisions.test.ts`): the edit body carries only that Shot's positions; empty text is refused. Pass: as stated.
  - [ ] E2E (`shots.spec.ts` journey): edit Shot 1's end position, reload, and see it; the next generate-shot's MiniMax request (fake) carries it. Pass: as stated.
- **Regression verification:**
  - [ ] `shots.spec.ts` whole (the length edit and intent edit still work) and `storyboard-revisions.test.ts`. Pass: all green.
- **Editorial/design verification:** design.md's Storyboard section names the positions editor beside the length.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. Feat(artifacts): Edit a Shot's positions
  2. Feat(web): Show and edit positions in the board
- **Technical notes:** copy `shot-length.tsx`'s editor and its `PlanningEditor` target.

#### Story 3: A makeshift wordmark and a tidier composer and Videos tab
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: *(pending)*
  - Resolution: *(pending)*
- **As** Lou, **I want** the app to show its name as a simple wordmark and to drop text and controls that promise nothing, **so that** it looks finished enough to show.
- **Dependencies:** None. Implemented on `feat/ui-wordmark` (`b558a85`).
- **Acceptance criteria:**
  - [x] The sidebar's top left and the entry pages show the word "Workprint" in Italiana (`--font-family-brand`, regular, 28px); the "a" mark is gone. The font file (`apps/web/src/ui/fonts/italiana-latin.woff2`, Latin subset) and its SIL OFL licence are served with the app, not loaded from Google Fonts.
  - [x] The composer no longer shows "JPEG or PNG only · Up to 10 MiB · 4096 × 4096 pixels. Video uploads are temporarily unavailable."; a refused file still explains the limits in its upload status.
  - [x] The opening composer's attach button is "+" alone, with the accessible name "Attach a file"; the docked composer keeps "+ Attach".
  - [x] The Videos tab shows no Export or Export history (B-009); the export module itself stays.
- **Functional verification:**
  - [x] E2E `auth.spec.ts` (sign-in test): the entry link and the sidebar wordmark use Italiana and the face is loaded; the attach button reads "+"; no limits line. `shots.spec.ts` (Generated videos test): no Export button. Pass: 2/2; both fail on the code before the change (checked by stashing it).
- **Regression verification:**
  - [x] `pnpm check`. Pass: green.
  - [ ] `chat.spec.ts` and `uploads.spec.ts` whole (uploads still refuse and explain an unsupported file). Pass: all green.
- **Editorial/design verification:** design.md: the brand font token, the Logo section ("Makeshift"), the composer copy under the image-only restriction, and the Export consumers marked not shown for now.
- **Manual-only behavior verification:** Lou looks at the wordmark at QA.
- **Planned commits:**
  1. Feat(web): Italiana wordmark, simpler composer
- **Technical notes:** Italiana has one weight (400); a bolder weight would be synthesised, so the wordmark stays regular.

#### Story 4: Muse Wonder is the default chat model
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [ ] Follows sprint template
  - [ ] Acceptance criteria are specific and testable
  - [ ] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [ ] Story is small enough to review and merge independently
  - [ ] Reviewed by sub-agent
  - [ ] Review findings addressed or explicitly recorded
  - [ ] Ready for Lou
- **Planning review:**
  - Findings: *(pending)*
  - Resolution: *(pending)*
- **As** Lou, **I want** the agent to run on Muse Wonder, **so that** the workflow gets the stronger model.
- **Dependencies:** None (before Lou's QA, so the QA judges Wonder).
- **Acceptance criteria:**
  - [ ] **Live check first, on Lou's go:** `scripts/live/chat.mjs` with `meta/muse-wonder-1.0` streams a reply, calls a tool and reads its result, and makes a title. The response shapes are saved as a fixture beside `muse-spark-live-shapes.json`, with any differences from Muse Spark (reasoning options, nullable arguments) recorded.
  - [ ] `assistantModels` gains `meta/muse-wonder-1.0`, with its own title options; `DEFAULT_ASSISTANT_MODEL=meta/muse-wonder-1.0` starts the server, and an unlisted model is still refused.
  - [ ] `.env.example` and the QA host use `meta/muse-wonder-1.0`. Lou sets `DEFAULT_ASSISTANT_MODEL=meta/muse-wonder-1.0` in the root `.env` himself.
  - [ ] Muse Spark 1.3 stays allowed, so switching back is a one-line `.env` change.
- **Functional verification:**
  - [ ] Unit (`config.security.test.ts`, `video-title.test.ts`): Wonder is accepted with its title options; an unlisted id is refused. Pass: as stated.
  - [ ] The live check above, once. Pass: reply, tool call and title as stated.
- **Regression verification:**
  - [ ] `agent-loop.test.ts` and the chat e2e (scripted provider) unchanged. Pass: green.
- **Editorial/design verification:** spec §4 or §10's model line and the README name Muse Wonder as the default.
- **Manual-only behavior verification:** the live check is a paid call and needs Lou's go.
- **Planned commits:**
  1. Feat(agent): Qualify Muse Wonder as a chat model
  2. Chore(env): Make Muse Wonder the default
- **Technical notes:** the key is the same `META_API_KEY`. If Wonder rejects `reasoningEffort: 'minimal'` for titles, its title options leave it out.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [ ] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [ ] Run the applicable regression suite on the combined sprint branch (`.checks/regression.sh --tier=deep`).
- [ ] Run any planned cross-story checks not covered by that suite: spec §8.3 and §10, design.md and this doc against the code.
- [ ] **Lou's QA** (manual; on a QA host when he asks; live Muse Wonder, Meta and MiniMax calls on his go). In a fresh video, ask "make a 20-second video of Mara finding a key in a gallery" and say yes to each step. Pass:
  1. the storyboard keeps continuous action in one Shot and cuts only where the camera changes;
  2. every Shot names the gallery and shows start and end positions, which he can change in "View storyboard";
  3. the Shot videos, joined, match across the cuts: Mara on the same side, the same room, the key where it was;
  4. the wordmark, composer and Videos tab look as Story 3 says.
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
