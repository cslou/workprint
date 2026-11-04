import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeShot, positionLines, shotReferences, shotVideoPrompt, type NewVideo, type OwnedWorkspace, type ShotMakers } from '../../../src/application/index.js';

type Version = OwnedWorkspace['assets'][number]['version'];
type Shot = OwnedWorkspace['storyboard']['shots'][number];
type Subject = { id: string; kind: 'character' | 'place' | 'prop'; name: string };
/** A subject's sheet: its view image ids, in view order, and its description. */
type Sheet = { subjectId: string; views: string[]; description?: string };

const image = (id: string, revision = 1): Version => ({ id, artifactId: `artifact-${id}`, revision, createdBy: 'assistant', createdAt: `2026-11-03T10:00:0${revision}.000Z`, dependencies: [], kind: 'image', media: { contentType: 'image/png', byteSize: 10, width: 640, height: 360 } });
const panel = (panelId: string, order: number, candidates: Version[] = []) => ({ panelId, order, description: `Panel ${panelId}`, references: [], candidateImageVersions: candidates, approvedImageVersionId: null });
const shot = (fields: Partial<Shot> = {}): Shot => ({ shotId: 's1', order: 0, intent: 'Mara arrives.', panels: [panel('p1', 0, [image('a1')]), panel('p2', 1, [image('b1')])], chosenVideoVersionId: null, ...fields });
const names = (shot: Shot, ...subjectIds: string[]): Shot => ({ ...shot, references: subjectIds.map(subjectId => ({ subjectId, role: 'identity' as const, purpose: 'Them.' })) });
const mara: Subject = { id: 'mara', kind: 'character', name: 'Mara' }, ben: Subject = { id: 'ben', kind: 'character', name: 'Ben' }, gallery: Subject = { id: 'the-gallery', kind: 'place', name: 'The Gallery' };

function workspace(shots: Shot[], subjects: Subject[] = [mara, ben, gallery], sheets: Sheet[] = []): OwnedWorkspace {
  const characters = subjects.filter(subject => subject.kind === 'character').map(subject => subject.name);
  const script = { id: 'script', artifactId: 'artifact-script', revision: 1, createdBy: 'assistant', createdAt: '2026-11-03T10:00:00.000Z', dependencies: [], kind: 'script',
    content: { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters, script: [{ action: 'Mara waits.' }] }], subjects } };
  const assets = sheets.map(sheet => {
    const subject = subjects.find(item => item.id === sheet.subjectId)!;
    const version = { id: `sheet-${sheet.subjectId}`, artifactId: `artifact-sheet-${sheet.subjectId}`, revision: 1, createdBy: 'assistant', createdAt: '2026-11-03T10:00:00.000Z', dependencies: sheet.views, kind: 'reference',
      content: { schemaVersion: 1, subject: { id: subject.id, kind: subject.kind === 'place' ? 'environment' : subject.kind, name: subject.name, description: sheet.description ?? `${subject.name} as drawn.`, continuityNotes: ['Keep it.'] },
        references: sheet.views.map((versionId, index) => ({ versionId, view: `View ${index + 1}`, notes: [] })) } };
    return { version, use: { id: `use-${version.id}`, versionId: version.id, binding: { purpose: 'reference' }, state: 'draft' }, state: 'Draft' };
  });
  return { script: { version: script, use: { id: 'use-script', versionId: 'script', binding: { purpose: 'script' }, state: 'draft' }, state: 'Draft' }, assets,
    storyboard: { work: null, shots }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 1 } as unknown as OwnedWorkspace;
}
const control = { signal: new AbortController().signal, abortReason: () => undefined };
/** Makers over one workspace; `started` keeps each video the job runner was asked for. */
function makers(shots: Shot[] | 'missing', subjects?: Subject[], sheets?: Sheet[]) {
  const started: NewVideo[] = [];
  const value: ShotMakers = {
    readWorkspace: async () => shots === 'missing' ? { kind: 'not_found' } : { kind: 'found', workspace: workspace(shots, subjects, sheets) },
    videos: { start: async (_account, _video, input) => { started.push(input); return { kind: 'no_room' }; } },
  };
  return { value, started };
}
const request = { shot: 's1', prompt: 'A slow push-in.' };
/** The image ids `shotReferences` picks for `shot`. */
const picked = (subject: Shot, subjects?: Subject[], sheets?: Sheet[]) => {
  const result = shotReferences(workspace([subject], subjects, sheets), subject);
  return result.kind === 'picked' ? result.references.map(reference => reference.versionId) : result.kind;
};
const twoViews = (subjectId: string): Sheet => ({ subjectId, views: [`${subjectId}-1`, `${subjectId}-2`] });

