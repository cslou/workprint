import { EmptyState } from '../ui/panel.js';
import type { WorkspaceFailure } from './workspace.js';
import './workspace-placeholder.css';

const failureCopy: Record<WorkspaceFailure, string> = {
  unauthenticated: 'Sign-in required to load this video.',
  unavailable: 'Loading this video is not available yet.',
  error: 'This video could not be loaded. Nothing was changed.',
};

export function WorkspaceReadPlaceholder({ state }: { state: WorkspaceFailure | 'loading' }) {
  if (state === 'loading') return <div className="wp-workspace-skeleton" role="progressbar" aria-label="Loading video">{[40, 100, 85, 30, 100, 70, 55].map((width, index) => <i key={index} style={{ width: `${width}%` }} aria-hidden="true" />)}</div>;
  return <EmptyState><span role="status">{failureCopy[state]}</span></EmptyState>;
}
