import { useSyncExternalStore } from 'react';

const event = 'workprint.entry-location';
const subscribe = (listener: () => void) => {
  window.addEventListener('popstate', listener); window.addEventListener(event, listener);
  return () => { window.removeEventListener('popstate', listener); window.removeEventListener(event, listener); };
};
export const useEntryLocation = () => useSyncExternalStore(subscribe, () => location.href);
export function replaceEntry(target: string) {
  history.replaceState(null, '', target); window.dispatchEvent(new Event(event));
}
