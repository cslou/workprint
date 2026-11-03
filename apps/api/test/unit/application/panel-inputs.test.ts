import assert from 'node:assert/strict';
import { test } from 'node:test';
import { panelInputs, type OwnedWorkspace, type PanelRequest } from '../../../src/application/index.js';

type Version = OwnedWorkspace['assets'][number]['version'];
type Shot = OwnedWorkspace['storyboard']['shots'][number];
type Reference = NonNullable<Shot['references']>[number];

const base = (id: string, createdBy: 'human' | 'assistant' = 'human', revision = 1) => ({ id, artifactId: `artifact-${id}`, revision, createdBy, createdAt: `2026-11-03T10:00:0${revision}.000Z`, dependencies: [] });
const image = (id: string, width = 640, height = 360, createdBy: 'human' | 'assistant' = 'human', revision = 1): Version => ({ ...base(id, createdBy, revision), kind: 'image', media: { contentType: 'image/png', byteSize: 10, width, height } });
const sheet = (id: string, subject: string, kind: 'character' | 'environment' | 'prop', name: string, views: [string, string][]): Version => ({ ...base(id), kind: 'reference',
  content: { schemaVersion: 1, subject: { id: subject, kind, name, description: 'Drawn.', continuityNotes: ['n'] }, references: views.map(([versionId, view]) => ({ versionId, view, notes: [] })) } });
const use = (version: Version, subjectId?: string) => ({ version, use: { id: `use-${version.id}`, versionId: version.id, binding: { purpose: 'reference' as const }, state: 'draft' as const }, state: 'Draft' as const, ...(subjectId ? { subjectId } : {}) });

const subjects = [{ id: 'mara', kind: 'character' as const, name: 'Mara' }, { id: 'the-gallery', kind: 'place' as const, name: 'The Gallery' }, { id: 'the-key', kind: 'prop' as const, name: 'The key' }, { id: 'ben', kind: 'character' as const, name: 'Ben' }];
const script = (listed = subjects): Version => ({ ...base('script'), kind: 'script', content: { schemaVersion: 1, subjects: listed,
  scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters: listed.filter(subject => subject.kind === 'character').map(subject => subject.name), script: [{ action: 'Mara waits.' }] }] } });
// The sheet's own name is older than the script's; while the script lists Mara, the script's name is used.
const maraSheet = sheet('sheet-mara', 'mara', 'character', 'Mara Vale', [['m1', 'Full-body front'], ['m2', 'Three-quarter'], ['m3', 'Face close-up']]);
const gallerySheet = sheet('sheet-gallery', 'the-gallery', 'environment', 'The Gallery', [['g1', 'Wide master'], ['g2', 'Reverse angle']]);
const keySheet = sheet('sheet-key', 'the-key', 'prop', 'The key', [['k1', 'Product view']]);
const benSheet = sheet('sheet-ben', 'ben', 'character', 'Ben', [['b1', 'Full-body front']]);
const views = ['m1', 'm2', 'm3', 'g1', 'g2', 'k1', 'b1'].map(id => image(id));
const references: Reference[] = [{ subjectId: 'the-key', role: 'prop', purpose: 'The brass key.' }, { subjectId: 'the-gallery', role: 'environment', purpose: 'The white room.' }, { subjectId: 'mara', role: 'identity', purpose: 'Her face and coat.' }];
const panel = (panelId: string, order: number, candidates: Version[] = [], approved: string | null = null) => ({ panelId, order, description: `Panel ${panelId}`, references: [], candidateImageVersions: candidates, approvedImageVersionId: approved });

