# Native conversation navigation qualification

Scope: Sprint 004 owned create/list/thread/history reads only, following the approved [navigation/history design](design/design.md#owned-conversation-navigation-and-history). This is implementation/qualification documentation, not acceptance, a planning update or permission to enable native turns. Browser Send, tools, administration and workflows remain unavailable.

## Runtime and wire boundary

`apps/api/src/mastra/native-navigation.ts` adds only these entries to the existing pre-Mastra catalog:

| Method / native path | Supported native operation |
| --- | --- |
| `POST /memory/threads` | `MemoryStorage.saveThread`, fresh server UUID, verified account as resource identity |
| `GET /memory/threads` | `MemoryStorage.listThreads`, verified resource filter |
| `GET /memory/threads/:threadId` | Foundation `checkOwnedConversation`, then scoped `getThreadById` |
| `GET /memory/threads/:threadId/messages` | Same ownership collaborator, then resource/thread-scoped `listMessages` |

There is still one Mastra instance/listener, one native store and no Agent/model or application table. Authentication, CORS and bounded intake run before these handlers. Caller `resourceId` is only an equality precondition against online-verified identity, never ownership authority; create requires it to prevent an old UI intent from creating under a newer token. Other create fields, owner claims, filters, cursors, request contexts and duplicate/unknown query keys are rejected. Reads never change native timestamps, messages, approvals or execution state. Foreign/absent references return identical safe 404 envelopes.

The native route names and response shapes are retained. These paths intentionally have no `/api` prefix: the official adapter rejects custom adapters inside its reserved native prefix. Generic `/api` and unqualified native routes remain closed. The supported built-in create handler requires an Agent, so navigation uses the already qualified public native storage interface instead of enabling an Agent or inventing a conversation store/protocol. Public native read handlers were exercised through a separately built isolated composition before parser implementation; their unsupported no-Agent create result was retained, not called a success.

Limits: page index 0–1000, per-page 1–50; defaults six threads / twenty messages; descending native `createdAt` order. Native offset pages are not advertised as a snapshot across concurrent insertions. The existing 1 MiB/two-second intake is unchanged. Adapter settlement is bounded at eight seconds; the existing restricted pool also bounds connection acquisition and SQL execution. A timed-out write is uncertain and may still commit: it is never described as cancelled/no-write or retried. Responses are capped at 1 MiB and marked no-store. Only supported user/assistant format-2 text is exposed; system/tool/unsupported history fails closed into the existing load-failure state. Private metadata/provider fields are not browser state. No native schema is patched.

## Observed native shapes

Core/server 1.79.0, pg 1.32.0, and official client-js **1.56.0** were exercised with real isolated Auth, built serving entry and native PostgreSQL. Credentials and reset data were not collected. Before parser work, native thread/list/history HTTP observations were saved locally in `/tmp/workprint-sprint-004/owned-conversations/native-observed.json`. IDs were replaced with noncredential labels; the original reserved-prefix setup failure and no-Agent create rejection remain in the evidence.

Observed thread JSON:

```json
{"id":"<thread>","resourceId":"<verified-account>","title":"Synthetic test conversation","metadata":{},"createdAt":"2026-10-30T15:38:49.255Z","updatedAt":"2026-10-30T15:38:49.260Z"}
```

Observed list: `{threads, total, page, perPage, hasMore}`. Observed history: `{messages, total, page, perPage, hasMore, uiMessages:null}`; each message has native `id`, `threadId`, `resourceId`, `role`, ISO `createdAt`, and `content:{format:2,parts:[{type:"text",text:string}]}`. The production adapter's successful create was subsequently observed as HTTP 200 with empty title, metadata `{}` and the same native identity/timestamp fields. `native-navigation.test.ts` emits sanitized structural observations from actual responses; it never logs credentials or private native metadata.

## Client and dependency choice

`packages/api-client/src/native.ts` uses official `MastraClient` read methods with `apiPrefix:''` and **zero retries**, and reuses published native DTOs. Create uses the same native wire shape through the supported storage-backed adapter. Its transport supplies the existing account token callback, omits cookies, refuses redirects, caps response bytes, validates scope/IDs/page/content and bounds the whole operation including token acquisition. Caller cancellation settles without waiting for a suspended token callback. Error envelopes must match HTTP status; malformed/oversized/mismatched responses cannot become definite no-write create rejections. Neither this client nor the SDK may retry create. The inward `response.ts` helper shares only 1 MiB bounded stream accumulation, JSON decoding and status-matched error envelopes with the application transport. Authentication, deadlines/cancellation, SDK calls, request construction and each protocol’s response guards remain in their respective callers; error presentation stays caller-specific.

The exact client-js 1.56.0 dependency avoids copying a native client/protocol/type catalog. It resolves to the existing core 1.79.0/schema-compat 1.3.16 cohort; the additional transitive package is canonicalize 1.0.8. Shared application transport types move unchanged into an inward `types.ts` module to keep native/index composition acyclic; the public exports are preserved. Audit after installation remains **NON-PASS only for approved B-004** (`GHSA-rmxm-3fg6-px4f`, moderate `@hono/node-server`); it is not a clean audit or deployment qualification.

## Independent visual references

The test-only `apps/web/test/navigation-reference/` freezes all 29 independently authored approved views. Verification never reads ignored previews or derives expected markup/CSS from the consumer. `scripts/browser/navigation-reference.ts` supplies only fictional content and composes tracked references. Main surfaces cover 1440/390/820/821; every representative state covers 1440/390. Comparisons are full-context, zero tolerance, with paired geometry and source hashes.

Two explicit compositions reconcile exploratory artifacts with the binding guide: Session states preserve the earlier approved Auth notice colour/action inset rather than changing Auth to a generic modal; desktop long-title grid tracks are constrained so the required ellipsis works (the unconstrained exploratory track was about 691px inside a 235px sidebar). Frozen files remain unchanged. These are guide-based reference corrections, not masks, weakened assertions or acceptance of current screenshots. Original failures remain recorded. Human ratification and independent review remain separate.

## Completion qualification details

The obsolete isolated Open conversation action and four visual cases are retired, not the workspace/Library admission or unavailable Send checks. Replacement coverage exercises actual owned native navigation/history and the 70 independent reference pairs above.

Additional isolated checks cover built-browser creation, successful SDK refresh/reconnect without native replay, revoked refresh clearing native presentation, and held actual create/list/history responses across standard account switches. Native history exceeding the response cap fails safely. A real system-only fixture exposed native normalization returning no messages with total 1; incomplete native pages now fail closed instead of claiming empty history or a complete boundary. No private system content is projected.

Keyboard/focus/full labels and long-title containment run at all four main widths with reduced motion. Reflow qualification uses half-width effective CSS viewports and an additional 200% CSS zoom at 390. CSS zoom alone does not update media queries: an initial 821px experiment overflowed the unchanged desktop columns and remains recorded as a non-pass, not browser-zoom evidence. Native browser zoom and comprehensive assistive-technology certification are not claimed. The narrow experiment independently exposed and corrected intrinsic grid overflow in Navigation without changing normal-width reference output.

## Navigation presentation corrections

Recents row activation explicitly dismisses the narrow Navigation surface even when the selected native ID is unchanged; read completion then restores heading focus without resetting the same-conversation draft. Earlier-history insertion uses a React precommit scroll snapshot, so user scrolling while the response is pending is retained on desktop and narrow document scrolling. An uninterrupted viewport also retains the original anchor across the loading-control height change. Intervening scroller/document scroll or viewport resize discards that cached baseline even when the final coordinates return to their starting values; those listeners are removed when history unmounts. Neither path creates or sends native work or introduces automatic focus movement during pagination.

Pagination compensation uses the history element’s own height delta, including its loading-control baseline, not the entire document’s height delta. The mobile workspace below history can settle independently: a real held-response experiment changed its height from 249.5px to 151px, reducing document height by 99px while history height and the visible anchor stayed unchanged. The old document-wide compensation then moved that anchor by 99px on prepend. Real-response barriers reproduce that product bug deterministically (not a measurement race); before/after-settlement and desktop controls retain their anchors. The corrected local delta excludes unrelated panel reflow. Stationary, in-flight user scroll, scroll/resize-away-return and listener cleanup checks remain unchanged; no CSS/design, tolerance, retry, mask or reference-baseline adjustment is involved.

## Verification and remaining delivery

Automated production-entry checks use isolated Auth/Postgres and the supported `createNativeConversation` helper for preexisting messages. They cover real native create/pagination, exact message identity/text/order, two-account/forged-scope denial, foreign/absent equivalence, no-effect reads and closed generic mutations. Browser checks drive the actual app and native client with exact network allowances, more than one page of explicit creates, keyboard/page focus, reload, earlier-history anchoring, honest empty/error/unknown outcomes, and held real success/failure responses across newer selections/accounts. Public-factory delegation observes promise settlement without exporting credentials or adding production test hooks.

Evidence is local under `/tmp/workprint-sprint-004/owned-conversations/`. Initial route/UI functional failures, client transport failures, the corrected focus race, setup/compile/modularity failures and subsequent passing targets are retained separately. Targeted verification is not the full clean committed-head suite, independent review or human acceptance. The fake-entry coverage migration is complete. Clean tracked-export smoke verification follows `OwnedShell` into `Shell` and checks that navigation-only test mounts/references are absent from built serving/artifacts. The PR/current-revision evidence records the complete regression/visual/privacy/ingress sequence; independent review and acceptance remain orchestrator-owned.
