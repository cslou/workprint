import { test } from 'node:test';
import { verifyBuiltAdmission } from './auth-built-fixture.js';

test('built admission verifies Supabase accounts, rejects forged/expired tokens and closes production routes', { timeout: 180000 }, async (t) => {
  await verifyBuiltAdmission(t);
});
