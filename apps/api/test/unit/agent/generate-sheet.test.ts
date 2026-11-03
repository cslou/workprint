import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { z } from 'zod';
import { productionTools, projectToolActivity, type AgentCollaborators, type ToolContext } from '../../../src/agent/index.js';
import { sheetViewPrompt, type AssistantSheetOutcome, type OwnedWorkspace } from '../../../src/application/index.js';
import { MetaImageError, type ImageResult } from '../../../src/generation/index.js';

const tool = productionTools.find(candidate => candidate.id === 'generate-sheet')!;
const png = { bytes: new Uint8Array([137, 80, 78, 71]), contentType: 'image/png' as const };
const scope = { accountId: randomUUID(), videoId: randomUUID() };
const subjects = [{ id: 'mara', kind: 'character', name: 'Mara' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }, { id: 'the-key', kind: 'prop', name: 'The key' }] as const;
const script = { schemaVersion: 1, subjects, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters: ['Mara'], script: [{ action: 'Mara holds the key.' }] }] };
type Sheet = { subject: string; views: string[]; names?: string[] };

const version = (id: string, kind: string, content?: unknown) => ({ id, artifactId: randomUUID(), kind, revision: 1, ...(content ? { content } : { media: { contentType: 'image/png', byteSize: 4, width: 64, height: 48 } }), createdBy: 'assistant', createdAt: new Date().toISOString(), dependencies: [] });
const asset = (item: ReturnType<typeof version>) => ({ version: item, use: { id: randomUUID(), versionId: item.id, binding: { purpose: 'reference' }, state: 'draft' }, state: 'Draft' });
const sheetContent = (sheet: Sheet) => ({ schemaVersion: 1, subject: { id: sheet.subject, kind: 'character', name: sheet.subject, description: 'A courier.', continuityNotes: ['Keep the coat.'] }, references: sheet.views.map((versionId, index) => ({ versionId, view: sheet.names?.[index] ?? `View ${index + 1}`, notes: [] })) });
/** The video's work: its script (unless `script` is false), its images and its current sheets. */
const workspace = (images: string[], sheets: (Sheet & { id: string })[], withScript = true) => ({
  script: withScript ? { version: version(randomUUID(), 'script', script), use: null, state: 'Draft' } : null,
  assets: [...images.map(id => asset(version(id, 'image'))), ...sheets.map(sheet => asset(version(sheet.id, 'reference', sheetContent(sheet))))],
  storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: '0',
}) as unknown as OwnedWorkspace;

