import { useEffect, useRef, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { ApiClient } from '@workprint/api-client';
import { nativeConversations } from '@workprint/api-client';
import type { Proposal, Question, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Composer } from './composer.js';
import { ProposalCard, proposalLines, type ProposalDisplayFacts } from './proposal.js';
import { useQuestionRead, useProposalRead, useInputVersions } from './review-reads.js';
import './question.css';

export type QuestionReviewProps = { connection: BrowserClient; scope: ReadScope | null; question: Question; proposalPrerequisite?: Proposal; displayFacts?: ProposalDisplayFacts; versionPrerequisites?: readonly Version[] };
export function QuestionReview(props: QuestionReviewProps) {
  return <ScopedQuestion key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId])} {...props} />;
}
function ScopedQuestion({ connection, scope, question, proposalPrerequisite, displayFacts, versionPrerequisites = [] }: QuestionReviewProps) {
  const client = connection.kind === 'configured' ? connection.client : null;
  const native: ApiClient['native'] = client?.native ?? nativeConversations;
  const observed = useQuestionRead(client, scope, question.id);
  const current = observed.kind === 'settled' && observed.result.ok && observed.result.value.id === question.id && observed.result.value.revision >= question.revision ? observed.result.value : question;
  const proposalRead = useProposalRead(client, scope, current.scope.proposalId);
  const proposal = proposalRead.kind === 'settled' && proposalRead.result.ok ? proposalRead.result.value : proposalPrerequisite;
  const versionRead = useInputVersions(client, scope, proposal?.inputs.map((input) => input.versionId) ?? []);
  const versions = versionRead.kind === 'settled' && versionRead.result.ok ? versionRead.result.value : versionPrerequisites;
  const completeProposal = proposal && displayFacts && proposal.id === current.scope.proposalId && proposal.questionId === current.id && proposalLines(proposal, displayFacts, versions) !== null;
  const binding = JSON.stringify([current.id, current.revision]);
  const [answerState, setAnswerState] = useState<{ binding: string; feedback: string | null; submitting: boolean; acknowledged: boolean }>({ binding, feedback: null, submitting: false, acknowledged: false });
  const active = useRef(false);
  const busy = useRef<string | null>(null);
  const currentBinding = useRef(binding);
  currentBinding.current = binding;
  if (answerState.binding !== binding) { busy.current = null; setAnswerState({ binding, feedback: null, submitting: false, acknowledged: false }); }
  const { feedback, submitting, acknowledged } = answerState;
  useEffect(() => { active.current = true; if (scope?.conversationId) void native.subscribe(); return () => { active.current = false; }; }, [native, scope?.conversationId]);
  const answer = async (optionId: string) => {
    if (!client || !scope?.conversationId || current.status !== 'pending' || busy.current || acknowledged || (current.scope.proposalId && !completeProposal)) return;
    busy.current = binding; setAnswerState({ binding, feedback: null, submitting: true, acknowledged: false });
    try {
      const result = await client.answerQuestion({ params: { id: current.id }, query: {}, body: { operationId: crypto.randomUUID(), questionRevision: current.revision, optionId } });
      if (!active.current || currentBinding.current !== binding) return;
      if (result.ok && result.value.question.id === current.id) { setAnswerState({ binding, feedback: null, submitting: false, acknowledged: true }); return; }
      const code = result.ok ? 'invalid_response' : result.error.code;
      setAnswerState({ binding, submitting: false, acknowledged: false, feedback: code === 'unauthenticated' ? 'Sign-in required to answer. The question stays pending.' : code === 'not_implemented' ? 'Answering is not available yet. The question stays pending.' : 'The answer was not submitted. The question stays pending.' });
    } finally { if (busy.current === binding) busy.current = null; if (active.current && currentBinding.current === binding) setAnswerState((state) => ({ ...state, submitting: false })); }
  };
  return <section className="wp-question-card" aria-label="Question" data-question-status={current.status}>
    <div className="wp-question-head"><h2>{current.prompt}</h2></div>
    {completeProposal && <ProposalCard proposal={proposal} facts={displayFacts} versions={versions} />}
    <div className="wp-question-options">{current.options.map((option, index) => <AriaButton key={option.id} className="wp-question-option" isDisabled={!client || !scope?.conversationId || current.status !== 'pending' || submitting || acknowledged || (!!current.scope.proposalId && !completeProposal)} onPress={() => void answer(option.id)}><span className="wp-question-key" aria-hidden="true">{String.fromCharCode(65 + index)}</span><span>{option.label}</span></AriaButton>)}</div>
    {feedback && <p className="wp-question-feedback" role="status">{feedback}</p>}
    <Composer native={native} docked placeholder="Pick an option, type your own answer, or ask something else…" />
  </section>;
}
