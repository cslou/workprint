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
