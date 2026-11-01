# Sprint 007 — Script

**Date:** Start 2026-11-02, after Sprint 006 (PR #78) merged into `main` – End after completion gates and Lou's QA
**Goal:** In a local build, a signed-in user asks the agent to write or change the video's script. The agent saves a new script version, which becomes the video's current script, and the Script tab shows it without a reload. An unsaved manual edit is not lost.
**Status:** 🔵 In progress

---

## Handoff

### Project Context
- **Repo:** `/Users/lou/projects/workprint`. Branch `sprint-007` from `main` once Sprint 006 has merged; story branches from `sprint-007`. This sprint doc is committed first on `sprint-007`, not on `sprint-006`.
- **Tech stack:**
  - Strict TypeScript, React with React Aria, Vite.
  - Mastra 1.79.0 with Muse Spark 1.3 (`meta/muse-spark-1.3`), served through the app-owned `@mastra/hono` entry.
  - Supabase Auth/Postgres, SeaweedFS, pnpm.
  - Tests: Node test runner and Playwright, with one shared test stack per run (`scripts/test-stack.mjs`).
- **Current state:**
  - **Chat works (Sprint 006).** Streamed replies, tool activity lines, Stop and titles all work. The tool registry is in `apps/api/src/agent/tools/` (`define.ts`, `index.ts`), and `read-workspace` is the only tool. The scripted provider (`apps/api/test/support/scripted-provider.ts`) can script tool calls in integration and browser tests.
  - **No product path creates a first script.** The workspace's current script is the use with `binding.purpose === 'script'` (`artifacts/store.ts` `workspace()`). Only test fixtures insert one. An empty video's Script tab shows "Your script will appear here once you describe your video."
  - **The assistant writer can't make a script current.** `createArtifactWriters(...).assistant` (`artifacts/writers.ts`) needs an existing artifact and a base version, and it rejects `intendedUse`. `store.insert` rejects an assistant use with state `approved`.
  - **Manual saves already handle conflicts.** A human script save moves the script use to the new version as `approved`. If a newer version was saved during the edit, the editor offers "Latest saved version · Continue with my text" (`versions/manual-editor.tsx`). The Script tab already has a "Version history" list with "Use this version" (`versions/review.tsx`, `versions/use.tsx`).
  - **The Script tab has no Ready/Draft badge.** Only Assets rows and reference sheets render a `StatusPill`, so nothing needs removing and nothing is added (Lou, 2026-11-02).
  - **Workspace reads.** `useWorkspace` (`apps/web/src/shell/workspace.ts`) reads once per account and video through `useScopedRead`, and merges the user's own save and use effects. It doesn't re-read after an agent turn. The chat session's `onSettled` (`conversation/chat-session.ts`) only re-lists Recents (Sprint 006 Story 5).
  - **Tab assembly sits in the materials feature.** `apps/web/src/materials/panel.tsx` builds the Script and Assets tab content and decides `preservePanels` (B-006).
- **Implementation spec:** `docs/specs/implementation-spec-001.md` (§8.1 Chat, §10 MVP plan).

### Sprint-Wide Context
- **Sprint type:** Mixed (one refactor, two features)
- **Shared context:**
  - **Lou's decisions (2026-11-02):**
    - Keep one scene. `savedScriptContentSchema` allows exactly one scene, and that doesn't change.
    - An agent rewrite becomes the current script immediately.
    - The script has no visible Draft or Ready state. Internally an agent save is still never a human approval (AGENTS.md), so its use is stored as `draft`, but nothing shows that state.
    - B-006 is included.
    - Story testing stays minimal.
  - **Version control.** It already exists: every save is a new immutable version, and the Script tab's Version history can view one and "Use this version". No new versioning work.
  - **Tool rules (backlog intro, spec §10).**
    - Each tool lives in its own directory under `agent/tools/` and calls application functions in process.
    - Account and video come from the trusted run scope, never from model arguments.
    - The system prompt and tool list stay static, with no workspace state in them.
- **Non-goals:**
  - Any change to `savedScriptContentSchema`, including more than one scene. If the skill's guidance turns out to need a missing field, the story stops and asks Lou rather than extending the schema.
  - Any approval step for scripts, and removing Ready/Draft from Assets.
  - A version-compare or restore UI beyond the existing Version history.
  - Assets, storyboard or video tools (B-015 to B-020).
  - Refreshing the Assets, Storyboard or Videos tabs for agent saves beyond the generic re-read Story 3 adds.
  - A push channel for workspace changes.

### Affected Flows
- **Existing flows affected:**
  - §8.1 Chat: a new tool activity line, "Updating the script…".
  - Workspace Script tab: shows agent-saved versions, and re-reads after a saving tool finishes and when a turn settles.
  - Manual script edit: the existing stale-save review now also triggers when the agent saved meanwhile.
  - §8.3 Develop script, references and storyboard: an agent rewrite becomes the current script directly, with no human decision step. Reverting an agent rewrite uses the existing Version history "Use this version".
- **New flows introduced:** Agent writes or updates the video's script. It is folded into spec §8.3, with a cross-reference from §8.1, before the completion deep gate. The same fold makes two more changes:
  - It corrects §10's stale sprint rules, both "branch from `phase-3`" and "integrates into `phase-3`", to `main`.
  - It records the MVP exception to §9 SC2 ("no automatic replacement of approved work") and §8.5: for the script, an agent rewrite replaces the current use as `draft`, and reverting goes through "Use this version".

### Verification Strategy

For executable behavior (code, config/scripts, and actual machine-consumed contracts or workflows), define functional and relevant regression proof before implementation. Policy/workflow prose alone is not proof of executable behavior. For descriptive-only docs/design prose, record functional and regression N/A with rationale and use editorial review for accuracy/completeness/consistency. Do not add persistent prose/heading assertion suites. Keep applicable existing checks and design visual/safety/consistency/approval checks under the design skill.

Verification has two categories:

- **Functional verification:** proof of executable behavior introduced or changed by this sprint, or justified N/A for descriptive-only work.
- **Regression verification:** proof of relevant existing behavior, or justified N/A for descriptive-only work.

Each implementation story must include:

- Functional verification for executable behavior it delivers, or justified N/A for descriptive-only scope.
- Targeted regression verification for existing behavior at risk, or justified N/A for descriptive-only scope.

At sprint completion, run the applicable regression suite on the combined sprint branch plus planned cross-story checks not covered by that suite. Do not rerun each story's checks separately when the suite already covers them. For descriptive-only work, use editorial review and applicable existing checks. Reusable functional checks become future regression checks; one-off editorial review is evidence, not a persistent suite.

**Budget (Lou, MVP testing budget).** Each story runs only its targeted tests plus the commit (quick) and push (standard) gates, which add no Docker or browser work. Every new test goes into an existing file or harness. No new screenshot, visual or fixture suites.

### Tests requiring extra consideration

These are the tests that use Docker, a browser build or paid model calls. Each is listed once for the sprint.

1. **`update-script` integration cases** (Story 2), added to `apps/api/test/integration/tool-activity.test.ts` on the shared test stack (Postgres, Auth, storage). They cover:
   - the first save
   - a follow-up save
   - the stale refusal
   - another account's or video's scope
   - invalid content

   A unit test can't prove the saved version and the moved use land together in the database. Cost: one stack start of about 30–60 s, plus a few seconds of test time.
2. **One browser journey** (Story 3) in `test/e2e/chat.spec.ts`. A scripted agent turn saves a script, the Script tab shows it without a reload, and an open manual edit keeps its text.
   - It reuses the worker's shared backend and the single web build; no new fixture.
   - This is the only proof of the cross-boundary pass condition in B-024.
   - Cost: about 5–10 s on top of the existing suite. A standalone run is one stack start plus one vite build, about 1–2 min.
3. **`pnpm live:chat --live`, once, at Sprint Completion.** It adds an `update-script` step: Muse Spark is asked to write a one-scene script and must call the tool with schema-valid content.
   - Paid: about 6 real calls in total, including Sprint 006's steps.
   - It is the only proof that the real model produces content the schema accepts.
4. **Per-story targeted browser runs.** Each is one stack start plus one vite build, about 1–2 min.
   - Story 1 runs `saves.spec.ts` and `navigation.spec.ts`, to check that the refactor didn't move behaviour.
   - Story 3 runs `chat.spec.ts` and `saves.spec.ts`, including its new journey.
   - Story 2 runs no browser tests. Its one extra stack run is the scripted `pnpm live:chat` (no model cost, about 1 min).
5. **Deep gate at Sprint Completion** (`.checks/regression.sh --tier=deep`). It covers check, unit, build, tooling, integration and browser on one stack, plus audit, and costs about 4–18 min.
   - It needs the pinned ffmpeg toolchain in this checkout.
   - It runs after the spec fold. The `main` pre-merge gate runs deep once more on the final head, because the Final Review commit changes the head. So there are two deep runs in total, and no others.

Story 1 adds no tests. Its proof is the existing type, lint and boundary checks plus item 4.

### Stories
**Constraints:** Target 5-8 stories per sprint. Each story should be small enough to review, verify, and merge independently. Split stories that combine unrelated outcomes or cannot be verified with a clear functional/regression verification plan.

Three stories is deliberate (Lou, 2026-11-02): the earlier "assistant script saves" story is folded into Story 2, and the script has no badge to remove (see Current state).

#### Story 1: Move workspace tab assembly to the shell (B-006)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1 (3/5 overall): P2 the new dependency rule had no proof it fires; P2 preservation and remount on switch had no named regression check. Pass 2 (4/5): no findings.
  - Resolution: Added a one-off negative probe and `navigation.spec.ts` to the targeted run; `preservePanels` across same-video changes is left to the deep gate as accepted risk.
- **As a** maintainer, **I want** the shell to own workspace tab assembly and preservation, **so that** Story 3's refresh and later tabs don't reach into the materials feature.
- **Dependencies:** None
- **Acceptance criteria:**
  - [x] The shell (`apps/web/src/shell/`) builds the workspace tab content map and decides `preservePanels`. `apps/web/src/materials/` exports only the Script and Assets content components and imports nothing from `shell/`.
  - [x] `apps/web/src/materials/panel.tsx` is removed or reduced to content-only exports. The shell no longer imports a panel-assembly component from materials.
  - [x] Behaviour is unchanged. Account/video scope keys, tab preservation, `onSaved` and prerequisites flow as before.
- **Functional verification:**
  - [x] N/A for new behaviour (refactor). `pnpm check` (types, lint, dependency-cruiser) passes. `.dependency-cruiser.cjs` gains a rule that `apps/web/src/materials` must not import `apps/web/src/shell`.
  - [x] One-off negative probe, recorded in the PR with no persistent test: add a temporary `materials → shell` import, confirm `pnpm check` fails on the new rule, then revert.
- **Regression verification:**
  - [x] `test/e2e/saves.spec.ts` and `test/e2e/navigation.spec.ts` pass in one targeted run.
    - `saves.spec.ts` covers Script and Assets display, manual save and tab switching.
    - `navigation.spec.ts` covers opening another video and reload, which exercise the scope remount.
    - `preservePanels` across same-video workspace changes is covered by the `library` and `shots` journeys. They run in the completion deep gate rather than per story, which is an accepted risk.
- **Editorial/design verification:** N/A — no visible change.
- **Manual-only behavior verification:** N/A
- **Planned commits:**
  1. `Refactor(web): Move tab assembly to the shell`, which also adds the dependency rule.
- **Technical notes:** Keep the `key={JSON.stringify([accountId, conversationId])}` remount semantics exactly. `ui/panel.tsx` (`WorkspacePanel`) stays the generic tab UI.

#### Story 2: Update-script tool (B-013)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P2s on unverified phrase and summary, description guidance, scope cases, foreign base id vs spec §10, and concurrent first saves. Pass 2 (4/5): P2 refusal outcomes for the activity line were undefined; P2 the live script change had no pre-completion check.
  - Resolution: Added assertions for phrase, summary and selection revision; an editorial check of the description; scope, foreign-base and concurrent cases; named refusal summaries; and a scripted `pnpm live:chat` run.
- **As a** creator, **I want** to ask the agent to write or change my video's script, **so that** the script tab holds the agent's version without me retyping it.
- **Dependencies:** None (independent of Story 1)
- **Acceptance criteria:**
  - [x] **Tool.** An `update-script` tool lives in `apps/api/src/agent/tools/update-script/` and is registered in the production tool list.
    - It takes the complete script content and the id of the script version it last read, which is `null` when the video has no script.
    - Its phrase is "Updating the script…".
    - Its done summary reports the saved version number, for example "Saved version 3". No script text goes in the summary.
    - A refusal still ends the activity line as done, with no script text, so Story 3's re-read runs: "Not saved: the script changed" (stale), "Not saved: script not found" (not-found) or "Not saved: the script isn't valid" (invalid content).
    - A save doesn't change the video's selection revision. Human script saves and uses don't change it either: only storyboard order and shot-video changes do. (Corrected at Story 2 review: the plan said agent saves would increment it "as human uses do", which they don't.)
    - The base id is the only model-supplied id. It resolves only through a query scoped to the account and video. If the run's video doesn't own it, the result is not-found. If the video owns it but it isn't the current script version, the result is stale.
    - The description carries the writing guidance adapted from `~/projects/animation-studio/.pi/skills/create-scene-script/SKILL.md`: scene adaptation, the order of action and dialogue, and speakers. It does not port that skill's YAML format or file workflow.
  - [x] **Validation.** Content is validated by the same `savedScriptContentSchema` as manual saves. Invalid content returns a tool error the model can read, and nothing is saved.
  - [x] **First save.** On a video with no script, the tool creates a new script artifact at version 1, created by the assistant. It also creates the video's script use with state `draft`. Afterwards the workspace read returns that version as `script`.
  - [x] **Next save.** On a video with a script, if the base id equals the current script version id, the tool saves the next version of the same artifact and moves the script use to it with state `draft`. The previous versions stay in Version history.
  - [x] **No overwrite.** If the base id is not the current script version (the user saved meanwhile, or the agent passed a stale or `null` base when a script exists), the tool saves nothing. It returns "stale: re-read the workspace", and no second version or use change occurs. The check and the write run in one transaction.
  - [x] **Scope.** Account and video come only from the run scope. A foreign or missing video returns not-found. An agent save never produces state `approved`.
  - [x] **Application seam.** One new application function, `saveAssistantScript(account, video, content, baseVersionId)` in `apps/api/src/application/`, is passed through the tool collaborators. The `artifacts` domain gains the narrow write it needs, without calling peer domains, and the tool imports no Mastra or application internals.
