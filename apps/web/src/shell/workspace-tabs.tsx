import type { ComponentProps, ReactNode } from 'react';
import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { WorkspacePanel, type WorkspaceTab } from '../ui/panel.js';
import { Script } from '../materials/script.js';
import { Assets } from '../materials/assets.js';
import type { MaterialPrerequisites } from '../materials/presentation.js';
import { Storyboard } from '../storyboard/storyboard.js';
import type { StoryboardPrerequisites } from '../storyboard/presentation.js';
import type { VideoPrerequisites } from '../videos/videos.js';
import { WorkspaceVideos } from './workspace-videos.js';

type Workspace = OperationResponse<'workspace'>;
type Props = Omit<ComponentProps<typeof WorkspacePanel>, 'content' | 'preservePanels'> & {
  connection: BrowserClient; scope: ReadScope | null; workspace: Workspace | null;
  onSaved: (result: OperationResponse<'saveVersion'>) => void | boolean;
  onUsed: (result: OperationResponse<'useVersion'>, version: Version) => void;
  materialPrerequisites?: MaterialPrerequisites; storyboardPrerequisites?: StoryboardPrerequisites; videoPrerequisites?: VideoPrerequisites;
  /** Replaces every tab's content, for presentation-only shells. */
  contentOverride?: Partial<Record<WorkspaceTab, ReactNode>>;
};

/** The video's workspace tabs: the shell assembles each feature's content and decides which panels stay mounted. */
export function WorkspaceTabs(props: Props) {
  // A different account or video gets fresh tab state; same-video workspace changes keep it.
  return <ScopedTabs key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId])} {...props} />;
}
function ScopedTabs({ connection, scope, workspace, onSaved, onUsed, materialPrerequisites, storyboardPrerequisites, videoPrerequisites, contentOverride, ...tabs }: Props) {
  const common = { connection, scope, onSaved, ...(materialPrerequisites ? { prerequisites: materialPrerequisites } : {}) };
  const content = contentOverride ?? (workspace ? {
    script: <Script {...common} workspace={workspace} />,
    assets: <Assets {...common} workspace={workspace} />,
    storyboard: <Storyboard connection={connection} scope={scope} workspace={workspace} onSaved={onSaved} onUsed={onUsed} {...(storyboardPrerequisites ? { prerequisites: storyboardPrerequisites } : {})} />,
    videos: <WorkspaceVideos connection={connection} scope={scope} workspace={workspace} onUsed={onUsed} {...(videoPrerequisites ? { videoPrerequisites } : {})} />,
  } : undefined);
  // Keep panels mounted once the video has saved work, so switching tabs never drops an open edit.
  return <WorkspacePanel {...tabs} preservePanels={!!workspace && (!!workspace.script || workspace.assets.length > 0 || workspace.storyboard.shots.length > 0)} {...(content ? { content } : {})} />;
}
