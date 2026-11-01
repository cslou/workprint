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