- **Functional verification:**
  - [x] Add integration cases to `apps/api/test/integration/tool-activity.test.ts`. Each drives a scripted `update-script` call through a real turn, unless it says otherwise, and asserts the database state and the workspace read.
    - **First save:** creates v1 and a `draft` use. The activity line shows "Updating the script…" with the summary "Saved version 1", and the summary contains none of the script text.
    - **Next save:** creates v2, moves the use to it, and the summary is "Saved version 2".
    - **Stale base:** a base id that is an earlier owned version creates no new version, leaves the use unchanged, and the tool result says stale. The line ends done with "Not saved: the script changed".
    - **Foreign base:** a base id owned by another account or another video returns not-found, with no new version and the use unchanged. The line ends done with "Not saved: script not found".
    - **Invalid content:** no write, a tool error the model can read, and the line ends done with "Not saved: the script isn't valid".
    - **Scope:** the chat route already rejects another account's video, so this case calls `saveAssistantScript` directly with a scope for a missing video, and with a scope for a video of the same account other than the base's. Pass: not-found, with zero new versions and no use change.
    - **Concurrent first saves:** two parallel `saveAssistantScript(..., null)` calls give exactly one artifact and one use, and the other call returns stale.
    - Pass: every case asserts the version count and the use's version id and state.
