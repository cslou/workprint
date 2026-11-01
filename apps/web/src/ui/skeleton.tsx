import './skeleton.css';

/** Placeholder geometry for an unresolved read. Hidden from assistive technology and never focusable. */
export function SkeletonRows({ count, compact = false }: { count: number; compact?: boolean }) {
  return <ul className={`wp-skeleton-rows${compact ? ' wp-skeleton-compact' : ''}`} aria-hidden="true">{Array.from({ length: count }, (_, index) => <li key={index}><i className="wp-skeleton-bar" /></li>)}</ul>;
}
export function SkeletonLines({ count }: { count: number }) {
  return <div className="wp-skeleton-lines" aria-hidden="true">{Array.from({ length: count }, (_, index) => <i key={index} className="wp-skeleton-bar" />)}</div>;
}
