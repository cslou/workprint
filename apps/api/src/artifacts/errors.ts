export class ArtifactError extends Error {
  constructor(readonly code: 'not_found' | 'invalid_input' | 'stale_revision' | 'integration_failure') {
    super(code === 'not_found' ? 'Saved work not found' : code === 'invalid_input' ? 'Invalid saved-work request' : code === 'stale_revision' ? 'A newer version was saved' : 'Saved work unavailable');
  }
}
