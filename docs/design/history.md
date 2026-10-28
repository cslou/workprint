# Workprint — Application Design History

## Storyboard, Videos and request controls — 2026-10-28

The user approved the Story 1 layouts: an exact Panel-version shared viewer with `Shot 1 · Panel 1.1 · Version 1`-style captions and **Use this version**; Shot intent and Panel description editing inside the storyboard dialog with the Script typing box and **Cancel, then Save**; and a Videos **Generation requests** list with exact-target cards, status pills, **Request details** and **Cancel request** only on unfinished requests.

Copy was approved with two removals: no per-card **Last known request state** line, and no extra cancelled-card line beyond the `Cancelled` pill. The single list footer is `Request status does not confirm that remote work or charges have stopped.` The list/detail/cancel empty, loading, 401, 501 and error copy is recorded exactly in [the shell/Phase 2 section](design.md#shell-and-remaining-phase-2-feedback), together with the unchanged approved Save, Use-version, workspace-read and empty-state reuse. Video and Panel choice are exact `useVersion` actions; request cancellation is `cancelGeneration`, separate from assistant Stop. Failed actions do not change authority or discard planning input.

That section records tracked demo 12–13, 15–18 and Flow 2 references plus the precise substitutions, including the shared image-viewer reference. The ignored `outputs/verification/sprint-003/design-proposals/story1/` previews are historical evidence only. Their `Example media omitted` / `Layout reference only` box is not product copy. No Play all/comparison, sequential playback, Editor, inferred opaque-content schema, actual generation/cancellation or stopped-charge promise is approved. This is design approval, not implementation acceptance.

## Script inline edit — 2026-10-28

The user approved the Story 5 inline Script edit preview with one correction: the action order is **Cancel, then Save**. Clicking a section's pencil turns that section's text into a typing box in the same panel, with the same fonts and colours. Cancel restores the displayed version unchanged. Save retains typed text and uses the already-approved unavailable, 401 and error feedback as one plain line beneath the controls. Nothing else is newly approved, and the draft label is not product copy.

The exact layout and tracked-reference substitution are recorded in [the existing shell/Phase 2 section](design.md#shell-and-remaining-phase-2-feedback). The local `outputs/verification/sprint-002/design-proposals/story5/` previews are historical display evidence only; implementation and comparisons use the tracked Script reference plus the approved substitution, not those ignored files.

## Chat unavailable feedback — 2026-10-28

The user approved 002/Story 4 Send feedback as one plain action-feedback line beneath the chat box: “Sending messages is not available yet. Your message is kept.” This applies to every Send, including opening and queued typing, and retains the typed text. Stop feedback is “Stopping is not available yet.” in the same style; Stop is visible only while the assistant works, reachable in Phase 2 only from an isolated labelled read-only working prerequisite. No successful native turn/stop, banner, colors or recovery flow is implied. Exact bounds are recorded in [the existing shell/Phase 2 section](design.md#shell-and-remaining-phase-2-feedback).

## Workspace-read feedback addition — 2026-10-28

The user approved 002/Story 3 workspace HTTP-read failures as text substitutions in the current tab's existing dashed empty box: 401 — “Sign-in required to load this video.”; 501 — “Loading this video is not available yet.”; all other failures, including transport and timeout — “This video could not be loaded. Nothing was changed.” Loading keeps the approved skeleton and its static reduced-motion alternative; absent session or conversation keeps the existing empty text. No banner, colors or recovery controls. Native-load copy remains only in its dialog. Exact instructions and tracked reference substitutions are in [the existing shell section](design.md#shell-and-remaining-phase-2-feedback).

The user also clarified that 002/Story 4 question cards use the options and labels in their question record; later-phase question producers own the option set/wording, not this design. All other recorded proposal-card lines remain unchanged; no Story 4 implementation is authorized here.

## Shell and remaining Phase 2 states — 2026-10-28

The user approved the layouts displayed in the local `outputs/verification/sprint-002/design-proposals/` set (source `2e03eba`), with explicit copy corrections. The exact texts and owning stories are recorded in [the guide](design.md#shell-and-remaining-phase-2-feedback). Only 002/Story 3 is authorized for implementation now; question/proposal disclosure, the nine answer/save/use feedback states and 003/Story 4 Export remain later-story approvals, not implemented capabilities.

Removed from the approved design: preview markers, test-fixture wording, the local-clear button and its result, the separate switch-unavailable state, visible proposal/question IDs/revisions, and Export selection-revision/test-prerequisite lines. Sign out and Switch account share the unchanged-session unavailable response. Internal scope invalidation remains required. Existing tokens, desktop navigation, empty/loading states and Library feedback stay approved. Reproducible comparisons use tracked flow/demo references plus approved substitutions; ignored screenshots are historical display evidence, never runtime prerequisites. No actual Auth, model integration, spending gate, credits, model selector, working Export, new banner or recovery design is approved by this record.

## Library feedback — 2026-10-28

The user approved the scoped Library feedback proposal in the Story 2 implementation continuation: reuse `demo-05.html#lib-yours`'s existing two-line empty styling for unauthenticated (401), unavailable (501), loading, transport/error and missing-configuration states. The exact copy and bounds are recorded in [the guide](design.md#library-feedback). Local proposal captures remain under ignored `outputs/verification/sprint-002/story-2-feedback-proposal/`; they are not required runtime assets.

This approval adds no banner, colors, recovery controls or functional sign-in. It does not approve unrelated session, proposal/estimate or export designs, nor does it establish implementation acceptance. Existing approved empty Library copy remains unchanged.

## Unmigrated prototype evidence

This is historical context from the Generate prototype, not current application scope. Source Git revisions, ignored previews and old verification outputs below were not imported. Original example imagery is not published; image links now show neutral placeholders. Historical output/checkout descriptions refer to that source workspace, not this public repository. Current scope follows the [architecture notice](../architecture.md).

## Source history

**Removed files.** Superseded page revisions and early studies were removed on 2026-10-04. They remain in git history: `git show 065a991:docs/design/<file>`.

**Superseded.** The current agent guide is [design.md](design.md) and the visual reference is the [brand book](brand-book.html). This file keeps the earlier r02–r04 studies and material Editor alternatives for history.

**Stage: discovery / user-flow brainstorming. Status: draft.** No application implementation or final design handoff is authorized by these notes.

The current working document is [App User Flows](user-flows.md). It owns the evolving journey, agreed decisions, proposals, open questions and discussion log. Keep its decisions authoritative rather than duplicating a competing flow here.

## Editor explorations

The current reference is [Editor](brand-book/screens.html#editor), with [agent instructions](design.md#editor). The following local explorations are retained for comparison, not current implementation guidance:

- [Fifth-tab alternative](history.md#unmigrated-prototype-evidence): not selected; Videos remains the entry.
- [Full-width button-only entry](history.md#unmigrated-prototype-evidence): superseded by the snapshot card with Shots/duration and Open editor / Export.
- [Earlier editor](history.md#unmigrated-prototype-evidence), [proposed edit](history.md#unmigrated-prototype-evidence), and [kept edit/export](history.md#unmigrated-prototype-evidence): older three-track layout and illustrative review ceremony. Do not infer approval of detailed editing, save/undo or export behaviour from them.
- [Earlier cognitive walkthrough](history.md#unmigrated-prototype-evidence): not user testing and not reassessed against the current entry/layout; its permanent-inspector descriptions are not current guidance.

These are git-ignored local files with unlicensed example imagery. They may be absent in another checkout. No files or media were deleted or redistributed by integration. The previous demo ending is retained in Git history before this change; its claim that choosing all videos finished the scene is superseded by the current review/edit continuation. Multi-scene work is not designed by these alternatives.

## Scope

This is **full app discovery**, with the accepted asset-sheet presentation reused as an existing input. The catalogue layouts are not automatically the visual identity, navigation or component system of the whole app.

The creator requested a living flow document and collaborative brainstorming. Use Mercer & Vale to make the journey concrete. The creator redirected the initial endpoint question toward working backward from deliverables, minimizing steps and considering one workboard. The creator has now selected A: one workboard with Scene-grouped Shot rows, requested removal of the alternatives, and asked to explore entering a Scene. After questioning where single-Shot work happens, the creator supplied a second-agent discussion and requested a mockup of a stable Studio whose canvas presents different deliverables. The creator liked and saved r03's presentation, then explicitly chose a single-Shot-first design exercise. Single-Shot r04 is the current mockup; its scope is approved for exploration, not its unseen layout or the complete product. Platform and first-release boundary remain open. No production generation, provider disclosure, backend, renderer integration or backlog mutation is included in this documentation task.

## Stages and dependencies

| Stage | Current status |
| --- | --- |
| Discovery | Single-Shot-first exercise selected; r04 explores its creation/refinement loop without Scenes, batches or assembly. Layout awaits feedback; Q-01 remains unresolved |
| App identity and voice | Not decided; strategy documentation supplies hypotheses, not new approval |
| App visual direction | Not started; retain accepted catalogue sheet references without assuming an app-wide style |
| Brand guidelines | Not started; depend on app direction |
| Detailed wireframes and flows | Pending agreed scope; the current flow skeleton is a proposal, not a screen/state inventory |
| Design system | Not started; derive components from the agreed journey |
| High-fidelity screens | Not started; require approved preceding decisions and independently linked relevant states |
| Assets and final handoff | Not started; private/third-party prototype media have no established redistribution rights |

The visual entry (removed: `study-r04.html`) now opens **single-Shot study r04**: Assets / Create / Takes, all scoped to the same Shot. This is a linked discovery mockup, not a high-fidelity design handoff or application implementation. Interaction notes (removed: `navigation-options.md`) describe the current loop; the [frozen r03 version](history.md#unmigrated-prototype-evidence) remains available and unchanged. The living user-flow document owns actual decisions.

## Existing inputs and boundaries

- [Current workflow map](history.md#unmigrated-prototype-evidence): navigation to skill-owned supported behavior; do not replace current runtime gates through app design prose.
- [Canonical terminology](../../CONTEXT.md): keep Scene, Shot, Panel, candidate, selection and exact-version approval distinct.
- [Strategy hypothesis](../litepaper.md): solo narrative creators and decision support remain product hypotheses to refine.
- Local catalogue study `outputs/asset-catalogue-prototype/r05/`: accepted presentation direction and selective-coverage authoring rules. The ignored local media are not bundled or required by these documents.
- Local Gallery/Mercer & Vale work: possible walkthrough material, not proof of the new flow or authorization for a new live run.

The current checkout contains earlier branch work and a user-owned untracked character-reference directory. Preserve them. These design artifacts remain local drafts while the discussion develops; no branch switch, commit, push, PR, merge or public publication is part of creating them.

## Single-Shot r04

**Approved exercise scope:** the creator selected “Yes—single-Shot experience first,” explicitly understood as the next design exercise rather than a permanent first-release boundary. **Layout status: proposed, awaiting inspection.** Retain r03's liked presentation; defer Scenes, batch actions and assembled-film review. No app implementation or generation is authorized.

The stable object is now one Shot, not a project. The provisional top tabs are **Assets** (references used by this Shot), **Create** (brief and optional visual setup), and **Takes** (watch, compare, refine and choose). Video preview is part of Take review, not a separate project-level destination. A local performance instruction must remain distinct from changing a reusable identity reference.

### r04 view inventory

| Identifier | Visual | Purpose |
| --- | --- | --- |
| Start | Brief (removed: `study-r04.html`) | Describe one moment and inspect supplied example references; no Scene setup |
| Create | Visual setup (removed: `study-r04.html`) | Prepare the Shot's intent and optional visual plan, then inspect example results |
| Assets | Shot references (removed: `study-r04.html`) | Only relevant linked references, not the whole library |
| Asset | Vale reference (removed: `study-r04.html`) | Inspect identity and wardrobe with explicit return choices |
| Takes | Results and refinement (removed: `study-r04.html`) | Candidate playback illustration, chosen-versus-viewed distinction, feedback and iteration |
| Compare | Comparison (removed: `study-r04.html`) | Compare alternatives inside the same Shot; no new Shot records |
| Reference | Reference beside Take (removed: `study-r04.html`) | Keep the active candidate visible during an identity check |

This is a bounded example inventory, not full MVP screen/state coverage. The linked walkthrough is brief → Shot assets → visual setup → Takes → compare → reference → full reference → Takes. Users can revise directly in Takes rather than traversing Create for every iteration. Source intake variations, missing-reference creation, real form editing, authorization interactions, loading/failure recovery and provider execution remain undesigned or illustrative—not silently approved exemptions.

### r04 presentation and material

Reuse r03's unapproved palette/font/body/leading/radius/gap values listed below. r04 omits the Shot navigator and uses `--studio-context: 300px`, reducing to `260px` up to 1000px; at widths up to 700px the context stacks below the canvas. Main media is capped at `370px` height. This is exploratory desktop styling with document reflow, not an approved responsive product system.

Four byte-identical JPEG copies from the existing r03 media—Vale, Vale wardrobe, Gallery and Shot 03—live under ignored `outputs/studio-mockup/r04/assets/`. Their underlying source/provenance remains recorded in r03's media manifest. No media generation or new approval occurred; public redistribution rights remain unestablished. The r03-saved directory is frozen and must not be modified.

The brief, selection/status labels and Take states are illustrative. The optional visual plan is an existing storyboard still, not a newly generated result or a mandatory standalone storyboard document. Both candidate illustrations reuse the same still. Generation, choosing, downloading and asset-editing buttons are disabled; native links reveal prepared example views. No scripts, form submission, playback, storage, provider calls or automatic creative decisions are present. Existing runtime review/disclosure gates still apply; their presentation for a single-Shot product needs later design.

### r04 verification

**PASS — bounded mockup inspection; creator feedback pending.** Editorial review reconciled the Shot-local scope, provisional tabs, deferred whole-story flow and unchanged runtime gates across the linked notes. Source inspection verified restrictive CSP, inert controls, valid local links/anchors, four reviewed local raster files and no active/remote content. Each image matches its existing r03 copy byte-for-byte; all 19 files recorded in the frozen r03 snapshot's checksum manifest remain unchanged.

Chrome `153.0.8010.54` through the existing local Playwright tool rendered all seven views at `1440 × 1050` and `390 × 844`, in fresh unauthenticated contexts with application JavaScript disabled and remote requests blocked. Observed: one canvas/context pair, no document-width overflow, broken images or remote page requests; stable wide header; successful brief → assets → setup → Takes → compare → reference → full sheet → Takes navigation, keyboard tab activation and browser Back. All owned browser contexts/processes closed.

Main-agent visual inspection covered all fourteen images. Wide views keep the active Shot identity and tab scope stable; the candidate viewer, chosen-versus-viewed labels and refinement controls remain together. A pair of touching context buttons in the narrow Create view was separated; source checks and all renders were repeated, and the corrected Create views were reinspected. Narrow views are readable stacked documents, not an approved mobile workflow; reference and candidate cannot remain simultaneously visible there. Visual judgment is subjective/model-assisted, not usability or full accessibility proof. The reused palette has r03's bounded contrast evidence below; product accessibility targets, text scaling and complete state coverage remain open.

Evidence lives in ignored `outputs/studio-mockup/r04/evidence/`: `source-review.json`, `browser-review.json`, `render.log` and `{start,create,assets,asset,takes,compare,reference}-{wide,narrow}.png`. Temporary commands from the repository root:

```bash
python3 /tmp/studio-r04-inspect.py > outputs/studio-mockup/r04/evidence/source-review.json
# PLAYWRIGHT_MODULE points to the already available local Playwright index.mjs.
node /tmp/studio-r04-render.mjs > outputs/studio-mockup/r04/evidence/render.log 2>&1
```

Application functional/regression verification is **N/A**: no executable product behavior changed. Browser checks cover only this mockup, not generation, selection, playback, storage or a full creation flow. No persistent prose-presence suite was added. No commit, push or publication is authorized.

## Studio r03 — saved reference

**Status: presentation liked and version saved; information architecture unresolved.** The creator said “This actually looks good” and requested that this version be saved, while explicitly questioning storyboard and project-versus-Shot navigation. Do not treat positive visual feedback as approval of the full workflow. The design workflow retains main-agent authorship; no app implementer or application code is involved.

**Frozen local version:** [Studio r03 snapshot](history.md#unmigrated-prototype-evidence). It contains independent HTML/media copies, original source/design records and `SHA256SUMS.json`. Only resource/documentation paths were rebased; original source and copied images were checked byte-for-byte, and snapshot links resolve within its folder. This is an ignored local backup, not a Git commit, off-machine backup or publication. Keep it unchanged. Saving did not alter the then-current working mockup; the later r04 exercise changes only the working design.

The conceptual change is **Studio = persistent workspace; workboard = one canvas presentation**. The header, deliverable switcher and context-panel location remain stable. Full-size creative work receives the canvas instead of being squeezed into a table row. Scenes organize Shots and action scope is explicit; a batch is not a new narrative entity.

### Current view inventory

This is the independently chosen scope of this demonstration, not an approved MVP inventory. Each link opens the named view in the same HTML document using native hash navigation and CSS, without scripts.

| View / identifier | Visual | What to inspect |
| --- | --- | --- |
| Board | [Whole storyboard](history.md#unmigrated-prototype-evidence) | All five existing Gallery Panels in readable ordered rows; Shot 03 opens directly |
| Shot | [Active Shot](history.md#unmigrated-prototype-evidence) | Large candidate viewer, current-versus-selected Take distinction and scoped direction/reference panel |
| Plan | [Shot storyboard](history.md#unmigrated-prototype-evidence) | Same Shot, existing Panel and story intent; return to its candidate |
| Compare | [Two Takes](history.md#unmigrated-prototype-evidence) | Main canvas accommodates comparison; no nested page or narrow editing drawer |
| Reference | [Contextual inspection](history.md#unmigrated-prototype-evidence) | Shot stays visible while Vale's reference occupies the side panel |
| Assets | [Catalogue](history.md#unmigrated-prototype-evidence) | The same canvas becomes a library; a full asset workflow is not confined to a drawer |
| Asset | [Vale sheet](history.md#unmigrated-prototype-evidence) | Available identity, wardrobe and in-context studies; explicit return to Shot 03 / Take 02 |
| Preview | [Sequence](history.md#unmigrated-prototype-evidence) | Selected sequence versus newly viewed candidate; missing positions and direct return to the Shot |

**Bounded walkthrough:** board → Shot 03 → compare → inspect Vale → full sheet → return to Shot 03 → sequence preview → edit Shot 03. The top-level Assets / Shots / Preview links also work. Only Shot 03 and Vale are detailed examples; other Shots/assets provide real visual context and are not fake links to the wrong item.

The layout is desktop-oriented for this study, with narrow document reflow for inspection. Product platform and responsive interaction requirements are still open. The simple wordmark, colors and spacing are provisional presentation choices, not approved identity or a substitute for the pending visual-direction stage.

### Draft presentation values

These exact r03 values are authored in the HTML's root style block. They are unapproved layout-study values only; do not promote them into application tokens.

| Key | Value | Role |
| --- | --- | --- |
| `--studio-bg` | `#f4f3ef` | Canvas surround |
| `--studio-paper` | `#ffffff` | Main surfaces |
| `--studio-ink` | `#252c29` | Primary text |
| `--studio-muted` | `#616962` | Secondary text |
| `--studio-line` | `#d9ddd6` | Decorative separators |
| `--studio-accent` | `#315d4c` | Active navigation and actions |
| `--studio-soft` | `#e9efe9` | Subdued context/selection background |
| `--studio-warn` | `#78542b` | Attention text, always accompanied by a label |
| `--studio-font` | `system-ui,sans-serif` | Local/system fonts only |
| `--studio-body` | `14px` | Study's default text size |
| `--studio-leading` | `1.5` | Unitless default leading |
| `--studio-radius` | `8px` | Major media/surface corners |
| `--studio-gap` | `16px` | Draft spacing reference |
| `--studio-nav` | `196px` | Wide navigation column; `160px` at widths up to 1190px |
| `--studio-context` | `282px` | Wide context column; `246px` at widths up to 1190px |

For this study, main viewer images are capped at `400px` height and Take thumbnails at `80px` so the active Shot's choices remain visible at the inspected desktop viewport. At smaller document widths, columns stack; this is not a settled mobile interaction design.

### Content and safety boundaries

- Existing local Gallery storyboard r004 Panels and reference-package images supply the visuals. Re-encoded, metadata-stripped JPEGs live under ignored `outputs/studio-mockup/r03/assets/`; `media-provenance.json` records their original paths and local-study use. No new image/video generation, external disclosure, upload or creative approval occurred.
- These local assets are not bundled into shared source or licensed for public redistribution by this task. The mockup needs this checkout's ignored media; it is not a portable/publishable handoff. Accepted catalogue presentation and runtime source files remain unchanged.
- Take counts, selections, failures and workflow statuses are explicitly fictional. Take comparison repeats the same storyboard still; it does not claim two distinct performances. Playback is an inert illustration. Shot 03's viewed candidate is Take 02, while the example sequence still uses selected Take 01.
- User-facing controls for generation, approval and selection are disabled. Native links change views only. There is no form submission, JavaScript, storage, provider call or media playback.
- Asset edits versus Shot direction, focus versus batch selection, and incomplete preview versus finished film remain explicit. Placeholder timing and assembly/export behavior require separate scope/implementation decisions.
- Actual state persistence, scroll/playback restoration, generation/recovery, complete asset-sheet authoring, source intake, all error/empty states and a full MVP inventory remain outside this bounded mockup. The two agreed pre-production reviews remain intact.

### Decision leading to r04 — one Shot first

The creator initially asked whether to defer Scenes and batches, then explicitly selected the single-Shot-first exercise. Establish its creation/review loop before designing the surrounding multi-Shot workflow. This is not a new approved MVP boundary. r03's presentation is retained in the frozen reference while r04 explores the smaller scope.

A role-play highlights the scope mismatch: opening Shot 03 suggests Shot-local work, but top-level Assets opens the project catalogue and Preview opens the project sequence. Consistent screen furniture does not itself make those scope changes intuitive. This is an analytical walkthrough, not an observed usability test.

For the next proposed exploration, keep the active Shot as the stable scope: references used by it, its visual intent/creation work, and its candidate Takes/review. A whole-story storyboard is a useful later view across Shots, not necessarily a separate deliverable the creator must understand to make one Shot. Candidate selection, reusable-reference impact and exact-version review still matter. Scene grouping and explicit batch actions can be added around a proven Shot workflow later; no runtime gates or original creative decisions change through this discussion.

### Studio r03 verification

**PASS — scoped design inspection; user acceptance pending.** Editorial review reconciled the current Studio proposal, earlier A selection, changed canvas model, fictional Take states and unchanged runtime boundaries. Source inspection found restrictive CSP, no scripts/forms/remote resource loads, disabled generation/selection controls and valid active local links. All eleven raster sources were decoded, re-encoded without metadata and visually inspected in a contact sheet. Initial contact-sheet creation encountered a local font lookup error; using the existing system font resolved it without installation or media regeneration.

Chrome `153.0.8010.54` through the existing local Playwright tool rendered all eight views at `1440 × 1050` and `390 × 844` in fresh unauthenticated contexts with application JavaScript disabled and network requests blocked. Observed: exactly one canvas view and context panel at a time, no document-width overflow or broken images, no remote page requests, stable wide header, successful linked walkthrough, keyboard deliverable switching and browser Back. All owned browser contexts/processes closed.

Main-agent inspection covered the sixteen rendered views. The first desktop Shot render pushed Take choices below the fold; the image cap/thumbnail adjustment was applied, then source checks and all renders were repeated. Final desktop views show the active candidate, selected Take label, comparison access and Take choices together. Storyboard feedback now targets its Panel rather than the candidate video. Narrow views are readable stacked documents but lose simultaneous side-by-side context; they are not an approved mobile experience. Visual observations are subjective/model-assisted, not usability proof.

Five authored text/background pairs measured `14.28:1`, `5.10:1`, `7.50:1`, `6.42:1` and `5.73:1`; these bounded measurements do not certify full accessibility or target sizes. Styling and exact product accessibility requirements remain unapproved.

Evidence: ignored `outputs/studio-mockup/r03/evidence/` contains `source-review.json`, `browser-review.json`, `render.log`, the contact sheet and `{board,shot,plan,compare,reference,assets,asset,preview}-{wide,narrow}.png`. Temporary inspection commands, run from the repository root, were:

```bash
python3 /tmp/studio-r03-inspect.py > outputs/studio-mockup/r03/evidence/source-review.json
# PLAYWRIGHT_MODULE points to the already available local Playwright index.mjs.
node /tmp/studio-r03-render.mjs > outputs/studio-mockup/r03/evidence/render.log 2>&1
```

No persistent prose-presence suite was added. Application functional/regression verification is **N/A**: no executable product behavior changed. Browser observations verify only this mockup's native navigation and rendering, not generation, persistence, selection, playback or restoration. No commit, push or publication is authorized.

## Earlier workboard and Scene focus r02 — historical

**Actual response:** “A looks good,” followed by a request to keep A only and show what entering each Scene could look like. Record A as selected, not the unseen Scene layouts or the full design stage. Removed alternatives are no longer active design guidance.

| View | Status | Proposed purpose |
| --- | --- | --- |
| Main workboard (r02) | Historical; A direction selected, details not accepted | All five Shot rows grouped under two Scene headings, with optional entry into either Scene |
| Scene 01 (r02) | Historical proposal, not the current working-screen recommendation | Three Shots with storyboard plans, exact asset links, selected/candidate motion and a partial Scene preview |
| Scene 02 (r02) | Historical proposal, not the current working-screen recommendation | Two Shots, one affected by a later reference change, with targeted recovery and an empty Scene-preview state |

These views share the same five Shot identities and statuses. Entering a Scene focuses existing work rather than creating a second record, adding a review gate or requiring entry before Shot work. Return should preserve board context; whole-project playback remains distinct from Scene playback. Static anchors demonstrate view entry/return, not actual application state or scroll restoration.

Scene titles, summaries, the key prop, versions and production decisions are explicitly invented interface content, not an approved Mercer & Vale adaptation or real creative approvals. No imagery was supplied or redistributed in r02. Its original HTML is retained locally at `outputs/studio-mockup/r03/prior-r02.html`; the supporting interaction note now describes r04. The historical examples were not a complete approved screen/state inventory, product responsive design, storage schema or working generation/selection controls.

The historical r02 book used `--book-*` values for its documentation study only: paper `#ffffff`, ink `#202020`, muted text `#555555`, line `#a0a0a0`, panel `#f3f3f3`. Its system fonts, borders and reflow keep the document readable; none is an approved product-design value. This guide will own approved app values once that stage is reached. Do not implement the app by copying these diagrams' CSS.

### Navigation study verification

**PASS — bounded r02 document/render checks.** Static checks verified only A remains, inert HTML/CSS and CSP, local file/anchor links, agreement of five overview Shot identities/statuses with the three-plus-two focused rows, explicit proposed/example labels, and unchanged existing tracked files.

Existing local Chrome `153.0.8010.54` / Playwright `1.59.1` rendered all three views at `1440 × 1050` and `390 × 844`. Fresh unauthenticated contexts disabled application JavaScript and blocked network requests. No document-width overflow or remote page requests occurred. Both Scene entry/return paths, previous/next links and the native Take disclosure passed; the disclosure also worked with keyboard Enter and visible focus. Owned browser contexts and browser were closed.

Main-agent inspection of all six actual screenshots found no clipped rows or labels, matching overview/focus states, and visible distinctions between candidate and selected motion. Narrow views stack the preview, media, notes and Takes and become long; that is document reflow, not an approved mobile app experience. This subjective visual check is not an accessibility certification or usability result.

Historical r02 evidence: ignored `outputs/verification/navigation-r02/`, containing `static.log`, `render.log`, `browser-checks.json`, and `{workboard,scene-01,scene-02}-{wide,narrow}.png`. Earlier comparison screenshots remain historical only. The following retained commands targeted r02 at that time. They are historical and must not be run against r03 as though its intentionally changed inventory were a regression:

```bash
python3 outputs/verification/navigation-r02/check.py > outputs/verification/navigation-r02/static.log 2>&1
# Export PLAYWRIGHT_MODULE with the existing local Playwright index.mjs path.
node outputs/verification/navigation-r02/render.mjs > outputs/verification/navigation-r02/render.log 2>&1
```

Static diagrams cannot prove the proposed contextual navigation, generation, Take decisions, persistence, long-project performance or end-to-end usability. Interactive walkthroughs and scope decisions remain outstanding; do not report this as a completed design handoff.

## Verification approach

For these discovery documents, check local Markdown targets, clear separation of agreed/proposed/open material, unresolved endpoint status and absence of implementation/quality claims. Preserve existing tracked files and private source material.

For later designs, agree actual platform accessibility requirements, text/contrast behavior and representative viewports during discovery. Use inert local previews, independently link applicable states, and inspect actual renders before claiming a visual handoff. Current catalogue checks do not certify the future app.

**Initial document checks: PASS.** Both files have valid local Markdown targets, explicit agreed/proposed/open distinctions, an unresolved first-release endpoint and eight open discovery decisions. Existing tracked files remain untouched. Evidence: local `/tmp/app-user-flows-static.log`; these are document checks, not proof that the proposed flow works. At that initial stage, no app-flow mockup had been rendered. The later r03/r04 mockups are documented above; no live-generation trial or end-to-end usability verification has run for this new app design.
