import type { MastraCompositeStore } from '@mastra/core/storage';
import type { NativeTurnModel } from './model.js';

/** The title call's only instructions; also how a scripted provider tells a title request from a turn. */
export const titleInstructions = 'Name this short video from the filmmaker’s message in at most six words. Reply with the title only, no quotes.';
/**
 * Sent as `reasoning_effort: "minimal"`; Muse Spark cannot turn reasoning off. The model router reads
 * `openai` on Meta's registry endpoint and `meta` (its provider id) on an explicit OpenAI-compatible URL.
 */
const minimalEffort = Object.freeze({ reasoningEffort: 'minimal' });
export const titleProviderOptions = Object.freeze({ openai: minimalEffort, meta: minimalEffort });
/** Longest saved title, in characters. */
export const titleLength = 60;

type StreamPart = { type: string; delta?: unknown; finishReason?: unknown };
type StreamCall = (options: {
  prompt: readonly ({ role: 'system'; content: string } | { role: 'user'; content: readonly { type: 'text'; text: string }[] })[];
  maxOutputTokens: number;
  providerOptions: Readonly<Record<string, Readonly<Record<string, string>>>>;
  abortSignal: AbortSignal;
}) => Promise<{ stream: ReadableStream<StreamPart> }>;

/** One line without a `Title:` label, wrapping quotes or bold, or a trailing full stop; at most `titleLength` characters. */
export function cleanTitle(raw: string): string {
  let line = raw.replace(/\s+/g, ' ').trim(), previous = '';
  // Unwrap matching pairs until stable, so `"Title".` and `**Title**` both become `Title`. Straight single quotes stay, being apostrophes as often: `'Tis the Boys'`.
  while (line !== previous) {
    previous = line;
    line = line.replace(/^title:\s*/i, '').replace(/^(\*\*|__)(.*)\1$/, '$2').replace(/^(?:"(.*)"|“(.*)”|‘(.*)’)$/, '$1$2$3').replace(/\.$/, '').trim();
  }
  // Whole characters as people see them, so an emoji or accented letter is never cut in half.
  const characters = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(line)].map(part => part.segment);
  return characters.length <= titleLength ? line : characters.slice(0, titleLength).join('').trimEnd();
}

export type VideoTitleLimits = Readonly<{ titleTokens: number; titleMs: number }>;
/** Names an untitled video from an accepted message. Never rejects: a failed title leaves the video untitled. */
export type NameVideo = (accountId: string, videoId: string, message: string) => Promise<void>;

/**
 * At most one title call per accepted message while the video has no title: capped output, one overall
 * deadline and no retry. The save writes the title alone, never metadata, so Recents' started mark stays.
 */
export function createVideoTitler(model: NativeTurnModel, storage: MastraCompositeStore, limits: VideoTitleLimits): NameVideo {
  const naming = new Set<string>();
  const doStream = (model as unknown as { doStream: StreamCall }).doStream.bind(model);
  return async (accountId, videoId, message) => {
    if (naming.has(videoId)) return;
    naming.add(videoId);
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new Error('Video title timed out')), limits.titleMs);
    // Every step races the one deadline, so a hung read, call or save cannot keep the video from later attempts.
    const expired = new Promise<never>((_, reject) => { deadline.signal.addEventListener('abort', () => reject(deadline.signal.reason), { once: true }); });
    expired.catch(() => undefined);
    const bounded = <T>(work: Promise<T>) => Promise.race([work, expired]);
    let reader: ReadableStreamDefaultReader<StreamPart> | undefined;
    try {
      const memory = await bounded(storage.getStore('memory'));
      if (!memory) throw new Error('Native memory unavailable');
      const thread = await bounded(memory.getThreadById({ threadId: videoId, resourceId: accountId }));
      if (!thread || thread.resourceId !== accountId || thread.title?.trim()) return;
      const { stream } = await bounded(doStream({
        prompt: [{ role: 'system', content: titleInstructions }, { role: 'user', content: [{ type: 'text', text: message }] }],
        // A title needs no deliberation; the lowest effort Muse Spark accepts keeps it to about a second.
        maxOutputTokens: limits.titleTokens, providerOptions: titleProviderOptions, abortSignal: deadline.signal,
      }));
      reader = stream.getReader();
      let text = '', finishReason: unknown;
      for (;;) {
        const next = await bounded(reader.read());
        if (next.done) break;
        if (next.value.type === 'error') throw new Error('Video title call failed');
        if (next.value.type === 'text-delta' && typeof next.value.delta === 'string') text += next.value.delta;
        if (next.value.type === 'finish') finishReason = typeof next.value.finishReason === 'object' && next.value.finishReason !== null ? (next.value.finishReason as { unified?: unknown }).unified : next.value.finishReason;
      }
      const title = cleanTitle(text);
      if (!title) {
        // Nothing to save; the finish reason (for example `length`) says why.
        console.error('Video title failed', { name: 'EmptyTitle', finishReason: typeof finishReason === 'string' && /^[a-z-]{1,32}$/.test(finishReason) ? finishReason : 'unknown' });
        return;
      }
      await bounded(memory.patchThread({ id: videoId, title }));
    } catch (error) {
      // No message or provider detail: the name says enough to tell a timeout from a provider failure.
      console.error('Video title failed', { name: deadline.signal.aborted ? 'TimeoutError' : error instanceof Error ? error.name : 'unknown' });
    } finally {
      clearTimeout(timer);
      if (!deadline.signal.aborted) deadline.abort();
      reader?.cancel().catch(() => undefined);
      naming.delete(videoId);
    }
  };
}