test('a Shot\'s references are each named subject\'s first view, then its panels, then second views while room remains', () => {
  const onePanel = names(shot({ panels: [panel('p1', 0, [image('a1')])] }), 'mara', 'the-gallery');
  assert.deepEqual(picked(onePanel, undefined, [twoViews('mara'), twoViews('the-gallery')]), ['mara-1', 'the-gallery-1', 'a1', 'mara-2', 'the-gallery-2']);
  const props = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, kind: 'prop' as const, name: id.toUpperCase() }));
  assert.deepEqual(picked(names(shot(), ...props.map(prop => prop.id)), props, props.map(prop => twoViews(prop.id))), ['a-1', 'b-1', 'c-1', 'd-1', 'e-1', 'a1', 'b1', 'a-2', 'b-2']);
  // Nine subjects leave room for both panels: the first seven first views, then the panels.
  const many = Array.from({ length: 9 }, (_, index) => ({ id: `prop-${index + 1}`, kind: 'prop' as const, name: `Prop ${index + 1}` }));
  assert.deepEqual(picked(names(shot(), ...many.map(prop => prop.id)), many, many.map(prop => twoViews(prop.id))), [...many.slice(0, 7).map(prop => `${prop.id}-1`), 'a1', 'b1']);
});

test('no image is sent twice, a subject without a sheet adds nothing, and only the first and last of more panels are sent', () => {
  const same = names(shot({ panels: [panel('p1', 0, [image('a1')]), panel('p2', 1, [image('a1')])] }), 'mara', 'ben');
  assert.deepEqual(picked(same, undefined, [{ subjectId: 'mara', views: ['mara-1'] }]), ['mara-1', 'a1'], 'Ben has no sheet, and both panels show a1');
  // A person's Shot may have more panels, stored out of order: the first and last by order are sent, and a middle one needs no image.
  const three = shot({ panels: [panel('p3', 2, [image('c1')]), panel('p1', 0, [image('a1'), image('a2', 2)]), panel('p2', 1)] });
  assert.deepEqual(picked(three), ['a2', 'c1'], 'each panel\'s current image');
  assert.equal(picked(shot({ panels: [panel('p1', 0, [image('a1')]), panel('p2', 1)] })), 'needs_panels');
});

test('a sheet view that is also a panel\'s image is sent as the panel, and a view MiniMax wouldn\'t take is left out', () => {
  // Mara's first view is panel 1's image: it keeps the panel's framing label, and her next view takes its place.
  const shared = names(shot({ panels: [panel('p1', 0, [image('mara-1')])] }), 'mara');
  const reused = shotReferences(workspace([shared], undefined, [{ subjectId: 'mara', views: ['mara-1', 'mara-2', 'mara-3'] }]), shared);
  assert.ok(reused.kind === 'picked');
  assert.deepEqual(reused.references.map(reference => [reference.versionId, reference.label.split(',')[0]]), [['mara-2', 'Mara'], ['mara-1', 'the storyboard panel for this Shot. Frame the Shot like this panel.'], ['mara-3', 'Mara']]);
  // A view too narrow (0.25) or too small (200 px) for MiniMax is skipped; one whose size isn't listed is sent.
  const sized = (id: string, width: number, height: number) => ({ version: { ...image(id), media: { contentType: 'image/png', byteSize: 10, width, height } } });
  const subject = names(shot({ panels: [panel('p1', 0, [image('a1')])] }), 'mara');
  const space = workspace([subject], undefined, [{ subjectId: 'mara', views: ['tall', 'small', 'fits', 'unlisted'] }]);
  const listed = { ...space, assets: [...space.assets, sized('tall', 300, 1200), sized('small', 200, 200), sized('fits', 1024, 1024)] } as unknown as OwnedWorkspace;
  const result = shotReferences(listed, subject);
  assert.deepEqual(result.kind === 'picked' && result.references.map(reference => reference.versionId), ['fits', 'a1', 'unlisted']);
});

