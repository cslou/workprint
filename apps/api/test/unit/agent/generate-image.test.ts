import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { productionTools, projectToolActivity, type AgentCollaborators, type ToolContext } from '../../../src/agent/index.js';
import type { GeneratedImageOutcome, OwnedWorkspace } from '../../../src/application/index.js';
import { MetaImageError, type ImageResult } from '../../../src/generation/index.js';
import { unusedSheets } from '../../support/unused-sheets.js';

const tool = productionTools.find(candidate => candidate.id === 'generate-image')!;
const png = { bytes: new Uint8Array([137, 80, 78, 71]), contentType: 'image/png' as const };
const scope = { accountId: randomUUID(), videoId: randomUUID() };
const workspace = (ids: string[]) => ({ script: null, assets: ids.map(id => ({ version: { id, artifactId: randomUUID(), kind: 'image', revision: 1, media: { contentType: 'image/png', byteSize: 4, width: 64, height: 48 }, createdBy: 'assistant', createdAt: new Date().toISOString(), dependencies: [] }, use: { id: randomUUID(), versionId: id, binding: { purpose: 'reference' }, state: 'draft' }, state: 'Draft' })),
  storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: '0' }) as unknown as OwnedWorkspace;

/** Fake collaborators: `meta` answers the client call, and each save takes the next outcome. */
function harness(meta: () => Promise<ImageResult>, outcomes: (GeneratedImageOutcome['kind'])[] = [], options: { onSave?: (index: number) => void } = {}) {
  const saved: string[] = [], calls = { meta: 0, saves: 0 };
  const collaborators: AgentCollaborators = {
    readWorkspace: async () => ({ kind: 'found', workspace: workspace(saved) }),
    saveScript: async () => ({ kind: 'unavailable' }), sheets: unusedSheets,
    readImageInputs: async () => ({ kind: 'not_found' }),
    saveGeneratedImage: async () => {
      options.onSave?.(calls.saves);
      const kind = outcomes[calls.saves++] ?? 'saved';
      if (kind !== 'saved') return { kind };
      const versionId = randomUUID(); saved.push(versionId);
      return { kind, versionId, width: 64, height: 48 };
    },
    images: { generate: async () => { calls.meta++; return meta(); }, edit: async () => { calls.meta++; return meta(); } },
  };
  return { collaborators, saved, calls };
}
const run = (collaborators: AgentCollaborators, input: Record<string, unknown>, signal = new AbortController().signal) => tool.execute({ prompt: 'A bench', ...input }, { scope, collaborators, signal, abortReason: () => signal.aborted ? 'stop' : undefined } satisfies ToolContext);
const line = (input: Record<string, unknown>, output: unknown) => projectToolActivity(productionTools, { toolCallId: 'call_1', toolName: 'generate-image', state: 'done', input: { prompt: 'A bench', ...input }, output });
const images = (count: number): ImageResult => ({ images: Array.from({ length: count }, () => png), requestId: null, usage: null });

test('a partial save keeps the images that passed and says how many failed', async () => {
  const { collaborators, saved } = harness(async () => images(2), ['refused', 'saved']);
  const result = await run(collaborators, { count: 2 });
  assert.deepEqual(result, { made: true, images: [{ versionId: saved[0], label: 'Image 1 · Version 1', width: 64, height: 48 }], failed: 1, showInChat: false });
  assert.deepEqual(line({ count: 2 }, result), { toolCallId: 'call_1', tool: 'generate-image', phrase: 'Making 2 images…', state: 'done', summary: 'Saved 1 of 2 images' });
  const one = harness(async () => images(1));
  assert.equal(line({}, await run(one.collaborators, {}))?.summary, 'Saved Image 1 · Version 1');
  assert.equal(line({}, {})?.phrase, 'Making an image…');
});

