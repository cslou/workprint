import type { ReactNode } from 'react';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { useLibrary } from './use-library.js';
import { LibraryPagination } from './pagination.js';
import './library.css';

export const libraryFeedback = {
  unauthenticated: ['Sign-in required', 'Your Library cannot be loaded without a valid session.'],
  unavailable: ['Library not available yet', 'Library loading is not implemented in this build.'],
  error: ['Library could not be loaded', 'No saved material was changed.'],
  loading: ['Loading Library…', 'Looking for saved characters, places and props.'],
  unconfigured: ['Library connection not configured', 'No API origin is configured for this build.'],
  empty: ['Nothing saved yet', 'Your saved work will appear here.'],
} as const;
export type LibraryFeedbackState = keyof typeof libraryFeedback;

export function LibraryFeedback({ state }: { state: LibraryFeedbackState }) {
  const [title, message] = libraryFeedback[state];
  return <div className="wp-library-feedback" role="status" data-empty={state === 'empty' || undefined}><b>{title}</b><span>{message}</span></div>;
}

/** Actual Library read consumer. Material rendering is supplied by its owning view. */
export function Library({ connection, scope, children }: { connection: BrowserClient; scope: ReadScope | null; children: (library: OperationResponse<'library'>, pagination: ReactNode) => ReactNode }) {
  const read = useLibrary(connection.kind === 'configured' ? connection.client : null, scope);
  if (connection.kind !== 'configured') return <LibraryFeedback state="unconfigured" />;
  if (!scope) return <LibraryFeedback state="unauthenticated" />;
  if (read.kind !== 'settled') return <LibraryFeedback state="loading" />;
  if (!read.result.ok) {
    const code = read.result.error.code;
    return <LibraryFeedback state={code === 'unauthenticated' ? 'unauthenticated' : code === 'not_implemented' ? 'unavailable' : 'error'} />;
  }
  return read.result.value.items.length === 0 ? <LibraryFeedback state="empty" /> : children(read.result.value, <LibraryPagination read={read} />);
}
