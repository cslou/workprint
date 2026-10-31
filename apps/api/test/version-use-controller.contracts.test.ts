import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExactVersionUse, type ClientResult } from '@workprint/api-client';
import type { OperationRequest, OperationResponse } from '@workprint/contracts';

type Command = OperationRequest<'useVersion'>;
type Result = OperationResponse<'useVersion'>;
const command = (): Command => ({ params: { id: 'owned-conversation' }, query: {}, body: { purpose: 'reference', role: 'lead', versionId: 'exact-image', operationId: 'original-operation' } });
const success = (): ClientResult<Result> => ({ ok: true, value: { use: { id: 'owned-use', versionId: 'exact-image', binding: { purpose: 'reference', role: 'lead' }, state: 'approved' }, selectionRevision: 0 } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('exact-use controller freezes purpose/role/identity, locks unknown work and reconciles only by explicit retry', async () => {
  const original = command(), expected = structuredClone(original), lost = deferred<ClientResult<Result>>(), sent: Command[] = [];
  const use = createExactVersionUse({ command: original, client: { async useVersion(input) { sent.push(structuredClone(input)); return sent.length === 1 ? lost.promise : success(); } } });
  assert.equal(sent.length, 0);
  original.body.versionId = 'must-not-replace-captured-choice';
  if (original.body.purpose === 'reference') original.body.role = 'must-not-replace-captured-role';
  const pending = use.submit(); assert.equal(use.getSnapshot().phase, 'pending'); await use.submit(); assert.equal(sent.length, 1);
  lost.resolve({ ok: false, error: { code: 'transport_failure', message: 'Owned response-loss control' } }); await pending;
  assert.equal(use.getSnapshot().phase, 'unknown'); await use.submit(); assert.equal(sent.length, 1);
  const acknowledged = success(); assert.ok(acknowledged.ok); assert.deepEqual(await use.retry(), acknowledged.value);
  assert.equal(use.getSnapshot().phase, 'used'); assert.deepEqual(sent, [expected, expected]);
  await use.retry(); await use.submit(); assert.equal(sent.length, 2, 'A known success cannot be automatically reapplied'); use.dispose();
});

test('mismatched exact-version/binding and stale selection acknowledgements remain unknown rather than granting authority', async () => {
  for (const alteration of ['version', 'role', 'state', 'revision'] as const) {
    const acknowledged = success(); assert.ok(acknowledged.ok);
    if (alteration === 'version') acknowledged.value.use.versionId = 'different-version';
    if (alteration === 'role') acknowledged.value.use.binding = { purpose: 'reference', role: 'different-role' };
    if (alteration === 'state') acknowledged.value.use.state = 'draft';
    const use = createExactVersionUse({ command: command(), minimumSelectionRevision: alteration === 'revision' ? 1 : 0, client: { async useVersion() { return acknowledged; } } });
    assert.equal(await use.submit(), undefined); assert.equal(use.getSnapshot().phase, 'unknown'); assert.equal(use.getSnapshot().failure, 'invalid_response'); use.dispose();
  }
});

test('stopping observation retains an exact unknown command while teardown fences late completion and further dispatch', async () => {
  const late = deferred<ClientResult<Result>>(), sent: Command[] = [];
  let signal: AbortSignal | undefined;
  const use = createExactVersionUse({ command: command(), client: { async useVersion(input, options) { signal = options?.signal; sent.push(structuredClone(input)); return sent.length === 1 ? late.promise : success(); } } });
  const pending = use.submit(); use.stop(); assert.equal(signal?.aborted, true); assert.equal(use.getSnapshot().phase, 'unknown');
  late.resolve(success()); assert.equal(await pending, undefined); assert.equal(use.getSnapshot().phase, 'unknown');
  await use.retry(); assert.equal(use.getSnapshot().phase, 'used'); assert.deepEqual(sent[1], sent[0]); use.dispose();
  const ignored = deferred<ClientResult<Result>>();
  const disposed = createExactVersionUse({ command: command(), client: { async useVersion() { return ignored.promise; } } });
  const saving = disposed.submit(), before = disposed.getSnapshot(); disposed.dispose(); ignored.resolve(success());
  assert.equal(await saving, undefined); assert.deepEqual(disposed.getSnapshot(), before); await disposed.retry(); await disposed.submit();
});
