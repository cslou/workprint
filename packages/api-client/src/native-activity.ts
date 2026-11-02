/** A tool's activity line as the server projects it: never arguments, results or errors. */
export type NativeToolActivity = {
  toolCallId: string;
  tool: string;
  /** Server-owned phrase, for example "Getting up to date on our progress…". */
  phrase: string;
  /** running: executing. done: returned. failed: threw. incomplete: never finished. */
  state: 'running' | 'done' | 'failed' | 'incomplete';
  summary?: string;
  /** Saved image version ids to show under a done line, at most 10. */
  images?: string[];
};
export type NativeToolActivityChunk = NativeToolActivity & { runId: string };
/** One saved message part the browser may render. */
export type NativeHistoryPart = { type: 'text'; text: string } | ({ type: 'tool-activity' } & NativeToolActivity);

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const states = new Set(['running', 'done', 'failed', 'incomplete']);
const bounded = (value: unknown, limit: number) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shownImages = (value: unknown) => value === undefined || (Array.isArray(value) && value.length >= 1 && value.length <= 10 && value.every(id => typeof id === 'string' && uuid.test(id)));

/** Exact activity fields only; `extra` names keys the carrier adds (the history part's `type`). */
export function isToolActivity(value: unknown, extra: readonly string[] = []): value is NativeToolActivity {
  if (!object(value) || Object.keys(value).some(key => !['toolCallId', 'tool', 'phrase', 'state', 'summary', 'images', ...extra].includes(key))) return false;
  return bounded(value.toolCallId, 128) && typeof value.tool === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value.tool) && bounded(value.phrase, 200) &&
    typeof value.state === 'string' && states.has(value.state) && (value.summary === undefined || bounded(value.summary, 200)) && shownImages(value.images);
}

export const isHistoryPart = (part: unknown): part is NativeHistoryPart => object(part) &&
  ((part.type === 'text' && typeof part.text === 'string') || (part.type === 'tool-activity' && isToolActivity(part, ['type'])));
