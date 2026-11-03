import { mediaVersionName, workspaceMediaLabels, type OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { PanelSection } from '../ui/panel.js';
import { VideoPoster } from './video-poster.js';

type Workspace = OperationResponse<'workspace'>;
type Clip = NonNullable<Workspace['generatedVideos']>[number];
type Props = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace };

/**
 * Every clip the assistant made for this video, named as the chat and the assistant name it ("Video 1 · Version 1").
 * Each plays in the single-clip viewer; seeing or playing one never uses or chooses it, so a row has no status.
 */
export function GeneratedVideos({ connection, scope, workspace }: Props) {
  const clips = workspace.generatedVideos ?? [];
  if (!clips.length) return null;
  const labels = workspaceMediaLabels(workspace);
  return <PanelSection title="Generated videos">
    {clips.map(clip => <GeneratedVideo key={clip.version.id} connection={connection} scope={scope} clip={clip} label={mediaVersionName(labels, clip.version)} />)}
  </PanelSection>;
}

function GeneratedVideo({ connection, scope, clip, label }: { connection: BrowserClient; scope: ReadScope | null; clip: Clip; label: string }) {
  const { version } = clip;
  return <div className="wp-video-row" data-version-id={version.id}>
    <div className="wp-video-head"><b className="wp-video-title">{label}</b></div>
    <VideoPoster viewer={{ connection, scope, version, caption: label }} label={`Play ${label}`} />
  </div>;
}
