# Backlog Archive

Convention: `docs/conventions/backlog-management.md` (selected harness root; AGENTS.md §12)

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
