import { useEffect, useRef, useState } from 'react';
import { useBindingSchema } from '@workprint/contracts';
import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import './review.css';

type Binding = OperationResponse<'useVersion'>['use']['binding'];
type Use = OperationResponse<'useVersion'>['use'];
export type VersionUseProps = { connection: BrowserClient; scope: ReadScope | null; version: Version; binding: Binding; currentUse: Use | null; selectionRevision: number; onUsed?: (result: OperationResponse<'useVersion'>) => void };
const feedbackFor = (code: string) => code === 'unauthenticated' ? 'Sign-in required to use this version. The current selection is unchanged.' : code === 'not_implemented' ? 'Using this version is not available yet. The current selection is unchanged.' : 'This version was not selected. The current selection is unchanged.';
export function VersionUse(props: VersionUseProps) {
  return <BoundUse key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId, props.version.id, props.binding])} {...props} />;
}
function BoundUse({ connection, scope, version, binding, currentUse, selectionRevision, onUsed }: VersionUseProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  const authority = JSON.stringify([currentUse, selectionRevision]);
  const latest = useRef({ authority, revision: selectionRevision }); latest.current = { authority, revision: selectionRevision };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const use = async () => {
    if (connection.kind !== 'configured' || !scope?.conversationId || busy.current) return;
    busy.current = true; setPending(true); setFeedback(null);
    try {
      const result = await connection.client.useVersion({ params: { id: scope.conversationId }, query: {}, body: { ...binding, operationId: crypto.randomUUID(), versionId: version.id } });
      if (!active.current || (latest.current.authority !== authority && (!result.ok || result.value.selectionRevision <= latest.current.revision))) return;
      if (!result.ok) { setFeedback(feedbackFor(result.error.code)); return; }
      const value = result.value;
      if (value.use.versionId !== version.id || value.use.state !== 'approved' || value.selectionRevision < selectionRevision || JSON.stringify(useBindingSchema.parse(value.use.binding)) !== JSON.stringify(useBindingSchema.parse(binding))) { setFeedback(feedbackFor('invalid_response')); return; }
      onUsed?.(value);
    } catch { if (active.current && latest.current.authority === authority) setFeedback(feedbackFor('transport_failure')); }
    finally { busy.current = false; if (active.current) setPending(false); }
  };
  return <div className="wp-version-use" data-current-version-id={currentUse?.versionId ?? ''}><Button variant="secondary" isDisabled={pending || connection.kind !== 'configured' || !scope?.conversationId} onPress={() => void use()}>Use this version</Button>{feedback && <p className="wp-version-use-feedback" role="status">{feedback}</p>}</div>;
}
