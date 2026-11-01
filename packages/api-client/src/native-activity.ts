/** A tool's activity line as the server projects it: never arguments, results or errors. */
export type NativeToolActivity = {
  toolCallId: string;
  tool: string;
  /** Server-owned phrase, for example "Getting up to date on our progress…". */
  phrase: string;
  /** running: executing. done: returned. failed: threw. incomplete: never finished. */
  state: 'running' | 'done' | 'failed' | 'incomplete';
  summary?: string;
};
export type NativeToolActivityChunk = NativeToolActivity & { runId: string };
/** One saved message part the browser may render. */
export type NativeHistoryPart = { type: 'text'; text: string } | ({ type: 'tool-activity' } & NativeToolActivity);

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const states = new Set(['running', 'done', 'failed', 'incomplete']);
const bounded = (value: unknown, limit: number) => typeof value === 'string' && value.length > 0 && value.length <= limit;

/** Exact activity fields only; `extra` names keys the carrier adds (the history part's `type`). */
export function isToolActivity(value: unknown, extra: readonly string[] = []): value is NativeToolActivity {
  if (!object(value) || Object.keys(value).some(key => !['toolCallId', 'tool', 'phrase', 'state', 'summary', ...extra].includes(key))) return false;
  return bounded(value.toolCallId, 128) && typeof value.tool === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value.tool) && bounded(value.phrase, 200) &&
    typeof value.state === 'string' && states.has(value.state) && (value.summary === undefined || bounded(value.summary, 200));
}

export const isHistoryPart = (part: unknown): part is NativeHistoryPart => object(part) &&
  ((part.type === 'text' && typeof part.text === 'string') || (part.type === 'tool-activity' && isToolActivity(part, ['type'])));
