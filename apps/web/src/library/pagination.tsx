import { PageWindow } from '../ui/page-window.js';
import { usePageFocus } from '../ui/use-page-focus.js';
import { Button } from '../ui/controls.js';
import type { useLibrary } from './use-library.js';

export function LibraryPagination({ read }: { read: ReturnType<typeof useLibrary> }) {
  const { controls, retain, returning, activate, back } = usePageFocus({
    settled: read.kind === 'settled' && !read.loadingMore,
    terminal: read.kind === 'settled' && read.result.ok && read.result.value.nextCursor === null,
    addedIds: read.addedIds, loadMore: read.loadMore, returnToFirstPage: read.returnToFirstPage,
    focusTerminal(button, ids, returning) {
      const root = button?.closest('.wp-picker-body');
      const target = [...root?.querySelectorAll<HTMLButtonElement>('[data-page-id]') ?? []].find(node => ids.includes(node.dataset.pageId ?? ''));
      (target ?? root?.closest('.wp-dialog')?.querySelector<HTMLButtonElement>('.wp-dialog-head button'))?.focus({ preventScroll: !returning });
    },
  });
  if (read.kind !== 'settled' || !read.result.ok || (read.result.value.nextCursor === null && !retain && !read.omittedItems && !returning)) return null;
  return <div className="wp-picker-pagination" ref={controls}><PageWindow offset={read.omittedItems ?? 0} count={read.result.value.items.length} returning={returning} onReturn={back}>{(read.result.value.nextCursor !== null || retain) && <Button data-page-next variant="secondary" isDisabled={read.loadingMore || read.result.value.nextCursor === null} onPress={activate}>Load more</Button>}</PageWindow>
    {read.loadingMore ? <p role="status">Loading more Library items…</p> : read.moreError ? <p role="status">More Library items could not be loaded. The items already shown are unchanged.</p> : null}
  </div>;
}
