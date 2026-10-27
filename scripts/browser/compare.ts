import { PNG } from 'pngjs';
import { writeFile } from 'node:fs/promises';

// Zero tolerance: no masks, perceptual thresholds or baseline-acceptance mode.
export async function compare(reference: Buffer, actual: Buffer, prefix: string) {
  const a = PNG.sync.read(reference);
  const b = PNG.sync.read(actual);
  if (a.width !== b.width || a.height !== b.height) throw new Error(`Image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  const diff = new PNG({ width: a.width, height: a.height });
  const overlay = new PNG({ width: a.width, height: a.height });
  let changed = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    const different = a.data.subarray(offset, offset + 4).some((value, index) => value !== b.data[offset + index]);
    if (different) changed++;
    diff.data.set(different ? [255, 0, 0, 255] : [255, 255, 255, 255], offset);
    for (let channel = 0; channel < 3; channel++) overlay.data[offset + channel] = Math.round(((a.data[offset + channel] ?? 0) + (b.data[offset + channel] ?? 0)) / 2);
    overlay.data[offset + 3] = 255;
  }
  await Promise.all([writeFile(`${prefix}-diff.png`, PNG.sync.write(diff)), writeFile(`${prefix}-overlay.png`, PNG.sync.write(overlay))]);
  return changed;
}
