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
