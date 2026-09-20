import fs from 'node:fs';
import assert from 'node:assert/strict';

const push=fs.readFileSync('src/services/nativeFirebaseSecurity.ts','utf8');
const permissions=fs.readFileSync('src/components/PermissionSettings.tsx','utf8');
const ai=fs.readFileSync('src/services/nativeTopiAI.ts','utf8');

for(const marker of [
  "'firebase-config-rejected'",
  "'network-failure'",
  "'server-registration-failed'",
  'syncGrantedPushTokenHealth',
]) assert(push.includes(marker), `missing push diagnostic marker: ${marker}`);

assert.match(permissions,/Token pendiente/);
assert.match(permissions,/Reintentar/);
assert.match(permissions,/pushReasonCopy/);
assert.match(permissions,/catch \{/);

for(const marker of [
  "'firebase-config-rejected'",
  "'app-check'",
  "'capacity'",
  "'network'",
  'NativeTopiAIFailureKind',
  'failureKind',
]) assert(ai.includes(marker), `missing Topi diagnostic marker: ${marker}`);

assert.doesNotMatch(permissions,/AIza[0-9A-Za-z_-]{20,}/);
assert.doesNotMatch(ai,/AIza[0-9A-Za-z_-]{20,}/);

console.log('PASS Device A native failure diagnostics: FCM registration reasons visible/retryable + Topi safe failure classification');
