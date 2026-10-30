import { useState, type FormEvent } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '../ui/controls.js';
import type { AccountOwner, AccountPresentation } from './owner.js';
import './dialog.css';

export function AccountDialog({ owner, state }: { owner: AccountOwner; state: AccountPresentation }) {
  const title = ['account', 'signed-out', 'signout-unconfirmed', 'switching'].includes(state.screen) ? 'Account' : state.screen === 'password' ? 'Set new password' : state.screen === 'checking' || state.screen === 'expired' || state.screen === 'startup-failed' ? 'Session' : ['reset', 'reset-sent', 'invalid-link', 'password-updated', 'update-unconfirmed'].includes(state.screen) ? 'Reset password' : 'Sign in';
  return <ModalOverlay className="wp-modal-overlay" isOpen={state.open} isDismissable onOpenChange={open => { if (!open) owner.close(); }}><Modal className="wp-modal wp-auth-modal"><Dialog className="wp-dialog"><div className="wp-dialog-head"><Heading slot="title">{title}</Heading><Button variant="icon" aria-label="Close" autoFocus onPress={owner.close}>×</Button></div>{state.open && <AccountBody owner={owner} state={state} />}</Dialog></Modal></ModalOverlay>;
}
function AccountBody({ owner, state }: { owner: AccountOwner; state: AccountPresentation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const go = (screen: 'sign-in' | 'reset') => { setPassword(''); setConfirm(''); void owner.navigate(screen); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state.busy) return;
    if (state.screen === 'password') {
      if (!password) { owner.validation('Enter a new password.'); return; }
      if (password !== confirm) { owner.validation('Passwords don’t match. Re-enter the new password.'); setPassword(''); setConfirm(''); return; }
      try { await owner.updatePassword(password); } finally { setPassword(''); setConfirm(''); }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { owner.validation('Enter a valid email address.'); return; }
      if (state.screen === 'reset') await owner.reset(email.trim());
      else {
        if (!password) { owner.validation('Enter your password.'); return; }
        try { await owner.signIn(email.trim(), password); } finally { setPassword(''); }
      }
    }
  };
  const field = (label: string, value: string, set: (value: string) => void, type: 'email' | 'password', autoComplete: string) => <label className="wp-auth-field"><span>{label}</span><input className="wp-input" type={type} value={value} onChange={event => set(event.target.value)} autoComplete={autoComplete} disabled={state.busy} aria-invalid={!!state.message} aria-describedby={state.message ? 'account-feedback' : undefined} /></label>;
  const form = state.screen === 'sign-in' || state.screen === 'reset' || state.screen === 'password';
  const copy: Partial<Record<AccountPresentation['screen'], string>> = {
    'sign-in': state.busy ? 'Checking your account…' : 'Use your existing account to access Workprint.',
    reset: state.busy ? 'Requesting a reset link…' : 'Enter your account email to request a reset link.',
    password: state.busy ? 'Updating your password…' : 'Choose a new password for your account.',
    'signed-out': state.busy ? 'Signing out…' : 'Signed out.', switching: 'Switching account…', 'signout-unconfirmed': 'Sign-out could not be confirmed.', 'startup-failed': 'Your session couldn’t be checked.',
    'reset-sent': 'Check your email.', 'invalid-link': 'This reset link can’t be used.', 'password-updated': 'Password updated.',
    'update-unconfirmed': 'We couldn’t confirm the password update.', expired: 'Your session has ended.', checking: 'Checking your session…', unconfigured: 'Sign-in is not configured for this build.',
  };
  const help: Partial<Record<AccountPresentation['screen'], string>> = {
    'signed-out': 'Local drafts were cleared. Saved work is unchanged.', switching: 'Signing out before showing sign-in. Saved work is unchanged.', 'startup-failed': 'Check your connection and sign in again to continue.',
    'reset-sent': 'If an account exists for that email, you’ll receive a reset link. Check your inbox and spam folder.',
    'invalid-link': 'It may be invalid, expired or already used. Request a new link and open the most recent email.',
    'password-updated': 'Sign in with your new password.', 'update-unconfirmed': 'Try signing in with the new password, or request another reset link.',
    expired: 'Sign in again to continue. Local drafts were cleared; saved work is unchanged.', unconfigured: 'Contact the workspace owner to configure account access.',
  };
  return <form className="wp-auth-content" onSubmit={event => { void submit(event); }} noValidate aria-busy={state.busy}>
    {state.screen === 'account' ? <p className="wp-auth-identity">{state.account?.name}</p> : <p>{copy[state.screen]}</p>}
    {help[state.screen] && <p>{help[state.screen]}</p>}
    {form && <div className="wp-auth-fields">{state.screen !== 'password' && field('Email', email, setEmail, 'email', 'username')}{state.screen === 'sign-in' && field('Password', password, setPassword, 'password', 'current-password')}{state.screen === 'password' && <>{field('New password', password, setPassword, 'password', 'new-password')}{field('Confirm password', confirm, setConfirm, 'password', 'new-password')}</>}</div>}
    <div id="account-feedback" role="status" aria-live="polite" aria-atomic="true">{state.message}</div>
    <div className="wp-auth-actions">
      {form && <Button type="submit" size="choose" isDisabled={state.busy}>{state.screen === 'sign-in' ? state.busy ? 'Signing in…' : 'Sign in' : state.screen === 'reset' ? state.busy ? 'Requesting…' : 'Send reset link' : state.busy ? 'Updating…' : 'Update password'}</Button>}
      {state.screen === 'account' && <><Button variant="secondary" isDisabled={state.busy} onPress={() => { void owner.signOut(); }}>Sign out</Button><Button variant="secondary" isDisabled={state.busy} onPress={() => { void owner.signOut(true); }}>Switch account</Button></>}
      {state.screen === 'sign-in' && <Button variant="quiet" isDisabled={state.busy} onPress={() => go('reset')}>Forgot password?</Button>}
      {(state.screen === 'invalid-link' || state.screen === 'update-unconfirmed') && <Button size="choose" isDisabled={state.busy} onPress={() => go('reset')}>Request a new link</Button>}
      {['reset', 'reset-sent', 'invalid-link', 'password', 'password-updated', 'update-unconfirmed', 'expired', 'startup-failed', 'signed-out', 'signout-unconfirmed'].includes(state.screen) && <Button variant="quiet" isDisabled={state.busy} onPress={() => go('sign-in')}>{['expired', 'startup-failed', 'signed-out', 'signout-unconfirmed'].includes(state.screen) ? 'Sign in' : 'Back to sign in'}</Button>}
      {state.screen === 'reset-sent' && <Button variant="quiet" isDisabled={state.busy} onPress={() => go('reset')}>Use another email</Button>}
    </div>
  </form>;
}
