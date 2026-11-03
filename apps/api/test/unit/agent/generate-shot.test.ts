import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { productionTools, projectToolActivity, type AgentCollaborators, type ToolContext } from '../../../src/agent/index.js';
import type { NewVideo, OwnedWorkspace, VideoJobOutcome } from '../../../src/application/index.js';
import { unusedSheets } from '../../support/unused-sheets.js';

const tool = productionTools.find(candidate => candidate.id === 'generate-shot')!;
const scope = { accountId: randomUUID(), videoId: randomUUID() };
const clipId = randomUUID(), jobId = randomUUID();
const image = (id: string) => ({ id, artifactId: `artifact-${id}`, kind: 'image', revision: 1, media: { contentType: 'image/png', byteSize: 4, width: 640, height: 360 }, createdBy: 'assistant', createdAt: new Date().toISOString(), dependencies: [] });
const panel = (panelId: string, order: number, candidates: unknown[]) => ({ panelId, order, description: `Panel ${panelId}`, references: [], candidateImageVersions: candidates, approvedImageVersionId: null });

/** One Shot with two panels; the second has no image when `unmade`. A made clip is that Shot's version 1. */
function workspace(options: { unmade?: boolean; action?: string; durationS?: number } = {}) {
  const clip = { id: clipId, artifactId: 'artifact-clip', kind: 'video', revision: 1, media: { contentType: 'video/mp4', byteSize: 4, width: 1344, height: 768, durationMs: 6000 }, createdBy: 'assistant', createdAt: new Date().toISOString(), dependencies: [] };
  return {
    script: null, assets: [], generatedVideos: [],
    storyboard: { work: null, shots: [{ shotId: 's1', order: 0, intent: 'Mara arrives.', ...(options.action ? { action: options.action } : {}), ...(options.durationS ? { durationS: options.durationS } : {}),
      panels: [panel('p1', 0, [image('a1')]), panel('p2', 1, options.unmade ? [] : [image('b1')])], chosenVideoVersionId: null, candidateVideoVersions: [clip] }] },
    videos: [], pendingQuestion: null, activeWork: [], selectionRevision: '0',
  } as unknown as OwnedWorkspace;
}

type Options = { outcome?: VideoJobOutcome; unmade?: boolean; action?: string; durationS?: number; noVideos?: boolean; unreadable?: boolean };
function harness(options: Options = {}) {
  const started: NewVideo[] = [];
  const collaborators: AgentCollaborators = {
    readWorkspace: async () => options.unreadable ? { kind: 'unavailable' } : { kind: 'found', workspace: workspace(options) },
    saveScript: async () => ({ kind: 'unavailable' }), saveStoryboard: async () => ({ kind: 'unavailable' }), sheets: unusedSheets, saveGeneratedImage: async () => ({ kind: 'unavailable' }),
    readImageInputs: async () => ({ kind: 'unavailable' }),
    ...(options.noVideos ? {} : { videos: {
      start: async (_account: string, _video: string, input: NewVideo) => { started.push(input); return options.outcome ?? { kind: 'saved', jobId, versionId: clipId, width: 1344, height: 768, durationMs: 6000, gone: false }; },
      resume: async () => ({ kind: 'not_found' }), stopped: async () => ({ kind: 'read', jobs: [] }),
    } }),
  };
  return { collaborators, started };
}
const run = (collaborators: AgentCollaborators, args: unknown) =>
  tool.execute(args, { scope, collaborators, signal: new AbortController().signal, abortReason: () => undefined } satisfies ToolContext) as Promise<Record<string, unknown>>;
const args = (extra: Record<string, unknown> = {}) => ({ shot: 's1', prompt: 'A slow push-in.', ...extra });
const line = (output: unknown) => projectToolActivity(productionTools, { toolCallId: 'call_1', toolName: 'generate-shot', state: 'done', input: args(), output });

test('the Shot\'s reference images, labelled text and target go to the job runner; a saved clip is named and shown under its line', async () => {
  const { collaborators, started } = harness();
  const result = await run(collaborators, tool.inputSchema.parse(args({ shot: ' s1 ' })));
  const prompt = 'Image 1: the storyboard panel for this Shot. Frame the Shot like this panel.\nImage 2: the Shot\'s last storyboard panel. End the Shot on this framing.'
    + '\n\nMara arrives.\n\nNo one speaks.\n\nA slow push-in.\n\nThe action completes within the Shot, and it ends on a settled moment.';
  assert.deepEqual(started, [{ prompt, durationS: 6, ratio: '16:9', referenceImageIds: ['a1', 'b1'], target: { shotId: 's1' } }], 'a padded id still names the Shot; a Shot without a length runs 6 s');
  const timed = harness({ durationS: 9 });
  await run(timed.collaborators, tool.inputSchema.parse(args()));
  assert.equal(timed.started[0]?.durationS, 9, 'the Shot\'s own length');
  assert.deepEqual([line(result)?.summary, line(result)?.media], ['Saved Shot 1 · Video · Version 1', [{ kind: 'video', versionId: clipId }]]);
  const gone = harness({ outcome: { kind: 'saved', jobId, versionId: randomUUID(), width: 1344, height: 768, durationMs: 6000, gone: true } });
  assert.equal(line(await run(gone.collaborators, tool.inputSchema.parse(args())))?.summary, 'Saved 1 video (its Shot is gone)');
});

