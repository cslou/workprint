# Backlog

Convention: `docs/conventions/backlog-management.md` (selected harness root; AGENTS.md §12)

## Inbox

## Next

MVP items B-012 to B-020 come from Lou's 2026-11-01 grooming, in Lou's priority order. They will be tied to Sprint 006 and 007 once grooming is done. Each tool lives in its own directory under the agent module and calls application functions in process, never application HTTP routes (implementation spec §10). Assistant saves and generations never count as human approval (AGENTS.md).

### B-012 — Chat with the agent through a tool-using loop
- Problem: Send is still disabled. The only native agent (`apps/api/src/agent/mastra/native-turns.ts`) is text-only: "Do not use tools", one step, a 64-token output cap and an 8-second budget. `DEFAULT_ASSISTANT_MODEL` is checked for syntax only, so no live model is connected. The send/stream path also lost its tests in the Sprint 004 MVP test trim.
- Outcome: The user types into the chat input. The message goes to one Mastra agent loop on the video's native thread (thread id = video id, created on the first accepted send). The loop can answer, call registered tools over several steps and stream its reply, and the reply is saved to history. Pass: the user can talk to the agent and the agent responds; a reload shows the saved conversation.
- Constraint:
  - Lou chose Muse Spark for now (2026-11-01): `muse-spark-1.3`, which Meta lists as recommended for new work and as supporting tool calling. Keep the model swappable, since Lou plans to switch it later.
  - One backend and one Mastra instance; native threads stay the conversation store.
  - The key stays server-only.
  - Raise the current turn limits deliberately rather than removing them.
