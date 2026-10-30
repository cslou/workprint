import { Component } from 'react';
import type { ReactNode, RefObject } from 'react';

type Props = { rows: readonly { id: string }[]; loading: boolean; scroller: RefObject<HTMLDivElement | null>; children: ReactNode };
type Snapshot = { element: HTMLDivElement; top: number; height: number; width: number; viewportHeight: number; document: { top: number; height: number } | null };

/** Snapshot at the DOM commit boundary, not when the asynchronous read starts. */
export class HistoryScroll extends Component<Props, Record<string, never>, Snapshot | null> {
  private pending: Snapshot | null = null;
  private observed: HTMLDivElement | null = null;
  private invalidate = () => { this.pending = null; };
  private watchScroller(element: HTMLDivElement | null) {
    if (element === this.observed) return;
    this.observed?.removeEventListener('scroll', this.invalidate);
    this.observed = element;
    this.observed?.addEventListener('scroll', this.invalidate, { passive: true });
  }
  override componentDidMount() {
    this.watchScroller(this.props.scroller.current);
    window.addEventListener('scroll', this.invalidate, { passive: true });
    window.addEventListener('resize', this.invalidate, { passive: true });
  }
  override componentWillUnmount() {
    this.watchScroller(null);
    window.removeEventListener('scroll', this.invalidate);
    window.removeEventListener('resize', this.invalidate);
    this.pending = null;
  }
  override getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
    const { rows, scroller } = this.props, offset = rows.length - previous.rows.length;
    const element = scroller.current;
    if (!element) return null;
    const live = { element, top: element.scrollTop, height: element.scrollHeight, width: innerWidth, viewportHeight: innerHeight, document: innerWidth <= 820 ? { top: scrollY, height: document.documentElement.scrollHeight } : null };
    if (this.props.loading && !previous.loading) this.pending = live;
    if (!previous.rows.length || offset <= 0 || !previous.rows.every((row, index) => rows[index + offset]?.id === row.id)) return null;
    // Only an uninterrupted viewport may reuse the loading-control baseline.
    // Scroll/resize events discard it even if the viewport returns to these coordinates.
    const pending = this.pending;
    if (pending && live.top === pending.top && live.document?.top === pending.document?.top && live.width === pending.width && live.viewportHeight === pending.viewportHeight) {
      live.height = pending.height;
      if (live.document && pending.document) live.document.height = pending.document.height;
    }
    return live;
  }
  override componentDidUpdate(_previous: Props, _state: Record<string, never>, snapshot: Snapshot | null) {
    this.watchScroller(this.props.scroller.current);
    if (!this.props.loading) this.pending = null;
    if (!snapshot) return;
    snapshot.element.scrollTop = snapshot.top + snapshot.element.scrollHeight - snapshot.height;
    if (snapshot.document) window.scrollTo(0, snapshot.document.top + document.documentElement.scrollHeight - snapshot.document.height);
  }
  override render() { return this.props.children; }
}
