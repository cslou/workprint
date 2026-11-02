import { createContext, useContext } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { NativeShownMedia } from '@workprint/api-client';
import { assetLabels, type OperationResponse, type Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { ViewerDialog } from '../ui/overlays.js';
import { MediaReceipt, type MediaVersion } from '../ui/media-receipt.js';
import { SingleClipViewer } from '../media/viewer.js';
import { useExactVersion } from '../versions/reads.js';
import { useNearViewport } from '../ui/use-near-viewport.js';
import './shown-images.css';

type Workspace = OperationResponse<'workspace'>;
/** What the chat needs to show saved images: the owned reads and the video's latest workspace. */
export type ChatImages = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace | null };
export const ChatImagesContext = createContext<ChatImages | null>(null);

/** The tallest a chat image is shown. */
const maxHeight = 240;

type Kind = NativeShownMedia['kind'];
/** The video's image or generated video as the workspace holds it, when it is the version in use. */
function inWorkspace(workspace: Workspace | null, id: string, kind: Kind): MediaVersion | null {
  const items = kind === 'image' ? workspace?.assets : workspace?.generatedVideos;
  const found = items?.find(item => item.version.id === id)?.version;
  return found && found.kind === kind ? found : null;
}
/**
 * Named as the assistant, Assets and Videos name it ("Image 2 · Version 1", "Video 1 · Version 1"); an earlier
 * version keeps its number. Generated videos are counted with the assets, as read-workspace counts them.
 */
const mediaName = (workspace: Workspace | null, version: MediaVersion) =>
  `${(workspace && assetLabels([...workspace.assets, ...(workspace.generatedVideos ?? [])]).get(version.artifactId)) ?? (version.kind === 'video' ? 'Video' : 'Image')} · Version ${version.revision}`;

/** The saved images and videos a done tool line shows under it; each image, or video poster, is read through the owned-image read. */
export function ShownMedia({ items }: { items: readonly NativeShownMedia[] }) {
  const context = useContext(ChatImagesContext);
  if (!context || !items.length) return null;
  return <div className="wp-shown-images">{items.map(item => <ShownItem key={item.versionId} id={item.versionId} kind={item.kind} images={context} />)}</div>;
}

function ShownItem({ id, kind, images }: { id: string; kind: Kind; images: ChatImages }) {
  // Read only once it is near view; its box holds the space until then.
  const [box, near] = useNearViewport<HTMLElement>();
  const known = inWorkspace(images.workspace, id, kind);
  // Before the workspace refreshes, the exact version is read on its own.
  const client = images.connection.kind === 'configured' && !known ? images.connection.client : null;
  const read = useExactVersion(client, images.scope, id);
  const fetched: Version | null = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  const version = known ?? (fetched?.kind === kind ? fetched : null);
  // A video shows its poster, read the same way as an image.
  const image = useOwnedImage(images.connection, near ? version : null);
  if (!version) return read.kind === 'settled' ? <Failed kind={kind} /> : <span ref={box} className="wp-shown-image" data-loading="" style={{ width: maxHeight, height: maxHeight }} />;
  if (image.phase === 'error' || image.phase === 'expired') return <Failed kind={kind} />;
  const { width, height } = version.media, label = mediaName(images.workspace, version);
  // The box holds the media's shape before it loads, so a late image never moves the thread.
  const shown = { width: Math.round(width * Math.min(1, maxHeight / height)), aspectRatio: `${width} / ${height}` };
  const picture = image.phase === 'ready' && image.url ? <img src={image.url} alt={label} width={width} height={height} onError={image.fail} /> : null;
  if (kind === 'video') return <SingleClipViewer connection={images.connection} scope={images.scope} version={version} caption={label}
    trigger={<AriaButton ref={box} className="wp-shown-image" data-kind="video" style={shown} aria-label={`Play ${label}`}>{picture}<PlayMark /></AriaButton>} />;
  return <ViewerDialog title={label} trigger={<AriaButton ref={box} className="wp-shown-image" style={shown} aria-label={`Open ${label}`}>{picture}</AriaButton>}>
    {close => <MediaReceipt connection={images.connection} version={version} close={close} />}</ViewerDialog>;
}

/** The player's play mark, small, over a video's poster. */
const PlayMark = () => <span className="wp-shown-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7Z" /></svg></span>;
const Failed = ({ kind }: { kind: Kind }) => <p className="wp-shown-image-failed">{kind === 'video' ? 'This video couldn’t be shown' : 'This image couldn’t be shown'}</p>;
