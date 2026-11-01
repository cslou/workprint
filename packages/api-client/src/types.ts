import type { ErrorEnvelope } from '@workprint/contracts';

export type ClientError = ErrorEnvelope['error'] | { code: 'transport_failure' | 'timed_out' | 'cancelled' | 'invalid_response'; message: string };
export type ClientResult<T> = { ok: true; value: T } | { ok: false; error: ClientError };
export type CallOptions = { signal?: AbortSignal };
