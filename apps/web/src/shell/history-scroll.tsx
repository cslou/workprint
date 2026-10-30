import { Component } from 'react';
import type { ReactNode, RefObject } from 'react';

type Props = { rows: readonly { id: string }[]; loading: boolean; scroller: RefObject<HTMLDivElement | null>; children: ReactNode };
type Snapshot = { element: HTMLDivElement; top: number; height: number; width: number; viewportHeight: number; document: { top: number; height: number } | null };

/** Snapshot at the DOM commit boundary, not when the asynchronous read starts. */
export class HistoryScroll extends Component<Props, Record<string, never>, Snapshot | null> {
  private pending: Snapshot | null = null;
  override getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
    const { rows, scroller } = this.props, offset = rows.length - previous.rows.length;
    const element = scroller.current;
    if (!element) return null;
    const live = { element, top: element.scrollTop, height: element.scrollHeight, width: innerWidth, viewportHeight: innerHeight, document: innerWidth <= 820 ? { top: scrollY, height: document.documentElement.scrollHeight } : null };
    if (this.props.loading && !previous.loading) this.pending = live;
    if (!previous.rows.length || offset <= 0 || !previous.rows.every((row, index) => rows[index + offset]?.id === row.id)) return null;
    // Include the loading-control height change only while the viewport is unchanged.
    // A user-scrolled or resized viewport always uses its live precommit geometry.
    const pending = this.pending;
    if (pending && live.top === pending.top && live.document?.top === pending.document?.top && live.width === pending.width && live.viewportHeight === pending.viewportHeight) {
      live.height = pending.height;
      if (live.document && pending.document) live.document.height = pending.document.height;
    }
    return live;
  }
  override componentDidUpdate(_previous: Props, _state: Record<string, never>, snapshot: Snapshot | null) {
    if (!this.props.loading) this.pending = null;
    if (!snapshot) return;
    snapshot.element.scrollTop = snapshot.top + snapshot.element.scrollHeight - snapshot.height;
    if (snapshot.document) window.scrollTo(0, snapshot.document.top + document.documentElement.scrollHeight - snapshot.document.height);
  }
  override render() { return this.props.children; }
}
