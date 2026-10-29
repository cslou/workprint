import type { ReactNode } from 'react';

const labels = { empty: 'Empty', draft: 'Draft', ready: 'Ready', chosen: 'Chosen', queued: 'Queued', processing: 'Processing', submitting: 'Submitting', running: 'Running', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled' } as const;
// Callers supply stored state. Content presence never derives approval.
export function StatusPill({ state }: { state: keyof typeof labels }) {
  return <span className={`wp-status wp-status-${state}`}>{labels[state]}</span>;
}
export function Feedback({ children }: { children: ReactNode }) {
  return <p className="wp-feedback" role="status">{children}</p>;
}
