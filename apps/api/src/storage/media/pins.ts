export const MEDIA_IMAGE = 'node@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c';
export const MEDIA_VERSION = 'n8.1.3-27-g8dca1586f4-20261031';
// BtbN autobuild-2026-10-31-12-59, LGPLv3+, same FFmpeg revision on both architectures.
// Month-end upstream assets are retained for two years; retain exact archives for offline acquisition.
const platforms = {
  arm64: {
    platform: 'linux/arm64', architecture: 'arm64',
    manifest: 'sha256:932a44adcdb8f5dfbf00f00eb38da8d22b450b2ad258b6d1b2319beca823bfbd',
    archive: { bytes: 115803692, sha256: '2ea30086a637e3f0ad0f49a1b38db34121422b85e93cc82df2e01d9ee5200809', name: 'ffmpeg-n8.1.3-27-g8dca1586f4-linuxarm64-lgpl-8.1.tar.xz' },
    binaries: {
      ffmpeg: { bytes: 116766184, sha256: '156f4629de59bb95b4969615c5b2c256741b5bf6ef4327caf6064929ad70a9e6' },
      ffprobe: { bytes: 116569576, sha256: 'e964e65a2366caaa91f65c77abf7b9653af48f79ae5e5b8cb574ad77d8adb2b6' },
    },
  },
  x64: {
    platform: 'linux/amd64', architecture: 'amd64',
    manifest: 'sha256:e1582112fb9f152ed38eefcd712efc93fee1becb519fdfa57574d5e07eaa5e7d',
    archive: { bytes: 135188284, sha256: 'a64f3171e6ad1f7d358d28890a907ee478c331d1177ec696a93418f79ac3f1f3', name: 'ffmpeg-n8.1.3-27-g8dca1586f4-linux64-lgpl-8.1.tar.xz' },
    binaries: {
      ffmpeg: { bytes: 140046536, sha256: '09225778e63bb602f377cc9038d4556b5bd18b78d8bd5994a842ad5e262f72e3' },
      ffprobe: { bytes: 139817096, sha256: '1fa3e4a30e0599d3391c83259093218d06cbd3ce7fa577d408662f5a13c7bb4a' },
    },
  },
} as const;

/** Native host only: never silently emulate another architecture. */
export function nativeMediaPins(architecture: string = process.arch) {
  if (architecture !== 'arm64' && architecture !== 'x64') throw new Error(`Unsupported native media architecture: ${architecture}`);
  return platforms[architecture];
}
