# Backlog

Convention: `docs/conventions/backlog-management.md` (selected harness root; AGENTS.md §12)

## Inbox

### B-046 — Shrink reference images if their size becomes a problem
- Context: Sprint 012 planning (2026-11-03). Reference images are sent to MiniMax as stored, as Base64 in the request body. Nine sheet PNGs come to about 36 MB, under the 64 MiB cap; the Shot 1 test used 1,536 px JPEGs at 1.3 MB.
- Open decision: whether to downscale or re-encode reference images before sending, if body size, upload time or MiniMax limits become a problem.
- References: Sprint 012 Story 2 (the request shape and the per-image checks in `apps/api/src/generation/minimax-video.ts`).

### B-042 — Bring a removed subject's work back from the Library
- Context: Sprint 010's sprint-PR review (2026-11-03) found that a subject removed from the script in one save and added back by name in a later save gets its old id, and with it the sheet and images still filed under that id (`apps/api/src/artifacts/script-subjects.ts`, the `same` lookup). This applies to a different kind with the same name too (a prop "Mara" after the character "Mara"). Lou (2026-11-03): whether a subject's work comes back is a Library feature, recorded here for now. The current behaviour stays until then.
- Open decision: whether a re-added subject reclaims its old work automatically, starts fresh with its old work offered from the Library, or does either only for the same kind.
- References: Sprint 010 Final Review (the re-added subject question); Sprint 011 Sprint-Wide Context, "Re-added subjects" (a Shot reference resolves again); spec §2 goal 3 and the `GET /library` read (reuse of saved and Library work).

### B-040 — Image version history is hard to find, and "Use this version" seems not to work
- Context: Lou's Sprint 008 QA (2026-11-02, at `13a2144`). An edit with `revises` (PR #93) saves the image's next version and moves the video's use to it; the earlier version stays, unchanged, in that image's history. Lou couldn't see the history anywhere and suspects a bug, since "Use this version" didn't work either.
- Problem:
  - The history is only in the viewer opened from an Assets row, as a closed "Version history" disclosure under the image. The viewer opened from a chat image has no history.
  - After "Use this version", nothing refreshes: `Assets` gets no `onUsed` from `apps/web/src/shell/workspace-tabs.tsx`, so the row, title and viewer keep the replaced version until the next workspace read. Script and reference rows share this gap.
  - "Use this version" is a human use, so it approves that image version (`apps/api/src/artifacts/uses.ts`). Nothing shows the approval, since media shows no status pill, and later assistant edits of an approved image become new images (SC2). The design guide and comments still say images can't be approved.
- Outcome: The person can find an image's earlier versions from where they see the image, and choosing one visibly takes effect at once. Lou decides whether choosing a version approves it (and then shows a status) or only switches the current version, and whether image history is view-only until the looks picker (Sprint 013). Pass: after an edit, the person opens the earlier version, chooses it, and Assets and chat show it without a reload.
- References: PR #93 (`apps/web/src/materials/assets.tsx` wraps the image viewer in history; `apps/api/src/artifacts/generated-images.ts` makes an approved image's edit a new image); PR #91 body, Pending (the approval and refresh P2s from its re-review); `apps/web/src/versions/review.tsx` (the closed Version history disclosure); `apps/web/src/conversation/shown-images.tsx` (the chat viewer, with no history); `apps/web/src/shell/workspace-tabs.tsx` (no `onUsed` for Assets); spec §8.3 Images and SC2 (why an approval is never replaced); B-036 (edits are not journaled).

## Next
### B-043 — Shot videos from reference images
- Context: Lou's QA of Sprint 011 (2026-11-03). Shot videos are made from the first and last panels as MiniMax `first_frame` / `last_frame` (`apps/api/src/application/shots.ts`). Lou worried that frames are too strict, and frames force the panel's 3:2 shape. Two paid MiniMax-H3 reference-to-video (`reference_image`) runs on the QA images kept the subjects, followed the panel's framing and came out 16:9. Lou: "I would say this test passes."
- Problem: Frame-based Shot videos copy the panel too literally, can't take the subjects' sheet views, and come out in the panel's shape rather than 16:9. The agent also has no say in a Shot's length, and a second panel is made as an edit of the first, so it keeps the first's camera.
- Outcome: Each Shot has a length the agent sets and a person can change. Its video is made from up to 9 reference images (the named subjects' sheet views and the Shot's panels), each labelled in the prompt, at 16:9 and the Shot's length. A Shot has a second panel only when its picture changes a lot, for example when the camera moves from one part of a room to another. Pass: a Shot video plays at 16:9, keeps the subjects, and runs for the Shot's length.
- References: MiniMax V2 `/v2/video_generation` reference-to-video (up to 9 `reference_image` items; not combinable with frames); MiniMax's H3 prompt guides (speaker ids and `<d>[English] …</d>` dialogue tags); B-018 and B-019 (the storyboard and Shot videos, Sprint 011).
- Work: [Sprint 012](sprints/sprint-012.md) Stories 1–4.

### B-041 — System prompt for the production workflow
- Context: Lou, 2026-11-03, while planning Sprints 010 and 011. Schedule right after Sprint 011.
- Problem: The system prompt is three static lines (`apps/api/src/agent/mastra/native-turns.ts:23`). Each tool explains itself, but nothing tells the agent the agreed workflow or how its pieces fit together.
- Outcome: The system prompt covers the workflow (script, then reference sheets, then the storyboard, then panels, then Shot videos), how sheets feed panels and panels and Shot text feed videos, and to show the person each step before the next paid one. It stays static so provider prefix caching holds. Pass: a fresh conversation asked to make a short video follows the steps in order and asks before paid steps.
- References: Sprints 010 and 011; `~/projects/animation-studio/.pi/skills/create-storyboard/SKILL.md`; the Muse Spark notes.
- Work: [Sprint 012](sprints/sprint-012.md) Story 5.


