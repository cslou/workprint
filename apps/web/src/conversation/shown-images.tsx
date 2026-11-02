import { createContext, useContext } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { NativeShownMedia } from '@workprint/api-client';
import { mediaVersionName, sheetViews, workspaceMediaLabels, type OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { ViewerDialog } from '../ui/overlays.js';
import { MediaReceipt, type MediaVersion } from '../ui/media-receipt.js';
import { PlayMark, SingleClipViewer } from '../media/viewer.js';
import { useSavedMedia } from '../versions/use-saved-media.js';
import { useNearViewport } from '../ui/use-near-viewport.js';
import './shown-images.css';

type Workspace = OperationResponse<'workspace'>;
/** What the chat needs to show saved images: the owned reads and the video's latest workspace. */
export type ChatImages = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace | null };
export const ChatImagesContext = createContext<ChatImages | null>(null);

/** The tallest a chat image is shown. */
const maxHeight = 240;

type Kind = NativeShownMedia['kind'];
/**
 * Named as the assistant, Assets and Videos name it ("Image 2 · Version 1", "Video 1 · Version 1"), or by subject
 * and view in a sheet ("Mara · Face close-up"); an earlier version keeps its number.
 */
const mediaName = (workspace: Workspace | null, version: MediaVersion) => workspace ? mediaVersionName(workspaceMediaLabels(workspace), version, sheetViews(workspace)) : mediaVersionName(new Map(), version);

/** The saved images and videos a done tool line shows under it; each image, or video poster, is read through the owned-image read. */
export function ShownMedia({ items }: { items: readonly NativeShownMedia[] }) {
  const context = useContext(ChatImagesContext);
  if (!context || !items.length) return null;
  return <div className="wp-shown-images">{items.map(item => <ShownItem key={item.versionId} id={item.versionId} kind={item.kind} images={context} />)}</div>;
}

function ShownItem({ id, kind, images }: { id: string; kind: Kind; images: ChatImages }) {
  // Read only once it is near view; its box holds the space until then.
  const [box, near] = useNearViewport<HTMLElement>();
  const { version, settled } = useSavedMedia(images.connection, images.scope, images.workspace, id, kind);
  // A video shows its poster, read the same way as an image.
  const image = useOwnedImage(images.connection, near ? version : null);
  if (!version) return settled ? <Failed kind={kind} /> : <span ref={box} className="wp-shown-image" data-loading="" style={{ width: maxHeight, height: maxHeight }} />;
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

const Failed = ({ kind }: { kind: Kind }) => <p className="wp-shown-image-failed">{kind === 'video' ? 'This video couldn’t be shown' : 'This image couldn’t be shown'}</p>;
