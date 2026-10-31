export class MediaProcessError extends Error {
  constructor(readonly code: 'unavailable' | 'invalid_input' | 'capacity' | 'cancelled' | 'deadline' | 'output_limit' | 'failed' | 'cleanup') {
    super(`Media process ${code}`);
  }
}
