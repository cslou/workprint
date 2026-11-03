# Backlog Archive

Convention: `docs/conventions/backlog-management.md` (selected harness root; AGENTS.md §12)

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
- Work: [Sprint 013](sprints/sprint-013.md) Stories 1–2 (#143, #144). Lou approved the plan (2026-11-03, "go ahead"): the picture is stream-copied and never re-encoded, and the sound is re-encoded once, in step with each clip's picture, because every MiniMax clip's AAC starts with a priming packet that a copied join would turn into drift. The 120 s limit is to revisit later (Lou: "we can deal with the limit later"). Lou's QA is still open.
- Closed: 2026-11-04
- Resolution: Done
- Evidence: Sprint 013 merged into `main` by [PR #146](https://github.com/cslou/workprint/pull/146) at `8a56128` after Lou's QA passed (2026-11-04): the agent joined each Shot's chosen video, else its latest, in Shot order without a yes, the joined video played as one with each Shot's sound in step, and clips of another size were refused, naming the clip. The whole-sprint review's fixes are in #147; the deep main pre-merge passed at `423b3b8`.

### B-043 — Shot videos from reference images
- Context: Lou's QA of Sprint 011 (2026-11-03). Shot videos are made from the first and last panels as MiniMax `first_frame` / `last_frame` (`apps/api/src/application/shots.ts`). Lou worried that frames are too strict, and frames force the panel's 3:2 shape. Two paid MiniMax-H3 reference-to-video (`reference_image`) runs on the QA images kept the subjects, followed the panel's framing and came out 16:9. Lou: "I would say this test passes."
- Problem: Frame-based Shot videos copy the panel too literally, can't take the subjects' sheet views, and come out in the panel's shape rather than 16:9. The agent also has no say in a Shot's length, and a second panel is made as an edit of the first, so it keeps the first's camera.
- Outcome: Each Shot has a length the agent sets and a person can change. Its video is made from up to 9 reference images (the named subjects' sheet views and the Shot's panels), each labelled in the prompt, at 16:9 and the Shot's length. A Shot has a second panel only when its picture changes a lot, for example when the camera moves from one part of a room to another. Pass: a Shot video plays at 16:9, keeps the subjects, and runs for the Shot's length.
- References: MiniMax V2 `/v2/video_generation` reference-to-video (up to 9 `reference_image` items; not combinable with frames); MiniMax's H3 prompt guides (speaker ids and `<d>[English] …</d>` dialogue tags); B-018 and B-019 (the storyboard and Shot videos, Sprint 011).
- Work: [Sprint 012](sprints/sprint-012.md) Stories 1–4.
- Closed: 2026-11-04
- Resolution: Done
- Evidence: Sprint 012 merged into `main` by [PR #141](https://github.com/cslou/workprint/pull/141) at `6410c63`; Lou's QA (2026-11-04, on the `423b3b8` host) passed: each Shot had a length he could change, a second panel only for a real change of picture, and Shot videos at 16:9 and the Shot's length that kept the sheets' subjects.

### B-041 — System prompt for the production workflow
- Context: Lou, 2026-11-03, while planning Sprints 010 and 011. Schedule right after Sprint 011.
- Problem: The system prompt is three static lines (`apps/api/src/agent/mastra/native-turns.ts:23`). Each tool explains itself, but nothing tells the agent the agreed workflow or how its pieces fit together.
- Outcome: The system prompt covers the workflow (script, then reference sheets, then the storyboard, then panels, then Shot videos), how sheets feed panels and panels and Shot text feed videos, and to show the person each step before the next paid one. It stays static so provider prefix caching holds. Pass: a fresh conversation asked to make a short video follows the steps in order and asks before paid steps.
- References: Sprints 010 and 011; `~/projects/animation-studio/.pi/skills/create-storyboard/SKILL.md`; the Muse Spark notes.
- Work: [Sprint 012](sprints/sprint-012.md) Story 5.
- Closed: 2026-11-04
- Resolution: Done
- Evidence: Sprint 012 merged into `main` by [PR #141](https://github.com/cslou/workprint/pull/141) at `6410c63`; Lou's QA (2026-11-04, on the `423b3b8` host) passed the pass condition: a fresh conversation followed the steps in order and asked before paid steps.

### B-015 — Agent tool: generate images with Meta Muse Image
- Problem: The product cannot create images; users can only upload them (Sprint 005).
- Outcome: A generate-image tool calls Meta's image API from a text prompt, optionally with images already in the user's storage as inputs. It stores the result in private storage as the user's image. The image always appears in the Assets tab. When the user asks for an image directly ("generate me an image"), it also appears in the chat (Lou, 2026-11-01). Pass: the user asks for an image, the agent calls Meta, the image is stored and shown in the chat and in Assets, and a follow-up request can use a stored image as input.
- Constraint:
  - Every id taken from model arguments or the browser (image, video, question or option) must resolve to an exact version owned by the trusted account and video, checked by an account- and video-scoped domain query that the tool reaches through an application function; a foreign or missing id returns not-found. Test it with a foreign id (spec §10 Agent tool guidance).
  - The Meta docs, read 2026-11-01, say:
    - model `muse-image-1.0`
    - `POST /v1/images/generations` for text to image, and `POST /v1/images/edits` with 1–10 input images (`image_url` or `file_id`)
    - base64 output by default
    - blocking calls
    - $0.01 per image
  - Confirm the real response shape with one live call before writing the parser.
  - The key stays server-only.
  - Request `output_format: png` or `jpeg`. Meta defaults to WebP, but private storage accepts only `image/png` and `image/jpeg` (`supabase/migrations/20261031000000_private_uploads.sql`).
  - Our storage is private, so input images go to Meta as base64 data URLs, never as public links.
  - The chat history stores only the saved image's id; the chat renders it through the owned image read (`apps/web/src/api/use-owned-image.ts`). Never put base64 in messages.
  - Generated images pass the same verification as uploads before they are saved.
- Constraint: No user authorization before paid calls in the MVP (Lou, 2026-11-01); added later in B-030.
- References:
  - [Meta image generation](https://dev.meta.ai/docs/image-generation).
  - `~/projects/animation-studio/.pi/skills/generate-image/references/prompt-preparation.md`: prompt guidance.
  - `apps/api/src/storage/`: storage from Sprint 005.
- Work: [Sprint 008](sprints/sprint-008.md) Stories 1–5. Planning live calls (2026-11-02) confirmed the response shape and found an XMP AI-generated label in Meta's PNGs, which the sprint keeps.
- Closed: 2026-11-02
- Resolution: Done
- Evidence: Sprint 008 merged into `main` by [PR #91](https://github.com/cslou/workprint/pull/91) at `57ecc93` after Lou's QA passed (2026-11-02), with the QA fixes in PRs #92 and #93. Deep gate and pre-merge passed at `13a2144` (Sprint 008 Final Review).

### B-005 — Retire test pages
- Problem: The default Vite dev server served `apps/web/test/*.html` mounts and fixtures (development and loopback only; production builds excluded them).
- Outcome: No test pages remain, so no dev server serves them.
- Work: [PR #66](https://github.com/cslou/workprint/pull/66) "Phase-3 test clean-up and e2e journeys" deleted the pages; PR #68 moved the remaining unit tests into `apps/web/test/unit/`.
- Closed: 2026-11-01
- Resolution: Done
- Evidence: On `phase-3` at `c83bacf`, `apps/web/test/` holds only `unit/`, and the only web HTML entry is `apps/web/index.html`.

### B-002 — Clear the inherited deepmerge audit advisory
- Context: `pnpm audit` reported GHSA-gcqx-w48m-w2h4 (low) on `deepmerge` 4.3.1. It was reached only through the Mastra CLI build tooling: `mastra` → `@mastra/deployer` → `@rollup/plugin-node-resolve`.
- Outcome: `pnpm audit` no longer reports the advisory, through a durable dependency change.
- Work: Sprint 004 Story 1a, [PR #34](https://github.com/cslou/workprint/pull/34). The app-owned Hono entry removed the `mastra` CLI and with it the only `deepmerge` path. Integrated into `phase-3` by PR #58.
- Closed: 2026-11-01
- Resolution: Done
- Evidence: `deepmerge` is absent from `pnpm-lock.yaml` at `eb98e49`. The Sprint 005 Final Review audit lists only B-004 and B-008 and records that B-002 "is no longer reported".

### B-001 — Bound incoming requests before native body parsing
- Context: Mastra's generated server read POST/PUT JSON bodies before authentication and request deadlines, so an unfinished upload could hold resources before Auth. That is pre-authentication resource exposure, not data access.
- Outcome: Bounded body size and time, with early authentication rejection, through the real serving path.
- Work: Lou approved the app-owned `@mastra/hono` entry on 2026-10-29. Sprint 004 Story 1a ([PR #34](https://github.com/cslou/workprint/pull/34)) moved the server onto it, and Story 1b ([PR #35](https://github.com/cslou/workprint/pull/35), "Bound ingress before native parsing") added the pre-Mastra route catalog, Auth and bounded intake (`apps/api/src/mastra/ingress.ts`, `body.ts`). Integrated into `phase-3` by PR #58.
- Closed: 2026-11-01
- Resolution: Done
- Evidence: PR #35 merged after review on `sprint-004`, and the sprint integrated into `phase-3`. Later, the MVP test trim removed the standalone `qualify:ingress` run from the default checks (Lou's direction, recorded in `docs/sprints/sprint-004.md`). Re-qualify before any public deployment.
