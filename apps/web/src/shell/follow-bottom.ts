import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** About one line of text: a reader this close to the end is still reading the newest text. */
export const followThreshold = 32;

type Viewport = { scrollTop: number; scrollHeight: number; clientHeight: number };
/** Whether a scroller shows its last line, within `followThreshold`. */
export const atBottom = ({ scrollTop, scrollHeight, clientHeight }: Viewport) => scrollHeight - scrollTop - clientHeight <= followThreshold;

/**
 * Whether to keep following after a scroll from `lastTop`. Any upward movement short of the very end
 * is the reader leaving, even within the threshold; arriving near the end, moving down, resumes.
 */
export const followsAfterScroll = (viewport: Viewport, lastTop: number, following: boolean) => {
  if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 1) return true;
  if (viewport.scrollTop < lastTop) return false;
  return following || (viewport.scrollTop > lastTop && atBottom(viewport));
};

const upKeys = new Set(['ArrowUp', 'PageUp', 'Home']);

/**
 * Keeps `scroller` at its newest content while the reader is at the end. Scrolling up stops
 * following and returning to the end resumes it; a change of `follow` (a send, another
 * conversation, or a reset of this page's turns) resumes it too. Returns `unfollow`, for actions
 * that add content above the reader.
 */
export function useFollowBottom(scroller: RefObject<HTMLElement | null>, follow: unknown): () => void {
  const following = useRef(true), lastTop = useRef(0);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const pin = () => { if (following.current) { element.scrollTop = element.scrollHeight; lastTop.current = element.scrollTop; } };
    const onScroll = () => { following.current = followsAfterScroll(element, lastTop.current, following.current); lastTop.current = element.scrollTop; };
    // Input arrives before its scroll event, so newly streamed text can't pull the reader back first.
    // A thread already at its top can't move, so no scroll event would ever resume following.
    const leave = () => { if (element.scrollTop > 0) following.current = false; };
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) leave(); };
    const onKey = (event: KeyboardEvent) => { if (upKeys.has(event.key)) leave(); };
    // Mutations run right after each DOM change, before the next frame's scroll event; resizes catch a shorter thread.
    const mutations = new MutationObserver(pin), resizes = new ResizeObserver(pin);
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('wheel', onWheel, { passive: true });
    element.addEventListener('keydown', onKey);
    mutations.observe(element, { childList: true, subtree: true, characterData: true });
    resizes.observe(element);
    return () => {
      mutations.disconnect(); resizes.disconnect();
      element.removeEventListener('scroll', onScroll); element.removeEventListener('wheel', onWheel); element.removeEventListener('keydown', onKey);
    };
  }, [scroller]);
  // Before paint, so a send from higher up never shows a frame at the old place.
  useLayoutEffect(() => {
    following.current = true;
    const element = scroller.current;
    if (element) { element.scrollTop = element.scrollHeight; lastTop.current = element.scrollTop; }
  }, [scroller, follow]);
  return useCallback(() => { following.current = false; }, []);
}