function workspace(options: { shots?: Shot[]; assets?: OwnedWorkspace['assets']; listed?: typeof subjects } = {}): OwnedWorkspace {
  const assets = options.assets ?? [...views.map(version => use(version)), use(image('mara-extra'), 'mara'), use(image('u1')), use(maraSheet), use(gallerySheet), use(keySheet), use(benSheet)];
  const shots = options.shots ?? [{ shotId: 's1', order: 0, intent: 'Mara arrives.', references, panels: [panel('p1', 0), panel('p2', 1)], chosenVideoVersionId: null }];
  return { script: { version: script(options.listed), use: { id: 'use-script', versionId: 'script', binding: { purpose: 'script' }, state: 'draft' }, state: 'Draft' }, assets,
    storyboard: { work: null, shots }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 1 } as OwnedWorkspace;
}
const resolve = (space: OwnedWorkspace, request: Partial<PanelRequest> = {}) => panelInputs(space, { shot: 's1', panel: 'p1', images: [], ...request });
const inputs = (outcome: ReturnType<typeof panelInputs>) => { assert.equal(outcome.kind, 'resolved', JSON.stringify(outcome)); return outcome as Extract<typeof outcome, { kind: 'resolved' }>; };

test('picked views take their reference\'s role and purpose, in role order, with the exact preface', () => {
  const made = inputs(resolve(workspace(), { images: ['g2', 'm3', 'm1'] }));
  assert.deepEqual(made.inputs, [
    { versionId: 'm1', label: 'Mara · Full-body front', job: 'Her face and coat.' },
    { versionId: 'm3', label: 'Mara · Face close-up', job: 'Her face and coat.' },
    { versionId: 'g2', label: 'The Gallery · Reverse angle', job: 'The white room.' },
  ]);
  assert.equal(made.preface, 'Input 1: Mara · Full-body front — Her face and coat.\nInput 2: Mara · Face close-up — Her face and coat.\nInput 3: The Gallery · Reverse angle — The white room.');
  assert.equal(made.size, undefined, 'a first panel has no size to keep');
});

test('empty images pass every referenced sheet whole; other picked images come after the sheet views', () => {
  assert.deepEqual(inputs(resolve(workspace())).inputs.map(input => [input.versionId, input.job]), [
    ['m1', 'Her face and coat.'], ['m2', 'Her face and coat.'], ['m3', 'Her face and coat.'], ['g1', 'The white room.'], ['g2', 'The white room.'], ['k1', 'The brass key.'],
  ]);
  // An image filed under Mara that isn't in her sheet, an upload and an unreferenced subject's view are other images.
  assert.deepEqual(inputs(resolve(workspace(), { images: ['b1', 'mara-extra', 'm2', 'u1'] })).inputs, [
    { versionId: 'm2', label: 'Mara · Three-quarter', job: 'Her face and coat.' },
    { versionId: 'b1', label: 'Ben · Full-body front', job: 'as the prompt describes' },
    { versionId: 'mara-extra', label: 'Image 8 · Version 1', job: 'as the prompt describes' },
    { versionId: 'u1', label: 'Image 9 · Version 1', job: 'as the prompt describes' },
  ]);
});

test('a later panel is made from the sheet views, with panel 1\'s current image last for continuity at its size; a person\'s choice is panel 1\'s image', () => {
  const made = image('p1-v1', 1536, 864, 'assistant'), chosen = image('chosen', 1024, 1024);
  const shots = (first: ReturnType<typeof panel>) => [{ shotId: 's1', order: 0, intent: 'Mara arrives.', references, panels: [first, panel('p2', 1)], chosenVideoVersionId: null }];
  const second = inputs(resolve(workspace({ shots: shots(panel('p1', 0, [made])) }), { panel: 'p2', images: ['m3'] }));
  assert.deepEqual(second.inputs, [{ versionId: 'm3', label: 'Mara · Face close-up', job: 'Her face and coat.' }, { versionId: 'p1-v1', label: 'Shot 1 · Panel 1.1', job: 'match the setting, people and light; not its camera or framing' }]);
  assert.equal(second.preface, 'Input 1: Mara · Face close-up — Her face and coat.\nInput 2: Shot 1 · Panel 1.1 — match the setting, people and light; not its camera or framing');
  assert.deepEqual(second.size, { width: 1536, height: 864 });
  const over = inputs(resolve(workspace({ shots: shots(panel('p1', 0, [made, chosen], 'chosen')) }), { panel: 'p2', images: ['m3'] }));
  assert.deepEqual([over.inputs.at(-1)!.versionId, over.size], ['chosen', { width: 1024, height: 1024 }]);
  // Picking panel 1's image too keeps it last, for continuity only.
  assert.deepEqual(inputs(resolve(workspace({ shots: shots(panel('p1', 0, [made])) }), { panel: 'p2', images: ['p1-v1', 'm3'] })).inputs.map(input => [input.versionId, input.job]), [['m3', 'Her face and coat.'], ['p1-v1', 'match the setting, people and light; not its camera or framing']]);
});

