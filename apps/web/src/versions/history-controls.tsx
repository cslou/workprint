import { PageWindow } from '../ui/page-window.js';
import { usePageFocus } from '../ui/use-page-focus.js';
import { Button } from '../ui/controls.js';
import type { useVersionHistory } from './reads.js';

type Read = ReturnType<typeof useVersionHistory>;
export function HistoryControls({ read, invalid = false }: { read: Read; invalid?: boolean }) {
  const { controls, retain, returning, activate, back } = usePageFocus({
    settled: read.kind === 'settled' && !read.loadingMore,
    terminal: read.kind === 'settled' && read.result.ok && read.result.value.nextCursor === null,
    addedIds: read.addedIds, loadMore: read.loadMore, returnToFirstPage: read.returnToFirstPage,
    focusTerminal(button, ids, returning) {
      const root = button?.closest('.wp-version-history');
      const target = [...root?.querySelectorAll<HTMLButtonElement>('[data-history-id]') ?? []].find(node => ids.includes(node.dataset.historyId ?? ''));
      (target ?? root?.querySelector<HTMLElement>('summary'))?.focus({ preventScroll: !returning });
    },
  });
  if (read.kind !== 'settled') return <p className="wp-version-history-feedback" role="status">Loading version history…</p>;
  if (!read.result.ok || invalid) return <div className="wp-version-pagination"><Button variant="secondary" onPress={() => void read.retry()}>Load version history</Button><p role="status">Version history could not be loaded.</p></div>;
  if (read.result.value.nextCursor === null && !retain && !read.omittedItems && !returning) return null;
  return <div className="wp-version-pagination" ref={controls}><PageWindow offset={read.omittedItems ?? 0} count={read.result.value.items.length} returning={returning} onReturn={back}>{(read.result.value.nextCursor !== null || retain) && <Button data-page-next variant="secondary" isDisabled={read.loadingMore || read.result.value.nextCursor === null} onPress={activate}>Load earlier versions</Button>}</PageWindow>
    {read.loadingMore ? <p role="status">Loading earlier versions…</p> : read.moreError ? <p role="status">Earlier versions could not be loaded. The versions already shown are unchanged.</p> : null}
  </div>;
}
