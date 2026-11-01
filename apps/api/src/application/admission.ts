/** Identity supplied by trusted admission, never by a request owner field. */
export type Admission = { kind: 'verified'; accountId: string } | { kind: 'unauthorized' } | { kind: 'unavailable' };