test('refusals: no first-panel image, an unknown Shot or panel, an image the video doesn\'t use, more than 10 inputs', () => {
  assert.deepEqual(resolve(workspace(), { panel: 'p2' }), { kind: 'needs_first_panel' });
  assert.deepEqual(resolve(workspace(), { shot: 's9' }), { kind: 'not_found' });
  assert.deepEqual(resolve(workspace(), { panel: 'p9' }), { kind: 'not_found' });
  assert.deepEqual(resolve(workspace(), { images: ['m1', 'someone-elses'] }), { kind: 'image_not_found' });
  const many = Array.from({ length: 10 }, (_, index) => image(`x${index}`)), extra = image('x10');
  const space = workspace({ assets: [...[...many, extra].map(version => use(version)), use(maraSheet), ...views.map(version => use(version))] });
  // 11 listed that de-duplicate to 10 resolve; 11 distinct are too many.
  assert.equal(inputs(resolve(space, { images: [...many.map(version => version.id), 'x0'] })).inputs.length, 10);
  assert.deepEqual(resolve(space, { images: [...many, extra].map(version => version.id) }), { kind: 'too_many', count: 11 });
});

test('a composition reference sorts after prop, and sheets resolve to the subject\'s current one', () => {
  const composed: Reference[] = [{ subjectId: 'ben', role: 'composition', purpose: 'Ben at the edge.' }, ...references];
  const space = workspace({ shots: [{ shotId: 's1', order: 0, intent: 'Two people.', references: composed, panels: [panel('p1', 0)], chosenVideoVersionId: null }] });
  assert.deepEqual(inputs(resolve(space, { images: ['b1', 'k1', 'm1'] })).inputs.map(input => [input.versionId, input.job]), [['m1', 'Her face and coat.'], ['k1', 'The brass key.'], ['b1', 'Ben at the edge.']]);
  // Mara's sheet was redone after the storyboard was saved: its current views are used.
  const redone = sheet('sheet-mara-2', 'mara', 'character', 'Mara', [['m4', 'Full-body front'], ['m3', 'Face close-up']]);
  const current = workspace({ assets: [...views.map(version => use(version)), use(image('m4')), use(redone), use(gallerySheet), use(keySheet)] });
  assert.deepEqual(inputs(resolve(current)).inputs.slice(0, 2).map(input => [input.versionId, input.label]), [['m4', 'Mara · Full-body front'], ['m3', 'Mara · Face close-up']]);
  // A referenced subject with no sheet adds nothing.
  const sheetless = workspace({ assets: [...views.map(version => use(version)), use(maraSheet)] });
  assert.deepEqual(inputs(resolve(sheetless)).inputs.map(input => input.versionId), ['m1', 'm2', 'm3']);
});

test('a referenced subject that left the script is gone, named by its sheet or its id', () => {
  assert.deepEqual(resolve(workspace({ listed: subjects.filter(subject => subject.id !== 'mara') })), { kind: 'subject_gone', subjectName: 'Mara Vale' });
  const keyless = workspace({ listed: subjects.filter(subject => subject.id !== 'the-key'), assets: [...views.map(version => use(version)), use(maraSheet), use(gallerySheet)] });
  assert.deepEqual(resolve(keyless), { kind: 'subject_gone', subjectName: 'the-key' });
});

