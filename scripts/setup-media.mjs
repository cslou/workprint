import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { MEDIA_IMAGE, nativeMediaPins } from '../apps/api/src/storage/media/pins.ts';
import { authImages, postgresImage, SEAWEED_IMAGE } from '../apps/api/test/support/fixture-images.ts';

// Explicit installer only. Serving code never downloads or substitutes tools.
if (process.argv.length > 3) throw new Error('Usage: pnpm exec node scripts/setup-media.mjs [retained-archive.tar.xz]');
const pins = nativeMediaPins();
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
if (!docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).startsWith('unix://')) throw new Error('Media setup requires local Unix-socket Docker');
const native = pins.architecture === 'amd64' ? ['amd64', 'x86_64'] : ['arm64', 'aarch64'];
if (!native.some(arch => docker(['info', '--format', '{{.OSType}}|{{.Architecture}}']) === `linux|${arch}`)) throw new Error('Docker must match the native host architecture');

async function verify(path, expected, executable = false) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size !== expected.bytes || (executable && (!(stat.mode & 0o111) || (stat.mode & 0o222)))) throw new Error(`Invalid media file: ${path}`);
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  if (hash.digest('hex') !== expected.sha256) throw new Error(`Media checksum mismatch: ${path}`);
}
async function verifyDirectory(directory) {
  if (!(await lstat(directory)).isDirectory() || !(await lstat(join(directory, 'bin'))).isDirectory()) throw new Error('Media directories must not be symlinks');
  if ((await readdir(join(directory, 'bin'))).sort().join(',') !== 'ffmpeg,ffprobe') throw new Error('Unexpected media binaries');
  await verify(join(directory, 'archive.tar.xz'), pins.archive);
  for (const name of ['ffmpeg', 'ffprobe']) await verify(join(directory, 'bin', name), pins.binaries[name], true);
}

const parent = resolve('outputs/toolchains'), directory = join(parent, `ffmpeg-${pins.archive.sha256}`);
await mkdir(parent, { recursive: true });
let present = true;
try { await lstat(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; present = false; }
if (!present) {
  const temporary = await mkdtemp(join(parent, '.media-'));
  try {
    const archive = join(temporary, 'archive.tar.xz');
    if (process.argv[2]) await copyFile(resolve(process.argv[2]), archive);
    else execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '180', '--output', archive,
      `https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-31-12-59/${pins.archive.name}`], { stdio: 'inherit', timeout: 185000 });
    await verify(archive, pins.archive);
    const root = pins.archive.name.replace(/\.tar\.xz$/, '');
    execFileSync('tar', ['-xJf', archive, '--strip-components=1', '-C', temporary, `${root}/bin/ffmpeg`, `${root}/bin/ffprobe`, `${root}/LICENSE.txt`], { stdio: 'inherit', timeout: 60000 });
    for (const name of ['ffmpeg', 'ffprobe']) await chmod(join(temporary, 'bin', name), 0o555);
    await chmod(archive, 0o444);
    await verifyDirectory(temporary);
    await rename(temporary, directory);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
await verifyDirectory(directory);
console.info(`Verified native media cache: ${directory}`);

for (const image of [MEDIA_IMAGE, postgresImage, SEAWEED_IMAGE, ...Object.values(authImages)]) {
  let data;
  try { data = docker(['image', 'inspect', image]); }
  catch (error) {
    if (error.status !== 1 || !/No such image:/i.test(String(error.stderr))) throw error;
    console.info(`Acquiring ${image}`);
    execFileSync('docker', ['pull', '--platform', pins.platform, image], { stdio: 'inherit', timeout: 180000 });
    data = docker(['image', 'inspect', image]);
  }
  const [record, extra] = JSON.parse(data);
  const reference = image.replace(/:[^/@]+@/, '@');
  if (extra || record?.Os !== 'linux' || record?.Architecture !== pins.architecture || !record?.RepoDigests?.includes(reference)) throw new Error(`Image identity/platform mismatch: ${image}`);
  console.info(`Verified cached image: ${image}`);
}
