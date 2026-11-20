import assert from 'node:assert/strict';
import { compressImageForFirestore } from '../src/lib/imageCompression.ts';

// Isolated browser-API simulation: no device, network, photos or Firebase calls.
const originalImage = globalThis.Image;
const originalDocument = globalThis.document;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const revoked = [];
let serial = 0;
try {
  URL.createObjectURL = () => `blob:tutop-photo-test-${++serial}`;
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.Image = class {
    src = '';
    decoding = '';
    naturalWidth = 600;
    naturalHeight = 400;
    async decode() { throw new Error('UNSUPPORTED_HEIF_SYNTHETIC'); }
  };

  await assert.rejects(
    compressImageForFirestore({ type: 'image/heic' }),
    /UNSUPPORTED_HEIF_SYNTHETIC/,
    'unsupported photo format should surface a recoverable processing error',
  );
  assert.deepEqual(revoked, ['blob:tutop-photo-test-1'],
    'failed decode must revoke the temporary photo URL exactly once');

  globalThis.Image = class {
    src = '';
    decoding = '';
    naturalWidth = 600;
    naturalHeight = 400;
    async decode() {}
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0, height: 0,
        getContext() { return { fillStyle: '', fillRect() {}, drawImage() {} }; },
        toDataURL() { return 'data:image/webp;base64,AAAA'; },
      };
    },
  };
  const output = await compressImageForFirestore({ type: 'image/jpeg' });
  assert.equal(output, 'data:image/webp;base64,AAAA');
  assert.deepEqual(revoked, ['blob:tutop-photo-test-1', 'blob:tutop-photo-test-2'],
    'successful canvas conversion must still revoke the URL exactly once');
} finally {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  if (originalImage === undefined) delete globalThis.Image;
  else globalThis.Image = originalImage;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}
console.log('PASS photo decode: unsupported formats clean object URLs, successful conversion cleans exactly once; source-only');
