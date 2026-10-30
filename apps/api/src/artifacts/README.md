# Saved-work domain

`store.ts` owns reads and controlled prerequisite insertion; `writers.ts` owns command effects, and `publication.ts` shares transaction-local version/dependency publication SQL. It receives a pool and the trusted native owned-conversation collaborator; it does not import native storage, the agent or backend bootstrap. Every version's origin conversation and every current-use conversation is checked against the supplied account. A missing or foreign resource has the same public failure. Supported isolated test setup calls the same domain entry points, never a seed route.

Versions and dependency edges are immutable, with owner-composite foreign keys and distinct revisions. Conversation uses are separate from Library membership: an approved use pins its exact version, while a newer saved version can remain in Library without replacing it. Unavailable producers are not synthesized; selection revision starts at zero. The current persistence boundary supports text/planning only; media publication and built-in catalog reuse belong to their later owners. Composition registers the human save capability for existing text/planning records. Exact-use commands and agent producers remain unavailable.

`content.ts` validates closed, schema-versioned content before insertion and before public projection. Shared pure shapes in `packages/contracts/src/saved-content.ts` let consumers read supported fields without interpreting arbitrary JSON. The existing operation inventory and version DTOs are unchanged.

## Existing-record command writes

`createArtifactWriters()` returns separate immutable human and assistant capabilities. Composition supplies only the human capability to authenticated `saveVersion`; a future assistant binding receives only the draft capability. Producer/approval flags are not request fields. Both writers authorize the current conversation, base origin and exact dependencies through the trusted collaborator before entering SQL. Initial authoring/import is unsupported: artifact and expected latest base are required.

Human saves preserve existing structured fields, order, stable identities and exact dependencies while changing text only. An intended use must be the exact existing use of that artifact in the conversation. Its origin is authorized before SQL, and its identity/version are rechecked under lock. Ambiguous matching reference bindings fail closed rather than choosing an arbitrary use. Planning promotion also preserves the currently used plan's structure/dependencies, so a text save cannot approve an intervening reordered assistant draft and bypass later selection-revision rules. Assistant drafts never move uses or record human changes. Saves without intended use do not invent decisions.

A short transaction serializes the trusted owner/conversation/command/operation identity, rechecks a canonical payload hash, checks the latest artifact base and commits publication, immutable version/dependencies, optional exact approved use, immutable result and manual-change journal together. Identical retries return that original result without reapplying use effects, even after later decisions. Conflicting payload reuse is invalid. The journal retains the edited base and previous exact use version separately; reads do not consume changes. No native turn, provider call, native wait or external collaborator runs inside SQL.

## Authorized source adaptation

Lou authorized read-only access on 2026-10-29 to the following paths in the private `ephemra-dev/animation-studio` checkout, pinned at `8b59608ae6e22d509bd09afb883d1a0ea792c79b`:

- `.pi/skills/create-scene-script/SKILL.md`
- `.pi/skills/create-scene-script/references/scene-script-schema.md`
- `.pi/skills/create-scene-script/scripts/validate_scene_script.py`
- `.pi/skills/create-storyboard/SKILL.md`
- `.pi/skills/create-storyboard/references/reference-package-schema.md`
- `.pi/skills/create-storyboard/references/storyboard-schema.md`
- `.pi/skills/create-storyboard/references/panel-generation-strategy.md`
- `.pi/skills/create-storyboard/scripts/validate-reference-package.mjs`

Only the rules were studied; no source runtime, helper, fixture or test was imported or executed. No original source text is included here. The hosted tests use independently authored synthetic content.

Adapted rules in this read foundation:

- Script events retain their sequence and distinguish observable action from spoken text. Character names are distinct. Ordinary/off-screen dialogue requires a present speaker, while voice-over can name someone absent. Unknown fields and camera/planning data do not belong in Script content.
- References have a supported subject kind, descriptive identity and explicit continuity information. Images refer to exact owned versions rather than local files or remote URLs. A text-only draft is valid before any image exists; it is not a completed visual package or proof of human approval.
- Text planning preserves stable Shot/Storyboard Panel identities, distinct sibling ordering and exact source/reference versions. No image path, generated candidate, approval, duration or producer success is inferred from a text plan.

Intentional hosted differences: JSON replaces local document/file workflows; content carries `schemaVersion: 1`; one Narrative Scene is supported in a Script for the current single-scene scope. Human decisions are stored outside creative content. The read foundation permits incomplete textual visual references/plans because their producers, visual verification and planning authority are not enabled here. Complete reference-role/coverage/anchor-lineage eligibility and edits are later planning/media work; this module does not claim that an incomplete text plan can authorize generation. Workprint's spec, contracts and CONTEXT vocabulary take precedence over the original file-based workflow.

## Bounds and cursors

Content is at most 256 KiB; declarations additionally bound events, names, Shots, Panels and exact dependencies. Pages default to 20, with the existing contract's 1–100 range, but their serialized UTF-8 JSON also stays within 1 MiB. A byte-limited page's cursor follows the last emitted item, never the first omitted item. The shared transport keeps its 1 MiB bound for other operations/errors; successful workspace reads alone have an explicit 64 MiB aggregate budget. Workspace retains its existing 100-use bound, enough room for every valid full-content use, dependency/use metadata and the duplicated storyboard projection; the server checks the final serialized aggregate as well. Large valid records remain available through all three read surfaces and exact-version reads.

History freezes its maximum revision. Library freezes an internal per-owner publication revision, not wall-clock visibility. A writer increments `publication_counters` and inserts its version in one bounded transaction. The first page reads that owner row FOR SHARE: it waits for an already publishing transaction and fences later writers until the page's SQL completes. Continuations select the latest version per artifact at that publication revision, so delayed commits and clock adjustments cannot change membership. Existing immutable versions receive publication zero through additive DDL, without changing content. This metadata is unrelated to conversation selection revision or approval. Exact microsecond timestamps remain immutable ordering keys only.

Cursors are signed with a process-local random key and bind account, operation, resource/filter and page size. They are bounded and reject tampering or scope changes. Restart invalidates old cursors explicitly; the consumer must begin a new read rather than silently reusing a cursor. No application cursor secret or private database field is added to a browser contract.

Database transaction mechanics live in `db/transaction.ts`: 3-second statements, 1-second idle-in-transaction timeout and an 8-second wall deadline which destroys the checked-out connection and rolls back its open transaction. Native/provider calls stay outside the transaction. The serving pool is supplied by composition and remains bounded there. Application-role validation includes ownership and database/application-schema CREATE privileges for every SET-reachable role, not only immediately inherited grants.
