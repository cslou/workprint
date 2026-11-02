import assert from 'node:assert/strict';
import { test } from 'node:test';
import { subjectGroups } from '@workprint/contracts';

type Asset = { version: { id: string; artifactId: string; kind: string; content?: unknown }; subjectId?: string };
const image = (id: string, subjectId?: string, artifact = `art-${id}`): Asset => ({ version: { id, artifactId: artifact, kind: 'image' }, ...(subjectId ? { subjectId } : {}) });
const sheet = (id: string, subject: string, views: string[]): Asset => ({ version: { id, artifactId: `art-${id}`, kind: 'reference',
  content: { schemaVersion: 1, subject: { id: subject, kind: 'character', name: subject, description: 'A courier.', continuityNotes: ['Keep the coat.'] }, references: views.map(versionId => ({ versionId, view: `View of ${versionId}`, notes: [] })) } } });
const subjects = [{ id: 'key', kind: 'prop', name: 'The key' }, { id: 'gallery', kind: 'place', name: 'The Gallery' }, { id: 'mara', kind: 'character', name: 'Mara' }];
const script = (list = subjects) => ({ version: { id: 'script', artifactId: 'art-script', kind: 'script', content: { schemaVersion: 1, subjects: list,
  scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters: list.filter(subject => subject.kind === 'character').map(subject => subject.name), script: [{ action: 'She waits.' }] }] } } });
const ids = (assets: readonly Asset[]) => assets.map(asset => asset.version.id);
const shape = (groups: ReturnType<typeof subjectGroups<Asset>>) => groups.map(group => ({ subject: group.subject?.id ?? null, sheets: ids(group.sheets), items: ids(group.items), empty: group.empty }));

test('groups follow the script\'s kind order, an empty subject is empty, and Other is last', () => {
  const assets = [image('i1', 'mara'), image('i2'), sheet('s1', 'mara', ['i3']), image('i3', 'mara'), image('i4', 'key')];
  assert.deepEqual(shape(subjectGroups({ script: script(), assets })), [
    // i3 is a view of Mara's sheet, so it has no row of its own.
    { subject: 'mara', sheets: ['s1'], items: ['i1'], empty: false },
    { subject: 'gallery', sheets: [], items: [], empty: true },
    { subject: 'key', sheets: [], items: ['i4'], empty: false },
    { subject: null, sheets: [], items: ['i2'], empty: false },
  ]);
});

test('a person\'s sheet for a script subject joins that subject; two of Mara\'s sheets are both hers, first one first', () => {
  // A person's sheet is a reference whose content names the subject; it has no subject id on its use.
  const assets = [sheet('s1', 'mara', ['i1']), image('i1'), sheet('s2', 'mara', ['i2']), image('i2'), sheet('s3', 'ben', [])];
  const [mara, , , other] = subjectGroups({ script: script(), assets });
  assert.deepEqual(shape([mara!, other!]), [
    { subject: 'mara', sheets: ['s1', 's2'], items: [], empty: false },
    // A sheet for a subject the script doesn't list is under Other.
    { subject: null, sheets: ['s3'], items: [], empty: false },
  ]);
});

test('an image edited after joining a sheet keeps its row; its old version stays in the sheet', () => {
  // i1b is the next version of i1's image, on the same use; the sheet still lists i1.
  const assets = [image('i1b', 'mara', 'art-i1'), sheet('s1', 'mara', ['i1'])];
  assert.deepEqual(shape(subjectGroups({ script: script(), assets }))[0], { subject: 'mara', sheets: ['s1'], items: ['i1b'], empty: false });
});

test('work for a subject removed from the script, and everything with no script, is under Other', () => {
  const assets = [image('i1', 'mara'), sheet('s1', 'mara', []), image('i2', 'gallery'), { version: { id: 'v1', artifactId: 'art-v1', kind: 'video' } }];
  const removed = subjectGroups({ script: script(subjects.filter(subject => subject.id !== 'mara')), assets });
  assert.deepEqual(shape(removed), [
    { subject: 'gallery', sheets: [], items: ['i2'], empty: false },
    { subject: 'key', sheets: [], items: [], empty: true },
    { subject: null, sheets: ['s1'], items: ['i1', 'v1'], empty: false },
  ]);
  assert.deepEqual(shape(subjectGroups({ script: null, assets })), [{ subject: null, sheets: ['s1'], items: ['i1', 'i2', 'v1'], empty: false }]);
  assert.deepEqual(shape(subjectGroups({ script: null, assets: [] })), [{ subject: null, sheets: [], items: [], empty: true }]);
});
