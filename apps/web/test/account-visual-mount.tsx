import { createRoot } from 'react-dom/client';
import { AccountDialog, type AccountActions } from '../src/auth/dialog.js';
import type { AccountPresentation } from '../src/auth/owner.js';
import { Shell } from '../src/shell/shell.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

const element = document.getElementById('root');
if (!element) throw new Error('Missing visual test root');
const root = createRoot(element);
const noMutation = async () => { throw new Error('Presentation-only fixture cannot invoke Auth'); };
const actions: AccountActions = { close() {}, validation() {}, navigate: noMutation, signIn: noMutation, signOut: noMutation, reset: noMutation, updatePassword: noMutation, retryFence: noMutation };
(window as unknown as { accountVisual: unknown }).accountVisual = {
  configure(state: AccountPresentation) {
    root.render(<><Shell connection={{ kind: 'missing' }} session={state.account} onAccountOpen={() => {}} /><AccountDialog owner={actions} state={state} /></>);
  },
};
