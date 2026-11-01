import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workspaceReturn, entryDecision } from '../../../src/auth/entry.js';
import type { AccountPresentation } from '../../../src/auth/owner.js';

const conversation = '8f7bf4e2-23d8-4c9c-8ef7-6a00f58d15ea';
const workspace = `/app?conversation=${conversation}`;
const state = (screen: AccountPresentation['screen'], confirmed = false): AccountPresentation => ({ screen, account: confirmed ? { accountId: 'confirmed-account', name: 'Account' } : null, open: false, busy: false, message: '' });
const decide = (path: string, screen: AccountPresentation['screen'], confirmed = false) => entryDecision(new URL(path, 'http://127.0.0.1:49180'), state(screen, confirmed));

test('workspace return destinations allow only the supported relative path and exact conversation query', () => {
  assert.equal(workspaceReturn('/app'), '/app');
  assert.equal(workspaceReturn(workspace), workspace);
  for (const target of [null, '', '/', '/sign-in', '/auth/callback', '/api/memory/threads', 'https://example.com/app', '//example.com/app', 'http://127.0.0.1:49180/app', '\\example.com\\app', '/app#fragment', '/app/', '/APP', '/app?other=value', '/app?CONVERSATION=' + conversation, `${workspace}&other=value`, `${workspace}&conversation=${conversation}`, '/app?conversation=', '/app?conversation=invalid', '/app?conversation=../../auth/callback', '/app?%63onversation=' + conversation, '/%61pp', '/app/../app', '/%2f%2fexample.com/app', '/app%3fconversation%3d' + conversation, '/app?conversation=%38' + conversation.slice(1), '/app\n', '/app\u2028', '/app\u2029', '/app?conversation=%ZZ']) {
    assert.equal(workspaceReturn(target), '/app', `Rejected return path ${JSON.stringify(target)}`);
  }
});

test('public entry stays public and legacy conversation links migrate through the workspace gate', () => {
  assert.deepEqual(decide('/', 'sign-in'), { kind: 'public' });
  assert.deepEqual(decide('/', 'account', true), { kind: 'public' });
  assert.deepEqual(decide('/?conversation=' + conversation, 'checking'), { kind: 'replace', target: workspace });
  assert.deepEqual(decide('/?conversation=invalid', 'account', true), { kind: 'replace', target: '/app' });
  assert.deepEqual(decide('/?conversation=' + conversation + '&other=value', 'sign-in'), { kind: 'replace', target: '/app' });
  assert.deepEqual(decide('/unknown', 'account', true), { kind: 'not-found' });
});

test('workspace decisions never admit an unconfirmed session or confuse cold failure with expiry', () => {
  assert.deepEqual(decide(workspace, 'checking'), { kind: 'checking' });
  assert.deepEqual(decide(workspace, 'startup-failed'), { kind: 'restore-failed' });
  assert.deepEqual(decide(workspace, 'sign-in'), { kind: 'replace', target: '/sign-in?returnTo=' + encodeURIComponent(workspace) });
  assert.deepEqual(decide(workspace, 'expired'), { kind: 'replace', target: '/sign-in?returnTo=' + encodeURIComponent(workspace) });
  assert.deepEqual(decide(workspace, 'account', true), { kind: 'workspace' });
  assert.deepEqual(decide(workspace, 'refreshing', true), { kind: 'workspace' });
  assert.deepEqual(decide('/app?other=value', 'account', true), { kind: 'replace', target: '/app' });
  for (const screen of ['signout-unconfirmed', 'signout-pending-lock-not-saved', 'signout-confirmed-lock-not-saved', 'signout-unconfirmed-lock-not-saved'] as const) {
    assert.deepEqual(decide(workspace, screen), { kind: 'replace', target: '/' });
  }
  assert.deepEqual(decide(workspace, 'signed-out'), { kind: 'replace', target: '/' });
  assert.deepEqual(decide(workspace, 'switching'), { kind: 'replace', target: '/sign-in?returnTo=' + encodeURIComponent(workspace) });
});

test('sign-in replaces only after confirmation, preserving allowlisted returns', () => {
  const signIn = '/sign-in?returnTo=' + encodeURIComponent(workspace);
  assert.deepEqual(decide(signIn, 'checking'), { kind: 'checking' });
  assert.deepEqual(decide(signIn, 'startup-failed'), { kind: 'restore-failed' });
  assert.deepEqual(decide(signIn, 'sign-in'), { kind: 'sign-in' });
  assert.deepEqual(decide(signIn, 'account', true), { kind: 'replace', target: workspace });
  for (const query of ['returnTo=//example.com/app', 'returnTo=%252Fapp', 'returnTo=%2Fauth%2Fcallback', 'returnTo=%2Fapp&returnTo=' + encodeURIComponent(workspace)]) {
    assert.deepEqual(decide('/sign-in?' + query, 'account', true), { kind: 'replace', target: '/app' });
  }
});

test('recovery callback takes precedence without retaining callback secrets in decisions', () => {
  for (const screen of ['checking-link', 'password', 'password-updated', 'account'] as const) {
    assert.deepEqual(decide('/auth/callback?code=synthetic-private-code#synthetic-fragment', screen, screen === 'account'), { kind: 'recovery' });
  }
});
