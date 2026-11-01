import type { AccountPresentation } from './owner.js';

const workspacePath = /^\/app(?:\?conversation=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})?$/;

/** Relative paths only; do not normalize/decode an untrusted return into the allowlist. */
export function workspaceReturn(value: string | null): string {
  const match = workspacePath.exec(value ?? '');
  return match && match[0] === value ? value : '/app';
}

export type EntryDecision =
  | { kind: 'public' | 'sign-in' | 'workspace' | 'recovery' | 'checking' | 'restore-failed' | 'not-found' }
  | { kind: 'replace'; target: string };

/** Pure presentation policy. The caller owns rendering/history; backend Auth still owns admission. */
export function entryDecision(url: URL, state: AccountPresentation): EntryDecision {
  // Callback purpose and secret stripping belong to AccountOwner, ahead of ordinary redirects.
  if (url.pathname === '/auth/callback') return state.screen === 'sign-in' ? { kind: 'replace', target: '/sign-in' } : { kind: 'recovery' };
  if (url.pathname === '/') {
    if (url.searchParams.has('conversation')) return { kind: 'replace', target: workspaceReturn('/app' + url.search) };
    return { kind: 'public' };
  }
  if (url.pathname !== '/app' && url.pathname !== '/sign-in') return { kind: 'not-found' };
  const destination = url.pathname === '/app' ? workspaceReturn(url.pathname + url.search + url.hash) : workspaceReturn(url.searchParams.getAll('returnTo').length === 1 ? url.searchParams.get('returnTo') : null);
  if (url.pathname === '/app' && destination !== url.pathname + url.search + url.hash) return { kind: 'replace', target: destination };
  // AccountOwner publishes identity only after validation. Refresh keeps that same confirmed scope.
  if (state.account) return url.pathname === '/app' ? { kind: 'workspace' } : { kind: 'replace', target: destination };
  if (state.screen === 'checking') return { kind: 'checking' };
  if (state.screen === 'startup-failed') return { kind: 'restore-failed' };
  if (url.pathname === '/sign-in') return { kind: 'sign-in' };
  const exiting = ['signed-out', 'signout-unconfirmed', 'signout-pending-lock-not-saved', 'signout-confirmed-lock-not-saved', 'signout-unconfirmed-lock-not-saved'].includes(state.screen);
  return { kind: 'replace', target: exiting ? '/' : '/sign-in?returnTo=' + encodeURIComponent(destination) };
}
