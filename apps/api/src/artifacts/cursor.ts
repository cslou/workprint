import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ArtifactError } from './errors.js';

/** Process-lifetime capabilities. Restarted servers reject old cursors explicitly. */
export function createCursors() {
  const key = randomBytes(32);
  const signature = (scope: string, payload: string) => createHmac('sha256', key).update(JSON.stringify([scope, payload])).digest();
  return {
    encode(scope: string, value: unknown): string {
      const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
      return `${payload}.${signature(scope, payload).toString('base64url')}`;
    },
    decode(scope: string, value: string): unknown {
      try {
        if (value.length > 1000) throw new Error('Cursor bound');
        const parts = value.split('.');
        if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error('Cursor encoding');
        const [payload, supplied] = parts as [string, string];
        const actual = Buffer.from(supplied, 'base64url');
        const expected = signature(scope, payload);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Cursor scope');
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
      } catch { throw new ArtifactError('invalid_input'); }
    },
  };
}