test('each refusal has its line and a message the model can follow, with Meta\'s param only in the message', async () => {
  const refusal = async (collaborators: AgentCollaborators, input: Record<string, unknown> = {}) => {
    const result = await run(collaborators, input) as { made: false; message: string };
    return { summary: line(input, result)?.summary, message: result.message };
  };
  const failing = (code: ConstructorParameters<typeof MetaImageError>[0], param?: string) => harness(async () => { throw new MetaImageError(code, param); }).collaborators;
  const policy = await refusal(failing('content_policy'));
  assert.equal(policy.summary, 'Not made: the request was refused'); assert.match(policy.message, /Rephrase.*or ask the user/);
  const missing = harness(async () => images(1));
  const notFound = await refusal(missing.collaborators, { inputImages: [randomUUID()] });
  assert.equal(notFound.summary, 'Not made: an input image wasn’t found'); assert.match(notFound.message, /Call read-workspace/);
  assert.equal(missing.calls.meta, 0, 'nothing is sent for a missing input');
  for (const code of ['unavailable', 'failed'] as const) {
    const down = await refusal(failing(code));
    assert.equal(down.summary, 'Not made: Meta is unavailable'); assert.match(down.message, /Tell the user; do not retry more than once/);
  }
  const invalid = await refusal(failing('invalid_request', 'images[0].image_url'));
  assert.equal(invalid.summary, 'Not made: the request wasn’t valid'); assert.match(invalid.message, /\(images\[0\]\.image_url\)/);
  const checks = await refusal(harness(async () => images(1), ['refused']).collaborators);
  assert.equal(checks.summary, 'Not saved: the image didn’t pass checks');
  const stored = await refusal(harness(async () => images(1), ['unavailable']).collaborators);
  assert.equal(stored.summary, 'Not saved: the image couldn’t be stored'); assert.match(stored.message, /do not retry/);
  assert.equal(line({}, { error: true })?.summary, 'Not made: the request wasn’t valid');
});

test('Stop during the call saves nothing; Stop after one of two saves keeps that one and saves no second', async () => {
  const during = new AbortController();
  const waiting = harness(() => new Promise((_, reject) => { during.signal.addEventListener('abort', () => reject(new MetaImageError('aborted'))); }));
  const pending = run(waiting.collaborators, {}, during.signal);
  during.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(waiting.calls.saves, 0);
  // A response that arrives after Stop saves nothing.
  const late = new AbortController();
  const arriving = harness(async () => { late.abort(); return images(1); });
  await assert.rejects(run(arriving.collaborators, {}, late.signal), { name: 'AbortError' });
  assert.equal(arriving.calls.saves, 0);

  const after = new AbortController();
  const partway = harness(async () => images(2), [], { onSave: index => { if (index === 0) queueMicrotask(() => after.abort()); } });
  await assert.rejects(run(partway.collaborators, { count: 2 }, after.signal), { name: 'AbortError' });
  assert.equal(partway.calls.saves, 1); assert.equal(partway.saved.length, 1);
});

test('an input named twice is read once, and with no way to save nothing is sent to Meta', async () => {
  const { collaborators, calls } = harness(async () => images(1));
  const id = randomUUID(), read: string[][] = [];
  const reading: AgentCollaborators = { ...collaborators, readImageInputs: async (_account, _video, ids) => { read.push([...ids]); return { kind: 'read', images: ids.map(versionId => ({ versionId, dataUrl: 'data:image/png;base64,AA==', width: 64, height: 48 })) }; } };
  assert.equal((await run(reading, { inputImages: [id, id] }) as { made: boolean }).made, true);
  assert.deepEqual(read, [[id]]);
  const unsaveable: AgentCollaborators = { readWorkspace: reading.readWorkspace, saveScript: reading.saveScript, readImageInputs: reading.readImageInputs, saveGeneratedImage: reading.saveGeneratedImage, sheets: unusedSheets };
  const result = await run(unsaveable, { inputImages: [id] }) as { made: false; message: string };
  assert.equal(line({}, result)?.summary, 'Not made: images can’t be saved on this server'); assert.match(result.message, /nothing was sent to Meta/);
  assert.equal(calls.meta, 1, 'only the first call reached Meta'); assert.equal(read.length, 1, 'no input is read without a way to save');
});

test('revises reaches the save only for one image made from that very image', async () => {
  const id = randomUUID(), other = randomUUID(), revises: (string | undefined)[] = [];
  const { collaborators } = harness(async () => images(2));
  const recording: AgentCollaborators = { ...collaborators,
    readImageInputs: async (_account, _video, ids) => ({ kind: 'read', images: ids.map(versionId => ({ versionId, dataUrl: 'data:image/png;base64,AA==', width: 64, height: 48 })) }),
    saveGeneratedImage: async (account, video, input, signal) => { revises.push(input.revises); return collaborators.saveGeneratedImage(account, video, input, signal); } };
  await run(recording, { inputImages: [id], revises: id, count: 1 });
  await run(recording, { inputImages: [id], revises: other, count: 1 });
  await run(recording, { inputImages: [], revises: id, count: 1 });
  await run(recording, { inputImages: [id], revises: 'null', count: 1 });
  await run(recording, { inputImages: [id], revises: id, count: 2 });
  assert.deepEqual(revises, [id, undefined, undefined, undefined, undefined, undefined]);
});
