import assert from 'node:assert/strict';
import fs from 'node:fs';

// Protect CI log privacy in trusted Firestore notification projectors.
// A failed request may include private document content in the response body.
const paths = [
  "scripts/v2-marketplace-notification-projector.mjs",
  "scripts/v2-temporal-notification-projector.mjs",
  "scripts/v2-safety-notification-projector.mjs",
  "scripts/v2-followed-seller-notification-projector.mjs",
  "scripts/v2-listing-saved-notification-projector.mjs",
  "scripts/v2-saved-search-notification-projector.mjs"
];
for (const path of paths) {
  const code = fs.readFileSync(path, 'utf8');
  assert.match(code, /NOTIFICATION_PROJECTOR_HTTP_\\$\\{response\\.status\\}/,
    path + ': sanitized HTTP status expected');
  assert.doesNotMatch(code, /\\$\\{text\\.slice\\(0,\\s*800\\)\\}/,
    path + ': response body must never be included in thrown error');
  assert.doesNotMatch(code, /\\$\\{response\\.status\\} \\$\\{url\\}/,
    path + ': raw Firestore URL must not be included in thrown error');
}
console.log('PASS: six notification projector HTTP errors suppress URLs and response bodies');
