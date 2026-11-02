import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import type { MediaVersion } from '../ui/media-receipt.js';
import { useExactVersion } from './reads.js';

type Workspace = OperationResponse<'workspace'>;
type Kind = MediaVersion['kind'];

/** The video's image or generated video as the workspace holds it, when it is the version in use. */
function inWorkspace(workspace: Workspace | null, id: string, kind: Kind): MediaVersion | null {
  const items = kind === 'image' ? workspace?.assets : workspace?.generatedVideos;
  const found = items?.find(item => item.version.id === id)?.version;
  return found && found.kind === kind ? found : null;
}

/**
 * One saved image or video by exact version id: from the workspace when the video uses it, else read on its own
 * (before the workspace refreshes, or a sheet's view whose own use has moved on). `settled` with no version means
 * it couldn't be read as that kind. With `enabled` false nothing is read yet, as for a row not near view.
 */
export function useSavedMedia(connection: BrowserClient, scope: ReadScope | null, workspace: Workspace | null, id: string, kind: Kind, enabled = true): { version: MediaVersion | null; settled: boolean } {
  const known = inWorkspace(workspace, id, kind);
  const client = connection.kind === 'configured' && !known && enabled ? connection.client : null;
  const read = useExactVersion(client, scope, id);
  const fetched: Version | null = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  return { version: known ?? (fetched?.kind === kind ? fetched : null), settled: read.kind === 'settled' };
}
