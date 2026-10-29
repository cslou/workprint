import type { ComponentProps } from 'react';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { WorkspacePanel } from '../ui/panel.js';
import { Script } from './script.js';
import { Assets } from './assets.js';
import type { MaterialPrerequisites } from './presentation.js';

type Props = Omit<ComponentProps<typeof WorkspacePanel>, 'content'> & { connection: BrowserClient; scope: ReadScope | null; workspace: OperationResponse<'workspace'> | null; prerequisites?: MaterialPrerequisites; additionalContent?: ComponentProps<typeof WorkspacePanel>['content']; contentOverride?: ComponentProps<typeof WorkspacePanel>['content'] };
export function MaterialPanel(props: Props) {
  return <ScopedPanel key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId])} {...props} />;
}
function ScopedPanel({ connection, scope, workspace, prerequisites, additionalContent, contentOverride, ...tabs }: Props) {
  const common = { connection, scope, ...(prerequisites ? { prerequisites } : {}) };
  const content = contentOverride ?? (workspace ? { script: <Script {...common} workspace={workspace} />, assets: <Assets {...common} workspace={workspace} />, ...additionalContent } : undefined);
  return <WorkspacePanel {...tabs} preservePanels={!!workspace && (!!workspace.script || workspace.assets.length > 0 || workspace.storyboard.shots.length > 0)} {...(content ? { content } : {})} />;
}
