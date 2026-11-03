import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useOwnedImage } from '../api/use-owned-image.js';
import { formatClipTime, PlayMark, SingleClipViewer, type SingleClipViewerProps } from '../media/viewer.js';
import { useNearViewport } from '../ui/use-near-viewport.js';

type ViewerProps = SingleClipViewerProps extends infer P ? P extends unknown ? Omit<P, 'trigger'> : never : never;

/**
 * A clip's poster as the button that opens it in the single-clip viewer, then a 12px line: `lead`, the clip's length,
 * and "The poster couldn’t be shown" when the poster can't be read (the clip still plays). The poster is read once near
 * view through the shared owned-image copy; a display composition's supplied `image` stands in for it.
 */
export function VideoPoster({ viewer, label, lead, image }: { viewer: ViewerProps; label: string; lead?: string; image?: { src: string } }) {
  const [box, near] = useNearViewport<HTMLElement>();
  const { version } = viewer;
  const poster = useOwnedImage(viewer.connection, near && !image ? version : null);
  const [suppliedFailed, setSuppliedFailed] = useState(false);
  const failed = image ? suppliedFailed : poster.phase === 'error' || poster.phase === 'expired';
  const src = failed ? undefined : image?.src ?? (poster.phase === 'ready' ? poster.url : undefined);
  const length = version.kind === 'video' && version.media.durationMs !== undefined ? formatClipTime(version.media.durationMs) : null;
  const line = [lead, length, failed ? 'The poster couldn’t be shown' : null].filter(Boolean);
  return <>
    <SingleClipViewer {...viewer} trigger={<AriaButton ref={box} className="wp-video-thumbnail wp-video-poster" aria-label={label}>{src ? <img src={src} alt="" onError={image ? () => setSuppliedFailed(true) : poster.fail} /> : null}<PlayMark /></AriaButton>} />
    {line.length ? <span className="wp-video-metadata">{line.join(' · ')}</span> : null}
  </>;
}
