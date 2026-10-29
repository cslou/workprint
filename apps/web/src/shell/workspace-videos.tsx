import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Exports, type ExportPrerequisites } from '../exports/exports.js';
import { Videos, type VideoPrerequisites } from '../videos/videos.js';

/** Workspace composition owns peer-feature assembly; Videos owns its displayed selection. */
export function WorkspaceVideos({ connection, scope, workspace, videoPrerequisites, exportPrerequisites }: {
  connection: BrowserClient;
  scope: ReadScope | null;
  workspace: OperationResponse<'workspace'>;
  videoPrerequisites?: VideoPrerequisites;
  exportPrerequisites?: ExportPrerequisites;
}) {
  return <Videos connection={connection} scope={scope} workspace={workspace} {...(videoPrerequisites ? { prerequisites: videoPrerequisites } : {})} renderActions={snapshot => <Exports connection={connection} scope={scope} {...snapshot} {...(exportPrerequisites ? { prerequisites: exportPrerequisites } : {})} />} />;
}
