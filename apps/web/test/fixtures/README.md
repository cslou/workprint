# Test media fixture

`clip.webm` is a deterministic synthetic clip generated locally for supplied-source player evidence. It is not a product asset, licensed media or a claim about private/R2 media.

- Format: VP8 WebM, 320×180, 24 fps, 2 seconds, no audio.
- Origin: generated with the repository's local ffmpeg from the lavfi `testsrc2` source.
- Command:

```bash
ffmpeg -f lavfi -i "testsrc2=size=320x180:rate=24:duration=2" -c:v libvpx -b:v 200k -an -y clip.webm
ffmpeg -i clip.webm -frames:v 1 -y clip-poster.png
```

`clip-poster.png` is the first frame, used only as the supplied poster in deterministic visual comparisons. It is not a decoded-frame pixel claim. Playwright's bundled Chromium supports VP8 WebM; no universal codec claim is made.

`corrupt.webm` is deliberately invalid bytes, used only to exercise the native player error path. It is not media, must never gain a valid codec claim, and is not a visual comparison asset.

`library-tile.png` is a deterministic 240×240 wordless blue-grey gradient generated locally with pngjs. It stands in for a supplied Library tile image on both sides of the zero-tolerance picker comparisons; it is not product media, a saved Library item or a claim about thumbnail generation. It replaces the tracked reference's `Example media omitted` placeholder, which is never product copy.

```js
// pngjs; one RGB gradient, alpha 255, no text or transparency.
for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++) {
  const o = (y * 240 + x) * 4;
  png.data[o] = 96 + Math.round(60 * x / 240);
  png.data[o + 1] = 104 + Math.round(52 * y / 240);
  png.data[o + 2] = 118 + Math.round(40 * (x + y) / 480);
  png.data[o + 3] = 255;
}
```
