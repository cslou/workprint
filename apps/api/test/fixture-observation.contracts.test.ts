import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupFailedFixture, cleanupFixtureResources, observeFixturePhase, reportFixtureEvidence, type FixturePhase } from './fixture-observation.js';

test('fixture phases return the original value and emit bounded credential-free lifecycle events', async () => {
  const messages: string[] = [], value = { privatePayload: 'not-for-diagnostics' };
  assert.equal(await observeFixturePhase('saved-backend.admission', async () => value, message => messages.push(message)), value);
  const events = messages.map(message => JSON.parse(message) as Record<string, unknown>);
  assert.deepEqual(events.map(event => [event.phase, event.status]), [['saved-backend.admission', 'start'], ['saved-backend.admission', 'complete']]);
  assert.equal(events[1]?.failure, undefined);
  for (const event of events) { assert.deepEqual(Object.keys(event).sort(), ['elapsedMs', 'phase', 'status']); assert.ok(Number.isFinite(event.elapsedMs)); assert.ok(Number(event.elapsedMs) >= 0); }
  assert.ok(!messages.join('').includes(value.privatePayload));
});

test('fixture failure observation retains exact error/cause without exposing names, payloads or endpoints', async () => {
  for (const name of ['AbortError', 'TimeoutError', 'sensitive-error-name']) {
    const failure = new Error('private-payload', { cause: new Error('https://fixture.invalid/?token=not-real') }); failure.name = name;
    const messages: string[] = [];
    await assert.rejects(observeFixturePhase('saved-backend.prepare', async () => { throw failure; }, message => messages.push(message)), error => error === failure);
    const last = JSON.parse(messages.at(-1)!) as Record<string, unknown>;
    assert.equal(last.status, 'failed'); assert.equal(last.failure, name === 'AbortError' ? 'aborted' : name === 'TimeoutError' ? 'timeout' : 'error');
    assert.deepEqual(Object.keys(last).sort(), ['elapsedMs', 'failure', 'phase', 'status']);
    for (const hidden of ['private-payload', 'fixture.invalid', 'not-real', 'sensitive-error-name']) assert.ok(!messages.join('').includes(hidden));
  }
});

test('diagnostic callback failure never discards an operation failure or permits unobserved startup', async () => {
  const operation = new Error('operation failure'), diagnostic = new Error('diagnostic failure'); let invoked = false;
  await assert.rejects(observeFixturePhase('saved-backend.admission', async () => { invoked = true; }, () => { throw diagnostic; }), error => error === diagnostic);
  assert.equal(invoked, false);
  let calls = 0;
  await assert.rejects(observeFixturePhase('saved-backend.admission', async () => { throw operation; }, () => { if (++calls === 2) throw diagnostic; }), error => error instanceof AggregateError && error.cause === diagnostic && error.errors[0] === operation && error.errors[1] === diagnostic);
});

test('optional diagnostics and completion-report failure do not replay or misclassify completed work', async () => {
  const value = {}; assert.equal(await observeFixturePhase('saved-backend.prepare', async () => value), value);
  const diagnostic = new Error('completion reporting failed'); let work = 0, reports = 0;
  await assert.rejects(observeFixturePhase('saved-backend.prepare', async () => { work++; return value; }, () => { if (++reports === 2) throw diagnostic; }), error => error === diagnostic);
  assert.equal(work, 1); assert.equal(reports, 2);
});

test('invalid runtime phase names cannot become diagnostics', async () => {
  const messages: string[] = [];
  await assert.rejects(observeFixturePhase('https://fixture.invalid/private' as FixturePhase, async () => undefined, message => messages.push(message)), TypeError);
  assert.deepEqual(messages, []);
});

test('admission evidence forwarding exposes only the trusted temporary artifact ID', () => {
  const messages: string[] = [];
  reportFixtureEvidence('Evidence: /private/tmp/workprint-foundation-aB12z9', message => messages.push(message));
  assert.deepEqual(messages.map(message => JSON.parse(message)), [{ phase: 'saved-backend.admission', status: 'evidence', artifact: 'workprint-foundation-aB12z9' }]);
  for (const unsafe of ['private-payload', 'Evidence: https://fixture.invalid/?token=not-real', 'Evidence: /tmp/workprint-foundation-aB12z9/private', 'Evidence: /tmp/workprint-foundation-secret-token']) reportFixtureEvidence(unsafe, message => messages.push(message));
  assert.equal(messages.length, 1); assert.ok(!messages[0]!.includes('/private/tmp'));
});

test('fixture cleanup attempts every owned release in order and retains all cleanup failures', async () => {
  const first = new Error('first release'), last = new Error('last release'), released: number[] = [];
  await assert.rejects(cleanupFixtureResources([() => { released.push(1); throw first; }, async () => { released.push(2); }, () => { released.push(3); throw last; }]), error => error instanceof AggregateError && error.errors[0] === first && error.errors[1] === last && error.cause === last);
  assert.deepEqual(released, [1, 2, 3]);
  await assert.rejects(cleanupFixtureResources([() => { throw first; }]), error => error === first);
  await cleanupFixtureResources([() => undefined, async () => undefined]);
});

test('failed acquisition preserves original errors through successful, repeated-error and failing cleanup', async () => {
  const original = new Error('admission failed'), cleanup = new Error('cleanup failed'); let cleaned = 0;
  await assert.rejects(cleanupFailedFixture(original, async () => { cleaned++; }), error => error === original);
  await assert.rejects(cleanupFailedFixture(original, async () => { throw original; }), error => error === original);
  await assert.rejects(cleanupFailedFixture(original, async () => { throw cleanup; }), error => error instanceof AggregateError && error.cause === cleanup && error.errors[0] === original && error.errors[1] === cleanup);
  assert.equal(cleaned, 1);
});