- **Regression verification:**
  - [x] The existing `tool-activity.test.ts` and `artifact-writes.test.ts` cases pass in the same targeted stack run: read-workspace, history redaction, and the human save and conflict paths.
  - [x] `pnpm live:chat` in its default scripted mode (no network, no cost) runs every step, including the new update-script step, so the script is proven before the paid completion run.
- **Editorial/design verification:** Review the tool description against the `create-scene-script` sections it adapts: workflow step 3, "Draft and review one Scene at a time"; the output contract's action and dialogue order; and speakers. Record what was kept and dropped in the PR. There is no prose test. The activity line reuses Sprint 006's tool-line design.
- **Manual-only behavior verification:** N/A
- **Planned commits:**
  1. `Feat(artifacts): Save assistant script versions`, covering the application function and the domain write.
  2. `Feat(agent): Add update-script tool`, covering the tool, its registration, the description and the integration cases.
  3. `Test(agent): Add update-script live step`, which extends `scripts/live/chat.mjs` with an update-script step. It runs in scripted mode for the story's regression run and against Muse Spark in `--live` at completion.
- **Technical notes:**
  - Reuse `publishVersion` (`artifacts/publication.ts`) with `createdBy: 'assistant'`. Its existing `baseVersionId` check gives the stale refusal at the version level. Move or insert the `conversation_uses` row in the same transaction, using `FOR UPDATE` on the current use, like `writers.ts` does.
  - For a `null` base: if a script use exists, refuse as stale. Otherwise create the artifact and use. Two concurrent first saves must not both create a script: lock on the conversation, or use a unique per-conversation script-use constraint if one exists, and check before adding one.
  - The tool's model-facing input must not include account or video ids.
  - Read-workspace already returns the script's exact version id, which the agent uses as the base.
