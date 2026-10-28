import { expect, test } from '@playwright/test';
import { parsePublicApiOrigin } from '../../../apps/web/src/api/public-config.js';

test('public API configuration is explicit, origin-only and never reflects invalid secrets', () => {
  for (const value of [undefined, null, '']) expect(parsePublicApiOrigin(value)).toEqual({ kind: 'missing' });
  for (const value of ['https://api.example.invalid', 'http://127.0.0.1:4111', 'http://localhost:4111', 'http://[::1]:4111']) expect(parsePublicApiOrigin(value)).toEqual({ kind: 'configured', apiOrigin: value });
  for (const value of ['http://remote.invalid', '/v1', 'https://user:secret@example.invalid', 'https://example.invalid/path', 'https://example.invalid/?secret=value', 'https://example.invalid/#token', ' https://example.invalid', 42, {}]) expect(parsePublicApiOrigin(value)).toEqual({ kind: 'invalid' });
});