test('the prompt labels each image, then gives the action, camera note, dialogue in MiniMax\'s form, motion and closing line', () => {
  const characters = new Set(['Mara', 'Ben']);
  const dialogue = [{ character: ' Mara ', text: 'You came.' }, { character: 'Ben', text: 'I did.', delivery: 'off_screen' as const },
    { character: 'Mara', text: 'He always did.', delivery: 'voice_over' as const }, { character: 'Narrator', text: 'Years passed.', delivery: 'voice_over' as const }];
  const subject = names(shot({ action: 'Mara turns to the door.', cameraNote: 'Low angle.', dialogue }), 'mara', 'the-gallery');
  const result = shotReferences(workspace([subject], undefined, [{ subjectId: 'mara', views: ['mara-1'], description: 'A courier in a long grey coat.' }, { subjectId: 'the-gallery', views: ['g-1'], description: 'A long gallery with tall windows' }]), subject);
  assert.ok(result.kind === 'picked');
  assert.equal(shotVideoPrompt(subject, characters, ' A slow push-in. ', result.references), [
    'Image 1: Mara, A courier in a long grey coat. Keep Mara\'s face, hair, build and clothing as shown.',
    'Image 2: The Gallery, A long gallery with tall windows. Keep The Gallery\'s layout, architecture and light as shown.',
    'Image 3: the storyboard panel for this Shot. Frame the Shot like this panel.',
    'Image 4: the Shot\'s last storyboard panel. End the Shot on this framing.',
    '',
    'Mara turns to the door.',
    '',
    'Low angle.',
    '',
    'Mara (S1) says: <d>[English] You came.</d>',
    'Ben (S2), off-screen, says: <d>[English] I did.</d>',
    'Mara (S1) says in an off-screen voiceover: <d>[English] He always did.</d> while Mara\'s lips remain completely closed.',
    'A narrator (S3) says in an off-screen voiceover: <d>[English] Years passed.</d> while every character on screen keeps their lips closed.',
    '',
    'A slow push-in.',
    '',
    'The action completes within the Shot, and it ends on a settled moment.',
  ].join('\n'));
  // Position lines go after the camera note, before the dialogue.
  assert.equal(shotVideoPrompt({ intent: 'Mara arrives.', cameraNote: 'Wide.' }, characters, 'Pan left.', [], ['Positions: starts a; ends b.', 'Previous Shot ended: c.']),
    'Mara arrives.\n\nWide.\n\nPositions: starts a; ends b.\nPrevious Shot ended: c.\n\nNo one speaks.\n\nPan left.\n\nThe action completes within the Shot, and it ends on a settled moment.');
  assert.equal(shotVideoPrompt({ intent: 'Mara arrives.' }, characters, 'Pan left.', []), 'Mara arrives.\n\nNo one speaks.\n\nPan left.\n\nThe action completes within the Shot, and it ends on a settled moment.', 'no action: the intent, and no one speaks');
  const key = { id: 'the-key', kind: 'prop' as const, name: 'The key' }, keyed = names(shot(), 'the-key');
  const label = shotReferences(workspace([keyed], [mara, ben, key], [{ subjectId: 'the-key', views: ['k-1'], description: 'Brass.' }]), keyed);
  assert.ok(label.kind === 'picked');
  assert.equal(label.references[0]!.label, 'The key, Brass. Keep The key\'s design, shape and materials as shown.');
});

test('a long sheet description is cut at a word within 300 characters', () => {
  const long = `${'word '.repeat(70)}end.`, subject = names(shot(), 'mara');
  const result = shotReferences(workspace([subject], undefined, [{ subjectId: 'mara', views: ['mara-1'], description: long }]), subject);
  assert.ok(result.kind === 'picked');
  // The last word that ends within 300 characters: 60 words of 4 letters and their spaces, 299 characters.
  assert.equal(result.references[0]!.label, `Mara, ${'word '.repeat(60).trim()}. Keep Mara's face, hair, build and clothing as shown.`);
});

