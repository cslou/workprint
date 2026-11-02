# Sprint 010 — Subjects and reference sheets

**Date:** Start after Lou approves this plan, from `main` at `4d34530` (Sprint 009 merged as PR #103) – End after completion gates and Lou's QA
**Goal:** In a local build, a signed-in user writes a script with the agent, and the script names its subjects: the characters, places and props that need a look. Assets shows each subject at once, empty until something is made for it. The user asks for a subject's reference sheet; the agent calls one tool, generate-sheet, which makes a light set of one-view images (at most 5), each later view made from the first so they match, and saves them as that subject's sheet with a view name for each image. Other images the agent makes for a subject are filed under it. Assets shows each subject with its sheet, laid out as a sheet, and its other images, live and after a reload.
**Status:** 🟡 Planning

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`. Branch `sprint-010` from `main` at `4d34530`; story branches from `sprint-010`. This sprint doc, the Sprint 011 doc, the backlog update and the spec packaging update are committed first on `sprint-010`.
- **Tech stack:**
  - Strict TypeScript, React with React Aria, Vite.
  - Mastra 1.79.0 with Muse Spark 1.3, through the app-owned `@mastra/hono` entry.
  - Supabase Auth/Postgres, SeaweedFS private storage, pnpm.
  - Meta `muse-image-1.0` for images (Sprint 008).
  - Tests: Node test runner and Playwright on one shared test stack per run (`scripts/test-stack.mjs`).
- **Current state:**
  - **The script names characters and a place, but not as subjects.** Saved script content (`packages/contracts/src/saved-content.ts:7-23`) is one scene with `heading {setting, location, time}`, `characters` (distinct names) and action and dialogue lines; every speaker must be in `characters` unless voice-over. There is no props list and no stable id for a character. `update-script` (`apps/api/src/agent/tools/update-script/`) saves the whole content as the next version; a person's script edit changes one text field of a copy of the content (`apps/web/src/versions/targets.ts`), keeping the rest.
  - **A saved reference exists, but nothing makes one.**
    - Content (`saved-content.ts:24-34`): `subject {id, kind: character | environment | prop | style, name, description, continuityNotes (≥1)}` and `references: [{versionId, view, notes}]`, up to 100, distinct.
    - Every `references[].versionId` must be an image dependency, and the dependencies must equal the references (`apps/api/src/artifacts/content.ts:14,17`). The images must be verified media (`apps/api/src/artifacts/references.ts`).
    - Only a person makes or edits one, and only as the next version of an existing one (`apps/web/src/versions/editor.tsx`, `versions/reference-images.tsx`).
  - **Assets is one flat list** (`apps/web/src/materials/assets.tsx`): reference rows (opening `ReferenceSheet`, `materials/sheet.tsx`, with a Draft/Ready pill, the identity notes and a "Missing views" count, its figures only from injected prerequisites, `materials/content.ts:16-21`), then image and video rows with no pill.
  - **Storage.** Media bytes are in private object storage; Postgres `artifacts` holds `artifacts`, `versions` (immutable content or media facts), `version_dependencies`, the media object tables and `conversation_uses` (which versions this video uses, with purpose and state). An asset is a version the video uses with the `reference` purpose.
  - **generate-image** (`apps/api/src/agent/tools/generate-image/`) takes up to 10 `inputImages`, `count` 1–10, `size` and `revises`. It refuses before any Meta call when images can't be saved (`collaborators.images` absent). Each result is checked and saved by `saveGeneratedImage` (`apps/api/src/artifacts/generated-images.ts`) as a draft image with a `reference` use, its inputs as dependencies; the use cap (`requireUseRoom`, `artifacts/generated-media.ts`) is checked at save time. Meta takes at most 10 inputs.
  - **Names.** `workspaceMediaLabels` and `mediaVersionName` (`packages/contracts/src/asset-labels.ts`) name media "Image N · Version M" in Assets, the chat, Generated videos and read-workspace (`apps/api/src/agent/workspace-entries.ts`). A reference is named by its subject ("Mara · Version 1", `workspace-entries.ts:57`).
  - **The agent's guidance** is a 3-line static system prompt (`apps/api/src/agent/mastra/native-turns.ts:23`) plus each tool's description. Tabs re-read the workspace after every tool line (`apps/web/src/shell/shell.tsx:78-80`).
  - **The assistant script save is the pattern for an assistant save** (`apps/api/src/artifacts/assistant-scripts.ts`): owned check, base version, stale versus not-found, the owner lock, and a draft use.
- **Implementation spec:** `docs/specs/implementation-spec-001.md` (§8.3 Images as the precedent, §10 Agent tool guidance and Phase 3 sprint packaging). Sources: `docs/design/demo-02.html`–`demo-09.html` (the script lists the subjects to set up; Assets shows each as Empty, then its looks and sheet), `~/projects/animation-studio/.pi/skills/create-storyboard/references/reference-package-schema.md` (subjects, views and reference responsibilities) and `~/projects/animation-studio/outputs/generated-images/vale-gallery-sheets-20260928T165610Z-zXjGs7/` (the Vale and Gallery sheet prompts).

### Sprint-Wide Context
- **Sprint type:** Feature
- **Shared context:**
  - **Lou's decisions (2026-11-03):**
    - **Order.** 010 subjects and reference sheets, 011 storyboard (panels and Shot videos), 012 joining clips, 013 questions. Spec §10 packaging and the backlog move on this branch.
    - **The script decides the subjects.** Once the script is written, its characters, places and props are the video's subjects, and they are the categories in Assets. A subject that isn't in the script can't exist: a new subject is added to the script first.
    - **Subjects live in the script; nothing is recorded until something is made.** Saving a script records no asset. Assets shows each subject from the script, empty until a sheet or image is made for it.
    - **One tool makes a sheet.** generate-sheet makes a subject's views and saves its sheet in one call, as generate-panel and generate-shot will for panels and Shot videos (Sprint 011). A view can name an existing image instead of a prompt.
    - **Light sheets.** A sheet is a light set of one-view images: the agent makes at most 5 in one call, one view per image, not a dense collage. An artist sends only the relevant views to the image model, so each view must be usable alone. The suggested sets:
      - **Character, 3–4:** full-body front, three-quarter or side, face close-up, and optionally one wardrobe or prop detail.
      - **Place, 2–3:** wide master, reverse angle, and optionally one zone or detail.
      - **Prop, 1–2:** product view, and optionally its other state.
    - **The sheet is the chosen set; the subject holds everything.** Not every image of Mara is in her sheet. The sheet is the small set panels use to keep her consistent; other images of her (looks to choose from, a poster, a one-off) are filed under Mara beside it.
    - **Overview.** Assets lays a sheet's images out together on screen. No stitched image and no generated presentation sheet.
    - **No badges, no approval.** No Draft or Ready pill on sheets or images, and no approval step before a sheet is used. Approval comes later.
    - **One sheet schema for every kind.** Kinds differ in suggested views and in what the identity input keeps, not in fields; kind-specific details go in the description and continuity notes.
    - **Sheets reach images and video through panels** (Sprint 011's generate-panel). generate-image gets no sheet input: the agent can already pass any image version id, a sheet's views included, as `inputImages`.
    - **Tools, not prose, wire the inputs.** The server, not the model, decides each view's identity input, writes the sheet-view framing of each prompt and keeps subject ids. A system prompt covering the whole workflow comes right after Sprint 011 (B-041); this sprint does not change the system prompt.
  - **Subjects.** A subject is `{id, kind, name}` with kind `character | place | prop`, listed in the script's `subjects` (Story 1). Its id is server-made and kept across script versions, so a rename keeps its sheet and images. A script saved before this sprint has derived subjects: each character, and the heading's location as one place, with ids from their names. Assets order is characters, then places, then props, each in script order.
  - **Words.** A *sheet* is a saved reference version for one subject, with its description, continuity notes and images, each with a *view* name. "Reference" in code stays the content kind; a sheet's `subject.kind` is `environment` for a place. A sheet's *first view* is its first image in order.
  - **Identity input.** Every view made after the first is made with one identity image as Meta's input: the `identity` image when one is given (for example a photo the user uploaded), else the sheet's first view. The first view of a new sheet is made from its prompt alone, or from `identity` when given. Each made view depends on its identity image, as generate-image's inputs do.
  - **Filing.** An image the agent makes for a subject is filed under that subject's id, stored on its use (Story 5), so every version of it stays filed. A sheet belongs to the subject whose id its content holds. Work for no subject, uploads, work for a subject since removed from the script, and people's sheets for no script subject sit under "Other". Videos stay in the Videos tab.
  - **Membership is by the current sheet.** An image belongs to a sheet when the sheet version the video currently uses lists it. A later sheet version that drops an image returns that image to its subject's images.
  - **Sheet views count as used.** Every image version a current sheet lists counts as an image the video uses, for sheet saves, `inputImages`, `identity` and item-mode lookup, even when the image's own use has moved on (a view later edited with `revises`). `usedImageVersions` (`artifacts/workspace-images.ts`) and `workspaceEntries` are the places this changes (Stories 2 and 4).
  - **At most 5 views per sheet** for the agent: a sheet the agent saves holds at most 5 views in total. A person's sheet with more stays valid and readable, but the agent can't revise it.
  - **Tool rules (spec §10).** Each tool lives in its own directory under `agent/tools/` and calls application functions in process. Account and video come from the trusted run scope. Every id from the model resolves through an account- and video-scoped query, or the result is not-found. No tool input is nullable, and a wrong optional value is harmless or refused with a readable message (Muse Spark nullable-args note: an empty, whitespace or `"null"` optional id means none).
- **Non-goals:**
  - The storyboard, panels, Shot videos (Sprint 011) and joining clips (Sprint 012).
  - Which Shots use a subject ("Character · shots 1 and 2" in the demo): it comes with Sprint 011's Shot references.
  - A `sheets` input on generate-image, and the code that turns chosen sheet views into ordered inputs with their jobs: that is Sprint 011's panel inputs.
  - The system prompt (B-041, after Sprint 011), and the demo's question cards and look choosing (Sprint 013 questions).
  - Approval of sheets or images, and B-040 (image version history and "Use this version").
  - A stitched or generated presentation sheet, a PNG or PDF export, and style sheets made by the agent (the `style` kind stays readable and savable by people).
  - Recording a placeholder asset per subject: subjects live in the script only.
  - People editing subjects or filing images by hand, filing videos, and refiling images already saved (an upload joins a subject by becoming a sheet view with generate-sheet's `image`).
  - Dropping a view through the agent; people drop views in today's editor, which is unchanged.
  - Changing the saved reference schema: the 5-view limit applies to what the agent makes in one call, so people's existing sheets stay valid.

### Affected Flows
- **Existing flows affected:**
  - §8.3 Develop script: the script lists its subjects; update-script keeps their ids.
  - §8.1 Start or resume work (the chat): a new tool line, "Making a reference sheet…" then "Saved Mara · Version 1", with the sheet's images under it.
  - §8.3 Images: generate-image files an image under a subject; an image in a sheet is named by its subject and view wherever it is named.
  - Assets: one entry per subject in script order, Empty until something is made, holding its sheet and its other images; "Other" last; sheets laid out as sheets; no status pills.
  - read-workspace: lists the subjects with their sheets and views, and each item's subject.
- **New flows introduced:**
  - The script's subjects, and their empty slots in Assets.
  - The agent makes a subject's sheet, and redoes or adds a view.
  - The agent files images under subjects, and Assets lists them by subject. All folded into spec §8.3 (a Subjects and reference sheets block beside Images) before the completion deep gate.

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
Lou's three (2026-11-03), with the stories that prove each:
1. **The agent calls one tool that makes several images and saves them as one sheet**: Stories 2 and 3 (the save rules, then generate-sheet's Meta calls and the saved sheet), with Story 4 naming its images.
2. **A sheet shows in the UI as a sheet**: separate images laid out together with their view captions, not one PNG: Story 6's sheet view.
3. **Assets are seen by subject** ("Mara", "The Gallery"), the subjects coming from the script, each holding its sheet and images: Stories 1, 5 and 6.

**No paid calls in tests.** Every case runs against the Meta fake (`apps/api/test/support/meta-image-fake.ts`), which records each request's prompt and input images. Real Meta images happen only at Lou's QA.

**Budget (Lou, MVP testing budget).** Each story runs only its targeted tests plus the commit (quick) and push (standard) gates. New cases go into existing files and harnesses; a new module gets one unit file of its own. No screenshot or visual suites.

### Tests requiring extra consideration

1. **Integration cases on the shared test stack** (Stories 1–5): `apps/api/test/integration/artifact-writes.test.ts` calls the script and sheet saves directly (Stories 1 and 2); `apps/api/test/integration/tool-activity.test.ts` runs real turns with storage, the checker and the Meta fake (Stories 1 and 3–5). Only the database and storage prove that versions, dependencies and uses land together, and which images reach Meta. Cost: one stack start (about 30–60 s) per story.
2. **A migration** (Story 5): a nullable `subject_id` on `artifacts.conversation_uses`. `migrations.test.ts` covers it.
3. **One browser journey** (Story 6) in `test/e2e/chat.spec.ts`: a scripted script save lists Mara, the Gallery and a key; Assets shows three Empty subjects; scripted turns make Mara's sheet of three views and a one-off Mara image; Assets shows Mara with her sheet and that image, live and after a reload. One stack start plus one vite build, about 1–2 min.
4. **Deep gate at Sprint Completion** (`.checks/regression.sh --tier=deep`): about 5–6 min. The `main` pre-merge runs deep again on the final head.

### Stories
**Constraints:** Target 5-8 stories per sprint. Each story should be small enough to review, verify, and merge independently. Split stories that combine unrelated outcomes or cannot be verified with a clear functional/regression verification plan.

This sprint has 6 stories: subjects, the sheet save, generate-sheet, names, filing and Assets. Images from sheets moved to Sprint 011's panel inputs (Lou, 2026-11-03).

#### Story 1: Subjects in the script
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Added after Lou's decision that the script decides the subjects (2026-11-03).
  - Resolution: Reviewed in the final review below.
  - Final review: P1 — `script.subjects` let the model pick ids. P2 — id and name bounds; pre-sprint bases; test paths; the invalid message. Resolved: the tool omits `script.subjects`; bounds set with a 50-subject budget case; old bases store derived subjects; paths and message fixed.
- **As a** filmmaker, **I want** the script to name the characters, places and props that need a look, **so that** everything the video makes is filed under them.
- **Dependencies:** None
- **Acceptance criteria:**
  - [ ] **Schema.** Saved script content gains an optional top-level `subjects: [{id, kind, name}]` (still `schemaVersion: 1`), up to 50: ids are distinct slugs of at most 200 characters, names 1–80 characters and distinct (trimmed, ignoring case), kind `character | place | prop`. When present, the character subjects' names equal the scene's `characters` (trimmed). Existing scripts and built-in work still parse.
  - [ ] **One rule for the list.** A pure helper in `packages/contracts`, `scriptSubjects(script)`, returns the subjects: `subjects` when present, else derived (each character, then the heading's location as one place), with ids as slugs of the names (`-2`, `-3` on a clash). It is the one rule for Assets, the tools and the agent.
  - [ ] **update-script.** Takes `subjects: [{id, kind, name}]` beside the script (default empty). Its `script` input is the script schema with `subjects` omitted, so a `script.subjects` key is refused as invalid and the model never chooses ids.
    - An empty list keeps the base's stored subjects; for a first save, or a base saved before this sprint (no stored `subjects`), it stores `scriptSubjects` of the new script, so ids are fixed from then on. A non-empty list is the full new list.
    - A subject with an empty, whitespace or `"null"` id is new and gets a server-made slug id; an id from the base keeps it, so a rename keeps its work; an id not in the base is invalid (`subjects`).
    - The server sets the scene's `characters` to the character subjects' names, so the two can't disagree; with an empty list, `characters` must still match the kept subjects, else "Not saved: the characters and subjects differ; pass the full subjects list".
    - The invalid message says "every speaker must be a character subject unless voice-over", since `characters` now follows the subjects.
    - The description says: list as subjects every character, place and prop that will need a look; props only when they matter visually; keep each subject's id; add a new subject here before anything is made for it.
  - [ ] **A person's edit keeps them.** A person's script edit keeps `subjects` unchanged.
  - [ ] **read-workspace.** The listing gives the subjects with id, kind and name.
- **Functional verification:**
  - [ ] Integration (`artifact-writes.test.ts`, calling the save directly): a first save with subjects Mara (character), the Gallery (place) and the key (prop) stores them with slug ids and sets `characters` to ["Mara"]; a revision renaming Mara to "Mara Vale" with her id keeps the id; an unknown id is invalid; a revision with an empty list keeps the base's subjects; an old script (no stored subjects) revised with an empty list stores its derived subjects, and a later rename passing that subject's id keeps it.
  - [ ] Integration (`tool-activity.test.ts`): an update-script turn with subjects saves them, and a following read-workspace turn lists them with their ids.
  - [ ] Unit (new `apps/api/test/unit/contracts/script-subjects.test.ts`): derived subjects for an old script (characters, then the location), slug clashes, kind order, and the schema refusing duplicate names and a character subject missing from `characters`.
  - [ ] Unit (new `apps/api/test/unit/agent/update-script.test.ts`): `"null"` ids are new; a `script.subjects` key is refused; the mismatch line; the invalid message names character subjects.
- **Regression verification:**
  - [ ] `apps/api/test/unit/artifacts/content.test.ts` and `apps/api/test/integration/built-ins.test.ts` pass (old and built-in scripts parse).
  - [ ] `apps/api/test/unit/agent/read-workspace.test.ts` passes, including its 50-item and 16 KiB cases, plus one new case: 50 subjects with 80-character names stay within 16 KiB.
  - [ ] The `tool-activity.test.ts` update-script block passes (saves without subjects unchanged).
  - [ ] `test/e2e/saves.spec.ts` passes, with one new assertion: a person's script edit keeps the subjects.
- **Editorial/design verification:** The update-script description addition is reviewed against Shared context, recorded in the PR.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(contracts): List the script's subjects`
  2. `Feat(agent): Save the script's subjects`
- **Technical notes:** `assistant-scripts.ts` already loads the base; resolve ids there inside the owner lock. The person's edit path (`versions/targets.ts`) already edits a copy of the content, so it keeps `subjects` without change; the e2e assertion proves it.

#### Story 2: Save the assistant's sheets
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Earlier passes: the save rules had no tests of their own; `requireUseRoom` throws `integration_failure`, so `no_room` was unreachable; bases, built-in sheets and Library-reused views had no outcome; no test proved 6-image sheets stay valid; outcomes carried no field or sheet name.
  - Resolution: Proven by direct `artifact-writes.test.ts` cases; its own room error; one outcome per case; a 6-image `content.test.ts` case; payloads on `invalid` and `in_other_sheet`. Sheets are now bound to a script subject, which replaces the free base and name rules.
  - Final review: P1 — a view whose own use moved on failed every revision; the 5-view cap meant per call in one story and total in another. Resolved: sheet views count as used (Shared context); the cap is total, pre-checked in Story 3.
- **As a** filmmaker, **I want** each subject's sheet saved with firm rules, **so that** a sheet never silently loses work or claims another sheet's image.
- **Dependencies:** Story 1
- **Acceptance criteria:**
  - [ ] **Save.** A new `apps/api/src/artifacts/assistant-references.ts` saves a subject's sheet for the account's video, following `assistant-scripts.ts`:
    - the subject must be in the video's current script (`scriptSubjects`), else `not_in_script`; with no script, `no_script`;
    - the content's subject id, kind (`environment` for a place) and name come from the script's subject; description and continuity notes are given;
    - content is a valid saved reference with 1–5 images in total, each an image version the video uses (sheet views count, Shared context), distinct, each with a view name (1–80 characters) and optional notes; the images become the version's dependencies, in view order;
    - the subject's sheet is the first current sheet in workspace order whose subject id is that subject's. With none, the save is a new artifact at version 1 with a draft `reference` use and `createdBy: 'assistant'`; with one, it is that sheet's next version on the same use, still a draft, when the given base is its current version, and `stale` otherwise; a built-in current sheet starts a new owned sheet on the same use instead;
    - every image in the new version must be an image the video uses or a dependency of the base sheet version, else `not_found`, so a view whose own use moved on can still be kept; a base with more than 5 views is invalid (`images`);
    - an image can be in only one current sheet: an image already in another current sheet is refused as `in_other_sheet` with that subject's name;
    - a foreign, unused or non-image image id is `not_found`; an image whose media isn't verified is invalid (`images`);
    - a new sheet at the video's use cap is refused as `no_room`: the sheet save raises its own room error, so the saver can tell it from `unavailable` (`requireUseRoom` throws `integration_failure`, which generate-image keeps mapping as today); a revision needs no room.
  - [ ] **Saver.** `application/assistant-references.ts` maps the result to `saved | no_script | not_in_script | not_found | stale | invalid { field: 'images' } | in_other_sheet { subjectName } | no_room | unavailable`, logging an unavailable cause without content, and is wired in `apps/api/src/mastra/backend.ts` as a collaborator.
  - [ ] **Room check.** A read-only `useRoom(account, video)` in the same layer returns how many more uses the video can hold, so Story 3 can refuse before any paid call.
- **Functional verification:**
  - [ ] Integration (`artifact-writes.test.ts`, calling the save directly with images saved through `saveGeneratedImage` and a script listing Mara and the Gallery):
    - three images saved as Mara's sheet: one new reference version, revision 1, `createdBy` assistant, a draft use, the three images as dependencies in order with their view names, subject id, kind and name from the script;
    - a save with Mara's current sheet as base and a fourth image is version 2 on the same use, still draft; after Mara is renamed in the script, version 3 carries the new name and the same subject id;
    - a save with version 1 as base after version 2 is stale and saves nothing; a built-in current sheet for the subject starts an owned sheet on the same use; a kept view that isn't an image this video uses is not found;
    - a subject not in the script is `not_in_script`; a video with no script is `no_script`; the Gallery's sheet has kind `environment`;
    - an image already in Mara's sheet is `in_other_sheet` with the name "Mara" in the Gallery's sheet, and allowed in Mara's next version;
    - another account's image id and an id not used by the video are not found; an unverified image is invalid (`images`); a person's 3-image sheet for Mara revised to 6 images is invalid (`images`), and so is a revision of a person's 6-image sheet;
    - after a view's own use is revised by generate-image, a next version that keeps the old view saves; that old view also counts as used for `inputImages` (`usedImageVersions`);
    - at the use cap, a new sheet is `no_room` and a next version saves; `useRoom` returns 0 at the cap and the right count below it.
  - [ ] Unit (`apps/api/test/unit/application/assistant-references.test.ts`): each store result maps to its outcome with its payload; the room error maps to `no_room` and an integration failure to `unavailable`; an unavailable cause is logged without content.
- **Regression verification:**
  - [ ] `artifact-writes.test.ts`, `artifact-reads.test.ts` and `reference-associations.test.ts` pass in full (people's reference saves share the publish and dependency path).
  - [ ] `apps/api/test/unit/artifacts/content.test.ts` passes, with one new case: a 6-image reference parses through `parseContent`, so people's sheets with more than 5 images stay valid.
  - [ ] `apps/api/test/unit/agent/generate-image.test.ts` passes (its cap mapping unchanged).
- **Editorial/design verification:** N/A — no user-facing copy.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(artifacts): Save the assistant's reference sheets`
- **Technical notes:** Reuse `publishVersion` and the owner lock as `assistant-scripts.ts` does. The images-the-video-uses check is `artifacts/workspace-images.ts`; extend `usedImageVersions` there with the versions current sheets list (Shared context). Read the current script and the current reference versions inside the same transaction, after the owner lock.

#### Story 3: generate-sheet tool
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Earlier passes: Stop after paid views had no test; `"null"` placeholders would refuse a sheet; the keep line versus frame order; the held request had no fake support; view-name matching was unstated.
  - Resolution: A Stop case; placeholders mean none; the order is pinned and asserted; a hold step; trimmed, case-insensitive matching with duplicates invalid. The tool now takes a subject id instead of a kind, name and `revises`, so a garbled id can no longer make a second sheet.
  - Final review: P2 — partial failure on a next version; `shownMedia` untested. Resolved: a failed replacement keeps the base view and a no-view call saves nothing; a unit case.
- **As a** filmmaker, **I want** to ask for a subject's reference sheet in one request, **so that** I get matching views saved together.
- **Dependencies:** Story 2
- **Acceptance criteria:**
  - [ ] **Input.** `apps/api/src/agent/tools/generate-sheet/` takes `subject` (a subject id from read-workspace), `description`, `continuityNotes` (1–10), `views` (1–5 of `{view, prompt, image, notes, size}`) and `identity` (an image version id, empty for none). No input is nullable.
    - A view with `image` set uses that existing image (one the video uses) and makes nothing; otherwise it is made from its `prompt`. A view with neither is invalid (`views`).
    - In `identity` and `views[].image`, an empty, whitespace or `"null"` value means none.
    - `size` is generate-image's shape rule, default `auto`.
  - [ ] **New or next.** With no sheet for the subject, the call makes its first sheet. With one, it makes that sheet's next version: the base's views stay in order with their notes; a given view whose name matches a base view (trimmed, ignoring case) replaces it in place, keeping the base's spelling of the name, and any other is added at the end. Two given views with one name are invalid (`views`). Kept and added views together are at most 5, checked before any Meta request: "Not made: a sheet holds at most 5 views"; a person's sheet with more than 5 views: "Not made: Mara's sheet has more than 5 views; ask to trim it first". The base is the sheet's current version when the call starts.
  - [ ] **Made in code, in order.** The views to make are made one at a time in order, each one Meta request with count 1:
    - the identity input follows the Shared context rule; for a next version with no `identity`, it is the base's first view, even when that view is being remade;
    - the server writes each prompt in this order: with an identity input, a keep line saying what it keeps (a character's face, build, hair and clothing; a place's layout and light; a prop's design and materials); then a fixed sheet-view frame with the subject's name, kind, view, description and continuity notes ("One reference view … plain neutral background … no text, labels, borders or other views"); then the view's prompt;
    - each made view is saved through `saveGeneratedImage` with its identity image as its input, filed under the subject (Story 5).
  - [ ] **Before any paid call.** These are refused with no Meta request:
    - no image client: "Not made: images can't be saved on this server";
    - no script: "Not made: there is no script yet; write it first";
    - a subject not in the script: "Not made: that subject isn't in the script; add it to the script first";
    - an `identity` or view `image` that isn't an image the video uses: "Not made: an image wasn't found";
    - a view `image` already in another current sheet: "Not made: that image is already in Mara's sheet";
    - an invalid sheet (views, the 5-view cap per call): "Not made: the sheet wasn't valid" with the field;
    - too little use room for the views to make plus a new sheet (`useRoom`): "Not made: this video has too many saved items";
    - saved work can't be read: "Not made: saved work is unavailable".
  - [ ] **When a view fails.**
    - If the first made view of a new sheet with no `identity` fails, nothing more is made and nothing is saved; the line is generate-image's line for that failure (for example "Not made: the request was refused").
    - If a later view fails, the others are still made and the sheet is saved with the views that were made: "Saved Mara · Version 1 · 2 of 3 views". The result names each missing view and why, so the agent can add it in another call.
    - If the sheet save itself fails after views were made (stale, `in_other_sheet`, `no_room` or unavailable), the made views stay saved as draft images filed under the subject, and the result lists their version ids, so the agent can save them as views with `image`: "Not saved: the sheet changed; views kept as images" for stale, and the matching "Not saved: …" line otherwise.
    - Stop ends the line as incomplete, as generate-image does: views already saved stay as draft images, nothing else is sent, and no sheet is saved.
    - In a next-version call, a failed replacement keeps the base's view in place; when no view is made at all, nothing is saved and the line is the first failure's line.
  - [ ] **Result.** The line reads "Making a reference sheet…", then "Saved Mara · Version 1". The sheet's images show under the line. The result gives the sheet version id and each view's name and image version id.
  - [ ] **Guidance.** The description says: one view per image on a plain background; the suggested set for each kind (Shared context) and at most 5 per call; write each view's prompt as one pose or angle; use `identity` for a photo of the subject the user gave; use `image` to put an existing image into the sheet; call again with a view's name to redo it, or a new name to add one; each made view is a paid image; sheets and images are drafts and never approval.
- **Functional verification:**
  - [ ] Integration (`tool-activity.test.ts`, new generate-sheet block, real turns with the scripted model, the Meta fake and a script listing Mara and the Gallery):
    - Mara's sheet with three views and no identity: three Meta requests in order, the first with no input image and the second and third with exactly the first view's image; the first prompt starts with the sheet-view frame, the second and third start with the character keep line followed by the frame, and each contains its view's name; one sheet, version 1, with the three images as dependencies in order and their view names; the second and third images depend on the first; the line reads "Saved Mara · Version 1";
    - with `identity` set to an uploaded image, all three requests carry that image and the identity image is not in the sheet;
    - a view with `image` set to an existing image makes no request for it and is in the sheet;
    - a second call with one view named "face close-up": one request carrying the base's first view; version 2 on the same use with "Face close-up" (the base's spelling) replaced in place and the others unchanged;
    - a 4-view sheet given two new view names is refused with "a sheet holds at most 5 views" and no Meta request; a person's 6-image sheet is refused with its line and no request;
    - a next-version call whose one replacement the fake refuses saves nothing and leaves version 1 current;
    - no script, a subject not in the script, a foreign `identity`, a view `image` already in another sheet, a sixth view, and a video at the use cap each refuse with their line and no Meta request;
    - the fake refusing the first view saves nothing and makes no more requests; the fake refusing the third view saves a two-view sheet with the "2 of 3 views" line;
    - a 2-view sheet gets a call with three views to make (two replacing existing views by name, one new); a person's revision of the sheet while the fake holds the third request makes the save stale: the three images are saved as draft images, no sheet version is added, and the line reads "Not saved: the sheet changed; views kept as images";
    - Stop while the fake hangs on the second request: the line ends incomplete, the first view is a saved draft image, no sheet version is saved, and there is no third request.
  - [ ] Unit (`apps/api/test/unit/agent/generate-sheet.test.ts`): `identity: "null"` means no identity and a view `image: "null"` with a prompt is made from the prompt; a view with neither image nor prompt is invalid; two given views with one name are invalid; the prompt frame text for each kind; `shownMedia` returns the sheet's view image version ids in view order and none on a refusal; every outcome has its line and message; no input is nullable.
- **Regression verification:**
  - [ ] `apps/api/test/integration/tool-activity.test.ts` passes in full (read-workspace, update-script, generate-image, generate-video).
  - [ ] `apps/api/test/unit/agent/generate-image.test.ts` passes (the shared save and size rule unchanged).
- **Editorial/design verification:**
  - The tool lines follow design.md's activity-line rules (at most 60 characters, a phrase while running and a past-tense result).
  - The tool description and the server's prompt frame are reviewed against Shared context and the Vale and Gallery sheet prompts: the view sets per kind, one view per image, the 5-view cap per call, the identity input, and that drafts are never approval. Recorded in the PR; no prose-presence test.
- **Manual-only behavior verification:** N/A. Lou makes real sheets at QA.
- **Planned commits:**
  1. `Feat(agent): Add the generate-sheet tool`
- **Technical notes:** The tool calls one application function, `makeSheet` in `application/sheets.ts`, which resolves and pre-checks, makes the views through the supplied image client, saves each with `saveGeneratedImage` and then the sheet with Story 2's saver. Reuse generate-image's size rule and its Meta failure lines by moving them to a shared module under `agent/tools/` rather than copying them. The other Meta options take generate-image's defaults. The Meta fake gains a hold-until-released step (beside `hang`) for the stale-save case. Filing the made views needs Story 5's column; until it merges, they are saved unfiled and Story 5 adds the filing case.

#### Story 4: Sheet names and the agent's view
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Earlier passes: the chat criterion was proven elsewhere; `mediaVersionName` reuse would add a version suffix and rename non-member versions; hiding members could break item mode.
  - Resolution: The chat criterion is in Story 6; names keyed by version id with exact output; members hidden from the listing only. A sheet's name now follows its subject's current script name.
  - Final review: P2 — view spelling in names. Resolved: names show the view as stored; replacements keep the base's spelling.
- **As a** filmmaker, **I want** an image in a sheet to be called by its subject and view everywhere, and the agent to see each subject's sheet and views, **so that** we talk about "Mara's face close-up", not "Image 5".
- **Dependencies:** Story 3
- **Acceptance criteria:**
  - [ ] **Membership.** A pure helper in `packages/contracts` (`sheetViews(workspace)`) maps each image version id to `{sheetArtifactId, subjectId, subjectName, view}` for the sheets the video currently uses, `subjectName` being the script subject's current name when the sheet's subject is in the script, else the sheet's own. It is the one rule for Assets, the chat and the agent. If people's sheets share an image, the first sheet in workspace order claims it.
  - [ ] **Names.** `mediaVersionName` also takes `sheetViews` (keyed by version id) and names a member version exactly "Mara · Face close-up", with no version suffix and the view as stored. A sheet is named "Mara · Version N" by the same subject name. Other images, and other versions of a member image's artifact that the sheet doesn't list, keep "Image N · Version M", and their numbers do not change when images join a sheet.
  - [ ] **read-workspace.** Each subject is listed with its sheet's version id and `views: [{view, versionId}]` when it has one. Sheet images are not listed again as separate items. Item mode on a sheet returns its full content, and item mode on a view's image version id still returns that image, named "Mara · Face close-up", so other tools' names keep working, including a view whose image's own use has moved on.
- **Functional verification:**
  - [ ] Unit (new `apps/api/test/unit/contracts/sheet-views.test.ts`; `packages/contracts` has no test runner): `sheetViews` returns the current sheet's images only; an image dropped by a later version leaves it; an image in two people's sheets goes to the first in workspace order; a renamed subject renames its views; names follow the rule above, and a version of a member image's artifact that the sheet doesn't list keeps "Image N · Version M".
  - [ ] Unit (`apps/api/test/unit/agent/read-workspace.test.ts`): a listing with Mara's sheet of three images gives Mara with three views and no image items for them; other images keep their numbers; item mode on the sheet returns its full content; item mode on a view's image id returns it named "Mara · Face close-up", and so does item mode on an older view version whose image's use moved on.
  - [ ] Integration (`tool-activity.test.ts`): after a generate-sheet turn, a read-workspace turn returns Mara with her sheet's views and version ids, and the generate-sheet line reads her name.
- **Regression verification:**
  - [ ] `apps/api/test/unit/agent/read-workspace.test.ts`, including its 50-item and 16 KiB budget cases, and the `tool-activity.test.ts` read-workspace block pass.
  - [ ] `test/e2e/chat.spec.ts` image journey and `test/e2e/shots.spec.ts` Generated videos journey pass (names elsewhere unchanged).
- **Editorial/design verification:** N/A — no new copy beyond the names.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(contracts): Name images by their subject and view`
  2. `Feat(agent): List subjects with their sheets`
- **Technical notes:** Keep `workspaceMediaLabels` numbering over all images so no other name moves. Member names are keyed by version id, not artifact id, so only the listed versions are renamed. Hide member images from the listing, not from `workspaceEntries`, so `workspaceItem` still resolves them.

#### Story 5: Images filed under subjects
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Replaces "Groups by name". The earlier final check found a stored sheet group conflicting with renames and people's sheets, two sheets with one name, unknown kinds and long names, untested clauses, and projection regressions.
  - Resolution: Groups are now script subjects: a sheet's subject is in its content, an image's subject id is on its use, names and kinds come from the script, and there are no free names or kinds to validate. The remaining cases (two sheets for one subject, an image edited after joining a sheet, projection reads) keep their tests.
  - Final review: P2 — a subject removed while Meta works; the strict workspace contract. Resolved: the image saves unfiled with a note and a case; `subjectId` is added to the contract.
- **As a** filmmaker, **I want** the agent to file each image under the subject it shows, **so that** I know which assets belong to Mara, the Gallery or the key.
- **Dependencies:** Story 4
- **Acceptance criteria:**
  - [ ] **Stored on the use.** A migration adds a nullable `subject_id text` (1–200 characters) to `artifacts.conversation_uses`. A new image version on the same use (generate-image's `revises`) keeps it unless a new subject is given.
  - [ ] **generate-image.** Takes `subject` (a subject id from read-workspace, default empty). Empty, whitespace or `"null"` means no subject. Any other id not in the current script is refused before any Meta call: "Not made: that subject isn't in the script; add it to the script first". If the subject leaves the script while Meta works, the paid image is saved unfiled and the result says "saved under Other: that subject is no longer in the script". The description says: set the subject the image shows; leave it empty for an image of nothing in particular.
  - [ ] **generate-sheet.** Each view it makes is filed under its subject. A view given as an existing `image` keeps its own subject.
  - [ ] **The workspace.** Each asset in the workspace projection carries its `subjectId`, added as an optional field to the strict workspace `work` contract (`packages/contracts/src/models.ts`) so reads keep parsing, and a pure helper in `packages/contracts` (`subjectGroups(workspace)`) returns one group per script subject in Assets order (characters, places, props), each with the subject, its sheets (the first current sheet for the subject, then any others, in workspace order), its other images, and `empty` when it has neither; then an "Other" group with everything else (no subject, a subject no longer in the script, uploads, and sheets for no script subject). An image's row is left out only when the version its use currently holds is listed by a current sheet. It is the one rule for Assets and the agent.
  - [ ] **read-workspace.** Each listed image carries its `subjectId` when it has one.
- **Functional verification:**
  - [ ] Integration (`tool-activity.test.ts`): a generate-image turn with Mara's subject id files the image under her; a `revises` edit with an empty subject keeps it and one with the Gallery's id refiles it; `"null"` files nothing; an unknown subject id is refused with no Meta request; a generate-sheet turn files its made views under Mara; a view given as an existing image keeps that image's subject; a read-workspace turn lists each image's `subjectId`.
  - [ ] Integration (`migrations.test.ts`): the column exists and refuses an empty id.
  - [ ] Integration (`artifact-writes.test.ts`): `saveGeneratedImage` with a subject not in the script saves the image unfiled and reports it.
  - [ ] Unit (`apps/api/test/unit/contracts/subject-groups.test.ts`): groups follow script kind order; an empty subject is `empty`; sheet members aren't listed as the group's images; a person's sheet whose subject id is in the script is in that group; a subject removed from the script sends its work to "Other"; two current sheets for Mara are both in her group, first one first; an image whose current version isn't in the sheet (a view later edited with `revises`) keeps its row while its old version stays in the sheet; with no script, everything is in "Other".
  - [ ] Unit (`apps/api/test/unit/agent/generate-image.test.ts`): empty and `"null"` subjects file nothing.
- **Regression verification:**
  - [ ] The generate-image integration block and `generate-image.test.ts` pass (counts, inputs, `revises` and refusals unchanged).
  - [ ] `image-upload.test.ts` and `reference-associations.test.ts` pass (uploads and people's saves file nothing).
  - [ ] `artifact-reads.test.ts` and `apps/api/test/unit/agent/read-workspace.test.ts`, including its budget cases, pass with `subjectId` in the projection.
- **Editorial/design verification:** The generate-image description addition is reviewed against Shared context, recorded in the PR.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(artifacts): File an asset under a subject`
  2. `Feat(agent): File images under subjects`
- **Technical notes:** `generated-images.ts` writes an image's use (insert, or update on `revises`); pass the subject through `saveGeneratedImage`, checking it against the current script in the same transaction. Add `subjectId` to the workspace asset projection in `store.ts`. The column sits on the use, not the version, because a subject belongs to this video's script.

#### Story 6: Assets by subject
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Earlier passes: no assertion that the opened sheet has no status and no "Missing views"; the replaced pill assertions weren't named; the grouped list had no approved reference.
  - Resolution: Both asserted; the replaced assertions are named; Lou's QA check approves the list, now following the demo's subject entries (`demo-03.html`).
  - Final review: P2 — the place label. Resolved: Character, Place and Prop, asserted in the journey.
- **As a** filmmaker, **I want** Assets to show each subject from the script with its sheet and images, **so that** I see what each one has and what is still empty.
- **Dependencies:** Story 5
- **Acceptance criteria:**
  - [ ] **Subjects.** Assets shows the groups from `subjectGroups` in order. Each subject entry shows its name and kind ("Mara", "Character"; a place reads "Place" and a prop "Prop"), as in the demo's subject rows, then its sheet entry and its image rows; an empty subject reads "Empty". "Other" comes last and only when it has something. Image rows keep today's names and version history in the viewer. With no script and nothing saved, the tab keeps its empty text.
  - [ ] **One entry per sheet.** Each sheet is listed once, under its subject. An image's row is hidden only when the version its use currently holds is listed by a current sheet.
  - [ ] **The sheet view.** Opening a sheet shows the design guide's Reference sheet layout (`.livesheet`, design.md "Reference sheet"): kicker with the kind ("Character", "Place" or "Prop", replacing today's "Environment reference"), the name, the description, the continuity notes, and the images in a grid, each captioned with its view. Images load through the existing `useOwnedImage` and its shared cache (covered by `apps/web/test/unit/api/owned-image-cache.test.ts`). One image that can't be read shows "This image couldn't be shown" in its slot while the others show.
  - [ ] **No status.** No Draft or Ready pill on sheets or reference rows. The "Missing views" count is removed.
  - [ ] **Opening a view.** Selecting an image opens the existing image viewer for that version.
  - [ ] **Live.** Subjects appear when the script is saved, and sheets and images when they are saved, without a reload (the tab re-read after each tool line).
  - [ ] **The chat.** The images under a generate-sheet line are named by their subject and view, live and after a reload.
  - [ ] **Design guide.** design.md's Assets section describes the subject entries and "Other". Its Reference sheet section, the status-pill rules and the "Phase 3 saved-work reads" approved states (the reference row's Ready pill and "No images are supplied.") say sheets show no status until approval exists.
