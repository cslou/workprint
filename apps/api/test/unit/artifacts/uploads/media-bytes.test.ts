import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectMediaBytes } from '../../../../src/artifacts/uploads/media-bytes.js';
import { itxt, metaXmp, pngChunk, testPng } from '../../../support/meta-image-fake.js';

const png = (bytes: Buffer, origin: 'upload' | 'assistant') => inspectMediaBytes(bytes, 'image', 'image/png', origin);
const refused = (bytes: Buffer, origin: 'upload' | 'assistant', why: string) => assert.throws(() => png(bytes, origin), { code: 'unsupported' }, why);

test('only an assistant-made PNG may carry one uncompressed XMP label before its image data', () => {
  assert.deepEqual(png(testPng(), 'assistant'), { width: 64, height: 48 });
  assert.deepEqual(png(testPng({ xmp: false }), 'assistant'), { width: 64, height: 48 });
  refused(testPng(), 'upload', 'uploads keep the strict chunk rule');
  assert.throws(() => inspectMediaBytes(testPng(), 'image', 'image/png'), { code: 'unsupported' }, 'the default is the upload rule');

  refused(testPng({ before: [itxt('XML:com.adobe.xmp', metaXmp)] }), 'assistant', 'two labels');
  refused(testPng({ xmp: false, before: [itxt('Comment', metaXmp)] }), 'assistant', 'another keyword');
  refused(testPng({ xmp: false, before: [itxt('XML:com.adobe.xmp', metaXmp, 1)] }), 'assistant', 'a compressed label');
  refused(testPng({ xmp: false, before: [itxt('XML:com.adobe.xmp', 'x'.repeat(4096))] }), 'assistant', 'a label over 4 KB');
  refused(testPng({ xmp: false, after: [itxt('XML:com.adobe.xmp', metaXmp)] }), 'assistant', 'a label after the image data');
  refused(testPng({ xmp: false, before: [pngChunk('iTXt', Buffer.from('XML:com.adobe.xmp\0\0\0no separators', 'latin1'))] }), 'assistant', 'a label without its language tag');
  refused(testPng({ before: [pngChunk('tEXt', Buffer.from('Comment\0hello', 'latin1'))] }), 'assistant', 'other text chunks');
});
