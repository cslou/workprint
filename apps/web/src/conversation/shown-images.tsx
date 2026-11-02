import { createContext, useContext } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { ViewerDialog } from '../ui/overlays.js';
import { MediaReceipt, type MediaVersion } from '../ui/media-receipt.js';
import { useExactVersion } from '../versions/reads.js';
import './shown-images.css';

type Workspace = OperationResponse<'workspace'>;
/** What the chat needs to show saved images: the owned reads and the video's latest workspace. */
export type ChatImages = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace | null };
export const ChatImagesContext = createContext<ChatImages | null>(null);

/** The tallest a chat image is shown. */
const maxHeight = 240;

/** The video's image named as the assistant names it ("Image 2 · Version 1"), with its use state. */
function inWorkspace(workspace: Workspace | null, id: string): { version: MediaVersion; label: string; state: 'Ready' | 'Draft' } | null {
  const images = workspace?.assets.filter(asset => asset.version.kind === 'image') ?? [];
  const index = images.findIndex(asset => asset.version.id === id);
  const asset = images[index];
  if (!asset || asset.version.kind !== 'image') return null;
  return { version: asset.version, label: `Image ${index + 1} · Version ${asset.version.revision}`, state: asset.state };
}

/** The saved images a done tool line shows under it, read through the owned-image read. */
export function ShownImages({ ids }: { ids: readonly string[] }) {
  const context = useContext(ChatImagesContext);
  if (!context || !ids.length) return null;
  return <div className="wp-shown-images">{ids.map(id => <ShownImage key={id} id={id} images={context} />)}</div>;
}

function ShownImage({ id, images }: { id: string; images: ChatImages }) {
  const known = inWorkspace(images.workspace, id);
  // Before the workspace refreshes, the exact version is read on its own.
  const client = images.connection.kind === 'configured' && !known ? images.connection.client : null;
  const read = useExactVersion(client, images.scope, id);
  const fetched: Version | null = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  const version = known?.version ?? (fetched?.kind === 'image' ? fetched : null);
  const image = useOwnedImage(images.connection, version);
  if (!version) return read.kind === 'settled' ? <Failed /> : <span className="wp-shown-image" data-loading="" style={{ width: maxHeight, height: maxHeight }} />;
  if (image.phase === 'error' || image.phase === 'expired') return <Failed />;
  const { width, height } = version.media, label = known?.label ?? `Image · Version ${version.revision}`;
  // The box holds the image's shape before it loads, so a late image never moves the thread.
  const shown = { width: Math.round(width * Math.min(1, maxHeight / height)), aspectRatio: `${width} / ${height}` };
  return <ViewerDialog title={label} trigger={<AriaButton className="wp-shown-image" style={shown} aria-label={`Open ${label}`}>
    {image.phase === 'ready' && image.url ? <img src={image.url} alt={label} width={width} height={height} onError={image.fail} /> : null}
  </AriaButton>}>{close => <MediaReceipt connection={images.connection} version={version} state={known?.state ?? 'Draft'} close={close} />}</ViewerDialog>;
}

const Failed = () => <p className="wp-shown-image-failed">This image couldn’t be shown</p>;
