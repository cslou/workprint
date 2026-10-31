# Native queue, observation and exact execution control

This developer transport keeps normal inference and browser Send disabled. It uses the existing Mastra/native Postgres/listener and official SDK; no application turn/status ledger, conversation store, scheduler, native schema/vendor patch or live provider is introduced. Synthetic provider usage is not usage qualification.

## Identities and outcomes

A send/queue receipt has two distinct native identities: execution `runId` and accepted input signal/message ID. Assistant identity comes from the native start/terminal parts and matches authoritative native message reload. Neither a signal ID nor the latest message/thread is an execution-ID substitute.

Native `queueMessage` supplies queueing and execution IDs. The adapter does not schedule or reorder it. Concurrent HTTP submission order is not an ordering authority; verify actual native observation and persisted message IDs. Tests enqueue during a held native execution, then verify every accepted native input exactly once in native observed order.

Stop uses native `abortThread({threadId, resourceId, expectedRunId, clearPendingSignals:false})`. The expected execution ID is mandatory in pre-native admission. Native's conditional operation, not a get-current-then-thread-abort sequence, fences repeated/delayed old Stop from a successor. Caller resource is only an equality precondition; the verified account and foundation owned-conversation check remain authoritative. Stop never clears independently queued inputs.

`abortRequested` reports the actual native acknowledgment, **not** proven cancellation. A timed-out/cancelled Stop transport has uncertain server effect and is never retried automatically. Actual native `abort` (thread parts) or `finish.data.stepResult.reason === 'abort'` (exact-run SDK events) distinguishes observed interruption. Completion requires native stop plus the exact start/terminal assistant message ID; EOF, request acknowledgment and client flags do not establish it.

Native interruption can leave an assistant text-only partial record with model/provider metadata and no durable interruption marker. No record is rewritten or repaired. An observed interruption is not a saved-completion acknowledgment, and an ordinary saved text row alone does not prove completion. Missing native status is unavailable/unknown, never reconstructed from text, chronology or another message.

## Public API-client boundary

- `native.sendText(scopeAndText)` retains its qualified behavior and bounds.
- `native.queueText(scopeAndText)` uses official `queueMessage`, returning distinct native execution/input IDs.
- `native.subscribe(scope)` uses official thread observation; `consumeTurn(actualRunId,onText)` can wait for identified queued/active work and returns an explicit observed complete/interrupted outcome. Legacy `consume` continues to return success only for completion.
- `native.observeTurn({runId})` explicitly reconnects through official `observe` and its decoder. It does not resend input or start/recover work. Full native replay only is qualified; arbitrary offsets/overrides are not admitted.
- `native.stop({...scope,runId})` requests the exact conditional native abort and returns `{runId,abortRequested}`.
- Observation `close`, caller cancellation and deadlines close observation only; they never send Stop. No-argument legacy methods remain local unavailable results.

The exact-run route resolves resource/thread from public native `Agent.observe` metadata, immediately calls its public `detach`, compares the native resource to the verified account, and rechecks foundation SQL ownership. It never trusts caller RequestContext/resource claims or keeps an ownership cache. The standard native handler still owns SSE; the facade only validates official SDK-decoded native event shapes. Native private errors/stacks, request context, usage and metadata are not exposed.

## Finite bounds and replay limitation

Input/output remain 8192 UTF-8 bytes; raw wire/JSON is at most 1 MiB. Native estimated output cap/model maximum remain 64 tokens and model first-content/call/total budgets remain 3/7/8 seconds. Client token acquisition, send/queue, subscription establishment and Stop acknowledgment are at most 3 seconds; observation is at most 9 seconds. Smaller caller configuration tightens limits. Stalled acknowledgment never fabricates cancellation success. Tests use independent five-second establishment/Stop watchdogs.

Public native `durable.cleanupTimeoutMs` is 3000 ms, an explicitly finite **native replay window**, replacing the earlier 100 ms cleanup grace. Within it, exact native observation can replay a missed abort/finish. Thread subscriptions alone replay the current run, not a terminated predecessor. Expiry returns not-found/unavailable without resend; restart or expiry does not promise retained terminal execution identity/status. This does not change main clarification `9319d23` or make native caches canonical history. Saved signal/message/assistant IDs, exact text and order still reload from native Postgres. Only `detach` ends an observation: native `cleanup()` would destroy other observers' replay and is never used for per-request cancellation.

## Verification and exposure

Pre-implementation real built-server/isolated Auth/two-account/Postgres probes are preserved under `/tmp/workprint-sprint-004/native-turn-control/`. They first observed the old 100 ms replay gap, then qualified the public finite-window configuration, native exact-ID old-Stop fence, native event envelopes, foreign denial and honest expiry. Initial probe mistakes (assuming concurrent submission order, inspecting the wrong event envelope, or missing nested-route account context) are retained non-passes, not functional reds. An interrupted driver cleanup was recovered only after exact ownership/native-store identity checks; unrelated resources were untouched.

Permanent functional reds: native queue returned HTTP 404 for both real accounts; the api-client's exact Stop returned local `not_implemented`, made zero native abort requests and left its real provider active. Corresponding tests now exercise supported dispatch. Native and facade tests independently cover accepted inputs/order/IDs/reload, disconnect without Stop, actual interruption/completion, identified reconnect, repeated/delayed old Stop, finite failures/cancellation and live foreign execution/thread rejection.

Controlled provider gates, held metadata/HTTP middleware and counter decorators live only in separately built test composition. Tests observe real provider/AbortSignal/timer handles, public native observation detach, native pubsub subscriptions, HTTP close listeners, active native runs/workflow settlement and idle serving queries. These are scoped checks, not universal claims about private bus internals. Both server/browser clean-export artifacts exclude controls/providers/launchers; test-looking production flags do not bind a model. Auth/navigation/ingress/CORS and all 19 application contracts remain required regressions. No new UI or visual reference is introduced.

Audit remains separately reported NON-PASS B-004/B-008 under the main-owned private/local Wave 1 decision. New dependency paths/options/trust/production closure require reassessment; no suppression, override, toolchain/cohort upgrade, age exception or shared/public deployment is authorized. Final clean-head suite, evidence and independent review determine delivery; this document is not acceptance or merge authority.
