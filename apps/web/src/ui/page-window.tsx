import type { ReactNode } from 'react';
import { Button } from './controls.js';
import './page-window.css';

/** Only displaced windows add UI; ordinary collections retain their existing controls. */
export function PageWindow({ offset, count, returning, onReturn, children }: { offset: number; count: number; returning: boolean; onReturn(): void; children: ReactNode }) {
  if (!offset && !returning) return children;
  return <>{offset > 0 && <p role="status">{`Showing loaded items ${offset + 1}–${offset + count}`}</p>}<div className="wp-page-actions"><Button variant="quiet" data-page-first onPress={onReturn}>Back to first page</Button>{children}</div></>;
}
