import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createManualSave, type ClientResult, type ManualTextTarget } from '@workprint/api-client';
import type { OperationRequest, OperationResponse, Version } from '@workprint/contracts';

type Request = OperationRequest<'saveVersion'>;
type Result = OperationResponse<'saveVersion'>;
const version = (revision: number, text: string, dependencies: string[] = []): Version => ({ id: `v${revision}`, artifactId: 'script', kind: 'script', revision, createdBy: 'human', createdAt: '2026-10-30T00:00:00Z', dependencies, content: { text } });
const target: ManualTextTarget = {
  read: value => 'content' in value && typeof value.content.text === 'string' ? value.content.text : null,
  replace: (value, text) => 'content' in value ? { ...value.content, text } : null,
  compatible: (base, latest) => base.artifactId === latest.artifactId && JSON.stringify(base.dependencies) === JSON.stringify(latest.dependencies),
};
const success = (revision: number, text: string): ClientResult<Result> => ({ ok: true, value: { version: version(revision, text), use: { id: 'use', versionId: `v${revision}`, state: 'approved', binding: { purpose: 'script' } } } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('manual controller retains selectable pending/unknown input and retries exactly one captured command', async () => {
  const lost = deferred<ClientResult<Result>>();
  const sent: Request[] = [];
  const controller = createManualSave({ conversationId: 'conversation', version: version(1, 'Original.'), target, intendedUse: { purpose: 'script' }, client: {
    async saveVersion(input) { sent.push(structuredClone(input)); return sent.length === 1 ? lost.promise : success(2, 'Retained typed text.'); },
    async artifactVersions() { throw new Error('No automatic read is permitted'); },
  } });
  controller.begin(); controller.change('Retained typed text.');
  const saving = controller.submit();
  assert.equal(controller.getSnapshot().phase, 'pending');
  controller.change('Must not overwrite pending input.'); controller.cancel();
  assert.equal(controller.getSnapshot().text, 'Retained typed text.'); assert.equal(controller.getSnapshot().editing, true);
  lost.resolve({ ok: false, error: { code: 'transport_failure', message: 'Owned response-loss control' } });
  await saving;
  assert.equal(controller.getSnapshot().phase, 'unknown');
  controller.change('Must not overwrite the captured payload.'); await controller.submit();
  assert.equal(sent.length, 1); assert.equal(controller.getSnapshot().text, 'Retained typed text.');
  const saved = await controller.retry(); assert.equal(saved?.version.id, 'v2');
  assert.deepEqual(sent[1], sent[0], 'Explicit retry preserves operation, base, content, exact dependencies and use');
  assert.equal(controller.getSnapshot().editing, false);
  controller.dispose(); controller.begin(); await controller.retry(); assert.equal(sent.length, 2);
});

test('conflict review is explicit and continuing changes only the local base before a fresh explicit command', async () => {
  const sent: Request[] = []; let reads = 0;
  const controller = createManualSave({ conversationId: 'conversation', version: version(1, 'Original.'), target, intendedUse: { purpose: 'script' }, client: {
    async saveVersion(input) { sent.push(structuredClone(input)); return sent.length === 1 ? { ok: false, error: { code: 'stale_revision', message: 'A newer version was saved' } } : success(3, 'My retained edit.'); },
    async artifactVersions() { reads++; return { ok: true, value: { items: [version(2, 'Newer saved text.')], nextCursor: null } }; },
  } });
  controller.begin(); controller.change('My retained edit.'); await controller.submit();
  assert.equal(controller.getSnapshot().phase, 'conflict'); assert.equal(controller.getSnapshot().base.id, 'v1');
  await controller.submit(); assert.equal(sent.length, 1); assert.equal(reads, 0);
  await controller.reviewLatest(); assert.equal(reads, 1); assert.equal(controller.getSnapshot().phase, 'review');
  assert.equal(controller.getSnapshot().base.id, 'v1'); assert.equal(controller.getSnapshot().text, 'My retained edit.');
  controller.continueWithText(); assert.equal(controller.getSnapshot().base.id, 'v2'); assert.equal(sent.length, 1);
  await controller.submit(); assert.equal(sent.length, 2); assert.equal(sent[1]?.body.baseVersionId, 'v2');
  assert.notEqual(sent[1]?.body.operationId, sent[0]?.body.operationId); assert.equal(controller.getSnapshot().base.id, 'v3');
  controller.dispose();
});

test('incompatible target/dependencies block continuation and disposed scope cannot accept late reads or writes', async () => {
  const latest = deferred<ClientResult<OperationResponse<'artifactVersions'>>>();
  const save = deferred<ClientResult<Result>>(); let calls = 0;
  const controller = createManualSave({ conversationId: 'old-conversation', version: version(1, 'Original.'), target, intendedUse: { purpose: 'script' }, client: {
    async saveVersion() { calls++; return { ok: false, error: { code: 'stale_revision', message: 'Conflict' } }; },
    async artifactVersions() { return latest.promise; },
  } });
  controller.begin(); controller.change('Retained.'); await controller.submit();
  const reading = controller.reviewLatest();
  latest.resolve({ ok: true, value: { items: [version(2, 'Changed dependency context.', ['different-version'])], nextCursor: null } });
  await reading; assert.equal(controller.getSnapshot().phase, 'blocked'); controller.continueWithText();
  assert.equal(controller.getSnapshot().base.id, 'v1'); assert.equal(controller.getSnapshot().text, 'Retained.'); assert.equal(calls, 1);
  controller.dispose(); await controller.reviewLatest(); await controller.submit(); assert.equal(calls, 1);
  const late = createManualSave({ conversationId: 'old-conversation', version: version(1, 'Original.'), target, intendedUse: { purpose: 'script' }, client: { async saveVersion() { return save.promise; }, async artifactVersions() { throw new Error('No read expected'); } } });
  late.begin(); late.change('Late text.'); const pending = late.submit(); const before = late.getSnapshot(); late.dispose();
  save.resolve(success(2, 'Late text.')); assert.equal(await pending, undefined); assert.deepEqual(late.getSnapshot(), before, 'Late completion cannot update or revive disposed scope');
});
