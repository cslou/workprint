import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { z } from 'zod';
import { productionTools, projectToolActivity, type AgentCollaborators, type ToolContext } from '../../../src/agent/index.js';
import type { OwnedWorkspace, PanelSaveOutcome } from '../../../src/application/index.js';
import { MetaImageError, type ImageResult } from '../../../src/generation/index.js';
import { unusedSheets } from '../../support/unused-sheets.js';

const tool = productionTools.find(candidate => candidate.id === 'generate-panel')!;
const scope = { accountId: randomUUID(), videoId: randomUUID() };
const madeId = randomUUID();
const png = { bytes: new Uint8Array([137, 80, 78, 71]), contentType: 'image/png' as const };
const subjects = [{ id: 'mara', kind: 'character', name: 'Mara' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }];
const media = (width = 64, height = 48) => ({ contentType: 'image/png', byteSize: 4, width, height });
const version = (id: string, kind: string, body: Record<string, unknown>, createdBy = 'assistant') => ({ id, artifactId: `artifact-${id}`, kind, revision: 1, ...body, createdBy, createdAt: new Date().toISOString(), dependencies: [] });
const asset = (item: ReturnType<typeof version>) => ({ version: item, use: { id: randomUUID(), versionId: item.id, binding: { purpose: 'reference' }, state: 'draft' }, state: 'Draft' });
const sheet = (id: string, subject: string, kind: string, name: string, views: [string, string][]) => version(id, 'reference', { content: { schemaVersion: 1, subject: { id: subject, kind, name, description: 'Drawn.', continuityNotes: ['n'] }, references: views.map(([versionId, view]) => ({ versionId, view, notes: [] })) } });

/** The video: Mara's and the Gallery's sheets, and one Shot naming both, whose first panel has `first` as its image. */
function workspace(options: { listed?: typeof subjects; first?: ReturnType<typeof version> } = {}) {
  const listed = options.listed ?? subjects;
  const content = { schemaVersion: 1, subjects: listed, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters: ['Mara'], script: [{ action: 'Mara waits.' }] }] };
  const views = ['m1', 'm2', 'g1'].map(id => asset(version(id, 'image', { media: media() })));
  const panel = (panelId: string, order: number, candidates: unknown[] = []) => ({ panelId, order, description: `Panel ${panelId}`, references: [], candidateImageVersions: candidates, approvedImageVersionId: null });
  return {
    script: { version: version('script', 'script', { content }), use: null, state: 'Draft' },
    assets: [...views, asset(sheet('sheet-mara', 'mara', 'character', 'Mara', [['m1', 'Full-body front'], ['m2', 'Face close-up']])), asset(sheet('sheet-gallery', 'the-gallery', 'environment', 'The Gallery', [['g1', 'Wide master']]))],
    storyboard: { work: null, shots: [{ shotId: 's1', order: 0, intent: 'Mara arrives.', references: [{ subjectId: 'mara', role: 'identity', purpose: 'Her face.' }, { subjectId: 'the-gallery', role: 'environment', purpose: 'The room.' }],
      panels: [panel('p1', 0, options.first ? [options.first] : []), panel('p2', 1)], chosenVideoVersionId: null }] },
    videos: [], pendingQuestion: null, activeWork: [], selectionRevision: '0',
  } as unknown as OwnedWorkspace;
}

