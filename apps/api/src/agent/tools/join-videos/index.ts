import { z } from 'zod';
import { joinLimits, type JoinOutcome } from '../../../application/index.js';
import { defineTool } from '../define.js';
import { labelOf, type SavedClip } from '../video-shared.js';

type Refusal = Exclude<JoinOutcome['kind'], 'joined' | 'stopped'> | 'unjoinable';
export type JoinVideosResult =
  | { made: true; video: SavedClip; clips: number; showInChat: boolean }
  | { made: false; reason: Refusal; message: string };

const maxS = joinLimits.maxLengthMs / 1000;
const messages: Readonly<Record<Exclude<Refusal, 'too_long' | 'incompatible'>, string>> = {
  unjoinable: 'Not joined: this server cannot join videos. Tell the user; do not retry. Nothing was saved.',
  invalid: `Not joined: pass ${joinLimits.minClips} to ${joinLimits.maxClips} clips. Nothing was saved.`,
  not_found: 'Not joined: a clip is not a video this video uses. Call read-workspace and pass only video versionIds it lists. Nothing was saved.',
  repeated: 'Not joined: a clip was named more than once. Pass each versionId once, in order. Nothing was saved.',
  too_large: `Not joined: together the clips are over ${joinLimits.maxBytes / 1024 / 1024} MB, more than one join can take. Join fewer clips. Nothing was saved.`,
  no_room: 'Not joined: this video has too many saved items for another video. Tell the user; do not retry. Nothing was saved.',
  unavailable: 'Not joined: the clips could not be joined right now. Tell the user; do not retry in this turn. Nothing was saved.',
};
const summaries: Readonly<Record<Exclude<Refusal, 'incompatible'> | 'error', string>> = {
  unjoinable: 'Not joined: videos can’t be joined on this server',
  invalid: 'Not joined: the request wasn’t valid',
  error: 'Not joined: the request wasn’t valid',
  not_found: 'Couldn’t join those clips',
  repeated: 'Not joined: a clip was named twice',
  too_long: `Not joined: the clips run over ${maxS} s`,
  too_large: 'Not joined: the clips are too large',
  no_room: 'Not joined: this video has too many saved items',
  unavailable: 'Not joined: joining is unavailable',
};
const refusal = (reason: Exclude<Refusal, 'too_long' | 'incompatible'>): JoinVideosResult => ({ made: false, reason, message: messages[reason] });
const seconds = (ms: number) => Math.round(ms / 100) / 10;

/** Joins saved clips, in order, into one new draft video, keeping the originals. Free: no paid call. */
export const joinVideosTool = defineTool({
  id: 'join-videos',
  description: [
    'Join saved video clips, in the order given, into one new draft video of this video. The original clips and their versions stay as they are. Saving is never approval.',
    `clips are ${joinLimits.minClips} to ${joinLimits.maxClips} video versionIds from read-workspace, each once. Together they may run at most ${maxS} s.`,
    'The clips must have matching video: the same size, frame rate and encoding. Otherwise nothing is joined and the result says which clip differs and how.',
    'To join the Shot videos, pass them in Shot order: each Shot\'s chosen video, else its latest.',
    'Joining makes no paid call and needs no yes.',
    'Set showInChat to true when the user asked for the joined video directly, so it is shown in the chat.',
  ].join(' '),
  inputSchema: z.strictObject({
    clips: z.array(z.string().max(200)).min(joinLimits.minClips).max(joinLimits.maxClips).describe('Video versionIds from read-workspace, in the order to join them.'),
    showInChat: z.boolean().default(false).describe('True when the user asked for the joined video directly, to show it in the chat.'),
  }),
  phrase: 'Joining clips…',
  // Mastra hands back an input validation failure as `{ error: true }`.
  doneSummary: (result: JoinVideosResult | { error: true }) => {
    if ('error' in result) return summaries.error;
    if (result.made) return `Joined ${result.clips} clips`;
    return result.reason === 'incompatible' ? 'Not joined: the clips don’t match' : summaries[result.reason];
  },
  shownMedia: (result: JoinVideosResult | { error: true }) => 'made' in result && result.made && result.showInChat ? [{ kind: 'video' as const, versionId: result.video.versionId }] : [],
  execute: async (input, context): Promise<JoinVideosResult> => {
    const { scope, collaborators, signal } = context;
    if (!collaborators.joins) return refusal('unjoinable');
    const outcome = await collaborators.joins(scope.accountId, scope.videoId, input.clips.map(id => id.trim()), signal);
    switch (outcome.kind) {
      case 'joined': {
        const label = await labelOf(context, outcome.versionId);
        return { made: true, clips: outcome.clips, showInChat: input.showInChat,
          video: { versionId: outcome.versionId, ...(label ? { label } : {}), width: outcome.width, height: outcome.height, durationS: seconds(outcome.durationMs) } };
      }
      // Stop, the turn deadline or a shutdown ends the turn as incomplete; nothing was saved.
      case 'stopped': signal.throwIfAborted(); return refusal('unavailable');
      case 'too_long': return { made: false, reason: 'too_long', message: `Not joined: together the clips run ${seconds(outcome.lengthMs)} s, over the ${maxS} s limit. Join fewer clips. Nothing was saved.` };
      case 'incompatible': return { made: false, reason: 'incompatible',
        message: `Not joined: clip ${outcome.clip} can't be joined to clip 1 (${outcome.difference}). The clips need the same size, frame rate and encoding. Tell the user which clip differs. Nothing was saved.` };
      default: return refusal(outcome.kind);
    }
  },
});
