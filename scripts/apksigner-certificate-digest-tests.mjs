import assert from 'node:assert/strict';
import { extractApkSignerDigest } from './apksigner-certificate-digest.mjs';

const sha1='A1'.repeat(20);
const sha256='B2'.repeat(32);
const colon=(value)=>value.match(/../g).join(':');
const spaced=(value)=>value.match(/../g).join(' ');

for(const output of [
  `Signer #1 certificate SHA-1 digest: ${sha1}\nSigner #1 certificate SHA-256 digest: ${sha256}\n`,
  `Signer #1 certificate SHA-1 digest: ${colon(sha1)}\r\nSigner #1 certificate SHA-256 digest: ${colon(sha256)}\r\n`,
  `Signer #1 certificate SHA1 digest = ${spaced(sha1)}\nSigner #1 certificate SHA256 digest = ${spaced(sha256)}\n`,
]){
  assert.equal(extractApkSignerDigest(output,'SHA-1',40),sha1);
  assert.equal(extractApkSignerDigest(output,'SHA-256',64),sha256);
}
assert.throws(()=>extractApkSignerDigest('Signer #1 certificate SHA-1 digest: BAD','SHA-1',40),/APK_CERT_SHA1_INVALID/);
assert.throws(()=>extractApkSignerDigest('unrelated output','SHA-256',64),/APK_CERT_SHA256_INVALID/);
console.log('PASS apksigner certificate parser accepts compact, colon-delimited and spaced digest formats and fails closed otherwise');
