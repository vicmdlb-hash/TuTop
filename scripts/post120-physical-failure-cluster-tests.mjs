import fs from 'node:fs';
import assert from 'node:assert/strict';

const android=fs.readFileSync('scripts/android-native-capabilities.mjs','utf8');
const topi=fs.readFileSync('src/services/nativeTopiAI.ts','utf8');
const gate=fs.readFileSync('src/components/BackendGate.tsx','utf8');
const authHtml=fs.readFileSync('public/auth-action.html','utf8');
const authJs=fs.readFileSync('public/auth-action.js','utf8');
const firebase=JSON.parse(fs.readFileSync('firebase.json','utf8'));
const appCheckRepair=fs.readFileSync('scripts/repair-staging-offplay-app-check.mjs','utf8');
const certBind=fs.readFileSync('scripts/register-staging-android-sha256.mjs','utf8');

assert.match(android,/android\.permission\.POST_NOTIFICATIONS/);
assert.match(android,/falta POST_NOTIFICATIONS para Android 13\+/);

const appCheckIndex=topi.indexOf("return 'app-check'");
const configIndex=topi.indexOf("return 'firebase-config-rejected'");
assert(appCheckIndex>=0&&configIndex>=0&&appCheckIndex<configIndex,'App Check must classify before generic 403/config failures');
assert.match(topi,/app_check_token_missing_best_effort/);
assert.match(topi,/app_check: nativeAppCheckStatus\(\)/);

assert.match(gate,/visibilitychange/);
assert.match(gate,/15_000/);
assert.match(gate,/refreshVerificationStatus\(\)/);

assert.match(authHtml,/auth-action\.js/);
assert.doesNotMatch(authHtml,/<script(?![^>]*\ssrc=)[^>]*>/i);
assert.match(authJs,/mode !== 'verifyEmail'/);
assert.match(authJs,/accounts:update\?key=/);
assert.match(authJs,/JSON\.stringify\(\{ oobCode \}\)/);
assert.doesNotMatch(authJs,/password|refreshToken|idToken/i);

const authHeaders=(firebase.hosting?.headers||[]).find(x=>x.source==='/auth-action*')?.headers||[];
assert(authHeaders.some(x=>x.key==='Cache-Control'&&x.value==='no-store'));

assert.match(appCheckRepair,/allowUnrecognizedVersion:true/);
assert.match(appCheckRepair,/MEETS_DEVICE_INTEGRITY/);
assert.match(appCheckRepair,/requireLicensed:false/);
assert.match(appCheckRepair,/ANDROID_SHA256_CERT_REQUIRED_BEFORE_APPCHECK_REPAIR/);
assert.match(certBind,/certType:'SHA_256'/);
assert.match(certBind,/BIND_EXACT_STAGING_ANDROID_SHA256/);

console.log('PASS physical-failure repair contracts: email verification handler, Android notifications, Topi App Check diagnostics and off-Play attestation guards');
