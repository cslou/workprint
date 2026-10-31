import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createExactVersionUse, type ExactVersionUse } from '@workprint/api-client';
import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import './review.css';

const subscribeIdle = () => () => {};
const getIdle = () => null;
type Binding = OperationResponse<'useVersion'>['use']['binding'];
type Use = OperationResponse<'useVersion'>['use'];
export type VersionUseProps = { connection: BrowserClient; scope: ReadScope | null; version: Version; binding: Binding; currentUse: Use | null; selectionRevision: number; selectedVersionId?: string | null; presentation?: 'history' | 'viewer'; onUsed?: (result: OperationResponse<'useVersion'>) => void };
const feedbackFor = (code: string) => code === 'unauthenticated' ? 'Sign-in required to use this version. The current selection is unchanged.' : code === 'not_implemented' ? 'Using this version is not available yet. The current selection is unchanged.' : 'This version was not selected. The current selection is unchanged.';
export function VersionUse(props: VersionUseProps) {
  return <BoundUse key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId, props.version.id, props.binding])} {...props} />;
}
function BoundUse({ connection, scope, version, binding, currentUse, selectionRevision, selectedVersionId, presentation = 'history', onUsed }: VersionUseProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [command, setCommand] = useState<ExactVersionUse | null>(null);
  const state = useSyncExternalStore(command?.subscribe ?? subscribeIdle, command?.getSnapshot ?? getIdle);
  const pending = state?.phase === 'pending', unknown = state?.phase === 'unknown';
  const busy = useRef(false);
  const active = useRef(true);
  const authority = JSON.stringify([currentUse, selectionRevision, selectedVersionId]);
  const latest = useRef({ authority, revision: selectionRevision }); latest.current = { authority, revision: selectionRevision };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => () => command?.dispose(), [command]);
  const use = async () => {
    if (connection.kind !== 'configured' || !scope?.conversationId || busy.current) return;
    busy.current = true; setFeedback(null);
    const next = command && ['unknown', 'rejected'].includes(command.getSnapshot().phase) ? command : createExactVersionUse({ client: connection.client, command: { params: { id: scope.conversationId }, query: {}, body: { ...binding, operationId: crypto.randomUUID(), versionId: version.id } }, minimumSelectionRevision: selectionRevision });
    setCommand(next);
    try {
      const result = await (next.getSnapshot().phase === 'unknown' ? next.retry() : next.submit());
      if (!active.current || (latest.current.authority !== authority && (!result || result.selectionRevision <= latest.current.revision))) return;
      if (!result) { if (next.getSnapshot().phase === 'rejected') setFeedback(feedbackFor(next.getSnapshot().failure ?? 'invalid_input')); return; }
      setFeedback('This exact version is now used in this conversation.'); onUsed?.(result);
    } finally { busy.current = false; }
  };
  return <div className={`wp-version-use${presentation === 'viewer' ? ' wp-version-use-viewer' : ''}`} data-current-version-id={currentUse?.versionId ?? selectedVersionId ?? ''}><Button variant={presentation === 'viewer' ? 'primary' : 'secondary'} size={presentation === 'viewer' ? 'choose' : 'send'} isDisabled={pending || connection.kind !== 'configured' || !scope?.conversationId} onPress={() => void use()}>{unknown ? 'Retry use' : 'Use this version'}</Button>{(unknown || feedback) && <p className="wp-version-use-feedback" role="status">{unknown ? 'This use could not be confirmed. Retry checks the same exact version and role. Closing does not undo a completed use.' : feedback}</p>}</div>;
}
