import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OwnedWorkspace, StoppedVideosOutcome } from '../../../src/application/index.js';
import { productionTools, type AgentCollaborators } from '../../../src/agent/index.js';
import { listingBounds, listWorkspace, workspaceItem } from '../../../src/agent/workspace-entries.js';
import { unusedSheets } from '../../support/unused-sheets.js';

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

test('a clip the assistant made is listed as the video\'s next numbered video, with its exact version', () => {
  const made: Version = { ...base('m1'), createdBy: 'assistant', kind: 'video', media: { contentType: 'video/mp4', byteSize: 10, width: 1344, height: 768, durationMs: 4042, hasAudio: true } };
  const clip = { version: made, use: { id: 'use-m1', versionId: 'm1', binding: { purpose: 'video' as const }, state: 'draft' as const }, state: 'Draft' as const };
  const listing = listWorkspace(workspace([image('i1')], { generatedVideos: [clip] }));
  assert.deepEqual(listing.items.map(item => [item.name, item.versionId, item.use, item.state, item.text]), [
    ['Image 1 · Version 1', 'i1', 'reference', 'Draft', 'image/png, 640×480'], ['Video 1 · Version 1', 'm1', 'generated video', 'Draft', 'video/mp4, 1344×768, 4 s'],
  ]);
  assert.equal(workspaceItem(workspace([], { generatedVideos: [clip] }), 'm1')?.name, 'Video 1 · Version 1');
  // Clips are numbered with the video's other videos, so two never share a name.
  const uploaded: Version = { ...base('u1'), kind: 'video', media: { contentType: 'video/mp4', byteSize: 10, width: 1280, height: 720, durationMs: 1000, hasAudio: true } };
  assert.deepEqual(listWorkspace(workspace([uploaded], { generatedVideos: [clip] })).items.map(item => item.name), ['Video 1 · Version 1', 'Video 2 · Version 1']);
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

test('the listing gives the video\'s stopped jobs with their resume ids, only when the server makes videos and they can be read', async () => {
  const tool = productionTools.find(candidate => candidate.id === 'read-workspace')!;
  const scope = { accountId: 'account', videoId: 'video' }, asked: string[][] = [];
  const run = (stopped?: StoppedVideosOutcome) => {
    const collaborators: AgentCollaborators = {
      readWorkspace: async () => ({ kind: 'found', workspace: workspace([image('i1')]) }),
      saveScript: async () => ({ kind: 'unavailable' }), sheets: unusedSheets, readImageInputs: async () => ({ kind: 'not_found' }), saveGeneratedImage: async () => ({ kind: 'unavailable' }),
      ...(stopped ? { videos: { start: async () => ({ kind: 'not_found' }), resume: async () => ({ kind: 'not_found' }), stopped: async (account: string, video: string) => { asked.push([account, video]); return stopped; } } } : {}),
    };
    const signal = new AbortController().signal;
    return tool.execute({}, { scope, collaborators, signal, abortReason: () => undefined }) as Promise<Record<string, unknown>>;
  };
  const listed = await run({ kind: 'read', jobs: [{ jobId: 'job-2', frames: ['i1'], submittedAt: new Date('2026-11-03T16:34:37Z') }, { jobId: 'job-1', frames: [], submittedAt: new Date('2026-11-03T16:30:11Z') }] });
  assert.deepEqual(listed.stoppedVideos, [{ jobId: 'job-2', frames: ['i1'], submittedAt: '2026-11-03T16:34:37.000Z' }, { jobId: 'job-1', frames: [], submittedAt: '2026-11-03T16:30:11.000Z' }]);
  assert.deepEqual(asked, [['account', 'video']]);
  assert.equal(listed.total, 1);
  for (const quiet of [await run(), await run({ kind: 'read', jobs: [] }), await run({ kind: 'unavailable' })]) {
    assert.equal('stoppedVideos' in quiet, false); assert.equal(quiet.total, 1);
  }
});

test('the listing gives the script\'s subjects with their ids, and 50 subjects with 80-character names stay within 16 KiB', async () => {
  const tool = productionTools.find(candidate => candidate.id === 'read-workspace')!;
  const names = Array.from({ length: 50 }, (_, index) => `${String(index).padStart(2, '0')}${'n'.repeat(78)}`);
  const subjects = names.map((name, index) => ({ id: `${'s'.repeat(80)}-${index}`, kind: index === 0 ? 'character' as const : 'prop' as const, name }));
  const script: Version = { ...base('s'), kind: 'script', content: { schemaVersion: 1, subjects, scenes: [{ heading: { setting: 'INT.', location: 'Station', time: 'Night' }, characters: [names[0]!], script: [{ action: 'Ada waits.' }] }] } };
  const space = workspace(Array.from({ length: 40 }, (_, index) => reference(`r${index}`, `N${index}`, 'é'.repeat(400))), { script: work(script, 'script') });
  const collaborators: AgentCollaborators = { readWorkspace: async () => ({ kind: 'found', workspace: space }), saveScript: async () => ({ kind: 'unavailable' }), readImageInputs: async () => ({ kind: 'not_found' }), saveGeneratedImage: async () => ({ kind: 'unavailable' }), sheets: unusedSheets };
  const signal = new AbortController().signal;
  const listed = await tool.execute({}, { scope: { accountId: 'a', videoId: 'v' }, collaborators, signal, abortReason: () => undefined }) as { subjects: unknown[]; items: { name: string }[]; truncated: boolean };
  assert.deepEqual(listed.subjects, subjects);
  assert.ok(Buffer.byteLength(JSON.stringify(listed)) <= listingBounds.bytes);
  assert.equal(listed.items[0]?.name, 'Script · Version 1', 'the script still fits beside the subjects');
  assert.ok(listed.truncated);
});
