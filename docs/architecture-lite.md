# Workprint — Architecture Overview

**Architectural background—not implemented.** Source: [full architecture](architecture.md). Migrated 2026-10-27. The detailed sections below retain the earlier broader design, not the current release checklist. Current scope follows the full architecture's current-MVP notice: Muse direction; single-clip playback; compatible stream-copy export; no deletion, spending controls, model selectors, Editor, audio-reference work or multi-scene Project. Older in-scope/open statements below are historical. Obtain the approved local spec/sprint before implementation; they are not published with public clones.

## Architecture

The application has a browser frontend and one backend service, supported by managed services:

- **Browser frontend:** chat, workspace panel (Script · Assets · Storyboard · Videos), Library and playback.
- **Backend service:** Mastra's native Node.js server receives authenticated requests. Normal agents handle short turns; Mastra workflows handle background generation. Application modules enforce production rules.
- **Managed services:** Supabase Auth/Postgres, Cloudflare R2 for private media, Muse as the intended assistant/image/video model family, with exact supported interfaces still to be qualified.

Commands go through the backend; authorised uploads/playback use signed R2 URLs directly.

Browser routes, registered agent tools and workflow steps reuse appropriate owning-domain actions in-process; the agent does not make HTTP calls to itself. Tools cannot bypass ownership, spending or human-only approval, and do not expose every browser operation. Generation submission is an agent-tool operation, not an agreed public endpoint.

## Film production lifecycle

**Script → Visual and audio references → Storyboard → Video Takes → Edit, finish and export**

1. **Script.** Start with an idea, brief, source text or existing script. Draft or refine what happens: Narrative Scenes, Shots, dialogue and overall look. The person reviews the story.
2. **Asset sheets and audio references.** Identify characters, places and props; reuse supplied or saved references, or develop visual sheets. Where needed, add authorised character voice samples, pronunciation/performance notes and ambience/music references. The person approves their intended use. References support consistency, not guaranteed identity.
3. **Storyboard.** Plan each Shot’s framing, camera movement, action, approximate duration, dialogue and sound cues. Generate visual Storyboard Panels from the script and asset references; review clarity and continuity, then approve the visual plan.
4. **Video Takes.** Prepare generation requests from the storyboard using only references and settings supported by the selected model. Generate candidate Takes, check picture and any provisional audio, and let the person choose or request alternatives. Keep versions; chosen Takes are not a finished film.
5. **Edit, finish and export.** Shape chosen material through timing, pacing, picture and available audio; add music, effects, titles or captions only as needed. Mixed generated sound remains **Original audio** unless separate media exists. The person can use direct controls or ask the assistant to change the same edit without overwriting originals. Review the result and export; no mandatory edit or Editor visit is required before export.

**Audio reference note.** Establish voice, pronunciation and delivery references for characters, ambience references for locations, and optional music mood/style references during the asset-reference stage. These guide later generation and review; send audio references to a provider only where supported and authorised. References define the target, not an approved dialogue performance.

### Notes on the lifecycle

These stages provide a starting structure for four broad phases of the **Production Process**: development, pre-production, production and post-production. They are not exhaustive or a rigid sequence.

Refinements within existing capabilities may require only prompt or skill changes. New capabilities may also require changes to data schemas, tools, provider integrations or the interface. For example, adding audio references may involve reference-schema fields, supported provider inputs and appropriate review controls.

Users can enter at the relevant stage with existing material—including working only on post-production. The assistant adapts to their starting point and establishes any missing inputs or approvals rather than requiring every earlier stage to be repeated.

## API Surface

**Core browser operations, not endpoint contracts.** B-020 defines HTTP/stream contracts and qualified native Mastra mappings; a row does not imply a new custom endpoint. All operations enforce trusted identity and ownership.

Artifacts are production work products with versions and review relationships; associated media files are their stored bytes. Scripts may need no separate file. File access is not a competing domain entity or an approval action.

