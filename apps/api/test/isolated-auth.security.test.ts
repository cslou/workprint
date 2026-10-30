import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { isolatedAuth } from './isolated-auth.js';
import { AuthFixtureResources } from './auth-fixture-resources.js';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
const absent = async (kind: 'container' | 'network', id: string) => {
  try { await exec('docker', [kind, 'inspect', id]); return false; }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 1 && 'stderr' in error && typeof error.stderr === 'string' && /No such (object|container|network)|network [^\n]+ not found/i.test(error.stderr)) return true;
    throw error;
  }
};

test('isolated real Auth delivers captured recovery mail and removes only owned fixture resources', { timeout: 180000 }, async (t) => {
  const fixture = await isolatedAuth();
  t.after(fixture.close);
  assert.equal((await stat(fixture.privateFile)).mode & 0o777, 0o600);
  assert.equal(new URL(fixture.url).hostname, '127.0.0.1');
  assert.equal(new URL(fixture.mailUrl).hostname, '127.0.0.1');
  const account = await fixture.createAccount();
  const signed = await fixture.request('token?grant_type=password', { email: account.email, password: account.password });
  assert.equal(signed.status, 200);
  const identity = await signed.json() as { access_token: string; refresh_token: string; user: { id: string } };
  assert.equal(identity.user.id, account.id);
  const verified = await fixture.request('user', undefined, identity.access_token);
  assert.equal(verified.status, 200);
  assert.equal((await verified.json() as { id: string }).id, account.id);
  const recovery = await fixture.request('recover?redirect_to=' + encodeURIComponent('http://127.0.0.1:4179/auth/callback'), { email: account.email });
  assert.equal(recovery.status, 200);
  const link = await fixture.recoveryLink(account.email);
  const consumed = await fetch(link, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  assert.equal(consumed.status, 303);
  const location = consumed.headers.get('location');
  assert.ok(location, 'Real email verification redirects to the configured browser callback');
  const callback = new URL(location);
  assert.equal(callback.origin, 'http://127.0.0.1:4179');
  assert.equal(callback.pathname, '/auth/callback');
  const fragment = new URLSearchParams(callback.hash.slice(1));
  assert.equal(fragment.get('type'), 'recovery');
  const recoveredToken = fragment.get('access_token');
  assert.ok(recoveredToken);
  const updated = await fixture.request('user', { password: account.nextPassword }, recoveredToken, 'PUT');
  assert.equal(updated.status, 200);
  const fresh = await fixture.request('token?grant_type=password', { email: account.email, password: account.nextPassword });
  assert.equal(fresh.status, 200);
  assert.equal((await fresh.json() as { user: { id: string } }).user.id, account.id);
  const old = await fixture.request('token?grant_type=password', { email: account.email, password: account.password });
  assert.equal(old.status, 400);
  const reused = await fetch(link, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  assert.equal(reused.status, 303);
  const rejected = new URL(reused.headers.get('location')!);
  assert.ok(new URLSearchParams(rejected.hash.slice(1)).has('error_code'), 'The consumed email link cannot establish recovery again');
  await fixture.close();
  await assert.rejects(stat(fixture.privateFile), { code: 'ENOENT' });
  for (const id of fixture.containerIds) assert.equal(await absent('container', id), true);
  for (const id of fixture.networkIds) assert.equal(await absent('network', id), true);
});

test('Auth resource cleanup refuses another owner and leaves those networks intact', { timeout: 30000 }, async (t) => {
  const actual = new AuthFixtureResources();
  t.after(() => actual.closeNetwork());
  await actual.createNetwork();
  const wrong = new AuthFixtureResources();
  wrong.networkId = actual.networkId;
  wrong.edgeNetworkId = actual.edgeNetworkId;
  await assert.rejects(wrong.closeNetwork(), error => error instanceof AggregateError && error.errors.length === 2 && error.errors.every(value => value instanceof Error && /ownership mismatch/.test(value.message)));
  assert.equal(await absent('network', actual.networkId), false);
  assert.equal(await absent('network', actual.edgeNetworkId), false);
  await actual.closeNetwork();
});

test('isolated Auth maximum-use timer removes services without test-side cleanup', { timeout: 180000 }, async (t) => {
  const fixture = await isolatedAuth({ lifetimeMs: 200 });
  t.after(fixture.close);
  const deadline = Date.now() + 20000;
  while (!(await Promise.all(fixture.networkIds.map(id => absent('network', id)))).every(Boolean)) {
    if (Date.now() > deadline) throw new Error('Fixture lifetime cleanup deadline exceeded');
    await delay(100);
  }
  for (const id of fixture.containerIds) assert.equal(await absent('container', id), true);
  for (const id of fixture.networkIds) assert.equal(await absent('network', id), true);
  await assert.rejects(fixture.createAccount(), /closed or expired/);
  await fixture.close();
});
