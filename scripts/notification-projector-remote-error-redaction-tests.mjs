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
  assert(code.includes('NOTIFICATION_PROJECTOR_HTTP_' + '${response.status}'),
    path + ': sanitized HTTP status expected');
  assert(!code.includes('${text.slice(0,800)}') && !code.includes('${text.slice(0, 800)}'),
    path + ': response body must never be included in thrown error');
  assert(!code.includes('${response.status} ${url}'),
    path + ': raw Firestore URL must not be included in thrown error');
}

// Trusted maintenance must not echo Firestore error payloads, document paths,
// recipient IDs, device-token IDs or FCM response bodies into CI logs.
const maintenance = fs.readFileSync('scripts/v2-trusted-maintenance.mjs', 'utf8');
assert(maintenance.includes('V2_TRUSTED_MAINTENANCE_HTTP_' + '${response.status}'));
assert(maintenance.includes('V2_TRUSTED_MAINTENANCE_FCM_HTTP_' + '${response.status}'));
assert(!maintenance.includes('${response.status} ${url}: ${text.slice(0, 800)}'),
  'maintenance errors must not include raw remote URL/body');
assert(!maintenance.includes('detail.slice(0, 220)') && !maintenance.includes('${item.id}/${target.id}'),
  'FCM errors must not leak recipient IDs or provider response bodies');

console.log('PASS: notification projectors and trusted maintenance suppress URLs, IDs and response bodies');
