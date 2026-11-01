import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeFixtureFailure, failFixtureAcquisition, withFixtureDiagnostics, type AcquisitionPhase, type SafeFixtureFailure } from './fixture-diagnostics.js';

const resources = [{ owner: '12345678-1234-1234-1234-123456789abc', containerId: 'a'.repeat(64) }];
const secrets = 'https://private.invalid postgres://private:password@private.invalid/db SELECT private_token';

for (const [message, phase, subtype] of [
  [`Isolated Auth/mail startup deadline exceeded (owned auth ${'a'.repeat(64)})`, 'auth-mail-readiness', 'auth-mail-readiness'],
  ['Postgres startup deadline exceeded', 'postgres-acquisition', 'postgres-startup'],
  [secrets, 'storage-init', 'storage'],
  [secrets, 'storage-prepare', 'storage'],
  ['Isolated account creation failed (504)', 'auth-acquisition', 'auth-http-504'],
  ['Serving storage unavailable or privileged; prepare storage separately and use restricted DATABASE_URL', 'backend-startup', 'storage-serving-guard'],
] as const) {
  test(`retains ${subtype} before cleanup and stops instrumentation`, async () => {
    const original = new Error(message, { cause: new Error(secrets) });
    const events: string[] = []; let retained: SafeFixtureFailure | undefined;
    const observer = {
      async beforeCleanup(failure: SafeFixtureFailure) { events.push('capture'); retained = failure; },
      async stop() { events.push('stop'); },
    };
    await assert.rejects(withFixtureDiagnostics(observer, () => failFixtureAcquisition(original, phase, resources, async () => { events.push('cleanup'); })), error => error === original && original.cause instanceof Error);
    assert.deepEqual(events, ['capture', 'stop', 'cleanup']);
    assert.equal(retained?.phase, phase); assert.equal(retained?.subtype, subtype);
    const json = JSON.stringify(retained); for (const value of ['private.invalid', 'password', 'SELECT', 'private_token', 'owned auth', 'a'.repeat(64)]) assert.ok(!json.includes(value));
  });
}

test('primary startup cause survives observer and cleanup failures, without leaking arbitrary errors', async () => {
  const original = new Error('Postgres startup deadline exceeded'); const capture = new Error(secrets); const cleanup = new Error(secrets); const events: string[] = [];
  await assert.rejects(withFixtureDiagnostics({ async beforeCleanup() { events.push('capture'); throw capture; }, async stop() { events.push('stop'); } }, () => failFixtureAcquisition(original, 'postgres-acquisition', resources, async () => { events.push('cleanup'); throw cleanup; })), error => {
    assert.ok(error instanceof AggregateError); assert.equal(error.cause, original); assert.deepEqual(error.errors, [original, capture, cleanup]);
    assert.equal(describeFixtureFailure(error, 'auth-acquisition').subtype, 'postgres-startup'); assert.ok(!JSON.stringify(describeFixtureFailure(error, 'auth-acquisition')).includes('private.invalid')); return true;
  });
  assert.deepEqual(events, ['capture', 'stop', 'cleanup']);
});

test('nested catches capture once, retain origin phase, and run every cleanup', async () => {
  const original = new Error('Postgres startup deadline exceeded'); const events: string[] = []; let retained: SafeFixtureFailure | undefined;
  await assert.rejects(withFixtureDiagnostics({ async beforeCleanup(failure) { retained = failure; events.push('capture'); }, async stop() { events.push('stop'); } }, async () => {
    try { await failFixtureAcquisition(original, 'postgres-acquisition', resources, async () => { events.push('inner cleanup'); }); }
    catch (error) { return failFixtureAcquisition(error, 'auth-acquisition', resources, async () => { events.push('outer cleanup'); }); }
  }), error => error === original);
  assert.equal(retained?.phase, 'postgres-acquisition'); assert.deepEqual(events, ['capture', 'stop', 'inner cleanup', 'outer cleanup']);
});

test('stopping instrumentation failing never skips fixture cleanup', async () => {
  const original = new Error('Postgres startup deadline exceeded'); let cleaned = false;
  await assert.rejects(withFixtureDiagnostics({ async beforeCleanup() {}, async stop() { throw new Error(secrets); } }, () => failFixtureAcquisition(original, 'postgres-acquisition', resources, async () => { cleaned = true; })), error => error instanceof AggregateError && error.cause === original);
  assert.equal(cleaned, true);
});

test('normal caller retains exact original error and cleanup behavior without an observer', async () => {
  const error = new Error(secrets); let cleaned = false;
  await assert.rejects(failFixtureAcquisition(error, 'auth-acquisition', [], async () => { cleaned = true; }), value => value === error); assert.equal(cleaned, true);
});

test('unsafe ownership is not exposed to callback, but observer stop and cleanup still run', async () => {
  const original = new Error('Postgres startup deadline exceeded'); const events: string[] = [];
  await assert.rejects(withFixtureDiagnostics({ async beforeCleanup() { events.push('unsafe capture'); }, async stop() { events.push('stop'); } }, () => failFixtureAcquisition(original, 'postgres-acquisition', [{ owner: secrets, containerId: secrets }], async () => { events.push('cleanup'); })), error => error instanceof AggregateError && error.cause === original);
  assert.deepEqual(events, ['stop', 'cleanup']);
});

test('unresolved observation and stop are aborted and cannot block cleanup', { timeout: 1000 }, async () => {
  const original = new Error('Postgres startup deadline exceeded'); const events: string[] = [];
  await assert.rejects(withFixtureDiagnostics({
    operationTimeoutMs: 10,
    async beforeCleanup(_failure, _resources, signal) { signal?.addEventListener('abort', () => events.push('capture aborted')); await new Promise<void>(() => {}); },
    async stop(signal) { signal?.addEventListener('abort', () => events.push('stop aborted')); await new Promise<void>(() => {}); },
  }, () => failFixtureAcquisition(original, 'postgres-acquisition', resources, async () => { events.push('cleanup'); })), error => error instanceof AggregateError && error.cause === original);
  assert.deepEqual(events, ['capture aborted', 'stop aborted', 'cleanup']);
});

test('unknown and cyclic private causes serialize without messages or recursion', () => {
  const error = new Error(secrets); Object.assign(error, { cause: error, code: secrets });
  const phase: AcquisitionPhase = 'auth-acquisition'; const serialized = JSON.stringify(describeFixtureFailure(error, phase));
  assert.equal(JSON.parse(serialized).subtype, 'unknown'); assert.ok(!serialized.includes('private.invalid'));
});
