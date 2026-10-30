import { savedContentSchemas } from '@workprint/contracts';

/** Validate before persistence, and again before projecting persisted JSON. */
export function parseContent(kind: string, value: unknown) {
  if (kind !== 'script' && kind !== 'reference' && kind !== 'storyboard') throw new Error('Unsupported saved content kind');
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 256 * 1024) throw new Error('Saved content exceeds its bound');
  return savedContentSchemas[kind].parse(value);
}
