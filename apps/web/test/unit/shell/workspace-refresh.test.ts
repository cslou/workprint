import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClientResult } from '@workprint/api-client';
import type { OperationResponse, Version } from '@workprint/contracts';
import { landRead, type ReadSnapshot } from '../../../src/api/use-scoped-read.js';
import { showWorkspace, type SaveEffect, type UseEffect } from '../../../src/shell/workspace.js';

type Workspace = OperationResponse<'workspace'>;
const artifact = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', useId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = (revision: number) => `0000000${revision}-0000-4000-8000-000000000000`;
const version = (revision: number, createdBy: 'human' | 'assistant' = 'human'): Version => ({ id: id(revision), artifactId: artifact, revision, createdBy, createdAt: '2026-11-01T00:00:00.000Z', dependencies: [], kind: 'script', content: { schemaVersion: 1, scenes: [] } });
const use = (revision: number, state: 'approved' | 'draft') => ({ id: useId, versionId: id(revision), binding: { purpose: 'script' as const }, state });
/** A read showing script version `revision` in use. */
const read = (revision: number, state: 'approved' | 'draft' = 'approved', createdBy: 'human' | 'assistant' = 'human'): Workspace => ({
  script: { version: version(revision, createdBy), use: use(revision, state), state: state === 'approved' ? 'Ready' : 'Draft' },
  assets: [], storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 1,
});
const saved = (revision: number, at: number): SaveEffect => ({ version: version(revision), use: use(revision, 'approved'), at });
// Script uses never advance the selection revision, so ordering can't rest on it.
const used = (revision: number, at: number, deferred = false): UseEffect => ({ result: { use: use(revision, 'approved'), selectionRevision: 1 }, version: version(revision), deferred, at });
const shown = (workspace: Workspace) => [workspace.script?.version.revision, workspace.script?.use?.state];

test('a read lands only on its own scope and reader, and a failed refresh keeps what is shown', () => {
  const reader = async (): Promise<ClientResult<number>> => ({ ok: true, value: 1 }), other = async (): Promise<ClientResult<number>> => ({ ok: true, value: 2 });
  const settled = (value: number, refresh: number, key = 'a'): ReadSnapshot<number> & { state: { kind: 'settled' } } => ({ key, read: reader, state: { kind: 'settled', result: { ok: true, value }, refresh } });
  const loading: ReadSnapshot<number> = { key: 'a', read: reader, state: { kind: 'loading' } };
  assert.equal(landRead(loading, settled(1, 0, 'b')), loading, 'another video');
  assert.equal(landRead(loading, { ...settled(1, 0), read: other }), loading, 'another client');
  assert.deepEqual(landRead(loading, settled(1, 0)).state, { kind: 'settled', result: { ok: true, value: 1 }, refresh: 0 });
  const failed = { key: 'a', read: reader, state: { kind: 'settled' as const, result: { ok: false as const, error: { code: 'transport_failure' as const, message: 'x' } }, refresh: 1 } };
  const shownRead = settled(1, 0);
  assert.equal(landRead(shownRead, failed), shownRead, 'the shown value stays');
  assert.deepEqual(landRead(loading, failed).state, failed.state, 'a first read that fails says so');
  const signedOut = { ...failed, state: { ...failed.state, result: { ok: false as const, error: { code: 'unauthenticated' as const, message: 'x' } } } };
  assert.deepEqual(landRead(shownRead, signedOut).state, signedOut.state, 'an ended session is never hidden');
  assert.deepEqual(landRead(settled(1, 0), settled(2, 1)).state, settled(2, 1).state);
});

test('after an own save, a re-read with the assistant\'s next version shows the assistant\'s version', () => {
  assert.deepEqual(shown(showWorkspace(read(1), 0, [saved(2, 0)], [])), [2, 'approved'], 'the own save shows before any re-read');
  assert.deepEqual(shown(showWorkspace(read(3, 'draft', 'assistant'), 1, [saved(2, 0)], [])), [3, 'draft']);
});

test('Use this version on v1 survives a read that started earlier, but not a re-read after the assistant saved', () => {
  assert.deepEqual(shown(showWorkspace(read(2), 0, [], [used(1, 0)])), [1, 'approved'], 'the earlier read is stale');
  assert.deepEqual(shown(showWorkspace(read(3, 'draft', 'assistant'), 1, [], [used(1, 0)])), [3, 'draft'], 'the re-read began after the use committed');
  assert.deepEqual(shown(showWorkspace(read(2), 1, [], [used(1, 1)])), [1, 'approved'], 'a use confirmed while the re-read was in flight still shows');
  assert.deepEqual(shown(showWorkspace(read(2), 0, [], [used(1, 0, true)])), [2, 'approved'], 'a deferred use waits for the draft to close');
});
