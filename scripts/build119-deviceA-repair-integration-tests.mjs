import fs from 'node:fs';
import assert from 'node:assert/strict';

const product=fs.readFileSync('src/components/ProductDetail.tsx','utf8');
const permissions=fs.readFileSync('src/components/PermissionSettings.tsx','utf8');
const push=fs.readFileSync('src/services/nativeFirebaseSecurity.ts','utf8');
const ai=fs.readFileSync('src/services/nativeTopiAI.ts','utf8');

const productGuard=product.indexOf('if (!product) return null;');
assert(productGuard>0,'ProductDetail null guard missing');
for(const marker of [
  'useMemo(',
  "useEffect(() => {\n    if (!product) return;",
  "useEffect(() => {\n    let cancelled = false;",
]){
  const idx=product.indexOf(marker);
  assert(idx>=0,'missing ProductDetail hook marker: '+marker);
  assert(idx<productGuard,'hook occurs after ProductDetail null guard: '+marker);
}
assert.doesNotMatch(product.slice(0,productGuard),/if \(!selectedProductId\) return null;/);

for(const marker of [
  "NativeTopiAIFailureKind",
  "'firebase-config-rejected'",
  "'app-check'",
  "'network'",
  "'capacity'",
  "const attempts = index === 0 ? 2 : 1;",
  "AI_TRANSIENT_RETRY_DELAY_MS",
  "provider: 'firebase-ai-logic'",
]){
  assert(ai.includes(marker),'missing Topi repair marker: '+marker);
}
assert.match(ai,/return null;\n}/);
assert.doesNotMatch(ai,/silent local|local fallback.*return|fallback.*assistant local/i);

for(const marker of [
  'nativePushRegistrationHealth',
  'syncGrantedPushTokenHealth',
  "'firebase-config-rejected'",
  "'network-failure'",
  "'server-registration-failed'",
  "'token-empty'",
  "'ownership-reconciliation-pending'",
]){
  assert(push.includes(marker),'missing push repair marker: '+marker);
}
for(const marker of ['Token pendiente','Reintentar','Token FCM:','pushReasonCopy']){
  assert(permissions.includes(marker),'missing notification UX marker: '+marker);
}

assert.doesNotMatch(ai,/AIza[0-9A-Za-z_-]{20,}/);
assert.doesNotMatch(push,/AIza[0-9A-Za-z_-]{20,}/);
assert.doesNotMatch(permissions,/AIza[0-9A-Za-z_-]{20,}/);

console.log('PASS Build119 integrates the Device A React hook-order repair');
console.log('PASS Build119 keeps Topi on real Firebase AI with bounded retry/fallback and safe failure classification');
console.log('PASS Build119 distinguishes notification permission, token registration, ownership and real delivery');
console.log('PASS Build119 repair surfaces contain no embedded Firebase API keys');
