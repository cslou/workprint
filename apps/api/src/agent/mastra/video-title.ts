import type { MastraCompositeStore } from '@mastra/core/storage';
import type { NativeTurnModel } from './model.js';

/** The title call's only instructions; also how a scripted provider tells a title request from a turn. */
export const titleInstructions = 'Name this short video from the filmmaker’s message in at most six words. Reply with the title only, no quotes.';
/** Longest saved title, in characters. */
export const titleLength = 60;

type StreamPart = { type: string; delta?: unknown };
type StreamCall = (options: {
  prompt: readonly ({ role: 'system'; content: string } | { role: 'user'; content: readonly { type: 'text'; text: string }[] })[];
  maxOutputTokens: number;
  abortSignal: AbortSignal;
}) => Promise<{ stream: ReadableStream<StreamPart> }>;

/** One line, without wrapping quotes or a trailing full stop, at most `titleLength` characters. */
export function cleanTitle(raw: string): string {
  const line = raw.replace(/\s+/g, ' ').trim().replace(/^["'“‘]+|["'”’]+$/g, '').replace(/\.$/, '').trim();
  const characters = [...line];
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
    try {
      const memory = await storage.getStore('memory');
      if (!memory) throw new Error('Native memory unavailable');
      const thread = await memory.getThreadById({ threadId: videoId, resourceId: accountId });
      if (!thread || thread.resourceId !== accountId || thread.title?.trim()) return;
      const { stream } = await doStream({
        prompt: [{ role: 'system', content: titleInstructions }, { role: 'user', content: [{ type: 'text', text: message }] }],
        maxOutputTokens: limits.titleTokens, abortSignal: deadline.signal,
      });
      let text = '';
      const reader = stream.getReader();
      const aborted = new Promise<never>((_, reject) => {
        if (deadline.signal.aborted) reject(deadline.signal.reason);
        deadline.signal.addEventListener('abort', () => reject(deadline.signal.reason), { once: true });
      });
      aborted.catch(() => undefined);
      for (;;) {
        const next = await Promise.race([reader.read(), aborted]);
        if (next.done) break;
        if (next.value.type === 'error') throw new Error('Video title call failed');
        if (next.value.type === 'text-delta' && typeof next.value.delta === 'string') text += next.value.delta;
      }
      const title = cleanTitle(text);
      if (title && !deadline.signal.aborted) await memory.patchThread({ id: videoId, title });
    } catch (error) {
      // No message or provider detail: the name says enough to tell a timeout from a provider failure.
      console.error('Video title failed', { name: deadline.signal.aborted ? 'TimeoutError' : error instanceof Error ? error.name : 'unknown' });
    } finally {
      clearTimeout(timer);
      if (!deadline.signal.aborted) deadline.abort();
      naming.delete(videoId);
    }
  };
}