type Options = { space?: OwnedWorkspace; room?: 'room' | 'no_room' | 'unavailable'; save?: PanelSaveOutcome; meta?: () => Promise<ImageResult>; noClient?: boolean; noPanels?: boolean; unreadable?: boolean };
/** Fake collaborators over one video; the calls each one got are recorded. */
function harness(options: Options = {}) {
  const calls = { generate: [] as Record<string, unknown>[], edit: [] as Record<string, unknown>[], reads: [] as string[][], saves: [] as unknown[] };
  const space = options.space ?? workspace();
  const answer = options.meta ?? (async () => ({ images: [png], requestId: null, usage: null }));
  const collaborators: AgentCollaborators = {
    readWorkspace: async () => options.unreadable ? { kind: 'unavailable' } : { kind: 'found', workspace: space },
    saveScript: async () => ({ kind: 'unavailable' }), saveStoryboard: async () => ({ kind: 'unavailable' }), sheets: unusedSheets, saveGeneratedImage: async () => ({ kind: 'unavailable' }),
    readImageInputs: async (_account, _video, ids) => { calls.reads.push([...ids]); return { kind: 'read', images: ids.map(versionId => ({ versionId, dataUrl: `data:image/png;base64,${versionId}`, width: 64, height: 48 })) }; },
    ...(options.noPanels ? {} : { panelImages: {
      hasRoom: async () => ({ kind: options.room ?? 'room' as const }),
      save: async (_account: string, _video: string, input: Record<string, unknown>) => { calls.saves.push({ ...input, bytes: undefined }); return options.save ?? { kind: 'saved', versionId: madeId, gone: false }; },
    } satisfies AgentCollaborators['panelImages'] }),
    ...(options.noClient ? {} : { images: {
      generate: async request => { calls.generate.push(request as unknown as Record<string, unknown>); return answer(); },
      edit: async request => { calls.edit.push(request as unknown as Record<string, unknown>); return answer(); },
    } }),
  };
  return { collaborators, calls };
}
const run = (collaborators: AgentCollaborators, args: Record<string, unknown>) =>
  tool.execute(args, { scope, collaborators, signal: new AbortController().signal, abortReason: () => undefined } satisfies ToolContext) as Promise<{ made: boolean; reason?: string; message: string; label?: string }>;
const input = (extra: Record<string, unknown> = {}) => ({ shot: 's1', panel: 'p1', prompt: 'Preserve the room. Change only: Mara steps in.', ...extra });
const summary = (output: unknown) => projectToolActivity(productionTools, { toolCallId: 'call_1', toolName: 'generate-panel', state: 'done', input: input(), output })?.summary;

test('empty and "null" images are harmless: they name no image, and the Shot\'s sheets go to Meta with their preface', async () => {
  const { collaborators, calls } = harness();
  const result = await run(collaborators, input({ images: ['', ' null ', 'm2'], size: '1536x1024' }));
  assert.equal(result.made, true, JSON.stringify(result));
  assert.deepEqual(calls.reads, [['m2']]);
  assert.equal(calls.edit.length, 1);
  assert.deepEqual([calls.edit[0]!.prompt, calls.edit[0]!.size, calls.edit[0]!.n], ['Input 1: Mara · Face close-up — Her face.\n\nPreserve the room. Change only: Mara steps in.', '1536x1024', 1]);
  assert.deepEqual(calls.edit[0]!.images, [{ dataUrl: 'data:image/png;base64,m2' }]);
  assert.deepEqual(calls.saves, [{ shotId: 's1', panelId: 'p1', contentType: 'image/png', inputs: ['m2'], bytes: undefined }]);
  // The model is offered no nullable field.
  assert.ok(!JSON.stringify(z.toJSONSchema(tool.inputSchema)).includes('"null"'));
});

test('a panel\'s shape must suit a Shot video\'s frame: width ÷ height strictly between 0.4 and 2.5, on every call', () => {
  for (const size of ['auto', '1536x1024', '1050x2600', '2400x1000']) assert.equal(tool.inputSchema.safeParse(input({ size })).success, true, size);
  for (const size of ['4000x1000', '1000x2600', '1024x2560', '2500x1000']) assert.equal(tool.inputSchema.safeParse(input({ size })).success, false, size);
  // A later panel ignores its size, but an unusable one is still refused, as its description says.
  assert.equal(tool.inputSchema.safeParse(input({ panel: 'p2', size: '4000x1000' })).success, false);
});

test('a later panel takes the sheet views, then the first panel\'s image last, and its size; the given size is ignored', async () => {
  const first = version('p1-v1', 'image', { media: media(1536, 864) });
  const { collaborators, calls } = harness({ space: workspace({ first }) });
  assert.equal((await run(collaborators, input({ panel: 'p2', images: ['g1'], size: '1024x1024' }))).made, true);
  assert.deepEqual(calls.reads, [['g1', 'p1-v1']]);
  assert.equal(calls.edit[0]!.size, '1536x864');
  assert.match(String(calls.edit[0]!.prompt), /^Input 1: The Gallery · Wide master — The room\.\nInput 2: Shot 1 · Panel 1\.1 — match the setting, people and light; not its camera or framing\n\n/);
});

