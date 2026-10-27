import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServerConfig } from './config.js';

const valid = {
  DATABASE_URL: 'postgresql://serving:local-only@127.0.0.1:5432/workprint',
  DEFAULT_ASSISTANT_MODEL: 'unqualified/disabled',
};

test('missing or malformed configuration fails without echoing values', () => {
  const sentinel = 'harmless-server-secret-sentinel';
  for (const env of [
    {},
    { ...valid, DEFAULT_ASSISTANT_MODEL: '' },
    { ...valid, DEFAULT_ASSISTANT_MODEL: `https://${sentinel}` },
    { ...valid, DEFAULT_ASSISTANT_MODEL: 'test/fake' },
    { ...valid, DATABASE_URL: sentinel },
    { ...valid, PORT: '-1' },
    { ...valid, PORT: '4111junk' },
    { ...valid, MIGRATION_DATABASE_URL: valid.DATABASE_URL },
    { ...valid, VITE_PRIVATE_KEY: sentinel },
  ]) {
    assert.throws(() => loadServerConfig(env), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, new RegExp(sentinel));
      return true;
    });
  }
  assert.equal(loadServerConfig(valid).port, 4111);
});