- References:
  - [Sprint 006](sprints/sprint-006.md) Stories 1–3: the planned model binding, send/stream and Stop work. It was planned for Muse Wonder and will be re-cut around this item.
  - `apps/api/src/mastra/config.ts`: model admission.
  - [Meta models](https://dev.meta.ai/docs/models): model IDs. API base `https://api.meta.ai/v1`, with OpenAI-compatible Responses and Chat Completions APIs.

### B-013 — Agent tool: update the video's script
- Problem: The Script tab can only show and manually edit saved scripts. The agent has no way to write one.
- Outcome: An update-script tool, in its own directory, saves a new assistant-made script version for the current video/thread. The user sees the Script tab update to match. Pass: the database holds the new version and the Script tab shows it.
- Constraint: The saved version is a draft, not an approval. Turn the animation-studio skill's instructions into the tool's description and the agent's guidance rather than copying its local file workflow. The skill's Scene Script YAML schema differs from Workprint's saved script content, so the mapping needs a decision.
- References:
  - `~/projects/animation-studio/.pi/skills/create-scene-script/SKILL.md` and `references/scene-script-schema.md`: Lou's create-script skill.
  - `apps/api/src/artifacts/content.ts`: the saved script schema.
  - `apps/web/src/materials/script.tsx`: the Script tab.

### B-014 — Agent tool: AskUserQuestion with options in the UI
- Problem: The question card UI and contract exist (`questionSchema`, `apps/web/src/conversation/question.tsx`). The agent cannot ask a question yet, and answers cannot reach the agent.
- Outcome: The agent calls AskUserQuestion with a prompt and options. The turn waits, and the UI shows the question as in demo-02: question N of M, lettered options, plus "type your own answer". The user's choice goes back to the agent, which continues with it. Pass: the options appear in the UI, and choosing one resumes the agent with that answer.
- References:
  - `docs/design/demo-02.html`: the approved look.
  - [Sprint 007](sprints/sprint-007.md) Stories 1–2: the planned question reads and exact answers, to be re-cut around this item.
  - `packages/contracts/src/models.ts`: `questionSchema`.

### B-015 — Agent tool: generate images with Meta Muse Image
- Problem: The product cannot create images; users can only upload them (Sprint 005).
- Outcome: A generate-image tool calls Meta's image API from a text prompt, optionally with images already in the user's storage as inputs. It stores the result in private storage as the user's image. The image always appears in the Assets tab. When the user asks for an image directly ("generate me an image"), it also appears in the chat (Lou, 2026-11-01). Pass: the user asks for an image, the agent calls Meta, the image is stored and shown in the chat and in Assets, and a follow-up request can use a stored image as input.
- Constraint:
  - The Meta docs, read 2026-11-01, say:
    - model `muse-image-1.0`
    - `POST /v1/images/generations` for text to image, and `POST /v1/images/edits` with 1–10 input images (`image_url` or `file_id`)
    - base64 output by default
    - blocking calls
    - $0.01 per image
  - Confirm the real response shape with one live call before writing the parser.
  - The key stays server-only.
- References:
  - [Meta image generation](https://dev.meta.ai/docs/image-generation).
  - `~/projects/animation-studio/.pi/skills/generate-image/references/prompt-preparation.md`: prompt guidance.
  - `apps/api/src/storage/`: storage from Sprint 005.

### B-016 — Images on AskUserQuestion options, with exact asset identity
- Problem: Question options carry only an id and a label. The agent cannot show image choices, and an answer cannot say which asset was chosen.
- Outcome: An option can carry a stored image (an exact asset/version), and the UI shows it as a thumbnail. The answer returned to the agent names that exact asset/version, so the agent knows which asset the user means. Pass: the user picks an image option, and the agent's next action uses that exact asset.
- Constraint: Do not guess identity from labels or untyped content. Same principle as B-003.
- References: B-014; B-003; `packages/contracts/src/models.ts` `questionSchema`.

### B-017 — Agent creates reference sheets
- Context: Lou will supply the reference-sheet details and templates soon (2026-11-01). Keep this as a placeholder until then.
- Problem: The Assets tab can show reference sheets (`apps/web/src/materials/sheet.tsx`), but only manual saves create them. The agent cannot create a character, place or prop reference.
- Outcome: The agent creates a reference sheet for a subject: a saved reference version with its description, continuity notes and images generated through B-015. The sheet appears in Assets. Pass: the user asks for a reference sheet, and a saved sheet with images shows in Assets.
- Constraint: Tool or workflow is still open; see B-018.
- References: `~/projects/animation-studio/.pi/skills/create-storyboard/references/reference-package-schema.md` and `generate-image/references/prompt-preparation.md`, until Lou's sources arrive.

### B-018 — Agent makes the storyboard from the script
- Problem: Storyboard reads and manual edits exist (`apps/api/src/artifacts/storyboard.ts`, `apps/web/src/storyboard/`), but the agent cannot plan shots or make panels.
- Outcome: The agent plans shots from the current script version, then creates each panel's image through B-015 using the selected reference sheets. It saves a storyboard version linked to that script and those references. Pass: the Storyboard tab shows the planned shots with generated panel images.
- Constraint: Tool or workflow is pending Lou's decision. The proposal is tools that the B-012 loop drives, with the skill's steps written into the agent's guidance, rather than a Mastra workflow. The skill relies on back-and-forth with the user at each step (shot approval, panel picks), and that fits the conversation loop. A workflow suits fixed, long-running steps that need no judgement.
- References: `~/projects/animation-studio/.pi/skills/create-storyboard/SKILL.md` with `references/panel-generation-strategy.md` and `storyboard-schema.md`; B-013, B-015, B-017.

### B-019 — Agent tool: generate a video with MiniMax
- Problem: The Videos tab and player exist, but nothing produces a generated video.
- Outcome: A generate-video tool takes a prompt and one or more images (uploads or storyboard panels) and starts a MiniMax job. It waits for the result, stores the video, and shows it in the Videos tab. Pass: the generated video is stored, appears in Videos and plays.
- Constraint:
  - Lou chose MiniMax for now (2026-11-01); Meta's API has no video generation, only video understanding.
  - Generation is asynchronous, so the job must survive a long wait and report failure honestly.
  - Confirm the real response shape with one live call before writing the parser. The key stays server-only.
- References: `~/projects/animation-studio/.pi/skills/generate-video/SKILL.md` and `references/minimax-video-v2.md` (MiniMax Video Generation V2, up to two endpoint frames); `apps/web/src/videos/`; `packages/player`.

### B-020 — Agent tool: join videos together
- Problem: There is no way to combine generated clips into one video.
- Outcome: A join-videos tool combines an ordered set of the user's stored videos into a new video. The new video is stored and shown in the Videos tab, and the originals are kept. Pass: the joined video plays in Videos in the requested order.
- Constraint: This is the agent's assembly tool. Export and download stay in B-009.
- References: `~/projects/animation-studio/.pi/skills/assemble-video/SKILL.md` (stream-copy joining with compatibility checks) and `.pi/lib/ffmpeg.mjs`; `apps/api/src/storage/media/sandbox.ts` (the existing ffmpeg sandbox); B-019.

## In progress

## Later

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

### B-005 — Retire test pages
- Problem: The default Vite dev server serves `apps/web/test/*.html` mounts and fixtures. The exposure is development and loopback only, and production builds exclude them.
- Outcome: No test pages remain, so no dev server serves them.
- Work: the branch `chore/phase-3-test-cleanup` deletes every `apps/web/test` page as part of the MVP test trim. Close this item when that branch merges into `phase-3`.
- References: PR #23; `apps/web/vite.config.ts` `server.fs.allow`.

### B-006 — Move workspace tab assembly to the shell
- Context: The PR #26 review also raised two visual-test findings (the spacing canary and duplicate pair helpers). Both are obsolete, because the MVP test trim deleted those suites.
- Problem: `apps/web/src/materials/panel.tsx` assembles the workspace tabs and decides tab preservation, so the shell's tab lifecycle sits inside the materials feature.
- Outcome: The shell owns tab assembly and preservation; materials owns only the Script and Assets content. Behaviour unchanged.
- Constraint: Do it only when the B-013/B-018 work next touches these modules.
- References: PR #26.

### B-003 — Give proposal inputs a display name
- Problem: The proposal card lists inputs by name ("Vale reference (version 1)"), but no contract carries the name. The card therefore fails closed and allows no approval.
- Outcome: If proposals return to the product, each input gets a typed display name through a contract, with no guessing from content or IDs.
- Constraint: The MVP tools (B-012 to B-020) do not use proposals, so this waits. B-016 needs the same no-guessing rule for question options.
- References: PR #14; `apps/web/src/conversation/proposal.tsx`; `packages/contracts/src/models.ts` `proposalSchema`.
