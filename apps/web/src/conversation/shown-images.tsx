import { createContext, useContext } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { assetLabels, type OperationResponse, type Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { ViewerDialog } from '../ui/overlays.js';
import { MediaReceipt, type MediaVersion } from '../ui/media-receipt.js';
import { useExactVersion } from '../versions/reads.js';
import { useNearViewport } from '../ui/use-near-viewport.js';
import './shown-images.css';

type Workspace = OperationResponse<'workspace'>;
/** What the chat needs to show saved images: the owned reads and the video's latest workspace. */
export type ChatImages = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace | null };
export const ChatImagesContext = createContext<ChatImages | null>(null);

/** The tallest a chat image is shown. */
const maxHeight = 240;

/** The video's image as the workspace holds it, when it is the version in use. */
function inWorkspace(workspace: Workspace | null, id: string): MediaVersion | null {
  const asset = workspace?.assets.find(item => item.version.id === id);
  return asset && asset.version.kind === 'image' ? asset.version : null;
}
/** Named as the assistant and Assets name it ("Image 2 · Version 1"); an earlier version keeps its image's number. */
const imageName = (workspace: Workspace | null, version: MediaVersion) =>
  `${(workspace && assetLabels(workspace.assets).get(version.artifactId)) ?? 'Image'} · Version ${version.revision}`;

/** The saved images a done tool line shows under it, read through the owned-image read. */
export function ShownImages({ ids }: { ids: readonly string[] }) {
  const context = useContext(ChatImagesContext);
  if (!context || !ids.length) return null;
  return <div className="wp-shown-images">{ids.map(id => <ShownImage key={id} id={id} images={context} />)}</div>;
}

function ShownImage({ id, images }: { id: string; images: ChatImages }) {
  // Read only once it is near view; its box holds the space until then.
  const [box, near] = useNearViewport<HTMLElement>();
  const known = inWorkspace(images.workspace, id);
  // Before the workspace refreshes, the exact version is read on its own.
  const client = images.connection.kind === 'configured' && !known ? images.connection.client : null;
  const read = useExactVersion(client, images.scope, id);
  const fetched: Version | null = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  const version = known ?? (fetched?.kind === 'image' ? fetched : null);
  const image = useOwnedImage(images.connection, near ? version : null);
  if (!version) return read.kind === 'settled' ? <Failed /> : <span ref={box} className="wp-shown-image" data-loading="" style={{ width: maxHeight, height: maxHeight }} />;
  if (image.phase === 'error' || image.phase === 'expired') return <Failed />;
  const { width, height } = version.media, label = imageName(images.workspace, version);
  // The box holds the image's shape before it loads, so a late image never moves the thread.
  const shown = { width: Math.round(width * Math.min(1, maxHeight / height)), aspectRatio: `${width} / ${height}` };
  return <ViewerDialog title={label} trigger={<AriaButton ref={box} className="wp-shown-image" style={shown} aria-label={`Open ${label}`}>
    {image.phase === 'ready' && image.url ? <img src={image.url} alt={label} width={width} height={height} onError={image.fail} /> : null}
  </AriaButton>}>{close => <MediaReceipt connection={images.connection} version={version} close={close} />}</ViewerDialog>;
}

const Failed = () => <p className="wp-shown-image-failed">This image couldn’t be shown</p>;
