import type { CallOptions, ClientResult } from './types.js';
import type { NativeObservedTurn, NativeSendReceipt, NativeTextDelta, NativeTextInput, NativeTurnScope } from './native-types.js';
import { nativeOutcome } from './native-outcome.js';
import { failed, nativeCaught, nativeLifetime, nativeSdk, nativeSendReceipt, nativeTransportLimits, object, scoped, unavailableNative, uuid, validNativeText, type NativeConfig } from './native-transport.js';

export type NativeStopInput = NativeTurnScope & { runId: string };
/** Native abort request acknowledgment, NOT proof that execution stopped. */
export type NativeStopReceipt = { runId: string; abortRequested: boolean };
export type NativeRunInput = { runId: string };
export type NativeRunObservation = { consume(onText: (part: NativeTextDelta) => void): Promise<ClientResult<NativeObservedTurn>>; close(): void };
export type NativeTurnControls = {
  queueText(input?: NativeTextInput, options?: CallOptions): Promise<ClientResult<NativeSendReceipt>>;
  stop(input?: NativeStopInput, options?: CallOptions): Promise<ClientResult<NativeStopReceipt>>;
  observeTurn(input?: NativeRunInput, options?: CallOptions): Promise<ClientResult<NativeRunObservation>>;
};

/** Public native queue/conditional abort/exact replay only; no scheduler, status ledger or retries. */
export function createNativeControl(config: NativeConfig): NativeTurnControls {
  const establishMs = Math.min(config.timeoutMs ?? nativeTransportLimits.establishmentMs, nativeTransportLimits.establishmentMs);
  const streamMs = Math.min(config.timeoutMs ?? nativeTransportLimits.observationMs, nativeTransportLimits.observationMs);
  return {
    async queueText(input, options) {
      if (input === undefined) return unavailableNative();
      if (!validNativeText(input)) return failed('invalid_input', 'Invalid native text input');
      const life = nativeLifetime(establishMs, options);
      const work = async (): Promise<ClientResult<NativeSendReceipt>> => {
        try {
          const agent = await nativeSdk(config, life); life.controller.signal.throwIfAborted();
          return nativeSendReceipt(await agent.queueMessage({ threadId: input.threadId, resourceId: input.resourceId, message: input.message, ifIdle: { behavior: 'wake' } }), input.message);
        } catch { return nativeCaught(life); }
      };
      try { return await Promise.race([work(), life.interrupted]); } finally { life.end(); }
    },
    async stop(input, options) {
      if (input === undefined) return unavailableNative();
      if (!scoped(input) || !object(input) || !uuid(input.runId) || Object.keys(input).some(key => !['threadId', 'resourceId', 'runId'].includes(key))) return failed('invalid_input', 'Invalid native Stop reference');
      const life = nativeLifetime(establishMs, options);
      const work = async (): Promise<ClientResult<NativeStopReceipt>> => {
        try {
          const agent = await nativeSdk(config, life); life.controller.signal.throwIfAborted();
          const value = await agent.abortThread({ threadId: input.threadId, resourceId: input.resourceId, expectedRunId: input.runId, clearPendingSignals: false });
          if (!object(value) || typeof value.aborted !== 'boolean') return failed('invalid_response', 'Invalid native Stop acknowledgment');
          return { ok: true, value: { runId: input.runId, abortRequested: value.aborted } };
        } catch { return nativeCaught(life); }
      };
      try { return await Promise.race([work(), life.interrupted]); } finally { life.end(); }
    },
    async observeTurn(input, options) {
      if (input === undefined) return unavailableNative();
      if (!object(input) || !uuid(input.runId) || Object.keys(input).some(key => key !== 'runId')) return failed('invalid_input', 'Invalid native execution reference');
      const life = nativeLifetime(establishMs, options);
      const work = async (): Promise<ClientResult<NativeRunObservation>> => {
        try {
          const response = await (await nativeSdk(config, life)).observe({ runId: input.runId });
          if (life.controller.signal.aborted) return nativeCaught(life);
          life.budget(streamMs);
          let consumed = false;
          const close = () => life.fail(failed('cancelled', 'Native observation closed'));
          return { ok: true, value: {
            close,
            async consume(onText) {
              if (consumed) return failed('invalid_input', 'Native observation already consumed'); consumed = true;
              const decoder = nativeOutcome(input.runId, onText);
              let terminal: ClientResult<NativeObservedTurn> | undefined;
              const processing = async (): Promise<ClientResult<NativeObservedTurn>> => {
                try {
                  await response.processDataStream({ onChunk: part => {
                    if (terminal || life.controller.signal.aborted) return;
                    const result = decoder.event(part);
                    if (result) { terminal = result; life.end(); }
                  } });
                  return terminal ?? life.failure ?? failed('invalid_response', 'Native stream ended without a terminal result');
                } catch { return terminal ?? nativeCaught(life); }
              };
              try { return await Promise.race([processing(), life.interrupted]); } finally { life.end(); }
            },
          } };
        } catch { life.end(); return nativeCaught(life); }
      };
      const result = await Promise.race([work(), life.interrupted]);
      if (!result.ok) life.end(); return result;
    },
  };
}