MVP items B-012 to B-020 come from Lou's 2026-11-01 grooming, in Lou's priority order. B-021 to B-025 were added the same day from the former Sprint 006/007 plans and the gaps they exposed, placed where their dependencies need them. B-034 was added the same day from Lou's Sprint 006 decision that the agent names the video, and is ranked second because the new Sprint 006 includes it. In this file, "former Sprint 006/007" means the deleted plans at `eb98e49`; plain "Sprint 006" means the current [Sprint 006 plan](sprints/sprint-006.md). Sprint allocation is in spec §10 [Phase 3 sprint packaging](specs/implementation-spec-001.md#phase-3-sprint-packaging). Spec story IDs (P3-S*, P4-S*) and the "reduced-delivery amendment" or "Submission and recovery contract" cited below refer to text removed from the spec on 2026-11-01; read it with `git show eb98e49:docs/specs/implementation-spec-001.md`. The same applies to the former Sprint 006/007 plans, `git show eb98e49:docs/sprints/sprint-006.md` (and `sprint-007.md`). Each tool lives in its own directory under the agent module and calls application functions in process, never application HTTP routes (implementation spec §10). Assistant saves and generations never count as human approval (AGENTS.md).

### B-012 — Chat with the agent through a tool-using loop
- Problem: Send is still disabled. The only native agent (`apps/api/src/agent/mastra/native-turns.ts`) is text-only: "Do not use tools", one step, a 64-token output cap and an 8-second budget. `DEFAULT_ASSISTANT_MODEL` is checked for syntax only, so no live model is connected. The send/stream path also lost its tests in the Sprint 004 MVP test trim.
- Outcome: The user types into the chat input. The message goes to one Mastra agent loop on the video's native thread (thread id = video id, created on the first accepted send). The loop can answer, call registered tools over several steps and stream its reply, and the reply is saved to history. Pass: the user can talk to the agent and the agent responds; a reload shows the saved conversation.
- Constraint:
  - Lou chose Muse Spark for now (2026-11-01): `muse-spark-1.3`, which Meta lists as recommended for new work and as supporting tool calling. Keep the model swappable, since Lou plans to switch it later.
  - One backend and one Mastra instance; native threads stay the conversation store.
  - The key stays server-only.
  - Raise the current turn limits deliberately rather than removing them:
    - a long overall turn deadline for video polling (B-025 defines what happens when it ends a poll)
    - a stall deadline per model call
    - an output cap large enough for a full script
    - a step cap so a looping agent stops
  - Limits agreed with Lou on 2026-11-01 (output cap and per-call deadline revised the same day after checking Meta's reasoning docs):
    - input up to 32 KiB
    - output up to 32,768 tokens per model call, including reasoning tokens (Meta counts them toward the output limit); if Meta rejects that value, use the largest it accepts
    - at most 100 steps per turn
    - a 35-minute overall turn deadline
    - a model call fails if no data arrives for 120 seconds (a stall limit, not a total duration; it leaves room for reasoning before the first chunk)
  - One active turn per video, with no queue in the MVP (B-026 is Later). While the agent is busy, the composer says so and Send is unavailable; it is not silently dropped.
  - Configuration:
    - The root `.env` holds `META_API_KEY`. Mastra documents `META_MODEL_API_KEY` for its `meta/` provider.
    - Map the key explicitly on the server; never rename or print it.
  - Testing: the send path has no surviving tests. Use a test-only scripted model for deterministic browser tests (it is never in the production build), plus a few live calls.
  - Kept from former Sprint 006 (`eb98e49`) Stories 1–2 and 4:
    - A missing or invalid model configuration makes zero provider calls.
    - No hidden retries or model fallbacks.
    - A lost send acknowledgment never resends automatically, and the draft is kept until acceptance is known.
    - A New video creates its thread only on the first accepted send; a failed first send creates no video.
    - Enter sends once; Shift+Enter and IME composition do not send.
    - Confirm the real Meta response and streaming shapes with a few live calls before finalizing parsing.
  - No spending ceiling for live calls during MVP development (Lou, 2026-11-01); limits are tracked in B-033. Keep tests on the scripted model and make live calls only to confirm real behaviour.
- References:
  - Former Sprint 006 plan, Stories 1–3: the earlier model binding, send/stream and Stop plan, written for Muse Wonder.
  - `apps/api/src/mastra/config.ts`: model admission.
  - [Meta models](https://dev.meta.ai/docs/models): model IDs. API base `https://api.meta.ai/v1`, with OpenAI-compatible Responses and Chat Completions APIs.
- Work: [Sprint 006](sprints/sprint-006.md) Stories 1–2.

### B-034 — Name the video automatically
- Problem: Recents shows every video as "Untitled video", because native title generation is off (`apps/api/src/agent/mastra/native-text-memory.ts` sets `generateTitle: false`).
- Outcome: After the first accepted message, the video gets a short title generated from it. The title shows in Recents and as the history heading, and survives reload. Pass: send a first message, and Recents shows a meaningful title instead of "Untitled video".
- Constraint: At most one bounded title call per accepted message, and only while the video has no title; once a title is saved, no more calls. A failed title call leaves "Untitled video" and never blocks or fails the chat turn. Lou approved this on 2026-11-01.
- References: Mastra Memory `generateTitle`; B-012.
- Work: [Sprint 006](sprints/sprint-006.md) Story 5.

### B-021 — Stream replies and show tool activity in the chat
- Problem: Without streaming, a long agent turn looks frozen. demo-02 also shows tool steps as they happen ("Writing the script… Wrote the script · 3 shots"), which B-012's text-only plan does not cover.
- Outcome: Reply text appears as it streams, and each tool call shows a short in-progress line and then a done line. The chat shows sending, streaming, completed, interrupted and failed states honestly. Failed and interrupted states stay simple and familiar, like ChatGPT's (Lou, 2026-11-01): an inline notice under the affected message, with the draft kept. Any retry is an explicit user action, never automatic. Switching video or account mid-stream drops the late events, so nothing renders in the wrong video. Pass: a reply with a tool call streams text and shows the tool line live; reload shows the saved result.
- Constraint:
  - Each tool comes with its own activity phrase, defined in the tool's directory (Lou, 2026-11-01). For example, read-workspace shows "Getting up to date on our progress…" while it runs. A tool may also return a short done summary, such as update-script's "3 shots".
  - The browser never hard-codes tool phrases. An unknown tool falls back to a generic "Working…".
  - Long tools show elapsed time, for example "Generating video… 2 min" (B-025).
  - Tool lines must survive a reload, so confirm on the installed Mastra version that tool calls are saved with the assistant message.
- Test: a test-only scripted model calls a tool. The test holds the tool open and asserts the in-progress line, releases it and asserts the done line and the streamed text, then reloads and asserts both are still shown.
- References: Former Sprint 006 plan (`eb98e49`), Story 2 states and scope rules; `docs/design/demo-02.html`; B-012.
- Work: [Sprint 006](sprints/sprint-006.md) Stories 2–3.

### B-022 — Stop the agent's reply
- Problem: An agent loop that calls paid tools needs a way to stop it. Former Sprint 006 (`eb98e49`) Story 3 planned an exact-turn Stop, bundled with queue and reconnect work the MVP doesn't need.
- Outcome: A Stop button ends the current agent turn, including any tool still waiting. The UI settles within a bounded time and says "stopped" only when the stop is confirmed, or "unknown" otherwise. Pass: Stop mid-reply ends streaming within the bound, and the partial reply is saved or marked interrupted. Stop during video generation ends the polling, and the saved MiniMax task stays on record so it can be resumed (B-025).
- Constraint: Stop does not cancel the provider's task. MiniMax may still finish and charge, and an in-flight Meta image may still be billed. The UI never claims remote work or charges stopped.
- References: Former Sprint 006 plan (`eb98e49`), Story 3 Stop criteria (five-second acknowledgment cap, ten-second local settlement); the exact-turn control from Sprint 004.
- Work: [Sprint 006](sprints/sprint-006.md) Story 4.

### B-023 — Agent reads the video's current work
- Problem: The tools in B-013 to B-020 need the agent to know the video's current script, assets (with exact image versions), storyboard and videos. Otherwise it cannot update the script, use "an image from the db" (B-015) or know which asset the user means (B-016). Neither sprint plan covers this; the spec calls it P4-S2.
- Outcome: A read-workspace tool returns a compact listing of the video's saved work (names, kinds, exact version ids, short text), and a second call can fetch one item in full. The agent calls it when it needs current state. Pass: asked "what's in my script?" or "use the Vale image", the agent answers from, or uses, the exact saved version.
- Constraint:
  - Account and video come from the trusted server context, never from model arguments.
  - Keep the system prompt and tool list static, with no workspace state or timestamps in them. Meta caches the matching prompt prefix automatically, so changing state early in the prompt would end the match on every turn. Tool results join the conversation after the cached prefix.
- References: `docs/specs/implementation-spec-001.md` P4-S2; [Meta prompt caching](https://dev.meta.ai/docs/prompt-caching); the owned workspace reads from Sprint 005 (`apps/api/src/application/saved-reads.ts`).
- Work: [Sprint 006](sprints/sprint-006.md) Story 3.

### B-013 — Agent tool: update the video's script
- Problem: The Script tab can only show and manually edit saved scripts. The agent has no way to write one.
- Outcome: An update-script tool, in its own directory, saves a new assistant-made script version for the current video/thread and makes it the video's current script as a draft (not approved) workspace use. The user sees the Script tab update to match. Pass: the database holds the new version and the Script tab shows it.
- Constraint:
  - The saved version is a draft, not an approval.
  - Keep Workprint's saved script schema (Lou, 2026-11-01). Adapt only the skill's writing guidance (scene adaptation, action and dialogue order, speakers) into the tool description and agent guidance; do not port its YAML format or local file workflow.
  - The agent must be able to update every field of that schema. The tool accepts complete script content, validated by the same schema as manual saves, so any part can be changed and unedited parts are carried over. If the skill's guidance needs a field the schema lacks, extend the schema through the normal contract change rather than hiding the data in free text.
- References:
  - `~/projects/animation-studio/.pi/skills/create-scene-script/SKILL.md` and `references/scene-script-schema.md`: Lou's create-script skill.
  - `apps/api/src/artifacts/content.ts`: the saved script schema.
  - `apps/web/src/materials/script.tsx`: the Script tab.
- Work: [Sprint 007](sprints/sprint-007.md) Story 2 (PR #80). Assistant saves are not yet journaled: B-036.

### B-024 — Workspace tabs update when the agent saves
- Problem: The Script, Assets, Storyboard and Videos tabs refresh only on reload or after the user's own saves. Every pass condition that says "user sees … updated" (B-013, B-015, B-017 to B-020) depends on this.
- Outcome: When the stream reports a saving tool's result (B-021), and again when the turn ends, the browser re-reads the authoritative workspace and the affected tab shows the new version. No new push channel is needed. Same-video drafts and unsaved manual edits are kept. Pass: the agent updates the script, and the Script tab shows it without a reload while an open manual edit survives.
- References: `apps/web/src/shell/workspace.ts`; B-011 (the related first-read recovery); spec P3-S9 and P4-S14.
- Work: [Sprint 007](sprints/sprint-007.md) Story 3 (PR #81) for the Script tab. The other tabs re-read the same way; their own saving tools come with B-015 to B-020. Remaining: re-reads wait while any editor is open, in any tab. Scope that wait to the tab being edited when other tabs gain saving tools.

### B-017 — Agent creates reference sheets
- Context: Planned as [Sprint 010](sprints/sprint-010.md) (Lou, 2026-11-03): light sheets of at most 5 one-view images, for the subjects the script lists (characters, places, props), shown in Assets by subject with no status, made and revised by one generate-sheet tool; images from chosen sheet views come with Sprint 011's panels.
- Problem: The Assets tab can show reference sheets (`apps/web/src/materials/sheet.tsx`), but only manual saves create them. The agent cannot create a character, place or prop reference.
- Outcome: The agent creates a reference sheet for a subject: a saved reference version with its description, continuity notes and images generated through B-015. The sheet appears in Assets. Pass: the user asks for a reference sheet, and a saved sheet with images shows in Assets.
- Constraint: Built as tools that the agent loop calls (Lou, 2026-11-01). Converting them to workflows can be decided later.
- References: `~/projects/animation-studio/.pi/skills/create-storyboard/references/reference-package-schema.md` and `generate-image/references/prompt-preparation.md`, until Lou's sources arrive.

### B-018 — Agent makes the storyboard from the script
- Context: Planned as [Sprint 011](sprints/sprint-011.md) (Lou, 2026-11-03), with separate `save-storyboard`, `generate-panel` and `generate-shot` tools; at most 2 panels per Shot.
- Problem: Storyboard reads and manual edits exist (`apps/api/src/artifacts/storyboard.ts`, `apps/web/src/storyboard/`), but the agent cannot plan shots or make panels.
- Outcome: The agent plans shots from the current script version, then creates each panel's image through B-015 using the selected reference sheets. It saves a storyboard version linked to that script and those references. Pass: the Storyboard tab shows the planned shots with generated panel images.
- Constraint:
  - Every id taken from model arguments or the browser (image, video, question or option) must resolve to an exact version owned by the trusted account and video, checked by an account- and video-scoped domain query that the tool reaches through an application function; a foreign or missing id returns not-found. Test it with a foreign id (spec §10 Agent tool guidance).
  - Built as tools that the agent loop calls, with the skill's steps written into the agent's guidance (Lou, 2026-11-01). Converting them to workflows can be decided later.
  - The saved storyboard schema requires its source script version, and panel references must be reference versions (`apps/api/src/artifacts/content.ts`), so panels can only cite saved reference sheets (B-017).
  - Panels are generated one image call at a time, each shown as it finishes (B-021).
- References: `~/projects/animation-studio/.pi/skills/create-storyboard/SKILL.md` with `references/panel-generation-strategy.md` and `storyboard-schema.md`; B-013, B-015, B-017.

### B-020 — Agent tool: join videos together
- Problem: There is no way to combine generated clips into one video.
- Outcome: A join-videos tool combines an ordered set of the user's stored videos into a new video. The new video is stored and shown in the Videos tab, and the originals are kept. Pass: the joined video plays in Videos in the requested order.
- Constraint:
  - Every id taken from model arguments or the browser (image, video, question or option) must resolve to an exact version owned by the trusted account and video, checked by an account- and video-scoped domain query that the tool reaches through an application function; a foreign or missing id returns not-found. Test it with a foreign id (spec §10 Agent tool guidance).
  - This is the agent's assembly tool. Export and download stay in B-009.
  - Stream-copy joining needs matching codec, resolution and frame rate, so incompatible clips fail with a clear message rather than being re-encoded in the MVP.
  - Run ffmpeg inside the existing bounded media sandbox, and verify the output like any other video.
- References: `~/projects/animation-studio/.pi/skills/assemble-video/SKILL.md` (stream-copy joining with compatibility checks) and `.pi/lib/ffmpeg.mjs`; `apps/api/src/storage/media/sandbox.ts` (the existing ffmpeg sandbox); B-019.
- Constraint: Its own sprint (013), after reference sheets (010), the storyboard (011) and reference-to-video Shots (012) (Lou, 2026-11-03). It joins the generated and Shot videos.
- Work: [Sprint 013](sprints/sprint-013.md) Stories 1–4. Planning decision (2026-11-03, for Lou to confirm): the picture is stream-copied and never re-encoded, and the sound is re-encoded once, in step with each clip's picture, because every MiniMax clip's AAC starts with a priming packet that a copied join would turn into drift.

Moved after video (Lou, 2026-11-02): AskUserQuestion (B-014) and image options (B-016) wait until video generation (B-025, B-019, B-020) is done. Until then the agent asks in plain chat text.

### B-014 — Agent tool: AskUserQuestion with options in the UI
- Problem: The question card UI and contract exist (`questionSchema`, `apps/web/src/conversation/question.tsx`). The agent cannot ask a question yet, and answers cannot reach the agent.
- Outcome: The agent calls AskUserQuestion with one or more questions, each with options. The tool saves them and the turn ends. The UI shows the question as in demo-02: question N of M, lettered options, plus "type your own answer". The user's choice is sent as their next message, carrying the exact question and option ids (and asset ids, B-016). The agent continues from that message. A typed answer is an ordinary message. Pass: the options appear in the UI, and choosing one resumes the agent with that answer.
- Constraint:
  - Every id taken from model arguments or the browser (question or option) must resolve to an exact version owned by the trusted account and video, checked by an account- and video-scoped domain query that the tool reaches through an application function; a foreign or missing id returns not-found. Test it with a foreign id (spec §10 Agent tool guidance).
  - The answer's asset comes from the saved question's option, never from an id the browser sends.
  - Kept from former Sprint 007 (`eb98e49`) Stories 1–2:
  - Pending questions load from saved records.
  - Answering is idempotent: a repeated answer has no extra effect, and a stale or already-answered question cannot be answered again.
  - Typing an ordinary message while a question is pending leaves it pending.
  - Restart-proof continuation is deferred (B-028).
- References:
  - `docs/design/demo-02.html`: the approved look.
  - Former Sprint 007 plan, Stories 1–2: the planned question reads and exact answers.
  - `packages/contracts/src/models.ts`: `questionSchema`.

### B-016 — Images on AskUserQuestion options, with exact asset identity
- Problem: Question options carry only an id and a label. The agent cannot show image choices, and an answer cannot say which asset was chosen.
- Outcome: An option can carry a stored image (an exact asset/version), and the UI shows it as a thumbnail. The answer returned to the agent names that exact asset/version, so the agent knows which asset the user means. Pass: the user picks an image option, and the agent's next action uses that exact asset.
- Constraint:
  - Every id taken from model arguments or the browser (image, video, question or option) must resolve to an exact version owned by the trusted account and video, checked by an account- and video-scoped domain query that the tool reaches through an application function; a foreign or missing id returns not-found. Test it with a foreign id (spec §10 Agent tool guidance).
  - Do not guess identity from labels or untyped content. Same principle as B-003.
- References: B-014; B-003; `packages/contracts/src/models.ts` `questionSchema`.

After video generation (Lou, 2026-11-02, from Sprint 008 QA): B-038 and B-039 wait until B-025, B-019 and B-020 are done.

### B-038 — Small server-made image previews
- Problem: Chat, Assets and the viewer all read each image's full stored bytes, up to 10 MiB, even where it is shown at most 240px tall or as a 56px key image. Sprint 008 QA fixes made reads lazy and shared within a session, but a page with many images still downloads every full image it shows.
- Outcome: When an image is saved, the server also makes a small preview under the same media checks. Chat and Assets show the preview, and only the viewer reads the full image. Pass: a chat with many images downloads only previews until one is opened.
- Constraint: A preview belongs to its exact version and is never a separate asset or version. It must not weaken the private-media rules: signed, short-lived and owned reads only.
- References: `apps/web/src/api/owned-image-cache.ts` and `apps/web/src/ui/use-near-viewport.ts` (PR #92); `apps/api/src/artifacts/generated-images.ts`; the media sandbox in `apps/api/src/storage/media/`.

### B-039 — Keep images across reloads
- Problem: Each reload reads every shown image again, because the shared copy lasts only for the page session (PR #92). Storage reads are signed, uncached (`cache: 'no-store'`) and short-lived.
- Outcome: Images already seen are not downloaded again after a reload, within a privacy decision Lou makes first: what may be kept on the device, for how long, and that it is cleared on sign-out or account change. Pass: reloading a chat with images makes no new full image reads, and signing out leaves nothing readable.
- Constraint: This is a privacy decision before an implementation choice. Private bytes must never be visible to another account on the same browser.
- References: `packages/api-client/src/private-image.ts` (`no-store`, credential-free reads); `apps/web/src/main.tsx` (clears the session copy on account change); B-038.

## In progress

### B-025 — Long video generation waits in the tool, with a saved task and resume
- Problem: MiniMax video takes about 1–5 minutes. The tool must wait for it without losing a paid task on Stop, disconnect or restart.
- Outcome: Following the Pi `generate-video` pattern (Lou, 2026-11-01), the tool:
  1. submits to MiniMax
  2. saves the task id in a generation record before polling
  3. polls about every 10 seconds, with a 30-minute deadline
  4. downloads, verifies and stores the video
  5. marks the record done or failed, then returns the video to the agent

  The turn stays open throughout, and the chat shows "Making a video… · N min" (B-021). One call makes one video (Lou, 2026-11-02); the agent may call again. Pass:
  - A video started in chat arrives, and the agent continues with it.
  - Closing the browser does not stop it; Sprint 004 made disconnect end only the viewing.
  - After a server restart mid-poll, the job shows as interrupted, and the same saved task resumes when the user asks. Nothing is resubmitted.
- Constraint:
  - No background workflow in the MVP. The user cannot chat during generation, which is accepted (Lou, 2026-11-01); queueing is B-026.
  - Never resubmit a paid task to recover. An uncertain submission with no task id is marked failed with an unknown outcome.
  - When Stop, the 35-minute turn deadline (B-012) or the poll's own 30-minute deadline ends a poll, the record moves to a distinct `interrupted` state: the task id is kept and nothing is resubmitted. The Videos tab shows it as stopped waiting, not running. Only an explicit resume (the user asks, and the agent names that record or its shot) polls the saved task again; a new prompt always submits a new task. The resumed record id must be owned by the trusted account and video, checked by an account- and video-scoped domain query that the tool reaches through an application function, with a foreign or missing id returning not-found (test it). After MiniMax's 7-day query window, counted from the saved submission time, an `interrupted` record becomes `failed` with an unknown outcome. The expiry is applied lazily when the record is read and before any resume; resuming an expired record makes no MiniMax call. Test both paths. A server restart marks `running` records `interrupted` and resumes nothing by itself (Lou, 2026-11-02): the user asks, as after Stop.
  - MiniMax result URLs are time-limited and may carry credentials, so never persist or log them; query the task again for a fresh URL. Tasks are queryable only for 7 days.
  - The Videos tab shows the record's saved status (queued, running, interrupted, done, failed) after a reload, with no invented progress.
- References:
  - `~/projects/animation-studio/.pi/skills/generate-video/SKILL.md` (submit → save manifest → poll → download → validate, plus `--resume-manifest`).
  - `references/minimax-video-v2.md`.
  - Former Sprint 007 plan, Story 3 (generation records); `packages/contracts` `generationRequestSchema`.
- Work: [Sprint 009](sprints/sprint-009.md) Stories 2, 3 and 5.

### B-019 — Agent tool: generate a video with MiniMax
- Problem: The Videos tab and player exist, but nothing produces a generated video.
- Outcome: A generate-video tool takes a prompt and up to two images (first and last frame, from uploads or storyboard panels) and starts a MiniMax Video V2 task. It waits for the result as in B-025, stores the video, and shows it in the Videos tab. Pass: the generated video is stored, appears in Videos and plays.
- Constraint:
  - Every id taken from model arguments or the browser (image, video, question or option) must resolve to an exact version owned by the trusted account and video, checked by an account- and video-scoped domain query that the tool reaches through an application function; a foreign or missing id returns not-found. Test it with a foreign id (spec §10 Agent tool guidance).
  - Lou chose MiniMax for now (2026-11-01); Meta's API has no video generation, only video understanding.
  - The key is `MINIMAX_API_KEY` in the root `.env`, added by Lou on 2026-11-01. It is server-only; never print it.
  - Waiting, resume and failure handling follow B-025.
  - Frames go to MiniMax as data URLs, because storage is private.
  - Use one fixed resolution and frame rate for every shot, so B-020 can join clips without re-encoding.
  - The result must pass the Sprint 005 media verification (`video/mp4`) before it is saved and playable.
  - Confirm the real response shape with one live call before writing the parser. The key stays server-only.
- Constraint: No user authorization before paid calls in the MVP (Lou, 2026-11-01); added later in B-030.
- References: `~/projects/animation-studio/.pi/skills/generate-video/SKILL.md` and `references/minimax-video-v2.md` (MiniMax Video Generation V2, up to two endpoint frames); `apps/web/src/videos/`; `packages/player`.
- Decisions (Lou, 2026-11-02):
  - Assistant-made videos may use MiniMax's format (H.264 High profile, no aspect-ratio tag), still fully decoded and measured; uploads stay strict.
  - Generated videos show in a "Generated videos" list in the Videos tab ("Video N · Version 1") and, when asked for directly, in the chat. Linking a clip to a Shot comes with the storyboard (B-018).
  - Fixed output: MiniMax-H3 at 768P, 24 fps, for B-020.
- Work: [Sprint 009](sprints/sprint-009.md) Stories 1 and 4–7.

## Later

Deprioritized: everything here waits until the Next items are done (Lou, 2026-11-01). Nothing here is ranked.

### B-044 — Consistent voices and lip sync through MiniMax speech
- Context: Lou's QA of the reference-to-video test (2026-11-03): "audio is correct in general but does not match the face, but we will fix that later." Lou wants it in a later sprint. Research the same day (`docs/research/voices-and-speech-2026-11.md`, private) proposes the design below.
- Problem: MiniMax-H3 makes each Shot's sound itself, so a character's voice changes from Shot to Shot and the lips don't follow the line. Workprint has no voice asset, no audio media type and no speech client.
- Outcome:
  - Each speaking character has a voice under its subject, separate from its sheet: a saved, versioned asset with a sample clip, made by the agent as a draft and chosen by a person with "Use this version". MiniMax's voice id stays on the server. Preset or designed voices only, no cloning (account verification and consent).
  - Each Shot with dialogue gets one dialogue track made in those voices (`speech-2.8-hd`, about $0.006 a line), exactly the Shot's length with about 1 s of silence first, saved as the Shot's own work. It goes stale when a line or a voice changes.
  - generate-shot sends the track as `reference_audio` with timed lines (`At 00:01.000, Mara (S1) says: <d>…</d>`) and refuses a Shot with dialogue but no current track. New tools make a voice and a Shot's track; the track tool says how many seconds the speech needs and never changes a length a person set.
  - The system prompt's order becomes script → sheets and voices → storyboard → panels → dialogue tracks → Shot videos.
  - Lou's decisions (2026-11-03):
    - A narrator is a subject of its own kind, listed by the script when it has narration lines: a voice with no sheet. Assets shows it in its own "Narrator" group beside characters, places and props.
    - A voice is not part of the sheet. It is its own version under the subject, shown beside the sheet in the subject's group, so changing a voice never makes a new sheet version and redoing a sheet view never touches the voice.
    - People can hear the audio: each voice has a sample to play, with "Use this version", and each Shot's dialogue track plays in the Shot's row before its video is made.
  - Pass: two Shots with Mara's lines sound like the same voice, and in each her mouth moves in time with her own words. Lou judges it at QA. A changed line or voice makes the track stale, and generate-shot refuses it until it is remade.
- Constraint: Needs an audio media type (file check, storage, player, one fixed format so joining still works). MiniMax takes at most 3 audio clips of 2–15 s, 15 s in total, and 12 files with the images, so the job input cap rises from 9 to 12.
- Blocker: A paid test (about $1.92, four 6 s runs on QA Shot 1, on Lou's go) must show that H3's lips follow supplied speech on the hosted API before this is scheduled. It isn't documented, and outside reports conflict. Open decisions for Lou: whether the speech call may be resent when its answer is lost; whether to swap our track into the clip; when to pay a designed voice's $3.
- References: `docs/research/voices-and-speech-2026-11.md` and its folder of saved docs (private); MiniMax speech `/v1/t2a_v2`, voice design and pricing; MiniMax V2 video `reference_audio`; H3 prompt guides (`ref-en.txt` §2.4, §4.2); Sprint 012 Stories 1 and 3; B-020; B-045.

### B-045 — Narration and voice-over as their own track
- Context: Research for Sprint 012 and B-044 (2026-11-03). A voice-over line in a Shot's prompt ("says in an off-screen voiceover … while her lips remain completely closed") is the only way to ask H3 for narration today, and it is made per Shot.
- Problem: Narration made inside each Shot's clip can't run across Shots, change without remaking the clip, or keep one voice. Sending it as a Shot's audio could make mouths move.
- Outcome: Narration and voice-over are made with MiniMax speech, in the narrator's or the character's voice from B-044 (a narrator is its own subject in Assets, Lou 2026-11-03), as their own track and laid over the joined video, re-encoding the audio once while the video is copied untouched. Pass: a narration line plays across two joined Shots in one voice, and no character's mouth moves with it.
- References: B-020 (joining clips, Sprint 013); B-044 (voices); `docs/research/voices-and-speech-2026-11.md` (private); Sprint 012 Story 3 (the voice-over prompt form).

### B-037 — Delete saved work
- Problem: Saved work is append-only. Images (uploaded or generated), scripts and videos can be versioned but never deleted, so a user can't remove an unwanted image from Assets or storage. Lou raised it while planning Sprint 008 (2026-11-02): "we probably need that in the future".
- Outcome: A user can delete an image (and later other saved work) from a video. It leaves the video's Assets, and its stored bytes are removed when nothing else uses it. Pass: a deleted image no longer appears in Assets or read-workspace, and its object is gone from private storage when unused.
- Constraint: Decide what happens to work that depends on the item (for example a storyboard panel or video that used the image as a reference) before deleting. It applies to uploads as well as generated images. Spec §8.8 (Delete work/account) is deferred and describes the full-release behaviour.
- References: Sprint 008 planning; `docs/specs/implementation-spec-001.md` §8.8; `apps/api/src/storage/s3.ts` (`remove`).

### B-026 — Queue messages while the agent is replying
- Problem: Former Sprint 006 (`eb98e49`) Story 3 planned letting the user send up to three more messages while a reply streams, kept in order. Lou does not need it for the MVP but wants it tracked (2026-11-01).
- Outcome: Messages typed during a reply queue in order with distinct identities. Overflow is rejected before any extra model call, and an unclear queue acknowledgment never resends.
- References: Former Sprint 006 plan, Story 3.

### B-032 — Run video generation in the background so chat stays free
- Problem: In the MVP the video tool waits inside the turn (B-025), so the user cannot chat for 1–5 minutes per video. Lou accepted this for the MVP and wants a better approach afterwards (2026-11-01).
- Outcome: The tool starts an independent job and returns at once. The job's saved status shows in Videos, and the agent learns of the result without the user having to ask.
- Constraint:
  - Reuse the Mastra workflow execution that Sprint 004 qualified; no second scheduler.
  - Stop and disconnect never cancel the job.
  - Telling the agent that a job finished is the hard part. It needs a saved-report and acknowledgment design.
- References: B-025; spec "Submission and recovery contract", P3-S18/S19 and P4-S9/S14; B-026, B-029.

### B-033 — Set spending limits for live model and generation calls
- Problem: Lou set no spending ceiling for Meta (chat and images) or MiniMax (video) calls during MVP development, to save time (2026-11-01). The product also lets the agent generate without user approval (B-030), so nothing caps cost.
- Outcome: Agreed limits for development and product use, such as per-account caps, per-turn generation limits or a monthly ceiling, enforced on the server.
- Constraint: This depends on knowing actual usage (B-010). Proposal estimates are not measured usage.
- References: B-010, B-030; spec reduced-delivery amendment.

### B-027 — Reconnect to an in-progress reply after reload
- Problem: Former Sprint 006 (`eb98e49`) Story 3 planned re-attaching to a still-running turn after a reload or reconnect, inside the native three-second replay window. The MVP shows the saved result instead.
- Outcome: A reload during streaming re-attaches to the same turn without resending, or honestly reports the reply's state as unknown once the replay window has passed. Closing the view never sends Stop.
- MVP behaviour (Sprint 006, accepted by Lou 2026-11-01): after a reload mid-reply the page shows saved history with no "Working…", live text or Stop; a send gets `busy`; the finished reply appears on a later reload.
- References: Former Sprint 006 plan, Story 3; Sprint 006 Story 2.

### B-036 — Journal assistant saves for downstream revalidation
- Problem: Sprint 007's update-script tool saves a script version and moves the use, but writes no `artifacts.commands` or `manual_changes` row, which human saves write. Sprint 008's generate-image edit with `revises` (PR #93) moves an image's reference use the same way, without the `use_changes` row a human "Use this version" writes. Nothing reads the journal yet, so nothing breaks today. A later tool that revalidates downstream work after a change (storyboard from script, B-017 onward) would miss assistant changes.
- Outcome: Assistant saves record what they replaced, in the same shape later revalidation reads for human saves. Pass: a downstream check sees an assistant script change the same way it sees a human one.
- References: Sprint 007 Story 2 (PR #80) recorded deviations; `apps/api/src/artifacts/assistant-scripts.ts`; `apps/api/src/artifacts/generated-images.ts` (the `revises` save); `apps/api/src/artifacts/uses.ts` (`upstreamAffected`); `apps/api/src/artifacts/writers.ts`.

### B-035 — Clean history for retried and stopped replies
- Problem: In Sprint 006, Retry may resend the user's message if Mastra 1.79 cannot regenerate a reply, so history can show the message twice. A stopped reply is marked interrupted only live; after a reload it shows as plain partial text. Lou accepted both for the MVP (2026-11-01).
- Outcome: After a Retry, history shows the user message once with the completed reply. A stopped reply keeps an "interrupted" marker after reload, returned safely by the history route.
- References: Sprint 006 Stories 2 and 4.

### B-028 — Questions survive a server restart mid-continuation
- Problem: Former Sprint 007 (`eb98e49`) Story 2 planned a durable, recoverable hand-off from a saved answer to the agent's continuation, proven by killing and restarting the server. The MVP passes the answer back as the next message (B-014).
- Outcome: An answer committed just before a crash still leads to exactly one continuation after restart, with no duplicate effects.
- References: Former Sprint 007 plan, Story 2.

### B-029 — Cancel a running generation request
- Problem: Former Sprint 007 (`eb98e49`) Story 4 planned cancelling one owned generation request, with idempotent cancellation, races against success or failure, and the provider's remote outcome (requested, unsupported or unknown).
- Outcome: The user cancels one request; local status and the remote outcome are reported separately, and other work keeps running.
- Constraint: Never claims remote work or charges stopped.
- References: Former Sprint 007 plan, Story 4; B-025.

### B-030 — Review and approve generation proposals before paid calls
- Problem: The spec requires an exact human-approved proposal before any paid image or video call (P4-S8, P3-S7). Former Sprint 007 (`eb98e49`) Stories 1–2 planned the proposal card reads and approval. Lou's MVP list has the agent generate on request instead.
- Outcome: If proposals return, the user reviews the exact prompt, inputs, model and estimate, and approves once before paid work starts. B-003 supplies the input names.
- Constraint: Lou decided on 2026-11-01 that the MVP needs no user authorization before paid image or video calls, to save time. This item adds that authorization later.
- References: Former Sprint 007 plan, Stories 1–2; B-003; spec "Submission and recovery contract".

### B-031 — Deploy the MVP
- Problem: The spec's P4-S19 deploys the reviewed build to Cloudflare (web), one Railway backend, Supabase and private R2, with an operating handoff. Lou decided on 2026-11-01 that the MVP does not need deployment; it runs locally.
- Outcome: When authorized, deploy the exact reviewed build to those services and verify the deployment-specific wiring. Before any public exposure: re-qualify bounded ingress (archived B-001); resolve or re-decide the audit exceptions B-004 and B-008; and resolve or explicitly re-decide paid-call authorization (B-030) and spending limits (B-033), because without them any signed-in account can trigger unlimited paid Meta and MiniMax calls on the server's keys.
- References: `docs/specs/implementation-spec-001.md` §7 Deployment and P4-S19.

### B-011 — Recover an initially failed workspace read
- Problem: If the first workspace read fails, a later successful image upload cannot show its new Assets row, because no loaded base exists to add it to. The user must reload. A minor issue (P2) from the PR #41 re-review.
- Outcome: A failed first read can recover with one bounded re-read, without replaying saves or keeping another account's data. Pass: failed first read → successful upload → the Assets row appears without a reload.
- References: `apps/web/src/shell/workspace.ts`; PR #41.

### B-010 — Restore deferred model usage records
- Problem: Lou deferred recording each model call's usage to shorten delivery. No usage totals, spend tracking or billing claims are possible until this exists.
- Outcome: When authorized, persist each real model call with its account, conversation and usage (reported, estimated or unknown), without merging genuinely repeated calls.
- Constraint: No hidden paid retries. Provider-specific usage for image/video generation (B-015, B-019) needs a decision before release.
- References: `docs/specs/implementation-spec-001.md` reduced-delivery amendment and P3-S1c.

### B-009 — Deliver verified export
- Problem: Lou deferred export on 2026-10-31. Exporting exact selected versions, publishing the result, downloading it and recovering from failures are all unbuilt.
- Outcome: When authorized, the user can export a film from exact selected versions and download it, with honest failure and cancellation handling. The UI never pretends export works meanwhile.
- Constraint: B-020 (joining clips inside the conversation) is separate and does not deliver export.
- References: `docs/specs/implementation-spec-001.md` P3-S11–S13.

### B-007 — Upgrade Mastra to 1.80.x
- Problem: The Mastra packages are pinned at 1.79.0 (with `@mastra/hono` 1.7.21) because the 1.80 cohort was too new for pnpm's release-age policy on 2026-10-28. Lou deferred the upgrade until after Wave 1, which has now integrated into `phase-3`.
- Outcome: A standalone change moves the Mastra packages, including `@mastra/hono`, to the newest releases that pass the release-age policy. The trimmed full test run passes afterwards.
- Constraint: No release-age exclusions, overrides or resolutions. A breaking change that needs more than version-mechanical adaptation stops for a decision. Do it before or after the B-012 agent work, not during it.
- References: [Story 001](stories/story-001.md) scope change note; PR #33.

### B-004 — Clear the @hono/node-server audit advisory
- Problem: `pnpm audit` reports GHSA-rmxm-3fg6-px4f (moderate) on `@hono/node-server` 1.19.17: `serveStatic` can bypass middleware on static paths. It is now a direct dependency, used only for `serve()`, and is also reached via `@mastra/hono` → `@hono/node-ws`. No compatible patched release exists. Workprint never calls `serveStatic` and does not serve Studio.
- Outcome: The audit passes through an upstream fix. Failing that, re-assess against the real serving path before any shared or public deployment.
- Constraint: Lou approved this as a private/local exception (2026-10-29). Report audit as NON-PASS, never as a pass. No ignore, override or vendor patch.
- References: [GHSA-rmxm-3fg6-px4f](https://github.com/advisories/GHSA-rmxm-3fg6-px4f); PR #22.

### B-008 — Clear the minimatch audit advisory
- Problem: `pnpm audit` reports GHSA-g3hv-75wg-m249 on inherited `minimatch` 10.2.6 developer-tool paths (ESLint/typescript-eslint, plus readdir-glob and serve-handler). The patched 11.x is outside the consumers' declared ranges. Static review found no production path or application-controlled glob.
- Outcome: Remove the advisory through compatible upstream releases or an authorized toolchain upgrade, without suppression or an undeclared major override.
- Constraint: Approved on 2026-10-31 as a temporary private/local exception. Audit stays NON-PASS. It gates shared/public deployment.
- References: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249); `docs/sprints/sprint-004.md` and `sprint-005.md` safety decisions.

### B-006 — Move workspace tab assembly to the shell
- Context: The PR #26 review also raised two visual-test findings (the spacing canary and duplicate pair helpers). Both are obsolete, because the MVP test trim deleted those suites.
- Problem: `apps/web/src/materials/panel.tsx` assembles the workspace tabs and decides tab preservation, so the shell's tab lifecycle sits inside the materials feature.
- Outcome: The shell owns tab assembly and preservation; materials owns only the Script and Assets content. Behaviour unchanged.
- Constraint: Do it only when the B-013/B-018 work next touches these modules.
- References: PR #26.
- Work: [Sprint 007](sprints/sprint-007.md) Story 1 (PR #79).

### B-003 — Give proposal inputs a display name
- Problem: The proposal card lists inputs by name ("Vale reference (version 1)"), but no contract carries the name. The card therefore fails closed and allows no approval.
- Outcome: If proposals return to the product, each input gets a typed display name through a contract, with no guessing from content or IDs.
- Constraint: The MVP tools (B-012 to B-020) do not use proposals, so this waits. B-016 needs the same no-guessing rule for question options.
- References: PR #14; `apps/web/src/conversation/proposal.tsx`; `packages/contracts/src/models.ts` `proposalSchema`.
