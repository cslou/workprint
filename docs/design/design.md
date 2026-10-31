# Workprint — Design Guide

**Migration (2026-10-27):** Workprint replaces the prototype name Generate. Layouts/tokens are retained; original media/screenshots are replaced with labelled placeholders. Historical verification below belongs to the source prototype, not this migrated copy. Editor, Project and comparison-player examples are not MVP scope; current scope follows the [architecture notice](../architecture.md). Typed chat is not approval; exact proposal approval and informational cost presentation follow the approved implementation plan.

**Status:** Editor and component integration for inspection, with an accepted separate Project workspace roadmap reference. The accepted foundations and unaffected flows remain in force. Material-control direction is approved, with focus rings removed as requested. The roadmap flow is future design reference, not an addition to approved flows or the demo. Editing, recovery and export completion remain partial. No existing token value changed. Earlier entries describe reference artifacts; application delivery is tracked separately. The scoped Library feedback approval below is dated 2026-10-28.

**Version:** 1.3 · **Updated:** 16 October 2026 · **History:** [Decisions](#decisions)

**Human reference:** [Brand book](brand-book.html) (home; pages under `brand-book/`) · **Values:** this file ([tokens](#color)) · **Approved screens:** [Generate flows](generate-flows.html) · **Interaction decisions:** [App user flows](user-flows.md) · **History:** [earlier studies and Editor alternatives](history.md)

## Image-only upload restriction

**Provisionally approved by the orchestrator on 2026-10-31 under Lou’s delegation; pending Lou’s ratification at the Phase 3 handoff.** Implements Lou’s explicit temporary video-upload restriction. Main inspected all six wide/narrow captures of `image-only-uploads-r1`: entry, video unavailable and saved image. Existing composer, receipt, tokens and image-recovery states remain. State that uploads accept JPEG/PNG up to 10 MiB and 4096 × 4096 pixels, and that video uploads are temporarily unavailable. Refusal offers “Choose an image” without replaying a prior transfer or claiming that saved work was undone. Saved images remain Draft, not approved references. Send availability is unchanged by this restriction.

This supersedes the video-upload entry/success promises below for the current delivery; existing owned-video presentation is not new upload authorization. Ignored previews at `outputs/verification/sprint-005/design-proposals/image-only-uploads-r1/` are inspection evidence only. Use tracked independent references/substitutions for runtime comparisons, with required main widths and representative states. Captures show legible, unclipped content; this model-assisted inspection is not runtime, accessibility or human acceptance. Product behavior and source/geometry checks remain required.

## Verified upload feedback

**Provisionally approved by the orchestrator on 2026-10-31 under Lou’s delegation; pending Lou’s ratification at the Phase 3 handoff.** Scope: Sprint 005 Story 4. The 16-state inert revision `verified-media-uploads-r1` was inspected through its complete narrow contact sheet and full desktop image-success and narrow confirmation-unknown/poster-success captures. Existing tokens and composer primitives remain unchanged. Approve textual preparing/uploading/verifying feedback, exact-version image/poster success, expiry/interruption/unknown confirmation, stopped observation, definitive format/size/damage rejection, exact-version source loading/failure/expiry and generic scope-cleared feedback. No fabricated percentages, usable pre-verification thumbnail, new modal or toast.

Single file at a time, no queue. Retain the captured file through ordinary failure until replacement/close; clear file, grant and result on account/conversation teardown. Show the generic scope-cleared notice without the former filename or identity. Stop waiting cancels observation, not transfer authorization or committed work. Explicit retry repeats the original confirmation identity; retrying transfer reuses the same captured bytes and unexpired grant. Expiry requires explicit new authorization. No automatic mutation replay. Technical success is Draft, not reference approval or Shot-video choice. Video success shows an owned poster only; playback remains a later slice. Access recovery reacquires the same exact saved version, never repeats upload.

The authored specimen and displayed measurements are placeholders, not decoded production assets. Ignored previews under `outputs/verification/sprint-005/design-proposals/verified-media-uploads-r1/` are inspection evidence only. Implementation must provide tracked independent visual references/substitutions, state links and actual main-surface comparisons at 1440/390/820/821 plus representative states at 1440/390. Functional, accessibility, geometry and media verification remain unrun at this approval; this is not human ratification or product acceptance.

## Bounded saved-work navigation

**Provisionally approved by the orchestrator on 2026-10-30 under Lou’s delegation; pending Lou’s ratification at the Phase 3 handoff.** This narrowly revises [saved-work reads](#phase-3-saved-work-reads): append loaded pages while within the bounded window; after eviction, show `Showing loaded items N–M` and `Back to first page` alongside the existing Load more/Load earlier versions control. Approve Option B, not silent rolling eviction or close/reopen as the recovery path. First-page return preserves exact Library choices and provides access to earlier items without an unbounded cache or automatic fetch. Search covers the currently loaded window, not unseen or evicted items; range feedback makes this limitation visible. Scope/filter changes still invalidate stale reads and choices under existing rules.

The controls remain after the final row inside the scroll region, not above the selection tray. Keyboard focus and announcements settle across page append, eviction, terminal pages and return. Ordinary small collections retain their approved appearance; window feedback is needed when the displayed range is displaced. Inert Option B Library/history captures at 1440×900 and 390×844 were inspected in ignored `outputs/verification/sprint-005/design-proposals/pagination-window-r1/`; those previews are inspection evidence only. Tests derive comparisons from tracked references plus these substitutions and prove access beyond 1,000 items, bounded retained content, preserved exact choices and stale-response isolation. No new approval/selection authority, server search or wire contract is granted.

## Manual save recovery

**Provisionally approved by the orchestrator on 2026-10-30 under Lou’s delegation; pending Lou’s ratification at the Phase 3 handoff.** Scope: Sprint 005 Story 2, existing Script/reference/planning text targets only. Thirteen inert states in ignored `outputs/verification/sprint-005/design-proposals/manual-version-saves-r1/` were inspected through the narrow contact sheet and representative full conflict-review, uncertain-save and reference captures. Reuse tracked r74/r82 editor primitives: six rows, 14px/21px, 8px/12px padding, 10px radius, Cancel then Save, plain subtle feedback; no new palette, modal, success toast or authoring screen.

Failed/stale saves retain typed text and original base. Pending and unknown-outcome text remains selectable/read-only; explicit Retry save repeats the original immutable command and payload, never a new identity or automatic mutation. Cancel closes the edit and does not undo a committed save. Conflict review reads the latest exact version without saving or approving it. Continue with my text changes only the local base after explicit review and only when the same text target is demonstrably preserved; a later explicit Save is a fresh command and rechecks latest. Structural mismatch blocks continuation rather than guessing an index, flattening a Script or replacing dependencies silently. Latest-read failure retains input with explicit retry.

Reference description placement and existing stable Shot/Panel text editing use the same recovery treatment. Preserve all unedited structured fields, stable identities, order and exact dependencies. No reference attachment, new entry navigation, builder/reorder, selection authority or later-story storyboard-edit bypass is authorized. Human Save on currently used work atomically approves only its exact intended use and records the manual change; assistant drafts cannot claim that authority. Success reuses the actual saved-version display/history, without a turn or fabricated chat response. No promise of draft persistence after cancel, reload or scope switch.

Preview inspection is not runtime proof or human ratification. Use tracked approved references plus these substitutions for independent comparisons, never ignored previews. Verify real concurrent conflicts, rollback, lost-response idempotency, safe reviewed-base continuation, scope/focus races and zero-drift representative states before delivery.

## Overview

**Section 01** · **Status:** Approved

**Workprint** is the chat-first app for making one video or one scene. The person describes what they want; the agent drafts the script, assets, storyboard and videos in a fixed right-hand panel and asks one question at a time.

| Field | Value |
| --- | --- |
| Platform | Desktop web first; single column at or below `--breakpoint-sm` (820px) |
| Scope | Workprint reference bundle: Flow 1, Flow 2, the demo, library picker, the single-scene Editor entry/layout, and reusable material controls. These flows and references are unchanged by the roadmap addition |
| Separate roadmap reference | [Project workspace](#roadmap-project-workspace): Project/Scene conversations, material browsing and a Scene Editor link. Exploratory future direction, not approved product scope, implementation instructions for existing flows, or a delivery commitment |
| Non-goals this revision | Multi-scene editing and Studio; application implementation; logo; broader voice/identity; dark theme. Undesigned editing, recovery and export states remain open, not exempt |
| Value authority | **This file.** Your 2026-10-02 decision, reconfirmed when adopting this structure: tokens live only in design.md, with no token file. An alias such as `{color.alpha.black-10}` names another token in this file (`--color-alpha-black-10`). `brand-book/book.css` repeats the values only to draw the book |
| Mockup stylesheet | [`app-r11.css`](app-r11.css) draws the approved screens. It is frozen; where it differs, build the token (see [Mockup differences](#mockup-differences)) |
| Implementation | None yet. When frontend work starts, convert these token tables into the app's own token format (CSS variables, a Tailwind theme or similar); that file then becomes the source and this guide its specification |

| Section | Status | Notes |
| --- | --- | --- |
| Brand foundation | Deferred | Positioning/identity incomplete; Workprint name selected 2026-10-27, logo deferred |
| Voice and tone | Partial | Wording rules from user-flows.md only; no voice guide |
| Logo | Deferred | "Lets ignore the logo and name part first", 2026-10-02 |
| Color | Approved | Light theme only |
| Typography | Approved | System fonts; no files or licences |
| Spacing and layout | Approved | |
| Shape and elevation | Approved | No z-index layers defined |
| Iconography and imagery | Approved | No icon library chosen; example media not licensed |
| Motion | Approved | |
| Components | Partial | Existing 23 and Editor additions retained; single select, Scene disclosure and a quiet-button extension recorded |
| Patterns | Partial | Existing patterns retained; same-conversation Editor navigation added; edit-command and persistence rules unresolved |
| Accessibility | Existing rules retained; Editor partial | Legacy chat-box outline 1.26:1; the new reference uses a stronger existing colour |
| Screens and flows | Partial | Existing flows retained, demo ending connected to Editor; new state coverage and remaining gaps listed below |
| Assets | Partial | Workprint name selected; mark/media remain placeholders |

Rules for agents: implement values only through tokens and never hard-code a hex, px or ms value a token provides. When this guide and a mockup disagree, this guide wins.

## Brand foundation

**Section 02** · **Status:** Deferred — positioning, values and personality were not designed. Workprint is the selected name (2026-10-27); logo remains deferred.

What exists today, from the approved flows: the agent drafts and the person decides. It asks one question at a time, only offers options for things already on screen, and approves exactly the draft shown before paid work.

## Voice and tone

**Section 03** · **Status:** Partial — wording rules approved in user-flows.md; no voice guide

| Rule | Use | Avoid |
| --- | --- | --- |
| Product nouns | "video" for media, "version" for an alternative; "Shots" for the scene's shot list and "3 shots · 13.4 s" for its summary | "source videos" as the list label; "take" in ordinary UI copy. A Shot is not interchangeable with a media clip (see [CONTEXT.md](../../CONTEXT.md)) |
| Naming shots | What happens: "Vale recognises Mercer" | Camera jargon |
| Activity lines | Past tense, one result: "Saved 3 sheets to your Library" | Several results in one line |
| Options | Short suggested prompts, no descriptions | Explanatory option text |
| Empty states | One line saying what will appear and when | Instructions or marketing copy |

| Context | Example |
| --- | --- |
| Empty (Script) | "Your script will appear here once you describe your video." |
| Working | "Type to add something; I'll pick it up when I'm done…" |
| Question hint | "Click an image to see it larger" |
| Library empty | "Nothing saved yet" + one line of explanation |

## Logo

**Section 04** · **Status:** Logo deferred. Workprint is the selected name; the existing "a" mark remains an illustrative placeholder, not an approved Workprint logo.

## Color

**Section 05** · **Status:** Approved — light theme only. Colours with an alpha channel are drawn over `--color-bg-canvas` or `--color-bg-surface`.

Product code uses semantic tokens. Primitives exist only so semantic tokens can reference them.

### Primitive palette

| Token | Value | Resolved | Was | Use |
| --- | --- | --- | --- | --- |
| `--color-cream-50` | `#fffefa` |  |  |  |
| `--color-cream-100` | `#fcfcf9` |  |  |  |
| `--color-cream-200` | `#faf8f3` |  |  |  |
| `--color-cream-300` | `#f7f5ed` |  |  |  |
| `--color-ink-400` | `#a49e8e` |  |  |  |
| `--color-ink-600` | `#656155` |  |  |  |
| `--color-ink-700` | `#4e4a3f` |  |  |  |
| `--color-ink-900` | `#1b1913` |  |  |  |
| `--color-blue-550` | `#125da3` |  |  | One step from blue.600 in the source theme; kept separate by decision. |
| `--color-blue-600` | `#125ca1` |  |  |  |
| `--color-blue-700` | `#0e477c` |  |  |  |
| `--color-tan-300` | `#bea989` |  | `--tan-mid` | Reserved; not used on any approved screen. |
| `--color-tan-700` | `#63534b` |  |  |  |
| `--color-white` | `#ffffff` |  |  |  |
| `--color-alpha-black-04` | `#0000000a` |  |  |  |
| `--color-alpha-black-08` | `#00000014` |  |  |  |
| `--color-alpha-black-10` | `#0000001a` |  |  |  |
| `--color-alpha-black-14` | `#00000024` |  |  |  |
| `--color-alpha-blue-10` | `#125da31a` |  |  |  |
| `--color-alpha-tan-10` | `#bea9891a` |  |  |  |
| `--color-alpha-tan-30` | `#bea9894d` |  |  |  |
| `--color-alpha-ink-70` | `#1b1913b3` |  |  |  |
| `--color-alpha-cream-40` | `#fffefa66` |  |  |  |
| `--color-alpha-cream-90` | `#fffefae6` |  |  |  |

### Semantic colors

| Token | Alias | Resolved | Was | Use |
| --- | --- | --- | --- | --- |
| `--color-bg-canvas` | `{color.cream.200}` | `#faf8f3` | `--bg` | Page background and inner wells. |
| `--color-bg-sunken` | `{color.cream.300}` | `#f7f5ed` | `--bg-dark` | Sidebar, user messages, image wells. |
| `--color-bg-surface` | `{color.cream.50}` | `#fffefa` | `--raised` | Right panel, chat box, cards, viewers. |
| `--color-bg-paper` | `{color.cream.100}` | `#fcfcf9` | `--paper` | Reference-sheet page. |
| `--color-bg-hover` | `{color.alpha.black-04}` | `#0000000a` | `--muted` | Hover fill; neutral (Empty) status fill. |
| `--color-bg-selected` | `{color.alpha.blue-10}` | `#125da31a` | `--selected` | Selected or draft fill: Draft status, flags, changed chip. |
| `--color-bg-inverse` | `{color.ink.900}` | `#1b1913` | --fg (as fill) | Inverted fill for the active tab and selected pills. |
| `--color-text-primary` | `{color.ink.900}` | `#1b1913` | `--fg` | Main text. 16.56:1 on bg.canvas. |
| `--color-text-secondary` | `{color.ink.700}` | `#4e4a3f` | `--fg-muted` | Secondary text, captions, secondary buttons. 8.33:1. |
| `--color-text-subtle` | `{color.ink.600}` | `#656155` | `--fg-subtle` | Labels, metadata, placeholders. 5.67:1 or better on every bg. |
| `--color-text-disabled` | `{color.ink.400}` | `#a49e8e` | `--fg-disabled` | Disabled text only; never readable content. 2.52:1 (exempt). |
| `--color-text-link` | `{color.blue.550}` | `#125da3` | `--link` | Links and draft text. 6.34:1 on bg.canvas, 5.45:1 on bg.selected. |
| `--color-text-inverse` | `{color.cream.200}` | `#faf8f3` | --bg (as text) | Text on bg.inverse. |
| `--color-border-default` | `{color.alpha.black-08}` | `#00000014` | `--border` | Default dividers and outlines: rows, cards, tiles. |
| `--color-border-strong` | `{color.alpha.black-14}` | `#00000024` | `--border-strong` | Control outlines and hover: chips, round icon buttons. 1.38:1; chips are identified by text. |
| `--color-border-subtle` | `{color.alpha.black-04}` | `#0000000a` | `--border-subtle` | Dividers inside a group. |
| `--color-border-input` | `{color.alpha.black-10}` | `#0000001a` | `--input-border` | Chat box and search outline. 1.26:1, below 3:1: accepted gap (2026-10-02). |
| `--color-border-focus` | `{color.blue.600}` | `#125ca1` | --primary (ring) | Focus ring and selected ring. |
| `--color-action-primary-bg` | `{color.blue.600}` | `#125ca1` | `--primary` | Send, Choose, Regenerate, Attach (n). One per area. |
| `--color-action-primary-bg-hover` | `{color.blue.700}` | `#0e477c` | `--primary-hover` | Primary hover. |
| `--color-action-primary-text` | `{color.white}` | `#ffffff` | `--primary-fg` | Text on action.primary.bg. 6.84:1. |
| `--color-status-empty-bg` | `{color.bg.hover}` | `#0000000a` |  | Empty: nothing made yet. |
| `--color-status-empty-text` | `{color.text.secondary}` | `#4e4a3f` |  |  |
| `--color-status-draft-bg` | `{color.bg.selected}` | `#125da31a` |  | Draft: made, waiting for the person. |
| `--color-status-draft-text` | `{color.text.link}` | `#125da3` |  |  |
| `--color-status-ready-bg` | `{color.alpha.tan-10}` | `#bea9891a` | `--tan-surface` | Ready and Chosen fill; picked chips, avatar. |
| `--color-status-ready-text` | `{color.tan.700}` | `#63534b` | `--tan` | Ready, Chosen, Approved text; done ticks. 6.44:1. |
| `--color-status-ready-border` | `{color.alpha.tan-30}` | `#bea9894d` | `--tan-border` | Picked outline. |
| `--color-media-scrim` | `{color.alpha.ink-70}` | `#1b1913b3` | `--scrim` | Modal backdrop; dark control over media. |
| `--color-media-on-scrim` | `{color.cream.50}` | `#fffefa` | `--on-scrim` | Text and icons on media.scrim. 6.68:1. |
| `--color-media-track` | `{color.alpha.cream-40}` | `#fffefa66` | `--on-scrim-track` | Unfilled progress track on media. |
| `--color-media-label` | `{color.alpha.cream-90}` | `#fffefae6` | `--media-label` | Light label on an image: tile keys, panel numbers. |

### Color usage

- One blue primary per area; tan means done (Ready, Chosen, ticks); status is never colour only.
- Do: `background: var(--color-action-primary-bg)`. Don't: `background: #125ca1` or `var(--color-blue-600)` in a component.

## Typography

**Section 06** · **Status:** Approved — two system families, no font files; bold is always 600.

| Token | Value | Resolved | Was | Use |
| --- | --- | --- | --- | --- |
| `--font-family-sans` | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |  | `--font-sans` | All interface text. |
| `--font-family-display` | `Georgia, "Times New Roman", serif` |  | `--font-display` | Display headings, dialogue, sheet titles. |
| `--font-weight-regular` | `400` |  | `--weight-regular` |  |
| `--font-weight-medium` | `500` |  | `--weight-medium` |  |
| `--font-weight-semibold` | `600` |  | `--weight-semibold` | All bold text. |
| `--font-size-11` | `11px` |  |  |  |
| `--font-size-12` | `12px` |  |  |  |
| `--font-size-13` | `13px` |  |  |  |
| `--font-size-14` | `14px` |  |  |  |
| `--font-size-15` | `15px` |  |  |  |
| `--font-size-17` | `17px` |  |  |  |
| `--font-size-19` | `19px` |  |  |  |
| `--font-size-28` | `28px` |  |  |  |
| `--font-size-34` | `34px` |  |  |  |
| `--font-size-38` | `38px` |  |  |  |
| `--font-size-44` | `44px` |  |  |  |
| `--font-line-height-1-05` | `1.05` |  |  |  |
| `--font-line-height-1-15` | `1.15` |  |  |  |
| `--font-line-height-1-2` | `1.2` |  |  |  |
| `--font-line-height-1-4` | `1.4` |  |  |  |
| `--font-line-height-1-45` | `1.45` |  |  |  |
| `--font-line-height-1-5` | `1.5` |  |  |  |
| `--font-line-height-1-55` | `1.55` |  |  | Approved `app-r11.css` `.snotes` leading; used for reference-sheet note paragraphs (`.wp-sheet-section p` in `apps/web/src/materials/sheet.css`). |
| `--font-tracking-display` | `-0.2px` |  | `--tracking-display` | Opening and index titles. |
| `--font-tracking-kicker` | `1.4px` |  | `--tracking-kicker` | Uppercase sheet kicker only. |

| Role | Family | Size | Line height | Weight | Tracking | Was | Use |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `typography.display-xl` | display | `44px` | `1.05` | `400` | `0px` | `--text-display-xl` | Reference-sheet title. 34px at or below breakpoint.sm. |
| `typography.display-lg` | display | `38px` | `1.15` | `400` | `-0.2px` | `--text-display-lg` | Index page title. |
| `typography.display-md` | display | `34px` | `1.2` | `400` | `-0.2px` | `--text-display-md` | Opening-screen question. 28px at or below breakpoint.sm. |
| `typography.display-sm` | display | `19px` | `1.2` | `400` | `0px` | `--text-display-sm` | Sheet section heading. |
| `typography.quote` | display | `17px` | `1.4` | `400` | `0px` | `--text-quote` | Dialogue line. |
| `typography.title-lg` | sans | `17px` | `1.5` | `600` | `0px` | `--text-title-lg` | Card heading on the index page. |
| `typography.title` | sans | `15px` | `1.5` | `600` | `0px` | `--text-title` | Question, viewer and picker headings; product name. |
| `typography.input` | sans | `15px` | `1.45` | `400` | `0px` | `--text-input` | Chat box text; opening-screen lead. |
| `typography.body` | sans | `14px` | `1.5` | `400` | `0px` | `--text-body` | Messages, panel text, options. |
| `typography.body-sm` | sans | `13px` | `1.45` | `400` | `0px` | `--text-body-sm` | Buttons, tabs, captions, activity lines. |
| `typography.caption` | sans | `12px` | `1.4` | `400` | `0px` | `--text-caption` | Labels, metadata, counts, hints. |
| `typography.micro` | sans | `11px` | `1.4` | `400` | `0px` | `--text-micro` | Status pills, labels on media, sheet kicker; 400–600. Smallest allowed size. |

Responsive sizes: `display-xl` is 34px and `display-md` 28px at or below `--breakpoint-sm`. Nothing below 11px.

## Spacing and layout

**Section 07** · **Status:** Approved

| Token | Value | Resolved | Was | Use |
| --- | --- | --- | --- | --- |
| `--space-2` | `2px` |  | `--space-2` |  |
| `--space-4` | `4px` |  | `--space-4` |  |
| `--space-6` | `6px` |  | `--space-6` |  |
| `--space-8` | `8px` |  | `--space-8` |  |
| `--space-10` | `10px` |  | `--space-10` |  |
| `--space-12` | `12px` |  | `--space-12` |  |
| `--space-14` | `14px` |  | `--space-14` |  |
| `--space-16` | `16px` |  | `--space-16` |  |
| `--space-18` | `18px` |  | `--space-18` |  |
| `--space-20` | `20px` |  | `--space-20` |  |
| `--space-22` | `22px` |  | `--space-22` |  |
| `--space-24` | `24px` |  | `--space-24` |  |
| `--space-32` | `32px` |  | `--space-32` |  |
| `--size-layout-sidebar` | `260px` |  | `--sidebar-w` | 220px at or below breakpoint.md. |
| `--size-layout-panel` | `380px` |  | `--panel-w` | 330px at or below breakpoint.md. |
| `--size-layout-chat` | `680px` |  | `--chat-w` | Message column and chat box: min(680px, 100% − 32px). |
| `--size-layout-viewer` | `560px` |  | `--viewer-w` | Single image viewer. |
| `--size-layout-viewer-wide` | `900px` |  | `--viewer-w-wide` | Viewer with two images. |
| `--size-layout-viewer-sheet` | `1120px` |  | `--viewer-w-sheet` | Reference-sheet viewer. |
| `--size-layout-viewer-board` | `1180px` |  | `--viewer-w-board` | Full storyboard. |
| `--size-layout-picker-w` | `1040px` |  | `--picker-w` | Library picker width. |
| `--size-layout-picker-h` | `760px` |  | `--picker-h` | Library picker height. |
| `--size-layout-player` | `760px` |  | `--player-w` | Scene player, timeline and cut checks. |
| `--size-control-sm` | `28px` |  | `--control-sm` | Chips, close button. |
| `--size-control-md` | `32px` |  | `--control-md` | Send, Stop, viewer arrows. |
| `--size-control-lg` | `34px` |  | `--control-lg` | Choose, search field, choices. |
| `--size-control-icon` | `26px` |  | `--icon-btn` | Edit pencil, zoom, check. |
| `--size-control-attach` | `30px` |  | `--attach-btn` | Round + attach button (22px inside a question). |
| `--size-icon-sm` | `13px` |  | `--icon-sm` |  |
| `--size-icon-md` | `15px` |  | `--icon-md` |  |
| `--size-icon-lg` | `18px` |  | `--icon-lg` |  |
| `--size-media-thumb-row` | `96px` |  | `--thumb-row` | 16:9 thumbnail in a row (72px in version history). |
| `--size-media-thumb-panel` | `120px` |  | `--thumb-panel` | Storyboard panel in the tab. |
| `--size-media-asset-key` | `56px` |  | `--asset-key` | Asset row image. |
| `--size-target-min` | `24px` |  |  | Minimum hit area (WCAG 2.2 AA). The chip × is drawn at 20px with a 24px hit area. |
| `--breakpoint-md` | `1100px` |  | `--bp-md` | Narrower sidebar and panel. |
| `--breakpoint-sm` | `820px` |  | `--bp-sm` | Single column; panel stacks under the chat. |

**App shell:** three columns `--size-layout-sidebar | 1fr | --size-layout-panel` at full viewport height; at or below `--breakpoint-md` the columns are 220 / 1fr / 330; at or below `--breakpoint-sm` a single column with the sidebar as a top bar and the panel stacked under the chat. Columns scroll on their own.

## Shape and elevation

**Section 08** · **Status:** Approved — flat by default; only the chat box, modals and the selected segment lift. No z-index layers are defined yet.

| Token | Value | Resolved | Was | Use |
| --- | --- | --- | --- | --- |
| `--radius-2xs` | `2px` |  | `--radius-2xs` | Stop square, progress bar. |
| `--radius-xs` | `4px` |  | `--radius-xs` | Tiny labels on thumbnails. |
| `--radius-sm` | `6px` |  | `--radius-sm` | Icon buttons, keys, small thumbnails. |
| `--radius-md` | `8px` |  | `--radius-md` | Rows, nav items, frames, flags. |
| `--radius-lg` | `10px` |  | `--radius-lg` | Segmented control, record cards, viewer images. |
| `--radius-xl` | `12px` |  | `--radius-xl` | Tiles, option list, plan box. |
| `--radius-2xl` | `14px` |  | `--radius-2xl` | Chat box, docked question, index cards. |
| `--radius-3xl` | `16px` |  | `--radius-3xl` | Modal panels, undocked question. |
| `--radius-bubble` | `18px` |  | `--radius-bubble` | User message corners except the tail. |
| `--radius-bubble-tail` | `4px` |  | `--radius-bubble` | User message bottom-right corner. |
| `--radius-pill` | `9999px` |  | `--radius-pill` | Buttons, chips, pills, tabs. |
| `--border-width-default` | `1px` |  | `--border-w` | All outlines. |
| `--border-width-focus` | `2px` |  | `--focus-ring` | Focus, selected and fresh rings. |
| `--border-width-focus-offset` | `2px` |  |  | Gap between element and focus ring. |
| `--border-dashed` | `var(--border-width-default) dashed var(--color-border-strong)` |  | `--border-dashed` | Empty states, placeholders, + add chips (1.5px on sheet slots). |
| `--shadow-input` | `0px 1px 2px 0px #0000000a, 0px 6px 20px 0px #0000000a` |  | `--shadow-input` | Chat box, question card. |
| `--shadow-overlay` | `0px 20px 60px 0px #0000004d` |  | `--shadow-overlay` | Modal panels. |
| `--shadow-segment` | `0px 1px 2px 0px #00000014` |  | `--shadow-segment` | Selected segment. |
| `--shadow-fresh` | `0px 0px 0px 2px var(--color-blue-600)` |  | `--fresh-ring` | New content in the panel; fades out over duration.highlight. |
| `--opacity-dimmed` | `0.45` |  |  | Images of a shot changed but not regenerated. |
| `--opacity-making` | `0.35` |  |  | Placeholder while an item is being made. |

Circles (avatar, number badges, tab dot) use `border-radius: 50%`; it is a rule, not a token. The user message uses `--radius-bubble` on three corners and `--radius-bubble-tail` bottom-right. Focus: `--border-width-focus` solid `--color-border-focus`, offset `--border-width-focus-offset`, except for [text inputs](#shell-and-remaining-phase-2-feedback) and the material controls' underline treatment below.

## Iconography and imagery

**Section 09** · **Status:** Approved — no icon library chosen

- **Icons:** inline strokes on a 24px grid, stroke width 1.7–1.8 (2.2 for ticks), round caps and joins, `currentColor`, drawn at `--size-icon-sm|md|lg`. Icons are `aria-hidden`; their buttons carry an `aria-label`.
- **Imagery:** looks are 1:1, frames and videos 16:9, sheet pages 4:3. Example media (Mercer and Vale) is local and not licensed for redistribution; see [Assets](#assets).

## Motion

**Section 10** · **Status:** Approved — motion only says "working" or "new"

| Token | Value | Resolved | Was | Use |
| --- | --- | --- | --- | --- |
| `--duration-word` | `28ms` |  | `--dur-word` | Stagger between streamed words (demo only). |
| `--duration-word-fade` | `120ms` |  | `--dur-word-fade` | Fade-in of one word. |
| `--duration-fade` | `200ms` |  | `--dur-fade` | Activity lines, tab dot. |
| `--duration-card` | `350ms` |  | `--dur-card` | Question card rising in with a 6px lift. |
| `--duration-appear` | `400ms` |  | `--dur-appear` | Panel content replacing the shimmer. |
| `--duration-panel` | `450ms` |  | `--dur-panel` | Panel fade-in on first appearance. |
| `--duration-card-delay` | `250ms` |  | `--delay-card` | Gap after the message ends, before the question. |
| `--duration-pulse` | `1000ms` |  | `--dur-pulse` | Running activity line and Working… dot. |
| `--duration-shimmer` | `1200ms` |  | `--dur-shimmer` | Loading placeholder; linear, repeating. |
| `--duration-highlight` | `1600ms` |  | `--dur-highlight` | Fresh-content ring fading out. |
| `--easing-out` | `cubic-bezier(0, 0, 0.58, 1)` |  | `--ease` | Entrances (CSS ease-out). |
| `--easing-in-out` | `cubic-bezier(0.42, 0, 0.58, 1)` |  | `--ease-loop` | Pulses (CSS ease-in-out). |

Every animation has a still alternative under `prefers-reduced-motion: reduce`: content appears at once and spinners or pulses become static.

## Components

**Section 11** · **Status:** Partial — existing components retained; Editor additions describe the reviewed layout, not a complete editing system

Each component has the same anchor here and on the [Components page](brand-book/components.html). Mockup class names are given so implementers can find the reference markup; they are not a required naming scheme.

**Rules that apply everywhere:** interactive elements other than [text inputs](#shell-and-remaining-phase-2-feedback) retain a visible keyboard-focus cue. Existing non-text controls keep their focus ring; the new material controls below use a label underline instead, without a ring. Disabled controls use 45–60% opacity and stay visible (open: pick one `--opacity-disabled` value); status is never colour only.

### App shell

`.app.with-panel`: three columns, `--size-layout-sidebar | 1fr | --size-layout-panel`, at full viewport height.

- **Columns scroll on their own.** The thread and the panel body each scroll; the sidebar and the tab bar stay put.
- **At ≤ `--breakpoint-md`**, the columns are 220 / 1fr / 330.
- **At ≤ `--breakpoint-sm`**, the layout is a single column:
  - the sidebar becomes a top bar with only New video;
  - the panel stacks under the chat with its tabs, and its body stops scrolling separately.
- **The panel is always present**, including on the opening screen (D-73).

### Sidebar

`.sidebar` on `--color-bg-sunken` with a right border.

- **Contents, top to bottom:** the product name (working placeholder), **New video**, **Library**, a **Recents** label with one row per video, and the account at the bottom.
- **Nav items** (`.navitem`): 14px text with an 18px icon, `--radius-md`, 8px 10px padding. The current item gets a `--color-bg-hover` fill and `aria-current="page"`.
- **Recents rows** use 13px text.

### Messages

- **User message** (`.me`): sits on the right, at most 85% wide, on `--color-bg-sunken` with a border, `--radius-bubble`, 10px 14px padding. Attachments sit above the text as 72px square thumbnails, or as attachment chips.
- **Agent message** (`.agent`): plain text with no bubble. Paragraphs, bullets and numbered lists are 10px apart. Links use `--color-text-link` underlined, and a link that names a tab opens that tab.
- **Answered-question record** (`.me.answered`): a user message with the question above the answer:
  - first line: a reply icon, the question in 12px `--color-text-subtle`, and a right-aligned "1 of 2";
  - second line: the answer, with its letter key when an option was picked.
  - When something was approved, a closed "Plan / Frame / Request you approved" disclosure (`.asked-ctx`) holds what was approved.
- **Edit record** (`.me.edit-record`): the same layout, recording manual board edits handed to the agent (D-54).
- **Messages are 22px apart.** The thread is anchored to the bottom.

### Activity lines

`.acts > .act`: what the agent did, written **before** its message (D-72).

- **Text:** 13px `--color-text-subtle`.
- **Running state** (`.run`): pulses at `--duration-pulse` and never shows a percentage.
- **Done state** (`.done`): a 13px tan tick, then the past tense, for example "Made 3 reference sheets".
- **Links:** a line that changed a tab links to it (`title="Open Assets"`). Lines that changed no tab are plain text.
- Keep each line to about 60 characters, with one result per line.

### Chat box

`.composer` is the one input, and it looks the same in every state (D-74, D-76).

- **Shape:** `--color-bg-surface`, `--color-border-input`, `--radius-2xl`, `--shadow-input`, 14px 12px 10px 16px padding, width `--size-layout-chat`, centred, 24px from the bottom.
- **Field:** 15px text, at least 44px high. The placeholder uses `--color-text-subtle`; typed text uses `--color-text-primary`.
- **Bottom bar:** "+ Attach" on the left (a 30px round button; it opens the [Library picker](#library-picker)) and **Send** on the right.

| State | What shows | Rules |
| --- | --- | --- |
| Idle, empty | Placeholder "Describe your video…"; Send disabled | — |
| Typed | Text in `--color-text-primary`; Send enabled | Enter sends |
| With attachments | Attachment chips above the text: 28px image, name, a type in 11px and × | Remove with × |
| Agent working | Field reads "Type to add something; I'll pick it up when I'm done…"; the bar shows a pulsing dot with "Working…" and **Stop** | Typing is queued for the agent's next turn. Stop ends the turn |
| Question docked | The [question card](#question-card) grows on top, inside the same outline | Typing answers the question, or asks something else and leaves it waiting |
| Question folded | A "1 question waiting · Show" pill sits above the box | Show reopens the question |

**Never** change the box's colour, swap it for another field, or rename Send.

### Question card

`.qcard.dock`: a question, and its options, docked on top of the chat box inside the same outline.

- **Shape:** `--radius-2xl`, 14px padding. A divider separates the question from the chat box below it.
- **Head:** the title in 15px/600. A 12px `--color-text-subtle` count or hint sits below it ("Question 2 of 2", "Click an image to see it larger"). × (`.qclose`, 28px) folds the card.
- **Bodies, one per question:**
  - **Options** (`.qopts`): a bordered list with `--radius-xl`. Each row (`.qopt`) has a 20px letter key (A, B, C) and a short suggested prompt, with no descriptions. Rows are buttons.
  - **Image picker** (`.picker .tiles`): 3, 2, 1 or 4 [media tiles](#media-tiles) across, followed by options.
  - **Plan** (`.qplan`): a `--color-bg-canvas` box holding a short plan per shot (a number badge, heading, 13px text, 12px metadata and reference pills), followed by options. Used for approvals before paid work.
- **Options only cover things already on screen.** Approving approves the exact draft shown.

### Buttons

| Variant | Class | Spec | Use |
| --- | --- | --- | --- |
| Primary | `.send`, `.choose` | `--color-action-primary-bg` fill, `--color-action-primary-text` 13px/600, `--radius-pill`, height 32 (34 for Choose), 16px side padding | Send, Choose, Attach (n). One per area |
| Primary small | `.regen` | Same colours, 12px/600, 4px 12px | Regenerate in the board |
| Stop | `.stop` | `--color-bg-inverse` fill, `--color-text-inverse` text, 9px square icon, height 32 | Only while the agent works |
| Secondary pill | `.viewboard`, `.choice`, `.th-row .use` | `--color-border-default`, `--color-text-secondary` 13px, `--radius-pill`; hover fills `--color-bg-hover` | View storyboard, Play all, Use this version |
| Icon | `.edit`, `.qclose`, `.lb-nav a` | 26–32px, transparent or outlined round; hover fills `--color-bg-hover` | Edit section, close, previous and next |
| Attach | `.attach .plus` | 30px round outline with the + drawn as two 1.5px bars, centred exactly | Opens the library picker |
| Quiet | `.gen-quiet-button` | Minimum `--size-control-md` (32px), 13px/400 at 1.45 line height, 6px 10px padding, no border, transparent fill, `--radius-pill`, `--color-text-secondary` | Low-priority local action such as Collapse all; not a navigation link |

Quiet-button hover/pressed uses `--color-bg-hover` and primary text. Keyboard focus underlines the label at 2px thickness (`--border-width-focus`) and 2px offset (`--border-width-focus-offset`), with no outline. Disabled is 45% opacity in this reference and skipped by keyboard focus. Collapse all closes the outer Scene groups only; it must not change the Scene filter, tab, conversation or material. It does not promise to reset every nested disclosure. Enter/Space activates the button. The reference's reset-only form is a script-free demonstration, not a required application mechanism.

### Single select

A single current value, not a text input or a multi-select. [Visual states](brand-book/components.html#single-select) · [scoped reference CSS](components/material-controls.css). Classes and native customizable-select syntax are reference mechanics, not a selected frontend dependency.

| Part / state | Exact treatment and behavior |
| --- | --- |
| Closed control | Minimum 34px (`--size-control-lg`); 13px/400 text at 1.45 line height; 6px 12px padding; pill radius; 1px default border; surface fill; secondary text; 8px gap to a 15px, 1.8-stroke outlined chevron |
| Hover / open | Hover fill and stronger existing border; no new shadow or permanent focus decoration |
| Menu | Surface fill, primary text, 1px strong border, 12px radius, 4px padding and separation; maximum height `min(246px, 60vh)` with vertical scrolling. Maximum width `min(340px, 100vw − 32px)`, reduced to 290px at 821–1100px; menu may flip to stay visible |
| Option | At least 34px high, 8px 10px padding, 8px radius, 13px/1.45 text; 15px check slot and 8px gap. Neutral selected/hover fill. A 2.2-stroke tick marks the current value, **not approval** |
| Keyboard focus | No ring on the control or options. Underline the focused label in its existing text color: 2px thickness, 2px offset. This cue is keyboard-only, not the ordinary mouse appearance |
| Disabled / no choices | Retain the control with an explicit label such as “No Scenes yet”; 45% opacity, no activation, skipped in keyboard focus order |
| Long labels / many choices | Ellipsis only in the closed control; full option text wraps in the menu. Do not grow the workspace. Scroll or keyboard-navigate through the menu; no search field is implied |

Use an accessible name such as **Filter material by Scene** and native single-selection keyboard behavior; Escape closes the menu and restores focus to its control. Changing a material filter never changes the conversation or grants creative approval. An All Scenes option reveals grouped material; a selected Scene focuses its material. The component's 20-name stress specimen is not proof of a complete 20-Scene workspace.

This local selection has no loading, success or validation banner. Remote-catalogue loading/error/recovery is outside this bounded component and remains undesigned if later required. Cross-browser customizable-select behavior and full assistive-technology verification remain implementation work; Chromium reference behavior alone is not compatibility certification.

### Scene disclosure

An extension of the existing disclosure family, not another navigation destination. [Image and text variants](brand-book/components.html#scene-disclosure).

- **Header:** optional 56px-wide 16:9 thumbnail with 1px default border and 6px radius; wrapping 13px/600 Scene name; 12px/1.4 subtle metadata, separated by 2px; trailing 15px, 1.8-stroke chevron. Grid gaps 10px, vertical padding 10px, bottom divider 1px. Text-only Script variant omits the image column.
- **Interaction:** independently open/close each Scene. The chevron points down when closed and up when open. Native disclosure activation is Enter/Space; expansion is exposed to assistive technology. Hover uses the neutral fill. Keyboard focus underlines only the name (2px thickness/2px offset), without a ring.
- **Contents:** 12px bottom padding. Reuse readable Script typography, existing Storyboard Shots/Panel rows and Video rows; no new giant-card family. Shared Assets remain one library with usage context, not repeated per Scene. Distinct versions/variants must not be merged away.
- **Empty:** keep the Scene's identity and explicit missing-material text; never derive Ready from the presence of content. Disabled/loading/error/success are not new states of this local disclosure; actual material state and future async failures remain separate concerns.
- **Do not:** navigate to another conversation, infer approval, concatenate video, change Scene order or broaden the panel. Full Project ownership/composition semantics are not approved by this component checkpoint.

The temporary aggregation reference uses native checkbox/label sections so its reset-only Collapse all works without scripts; it demonstrates checked/unchecked state rather than a production disclosure API. The brand-book specimen uses native `details`/`summary`. An application must preserve the visible and accessible expansion state together.

### Panel tabs

`.ptabs`: **Script · Assets · Storyboard · Videos**, always in this order and always present.

- **Tab bar:** 12px 14px padding with a bottom border. Each tab is a 13px pill in `--color-text-secondary`.
- **Active tab:** `--color-bg-inverse` fill and `--color-text-inverse` text.
- **Changed tab** (`.dot`): a 7px `--color-action-primary-bg` dot at the top right when the tab changed out of view. Opening the tab clears it.
- **The panel never switches tabs on its own** (D-72).

### Panel sections

- **Section** (`.pv section`): a 12px `--color-text-subtle` label (`.plabel`) with an optional 26px edit pencil, then the content. Sections are separated by top borders.
- **Empty state** (`.pempty`): a dashed box with one centred 13px line. Each tab has its own text:
  - Script: "Your script will appear here once you describe your video."
  - Assets: "Characters, places and props will appear here."
  - Storyboard: "The storyboard is planned once the script is agreed."
  - Videos: "No videos yet."
- **Loading** (`.skeleton`): grey bars at 12px height and `--radius-sm`, shimmering at `--duration-shimmer`. It shows only while the agent first writes a tab; then all the content appears at once (`--duration-appear`).
- **Fresh content** (`.fresh`): a brief `--shadow-fresh`.

### Status pills

`.status`: 11px text, 2px 8px padding, `--radius-pill`. **A pill shows one of three stored states**, plus Chosen in Videos.

| State | Fill / text | Meaning |
| --- | --- | --- |
| Empty | `--color-bg-hover` / `--color-text-secondary` | Nothing made yet |
| Draft | `--color-bg-selected` / `--color-text-link` | Made, waiting for the person |
| Ready | `--color-status-ready-bg` / `--color-status-ready-text` | Approved |
| Chosen (Videos) | `--color-status-ready-bg` / `--color-status-ready-text` | The version used in the scene |

"Making…" (`.fresh.making`) is progress, not a state. It is a small pill on a dimmed placeholder. There are no live badges.

### Chips and pills

- **Chip** (`.chip`): 28px high, 12px text, `--color-border-strong`, `--radius-pill`, with a × remove button. Chip types:
  - **picked** (look choices): tan fill and border;
  - **add** ("+ mood"): dashed outline, `--color-text-subtle`;
  - **changed** (an edited value in the board): `--color-action-primary-bg` outline on `--color-bg-selected`, with the old value struck through.
- **Reference pill** (`.ref`): a 24px round image and a 12px name, used in plans to show which assets an image uses.
- **Attachment chip** (`.att-chip`): a 28px image, the name, an 11px type and ×, with `--radius-lg`.
- **Pills belong in the board, not the panel tab** (D-51 to D-54). In the Storyboard tab, the camera is shown as text.

### Item rows

`.need` and `a.need.asset`: one row per character, place or prop in the Assets tab.

- **Layout:** a 56px key image, then the name in 600 with an 12px type and source line ("Character sheet · in your Library"), then a [status pill](#status-pills).
- **Shape:** `--color-bg-canvas`, `--color-border-default`, `--radius-md`, 10px 12px padding.
- **Hover:** `--color-border-strong`. Clicking the row opens the [reference sheet](#reference-sheet).

### Script

The Script tab has three sections: **What happens**, **Shots** and **Look**.

- **What happens:** plain text.
- **Shots** (`.breakdown`): a numbered list. Each shot is named after what happens in it (600), followed by 14px `--color-text-secondary` text saying who is where. Dialogue uses `typography.quote` in the display font. A 12px hint gives the total length.
- **Look:** picked chips.
- **No camera here.** Camera direction lives with each shot in the Storyboard.

### Storyboard shots

`details.sb-shot`: one group per shot, open by default.

- **Header:** a 22px number badge, the shot name, a 12px summary ("Close-up · 5 s · 2 panels"), a status pill and a chevron.
- **Body:**
  - the camera as text, with an **Edit** link that opens that shot in the board;
  - then the panels (`.sb-panel`): a 120px 16:9 image, the number "2.1" with a time, and a 13px caption. Dialogue in captions is set in the display font.
- **Flags:**
  - `.sb-flag`: a note from the agent about a difference, in `--color-text-link` on `--color-bg-selected`;
  - `.sb-changed`: an edit that has not been regenerated yet. That shot's images dim to 45%.
- **"View storyboard"** (a secondary pill) opens the board.

### Storyboard board

`.lb-panel.board`: the editable full storyboard in a viewer `--size-layout-viewer-board` wide.

- **Layout:** for each shot, a header (badge, name, metadata, flag), then a 4-column grid of panels: 16:9 image, a number label on the image, and a caption with an edit pencil.
- **Camera pills live here.** A changed value marks its shot changed and shows **Regenerate** for that shot only.
- **Edits are saved at once** and handed to the agent on its next turn (D-54).
- **At ≤ `--breakpoint-sm`**, the grid is 2 columns.

### Video rows

`.take-item`: one row per shot in the Videos tab.

- **Layout:** a 96px 16:9 thumbnail with a play overlay, then a number badge with the shot name, then a 12px line ("Version 2 · New · 5.1 s · from 2.1 and 2.2"), then a status pill (Chosen or Draft).
- **Version history:** "Version history · N earlier" is a closed disclosure inside the row. Each earlier version has a 72px thumbnail, its length and a "Use this version" pill.
- **Above the rows:** during version comparison, **Play all · 0:13** opens the [scene player](#scene-player). Once a current scene edit exists, the [Scene edit card](#scene-edit-card) replaces that entry action. Its list is headed **Shots**; do not repeat the aggregate count.
- **Wording:** on screen it is always "video" and "version", never "take" (D-68).

### Scene edit card

Visual: [Videos entry](editor/index.html) · [Book specimen](brand-book/components.html#scene-edit-card).

- One 16:9 snapshot of the current scene edit, then **3 shots · 13.4 s** and **Open editor →** (primary) / **Export** (secondary). Counts describe Shots in this fixture, not arbitrary timeline clips or audio layers.
- No **Scene edit** heading, **Watch**, **Whole scene** overlay, revision number, Draft/Kept badge, or duplicate **3 chosen** summary. Removing a badge does not grant creative approval or change stored review state.
- Use `--radius-xl`, `--color-border-strong`, `--color-bg-canvas` and `--space-14` body padding. Metadata uses the caption role; actions use the existing primary/secondary treatment.
- The **Shots** list retains each version, duration and **Chosen** status, with earlier versions behind a native disclosure. Source-version history and eventual scene-edit history are distinct.
- The reference covers a populated three-shot scene only. Empty, missing-choice, changed-source, loading and error variants remain open. An export does not require a token edit or a visit to the Editor.

### Editor layout and timeline

Visual: [Editor workspace](editor/editor.html) · [Book specimen](brand-book/components.html#editor-layout-and-timeline). **Partial:** layout direction is reviewed; disabled tools are not complete component contracts.

- Dedicated full-window workspace within Generate, reached from **Videos**, not a fifth tab, separate product or blocking lightbox. Header: **← Videos**, **Editor**, scene name, Undo and Export. No comparison banner or **Edit 1 · Draft** status.
- Left tools, central player, conversation on the right. On desktop the conversation spans the full workspace height; the timeline occupies only the tools/player columns. No Inspect/Agent switch or conversation heading. Retain the accessible **Editing conversation** region label.
- Reuse the existing palette, system typography, spacing and controls. The reference's composer boundary uses the existing `--color-text-subtle` colour for a visible outline; it does not inherit the legacy faint-input-outline gap or change that global token.
- Native **Compact timeline** starts unchecked. Visual and Audio groups start open; their disclosures hide rows, not media. Scrolling keeps the ruler and track labels visible. Collapsing groups alone does not enlarge the player; compact mode does.
- Tracks exist as needed. Captions, titles/overlays, video, dialogue/original audio, ambience, sound effects and music are possible roles, not seven mandatory empty tracks. Effects and transitions do not automatically require their own rows.
- Separate dialogue and ambience are fixture assumptions. Mixed generated sound remains **Original audio** unless separate media actually exists. Dashed sample layers and decorative waveforms are not selected creative additions or proof of audio processing.
- Exact reference geometry is below. These new layout metrics are recorded here, not adopted as a new application token file. Before implementation, finish the missing interaction contracts and map these additions into application tokens; existing foundation tokens still win over frozen mockup styling.

| Reference metric | Value / rule |
| --- | --- |
| Header | 64px; workspace uses the full viewport, without a demo-banner allowance |
| Desktop columns | 48px tools / flexible player / 320px conversation |
| 821–1100px columns | 44px tools / flexible player / 300px conversation |
| Expanded timeline | `clamp(260px, calc(100vh - 420px), 480px)` |
| Compact timeline | 300px |
| Timeline grid / labels | Minimum 740px; labels 152px (140px at ≤820px); 12px column gap |
| Video / audio / overlay rows | 64px / 34px / 32px |
| ≤820px | Tools → player → timeline → conversation; timeline 480px expanded or 300px compact |
| Short desktop viewport | At height ≤680px, minimum workspace height 636px with page scrolling |

Keyboard/focus: labelled native checkbox toggles with Space; group summaries toggle with Enter/Space; the timeline scroll region is focusable. Active targets are at least 24px. Every future editing gesture needs a keyboard alternative; those editing controls, property panels, announcements, resizing and fullscreen behaviour are not specified by this layout alone.

### Media tiles

`.tile`: an image or video choice in a question card or history.

- **Shape:** `--radius-xl`, `--color-border-default`, `--color-bg-sunken` well. The image is 1:1 for looks, 16:9 for frames and videos, and 4:3 for sheet pages.
- **Overlays:**
  - a letter key at the top left on `--color-media-label`;
  - a 26px zoom button at the bottom right (hidden ≤ 820px);
  - for videos, a 40px play button on `--color-media-scrim` and a duration at the top right;
  - an optional caption bar (13px name, 12px detail).
- **Hover:** `--color-border-strong`.
- Clicking opens the [viewer](#viewer).

### Viewer

`.lightbox > .lb-panel`: a modal over `--color-media-scrim`.

- **Panel:** `--color-bg-surface`, `--radius-3xl`, 16px padding, `--shadow-overlay`, `--size-layout-viewer` wide (wide, sheet and board variants are listed under Size and layout).
- **Head:** the title in 15px/600 and a close ×.
- **Foot:** round previous/next arrows on the left; the primary action (for example "Choose look A") on the right. Frame viewers add **View in 3D**.
- **Keyboard:** Escape closes the viewer, and focus returns to the tile that opened it.

### Scene player

`.lb-panel.scene`: plays the whole scene in shot order (Play all).

- **Player:** a 16:9 player up to `--size-layout-player`, with a 64px play button, a 4px progress bar on `--color-media-track` and the time.
- **Timeline:** one 56px block per shot with its number. The current block has a 2px `--color-action-primary-bg` outline.
- **Cut checks:** each cut shown as the end frame → start frame, in a 2-column grid (1 column ≤ 820px).
- **Version switch:** "Version" with pills; the current pill uses the inverted `--color-bg-inverse` fill.

### Library picker

`.libpick`: opened from + Attach (D-83). This was a design example, used in the demo only.

- **Panel:** `--size-layout-picker-w` × `--size-layout-picker-h`, `--radius-3xl`; full screen ≤ 820px.
- **Head:** a title and a 260px round search field (hidden ≤ 820px).
- **Source switch:** a segmented control for **Examples** and **Your library**, on `--color-bg-sunken` with `--radius-lg`. The selected segment is `--color-bg-surface` with `--shadow-segment`.
- **Category pills:** Style, Camera, Movement, Lighting, Colour and Environment. The selected pill is inverted.
- **Grid:** auto-fill tiles at least 150px wide. Each tile is a 1:1 image with a 22px check at the top right, plus a name in 13px/600 and a type in 12px. A selected tile has `selected ring (focus ring style)` and a filled check.
- **Style families:** horizontal rows, each with a heading and "See all".
- **Tray:** "1 selected", the chips, and **Attach (n)** as the primary button.
- **Empty library:** "Nothing saved yet" plus one line of explanation.

### Library feedback

**Scoped approval — 2026-10-28.** The user approved the Story 2 feedback proposal derived from `demo-05.html#lib-yours`. Reuse `.lp-empty`: a centered two-line grid, 4px gap, 240px minimum height, 13px subtle body text and 15px/600 primary title. Retain this geometry at desktop/narrow widths; introduce no banner, new colors, sign-in/retry action or recovery flow.

| Condition | Title | Message |
| --- | --- | --- |
| 401 / no valid session | Sign-in required | Your Library cannot be loaded without a valid session. |
| 501 | Library not available yet | Library loading is not implemented in this build. |
| Loading | Loading Library… | Looking for saved characters, places and props. |
| Transport/error | Library could not be loaded | No saved material was changed. |
| Missing public configuration | Library connection not configured | No API origin is configured for this build. |

Empty success retains “Nothing saved yet” and “Characters, places and props you approve will appear here.” A failed read must never be presented as empty saved work. Use polite status semantics, with no credentials or raw error payloads in the message. This approves Library feedback only—not unrelated session, proposal/estimate or export layouts, actual sign-in, or detailed feature recovery.

### Shell and remaining Phase 2 feedback

**User approval — 2026-10-28.** Layouts were approved from the local proposal set at source revision `2e03eba`, with the exact copy below superseding its draft copy. Preview markers and test-fixture language are never product copy. No colors, banners, recovery flows or redesign are added. Approval is design authority, not implementation acceptance.

**Text inputs have no focus ring.** Approved by Lou on 2026-10-29. The chat message box, the inline Script/Shot/Panel editors and Library search show no blue focus outline on focus, matching the brand-book CSS, which rings only links and buttons. Keyboard-only focus rings on buttons, tabs and other controls are unchanged.

**002/Story 3 — implement now.** Reuse the opening shell in `flow2-step1-r73.html`, shared dialog geometry in `flow1-step4-r85.html#look-a`, and existing control/section typography. Reproduce new states by approved substitutions into those tracked references, never by loading ignored previews.

| State | Exact copy and controls |
| --- | --- |
| Signed out | Account row: `Account`, empty avatar. Dialog: `Not signed in`; `Sign-in is not available yet.`; disabled `Sign in` |
| Session present | Account row and dialog show the account name. Buttons: `Sign out`, `Switch account` |
| Either account action | `Account actions are not available yet. Nothing about your session has changed.` |
| Narrow navigation | At ≤820px, `Menu` beside `New video` opens `Navigation`: `New video`, `Library`, `Recents`, `No videos yet.` when empty, and `Account` (the supplied account name when present). Desktop sidebar unchanged |
| New video unavailable | `New video is not available yet.` / `No conversation was created.` |
| Recents unavailable | `Recents are not available yet.` / `No conversation list was loaded.` |
| Conversation load unavailable | `Conversation loading is not available yet.` / `The current workspace is unchanged.` |

**Workspace-read addition — 2026-10-28, 002/Story 3.** On a failed workspace HTTP read, replace only the text in the current tab's existing dashed empty box, preserving its style. Native-load copy stays only in its native action dialog; it is never an HTTP-read fallback. No banner, colors or recovery controls are added.

| Workspace read | Exact text |
| --- | --- |
| 401 | Sign-in required to load this video. |
| 501 | Loading this video is not available yet. |
| Any other failure, including transport and timeout | This video could not be loaded. Nothing was changed. |

Loading retains the approved skeleton (`demo-02.html`, [Panel sections](#panel-sections)); motion has the existing static reduced-motion alternative. With no session or no conversation, retain the approved per-tab empty text and make no workspace request. Comparisons substitute these texts into `flow2-step1-r73.html`'s current `.pempty`, with no layout changes.

Dropped: the local-clear button and cleared-session presentation, and the separate switch-unavailable state. Session/account/conversation changes still clear scoped views internally. No actual Auth, fake recents, guessed identity or hidden sample account is authorized.

**002/Story 4 — approved and implemented in PR #14.** Reuse `flow2-step6-r78.html#plan`'s question/plan/options and existing native disclosure treatment. Exact sample lines: `Shot 2 · Panel 2.1 · 1 image`; `Uses: Vale reference (version 1), Gallery reference (version 1)` (input order preserved); `Model: {provider} · {model}`; `Cost: $0.12 · estimate`. Basis words: provider → `provider price`, calculated → `calculated`, estimated → `estimate`. If basis is unknown, amount missing or currency missing: `Cost: unknown`. Follow with `For information only; not a quote.` The collapsible `Prompt and settings` holds the prompt, settings in words (for example `16:9 · still camera`) and any disclosures. Question cards render the options carried by the question record, using its labels. The option set and wording belong to the later-phase question producer (possibly an agent tool that generates the question UI), not to this design. Remove the visible proposal/question ID/revision line and illustrative-identifiers line; submitted answers still bind exact IDs and revisions. No spending gate, model selector, credits or provider qualification is implied.

**Chat unavailable addition — 2026-10-28, 002/Story 4.** Every Send, including the opening composer and queued typing, shows one plain action-feedback line under the chat box: `Sending messages is not available yet. Your message is kept.` Keep the typed text in the box. Stop uses the same feedback style: `Stopping is not available yet.` Show Stop only while the assistant works; Phase 2 can reach that presentation only through an isolated, labelled read-only working prerequisite. These actions use the supported local native-unavailable boundary, with no banner, colors, recovery controls or successful turn/stop fiction.

**002/Stories 4–5 — approved for later, not implemented here.** One plain line immediately under the owning answer, save or version-use controls. Reuse existing hint/activity typography and the owning question/Script/history layouts (`flow2-step2-r74.html`, `flow2-step10-r82.html#p-takes`), not a banner or recovery control. The Library approval alone did not cover these actions.

| Action | Unavailable | Sign-in required | Error |
| --- | --- | --- | --- |
| Answer | Answering is not available yet. The question stays pending. | Sign-in required to answer. The question stays pending. | The answer was not submitted. The question stays pending. |
| Save | Saving is not available yet. Your unsaved text is retained. | Sign-in required to save. Your unsaved text is retained. | Changes were not saved. Your unsaved text is retained. |
| Use version | Using this version is not available yet. The current selection is unchanged. | Sign-in required to use this version. The current selection is unchanged. | This version was not selected. The current selection is unchanged. |

**Script inline edit — approved 2026-10-28, 002/Story 5.** Clicking a section's edit pencil replaces that section's text with a typing box in the same panel, using the same fonts and colours. Use the displayed six-line textarea treatment: 14px text at 1.5 line height, 8px 12px padding, input border, canvas fill and 10px radius. Immediately below it, place **Cancel, then Save**, with an 8px gap and the existing secondary/primary pill treatments. Cancel restores the displayed version unchanged. Save uses the approved Save feedback above as one plain line under the owning controls and keeps typed text on 401, 501 or any error. Reproduce this state from tracked `flow2-step2-r74.html#p-script` plus this approved substitution; the ignored Story 5 preview is historical approval evidence, never a runtime or comparison dependency. Its draft label is never product copy. Only this inline edit state is newly approved; other states and boundaries are unchanged.

**Storyboard, Videos and request controls — approved 2026-10-28, 003/Story 1.** The user approved the displayed layouts with the copy simplifications below. Reproduce from tracked `demo-12.html#p-storyboard` (planned Panels), `demo-13.html#board` / `flow2-step7-r79.html#board` (board and Shot/Panel grouping), and `demo-15.html#p-takes` through `demo-18.html#p-takes` / `flow2-step10-r82.html#p-takes` (individual candidate rows/history), plus these substitutions. Remove Play all, comparison, sequential/scene playback, Editor, Export and simulated generation progress. Existing approved empty texts and workspace-read feedback remain unchanged. The ignored `outputs/verification/sprint-003/design-proposals/story1/` previews are historical display evidence only, never runtime assets or comparison dependencies.

- **Exact Panel version:** reuse the shared image-viewer dialog (`flow1-step7-r88.html#frame`), substituting the exact Panel/version caption, for example `Shot 1 · Panel 1.1 · Version 1`, and **Use this version**. Remove opening-Frame approval, 3D and Download controls. Panel choice uses `useVersion` with `panel_image`; Video choice uses `useVersion` with `shot_video`, never a question answer or an implicit approval from viewing. Reuse the three approved Use-version feedback lines unchanged beneath the owning controls.
- **Planning edits:** inside the storyboard dialog, edit only the bound Shot intent or Panel description using the approved Script six-row typing box, **Cancel, then Save**, and the same 8px action gap. Preserve the exact base version, Shot/Panel identities, order and references; reuse all three approved Save feedback lines unchanged. Failures keep the unsaved text and displayed version.
- **Generation requests:** under Videos, show one existing item-card treatment per exact request, for example `Shot 2 · Video request`, its neutral status pill, a native **Request details** disclosure, and **Cancel request** only for unfinished requests. Status labels are `Queued`, `Submitting`, `Running`, `Succeeded`, `Failed`, `Cancelled`; technical success is not approval. Reuse existing `.need`, `.status`, disclosure and hint typography from `app-r11.css`; plain feedback belongs beneath the owning controls and read/empty feedback uses the existing dashed box. Remove **Last known request state** from every card, and give cancelled cards no extra line beyond their `Cancelled` pill. Put exactly one line under the list: `Request status does not confirm that remote work or charges have stopped.` Cancellation targets `cancelGeneration`, never assistant Stop; closing or navigating sends neither.

| Request surface | Empty / loading | 501 | 401 | Other error |
| --- | --- | --- | --- | --- |
| List | `No generation requests yet.` / `Loading generation requests…` | Generation requests are not available yet. | Sign-in required to load generation requests. | Generation requests could not be loaded. |
| Details | Existing disclosure treatment | Request details are not available yet. | Sign-in required to load request details. | Request details could not be loaded. |
| Cancel | Unfinished requests only | Cancelling this request is not available yet. The last known state is still shown. | Sign-in required to cancel this request. The last known state is still shown. | Request cancellation was not confirmed. The last known state is still shown. |

Camera/lens/duration, rich text and images are not inferred from opaque JSON: any such facts require labelled, exact-version-bound read-only prerequisites in isolated compositions; production fails closed without supported public fields. The preview-only `Example media omitted` / `Layout reference only` box is never product copy. No new provider capability, working playback, cancellation guarantee or stopped-charge promise is approved. This records design approval, not implementation acceptance.

**Single-clip playback and unavailable media — 003/Story 2.** **Approved by Lou on 2026-10-29 at the Phase 2 review.** The orchestrator had provisionally approved it earlier the same day under Lou's delegation. The user-approved single-clip playback appearance is reused from `flow1-step9-r90.html#take-1`, with the exact-version row treatment from `flow1-step9-r90.html#p-takes` and `flow2-step10-r82.html#p-takes`. The ignored `outputs/verification/sprint-003/design-proposals/story2/` previews are historical display evidence only, never runtime or comparison dependencies.

- **Playback entry:** the existing Videos metadata line (`Version 2 · 5.1 s`) is a quiet exact-version trigger with accessible name `View Shot 1 version 2`. Its visible text, typography and layout are unchanged; no thumbnail or new visible control is added. Opening the viewer must not select the version.
- **Single-clip viewer:** the shared viewer dialog opens the exact version with the approved 16:9 media surface, 64px play control, 4px progress track and 12px time from the supplied source only. Title `Version 2`; caption `Shot 1 · Version 2`; controls `Play`, `Pause` and `Seek`; the existing **Use this version** remains the only selection action. Download, scene/sequential playback, Play all, comparison, Editor and Export are removed. The same per-Shot selection owner as the Videos rows is used, so at most one Chosen version is shown per Shot.
- **Loading:** `Loading this video…` in a 16:9 dashed surface with no play control, time or progress.
- **401:** `Sign-in required to load this video.` **501:** `Loading this video is not available yet.` **Source, transport or decode failure:** `This video could not be loaded. Nothing was changed.` These reuse the approved workspace-read lines unchanged in the existing dashed box; no player chrome, banner, retry or recovery control. No loaded media or pretend timeline progress is shown.
- **Facts and limits:** time and duration come only from the supplied source response. No resolution, frame-rate, sound, private-media or R2 claim is made. Reacquire targets the same exact version when the supplied URL expires while open and on reopen. The supplied-source play/pause/seek evidence uses a generated local clip; it is not private-transport or provider qualification. Playing is functional evidence, not a pixel-claimed decoded frame.

**Material inputs and the populated Library picker — 003/Story 3.** **Approved by Lou on 2026-10-29 at the Phase 2 review.** The orchestrator had provisionally approved it earlier the same day under Lou's delegation. Layouts reuse `library-picker-r92.html#lib-yours` and its `#attached` tray for the picker, and `flow2-step1-r73.html`'s composer for paste and file feedback. Substitutions: the dialog heading is the approved `Library` title at the approved 15px modal-heading size; the Examples source switch and panes are removed; the populated read uses `--size-layout-picker-w` × `--size-layout-picker-h` (full screen at ≤820px), while loading, 401, 501, transport-error and empty-success presentations keep the existing 560px dialog and unchanged copy; the picker search is hidden at ≤820px exactly as in the tracked reference.

Categories, names and images come only from labelled read-only display facts keyed by the exact `latestVersion.id`; no category, name or thumbnail is inferred from untyped content. Without facts there are no category pills, and each tile shows only the typed Library kind and latest revision with an empty dashed media square. The neutral reference placeholder (`Example media omitted` / `Layout reference only`) is never product copy; comparisons substitute one documented wordless local test image in both the reference media slots and the supplied image facts.

| State | Exact copy and controls |
| --- | --- |
| All tiles | Pills `All` plus the categories present in the display facts; tray `Nothing selected yet` and disabled `Attach` |
| Filter | The selected pill is inverted; only tiles carrying exactly that fact category are shown |
| Selection | Pressed tile ring and check; tray `{n} selected`, chips, `Attach ({n})`; selection alone sends no request |
| Search | Field placeholder `Search`, accessible name `Search Library`; filters only loaded tiles by displayed name; hidden ≤820px |
| No match | `No matching items` / `Search only looks at the names shown here.` in the approved 4px-gap, 240px-minimum two-line empty treatment |
| Loading | Approved `Loading Library…` feedback unchanged |
| Attach 501 | `Attaching from your Library is not available yet. Nothing was attached.` |
| Attach 401 | `Sign-in required to attach from your Library. Nothing was attached.` |
| Attach error | `Nothing was attached. Your existing attachments are unchanged.` |
| Attach partial | `Attached {k} of {n}. The rest were not attached.` Successful items leave the selection; failed and remaining items stay selected |
| Attach success | Clear the selection; no fabricated attached chip or other local claim |
| Paste | Pasted prose stays ordinary composer text; existing `Sending messages is not available yet. Your message is kept.` |
| Upload 501 | `Uploading files is not available yet. The file was not sent.` |
| Upload 401 | `Sign-in required to upload a file. The file was not sent.` |
| Upload error | `The file was not uploaded. Nothing was changed.` |
| Unsupported file | `That file is not an image or video. The file was not sent.` |
| Isolated confirmation 501 | `Confirming this upload is not available yet. No version was created.` |

Attach lines use the same plain line beneath the tray as the approved Use-version feedback, but attaching a reference is not selection: no line says the selection changed. A selected local file shows no chip, filename, thumbnail, progress or attachment; the input is cleared after the attempt. Attaching sends each exact version with purpose `reference`; with no current conversation the tray stays disabled and no `useVersion` or `requestUpload` is sent. Real transfer, validation, partial-success recovery and confirmation remain P3-S3/S4, not this wiring milestone. The ignored `outputs/verification/sprint-003/design-proposals/story3/` previews are historical evidence only, never runtime or comparison dependencies.

**Direct Export, history/status and download consumers — 003/Story 4.** **Approved by Lou on 2026-10-29 at the Phase 2 review.** The orchestrator had provisionally approved it earlier the same day under Lou's delegation. Reuse `demo-18.html#p-takes`'s direct Videos Export direction, `app-r11.css`'s item-card/neutral-status treatments and the shared 560px viewer dialog (342px wide at a 390px viewport). The populated history/detail layout structure, sectioning, wrapping, scrolling and shared loading pattern are approved with the binding substitutions below. Card: `Chosen source versions`, then `Export` and `Export history`. Creators never see opaque IDs, internal selection revisions, numeric source order or test-prerequisite lines. No Editor, scene playback, settings profile, fake record/progress, deletion or retry is authorized. Download is an exact output-version media-access consumer, not a generated URL or working export claim.

| Surface | Exact unavailable text |
| --- | --- |
| Export | `Export is not available yet.` / `No export was queued and no file was created.` |
| History | `Export history is not available yet.` / `No export records were loaded.` |
| Detail | `Export details are not available yet.` / `No export record was loaded.` |
| Download | `Download is not available yet.` / `No file was downloaded.` |

The four unavailable pairs retain the same shared two-line empty treatment. Download uses its pair on every settled outcome, including successful media access, with no anchor, navigation or file. Phase 2 qualifies the exact media-access call only; trusted origin and attachment delivery remain P3-S10. Loading uses the existing shared treatment without progress or a fabricated record.

- **Status pill:** capitalize the exact typed value: `Queued`, `Processing`, `Succeeded`, `Failed`, `Cancelled`. Technical success is not approval.
- **History card:** title `Export`, status pill, then only the typed `current` boolean: true → `Uses your current chosen versions.`; false → `Uses earlier chosen versions.` Then visible `Export details`, with a position-distinguishing accessible name such as `Export details, export 2 of 3`. No ID or revision number.
- **Detail:** heading `Export details`, the status pill and the same currentness line. Section `Shots in this export` contains one row per source in server `order`. Resolve the exact `shotId` and `versionId` against already-loaded Videos workspace data using own-property and exact-ID matching only: `Shot {n} · Version {revision}`. If either identity is absent, show `Not in the current Videos list`. Never expose raw IDs or numeric order.
- **Compatibility:** show a section only when typed `compatible` is false, headed `Can't be combined`. Each issue line is its resolved source label (same rule) + ` — ` + the server's literal message.
- **Failure:** when `failureReason` is present, section `Why it failed`, followed by the literal reason.
- **Output:** when `outputVersionId` is present, show `Download` without its ID. It calls the existing `media` operation for exactly that version. No URL construction or independent download transport.
- **Read-only contract projection:** status, currentness and compatibility come only from their typed fields. No local stale-submission rules, export state machine, stream validation, inferred currentness or processing is approved. Populated records remain labelled read-only prerequisites in isolated mounts until their real producer exists.

The ignored `outputs/verification/sprint-003/design-proposals/story4/` previews preserve the initial candidates as `*-v1` and regenerate populated history/detail with these final substitutions. They are inspection evidence only; runtime and reference comparisons use tracked references plus this record, never ignored assets. This is design approval (by Lou, 2026-10-29), not implementation acceptance.

### Phase 3 saved-work reads

**Owned saved-work reads — 005/Story 1.** Provisionally approved by the orchestrator on 2026-10-29 under Lou's delegation; pending Lou's ratification at the Phase 3 handoff. The approval covers 14 states shown as inert previews at 1440×900 and 390×844, with one change (Library pagination placement, below). Everything else reuses the approved Script sections, reference rows and sheets, Version/Use history rows, Library fallback tiles and shared buttons, with no token changes.

- **Version history pagination:** after the loaded rows, a secondary `Load earlier versions` button. It loads only when activated, and pages are appended.
  - Next-page loading keeps the rows, disables the button and adds the plain line `Loading earlier versions…`.
  - Next-page failure keeps the rows, restores the same button and adds `Earlier versions could not be loaded. The versions already shown are unchanged.`
  - The button is removed only when there is no next page. Only then does the summary show the known count, `Version history · N earlier`.
  - The initial read shows `Loading version history…`. If it fails, the button `Load version history` plus `Version history could not be loaded.`
- **Earlier exact version:** `Viewing version N` with a quiet `Back to current version`. Earlier content is read-only, with no edit pencil. Viewing or returning approves or selects nothing.
- **Library pagination:** a secondary `Load more`, with `Loading more Library items…` and `More Library items could not be loaded. The items already shown are unchanged.`
  - Loading keeps the tiles; the button is removed when there is no next page.
  - **Change from the preview:** the button and its line sit inside the scrolling grid, directly after the last row of tiles and left-aligned, like the history button. They are not in a fixed band above the selection tray; the tray is unchanged.
  - No Examples switch, and no Draft/Ready pills on Library tiles. Search keeps its approved loaded-items-only behavior.
- **Empty Library:** `Nothing saved yet` / `Your saved work will appear here.`, in the shared two-line empty treatment.
- **Reference without an image:** the Asset row keeps its layout with a dashed `No image` thumbnail; no invented media, and the reference is never hidden. Its Ready pill comes from the exact conversation use, not Library membership.
  - The text-only sheet keeps its typography and sections and says `No images are supplied.` Section text comes only from validated exact-version content, never from IDs or guessed JSON.
- **Behavior:**
  - Enter/Space activates the pagination buttons, loading is announced politely, and repeat activation is disabled while loading.
  - When the last page arrives, focus moves to the first newly added control before the load button is removed; otherwise focus stays on the button. No unexpected scroll jumps.
  - Changing account, conversation, resource or filter discards loaded pages and late responses, with no replayed action.

The ignored previews in `outputs/verification/sprint-005/design-proposals/owned-reads/` in the `workprint-2` clone are inspection evidence only. Runtime and visual comparisons use the tracked references plus this record. This is design approval, not implementation acceptance.

### Reference sheet

`.livesheet`: a character or place sheet drawn from its structured record. The images are separate files; a PNG or PDF is only an export.

- **Page:** `--color-bg-paper`, 24px 28px padding.
- **Header:** an uppercase kicker, the name in `typography.display-xl`, a summary and a status pill.
- **Sections:** a 3-column grid of sections, each with a `typography.display-sm` heading and figures with 12px captions.
- **Missing images:** dashed 130 × 96 slots.

### Placeholders

- **Planned panel** (`.ph`): a dashed 16:9 box on `--color-bg-sunken` with 11px text, shown before an image exists.
- **Making…** (`.fresh.making`): the placeholder dimmed to 35%, with a "Making…" pill (11px, `--color-text-link`) at the top left until the item arrives.

### Demo-only

`.demo-bar`, `.demo-glow` (a soft `--color-action-primary-bg` glow with no outline, on the + circle only), and `.stream` (word-by-word text). These exist only in the clickable demo and are not product components. The real app streams agent text as the model writes it, so `--duration-word` only applies to simulated playback.

## Patterns

**Section 12** · **Status:** Partial — existing patterns retained; Editor navigation added, detailed editing/persistence semantics still open

- **One question at a time:** a question docks on the chat box ([Question card](#question-card)); × folds it to a "1 question waiting · Show" pill. Typing answers it or asks something else.
- **Approve what is shown:** options only cover things already on screen; a plan approval approves the exact draft before paid work.
- **Report before replying:** [activity lines](#activity-lines) say what the agent did before its message; a line that changed a tab links to it.
- **Tab life cycle:** empty (one dashed line) → loading (shimmer, first write only) → filled, all at once over `--duration-appear` ([Panel sections](#panel-sections)).
- **Changed out of view:** the panel never switches tabs on its own; a tab that changed shows a dot, and new content gets `--shadow-fresh` briefly.
- **Stored state:** Empty, Draft, Ready (plus Chosen for videos) on [status pills](#status-pills); "Making…" is progress, not a state.
- **Edits hand back to the agent:** board edits save at once and are handed over on the agent's next turn as an edit record (D-54).

- **Same-conversation Editor:** Videos opens the complete current edit, not an isolated Shot. Returning restores the scene's Videos context; no export/re-import or new conversation is required by this navigation. Persistence, pending-proposal and concurrent-edit behaviour still need design.
- **Chosen is not finished:** choosing videos prepares material for whole-scene review. Do not call the film finished merely because every Shot has a chosen version. Export remains an optional branch from Videos without requiring a dummy edit.

## Accessibility

**Section 13** · **Status:** Existing rules retained, with one recorded legacy gap; Editor layout checks are bounded, not full accessibility approval — proposed target WCAG 2.2 AA

| Pair | Ratio | Result |
| --- | --- | --- |
| `--color-text-primary` on `--color-bg-canvas` | 16.56 | Pass |
| `--color-text-secondary` on `--color-bg-canvas` | 8.33 | Pass |
| `--color-text-subtle` on canvas / sunken / surface | 5.83 / 5.67 / 6.13 | Pass |
| `--color-action-primary-text` on `--color-action-primary-bg` | 6.84 | Pass |
| `--color-text-link` on canvas / on `--color-bg-selected` | 6.34 / 5.45 | Pass |
| `--color-status-ready-text` on `--color-status-ready-bg` | 6.44 | Pass |
| `--color-media-on-scrim` on `--color-media-scrim` | 6.68 | Pass; darker over dark images |
| `--color-text-primary` on `--color-media-label` | 17.33 | Pass |
| `--color-text-disabled` on canvas | 2.52 | Disabled text only (exempt) |
| **`--color-border-input` on `--color-bg-surface` (chat box)** | **1.26** | **Below 3:1. Accepted gap**, your decision 2026-10-02 after a [side-by-side](brand-book/patterns.html#outline-compare) |
| `--color-border-strong` on canvas (chip outline) | 1.38 | Acceptable: chips are identified by text; × has a 24px hit area |

- **Focus:** every interactive control other than [text inputs](#shell-and-remaining-phase-2-feedback) needs a visible keyboard cue. Existing non-text controls retain the focus ring. The new single select, quiet action and Scene disclosure use a keyboard-only label underline (2px thick, 2px offset), not a ring; their text colors retain the existing contrast. This is a scoped material-component refinement, not a global removal of keyboard indication. Viewers and the picker trap focus, close on Escape and return focus to the opener.
- **Targets:** at least `--size-target-min` (24px).
- **Keyboard:** option rows, tiles, tabs and "Show" are reachable in reading order; lettered options can be chosen by typing the letter.
- **Announcements:** activity lines and the agent's message use a polite live region; questions are labelled groups; a changed-tab dot needs a text alternative ("Assets, updated").
- **Motion:** see [Motion](#motion). **Text size:** nothing below 11px; reflow at 200% zoom not yet checked.

## Screens and flows

**Section 14** · **Status:** Partial — existing flows retained; Editor entry/layout integrated, with incomplete states explicitly listed. Interaction decisions remain in [user-flows.md](user-flows.md). The separate [roadmap flow](#roadmap-project-workspace) below is future reference only and does not amend those flows or decisions.

### Flow 1: Create a video

A new user, with nothing saved yet, goes from a description to a chosen video version. The visuals are the approved generation/review screens, not proof of finished sound or final delivery.

| Step | Screen | What happens | Visual |
| --- | --- | --- | --- |
| 1 | Opening screen | The agent asks what you'd like to make | [flow1-step1-r64](flow1-step1-r64.html) |
| 2 | Describe and break down | The agent drafts the script, explains the next steps and asks questions | [flow1-step2-r83](flow1-step2-r83.html) |
| 3 | Characters and places | For each asset: upload photos, describe it, or have it designed | [flow1-step3-r84](flow1-step3-r84.html) |
| 4 | Choose Vale's look | The agent makes three looks; pick one or suggest changes | [flow1-step4-r85](flow1-step4-r85.html) |
| 5 | Approve the reference sheets | Review both sheets together | [flow1-step5-r86](flow1-step5-r86.html) |
| 6 | Plan the opening frame | Check what the image will show before it is made | [flow1-step6-r87](flow1-step6-r87.html) |
| 7 | Approve the opening frame | Check the image and its details, or ask for changes | [flow1-step7-r88](flow1-step7-r88.html) |
| 8 | Make the video | Check what the video will be before it is made | [flow1-step8-r89](flow1-step8-r89.html) |
| 9 | Choose a take | Watch the take, then choose it or ask for another | [flow1-step9-r90](flow1-step9-r90.html) |

### Flow 2: Create a scene

A new user, with nothing saved yet, asks for a short scene of three shots. The visuals are the approved screens.

| Step | Screen | What happens | Visual |
| --- | --- | --- | --- |
| 1 | Opening screen | The agent asks what you'd like to make | [flow2-step1-r73](flow2-step1-r73.html) |
| 2 | Describe the scene | The agent drafts the script with a shot breakdown, and asks questions | [flow2-step2-r74](flow2-step2-r74.html) |
| 3 | Characters, places and props | For each: upload photos, describe it, or have it designed | [flow2-step3-r75](flow2-step3-r75.html) |
| 4 | Choose the looks | Three looks for each described item; pick one | [flow2-step4-r76](flow2-step4-r76.html) |
| 5 | Approve the reference sheets | All sheets together | [flow2-step5-r77](flow2-step5-r77.html) |
| 6 | Plan the storyboard | Panels and camera per shot, in one approval | [flow2-step6-r78](flow2-step6-r78.html) |
| 7 | Approve the storyboard | Check the panels; edit in the board and regenerate | [flow2-step7-r79](flow2-step7-r79.html) |
| 8 | Make the videos | One video per shot, in one approval | [flow2-step8-r80](flow2-step8-r80.html) |
| 9 | Choose the takes | Play the scene in order; choose or redo a shot | [flow2-step9-r81](flow2-step9-r81.html) |
| 10 | Compare versions | A new version of shot 2; watch both in the scene and choose | [flow2-step10-r82](flow2-step10-r82.html) |

After version selection, continue to [Edit a scene](#edit-a-scene). The version-comparison player remains useful before that point; it is not the finishing workspace.

### Editor

**Partial design reference.** Entry and layout direction were reviewed; this integration awaits final inspection. [Visual section](brand-book/screens.html#editor) · [Interaction decisions](user-flows.md#edit-a-scene). One Narrative Scene only. Multi-scene editing is deferred for a separate discussion.

#### Edit a scene

Purpose: move from chosen shot versions to reviewing and refining the whole scene in the same conversation. This reference demonstrates entry, layout and navigation, not actual editing or rendering.

| Step / branch | User action and transition | Visual / state |
| --- | --- | --- |
| 1 · Current edit | See the snapshot and shot list in Videos | [Editor Videos](#editor-videos) |
| 2 · Open editor | Open the complete edit; work alongside the same conversation | [Editor workspace](#editor-workspace) |
| Optional · Reduce timeline height | Toggle Compact timeline; scroll the tracks | [Editor compact timeline](#editor-compact-timeline) |
| Optional · Hide track groups | Collapse Visual/Audio without changing the edit | [Editor collapsed groups](#editor-collapsed-groups) |
| Return | **← Videos** returns to the scene entry; this is navigation, not approval or export | [Videos](editor/index.html) |
| Export branch | Export directly from Videos; no mandatory edit or Editor visit | [Editor export settings](#editor-export-settings) — draft illustration |
| Continue editing / finish | Manual properties, agent proposals, apply/undo, whole-result review and completed-export verification | Open; no approved click-through yet |

#### Editor Videos

Visual: [entry](editor/index.html) · [book state](brand-book/screens.html#editor-videos).

Trigger: a first current edit has been prepared from chosen versions for this scene. The snapshot represents the complete edit; the three rows represent its Shots and their chosen video versions. Metadata is **3 shots · 13.4 s**. **Open editor** opens the full workspace; **Export** opens the draft settings example. Version history only reveals the earlier source version; it does not change the edit. Missing media, incomplete selection and source replacement are still open states. The reference shows a shortened conversation tail, not a second thread.

#### Editor workspace

Visual: [workspace](editor/editor.html) · [book state](brand-book/screens.html#editor-workspace).

Default: expanded timeline, both track groups open, Vale's recognition selected at the illustrative 8.80-second playhead. Entry is **Open editor**; exit is **← Videos**. Tools, transport, Send, Undo, Add track and Export are illustrative/disabled. This scaffolding does not mean a real export requires editing first. Selection-driven properties and the requested cut are not implemented or newly approved by this view.

#### Editor compact timeline

Visual: [compact state](assets/media-placeholder.svg) · [book state](brand-book/screens.html#editor-compact-timeline).

In the [workspace](editor/editor.html), check **Compact timeline**. The timeline becomes 300px high and the player gains room; conversation height stays unchanged. Scroll to lower tracks. Unchecking restores expanded height. The linked image shows this exact state; the HTML opens in its expanded default.

#### Editor collapsed groups

Visual: [collapsed state](assets/media-placeholder.svg) · [book state](brand-book/screens.html#editor-collapsed-groups).

Toggle the Visual or Audio summary in the [workspace](editor/editor.html); each group is independent and reopens through the same summary. The linked visual shows both closed. Collapsing does not remove media, approve sound, or change the timeline height. The checkbox separately controls compact height.

#### Editor export settings

Visual: [draft settings](editor/index.html#export) · [book state](brand-book/screens.html#editor-export-settings).

**Draft, not an approved delivery profile.** Reachable directly from Videos. MP4, source resolution, 24 fps, current mix and captions Off are illustrative values, not verified media properties or supported export options. Close/Back returns to Videos; Export MP4 is disabled. No file is generated. Codec/size validation, captions/audio choices, keyboard-modal behaviour, progress, cancellation, failure/retry and verified completion remain open. Do not treat the static dialog as an accessible production implementation.

#### Editor narrow layout

Visuals: [entry](assets/media-placeholder.svg), [workspace](assets/media-placeholder.svg) · [book state](brand-book/screens.html#editor-narrow-layout).

At ≤820px, the entry retains the existing chat-then-panel stack; the Editor stacks tools, player, timeline and conversation. The timeline scrolls horizontally rather than squeezing its labels below readable sizes. This is a responsive reference, not approval of touch trimming or a complete mobile editing workflow.

**Remaining coverage:** default and the variants above have visuals. Loading, empty/missing-media, error, validation, successful edit/application and successful export states are **not designed**, not N/A. Concrete edges still include mixed/missing audio, replacing a chosen source, pending agent proposals, manual/agent conflicts, leave/resume and long content. Older proposed/kept-edit comparisons are [history](history.md#editor-explorations), not current behaviour contracts.

### Design examples

Approved views of the board that are not steps in a flow: [the storyboard](storyboard-example-r31.html) with panels grouped by shot, and [editing it](storyboard-editing-r32.html) to regenerate one changed shot.

### Clickable demo

Flow 2 as a click-through, 18 screens: [1 Describe the scene](demo-01.html), [2 Answer the agent](demo-02.html), [3 Confirm the script](demo-03.html), [4 Describe the characters](demo-04.html), [5 Open the library](demo-05.html), [6 Choose Environment](demo-06.html), [7 Pick the art gallery](demo-07.html), [8 Send with the example](demo-08.html), [9 Pick Vale's look](demo-09.html), [10 Pick Mercer's look](demo-10.html), [11 Approve the sheets](demo-11.html), [12 Approve the storyboard plan](demo-12.html), [13 Approve the storyboard](demo-13.html), [14 Make the videos](demo-14.html), [15 Ask for another version](demo-15.html), [16 Make version 2](demo-16.html), [17 Choose version 2](demo-17.html), [18 Review the first edit](demo-18.html). The final screen now links to the Editor continuation rather than declaring the scene finished.

### Roadmap: Project workspace

**Roadmap reference — partial.** Accepted as a separate reference for future planning; not part of Flow 1/2 or the demo, and not a scheduled or approved application capability. Existing components, patterns and the single-scene Editor contract are not superseded by this example. [Human reference](brand-book/screens.html#roadmap-project-workspace) · [Open the standalone flow](roadmap/project-workspace/index.html).

Purpose: explore a Project destination with separate Scene conversations and material browsing, then open a complete Scene edit. The fixture is **The gallery film**, containing only **Vale and Mercer meet**: the existing complete Script, four Assets, three Shots, four Panels and a 13.4-second Scene snapshot. No new story or media was created. This one-Scene fixture does not establish multi-Scene composition or prove shared-Asset deduplication across Scenes.

| Step | Action / transition | Reference state |
| --- | --- | --- |
| 1 | Open the Project; Videos and All Scenes are the defaults | [Roadmap Project material](#roadmap-project-material) |
| 2 | Choose Storyboard, then filter to Vale and Mercer meet; the Project conversation remains | [Roadmap filtered material](#roadmap-filtered-material) |
| 3 | Choose the Scene in the sidebar, then Videos; this changes the conversation, not the story | [Roadmap Scene conversation](#roadmap-scene-conversation) |
| 4 | Choose **Editor →** to open all three Shots together | [Roadmap Scene Editor](#roadmap-scene-editor) |
| 5 | Choose **← Videos**; this copy returns to default Project/Videos, not restored Scene context | [Roadmap return to Videos](#roadmap-return-to-videos) |

The page's **Roadmap reference** link returns to the book. Native tabs, filtering, reset, disclosures, navigation and scrolling work; generation, playback, editing, Send, Undo, saved state and export processing do not. These native HTML/CSS techniques are reference mechanics, not an approved application architecture.

#### Roadmap Project material

[Open](roadmap/project-workspace/index.html) · [Visual](assets/media-placeholder.svg).

The Project name selects its conversation; the adjacent disclosure independently shows/hides the Scene list. Material tabs stay **Script · Assets · Storyboard · Videos**. In All Scenes, Script and Shot material expand by Scene; Assets are a library rather than repeated Scene groups. **Collapse all** resets Scene sections only, not nested Shot/history disclosures, the selected tab, filter or conversation. Asset inspection and source-version history do not select or approve material. The Project Videos snapshot has **Editor →** and Export, without a repeated film-summary caption.

Retained visual values for this roadmap copy: panel width **380px above 1100px**, **330px at 821–1100px**, stacked layout **at ≤820px**. Tabs have a **1px divider below them**; the dropdown has no lower divider. Filter padding is **12px vertically / 20px horizontally** (18px horizontally when stacked); Project material top padding is **4px**, giving the **16px** controls-to-material gap. Scene material top padding stays **18px**. Material controls and the Editor entry link use a **2px underline / 2px offset** for keyboard focus, without rings; this does not change older Editor controls or certify accessibility. Existing token values remain authoritative; the copied CSS is a rendering snapshot, not a new value source.

#### Roadmap filtered material

[Visual](assets/media-placeholder.svg). In the standalone page, choose Storyboard, then **01 · Vale and Mercer meet** in **Filter material by Scene**.

The selected Scene's material appears directly, without redundant Scene-group headings; the Project conversation stays visible. Switching among the four tabs likewise does not switch conversations. Return the filter to **All Scenes (1)** to restore grouped browsing. A focused Project Videos filter hides the snapshot; this copy does not invent a filtered-composition Editor entry. Full Scripts, Asset details, paired Panels and earlier video versions remain available, not reduced to summaries.

#### Roadmap Scene conversation

[Visual](assets/media-placeholder.svg). Choose **Vale and Mercer meet** in the sidebar, then Videos.

This switches to the distinct Scene conversation and hides the material filter. The snapshot represents all three Shots, **3 shots · 13.4 s**. Chosen video versions are **4.2 / 5.1 / 4.1 s**; the earlier **5.2 s** Vale version remains separate. Storyboard planning durations are approximate and do not replace video durations. The Project name returns to Project conversation; material inspection alone never does so.

#### Roadmap Scene Editor

[Open](roadmap/project-workspace/editor.html) · [Visual](assets/media-placeholder.svg).

**Editor →** opens the complete existing Scene, not an individual Shot. This separate copy reuses the existing [Editor layout](#editor-layout-and-timeline): tools left, player centre, full-height conversation right, timeline beneath tools/player only; Compact timeline, independent Visual/Audio disclosures and scrolling work. Seven lanes illustrate roles, not a required inventory; separate dialogue/ambience are fixture assumptions, while mixed sound remains **Original audio**. No editing or audio separation occurs.

Both the Project All Scenes entry and Scene entry open this same Scene reference. The Project route therefore does **not** demonstrate a film-level composition or continuity of the Project conversation into the Editor. Scope ownership, conversation routing and drill-in behavior require future design. Direct Export remains a valid independent product direction; its disabled button here is a reference limitation, not a requirement to edit first.

#### Roadmap return to Videos

[Destination](roadmap/project-workspace/index.html) · [Visual](assets/media-placeholder.svg).

**← Videos** loads this flow's default Project/Videos page. It does not restore originating Scene scope, filtering, expansion or scroll position, and is not evidence of save/resume. No approval, export, new thread or completed edit is produced by navigating back. This fixture limitation does not amend the existing same-conversation Editor direction.

**Outstanding roadmap work:** Project creation/membership/order and shared-Asset ownership; composition/source/placement identity, intercutting and linked updates; conversation routing and restoration; actual editing, proposals, undo/redo, conflicts and leave/resume; completed export. Loading, empty/missing-media, errors, validation and successful edit/export states are not designed for this flow. A fully populated many-Scene workspace, cross-browser behavior, comprehensive assistive technology and 200% text scaling remain unverified. No dates, implementation acceptance or roadmap priority are assigned here.

### Screen inventory

Each screen and state, with the components it uses. The separate roadmap inventory is the five state headings above; it does not extend the approved inventory below.

| Screen / state | Flow and condition | Visual | Components |
| --- | --- | --- | --- |
| Opening screen (empty) | Flow 1 or 2, step 1: a new user | [flow2-step1-r73](flow2-step1-r73.html) | App shell, chat box idle, panel empty states |
| Agent working | Demo screen 3: after the person sends | [demo-03](demo-03.html) | Activity lines running, chat box working, shimmer |
| Script drafted, question | Flow 2 step 2 | [flow2-step2-r74](flow2-step2-r74.html) | Agent message, question options, Script |
| Assets: describe or upload | Flow 2 step 3 | [flow2-step3-r75](flow2-step3-r75.html) | Item rows Empty and Draft, chat box with attachments |
| Choose a look | Flow 2 step 4 | [flow2-step4-r76](flow2-step4-r76.html) | Image picker, viewer |
| Approve sheets | Flow 2 step 5 | [flow2-step5-r77](flow2-step5-r77.html) | Sheet tiles, reference sheet |
| Plan approval | Flow 2 step 6 | [flow2-step6-r78](flow2-step6-r78.html) | Plan question, reference pills, planned panels |
| Storyboard review | Flow 2 step 7 | [flow2-step7-r79](flow2-step7-r79.html) | Storyboard shots with a flag, panel tiles |
| Board editing | Design example | [storyboard-editing-r32](storyboard-editing-r32.html) | Board, changed chip, Regenerate, edit record |
| Making videos | Flow 2 step 8 | [flow2-step8-r80](flow2-step8-r80.html) | Making… placeholders, video rows |
| Choose versions | Flow 2 step 9 | [flow2-step9-r81](flow2-step9-r81.html) | Video rows, scene player |
| Compare versions | Flow 2 step 10 | [flow2-step10-r82](flow2-step10-r82.html) | Version history, version switch |
| Question folded | Any question; press × | [flow2-step10-r82](flow2-step10-r82.html) (fold) | Folded pill |
| Library picker, Examples | Demo screens 5–7 | [library-picker-r92](library-picker-r92.html) | Library picker |
| Library picker, empty library | "Your library" for a new user | [library-picker-r92](library-picker-r92.html) (lib-yours) | Empty library |
| Narrow (≤ 820px) | Existing generation/review screens | Same pages at 390px | Stacked layout |
| Editor entry | Current edit prepared | [Editor Videos](#editor-videos) | Scene edit card, Shots, version history |
| Editor expanded | Open editor | [Editor workspace](#editor-workspace) | Tools, player, full-height conversation, timeline |
| Editor compact / collapsed | Native layout controls | [Compact](#editor-compact-timeline), [collapsed groups](#editor-collapsed-groups) | Checkbox, disclosure, scrolling |
| Export settings illustration | Export from Videos | [Draft settings](#editor-export-settings) | Static dialog; completion not designed |
| Editor narrow | ≤820px | [Narrow layouts](#editor-narrow-layout) | Stacked reference, horizontally scrolling tracks |

### Open states

These states have not been designed. They are listed so they are not mistaken for exemptions.

| Category | Status |
| --- | --- |
| Generation failed, provider error, timeout | **Not designed** |
| Network lost or reconnecting; a turn interrupted by Stop | **Not designed** |
| Cost, balance and spending limits | **Not designed.** Costs are hidden in the mockups by decision |
| Upload validation (wrong type, too large) | **Not designed** |
| Long content (10+ shots, long names, long dialogue) | **Not checked** |
| Library with many saved items; search results | **Not designed** |
| Editor manual properties, agent edit proposal/review, undo/redo | **Not designed** in the adopted layout; old examples are historical |
| Editor missing/mixed audio, source replacement, pending work, concurrency, leave/resume | **Not designed** |
| Export validation, progress, cancellation, recovery and verified completion | **Not designed**; settings are a draft illustration |
| Multi-scene editing | **Deferred by the user** for a separate discussion |

## Assets

**Section 15** · **Status:** Approved

| Asset | Path | Status |
| --- | --- | --- |
| Product name and mark | — | **Placeholder.** Deferred by you |
| Mercer & Vale stills, panels, sheets | `outputs/studio-mockup/r15`, `r44`, `r91-library` (git-ignored) | Local example media; not licensed for redistribution |
| Library stock examples | `outputs/studio-mockup/r92-library/stock/` (git-ignored) with `CREDITS.json` | CC0 or public domain, for the example only |
| Icons | Inline SVG paths in the pages | Hand-drawn strokes; no icon library chosen |
| Fonts | System fonts | None needed |
| Editor HTML/CSS | `editor/` | Tracked inert references; media processing and persistence absent |
| Editor screenshots | `outputs/brand-book/editor/` (git-ignored) | Rendered local evidence; contains the same unlicensed example media, not redistribution assets |
| Material-control reference CSS | `components/material-controls.css` | Design-only, scoped to `.product.material-controls`; values remain in this guide. Book image variant reuses existing local example media |
| Project workspace roadmap | `roadmap/project-workspace/` | Separate inert HTML/CSS copies; reused Editor styles and local Vale/Mercer JPEGs. No new media or application implementation |
| Roadmap screenshots | `outputs/brand-book/roadmap/project-workspace/` (git-ignored) | Local rendered reference only; same example media, not licensed for redistribution |

## Decisions

**Section 16** · **Status:** Approved

| Date | Stage / scope | Revision | Decision and response | Conditions |
| --- | --- | --- | --- | --- |
| 2026-10-28 | Library feedback | Story 2 `demo-05.html#lib-yours` two-line proposal | User explicitly approved 401, 501, loading, transport/error and missing-configuration feedback treatment | No banner/colors/recovery controls; no blanket session/proposal/export approval; see [Library feedback](#library-feedback) |
| Earlier | Flows and screens | Flow 1 r64/r83–r90, Flow 2 r73–r82, demo, picker r92 | Approved (D-77, D-80, D-85) | Reused as is |
| 2026-09-28 | Visual direction | `app-r11.css` light theme | Chosen (D-18): Venice light colours as reference, no Venice branding | |
| 2026-10-02 | Name and logo | — | Deferred | Working placeholders only |
| 2026-10-02 | Token location | — | "Only in design.md"; reconfirmed when adopting the new structure: "design.md should be the authoritative" | The trial's `design.tokens.json` was not adopted |
| 2026-10-02 | Font tokens | — | "What you've seen" | Georgia display, system UI text |
| 2026-10-02 | Tokens | r94 | Approved, "Approve, with tidy-ups" | The four tidy-ups in [Mockup differences](#mockup-differences) |
| 2026-10-02 | Components | r94 | Approved, "Approve components" | |
| 2026-10-02 | Chat-box outline | r94 comparison | "Keep as is, record the gap" | Darker and focus-only versions kept as rejected alternatives |
| 2026-10-02 | Final handoff | r94 | Accepted, "Accept the handoff" | |
| 2026-10-02 | Brand book restructure | 1.0 | **Adopted**: "This is the new brandbook structure i am going with" | Values unchanged; token names and section order changed; design.md stays the authority |
| 2026-10-15 | Editor entry/layout checkpoint | Videos snapshot and cleaned full-height-chat layout, now under `editor/` | Entry: “ok looks good”; the user liked the track layout and requested removal of the comparison banner and edit-status label | Single-scene reference only; unchanged foundations retained |
| 2026-10-15 | Brand-book integration | 1.1 | User agreed to the Editor subsection, connected flow, guide and demo update | Not approval of unseen editing/export/recovery states. Multi-scene discussion was deferred at this checkpoint; integrated revision still awaits final acceptance |
| 2026-10-16 | Material component checkpoint | Displayed temporary component study, integrated as 1.2 | “Use these components (Recommended)”, followed by “We just don't need the focus rings” | Adopt the single select, Scene disclosure and quiet action; reuse Asset/Shot/video families. Remove rings; the keyboard-only underline refinement and full Project preview remain for inspection. Keep 380px/330px panel widths and four tabs. No Project ownership/editing architecture or application implementation accepted |
| 2026-10-16 | Separate roadmap flow | 1.3 | “we can add this as a separate flow - i want this as a reference for our future roadmap”; “No need to incorporate it into existing approved flows and demo” | Add the current Vale/Mercer workspace → Scene Editor as future reference only. Do not change Flow 1/2, the existing Editor flow or demo. Earlier “ok look good for now” is provisional visual feedback, not application, architecture or accessibility acceptance |
| 2026-10-16 | Roadmap reference acceptance and delivery | 1.3 | “ok looks good. help me to push this” | Accept the displayed separate roadmap reference and authorize Git delivery of the accumulated design work. Not full Editor behavior, application, architecture or accessibility acceptance; keep media/screenshots local |

### Mockup differences

These are the places where `app-r11.css` (frozen) differs from the tokens. Implement the token, not the mockup value.

| Mockup | Token | Why |
| --- | --- | --- |
| Font stacks start with `"Inter","Aeonik"` and `"Canela Text","Canela"` | `--font-family-sans`, `--font-family-display` | Your 2026-10-02 decision: no licensed fonts |
| Library picker heading `16px` | `typography.title` 15px | Approved tidy-up: one modal-heading size |
| `10px` text (labels on thumbnails, "sent" tag, chip suffix) | `typography.micro` 11px | Approved tidy-up: 10px is too small to read |
| Radius `7px` and `5px` | `--radius-sm` 6px, `--radius-xs` 4px | Approved tidy-up: fewer radius steps |
| `--primary` `#125ca1` and `--link` `#125da3` differ by one step | Kept as `--color-blue-600` and `--color-blue-550` | They differ in the source theme. Merging them is a later choice |
| Chip remove button `20px` | 20px drawn, `--size-target-min` 24px hit area | Approved tidy-up |
| Demo-only classes (`.demo-bar`, `.demo-glow`, `.stream`) | None | Demo props, not product UI |
| Old token names (`--bg`, `--fg`, `--primary`…) | New names; the old ones are in the "Was" column of each token table | Restructure; values unchanged |

## Verification

**Section 17** · **Status:** Roadmap artifact checks passed and the displayed separate reference accepted, 2026-10-16. Earlier component/Editor evidence is retained below. This is a partial design handoff, not a completed editor or application implementation.

**Current 1.3 checkpoint:** separate Project workspace roadmap flow only. Application functional/regression tests are **N/A** because no application or runtime skill changed. Native reference behavior, visual regression and editorial consistency were checked separately; no persistent prose tests were added.

| Criterion | Result / evidence | Limits |
| --- | --- | --- |
| Paired references and safety | **PASS:** canonical book check, 64 paired anchors; local reference HTML/CSS and nine existing JPEG dependencies inspected. The native select/option/selectedcontent and reset-only form require the same explicit syntax supplement as the earlier preview; all other diagnostics pass | Not an unqualified zero-diagnostic result for the native-control page; no checker changed |
| Isolation and preservation | **PASS:** compared with the working-tree snapshot immediately before this addition. All existing Flow 1/2, demo, Editor, user-flow, flow-index and history files unchanged; their book flow markup unchanged. Original Vale/Mercer and three-Scene previews preserved. Both frozen styles and all 150 token rows unchanged | Earlier uncommitted work is preserved; this does not claim the checkout matches HEAD |
| Native flow and responsive layout | **PASS:** 12 scope/filter-tab states at each of 1440×900, 1100×800, 390×844, 821×800, 820×800 and 1024×600. Separate conversations, native filtering, reset/disclosures, Asset inspection/history, both Editor entries and default Project/Videos return checked; panel widths, 16px gap, dividers and actual Tab/Enter underline checked | No editing, generation, playback, export processing or state restoration; no new creative approval |
| Editor reuse | **PASS:** three picture clips, seven lanes, 13.4-second duration, disabled editing controls, Compact timeline and independent groups checked. The new Editor's viewport pixels match the original working preview at desktop, medium and narrow sizes | Layout reuse only; not film-level composition or proof of Project-conversation continuity |
| Human reference | **PASS:** all seven book pages rendered at 1440×1000 and 390×844; six new flow/state anchors reachable at 1440, 1100, 821 and 390px. Current roadmap, Home and representative Foundations/Components visuals inspected against the retained shell and template references; no broken images or horizontal page overflow | Main-agent visual judgment is subjective/model-assisted. Cross-browser, comprehensive assistive technology, 200% text scaling, real user testing and a populated many-Scene workspace remain unverified |
| Scope and acceptance | **Separate roadmap reference accepted:** “ok looks good. help me to push this”. The roadmap addition does not change or supersede existing approved flows/demo | No roadmap priority, delivery commitment, full design acceptance or application implementation implied |

Renderer: **HeadlessChrome 148.0.7778.96**, existing harness render command and Chromium/CDP helpers, fresh unauthenticated profiles, scripts disabled, reduced motion and project-local resource interception. No external requests, new media processing or uploads; owned browsers closed. Evidence is git-ignored under `outputs/brand-book/roadmap/project-workspace/`: [Project](assets/media-placeholder.svg), [filtered material](assets/media-placeholder.svg), [Scene](assets/media-placeholder.svg), [Editor](assets/media-placeholder.svg), [narrow Scene](assets/media-placeholder.svg), [narrow Editor](assets/media-placeholder.svg), [book flow](assets/media-placeholder.svg) and [narrow book flow](assets/media-placeholder.svg). Example media is local-only and not licensed for redistribution; a fresh checkout without it will not have the photographic references.

The baseline structure command below also checks this addition. Reproduce its default screenshots with the existing renderer:

```sh
HARNESS_ROOT="$(node -e 'const fs=require("node:fs"),p=require("node:path");console.log(p.dirname(fs.realpathSync(p.join(process.env.HOME,".pi/agent/AGENTS.md"))))')"
node "$HARNESS_ROOT/scripts/design-render-screens.mjs" --project . \
  --out outputs/brand-book/roadmap/project-workspace/desktop --width 1440 --height 900 --scale 1 \
  docs/design/roadmap/project-workspace/index.html docs/design/roadmap/project-workspace/editor.html
```

For the captured filter state, open the standalone flow, choose Storyboard and **01 · Vale and Mercer meet**. For the Scene state, choose the Scene in the sidebar and then Videos. The concrete pass conditions are unchanged Project conversation during filtering, distinct Scene conversation after sidebar selection, complete material, and Editor/back navigation confined to the roadmap copy.

**Retained 1.2 checkpoint:** new select/disclosure/quiet-action specifications and visual examples, plus a temporary populated Project preview. Component direction accepted; focus rings removed by explicit request. Application functional/regression testing is **N/A** because no application or runtime skill changed. Native reference behavior and visual regression were verified separately:

| Criterion | Result / evidence | Limits |
| --- | --- | --- |
| Paired references and exact values | **PASS:** canonical book check, 58 paired anchors; 150 authoritative token rows unchanged; both frozen stylesheets byte-identical | Component rules are new; no token file or application dependency introduced |
| Native Project reference | **PASS:** 28 scope/filter-tab combinations at 1440×900, 1100×800 and 390×844; focused checks at 821×800 and 1024×600. Original 380px/330px panel geometry, separate conversations, filtering, independent expansion/reset, shared-Asset inspection, paired Panels and version history checked | Static reference, not editing, generation, playback, export or persistence |
| Preservation | **PASS:** all three complete Script bodies and conversation markup byte-identical to the previous narrow-panel example; 8 Assets, 9 Shots and 10 Panels preserved; no Wide view | Illustrations and choices remain fictional; no creative approval implied |
| Keyboard and density | **PASS:** pointer selection, actual Tab navigation, native selection/Escape, 20-name selector and long labels; material controls have no focus outline. Rendered closeups confirm the keyboard underline is visible at 2px offset; the 4px trial was clipped by the truncated label and was corrected | The 20-name selector is not a complete 20-Scene content test. Cross-browser behavior, full assistive-technology coverage and 200% text scaling remain unverified |
| Inertness | **PASS with explicit native-syntax supplement:** reviewed select/option/selectedcontent and the reset-only form, which the conservative markup checker does not recognize. All other diagnostics and CSS checks pass; scripts disabled, no submissions or remote requests; no checker changed | This is not an unqualified zero-diagnostic result for the temporary native-control pages. The canonical book uses supported static select specimens and native disclosures |
| Human reference | **PASS:** all seven book pages rendered at 1440×1000 and 390×844; new component specimens inspected alongside the existing shell and canonical template references; 13px/34px select values verified in the browser; no missing images or page-level horizontal overflow | Main-agent visual inspection is subjective/model-assisted, not user testing or aesthetic certification |
| Acceptance | **Pending:** full refined preview and the no-ring keyboard-cue refinement remain for inspection | Component approval does not settle Project membership/composition semantics or unfinished Editor behavior |

Renderer: **HeadlessChrome 148.0.7778.96**, existing Chromium/CDP helpers, fresh unauthenticated profiles, reduced motion, scripts disabled and local-resource interception. Owned browsers closed. Current book screenshots are under `outputs/brand-book/material-controls/` (git-ignored): [select](assets/media-placeholder.svg), [narrow select](assets/media-placeholder.svg), [Scene disclosure](assets/media-placeholder.svg), and [narrow Home](assets/media-placeholder.svg). Temporary preview files and diagnostic log locations remain in the conversation, not permanent repository dependencies.

**Retained 1.1 evidence (2026-10-15):** the checks below apply to the unchanged Editor integration and its original screenshots, not to the new material-component views.

Checkpoint: revision **1.1**, working-tree integration over `0de939f`. Scope is the two references, tracked `editor/` HTML/CSS, demo continuation, local screenshots and retained alternatives. Application functional/regression tests are **N/A**: no application or runtime skill changed. Native reference behaviour and visual regression were checked separately below; no persistent prose-presence tests were added.

| Criterion | Evidence / result | Limits |
| --- | --- | --- |
| Paired references and links | **PASS:** canonical structure plus scoped artifact verification; 56 paired anchors, all linked local files present, no missing optional-media exemption needed in this checkout | Other checkouts need the ignored example media; section presence is not proof of agent obedience |
| Existing values and approvals preserved | **PASS:** all 150 token-declaration rows unchanged from HEAD; `app-r11.css` and `brand-book/book.css` byte-for-byte unchanged | New Editor geometry is separately specified above; no token file adopted |
| Inertness and resource boundaries | **PASS:** inspected changed book/guide/flow references, Editor HTML/CSS, demo ending and their loaded assets before rendering; restrictive CSP, no scripts/handlers/remote resources | Existing external citation links were not visited |
| Editor default and variants | **PASS:** 1440×900, 1100×800 and 390×844. Expanded timeline 480/380/480px; compact 300px; full-height desktop conversation preserved. Mouse/Space checkbox, mouse/Enter group disclosures, independent groups, scrolling and sticky labels/ruler checked | Tools, playback, Send, Undo, Add track and workspace Export remain disabled; no editing or media correctness claim |
| Entry, return and direct export | **PASS:** Videos → Editor → Videos, source-history disclosure, direct Export and Close/Back navigation; demo continuation exercised at desktop/narrow. Dialog fits the viewport; hidden background is not keyboard-reachable; relevant active targets ≥24px | No render/download. Escape, production focus management and complete modal accessibility remain undesigned |
| Responsive edges | **PASS:** 820px stacks; 821px retains desktop layout; 1024×600 uses the specified 636px minimum workspace. No page-level horizontal overflow or broken images in exercised views | Not touch-editing, long-content, screen-reader or 200% text-scaling certification |
| Visual regression | **PASS:** promoted Editor viewport screenshots are pixel-identical to the reviewed `outputs/editor-flow-preview/editor-tracks.html` at all three primary sizes. Earlier comparison files remain unchanged | Entry reference chrome is relabelled for the book; demo ending intentionally changes |
| Human book | **PASS:** all seven pages rendered at 1440×1000 and 390×844; new state anchors visible below the header at 1440, 1100, 821 and 390px; no broken images, horizontal overflow or external requests | Main-agent visual inspection is subjective/model-assisted, not user testing |
| Editorial reconciliation | **PASS:** shared inventory, terms, status, source-versus-edit distinction and direct-export branch agree; demo no longer declares selection to be finishing | Detailed edit/recovery/export states remain explicitly open; multi-scene deferred |
| Final acceptance | **Pending:** inspect the [Editor section](brand-book/screens.html#editor) and this guide | Integration authorization does not approve unseen behaviour |

The integration also restores the existing missing screen-inventory book anchor and makes three repeated sheet-image IDs unique in the touched demo ending, so the affected artifacts pass current checks. Unchanged older pages retain their separately recorded limitations.

Renderer: existing harness `design-render-screens.mjs` and its Chromium/CDP helpers; **HeadlessChrome 148.0.7778.96**, fresh unauthenticated profiles, page scripts disabled, reduced motion and project-local request interception. Owned browsers/profiles closed after checks. The 1.0 browser version below is historical, not the current runner.

Screenshot evidence (git-ignored, local only): [entry](assets/media-placeholder.svg), [workspace](assets/media-placeholder.svg), [compact](assets/media-placeholder.svg), [collapsed](assets/media-placeholder.svg), [narrow entry](assets/media-placeholder.svg), [narrow workspace](assets/media-placeholder.svg), [narrow export settings](assets/media-placeholder.svg), [book section](assets/media-placeholder.svg), [narrow book section](assets/media-placeholder.svg), and the refreshed [demo ending](assets/media-placeholder.svg). Medium/default and remaining book-page captures are alongside these under `outputs/brand-book/editor/`.

Reproduce the baseline structure/default-render commands from the repository root (the explicit value-authority flag preserves this project's no-token-file decision):

```sh
HARNESS_ROOT="$(node -e 'const fs=require("node:fs"),p=require("node:path");console.log(p.dirname(fs.realpathSync(p.join(process.env.HOME,".pi/agent/AGENTS.md"))))')"
node "$HARNESS_ROOT/scripts/design-brand-book-check.mjs" . \
  --value-authority docs/design/design.md --local-root CONTEXT.md --local-root outputs
node "$HARNESS_ROOT/scripts/design-render-screens.mjs" --project . \
  --out outputs/brand-book/editor/desktop --width 1440 --height 900 --scale 1 \
  docs/design/editor/index.html docs/design/editor/editor.html
```

The canonical structure command deliberately does not compare values when an existing authority is selected; token preservation was checked separately. Native-state and extended link/resource checks used temporary drivers around the same existing helpers, not a new project test suite. Initial check assumptions were corrected (explicitly bound companion-document roots, Enter character input, overflow only when content exceeds its viewport, and viewport-relative capture of the scrolled export dialog); final runs passed. No application tests, provider calls, media processing or uploads occurred.

**Earlier 1.0 evidence (2026-10-02):**

| Criterion | Evidence | Result | Limits |
| --- | --- | --- | --- |
| All 17 sections on their book pages and in this guide, plus 23 components and 5 subsections | Harness design-artifact verifier, 45 anchors (run in the trial worktree) | **PASS.** No missing or unreachable anchor | |
| Same page navigation on the home page and all six pages | Harness verifier `navigation` expectation (trial worktree) | **PASS** | |
| `brand-book/book.css` matches this guide | Script comparison of all 150 CSS values with the token tables here, aliases resolved | **PASS.** 150 of 150 match; none missing on either side | Composite typography rows checked by eye |
| No value changed from r94 | Every r94 colour compared with the new token of the same old name; earlier full comparison in the trial | **PASS.** 26 of 26 colours identical; 78 rows identical and 28 equivalent in a new form (composites, `1s` → `1000ms`, `ease-out` → its cubic-bezier); `--radius-round` and `--selected-ring` became rules | |
| Links, anchors and images | Every link and image in the 7 book pages, this guide, `history.md`, `navigation-options.md` and `study-r04.html` (both removed 2026-10-04) | **PASS.** 0 broken | The trial's r04 study links were repointed to `history.md` |
| Inert markup | Source check: CSP on every page; no scripts, event handlers, frames, forms or remote loads in the pages or `book.css` | **PASS** | `flow2-step5-r77.html` has 3 duplicate ids (pre-existing, unchanged) |
| Brand book renders | Chrome 154 through Playwright, JS disabled, remote requests blocked, 1440 × 1000 and 390 × 844; full-page screenshots in ignored `outputs/brand-book-r95/evidence/` | **PASS.** 0 broken images, 0 horizontal overflow, 0 remote requests on all 7 pages | Images come from the git-ignored `outputs/` folder |
| Approved pages unchanged | `git diff` on `app-r11.css`, every `flow*` and `demo-*` page, the picker, the flows page and user-flows.md | **PASS.** No changes | |
| Application behaviour | — | **N/A.** No application code | |
| Your acceptance of the restructure | "This is the new brandbook structure i am going with", with design.md as the authority | **Accepted**, 2026-10-02 | |
