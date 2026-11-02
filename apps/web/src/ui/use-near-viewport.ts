import { useEffect, useState } from 'react';

/** The nearest scrolling ancestor, so the margin reaches past the thread's or panel's own edge. */
function scroller(node: Element): Element | null {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return parent;
  }
  return null;
}

/**
 * True once the element is within about a screen of view, and from then on. A hidden panel (display: none)
 * is never in view, so what it holds waits until it opens.
 */
export function useNearViewport<T extends Element>(): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null), [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !node) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { root: scroller(node), rootMargin: '100% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, near]);
  return [setNode, near];
}