- **Recorded deviations (PR #80, accepted at review 4/5):**
  - **The base is the version in use, not the newest revision.** After "Use this version" on v1 while v2 exists, a save on v1 makes v3 and a save on v2 is stale. The use row is locked and checked instead of `publishVersion`'s latest-revision check. This matches "the current script version" in the AC.
  - **Not found means another artifact, not another video.** A base that isn't a version of the script artifact the video uses is not found. A version of that artifact saved from another video is stale. Only the refusal message differs.
  - **A built-in script in use** is adapted into a new owned script at v1, on the same use, as a draft. The built-in gains no version.
  - **The use limit** (100 per video) reports "saving is unavailable".
  - **No command journal.** Assistant saves write no `artifacts.commands` or `manual_changes` row. Nothing reads them yet. Backlog B-036 records this before later tools rely on the journal.
  - **Seam name.** It's `SaveAssistantScript(accountId, videoId, { content, baseVersionId })`, built by `createAssistantScriptSaver`.

#### Story 3: Script tab updates when the agent saves (B-024)
- **Story Checklist:** (MUST BE CHECKED OFF BEFORE STARTING THE SPRINT)
  - [x] Follows sprint template
  - [x] Acceptance criteria are specific and testable
  - [x] Executable changes have concrete functional and relevant regression verification with pass/fail conditions; descriptive-only scope records N/A with rationale and editorial evidence
  - [x] Story is small enough to review and merge independently
  - [x] Reviewed by sub-agent
  - [x] Review findings addressed or explicitly recorded
  - [x] Ready for Lou
- **Planning review:**
  - Findings: Pass 1: P1 the browser pass condition accepted Version history alone and skipped the first-save path; P2s on effect precedence, late refresh and outcomes, and badge wording. Pass 2 (4/5): P2 the revision ordering key was undefined; P2 plain-view rendering of v2 was not asserted.
  - Resolution: Rewrote the journey (empty video → v1, then editor open → v2, then cancel shows v2). Ordering now keys on `selectionRevision`, with a Use-this-version case. Added unit cases for late refresh and each outcome. Lou (2026-11-02) dropped the badge guard: no badge exists, so there is nothing to test.
- **As a** creator, **I want** the Script tab to show the agent's new script as soon as it is saved, **so that** I don't have to reload, and I don't lose an edit I'm typing.
- **Dependencies:** Story 1 (shell owns tab assembly) and Story 2 (a saving tool exists)
- **Acceptance criteria:**
  - [x] **Re-read triggers.** The open video's workspace is re-read once each time a tool activity line reaches done, and once when the turn settles, whatever the outcome. Reads are for the same account and video only; a late result after a switch is dropped. While an editor is open, a re-read waits and runs once when the editor closes, as a deferred "Use this version" already does, so saved work never changes under a draft. (Added at Story 3.)
  - [x] **Shows the new version.** After the agent's `update-script` finishes, the Script tab's main view shows the new version's text without a reload. This holds on an empty video, which goes from the empty state to the script, and on a video with a script, where Version history lists the earlier version.
  - [x] **Unsaved edit survives.** If the user has the script open in the manual editor with unsaved text, the re-read doesn't replace or clear that text. Pressing Save offers the existing "Latest saved version · Continue with my text" review against the agent's version.
  - [x] **Newest wins.** The user's confirmed save and use effects in `useWorkspace` still merge over a re-read, but only while they are newer. An own effect is dropped once the re-read covers it:
    - Each effect records the refresh count when it was confirmed. A re-read records the count that started it. An effect confirmed before a re-read started is already committed, so that re-read covers it and the effect is dropped. An effect confirmed during or after it is kept.
    - (Corrected at Story 2 review: the plan keyed use effects on `selectionRevision`, but script uses never advance it, human or agent.)
    - If the user saves and then the agent saves, the tab shows the agent's version.
    - If the user picks "Use this version" on v1 while a re-read is in flight, the tab keeps v1.
- **Functional verification:**
  - [x] One browser journey in `test/e2e/chat.spec.ts` with a scripted provider, on an empty video:
    1. Turn 1 calls `update-script` with a `null` base. Pass: the Script tab's main view goes from the empty state to the agent's v1 text without a reload.
    2. The user opens the manual editor and types without saving, then sends a message. Turn 2 saves v2 on the v1 base. Pass:
       - the textarea still holds the typed text;
       - Save shows the latest-version review against v2;
       - Version history already lists v2 while the tab stays on the edit's base;
       - after the user cancels the edit, the main view shows v2's text and Version history lists v1.
  - [x] Unit cases:
    - `chat-session.test.ts`: `onToolDone` fires once per tool that reaches done. `onSettled` fires once for each of completed, failed, interrupted and lost.
    - `apps/web/test/unit/shell/` (a new file), with three cases:
      - a late read result for a previous scope or client is dropped, and a failed re-read keeps the shown value;
      - a user save followed by a re-read whose script has a higher revision shows the agent's version;
      - a "Use this version" on v1 followed by a stale re-read still shows v1, and a re-read started after it shows the agent's later version.
- **Regression verification:**
  - [x] The existing `chat.spec.ts` journeys and `saves.spec.ts` pass in the same targeted browser run: chat states, Stop, titles, manual save and conflict. The existing `apps/web/test/unit/api/paged-read.test.ts` passes, because `useScopedRead` changes.
- **Editorial/design verification:** N/A — no new visual state. The existing editor review and tool line are reused.
- **Manual-only behavior verification:** N/A
- **Planned commits:**
  1. `Feat(web): Re-read workspace after agent saves`, covering the chat-session callback, the shell wiring and the `useWorkspace` refresh.
  2. `Test(web): Cover script refresh on agent save`.
- **Technical notes:**
  - Add a `refresh()` to `useWorkspace` and `useScopedRead` that re-reads in place without clearing the settled value, so tabs don't flash empty or remount the editor. Keep the scope check in a pure helper so the unit test needs no React renderer.
  - Re-reading on every finished tool, including read-workspace, is acceptable: one bounded GET each.
  - A per-tool "changes workspace" flag would need a contract change. Defer it unless review finds the extra reads harmful.

### Sprint Completion

After all implementation stories are complete, perform this checklist before sprint integration. This is a completion step, not a separate story.

- [x] Confirm all stories met their acceptance criteria using recorded implementation and verification evidence.
- [x] Fold the agent script-writing flow into spec §8.3 (cross-referenced from §8.1) before the deep gate, together with the §10 sprint-rule fixes and the SC2 exception (Affected Flows).
- [ ] Run the applicable regression suite on the combined sprint branch: the deep gate (Tests requiring extra consideration, item 5).
  - Audit moderates stay the existing B-004/B-008 non-pass.
  - While a QA host holds 4180, use `WORKPRINT_PREVIEW_PORT=4185`. 4190, the earlier choice, is on the Fetch "bad port" list and fails every journey (Sprint 006 Final Review).
- [ ] Run any planned cross-story checks not covered by that suite:
  - [ ] `pnpm live:chat --live` once on the combined head. Sprint 006's steps pass as before. The update-script step passes when Muse Spark calls `update-script` with schema-valid content and the workspace read returns the new version. One rephrase is allowed. A second refusal or invalid content is a non-pass, fixed before integration.
  - [ ] Then a QA build for Lou (web 4179, API 4180, live Muse Spark).
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
