import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mediaVersionName, sheetViews, workspaceMediaLabels } from '@workprint/contracts';

const image = (id: string, artifact = `art-${id}`, revision = 1) => ({ version: { id, artifactId: artifact, kind: 'image', revision } });
const sheet = (id: string, subject: string, name: string, views: [string, string][], artifact = `art-${id}`) => ({ version: { id, artifactId: artifact, kind: 'reference', revision: 1,
  content: { schemaVersion: 1, subject: { id: subject, kind: 'character', name, description: 'A courier.', continuityNotes: ['Keep the coat.'] }, references: views.map(([versionId, view]) => ({ versionId, view, notes: [] })) } } });
const script = (name: string) => ({ version: { id: 'script', artifactId: 'art-script', kind: 'script', revision: 1,
  content: { schemaVersion: 1, subjects: [{ id: 'mara', kind: 'character', name }], scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters: [name], script: [{ action: 'She waits.' }] }] } } });

test('a current sheet\'s images are its views, named by the script subject\'s current name; an image a later version drops leaves it', () => {
  const assets = [image('i1'), image('i2'), image('i3'), sheet('s2', 'mara', 'Mara', [['i1', 'Full-body front'], ['i3', 'face close-up']], 'art-sheet')];
  const views = sheetViews({ script: script('Mara Vale'), assets });
  assert.deepEqual([...views.entries()], [
    ['i1', { sheetArtifactId: 'art-sheet', sheetVersionId: 's2', subjectId: 'mara', subjectName: 'Mara Vale', view: 'Full-body front' }],
    ['i3', { sheetArtifactId: 'art-sheet', sheetVersionId: 's2', subjectId: 'mara', subjectName: 'Mara Vale', view: 'face close-up' }],
  ]);
  // Only the version the video uses counts: i2 was in an earlier version of the sheet, so it is an image again.
  const labels = workspaceMediaLabels({ assets });
  assert.deepEqual(assets.slice(0, 3).map(({ version }) => mediaVersionName(labels, version, views)), ['Mara Vale · Full-body front', 'Image 2 · Version 1', 'Mara Vale · face close-up']);
  // With no script, or a subject the script doesn't list, the sheet's own name is used.
  assert.equal(sheetViews({ script: null, assets }).get('i1')?.subjectName, 'Mara');
});

test('names keep every other image\'s number, and a version of a member\'s artifact the sheet doesn\'t list keeps its own name', () => {
  // i2b is the next version of i2's image; the sheet lists only i2.
  const assets = [image('i1'), image('i2b', 'art-i2', 2), image('i4'), sheet('s1', 'mara', 'Mara', [['i2', 'Side']])];
  const views = sheetViews({ script: script('Mara'), assets }), labels = workspaceMediaLabels({ assets });
  assert.deepEqual(assets.slice(0, 3).map(({ version }) => mediaVersionName(labels, version, views)), ['Image 1 · Version 1', 'Image 2 · Version 2', 'Image 3 · Version 1']);
  assert.equal(mediaVersionName(labels, { id: 'i2', artifactId: 'art-i2', kind: 'image', revision: 1 }, views), 'Mara · Side');
  assert.equal(mediaVersionName(labels, assets[0]!.version), 'Image 1 · Version 1', 'without sheet views the name is unchanged');
});

test('an image in two people\'s sheets belongs to the first sheet in workspace order', () => {
  const assets = [image('i1'), sheet('s1', 'mara', 'Mara', [['i1', 'Front']]), sheet('s2', 'ben', 'Ben', [['i1', 'Back']])];
  assert.deepEqual(sheetViews({ script: script('Mara'), assets }).get('i1'), { sheetArtifactId: 'art-s1', sheetVersionId: 's1', subjectId: 'mara', subjectName: 'Mara', view: 'Front' });
  // A reference that doesn't parse as a sheet claims nothing.
  assert.equal(sheetViews({ script: null, assets: [image('i1'), { version: { id: 'bad', artifactId: 'art-bad', kind: 'reference', content: { schemaVersion: 2 } } }] }).size, 0);
});
