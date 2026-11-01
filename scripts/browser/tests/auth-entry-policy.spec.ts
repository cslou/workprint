import { test, expect } from '@playwright/test';
import { workspaceReturn, entryDecision } from '../../../apps/web/src/auth/entry.js';
import type { AccountPresentation } from '../../../apps/web/src/auth/owner.js';

const conversation = '8f7bf4e2-23d8-4c9c-8ef7-6a00f58d15ea';
const workspace = `/app?conversation=${conversation}`;
const state = (screen: AccountPresentation['screen'], confirmed = false): AccountPresentation => ({ screen, account: confirmed ? { accountId: 'confirmed-account', name: 'Account' } : null, open: false, busy: false, message: '' });
const decide = (path: string, screen: AccountPresentation['screen'], confirmed = false) => entryDecision(new URL(path, 'http://127.0.0.1:49180'), state(screen, confirmed));

test('workspace return destinations allow only the supported relative path and exact conversation query', () => {
  expect(workspaceReturn('/app')).toBe('/app');
  expect(workspaceReturn(workspace)).toBe(workspace);
  for (const target of [null, '', '/', '/sign-in', '/auth/callback', '/api/memory/threads', 'https://example.com/app', '//example.com/app', 'http://127.0.0.1:49180/app', '\\example.com\\app', '/app#fragment', '/app/', '/APP', '/app?other=value', '/app?CONVERSATION=' + conversation, `${workspace}&other=value`, `${workspace}&conversation=${conversation}`, '/app?conversation=', '/app?conversation=invalid', '/app?conversation=../../auth/callback', '/app?%63onversation=' + conversation, '/%61pp', '/app/../app', '/%2f%2fexample.com/app', '/app%3fconversation%3d' + conversation, '/app?conversation=%38' + conversation.slice(1), '/app\n', '/app\u2028', '/app\u2029', '/app?conversation=%ZZ']) {
    expect(workspaceReturn(target), `Rejected return path ${JSON.stringify(target)}`).toBe('/app');
  }
});

test('public entry stays public and legacy conversation links migrate through the workspace gate', () => {
  expect(decide('/', 'sign-in')).toEqual({ kind: 'public' });
  expect(decide('/', 'account', true)).toEqual({ kind: 'public' });
  expect(decide('/?conversation=' + conversation, 'checking')).toEqual({ kind: 'replace', target: workspace });
  expect(decide('/?conversation=invalid', 'account', true)).toEqual({ kind: 'replace', target: '/app' });
  expect(decide('/?conversation=' + conversation + '&other=value', 'sign-in')).toEqual({ kind: 'replace', target: '/app' });
  expect(decide('/unknown', 'account', true)).toEqual({ kind: 'not-found' });
});

test('workspace decisions never admit an unconfirmed session or confuse cold failure with expiry', () => {
  expect(decide(workspace, 'checking')).toEqual({ kind: 'checking' });
  expect(decide(workspace, 'startup-failed')).toEqual({ kind: 'restore-failed' });
  expect(decide(workspace, 'sign-in')).toEqual({ kind: 'replace', target: '/sign-in?returnTo=' + encodeURIComponent(workspace) });
  expect(decide(workspace, 'expired')).toEqual({ kind: 'replace', target: '/sign-in?returnTo=' + encodeURIComponent(workspace) });
  expect(decide(workspace, 'account', true)).toEqual({ kind: 'workspace' });
  expect(decide(workspace, 'refreshing', true)).toEqual({ kind: 'workspace' });
  expect(decide('/app?other=value', 'account', true)).toEqual({ kind: 'replace', target: '/app' });
  for (const screen of ['signout-unconfirmed', 'signout-pending-lock-not-saved', 'signout-confirmed-lock-not-saved', 'signout-unconfirmed-lock-not-saved'] as const) {
    expect(decide(workspace, screen)).toEqual({ kind: 'replace', target: '/' });
  }
  expect(decide(workspace, 'signed-out')).toEqual({ kind: 'replace', target: '/' });
  expect(decide(workspace, 'switching')).toEqual({ kind: 'replace', target: '/sign-in?returnTo=' + encodeURIComponent(workspace) });
});

test('sign-in replaces only after confirmation, preserving allowlisted returns', () => {
  const signIn = '/sign-in?returnTo=' + encodeURIComponent(workspace);
  expect(decide(signIn, 'checking')).toEqual({ kind: 'checking' });
  expect(decide(signIn, 'startup-failed')).toEqual({ kind: 'restore-failed' });
  expect(decide(signIn, 'sign-in')).toEqual({ kind: 'sign-in' });
  expect(decide(signIn, 'account', true)).toEqual({ kind: 'replace', target: workspace });
  for (const query of ['returnTo=//example.com/app', 'returnTo=%252Fapp', 'returnTo=%2Fauth%2Fcallback', 'returnTo=%2Fapp&returnTo=' + encodeURIComponent(workspace)]) {
    expect(decide('/sign-in?' + query, 'account', true)).toEqual({ kind: 'replace', target: '/app' });
  }
});

test('recovery callback takes precedence without retaining callback secrets in decisions', () => {
  for (const screen of ['checking-link', 'password', 'password-updated', 'account'] as const) {
    expect(decide('/auth/callback?code=synthetic-private-code#synthetic-fragment', screen, screen === 'account')).toEqual({ kind: 'recovery' });
  }
});
