import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { MEDIA_ARCHIVE, MEDIA_BINARIES } from './pins.js';
import { MediaProcessError } from './errors.js';

async function checkFile(path: string, expected: { bytes: number; sha256: string }, executable = false): Promise<void> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== expected.bytes || (executable && ((stat.mode & 0o222) !== 0 || !(stat.mode & 0o111)))) throw new MediaProcessError('unavailable');
    const hash = createHash('sha256'); let count = 0;
    for await (const part of file.createReadStream({ autoClose: false })) { const bytes = part as Buffer; count += bytes.length; if (count > expected.bytes) throw new MediaProcessError('unavailable'); hash.update(bytes); }
    if (count !== expected.bytes || hash.digest('hex') !== expected.sha256) throw new MediaProcessError('unavailable');
  } finally { await file.close(); }
}
/** Exact local archive is required, including offline setup; no download, alternate version or PATH fallback. */
export async function verifyMediaToolchain(directory: string, archivePath = join(directory, 'archive.tar.xz')): Promise<string> {
  try {
    if (!isAbsolute(directory) || !isAbsolute(archivePath) || /[,\n\0]/.test(directory) || resolve(directory) !== await realpath(directory)) throw new MediaProcessError('unavailable');
    const bin = join(directory, 'bin'), stat = await lstat(bin);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await readdir(bin)).sort().join(',') !== 'ffmpeg,ffprobe') throw new MediaProcessError('unavailable');
    await checkFile(archivePath, MEDIA_ARCHIVE);
    for (const name of ['ffmpeg', 'ffprobe'] as const) await checkFile(join(bin, name), MEDIA_BINARIES[name], true);
    return bin;
  } catch { throw new MediaProcessError('unavailable'); }
}
