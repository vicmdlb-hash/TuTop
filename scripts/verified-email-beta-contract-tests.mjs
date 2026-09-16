import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath, ['scripts/prepare-firestore-v2-rules.mjs'], { stdio: 'inherit' });
for (const script of [
  'scripts/harden-canonical-v2-rules.mjs',
  'scripts/harden-runtime-v2-rules.mjs',
  'scripts/optimize-listing-rate-limit-rules.mjs',
  'scripts/harden-account-operations-rules.mjs',
  'scripts/harden-notification-receipts-rules.mjs',
  'scripts/harden-transaction-lock-rules.mjs',
  'scripts/harden-nearby-v2-rules.mjs',
  'scripts/harden-listing-video-rules.mjs',
  'scripts/harden-verified-email-beta-rules.mjs',
]) execFileSync(process.execPath, [script], { stdio: 'inherit' });

const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const auth = fs.readFileSync('src/services/verifiedEmailBetaAuth.ts', 'utf8');
const nativeBridge = fs.readFileSync('src/services/nativeSecureSessionBridge.ts', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.match(rules, /function verifiedIdentity\(\)[\s\S]*email_verified == true/);
assert.match(rules, /auth_mode in \['phone_password_beta','email_password_verified_beta'\]/);
assert.match(rules, /auth_mode == 'email_password_verified_beta'[\s\S]*institutional_email == request\.auth\.token\.email/);
assert.match(rules, /function listingRateLimitConsumed\(\)/);
assert.match(rules, /match \/listings_v2\/\{listingId\}[\s\S]*allow create: if signedIn\(\) && notSuspended\(\) && verifiedIdentity\(\)[\s\S]*listingRateLimitConsumed\(\)/);
assert.match(rules, /allow create: if signedIn\(\) && notSuspended\(\) && verifiedIdentity\(\)[\s\S]*rateLimitConsumed\('chat_create'\)/);
assert.match(rules, /allow create: if participant\(chatId\) && notSuspended\(\) && verifiedIdentity\(\)[\s\S]*rateLimitConsumed\('message_create'\)/);
assert.match(rules, /allow create: if signedIn\(\) && notSuspended\(\) && verifiedIdentity\(\)[\s\S]*rateLimitConsumed\('offer_create'\)/);
assert.match(rules, /match \/transactions_v2\/\{transactionId\}[\s\S]*allow create: if signedIn\(\) && notSuspended\(\) && verifiedIdentity\(\)/);
const txSection = rules.match(/match \/transactions_v2\/\{transactionId\} \{([\s\S]*?)\n    match \/demand_requests\/\{requestId\}/)?.[1] || '';
assert.equal((txSection.match(/allow update: if signedIn\(\) && notSuspended\(\) && verifiedIdentity\(\)/g) || []).length, 2, 'both user-driven transaction update paths must require verified identity');
assert.match(rules, /match \/notification_outbox\/\{notificationId\}[\s\S]*allow create, update, delete: if false;/);

assert.match(auth, /accounts:sendOobCode/);
assert.match(auth, /requestType: 'VERIFY_EMAIL'/);
assert.match(auth, /accounts:lookup/);
assert.match(auth, /emailVerified/);
assert.match(auth, /email_password_verified_beta/);

// Native security invariant: verified-email auth must use FirebaseRestClient's
// canonical persistence boundary. On Android nativeSecureSessionBridge intercepts
// that boundary and writes process sessionStorage + encrypted Keystore. Direct
// localStorage token writes would be invisible to same-process native clients and
// could also bypass the sign-out tombstone.
assert.match(auth, /internal\.persistSession\(session\)/);
assert.match(auth, /sessionClient\(\)\.signOut\(\)/);
assert.doesNotMatch(auth, /localStorage\.(?:setItem|removeItem)\(/);
assert.match(nativeBridge, /proto\.persistSession = function nativePersistSession/);
assert.match(nativeBridge, /storage\.setItem\(key, raw\)/);
assert.match(nativeBridge, /markNativeSignedOut\(key, true\)/);
assert.ok(packageJson.scripts['v2:rules:prepare'].includes('harden-verified-email-beta-rules.mjs'));

console.log('✅ Verified email beta auth + Firestore security + native session persistence contracts PASS');
