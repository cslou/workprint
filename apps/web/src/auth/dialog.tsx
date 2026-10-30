import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '../ui/controls.js';
import type { AccountOwner, AccountPresentation } from './owner.js';
import './dialog.css';

export type AccountActions = Pick<AccountOwner, 'close' | 'navigate' | 'validation' | 'signIn' | 'signOut' | 'reset' | 'updatePassword' | 'retryFence'>;

export function AccountDialog({ owner, state }: { owner: AccountActions; state: AccountPresentation }) {
  const head = useRef<HTMLDivElement>(null);
  // Disabling the submitting control must not move focus outside the modal or lose Escape.
  useLayoutEffect(() => { if (state.open && state.busy) head.current?.querySelector('button')?.focus(); }, [state.open, state.busy]);
  const storageFailure = ['account-lock-not-saved', 'signout-pending-lock-not-saved', 'signout-confirmed-lock-not-saved', 'signout-unconfirmed-lock-not-saved'].includes(state.screen);
  const title = storageFailure ? 'Account' : ['account', 'signed-out', 'signout-unconfirmed', 'switching', 'checking', 'refreshing'].includes(state.screen) ? 'Account' : ['password', 'password-rejected'].includes(state.screen) ? 'Set new password' : state.screen === 'expired' || state.screen === 'refresh-failed' || state.screen === 'startup-failed' ? 'Session' : ['reset', 'reset-sent', 'invalid-link', 'checking-link', 'password-updated', 'update-unconfirmed'].includes(state.screen) ? 'Reset password' : 'Sign in';
  return <ModalOverlay className="wp-modal-overlay" isOpen={state.open} isDismissable onOpenChange={open => { if (!open) owner.close(); }}><Modal className="wp-modal wp-auth-modal"><Dialog className="wp-dialog"><div className="wp-dialog-head" ref={head}><Heading slot="title">{title}</Heading><Button variant="icon" aria-label="Close" autoFocus onPress={owner.close}>×</Button></div>{state.open && <AccountBody owner={owner} state={state} />}</Dialog></Modal></ModalOverlay>;
}
function AccountBody({ owner, state }: { owner: AccountActions; state: AccountPresentation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const go = (screen: 'sign-in' | 'reset') => { setPassword(''); setConfirm(''); void owner.navigate(screen); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state.busy) return;
    if (state.screen === 'password' || state.screen === 'password-rejected') {
      if (!password) { owner.validation('Enter a new password.'); return; }
      if (password !== confirm) { owner.validation('Passwords don’t match. Re-enter the new password.'); setPassword(''); setConfirm(''); return; }
      const submitted = password; setPassword(''); setConfirm('');
      await owner.updatePassword(submitted);
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { owner.validation('Enter a valid email address.'); return; }
      if (state.screen === 'reset') await owner.reset(email.trim());
      else {
        if (!password) { owner.validation('Enter your password.'); return; }
        const submitted = password; setPassword('');
        await owner.signIn(email.trim(), submitted);
      }
    }
  };
  const field = (label: string, value: string, set: (value: string) => void, type: 'email' | 'password', autoComplete: string) => <label className="wp-auth-field"><span>{label}</span><input className="wp-input" type={type} value={value} onChange={event => set(event.target.value)} autoComplete={autoComplete} placeholder={{ Email: 'name@example.com', Password: 'Password', 'New password': 'New password', 'Confirm password': 'Repeat new password' }[label]} disabled={state.busy} aria-invalid={!!state.message} aria-describedby={state.message ? 'account-feedback' : undefined} /></label>;
  const form = state.screen === 'sign-in' || state.screen === 'reset' || state.screen === 'password' || state.screen === 'password-rejected';
  const copy: Partial<Record<AccountPresentation['screen'], string>> = {
    'sign-in': state.busy ? 'Checking your account…' : 'Use your existing account to access Workprint.',
    reset: state.busy ? 'Requesting a reset email…' : 'Enter your account email to request a reset link.',
    'password-rejected': 'Choose a new password for your account.',
    password: state.busy ? 'Updating your password…' : 'Choose a new password for your account.',
    'signed-out': state.busy ? 'Signing out…' : 'Signed out.', switching: 'Switching account…', 'signout-unconfirmed': 'We couldn’t confirm sign-out.', 'startup-failed': 'Your session couldn’t be checked.',
    'account-lock-not-saved': 'Account access is locked in this tab.',
    'signout-pending-lock-not-saved': 'Signing out…',
    'signout-confirmed-lock-not-saved': 'Signed out, but the browser lock couldn’t be saved.',
    'signout-unconfirmed-lock-not-saved': 'We couldn’t confirm sign-out.',
    refreshing: 'Refreshing your session…', 'refresh-failed': 'Your session couldn’t be refreshed.',
    'checking-link': 'Checking your reset link…',
    'reset-sent': 'Check your email.', 'invalid-link': 'This reset link can’t be used.', 'password-updated': 'Password updated.',
    'update-unconfirmed': 'We couldn’t confirm the password update.', expired: 'Your session has ended.', checking: 'Checking your session…', unconfigured: 'Sign-in is not configured for this build.',
  };
  const help: Partial<Record<AccountPresentation['screen'], string>> = {
    'account-lock-not-saved': 'Your browser couldn’t save the account lock. Close other Workprint tabs, allow browser storage, then try again. Saved work is unchanged.',
    'signout-pending-lock-not-saved': 'Your browser couldn’t save the account lock. Access is locked in this tab. Close other Workprint tabs and allow browser storage. Saved work is unchanged.',
    'signout-confirmed-lock-not-saved': 'Access is locked in this tab. Close other Workprint tabs, allow browser storage, then try again. Saved work is unchanged.',
    'signout-unconfirmed-lock-not-saved': 'Access is locked in this tab, but the lock couldn’t be saved. Close other Workprint tabs, allow browser storage, then try again. Saved work is unchanged.',
    'signout-unconfirmed': 'Account access is locked here. Try signing out again.', 'refresh-failed': 'Sign in again to continue. Local drafts were cleared; saved work is unchanged.',
    'signed-out': 'Local drafts were cleared. Saved work is unchanged.', switching: 'Signing out before showing sign-in. Saved work is unchanged.', 'startup-failed': 'Check your connection and sign in again to continue.',
    'reset-sent': 'If an account exists for that email, you’ll receive a reset link. Check your inbox and spam folder.',
    'invalid-link': 'It may be invalid, expired or already used. Request a new link and open the most recent email.',
    'password-updated': 'Sign in with your new password.', 'update-unconfirmed': 'Try signing in with the new password, or request another reset link.',
    expired: 'Sign in again to continue. Local drafts were cleared; saved work is unchanged.', unconfigured: 'Contact the workspace owner to configure account access.',
  };
  return <form className="wp-auth-content" onSubmit={event => { void submit(event); }} noValidate aria-busy={state.busy}>
    {state.account && <p className="wp-auth-identity">{state.account.name}</p>}
    {copy[state.screen] && <p>{copy[state.screen]}</p>}
    {help[state.screen] && (!state.busy || state.screen === 'switching' || state.screen === 'signout-pending-lock-not-saved') && <p className="wp-auth-detail">{help[state.screen]}</p>}
    {form && <div className="wp-auth-fields">{!['password', 'password-rejected'].includes(state.screen) && field('Email', email, setEmail, 'email', 'username')}{state.screen === 'sign-in' && field('Password', password, setPassword, 'password', 'current-password')}{['password', 'password-rejected'].includes(state.screen) && <>{field('New password', password, setPassword, 'password', 'new-password')}{field('Confirm password', confirm, setConfirm, 'password', 'new-password')}</>}</div>}
    <div id="account-feedback" className={state.message ? undefined : 'wp-sr-only'} role="status" aria-live="polite" aria-atomic="true">{state.message}</div>
    <div className="wp-auth-actions">
      {form && <Button type="submit" size="choose" isDisabled={state.busy}>{state.screen === 'sign-in' ? state.busy ? 'Signing in…' : 'Sign in' : state.screen === 'reset' ? state.busy ? 'Sending…' : 'Send reset link' : state.busy ? 'Updating…' : 'Update password'}</Button>}
      {state.screen === 'account' && <><Button variant="secondary" size="choose" isDisabled={state.busy} onPress={() => { void owner.signOut(); }}>Sign out</Button><Button variant="secondary" size="choose" isDisabled={state.busy} onPress={() => { void owner.signOut(true); }}>Switch account</Button></>}
      {state.screen === 'sign-in' && !state.busy && <Button variant="quiet" isDisabled={state.busy} onPress={() => go('reset')}>Forgot password?</Button>}
      {['account-lock-not-saved', 'signout-confirmed-lock-not-saved'].includes(state.screen) && <Button size="choose" onPress={() => { void owner.retryFence(); }}>Try again</Button>}
      {['signout-unconfirmed', 'signout-unconfirmed-lock-not-saved'].includes(state.screen) && <Button size="choose" onPress={() => { void owner.signOut(); }}>Try sign-out again</Button>}
      {state.screen === 'password-rejected' && !state.busy && <Button variant="quiet" onPress={() => go('reset')}>Request a new link</Button>}
      {state.screen === 'invalid-link' && <Button size="choose" isDisabled={state.busy} onPress={() => go('reset')}>Request a new link</Button>}
      {['reset', 'reset-sent', 'invalid-link', 'password', 'password-updated', 'update-unconfirmed', 'expired', 'refresh-failed', 'startup-failed', 'signed-out'].includes(state.screen) && !state.busy && <Button size="choose" variant={['reset', 'invalid-link', 'password'].includes(state.screen) ? 'quiet' : 'primary'} isDisabled={state.busy} onPress={() => go('sign-in')}>{['expired', 'refresh-failed', 'startup-failed', 'signed-out'].includes(state.screen) ? 'Sign in' : 'Back to sign in'}</Button>}
      {state.screen === 'update-unconfirmed' && !state.busy && <Button variant="quiet" isDisabled={state.busy} onPress={() => go('reset')}>Request a new link</Button>}
      {state.screen === 'reset-sent' && !state.busy && <Button variant="quiet" isDisabled={state.busy} onPress={() => go('reset')}>Use another email</Button>}
    </div>
    {state.screen === 'sign-in' && !state.busy && !state.message && <p className="wp-auth-help">Accounts are provided by your workspace owner.</p>}
  </form>;
}
