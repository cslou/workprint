import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Videos, type VideoPrerequisites } from '../videos/videos.js';

/** Workspace composition owns peer-feature assembly; Videos owns its displayed selection. Export is not offered until it exists (B-009). */
export function WorkspaceVideos({ connection, scope, workspace, videoPrerequisites, onUsed }: {
  connection: BrowserClient;
  scope: ReadScope | null;
  workspace: OperationResponse<'workspace'>;
  videoPrerequisites?: VideoPrerequisites;
  onUsed?: (result: OperationResponse<'useVersion'>, version: Version) => void;
}) {
  return <Videos connection={connection} scope={scope} workspace={workspace} {...(videoPrerequisites ? { prerequisites: videoPrerequisites } : {})} {...(onUsed ? { onUsed } : {})} />;
}
