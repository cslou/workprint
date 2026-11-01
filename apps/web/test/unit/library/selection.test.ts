import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VersionUseClient } from '@workprint/api-client';
import { createLibrarySelection, type LibraryChoice } from '../../../src/library/selection.js';

const video = '11111111-1111-4111-8111-111111111111';
const versionId = '33333333-3333-4333-8333-333333333333';
const choice: LibraryChoice = { id: versionId, display: { name: 'Vale', sub: 'Character' }, order: 0 };

/** A client that records each use's video id and answers with the approved use. */
function recordingClient() {
  const videos: string[] = [];
  const client: VersionUseClient = { useVersion: async command => {
    videos.push(command.params.id);
    return { ok: true, value: { use: { id: '44444444-4444-4444-8444-444444444444', versionId: command.body.versionId, binding: { purpose: 'reference' }, state: 'approved' }, selectionRevision: 1 } } as never;
  } };
  return { client, videos };
}

test('a choice picked on a New video before its first send attaches to the video id it gets', async () => {
  const { client, videos } = recordingClient();
  const current: { id?: string } = {};
  const selection = createLibrarySelection({ getClient: () => client, getConversationId: () => current.id });
  selection.toggle(versionId, choice);
  await selection.attach();
  assert.deepEqual(videos, [], 'nothing is sent while the video has no id');
  current.id = video;
  await selection.attach();
  assert.deepEqual(videos, [video]);
  assert.deepEqual(selection.getSnapshot().choices, []);
  selection.dispose();
});

test('an exact use requested before the first send is not reused once the video has its id', async () => {
  const { client, videos } = recordingClient();
  const current: { id?: string } = {};
  const selection = createLibrarySelection({ getClient: () => client, getConversationId: () => current.id });
  const early = selection.exactUse({ id: versionId }, { purpose: 'reference' });
  current.id = video;
  const later = selection.exactUse({ id: versionId }, { purpose: 'reference' });
  assert.notEqual(early, later);
  await later.submit();
  assert.deepEqual(videos, [video]);
  selection.dispose();
});
