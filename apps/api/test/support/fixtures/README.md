# Test media fixture

`library-tile.png` is a deterministic 240×240 wordless blue-grey gradient generated once, locally, with pngjs (not a repository dependency). `qualifiedMediaFixtures` uses it as the PNG fixture and derives the JPEG fixture from it. It is not product media or a saved Library item.

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

# Muse Spark live shapes

`muse-spark-live-shapes.json` is written by `pnpm live:chat --live` (scripts/live/chat.mjs) from one real `meta/muse-spark-1.3` run. It keeps only chunk types, payload keys, tool names and finish reasons: no ids, text, stacks or provider metadata values. It records the stream the browser observes for each step (send, tool, read-workspace, update-script, Stop), after the server's safe projection, so it no longer shows raw provider chunks. It is a reviewed snapshot to compare by hand when the scripted provider or stream handling changes; no test reads it.

# MiniMax-shaped clip

`minimax-clip.mp4` is the first 97 frames (4.041667 s) of the one live MiniMax-H3 768P clip from Sprint 009 Story 1 (task 459000874041694), cut by stream copy with the pinned toolchain, so the bytes keep MiniMax's traits: H.264 High, 1344×768 with no aspect-ratio tag, 24 fps with B-frames, AAC-LC 32 kHz stereo, `ftyp free mdat moov` and the `AIGC` metadata label. The pinned toolchain encodes only Constrained Baseline, so it can't make such a clip. 97 frames is the closest cut to 4 s that keeps every reference frame (in decode order, the first 96 frames end mid-group). `GENERATED_CLIP` in `minimax-video-fake.ts` holds its expected facts.

```sh
ffmpeg -i live.mp4 -map 0 -c copy -frames:v 97 -t 4.04 -movflags use_metadata_tags -fflags +bitexact clip.mp4
```