type Options = { saves?: ('refused' | 'unavailable')[]; images?: string[]; sheets?: (Sheet & { id: string })[]; script?: boolean; room?: number; save?: AssistantSheetOutcome; meta?: (call: number) => Promise<ImageResult>; noClient?: boolean; unreadable?: boolean };
/** Fake collaborators over one video: Meta answers each call with `meta`, and the sheet save answers `save`. */
function harness(options: Options = {}) {
  const images = [...(options.images ?? [])], calls = { generate: 0, edit: 0, saves: [] as unknown[], edits: [] as string[], inputs: [] as string[][], subjects: [] as (string | undefined)[] };
  const failing = [...(options.saves ?? [])];
  const meta = options.meta ?? (async () => ({ images: [png], requestId: null, usage: null }));
  const collaborators: AgentCollaborators = {
    readWorkspace: async () => options.unreadable ? { kind: 'unavailable' } : { kind: 'found', workspace: workspace(images, options.sheets ?? [], options.script ?? true) },
    saveScript: async () => ({ kind: 'unavailable' }), saveStoryboard: async () => ({ kind: 'unavailable' }),
    readImageInputs: async (_account, _video, ids) => { calls.edits.push(...ids); return ids.every(id => images.includes(id) || options.sheets?.some(sheet => sheet.views.includes(id))) ? { kind: 'read', images: ids.map(versionId => ({ versionId, dataUrl: 'data:image/png;base64,AA==', width: 64, height: 48 })) } : { kind: 'not_found' }; },
    saveGeneratedImage: async (_account, _video, image) => {
      const kind = failing.shift();
      if (kind) return { kind };
      const versionId = randomUUID(); images.push(versionId); calls.inputs.push([...image.inputs]); calls.subjects.push(image.subject);
      return { kind: 'saved', versionId, width: 64, height: 48, subjectLeft: false };
    },
    sheets: {
      save: async (_account, _video, input) => { calls.saves.push(input); return options.save ?? { kind: 'saved', versionId: randomUUID(), revision: 1, subjectName: 'Mara' }; },
      useRoom: async () => ({ kind: 'room', room: options.room ?? 100 }),
      readView: async () => ({ kind: 'not_found' }),
    },
    ...(options.noClient ? {} : { images: {
      generate: async () => meta(calls.generate++ + calls.edit),
      edit: async () => meta(calls.generate + calls.edit++),
    } }),
  };
  return { collaborators, images, calls };
}
const views = (...names: string[]) => names.map(view => ({ view, prompt: `${view} pose` }));
const input = (extra: Record<string, unknown> = {}) => ({ subject: 'mara', description: 'A courier in a long grey coat.', continuityNotes: ['Keep the grey coat.'], views: views('Full-body front'), ...extra });
const run = (collaborators: AgentCollaborators, args: Record<string, unknown>) => {
  const signal = new AbortController().signal;
  return tool.execute(args, { scope, collaborators, signal, abortReason: () => undefined } satisfies ToolContext) as Promise<{ made: boolean; reason?: string; message: string; views?: { view: string; versionId: string }[] }>;
};
const summary = (output: unknown) => projectToolActivity(productionTools, { toolCallId: 'call_1', toolName: 'generate-sheet', state: 'done', input: input(), output })?.summary;

test('"null" means no identity and no image: the view is made from its prompt alone', async () => {
  const { collaborators, calls } = harness();
  const result = await run(collaborators, input({ identity: 'null', views: [{ view: 'Front', prompt: 'Standing', image: ' null ' }] }));
  assert.equal(result.made, true, JSON.stringify(result));
  assert.deepEqual([calls.generate, calls.edit], [1, 0]);
  assert.deepEqual(calls.subjects, ['mara'], 'a made view is filed under its subject');
  // The model is offered no nullable field.
  assert.ok(!JSON.stringify(z.toJSONSchema(tool.inputSchema)).includes('"null"'));
});

test('a view needs an image or a prompt, and two views can\'t share a name ignoring case and spaces', async () => {
  for (const given of [[{ view: 'Front', prompt: ' ' }], [{ view: 'Front', prompt: 'a' }, { view: ' front ', prompt: 'b' }]]) {
    const { collaborators, calls } = harness();
    const result = await run(collaborators, input({ views: given }));
    assert.deepEqual([result.made, result.reason, summary(result)], [false, 'invalid', 'Not made: the sheet wasn’t valid (views)']);
    assert.equal(calls.generate + calls.edit, 0);
  }
});

test('each kind\'s prompt is the keep line with an identity input, then the frame framed for its kind, then the view\'s prompt', () => {
  const request = { description: 'Seen at night.', continuityNotes: ['Keep it', 'Same light'] };
  // A person or object stands on a plain background; a place fills the frame, since a plain page around it is drawn as a mounted picture.
  const plain = 'Show this single view only, on a plain neutral background with even light, with no text, labels, borders or other views.';
  const framing = { character: plain, place: 'Show this single view only, with the place itself filling the whole frame, and no text, labels, borders, background page or other views.', prop: plain };
  const frame = (name: string, kind: keyof typeof framing) => `One reference view of ${name}, a ${kind}, for a reference sheet: Wide. Seen at night. Keep consistent: Keep it; Same light. ${framing[kind]}`;
  const keep = {
    character: 'Keep the same person as the input image: the same face, build, hair and clothing.',
    place: 'Keep the same place as the input image: the same layout, architecture and light.',
    prop: 'Keep the same object as the input image: the same design, shape and materials.',
  };
  for (const subject of subjects) {
    assert.equal(sheetViewPrompt(subject, request, { view: 'Wide', prompt: ' From the door ' }, true), `${keep[subject.kind]}\n\n${frame(subject.name, subject.kind)}\n\nFrom the door`);
    assert.equal(sheetViewPrompt(subject, request, { view: 'Wide', prompt: 'From the door' }, false), `${frame(subject.name, subject.kind)}\n\nFrom the door`);
  }
});

