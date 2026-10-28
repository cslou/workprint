export type PublicApiConfig = { kind: 'missing' } | { kind: 'invalid' } | { kind: 'configured'; apiOrigin: string };

/** Exactly one public value; never accepts or serializes a backend environment. */
export function parsePublicApiOrigin(value: unknown): PublicApiConfig {
  if (value === undefined || value === null || value === '') return { kind: 'missing' };
  if (typeof value !== 'string' || value.trim() !== value) return { kind: 'invalid' };
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) return { kind: 'invalid' };
    return { kind: 'configured', apiOrigin: url.origin };
  } catch { return { kind: 'invalid' }; }
}
