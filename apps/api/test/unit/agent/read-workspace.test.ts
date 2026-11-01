import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OwnedWorkspace } from '../../../src/application/index.js';
import { listingBounds, listWorkspace, workspaceItem } from '../../../src/agent/tools/read-workspace/projection.js';

type Version = OwnedWorkspace['assets'][number]['version'];
const base = (id: string, revision = 1) => ({ id, artifactId: `artifact-${id}`, revision, createdBy: 'human' as const, createdAt: '2026-11-01T00:00:00.000Z', dependencies: [] });
const image = (id: string): Version => ({ ...base(id), kind: 'image', media: { contentType: 'image/png', byteSize: 10, width: 640, height: 480 } });
const reference = (id: string, name: string, description: string): Version => ({ ...base(id), kind: 'reference', content: { schemaVersion: 1, subject: { id: 'subject', kind: 'character', name, description, continuityNotes: ['n'] }, references: [] } });
const work = (version: Version, purpose: 'reference' | 'script' | 'storyboard', state: 'draft' | 'approved' = 'draft') => ({ version, use: { id: `use-${version.id}`, versionId: version.id, binding: { purpose }, state }, state: state === 'approved' ? 'Ready' as const : 'Draft' as const });
const workspace = (assets: Version[], extra: Partial<OwnedWorkspace> = {}): OwnedWorkspace => ({ script: null, assets: assets.map(version => work(version, 'reference')), storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 0, ...extra } as OwnedWorkspace);

test('items are named by what they are and in order; uploads have no filename, so images are numbered', () => {
  const script: Version = { ...base('s', 3), kind: 'script', content: { schemaVersion: 1, scenes: [{ heading: { setting: 'INT.', location: 'Station', time: 'Night' }, characters: ['Ada'], script: [{ action: 'Ada waits.' }, { dialogue: { character: 'Ada', text: 'Late again.' } }] }] } };
  const listing = listWorkspace(workspace([image('i1'), reference('r1', 'Mara', 'A tall courier.'), image('i2')], {
    script: work(script, 'script', 'approved'),
    storyboard: { work: null, shots: [{ shotId: 'b', order: 5, panels: [{ panelId: 'p', order: 0, description: '', references: [], candidateImageVersions: [image('c1')], approvedImageVersionId: 'c1' }], chosenVideoVersionId: null }, { shotId: 'a', order: 1, panels: [], chosenVideoVersionId: null, candidateVideoVersions: [{ ...base('v1'), kind: 'video', media: { contentType: 'video/mp4', byteSize: 9, width: 1280, height: 720, durationMs: 4200 } }] }] },
  }));
  assert.deepEqual(listing.items.map(item => [item.name, item.use, item.state]), [
    ['Script · Version 3', 'script', 'Ready'], ['Image 1 · Version 1', 'reference', 'Draft'], ['Mara · Version 1', 'reference', 'Draft'], ['Image 2 · Version 1', 'reference', 'Draft'],
    ['Shot 1 · Video · Version 1', 'shot video', 'Draft'], ['Shot 2 · Panel 2.1 · Version 1', 'panel image', 'Ready'],
  ]);
  assert.equal(listing.items[0]!.text, 'INT. Station - Night Ada waits. Ada: Late again.');
  assert.equal(listing.items[1]!.text, 'image/png, 640×480');
  assert.equal(listing.items[4]!.text, 'video/mp4, 1280×720, 4.2 s');
  assert.deepEqual([listing.total, listing.truncated], [6, false]);
});

test('a listing stops at 50 items, then at 16 KiB, and every text stays within 200 characters', () => {
  const many = listWorkspace(workspace(Array.from({ length: 60 }, (_, index) => image(`i${index}`))));
  assert.deepEqual([many.items.length, many.total, many.truncated], [listingBounds.items, 60, true]);
  const long = listWorkspace(workspace(Array.from({ length: 40 }, (_, index) => reference(`r${index}`, `N${index}`, 'é'.repeat(400)))));
  assert.ok(long.items.length < 40 && long.truncated, String(long.items.length));
  assert.ok(Buffer.byteLength(JSON.stringify(long)) <= listingBounds.bytes);
  for (const item of long.items) assert.ok(item.text.length <= listingBounds.text);
  const named = listWorkspace(workspace([reference('r', 'N'.repeat(300), 'd')]));
  assert.ok(named.items[0]!.name.length <= listingBounds.text && named.items[0]!.text.length <= listingBounds.text);
  assert.deepEqual(listWorkspace(workspace([])), { items: [], total: 0, truncated: false });
});

test('item mode returns a used version in full and nothing for any other id', () => {
  const space = workspace([reference('r1', 'Mara', 'A tall courier.'), image('i1')]);
  assert.deepEqual(workspaceItem(space, 'i1'), { name: 'Image 1 · Version 1', kind: 'image', versionId: 'i1', revision: 1, use: 'reference', state: 'Draft', media: { contentType: 'image/png', byteSize: 10, width: 640, height: 480 } });
  assert.equal((workspaceItem(space, 'r1') as { content: { subject: { description: string } } }).content.subject.description, 'A tall courier.');
  assert.equal(workspaceItem(space, 'someone-elses'), null);
});