test('the job is made from the references at 16:9 and the Shot\'s length, or 6 s, and carries the Shot', async () => {
  const subject = names(shot({ durationS: 9 }), 'mara');
  const made = makers([subject], undefined, [twoViews('mara')]);
  assert.deepEqual(await makeShot(made.value, 'account', 'video', request, control), { kind: 'no_room' }, 'the job runner\'s outcome is returned');
  const [started] = made.started;
  assert.deepEqual([started?.referenceImageIds, started?.ratio, started?.durationS, started?.target, 'firstFrame' in started!, 'lastFrame' in started!], [['mara-1', 'a1', 'b1', 'mara-2'], '16:9', 9, { shotId: 's1' }, false, false]);
  assert.match(started!.prompt, /^Image 1: Mara, Mara as drawn\. Keep Mara's face/);
  const untimed = makers([shot()]);
  await makeShot(untimed.value, 'account', 'video', request, control);
  assert.deepEqual([untimed.started[0]?.durationS, untimed.started[0]?.referenceImageIds], [6, ['a1', 'b1']]);
  // The job's prompt carries the Shot's positions and the previous Shot's end; 300-character positions still fit.
  const long = { start: 's'.repeat(300), end: 'e'.repeat(300) };
  const placed = makers([shot({ shotId: 's0', order: 0, positions: long }), shot({ order: 1, positions: long, action: 'Mara kneels.' })]);
  assert.deepEqual(await makeShot(placed.value, 'account', 'video', request, control), { kind: 'no_room' });
  assert.ok(placed.started[0]!.prompt.includes(`Mara kneels.\n\nPositions: starts ${long.start}; ends ${long.end}.\nPrevious Shot ended: ${long.end}.\n\nNo one speaks.`), placed.started[0]!.prompt);
});

test('every refusal comes before the job runner is asked', async () => {
  const cases: [Shot[] | 'missing', Partial<typeof request>, string][] = [
    ['missing', {}, 'work_unavailable'],
    [[shot()], { shot: 'another' }, 'not_found'],
    [[shot({ panels: [panel('p1', 0, [image('a1')]), panel('p2', 1)] })], {}, 'needs_panels'],
    [[shot({ panels: [panel('p1', 0), panel('p2', 1, [image('b1')])] })], {}, 'needs_panels'],
    [[shot({ action: 'x'.repeat(6800) })], {}, 'too_long'],
  ];
  for (const [shots, change, reason] of cases) {
    const made = makers(shots);
    assert.deepEqual(await makeShot(made.value, 'account', 'video', { ...request, ...change }, control), { kind: 'shot_refused', reason }, reason);
    assert.deepEqual(made.started, []);
  }
  // Labels count toward MiniMax's limit: a Shot that fits without them is refused with them.
  const labelled = names(shot({ action: 'x'.repeat(6500) }), 'mara', 'the-gallery');
  const sheets = [{ subjectId: 'mara', views: ['mara-1'], description: 'd '.repeat(150) }, { subjectId: 'the-gallery', views: ['g-1'], description: 'd '.repeat(150) }];
  const crowded = makers([labelled], undefined, sheets);
  assert.deepEqual(await makeShot(crowded.value, 'account', 'video', request, control), { kind: 'shot_refused', reason: 'too_long' });
  assert.deepEqual(crowded.started, []);
  const unsaveable = makers([shot()]);
  assert.deepEqual(await makeShot({ readWorkspace: unsaveable.value.readWorkspace }, 'account', 'video', request, control), { kind: 'shot_refused', reason: 'unsaveable' });
});

const at = (place: string) => [{ subjectId: place, role: 'environment' as const, purpose: 'The room.' }];
const positioned = (shotId: string, order: number, fields: Partial<Shot> = {}): Shot => ({ shotId, order, intent: 'Mara moves.', panels: [], chosenVideoVersionId: null, ...fields });
const walk = { start: 'Mara enters frame left, walking toward frame right.', end: 'Mara kneels at the bench, frame right.' };
const kneel = { start: 'Mara kneels at the bench, frame right', end: 'Mara stands with the key, facing the camera;' };

test('a Shot\'s positions, then the previous Shot\'s end when the action can carry on', () => {
  const first = positioned('s1', 0, { references: at('the-gallery'), positions: walk }), second = positioned('s2', 1, { references: at('the-gallery'), positions: kneel });
  // Story order, not array order; each line ends once, whatever the position's own punctuation.
  assert.deepEqual(positionLines([second, first], first), ['Positions: starts Mara enters frame left, walking toward frame right; ends Mara kneels at the bench, frame right.']);
  assert.deepEqual(positionLines([second, first], second), ['Positions: starts Mara kneels at the bench, frame right; ends Mara stands with the key, facing the camera.', 'Previous Shot ended: Mara kneels at the bench, frame right.']);
  // Another place: the previous end doesn't carry on. Neither naming a place: it does.
  assert.deepEqual(positionLines([first, { ...second, references: at('the-street') }], { ...second, references: at('the-street') }).length, 1);
  const unplaced = [positioned('s1', 0, { positions: walk }), positioned('s2', 1, { positions: kneel })];
  assert.equal(positionLines(unplaced, unplaced[1]!)[1], 'Previous Shot ended: Mara kneels at the bench, frame right.');
  // What's missing gives no line: a Shot without positions, a previous Shot without them.
  const bare = positioned('s2', 1, { references: at('the-gallery') });
  assert.deepEqual(positionLines([first, bare], bare), ['Previous Shot ended: Mara kneels at the bench, frame right.']);
  assert.deepEqual(positionLines([positioned('s1', 0, { references: at('the-gallery') }), bare], bare), []);
  // One Shot naming a place and the other none: the previous end doesn't carry on.
  const loose = positioned('s2', 1, { positions: kneel });
  assert.deepEqual(positionLines([first, loose], loose), ['Positions: starts Mara kneels at the bench, frame right; ends Mara stands with the key, facing the camera.']);
  // A position that is only punctuation is kept as written rather than emptied.
  assert.deepEqual(positionLines([positioned('s1', 0, { positions: { start: '…', end: '.' } })], positioned('s1', 0, { positions: { start: '…', end: '.' } })), ['Positions: starts …; ends ..']);
});
