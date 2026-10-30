export class ArtifactError extends Error {
  constructor(readonly code: 'not_found' | 'invalid_input' | 'integration_failure') {
    super(code === 'not_found' ? 'Saved work not found' : code === 'invalid_input' ? 'Invalid saved-work request' : 'Saved work unavailable');
  }
}
