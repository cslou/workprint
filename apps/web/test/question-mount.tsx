import { createRoot } from 'react-dom/client';
import { questionSchema, proposalSchema, versionSchema } from '@workprint/contracts';
import type { Question } from '@workprint/contracts';
import { createBrowserClient, type BrowserClient } from '../src/api/client.js';
import { QuestionReview } from '../src/conversation/question.js';
import type { ProposalDisplayFacts } from '../src/conversation/proposal.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';
import '../src/shell/shell.css';

const question = questionSchema.parse({ id: 'question-example', revision: 7, status: 'pending', scope: {}, prompt: 'How does Mercer react?', options: [{ id: 'surprised', label: 'He looks up at Vale, surprised' }, { id: 'nod', label: 'He stays still, then gives a small nod' }] });
const proposal = proposalSchema.parse({ id: 'proposal-example', revision: 3, questionId: question.id, purpose: 'panel_image', target: { shotId: 'shot-example', panelId: 'panel-example' }, provider: 'example-provider', model: 'example-model', prompt: 'Vale recognises Mercer in the gallery.', settings: { aspectRatio: '16:9', camera: 'still' }, candidateCount: 1, inputs: [{ versionId: 'vale-v1', role: 'character_reference', order: 0 }, { versionId: 'gallery-v1', role: 'place_reference', order: 1 }], disclosures: [], estimate: { amount: 0.12, currency: 'USD', basis: 'estimated' } });
const facts: ProposalDisplayFacts = { proposalId: proposal.id, proposalRevision: proposal.revision, shot: { id: 'shot-example', number: 2 }, panel: { id: 'panel-example', number: 1 }, inputs: { 'vale-v1': { name: 'Vale reference', versionNumber: 1 }, 'gallery-v1': { name: 'Gallery reference', versionNumber: 1 } } };
const versions = ['vale-v1', 'gallery-v1'].map((id) => versionSchema.parse({ id, artifactId: id + '-artifact', revision: 1, kind: 'reference', content: {}, createdBy: 'human', createdAt: '2026-10-28T00:00:00Z', dependencies: [] }));
const node = document.getElementById('root');
if (!node) throw new Error('Missing question test root');
const root = createRoot(node);
let connection: BrowserClient = { kind: 'missing' };
let token: string | null = null;
let tokenCalls = 0;
const nativeCalls: string[] = [];
(window as unknown as { questionTest: unknown }).questionTest = {
  configure(input: { apiOrigin?: string; token?: string | null; accountId?: string; withProposal?: boolean; question?: Question; missingFacts?: boolean }) {
    token = input.token ?? null;
    if (input.apiOrigin !== undefined) {
      connection = createBrowserClient(input.apiOrigin, async () => { tokenCalls++; return token; });
      if (connection.kind === 'configured') { const client = connection.client; connection = { ...connection, client: { ...client, native: Object.fromEntries(Object.entries(client.native).map(([name, method]) => [name, async () => { nativeCalls.push(name); return method(); }])) as typeof client.native } }; }
    }
    const record = input.question ?? { ...question, scope: input.withProposal ? { proposalId: proposal.id } : {} };
    root.render(<QuestionReview connection={connection} scope={{ accountId: input.accountId ?? 'read-only-account', conversationId: 'read-only-conversation' }} question={questionSchema.parse(record)} {...(input.withProposal ? { proposalPrerequisite: proposal, versionPrerequisites: versions, ...(input.missingFacts ? {} : { displayFacts: facts }) } : {})} />);
  },
  unmount() { root.render(null); },
  observations() { return { tokenCalls, nativeCalls }; },
};
