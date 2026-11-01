import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServerConfig } from '../../../src/mastra/config.js';

const valid = {
  DATABASE_URL: 'postgresql://serving:local-only@127.0.0.1:5432/workprint',
  DEFAULT_ASSISTANT_MODEL: 'meta/muse-spark-1.3',
  META_API_KEY: 'harmless-meta-key-sentinel',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-key',
};

test('missing or malformed configuration fails without echoing values', () => {
  const sentinel = 'harmless-server-secret-sentinel';
  for (const env of [
    {},
    { ...valid, DEFAULT_ASSISTANT_MODEL: '' },
    { ...valid, DEFAULT_ASSISTANT_MODEL: `https://${sentinel}` },
    { ...valid, DEFAULT_ASSISTANT_MODEL: 'test/fake' },
    { ...valid, DEFAULT_ASSISTANT_MODEL: 'unqualified/disabled' },
    { ...valid, DEFAULT_ASSISTANT_MODEL: 'meta/muse-spark-1.2' },
    { ...valid, DEFAULT_ASSISTANT_MODEL: 'openai/gpt-5' },
    { ...valid, META_API_KEY: undefined },
    { ...valid, META_API_KEY: '' },
    { ...valid, META_API_KEY: `${sentinel} with space` },
    { ...valid, DATABASE_URL: sentinel },
    { ...valid, SUPABASE_URL: '' },
    { ...valid, SUPABASE_URL: 'http://remote.invalid' },
    { ...valid, SUPABASE_URL: 'https://example.invalid/path' },
    { ...valid, SUPABASE_URL: `https://key:${sentinel}@example.invalid` },
    { ...valid, SUPABASE_URL: `https://example.invalid/?key=${sentinel}` },
    { ...valid, SUPABASE_PUBLISHABLE_KEY: '' },
    { ...valid, SUPABASE_PUBLISHABLE_KEY: 'invalid\nkey' },
    { ...valid, PORT: '-1' },
    { ...valid, PORT: '4111junk' },
    { ...valid, MIGRATION_DATABASE_URL: valid.DATABASE_URL },
    { ...valid, VITE_PRIVATE_KEY: sentinel },
    { ...valid, WORKPRINT_BROWSER_ORIGIN: '' },
    { ...valid, WORKPRINT_BROWSER_ORIGIN: 'http://remote.invalid' },
    { ...valid, WORKPRINT_BROWSER_ORIGIN: 'https://example.invalid/path' },
    { ...valid, WORKPRINT_BROWSER_ORIGIN: `https://user:${sentinel}@example.invalid` },
    { ...valid, WORKPRINT_BROWSER_ORIGIN: ' https://example.invalid' },
  ]) {
    assert.throws(() => loadServerConfig(env), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, new RegExp(sentinel));
      return true;
    });
  }
  assert.equal(loadServerConfig(valid).port, 4111);
  assert.deepEqual(loadServerConfig(valid).assistant, { model: 'meta/muse-spark-1.3', apiKey: valid.META_API_KEY });
  assert.equal(loadServerConfig({ ...valid, SUPABASE_URL: 'https://auth.example.invalid' }).supabase.url, 'https://auth.example.invalid');
});

test('model and key failures name only the setting, never the key', () => {
  const key = 'harmless-meta-key-sentinel';
  for (const [env, name] of [
    [{ ...valid, DEFAULT_ASSISTANT_MODEL: undefined }, 'DEFAULT_ASSISTANT_MODEL'],
    [{ ...valid, DEFAULT_ASSISTANT_MODEL: '' }, 'DEFAULT_ASSISTANT_MODEL'],
    [{ ...valid, DEFAULT_ASSISTANT_MODEL: 'unqualified/disabled' }, 'DEFAULT_ASSISTANT_MODEL'],
    [{ ...valid, DEFAULT_ASSISTANT_MODEL: 'mock/muse-spark-1.3' }, 'DEFAULT_ASSISTANT_MODEL'],
    [{ ...valid, META_API_KEY: undefined }, 'META_API_KEY'],
    [{ ...valid, META_API_KEY: `${key}\n` }, 'META_API_KEY'],
  ] as const) {
    assert.throws(() => loadServerConfig(env), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, `Invalid or missing server configuration: ${name}`);
      assert.doesNotMatch(error.message, new RegExp(key));
      return true;
    });
  }
});
