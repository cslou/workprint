import { useLayoutEffect, useRef } from 'react';
import { AccountBody, type AccountActions } from './dialog.js';
import type { AccountOwner, AccountPresentation, AccountScreen } from './owner.js';
import './entry-page.css';

const titles: Partial<Record<AccountScreen, string>> = {
  'sign-in': 'Welcome back', checking: 'Checking your session', 'startup-failed': 'Couldn’t check your session',
  expired: 'Your session has ended', 'refresh-failed': 'Your session couldn’t be refreshed', unconfigured: 'Sign-in isn’t available',
  reset: 'Reset your password', 'reset-sent': 'Check your email', 'checking-link': 'Checking your reset link',
  password: 'Choose a new password', 'password-rejected': 'Choose a new password', 'password-updated': 'Password updated',
  'invalid-link': 'This link couldn’t be verified', 'update-unconfirmed': 'Password update unconfirmed',
  'signed-out': 'Workspace closed', switching: 'Switching account', 'signout-unconfirmed': 'Workspace closed',
  'account-lock-not-saved': 'Account access is locked', 'signout-pending-lock-not-saved': 'Workspace closed',
  'signout-confirmed-lock-not-saved': 'Workspace closed', 'signout-unconfirmed-lock-not-saved': 'Workspace closed',
};
const exitScreens: readonly AccountScreen[] = ['signed-out', 'switching', 'signout-unconfirmed', 'account-lock-not-saved', 'signout-pending-lock-not-saved', 'signout-confirmed-lock-not-saved', 'signout-unconfirmed-lock-not-saved'];

/** Public presentation only: no workspace subtree or protected read controllers. */
export function EntryPage({ owner, state, kind }: { owner: AccountActions & Pick<AccountOwner, 'retryRestore'>; state: AccountPresentation; kind: 'public' | 'sign-in' | 'recovery' | 'checking' | 'restore-failed' | 'not-found' }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const card = kind !== 'public' || exitScreens.includes(state.screen) || state.screen === 'checking' || state.screen === 'startup-failed';
  useLayoutEffect(() => { heading.current?.focus(); }, [kind, state.screen, state.busy]);
  return <div className="wp-entry">
    <header><a className="wp-entry-brand" href="/">Workprint</a></header>
    <main>{kind === 'not-found' ? <section className="wp-auth-card"><h1 ref={heading} tabIndex={-1}>Page not found</h1><p>Return to Workprint to continue.</p><a className="wp-entry-button" href="/">Back to Workprint</a></section> : card ? <section className="wp-auth-card" aria-labelledby="entry-heading">
      <h1 id="entry-heading" ref={heading} tabIndex={-1}>{state.screen === 'signed-out' && state.busy ? 'Signing out' : titles[state.screen] ?? 'Account'}</h1>
      <AccountBody owner={owner} state={state} card />
    </section> : <section className="wp-entry-hero"><h1 ref={heading} tabIndex={-1}>{state.account ? 'Your next idea starts here.' : 'Make room for your next idea.'}</h1><p>{state.account ? 'Return to your conversations and saved work.' : 'Start with a moment, a scene, or a rough idea. Keep your conversations and saved work together.'}</p><a className="wp-entry-button" href={state.account ? '/app' : '/sign-in'}>{state.account ? 'Open workspace' : 'Sign in'}</a></section>}</main>
  </div>;
}
