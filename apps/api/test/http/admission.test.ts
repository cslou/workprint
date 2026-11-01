import { test } from 'node:test';
import { verifyBuiltAdmission } from '../support/auth-built-fixture.js';

// The full Auth admission matrix runs once here; other HTTP and browser tests start a plain backend.
test('the built server admits only verified sessions and exposes only catalog routes', { timeout: 180000 }, async t => {
  await verifyBuiltAdmission(t);
});