test('the input schema keeps the motion prompt within MiniMax\'s bounds, and takes no length: the Shot has it', () => {
  for (const bad of [{ prompt: '   ' }, { prompt: '' }, { durationS: 6 }, { shot: '' }, { firstFrame: 'a1' }]) {
    assert.equal(tool.inputSchema.safeParse(args(bad)).success, false, JSON.stringify(bad));
  }
  assert.equal(line({ error: true })?.summary, 'Not made: the request wasn’t valid');
});

test('each refusal has its own line, and none starts a job', async () => {
  const cases: [Options, Record<string, unknown>, string][] = [
    [{}, { shot: 'another' }, 'Not made: that Shot wasn’t found'],
    [{ unmade: true }, {}, 'Not made: make the Shot’s panels first'],
    [{ action: 'x'.repeat(7000) }, {}, 'Not made: the Shot’s text is too long for the video prompt'],
    [{ noVideos: true }, {}, 'Not made: videos can’t be saved on this server'],
    [{ unreadable: true }, {}, 'Not made: saved work is unavailable'],
  ];
  for (const [options, change, summary] of cases) {
    const { collaborators, started } = harness(options);
    const result = await run(collaborators, tool.inputSchema.parse(args(change)));
    assert.deepEqual([result.made, line(result)?.summary, line(result)?.media, started], [false, summary, undefined, []], summary);
    assert.equal(typeof result.message, 'string');
    assert.doesNotMatch(String(result.message), /frame/, summary);
  }
});

test('the job runner\'s refusals and a cap race read as the video tools say them', async () => {
  const room = harness({ outcome: { kind: 'no_room' } });
  assert.equal(line(await run(room.collaborators, tool.inputSchema.parse(args())))?.summary, 'Not made: this video has too many saved items');
  const raced = harness({ outcome: { kind: 'interrupted', jobId, cause: 'no_room' } });
  const waiting = await run(raced.collaborators, tool.inputSchema.parse(args()));
  assert.deepEqual([waiting.reason, waiting.jobId, line(waiting)?.summary], ['waiting_for_room', jobId, 'Not saved yet: this video has too many saved items']);
  assert.match(String(waiting.message), new RegExp(`resume set to "${jobId}"`));
  // Where generate-video points at its frames, generate-shot points at the panels, the sheets or the motion prompt.
  const images = harness({ outcome: { kind: 'invalid', detail: 'referenceImages.dimensions' } });
  const invalid = await run(images.collaborators, tool.inputSchema.parse(args()));
  assert.deepEqual([invalid.reason, line(invalid)?.summary], ['invalid', 'Not made: the request wasn’t valid']);
  assert.match(String(invalid.message), /generate-panel/); assert.match(String(invalid.message), /generate-sheet/);
  assert.doesNotMatch(String(invalid.message), /field|frame/);
  const unchecked = harness({ outcome: { kind: 'failed', jobId, reason: 'check_refused' } });
  const checks = await run(unchecked.collaborators, tool.inputSchema.parse(args()));
  assert.deepEqual([checks.reason, line(checks)?.summary], ['checks', 'Not saved: the video didn’t pass checks']);
  assert.match(String(checks.message), /media checks/); assert.doesNotMatch(String(checks.message), /frame/);
  const lost = harness({ outcome: { kind: 'input_not_found' } });
  assert.match(String((await run(lost.collaborators, tool.inputSchema.parse(args()))).message), /make the Shot's panels or the sheet again/); assert.doesNotMatch(String((await run(lost.collaborators, tool.inputSchema.parse(args()))).message), /frame/);
  const refused = harness({ outcome: { kind: 'failed', jobId, reason: 'provider_error', provider: 'invalid_request' } });
  const content = await run(refused.collaborators, tool.inputSchema.parse(args()));
  assert.deepEqual([content.reason, line(content)?.summary], ['refused', 'Not made: MiniMax refused the request']);
  assert.match(String(content.message), /motion prompt/); assert.doesNotMatch(String(content.message), /frames/);
  const stopped = harness({ outcome: { kind: 'interrupted', jobId } });
  assert.equal(line(await run(stopped.collaborators, tool.inputSchema.parse(args())))?.summary, 'Stopped waiting for the video');
});
