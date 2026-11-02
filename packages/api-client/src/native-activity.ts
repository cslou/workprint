/** A tool's activity line as the server projects it: never arguments, results or errors. */
export type NativeToolActivity = {
  toolCallId: string;
  tool: string;
  /** Server-owned phrase, for example "Getting up to date on our progress…". */
  phrase: string;
  /** running: executing. done: returned. failed: threw. incomplete: never finished. */
  state: 'running' | 'done' | 'failed' | 'incomplete';
  summary?: string;
  /** Saved images and videos to show under a done line, at most 10. */
  media?: NativeShownMedia[];
  /** The shape before videos: saved image version ids only. Read through `shownMedia`. */
  images?: string[];
};
/** A saved image or video version a done line shows under it. */
export type NativeShownMedia = { kind: 'image' | 'video'; versionId: string };
export type NativeToolActivityChunk = NativeToolActivity & { runId: string };
/** One saved message part the browser may render. */
export type NativeHistoryPart = { type: 'text'; text: string } | ({ type: 'tool-activity' } & NativeToolActivity);

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const states = new Set(['running', 'done', 'failed', 'incomplete']);
const bounded = (value: unknown, limit: number) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shownList = (value: unknown, item: (entry: unknown) => boolean) => value === undefined || (Array.isArray(value) && value.length >= 1 && value.length <= 10 && value.every(item));
const imageId = (id: unknown) => typeof id === 'string' && uuid.test(id);
const shownItem = (entry: unknown) => object(entry) && Object.keys(entry).length === 2 && (entry.kind === 'image' || entry.kind === 'video') && imageId(entry.versionId);

/** Exact activity fields only; `extra` names keys the carrier adds (the history part's `type`). */
export function isToolActivity(value: unknown, extra: readonly string[] = []): value is NativeToolActivity {
  if (!object(value) || Object.keys(value).some(key => !['toolCallId', 'tool', 'phrase', 'state', 'summary', 'media', 'images', ...extra].includes(key))) return false;
  // One line carries one shape: `media`, or the earlier `images`.
  if (value.media !== undefined && value.images !== undefined) return false;
  return bounded(value.toolCallId, 128) && typeof value.tool === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value.tool) && bounded(value.phrase, 200) &&
    typeof value.state === 'string' && states.has(value.state) && (value.summary === undefined || bounded(value.summary, 200)) && shownList(value.media, shownItem) && shownList(value.images, imageId);
}

/** What a line shows under it, in order, whichever shape it carries. */
export const shownMedia = (activity: NativeToolActivity): NativeShownMedia[] =>
  activity.media ? activity.media.map(item => ({ ...item })) : (activity.images ?? []).map(versionId => ({ kind: 'image', versionId }));

export const isHistoryPart = (part: unknown): part is NativeHistoryPart => object(part) &&
  ((part.type === 'text' && typeof part.text === 'string') || (part.type === 'tool-activity' && isToolActivity(part, ['type'])));