test('later panels of a person\'s three-panel Shot take panel 1 for continuity, with its size', () => {
  const first = image('p1-v1', 800, 600, 'assistant');
  const space = workspace({ shots: [
    { shotId: 's0', order: 0, intent: 'Before.', panels: [panel('q1', 0)], chosenVideoVersionId: null },
    { shotId: 's1', order: 1, intent: 'Three beats.', panels: [panel('p3', 2), panel('p1', 0, [first]), panel('p2', 1)], chosenVideoVersionId: null },
  ] });
  const third = inputs(resolve(space, { panel: 'p3' }));
  assert.deepEqual(third.inputs, [{ versionId: 'p1-v1', label: 'Shot 2 · Panel 2.1', job: 'match the setting, people and light; not its camera or framing' }]);
  assert.deepEqual(third.size, { width: 800, height: 600 });
});

test('another panel\'s image is named by its panel and version, by its first panel in story order', () => {
  const earlier = image('q-v2', 640, 360, 'assistant', 2), shared = image('shared', 640, 360, 'assistant');
  // Stored out of story order, and one image bound to two panels, the later one stored last: the listing names it by
  // its first panel in story order.
  const space = workspace({ shots: [
    { shotId: 's1', order: 2, intent: 'Mara arrives.', references, panels: [panel('p1', 0)], chosenVideoVersionId: null },
    { shotId: 'sa', order: 0, intent: 'First.', panels: [panel('a0', 0), panel('a1', 1, [earlier, shared])], chosenVideoVersionId: null },
    { shotId: 'sb', order: 1, intent: 'Later.', panels: [panel('b1', 0, [shared])], chosenVideoVersionId: null },
  ] });
  assert.deepEqual(inputs(resolve(space, { images: ['q-v2', 'shared'] })).inputs, [
    { versionId: 'q-v2', label: 'Shot 1 · Panel 1.2 · Version 2', job: 'as the prompt describes' },
    { versionId: 'shared', label: 'Shot 1 · Panel 1.2 · Version 1', job: 'as the prompt describes' },
  ]);
});

test('only a subject\'s first current sheet is passed; a view of its other sheet is another image', () => {
  const second = sheet('sheet-mara-b', 'mara', 'character', 'Mara', [['m9', 'Back view']]);
  const space = workspace({ assets: [...views.map(version => use(version)), use(image('m9')), use(maraSheet), use(second), use(gallerySheet), use(keySheet)] });
  assert.deepEqual(inputs(resolve(space)).inputs.slice(0, 3).map(input => input.versionId), ['m1', 'm2', 'm3']);
  assert.ok(!inputs(resolve(space)).inputs.some(input => input.versionId === 'm9'));
  assert.deepEqual(inputs(resolve(space, { images: ['m9', 'm1'] })).inputs, [
    { versionId: 'm1', label: 'Mara · Full-body front', job: 'Her face and coat.' },
    { versionId: 'm9', label: 'Mara · Back view', job: 'as the prompt describes' },
  ]);
});

test('a later panel\'s panel 1 counts toward the 10-input limit', () => {
  const first = image('p1-v1', 640, 360, 'assistant'), many = Array.from({ length: 10 }, (_, index) => image(`x${index}`));
  const space = workspace({ assets: many.map(version => use(version)), shots: [{ shotId: 's1', order: 0, intent: 'Mara arrives.', panels: [panel('p1', 0, [first]), panel('p2', 1)], chosenVideoVersionId: null }] });
  assert.deepEqual(resolve(space, { panel: 'p2', images: many.map(version => version.id) }), { kind: 'too_many', count: 11 });
  assert.equal(inputs(resolve(space, { panel: 'p2', images: many.slice(0, 9).map(version => version.id) })).inputs.length, 10);
});
