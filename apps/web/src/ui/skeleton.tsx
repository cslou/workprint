import { useEffect, useRef, useState } from 'react';
import './skeleton.css';

/** Show a placeholder only for reads slower than `delay`, then keep it for at least `minimum` so it never flickers. */
export function usePlaceholder(unresolved: boolean, minimum = 450, delay = 250) {
  const [shown, setShown] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (unresolved && !shown) {
      const timer = setTimeout(() => { since.current = performance.now(); setShown(true); }, delay);
      return () => clearTimeout(timer);
    }
    if (!unresolved && shown) {
      const timer = setTimeout(() => setShown(false), Math.max(0, since.current + minimum - performance.now()));
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [unresolved, shown, minimum, delay]);
  /** `active`: the placeholder owns the space (the resolved content stays hidden); `visible`: it is painted. */
  return { active: unresolved || shown, visible: shown };
}

const reserve = (visible: boolean) => visible ? '' : ' wp-skeleton-reserved';

/** Placeholder geometry for an unresolved read. Hidden from assistive technology and never focusable. */
export function SkeletonRows({ count, compact = false, visible = true }: { count: number; compact?: boolean; visible?: boolean }) {
  return <ul className={`wp-skeleton-rows${compact ? ' wp-skeleton-compact' : ''}${reserve(visible)}`} aria-hidden="true">{Array.from({ length: count }, (_, index) => <li key={index}><i className="wp-skeleton-bar" /></li>)}</ul>;
}
export function SkeletonLines({ count, visible = true }: { count: number; visible?: boolean }) {
  return <div className={`wp-skeleton-lines${reserve(visible)}`} aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} className="wp-skeleton-bar" />)}</div>;
}
