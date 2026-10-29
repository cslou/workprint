import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../ui/controls.js';
import type { useLibrary } from './use-library.js';

export function LibraryPagination({ read }: { read: ReturnType<typeof useLibrary> }) {
  const controls = useRef<HTMLDivElement>(null);
  const [retain, setRetain] = useState(false);
  useLayoutEffect(() => {
    if (!retain || read.kind !== 'settled' || read.loadingMore) return;
    const button = controls.current?.querySelector<HTMLButtonElement>('button');
    const active = document.activeElement;
    if (active === document.body || active === button) {
      if (read.result.ok && read.result.value.nextCursor === null) {
        const root = button?.closest('.wp-picker-body');
        const target = [...root?.querySelectorAll<HTMLButtonElement>('[data-page-id]') ?? []].find(node => read.addedIds.includes(node.dataset.pageId ?? ''));
        (target ?? root?.closest('.wp-dialog')?.querySelector<HTMLButtonElement>('.wp-dialog-head button'))?.focus({ preventScroll: true });
      } else button?.focus({ preventScroll: true });
    }
    setRetain(false);
  }, [read, retain]);
  if (read.kind !== 'settled' || !read.result.ok || (read.result.value.nextCursor === null && !retain)) return null;
  return <div className="wp-picker-pagination" ref={controls}><Button variant="secondary" isDisabled={read.loadingMore || read.result.value.nextCursor === null} onPress={() => { setRetain(true); void read.loadMore(); }}>Load more</Button>
    {read.loadingMore ? <p role="status">Loading more Library items…</p> : read.moreError ? <p role="status">More Library items could not be loaded. The items already shown are unchanged.</p> : null}
  </div>;
}
