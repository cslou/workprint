import type { CallOptions, ClientResult } from './types.js';
import type { NativeObservedFinish, NativeObservedTurn, NativeSendReceipt, NativeTextDelta, NativeTextInput, NativeTurnScope } from './native-types.js';
import { failed, nativeCaught, nativeLifetime, nativeSdk, nativeSendReceipt, nativeTransportLimits, scoped, unavailableNative, uuid, validNativeText, type NativeConfig } from './native-transport.js';
import { nativeOutcome } from './native-outcome.js';

export type { NativeTurnScope, NativeTextInput, NativeSendReceipt, NativeObservedFinish, NativeObservedTurn, NativeTextDelta } from './native-types.js';
export { nativeTransportLimits } from './native-transport.js';
export type NativeObservation = {
  consume(runId: NativeSendReceipt['runId'], onText: (part: NativeTextDelta) => void): Promise<ClientResult<NativeObservedFinish>>;
  consumeTurn(runId: NativeSendReceipt['runId'], onText: (part: NativeTextDelta) => void): Promise<ClientResult<NativeObservedTurn>>;
  close(): void;
};
export type NativeTurnMethods = {
  sendText(input?: NativeTextInput, options?: CallOptions): Promise<ClientResult<NativeSendReceipt>>;
  subscribe(input?: NativeTurnScope, options?: CallOptions): Promise<ClientResult<NativeObservation>>;
};

/** Official native thread transport. Close/cancellation is observation-only, never Stop. */
export function createNativeTurns(config: NativeConfig): NativeTurnMethods {
  const establishMs = Math.min(config.timeoutMs ?? nativeTransportLimits.establishmentMs, nativeTransportLimits.establishmentMs);
  const streamMs = Math.min(config.timeoutMs ?? nativeTransportLimits.observationMs, nativeTransportLimits.observationMs);
  return {
    async sendText(input, options) {
      if (input === undefined) return unavailableNative();
      if (!validNativeText(input)) return failed('invalid_input', 'Invalid native text input');
      const life = nativeLifetime(establishMs, options);
      const work = async (): Promise<ClientResult<NativeSendReceipt>> => {
        try {
          const agent = await nativeSdk(config, life); life.controller.signal.throwIfAborted();
          return nativeSendReceipt(await agent.sendMessage({ threadId: input.threadId, resourceId: input.resourceId, message: input.message, ifIdle: { behavior: 'wake' } }), input.message);
        } catch { return nativeCaught(life); }
      };
      try { return await Promise.race([work(), life.interrupted]); } finally { life.end(); }
    },
    async subscribe(input, options) {
      if (input === undefined) return unavailableNative();
      if (!scoped(input) || Object.keys(input).some(key => !['threadId', 'resourceId'].includes(key))) return failed('invalid_input', 'Invalid native observation scope');
      const life = nativeLifetime(establishMs, options);
      const work = async (): Promise<ClientResult<NativeObservation>> => {
        try {
          const subscription = await (await nativeSdk(config, life)).subscribeToThread({ threadId: input.threadId, resourceId: input.resourceId, withInitialHistory: false });
          if (life.controller.signal.aborted) { subscription.unsubscribe(); return nativeCaught(life); }
          life.budget(streamMs);
          let consumed = false;
          const close = () => { life.fail(failed('cancelled', 'Native observation closed')); subscription.unsubscribe(); };
          const consumeTurn = async (expectedRunId: string, onText: (part: NativeTextDelta) => void): Promise<ClientResult<NativeObservedTurn>> => {
            if (consumed) return failed('invalid_input', 'Native observation already consumed'); consumed = true;
            if (!uuid(expectedRunId)) { close(); return failed('invalid_input', 'Invalid native execution identity'); }
            let terminal: ClientResult<NativeObservedTurn> | undefined;
            const decoder = nativeOutcome(expectedRunId, onText);
            const processing = async (): Promise<ClientResult<NativeObservedTurn>> => {
              try {
                await subscription.processDataStream({ reconnect: false, onChunk: chunk => {
                  if (terminal || life.controller.signal.aborted) return;
                  const result = decoder.chunk(chunk);
                  if (result) { terminal = result; subscription.unsubscribe(); life.end(); }
                } });
                return terminal ?? life.failure ?? failed('invalid_response', 'Native stream ended without a terminal result');
              } catch { return terminal ?? nativeCaught(life); }
            };
            try { return await Promise.race([processing(), life.interrupted]); }
            finally { subscription.unsubscribe(); life.end(); }
          };
          return { ok: true, value: {
            close, consumeTurn,
            async consume(expectedRunId, onText) {
              const result = await consumeTurn(expectedRunId, onText);
              if (!result.ok) return result;
              if (result.value.outcome !== 'complete') return failed('integration_failure', 'Native output rejected or interrupted');
              return { ok: true, value: { runId: result.value.runId, assistantMessageId: result.value.assistantMessageId } };
            },
          } };
        } catch { life.end(); return nativeCaught(life); }
      };
      const result = await Promise.race([work(), life.interrupted]);
      if (!result.ok) life.end(); return result;
    },
  };
}