| Operation | Purpose |
| --- | --- |
| Send message | Start a normal turn, or queue the message if a turn is active |
| Load conversation | Load saved messages and authoritative pending-question records, not inferred approvals |
| Subscribe to updates | Observe output/change notices; reconnect reloads state without replaying commands |
| Stop turn | Stop the identified observed turn, not generation |
| Load workspace panel | Read versions, approval links, active Generation Requests and authorised image/poster URLs |
| Save Artifact Version | Save a manual edit against its base version; reject stale edits. Link the new version approved; no turn starts |
| Answer question | Save the answer and any approval/link changes for the saved question's exact versions atomically; notify through a recoverable hand-off |
| Use Artifact Version | Link the person's selected exact version, including a Library pick, approved for that thread's use |
| Request upload URL | Authorise one file's key/size/type and return a signed R2 upload URL |
| Confirm upload | Validate the authorised file's size/type; register its Artifact Version and link it to the thread, approved |
| Get playback sources | Obtain authorised video URLs, including candidates; Play all uses chosen versions in Shot order. Viewing never selects |
| Cancel Generation Request | Record guarded cancellation and request workflow/provider cancellation; remote work or charges may continue |

Library browsing, thread creation/listing/resumption and Artifact/version/thread/account deletion also remain in scope; see the [full API inventory](architecture.md#api-surface). B-020 determines thread-creation mechanics. Scheduled file cleanup is internal, not a browser operation.

## Scoping Decisions

1. **Native first:** qualify Postgres-backed Mastra workflows; use pg-boss only for a demonstrated gap, never alongside them.
2. **Separate state:** Mastra owns conversation and Workflow Run records; application tables own production records.
3. **Safe recovery:** commits and Workflow Run starts are not atomic. Reconcile dispatch; steps may repeat. Never blindly retry uncertain paid submissions.
4. **Human approval:** no assistant approval/replacement of approved versions. Reject stale edits; manual saves start no turn.
5. **Interruption:** disconnect ≠ Stop ≠ generation cancellation. Reconnect must not replay commands; interrupted normal-agent reasoning cannot automatically resume. Cancellation may not stop remote charges.
6. **Enforcement:** verified ownership, closed inputs, allow-listed routes, bounded work/spending and post-deletion write barriers.

## Tech Stack

- **Web:** TypeScript, React 19, Vite, React Aria; Cloudflare static assets.
- **Backend:** Node.js, Mastra, Docker/Railway, qualified Muse integration, FFmpeg; Sentry monitoring.
- **Data:** Supabase Postgres/Auth, plain SQL/`pg`, generated types/declarative schemas; R2/S3 API.
- **Playback:** Mediabunny/WebCodecs—not an editing engine.

## MVP Scope

**In:** authenticated chat, Script/Assets/Storyboard/Videos, generation, versions/approvals, uploads, Library and playback. **Out:** sub-agents, long unattended agent runs, multiple backend instances, native apps and payments.

**Open:** media providers, audio inputs, edit/render/export contracts, Project/Scene routing and multi-scene composition. Today's Pi workspace stops at review, assembly and Selects handoff.

## Implementation Path

**Next:** B-020 defines contracts and skill adaptation; qualify native recovery/cancellation and provider safety. **Later, only if needed:** durable reasoning, shared multi-instance coordination and isolated heavy rendering.

## System Components

One pnpm repository. Backend paths below are relative to `apps/api/src/`.

- **`web` — `apps/web/`:** screens; uses `api-client` and `player`.
- **`api-client`, `player` — `packages/`:** framework-free transport and playback.
- **`api` — `mastra/`:** native server, routes and Mastra workflows; combines domain actions.
- **`agent` — `agent/mastra/`:** assistant bindings, tools, Memory and signals; backend composition remains in sibling `mastra/`.
- **`artifacts` — `artifacts/`:** immutable versions, thread links, approvals/questions; uses `db`.
- **`generation` — `generation/`:** Generation Requests, providers, batches/spend limits; uses `db`.
- **`storage`, `db` — matching folders:** R2/media utilities; Postgres/transactions.

**Combining → domain → platform**; no domain-to-domain calls. Each module owns its SQL.

## Sequence Diagram

Commit authorised batches, Generation Requests and stable run identities before separately starting native workflows asynchronously. Return the saved batch ID and end the normal turn. Generated versions remain unapproved in the thread (Draft). A later turn reports the batch; acknowledge reporting only against the correlated saved assistant report—not a signal, stream finish or context read.

```text
Browser           Backend                                  Provider
   |-- message ----->|                                         |
   |                 | commit batch, requests and run IDs      |
   |                 | start native Workflow Runs              |
   |<-- batch ID ----| agent turn ends                         |
   |                 |-- Mastra Workflow Run: submit/poll ---->|
   |                 |<-- result ------------------------------|
   |                 | save Artifact Version, link unapproved  |
   |                 | new turn, save report                   |
   |                 | acknowledge saved report                |
   |<-- update ------|                                         |
```
