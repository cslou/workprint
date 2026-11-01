import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePublicApiOrigin } from '../../../src/api/public-config.js';

test('public API origin accepts only a bare origin and treats blanks as missing', () => {
  for (const value of [undefined, null, '']) assert.deepEqual(parsePublicApiOrigin(value), { kind: 'missing' });
  for (const value of ['https://api.example.invalid', 'http://127.0.0.1:4111', 'http://localhost:4111', 'http://[::1]:4111']) assert.deepEqual(parsePublicApiOrigin(value), { kind: 'configured', apiOrigin: value });
  for (const value of ['http://remote.invalid', '/v1', 'https://user:secret@example.invalid', 'https://example.invalid/path', 'https://example.invalid/?secret=value', 'https://example.invalid/#token', ' https://example.invalid', 42, {}]) assert.deepEqual(parsePublicApiOrigin(value), { kind: 'invalid' });
});