test('the saved line names the panel; a panel that left the storyboard says so', async () => {
  const space = workspace();
  const saved = harness({ space });
  // The saved image is named as the workspace names it after the save.
  const named = { ...saved.collaborators, readWorkspace: async () => ({ kind: 'found' as const, workspace: workspace({ first: version(madeId, 'image', { media: media() }) }) }) };
  const result = await run(named, input());
  assert.deepEqual([result.label, summary(result)], ['Shot 1 · Panel 1.1 · Version 1', 'Saved Shot 1 · Panel 1.1 · Version 1']);
  const media0 = projectToolActivity(productionTools, { toolCallId: 'call_1', toolName: 'generate-panel', state: 'done', output: result })?.media;
  assert.deepEqual(media0, [{ kind: 'image', versionId: madeId }]);
  assert.equal(summary({ made: true, versionId: 'x', label: 'Image 7 · Version 1', gone: true }), 'Saved Image 7 · Version 1 (its panel is gone)');
});

test('every refusal before a paid call has its line, and Meta gets no request', async () => {
  const cases: [Options, Record<string, unknown>, string, string][] = [
    [{ noClient: true }, {}, 'unsaveable', 'Not made: images can’t be saved on this server'],
    [{ noPanels: true }, {}, 'unsaveable', 'Not made: images can’t be saved on this server'],
    [{}, { shot: 's9' }, 'not_found', 'Not made: that panel wasn’t found'],
    [{}, { panel: 'p9' }, 'not_found', 'Not made: that panel wasn’t found'],
    [{ space: workspace({ listed: subjects.filter(subject => subject.id !== 'mara') }) }, {}, 'subject_gone', 'Not made: Mara left the script; update the storyboard'],
    [{}, { panel: 'p2' }, 'needs_first_panel', 'Not made: make the first panel first'],
    [{}, { images: ['someone-elses'] }, 'image_not_found', 'Not made: an input image wasn’t found'],
    [{ room: 'no_room' }, {}, 'no_room', 'Not made: this video has too many saved items'],
    [{ room: 'unavailable' }, {}, 'work_unavailable', 'Not made: saved work is unavailable'],
    [{ unreadable: true }, {}, 'work_unavailable', 'Not made: saved work is unavailable'],
  ];
  for (const [options, extra, reason, line] of cases) {
    const { collaborators, calls } = harness(options);
    const result = await run(collaborators, input(extra));
    assert.deepEqual([result.made, result.reason, summary(result)], [false, reason, line], reason);
    assert.ok(line.length <= 60, line);
    assert.match(result.message, /nothing was sent/i, reason);
    assert.deepEqual([calls.generate.length, calls.edit.length, calls.saves.length], [0, 0, 0], reason);
  }
});

test('too many inputs names the count; Meta\'s and the save\'s failures, and a race for the last use, have their lines', async () => {
  const space = workspace();
  // 9 more images the video uses, beside the Shot's three sheet views, are 12 inputs.
  (space.assets as unknown[]).push(...Array.from({ length: 9 }, (_, index) => asset(version(`x${index}`, 'image', { media: media() }))));
  const many = harness({ space });
  const tooMany = await run(many.collaborators, input({ images: ['m1', 'm2', 'g1', ...Array.from({ length: 9 }, (_, index) => `x${index}`)] }));
  assert.deepEqual([tooMany.reason, summary(tooMany)], ['too_many', 'Not made: too many input images (12); choose fewer images']);
  assert.equal(many.calls.edit.length, 0);
  const outcomes: [Options, string, string][] = [
    [{ meta: async () => { throw new MetaImageError('content_policy'); } }, 'content_policy', 'Not made: the request was refused'],
    [{ meta: async () => ({ images: [], requestId: null, usage: null }) }, 'unavailable', 'Not made: Meta is unavailable'],
    [{ save: { kind: 'refused' } }, 'checks', 'Not saved: the image didn’t pass checks'],
    [{ save: { kind: 'unavailable' } }, 'not_saved', 'Not saved: the image couldn’t be stored'],
    [{ save: { kind: 'no_room' } }, 'not_kept', 'Not saved: this video has too many saved items'],
  ];
  for (const [options, reason, line] of outcomes) {
    const { collaborators } = harness(options);
    const result = await run(collaborators, input());
    assert.deepEqual([result.made, result.reason, summary(result)], [false, reason, line], reason);
  }
  const { collaborators } = harness({ save: { kind: 'no_room' } });
  assert.match((await run(collaborators, input())).message, /made the image.*not kept/);
  assert.equal(summary({ error: true }), 'Not made: the request wasn’t valid');
});