- **Functional verification:**
  - [ ] Browser journey (`test/e2e/chat.spec.ts`):
    - a scripted update-script turn saves subjects Mara (character), the Gallery (place) and the key (prop); Assets shows three entries in that order, reading Character, Place and Prop, each "Empty";
    - a scripted generate-sheet turn makes three views of Mara; the chat images under the line are named "Mara · Full-body front", "Mara · Three-quarter" and "Mara · Face close-up";
    - a second turn makes one image with Mara's subject and a third makes one with no subject;
    - Mara's entry shows her sheet and one image row, no rows for the three views, and no `.wp-status`; the Gallery and the key still read "Empty"; the unfiled image is under "Other", last;
    - opening the sheet shows three images with naturalWidth > 0 and those three captions, with no `.wp-status` and no "Missing views" text;
    - selecting "Face close-up" opens the image viewer on that exact version;
    - after a reload all of the above holds;
    - a refused `/media` read for one image shows "This image couldn't be shown" in that slot only.
- **Regression verification:**
  - [ ] `test/e2e/chat.spec.ts`, `uploads.spec.ts`, `library.spec.ts` and `saves.spec.ts` pass in one targeted run (image rows, uploads, Library reuse and reference editing unchanged). Assertions on the reference row's Ready or Draft pill, "Missing views" and "No images are supplied." are replaced on purpose by no-status assertions, each listed in the PR.
