# Independent native workflow qualification

This is private/local test qualification, not a production workflow consumer, tool-started execution, generation/export implementation, live-model authorization or a live-service capacity claim. Normal serving registers no workflow definitions or control routes. Browser Send and production inference remain unavailable. The dependency cohort and all 19 application contracts are unchanged.

## One owner and authoritative identity

The separately built composition uses the existing app-owned server, verified real Auth, two isolated accounts, native Postgres and one Mastra instance/execution owner. Public `createWorkflow`, `createStep`, `Mastra.addWorkflow`, `Workflow.createRun`, `Run.startAsync`, `Run.resume`, `Run.cancel`, step `suspend`/`abortSignal`, native `sleep` and public workflow storage APIs perform execution and persistence. There is no application workflow/status store, scheduler, business table, native DDL, vendor patch or private API.

A workflow starts separately from a controlled turn. Its native `runId` and saved `resourceId` remain unchanged when that exact turn is stopped, or its thread observer disconnects. Releasing its test external wait subsequently saves native success and the final step result on that same workflow. Workflow cancellation is a separate exact-run operation: fresh requests read the saved native resource identity and compare it with verified Auth before acquiring the public run handle. Caller resource fields, fixture gates and admission permits never establish ownership. Foreign/invalid commands start no work or affect other runs/turns; repeated cancellation of an old run cannot cancel its replacement.

This independent workflow identity does **not** repair conversation execution-ID retention. Saved signal/assistant identities and turn execution `runId` retain their distinct meanings and finite observation boundary from [turn qualification](native-turn-qualification.md) and [exact turn control](native-turn-control.md).

## Qualified fixture bounds, not native defaults

Unconfigured native execution accepted three simultaneous held runs in the pre-implementation probe. The qualified test composition therefore uses a narrow, immediate admission budget:

| Target | Exercised behavior |
| --- | --- |
| Two concurrent workflow runs | Atomic in-process permits before native run creation; accepted running/waiting/suspended work occupies a permit. Excess returns HTTP 429 without creating a native row, running a step or entering a queue. |
| Five-second maximum fixture wait | Controlled external waits remove their actual timer/AbortSignal listener and throw on expiry; native saves `failed`. An unresumed native suspension invokes public exact cancellation after five seconds and saves `canceled`. Native sleep durations are at most five seconds. |
| Ten-second total run deadline | One timer from native run binding invokes public exact cancellation; resume does not restart that deadline. A sequence of three native four-second sleeps is canceled at the whole-run bound, releases capacity and never executes its late final step. |
| Seven-second total shutdown | One monotonic signal-to-exit deadline covers HTTP, owned native settlement and real Mastra shutdown. HTTP gets at most two seconds; native receives only the remaining total budget, also capped by configured drain. Stalled native acknowledgments and settlement hooks force exit 1 under a separate nine-second watchdog. |

Permits and bound timers are ephemeral resource bookkeeping only, not canonical identity/status/ownership or a recoverable ledger. They never execute/reschedule steps or queue work. Native finish releases permits; suspended work retains its permit until resume/terminal cancellation. Cancellation failure is surfaced and does not silently release uncertain capacity. The test composition is deliberately not a crash-recovery or multi-process admission solution.

Configured deadlines exclude no phase; assertions record observed signal-to-exit or admission-to-saved-outcome times, including event-loop/storage overhead, separately from process startup. After stalls/cancellation, actual fixture waits/listeners/timers/permits settle and replacement native work succeeds. During both external and native waits, the supported `PostgresStore.pool` / `pg.Pool` diagnostics show every connection idle and no queued borrower; serving-role sessions are also idle in Postgres. This checks actual pool release, not merely an idle-but-still-borrowed database session: no application transaction/checked-out connection spans the wait.

## Shutdown requires owned registration

The actual unadapted standard-workflow probe exited 0 about eight milliseconds after SIGTERM while both saved native workflows still said `running`. `Run.startAsync()` on this standard workflow is **not** automatically drained by `mastra.shutdown()` as a tracked durable-agent run would be. Process exit alone is not native termination evidence.

The supported owned adapter was qualified before integration: the test composition reads its registered workflows' canonical native rows and calls public exact `Run.cancel()` before real Mastra shutdown. The generic optional `beforeNativeShutdown` bootstrap collaborator runs inside the same seven-second deadline, after HTTP admission closes. It neither replaces Mastra nor introduces another execution owner. Normal production supplies no workflow collaborator. Adapter failure still attempts real Mastra shutdown and exits 1; a stalled adapter is force-exited nonzero by the total timer.

The real SIGTERM test holds two workflows owned by different isolated accounts, signals the exact registered process, waits for its natural exit under an independent watchdog, and reloads both saved `canceled` outcomes from Postgres. A numeric runtime receipt proves fixture handles were zero before native shutdown/process exit; serving-role connections are zero afterward. No harness kill establishes a passing result.

## Saved outcomes and evidence

Native snapshots with `shouldPersistSnapshot: () => true` expose actual `running`, `waiting`, `suspended`, `success`, `failed` and `canceled` outcomes. Native sleep progresses from waiting to success; explicit resume preserves the suspended run's identity. Failure, wait expiry and cancellation never become completion from EOF, acknowledgment or local flags. Terminal state survives the exercised graceful shutdown in native storage. Crash/restart, lost-start acknowledgment, re-entry, guarded effects and feature-specific publication/cancellation races remain separately gated Story 7 work, not qualified here.

`apps/api/test/native-workflow.test.ts` exercises real built/Auth/Postgres independence, exact owned controls, concurrency/rejection, waits/resume/failure, deadlines/replacements, cancellation of native waiting work and SIGTERM. `server-entry.test.ts` retains worker/recovery/HTTP/signal behavior and proves the total shutdown deadline with held HTTP, a stalled native acknowledgment and a stalled owned adapter. Production clean-export artifacts exclude the definitions/controls; real Vite serving denies their source paths. Existing queue/reconnect/exact Stop/history/Auth/storage-role/ingress suites remain regression requirements; browser/visual references are unchanged.

Pre-implementation observations, the unadapted shutdown failure, capacity/suspension/deadline functional reds and corrected targets are preserved under `/tmp/workprint-sprint-004/native-workflow-bounds/` and copied into revision-specific ignored delivery evidence. Compile/setup errors and an initially overbroad disconnect assertion are retained as non-passes, not relabeled functional proof. The latter counted native execution-owned pubsub subscriptions while the turn intentionally remained active; corrected checks distinguish detached observer resources from those required by ongoing native execution and still require full settlement afterward.

Dependency audit remains **NON-PASS** under only the existing B-004 and narrowly scoped B-008 private/local approvals. This story neither changes dependencies nor extends those approvals to new paths/options/trust, production closure, shared deployment or paused Sprint 005 work.
