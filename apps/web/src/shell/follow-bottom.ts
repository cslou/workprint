import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** About one line of text: a reader this close to the end is still reading the newest text. */
export const followThreshold = 32;

/** Whether a scroller shows its last line, within `followThreshold`. */
export const atBottom = ({ scrollTop, scrollHeight, clientHeight }: { scrollTop: number; scrollHeight: number; clientHeight: number }) =>
  scrollHeight - scrollTop - clientHeight <= followThreshold;

/**
 * Keeps `scroller` at its newest content while the reader is at the bottom. Scrolling up stops
 * following and returning to the bottom resumes it; a change of `follow` (a new send, another
 * conversation) resumes it too. Returns `unfollow`, for actions that add content above the reader.
 */
export function useFollowBottom(scroller: RefObject<HTMLElement | null>, follow: unknown): () => void {
  const following = useRef(true);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const onScroll = () => { following.current = atBottom(element); };
    // Runs right after each DOM change, before the next frame's scroll event can see the new height.
    const observer = new MutationObserver(() => { if (following.current) element.scrollTop = element.scrollHeight; });
    element.addEventListener('scroll', onScroll, { passive: true });
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); element.removeEventListener('scroll', onScroll); };
  }, [scroller]);
  useEffect(() => {
    following.current = true;
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [scroller, follow]);
  return useCallback(() => { following.current = false; }, []);
}
