import { Button as AriaButton } from 'react-aria-components';
import { mediaVersionName, workspaceMediaLabels, type OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { formatClipTime, PlayMark, SingleClipViewer } from '../media/viewer.js';
import { PanelSection } from '../ui/panel.js';
import { useNearViewport } from '../ui/use-near-viewport.js';

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
  // The poster is read only once it is near view, through the copy the chat shares.
  const [box, near] = useNearViewport<HTMLElement>();
  const { version } = clip;
  const poster = useOwnedImage(connection, near ? version : null);
  const failed = poster.phase === 'error' || poster.phase === 'expired';
  const duration = version.kind === 'video' && version.media.durationMs !== undefined ? formatClipTime(version.media.durationMs) : null;
  return <div className="wp-video-row" data-version-id={version.id}>
    <div className="wp-video-head"><b className="wp-video-title">{label}</b></div>
    <SingleClipViewer connection={connection} scope={scope} version={version} caption={label}
      trigger={<AriaButton ref={box} className="wp-video-thumbnail wp-video-poster" aria-label={`Play ${label}`}>
        {poster.phase === 'ready' && poster.url ? <img src={poster.url} alt="" onError={poster.fail} /> : null}<PlayMark />
      </AriaButton>} />
    {/* A poster that can't be read leaves the clip playable; the row says so instead of looking still loading. */}
    {duration || failed ? <span className="wp-video-metadata">{[duration, failed ? 'The poster couldn’t be shown' : null].filter(Boolean).join(' · ')}</span> : null}
  </div>;
}
