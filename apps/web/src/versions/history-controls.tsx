import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../ui/controls.js';
import type { useVersionHistory } from './reads.js';

type Read = ReturnType<typeof useVersionHistory>;
export function HistoryControls({ read, invalid = false }: { read: Read; invalid?: boolean }) {
  const controls = useRef<HTMLDivElement>(null);
  const [retain, setRetain] = useState(false);
  useLayoutEffect(() => {
    if (!retain || read.kind !== 'settled' || read.loadingMore) return;
    const button = controls.current?.querySelector<HTMLButtonElement>('button');
    const active = document.activeElement;
    if (active === document.body || active === button) {
      if (read.result.ok && read.result.value.nextCursor === null) {
        const root = button?.closest('.wp-version-history');
        const target = [...root?.querySelectorAll<HTMLButtonElement>('[data-history-id]') ?? []].find(node => node.dataset.historyId === read.addedIds[0]);
        (target ?? root?.querySelector<HTMLElement>('summary'))?.focus({ preventScroll: true });
      } else button?.focus({ preventScroll: true });
    }
    setRetain(false);
  }, [read, retain]);
  if (read.kind !== 'settled') return <p className="wp-version-history-feedback" role="status">Loading version history…</p>;
  if (!read.result.ok || invalid) return <div className="wp-version-pagination"><Button variant="secondary" onPress={() => void read.retry()}>Load version history</Button><p role="status">Version history could not be loaded.</p></div>;
  if (read.result.value.nextCursor === null && !retain) return null;
  return <div className="wp-version-pagination" ref={controls}><Button variant="secondary" isDisabled={read.loadingMore || read.result.value.nextCursor === null} onPress={() => { setRetain(true); void read.loadMore(); }}>Load earlier versions</Button>
    {read.loadingMore ? <p role="status">Loading earlier versions…</p> : read.moreError ? <p role="status">Earlier versions could not be loaded. The versions already shown are unchanged.</p> : null}
  </div>;
}
