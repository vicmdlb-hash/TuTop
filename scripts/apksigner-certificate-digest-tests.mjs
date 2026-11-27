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

// A real APK identity must not be derived from spoofed output, a malformed
// digest with injected content, or contradictory multiple signing certificates.
// Error messages must never echo paths, emails or other arbitrary tool output.
assert.equal(extractApkSignerDigest(
  `Signer #1 certificate SHA-256 digest: ${sha256}\nSigner #1 certificate SHA-256 digest: ${colon(sha256)}`,
  'SHA-256', 64), sha256);
const otherSha256='C3'.repeat(32);
assert.throws(()=>extractApkSignerDigest(
  `Signer #1 certificate SHA-256 digest: ${sha256}\nSigner #2 certificate SHA-256 digest: ${otherSha256}`,
  'SHA-256', 64),/APK_CERT_SHA256_AMBIGUOUS/);
for (const secret of ['person@example.invalid','user/local/private/key.jks','fake-token-should-remain-private']) {
  const malicious=`Signer #1 certificate SHA-256 digest: ${secret}`;
  assert.throws(()=>extractApkSignerDigest(malicious, 'SHA-256', 64), (error)=>{
    assert.equal(error.message,'APK_CERT_SHA256_INVALID');
    assert(!error.message.includes(secret));
    return true;
  });
}
assert.throws(()=>extractApkSignerDigest(
  `Signer #1 certificate SHA-1 digest: ${sha1}x`,'SHA-1',40),/APK_CERT_SHA1_INVALID/);
assert.throws(()=>extractApkSignerDigest(
  `Signer #1 certificate SHA-1 digest: ${sha1}`,'',40),/APK_CERT_KIND_INVALID/);
assert.throws(()=>extractApkSignerDigest(
  `Signer #1 certificate SHA-1 digest: ${sha1}`,'SHA-1',64),/APK_CERT_KIND_INVALID/);
assert.throws(()=>extractApkSignerDigest(null,'SHA-1',40),/APK_CERT_OUTPUT_INVALID/);
assert.throws(()=>extractApkSignerDigest('a'.repeat(262145),'SHA-1',40),/APK_CERT_OUTPUT_INVALID/);
assert.throws(()=>extractApkSignerDigest(
  `Signer #2 certificate SHA-1 digest: ${sha1}`,'SHA-256',64),/APK_CERT_SHA256_INVALID/);
console.log('PASS APK signer ambiguity and sensitive output fail closed without echoing raw diagnostics');

console.log('PASS apksigner certificate parser accepts compact, colon-delimited and spaced digest formats and fails closed otherwise');
