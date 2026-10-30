import { useLayoutEffect, useRef, useState } from 'react';

type Options = { settled: boolean; terminal: boolean; addedIds: readonly string[]; loadMore(): Promise<void>; returnToFirstPage(): void; focusTerminal(button: HTMLButtonElement | null, ids: readonly string[], returning: boolean): void };
/** Retain an activated pager through settlement; features own their focus targets. */
export function usePageFocus({ settled, terminal, addedIds, loadMore, returnToFirstPage, focusTerminal }: Options) {
  const controls = useRef<HTMLDivElement>(null);
  const [action, setAction] = useState<'next' | 'first' | null>(null);
  useLayoutEffect(() => {
    if (!action || !settled) return;
    const button = controls.current?.querySelector<HTMLButtonElement>(action === 'first' ? '[data-page-first]' : '[data-page-next]') ?? null;
    const active = document.activeElement;
    if (active === document.body || active === button) {
      if (terminal || action === 'first') focusTerminal(button, addedIds, action === 'first');
      else button?.focus({ preventScroll: true });
    }
    setAction(null);
  }, [settled, terminal, addedIds, focusTerminal, action]);
  return { controls, retain: action === 'next', returning: action === 'first', activate() { setAction('next'); void loadMore(); }, back() { setAction('first'); returnToFirstPage(); } };
}