test('the line shows the sheet\'s images in view order, and a refusal shows none', async () => {
  const kept = randomUUID();
  const { collaborators, images } = harness({ images: [kept], save: { kind: 'saved', versionId: randomUUID(), revision: 2, subjectName: 'Mara' } });
  const result = await run(collaborators, input({ views: [{ view: 'Front', prompt: 'Standing' }, { view: 'Coat', image: kept }, { view: 'Face', prompt: 'Close' }] }));
  const media = projectToolActivity(productionTools, { toolCallId: 'call_1', toolName: 'generate-sheet', state: 'done', output: result })?.media;
  assert.deepEqual(media, [images[1], kept, images[2]].map(versionId => ({ kind: 'image', versionId })));
  assert.deepEqual(result.views?.map(view => view.view), ['Front', 'Coat', 'Face']);
  assert.equal(summary(result), 'Saved Mara · Version 2');
  const refused = await run(harness({ script: false }).collaborators, input());
  assert.equal(projectToolActivity(productionTools, { toolCallId: 'call_1', toolName: 'generate-sheet', state: 'done', output: refused })?.media, undefined);
});

test('every outcome has its line and a message the model can follow', async () => {
  const image = randomUUID(), base = { id: randomUUID(), subject: 'mara', views: [randomUUID(), randomUUID(), randomUUID(), randomUUID()] };
  const policy = async (): Promise<ImageResult> => { throw new MetaImageError('content_policy'); };
  const cases: [string, Options, Record<string, unknown>, string, RegExp][] = [
    ['unsaveable', { noClient: true }, input(), 'Not made: images can’t be saved on this server', /nothing was sent to Meta/],
    ['no_script', { script: false }, input(), 'Not made: there is no script yet; write it first', /update-script first/],
    ['not_in_script', {}, input({ subject: 'ben' }), 'Not made: that subject isn’t in the script', /subject id from read-workspace/],
    ['image_not_found', {}, input({ identity: randomUUID() }), 'Not made: an image wasn’t found', /Call read-workspace/],
    ['too_many_views', { sheets: [base] }, input({ views: views('Side', 'Back') }), 'Not made: a sheet holds at most 5 views', /more than 5 views/],
    ['too_long', { sheets: [{ ...base, views: [...base.views, randomUUID(), randomUUID()] }] }, input(), 'Not made: Mara’s sheet has over 5 views; trim it first', /remove views in Assets/],
    ['in_other_sheet', { images: [image], sheets: [{ id: randomUUID(), subject: 'the-key', views: [image] }] }, input({ views: [{ view: 'Front', image }] }), 'Not made: that image is already in The key’s sheet', /in one sheet only\. Make a new view instead/],
    ['no_room', { room: 1 }, input({ views: views('Front', 'Face') }), 'Not made: this video has too many saved items', /no room/],
    ['work_unavailable', { unreadable: true }, input(), 'Not made: saved work is unavailable', /could not be reached/],
    ['content_policy', { meta: policy }, input(), 'Not made: the request was refused', /Rephrase.*No sheet was saved/],
    ['stale', { save: { kind: 'stale' } }, input(), 'Not saved: the sheet changed; views kept as images', /kept as draft images: Full-body front \(/],
    ['in_other_sheet', { save: { kind: 'in_other_sheet', subjectName: 'The key' } }, input(), 'Not saved: an image is already in The key’s sheet', /another subject's sheet/],
    ['no_room', { save: { kind: 'no_room' } }, input(), 'Not saved: this video has too many saved items', /ran out of room/],
    ['not_saved', { save: { kind: 'unavailable' } }, input(), 'Not saved: the sheet couldn’t be saved', /do not retry/],
    ['not_found', { save: { kind: 'not_found' } }, input(), 'Not saved: an image wasn’t found; views kept as images', /no longer one this video uses/],
    ['invalid', { save: { kind: 'invalid', field: 'text' } }, input(), 'Not saved: the sheet wasn’t valid; views kept as images', /text or views were refused/],
    ['not_in_script', { save: { kind: 'not_in_script' } }, input(), 'Not saved: the subject left the script; views kept', /no longer in the script/],
    ['not_in_script', { save: { kind: 'no_script' } }, input(), 'Not saved: the subject left the script; views kept', /no longer in the script/],
    ['unrevisable', { sheets: [{ ...base, views: base.views.slice(0, 2), names: ['x'.repeat(81), 'Side'] }] }, input(), 'Not made: Mara’s sheet can’t be changed here', /rename that view in Assets/],
    ['in_other_sheet', { sheets: [{ ...base, views: [image] }, { id: randomUUID(), subject: 'the-key', views: [image] }] }, input(), 'Not made: that image is already in The key’s sheet', /already shares it, so ask the person to remove it/],
    ['in_other_sheet', { sheets: [{ ...base, views: [image] }, { id: randomUUID(), subject: 'the-key', views: [image] }] }, input({ views: views('View 1') }), 'Not made: that image is already in The key’s sheet', /already shares it, so ask the person to remove it/],
    ['checks', { saves: ['refused'] }, input(), 'Not saved: the image didn’t pass checks', /did not pass the media checks.*No sheet was saved/],
    ['not_saved', { saves: ['unavailable'] }, input(), 'Not saved: the image couldn’t be stored', /saving is unavailable.*No sheet was saved/],
  ];
  for (const [reason, options, args, line, message] of cases) {
    const result = await run(harness(options).collaborators, args);
    assert.deepEqual([result.made, result.reason, summary(result)], [false, reason, line], reason);
    assert.match(result.message, message, reason);
  }
  // A view that fails after the first is named with why; the sheet holds the others.
  const third = await run(harness({ meta: async call => { if (call === 2) throw new MetaImageError('unavailable'); return { images: [png], requestId: null, usage: null }; } }).collaborators, input({ views: views('Front', 'Side', 'Face') }));
  assert.equal(summary(third), 'Saved Mara · Version 1 · 2 of 3 views');
  assert.deepEqual((third as unknown as { missing: unknown[] }).missing, [{ view: 'Face', reason: 'unavailable', message: 'Not made: Meta image generation is unavailable right now. Tell the user; do not retry more than once in this turn.' }]);
  // A call the schema refuses ends its line too.
  assert.equal(summary({ error: true }), 'Not made: the sheet wasn’t valid');
});

test('the identity rule: a new sheet\'s first existing image keeps the made views, and nothing is saved when none is made', async () => {
  const existing = randomUUID(), photo = randomUUID();
  const first = harness({ images: [existing] });
  const made = await run(first.collaborators, input({ views: [{ view: 'Coat', image: existing }, { view: 'Face', prompt: 'Close' }] }));
  assert.equal(made.made, true, JSON.stringify(made));
  assert.deepEqual([first.calls.generate, first.calls.edit, first.calls.edits, first.calls.inputs], [0, 1, [existing], [[existing]]]);
  // With identity, every made view failing saves no sheet.
  const failed = harness({ images: [photo], meta: async () => { throw new MetaImageError('unavailable'); } });
  const none = await run(failed.collaborators, input({ identity: photo, views: views('Front', 'Face') }));
  assert.deepEqual([none.made, none.reason, failed.calls.edit, failed.calls.saves.length], [false, 'unavailable', 2, 0]);
  // One image in two views is invalid, before any call.
  const twice = harness({ images: [existing] });
  const repeated = await run(twice.collaborators, input({ views: [{ view: 'Coat', image: existing }, { view: 'Back', image: existing }] }));
  assert.deepEqual([repeated.reason, twice.calls.generate + twice.calls.edit], ['invalid', 0]);
});