- **Editorial/design verification:** The design.md edits are reviewed for consistency with each other, with the demo's subject rows and with Lou's no-status decision, recorded in the PR. Lou checks at QA, against design.md: each subject shows its name and kind in script order, empty subjects read "Empty", sheets come before images, "Other" is last, and the sheet layout matches the Reference sheet section. The subject list has no approved reference beyond the demo, so Lou's QA check is its approval.
- **Manual-only behavior verification:** N/A.
- **Planned commits:**
  1. `Feat(web): Show Assets by subject`
  2. `Feat(web): Show a sheet's images in Assets`
  3. `Docs(design): Assets by subject; no status`
- **Technical notes:** `apps/web/src/materials/sheet.tsx` and `content.ts` already render the layout from figures; feed them the sheet's images instead of prerequisites. Subject entries reuse the demo's asset-row markup (`demo-03.html`), without its status pill. Reuse `useOwnedImage` with the near-viewport latch from Sprint 008. Name chat images through Story 4's `sheetViews`.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [ ] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [ ] Run the applicable regression suite on the combined sprint branch.
- [ ] Run any planned cross-story checks not covered by that suite.
- [ ] Record results and unresolved issues in a brief `## Final Review`.

For descriptive-only work, use editorial review and applicable existing checks. Preserve applicable design checks and approval gates. Failed, ambiguous, or unrun required checks remain non-pass.

Sprint-specific completion items:
- [ ] Fold the subjects, reference sheet and filing flows into spec §8.3 (a Subjects and reference sheets block) and the §4 `contracts`, `artifacts` and `agent` rows.
- [ ] Deep gate (`.checks/regression.sh --tier=deep`) on the combined branch.
- [ ] `pnpm live:image` passes dry.
- [ ] A QA build for Lou with live Muse Spark and Meta: write a short script, ask for a character's sheet and a place's sheet, ask to redo one view, and ask for a one-off image of the character. Pass:
  - after the script, Assets shows each of its characters, places and props, Empty;
  - each sheet has 1–5 one-view images with view captions, under its subject, with no separate image rows and no status pill;
  - in the QA database, each made view after the first depends on the sheet's first view (or the identity photo when one was given);
  - the redone view is the sheet's version 2 with the other views unchanged;
  - the one-off image is under the character beside the sheet.

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
