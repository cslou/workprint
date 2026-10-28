import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { questionSchema, proposalSchema, versionSchema, workspaceSchema } from '@workprint/contracts';
import type { Question } from '@workprint/contracts';
import { createBrowserClient, type BrowserClient } from '../src/api/client.js';
import { QuestionReview } from '../src/conversation/question.js';
import type { ProposalInputNames } from '../src/conversation/proposal.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';
import '../src/shell/shell.css';

const question = questionSchema.parse({ id: 'question-example', revision: 7, status: 'pending', scope: {}, prompt: 'How does Mercer react?', options: [{ id: 'surprised', label: 'He looks up at Vale, surprised' }, { id: 'nod', label: 'He stays still, then gives a small nod' }] });
const proposal = proposalSchema.parse({ id: 'proposal-example', revision: 3, questionId: question.id, purpose: 'panel_image', target: { shotId: 'shot-example', panelId: 'panel-example' }, provider: 'example-provider', model: 'example-model', prompt: 'Vale recognises Mercer in the gallery.', settings: { aspectRatio: '16:9', camera: 'still' }, candidateCount: 1, inputs: [{ versionId: 'vale-v1', role: 'character_reference', order: 0 }, { versionId: 'gallery-v1', role: 'place_reference', order: 1 }], disclosures: ['Input references are sent to example-provider.', 'The output is a generated candidate, not an approved version.'], estimate: { amount: 0.12, currency: 'USD', basis: 'estimated' } });
const names: ProposalInputNames = { 'vale-v1': { name: 'Vale reference' }, 'gallery-v1': { name: 'Gallery reference' } };
const panel = { panelId: 'panel-example', order: 9, description: '', references: [], candidateImageVersions: [], approvedImageVersionId: null };
const workspace = workspaceSchema.parse({ script: null, assets: [], storyboard: { work: null, shots: [{ shotId: 'shot-example', order: 20, panels: [panel], chosenVideoVersionId: null }, { shotId: 'earlier-shot', order: 5, panels: [], chosenVideoVersionId: null }] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: 1 });
const versions = ['vale-v1', 'gallery-v1'].map((id) => versionSchema.parse({ id, artifactId: id + '-artifact', revision: 1, kind: 'reference', content: {}, createdBy: 'human', createdAt: '2026-10-28T00:00:00Z', dependencies: [] }));
let node = document.getElementById('root');
const reference = new URLSearchParams(location.search).get('reference');
if (reference) {
  const response = await fetch(`/references/${reference === 'proposal' ? 'flow2-step6-r78.html' : 'flow2-step2-r74.html'}`);
  if (!response.ok) throw new Error('Question reference unavailable');
  const source = new DOMParser().parseFromString(await response.text(), 'text/html');
  source.querySelectorAll('[src]').forEach((element) => element.setAttribute('src', `/references/${element.getAttribute('src')}`));
  document.body.innerHTML = source.body.innerHTML; document.body.className = source.body.className;
  document.documentElement.style.setProperty('--font-sans', 'var(--font-family-sans)');
  document.documentElement.style.setProperty('--font-display', 'var(--font-family-display)');
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/references/app-r11.css'; document.head.prepend(style);
  const normalization = document.createElement('style'); normalization.textContent = 'b,strong{font-weight:var(--font-weight-semibold)}'; document.head.append(normalization);
  const dock = document.querySelector('.dockwrap');
  if (!dock) throw new Error('Missing reference question dock');
  node = document.createElement('div'); node.style.display = 'contents'; dock.replaceWith(node);
}
if (!node) throw new Error('Missing question test root');
const root = createRoot(node);
let connection: BrowserClient = { kind: 'missing' };
let token: string | null = null;
let tokenCalls = 0;
const nativeCalls: string[] = [];
(window as unknown as { questionTest: unknown }).questionTest = {
  configure(input: { apiOrigin?: string; token?: string | null; accountId?: string; withProposal?: boolean; question?: Question; missingFacts?: boolean; workspace?: typeof workspace; sync?: boolean }) {
    token = input.token ?? null;
    if (input.apiOrigin !== undefined) {
      connection = createBrowserClient(input.apiOrigin, async () => { tokenCalls++; return token; });
      if (connection.kind === 'configured') { const client = connection.client; connection = { ...connection, client: { ...client, native: Object.fromEntries(Object.entries(client.native).map(([name, method]) => [name, async () => { nativeCalls.push(name); return method(); }])) as typeof client.native } }; }
    }
    const record = input.question ?? { ...question, ...(input.withProposal ? { prompt: 'Make Panel 2.1?', options: [{ id: 'surprised', label: 'Request a different framing' }, { id: 'nod', label: 'Make this panel' }] } : {}), scope: input.withProposal ? { proposalId: proposal.id } : {} };
    const render = () => root.render(<QuestionReview connection={connection} scope={{ accountId: input.accountId ?? 'read-only-account', conversationId: 'read-only-conversation' }} question={questionSchema.parse(record)} {...(input.withProposal ? { proposalPrerequisite: proposal, versionPrerequisites: versions, workspace: input.workspace ?? workspace, ...(input.missingFacts ? {} : { inputNames: names }) } : {})} />);
    if (input.sync) flushSync(render); else render();
  },
  unmount() { root.render(null); },
  observations() { return { tokenCalls, nativeCalls }; },
};
