import assert from 'node:assert/strict';

export type TurnChunk = { type: string; runId?: string; payload?: Record<string, unknown> };
export type ObservedTurn = {
  status: number; runId?: string; error?: unknown; text: string;
  terminal?: TurnChunk; chunks: TurnChunk[]; firstChunkMs?: number;
};
const terminalTypes = new Set(['finish', 'error', 'abort', 'tripwire']);

/** Raw native turn calls as the browser makes them: subscribe, send, then read the run's chunks. */
export function nativeTurnClient(apiOrigin: string, token: string, accountId: string) {
  const post = (path: string, body: unknown, signal: AbortSignal = AbortSignal.timeout(30000)) => fetch(apiOrigin + path, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  const send = (videoId: string, message: string) => post('/api/agents/assistant/send-message', { threadId: videoId, resourceId: accountId, message, ifIdle: { behavior: 'wake' } });
  return {
    post, send,
    async newVideo() { return (await (await post('/memory/threads', { resourceId: accountId })).json() as { id: string }).id; },
    /** Reads until the run's terminal chunk or `timeoutMs`. */
    async turn(videoId: string, message: string, timeoutMs = 30000): Promise<ObservedTurn> {
      const observer = new AbortController();
      const subscription = await post('/api/agents/assistant/threads/subscribe', { threadId: videoId, resourceId: accountId, withInitialHistory: false }, observer.signal);
      assert.equal(subscription.status, 200);
      const started = Date.now();
      const sent = await send(videoId, message);
      const receipt = await sent.json() as { runId?: string; error?: unknown };
      const result: ObservedTurn = { status: sent.status, text: '', chunks: [], ...(receipt.runId ? { runId: receipt.runId } : {}), ...(receipt.error ? { error: receipt.error } : {}) };
      if (sent.status !== 200) { observer.abort(); return result; }
      const reader = subscription.body!.getReader(), decoder = new TextDecoder();
      const deadline = setTimeout(() => observer.abort(), timeoutMs);
      let buffered = '';
      try {
        while (!result.terminal) {
          const next = await reader.read();
          if (next.done) break;
          buffered += decoder.decode(next.value, { stream: true });
          const lines = buffered.split('\n'); buffered = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const chunk = JSON.parse(line.slice(6)) as TurnChunk;
            if (chunk.runId !== result.runId) continue;
            result.chunks.push(chunk);
            if (chunk.type === 'text-delta') {
              result.firstChunkMs ??= Date.now() - started;
              result.text += String(chunk.payload?.text ?? '');
            }
            if (terminalTypes.has(chunk.type)) { result.terminal = chunk; break; }
          }
        }
      } catch (error) { if (!observer.signal.aborted) throw error; }
      finally { clearTimeout(deadline); observer.abort(); }
      return result;
    },
  };
}

export const finishReason = (turn: ObservedTurn) => (turn.terminal?.payload?.stepResult as { reason?: string } | undefined)?.reason;
export const completed = (turn: ObservedTurn) => turn.terminal?.type === 'finish' && finishReason(turn) === 'stop';
