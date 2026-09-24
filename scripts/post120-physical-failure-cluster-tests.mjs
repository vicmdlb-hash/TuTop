import fs from 'node:fs';
import assert from 'node:assert/strict';

const android=fs.readFileSync('scripts/android-native-capabilities.mjs','utf8');
const topi=fs.readFileSync('src/services/nativeTopiAI.ts','utf8');
const gate=fs.readFileSync('src/components/BackendGate.tsx','utf8');
const auth=fs.readFileSync('src/services/verifiedEmailBetaAuth.ts','utf8');
const authHtml=fs.readFileSync('public/auth-action.html','utf8');
const authJs=fs.readFileSync('public/auth-action.js','utf8');
const firebase=JSON.parse(fs.readFileSync('firebase.json','utf8'));
const appCheckRepair=fs.readFileSync('scripts/repair-staging-offplay-app-check.mjs','utf8');
const certBind=fs.readFileSync('scripts/register-staging-android-sha256.mjs','utf8');
const externalGate=fs.readFileSync('scripts/next-candidate-external-preapk-gate.mjs','utf8');

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
assert.match(gate,/Verificar con este enlace/);
assert.match(gate,/applyVerificationLink\(verificationLink\)/);
assert.match(auth,/async applyVerificationLink\(linkInput: string\)/);
assert.match(auth,/accounts:update/);
assert.match(auth,/AUTH_UID_MISMATCH/);
assert.match(auth,/searchParams\.get\('oobCode'\)/);

assert.match(authHtml,/auth-action\.js/);
assert.doesNotMatch(authHtml,/<script(?![^>]*\ssrc=)[^>]*>/i);
assert.match(authJs,/mode !== 'verifyEmail'/);
assert.match(authJs,/accounts:update\?key=/);
assert.match(authJs,/JSON\.stringify\(\{ oobCode \}\)/);
assert.doesNotMatch(authJs,/password|refreshToken|idToken/i);
assert.match(authJs,/target\.origin === location\.origin/);
assert.doesNotMatch(authJs,/target\.protocol === 'https:' \|\| target\.protocol === 'http:'/);

const authHeaders=(firebase.hosting?.headers||[]).find(x=>x.source==='/auth-action*')?.headers||[];
assert(authHeaders.some(x=>x.key==='Cache-Control'&&x.value==='no-store'));
for(const [key,value] of [
  ['X-Frame-Options','DENY'],
  ['Referrer-Policy','no-referrer'],
  ['X-Content-Type-Options','nosniff'],
  ['Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()'],
]) assert(authHeaders.some(x=>x.key===key&&x.value===value), `missing auth-action header ${key}`);

assert.match(appCheckRepair,/allowUnrecognizedVersion:true/);
assert.match(appCheckRepair,/MEETS_DEVICE_INTEGRITY/);
assert.match(appCheckRepair,/requireLicensed:false/);
assert.match(appCheckRepair,/NEXT_CANDIDATE_ANDROID_SHA256_REQUIRED/);
assert.match(certBind,/certType:'SHA_256'/);
assert.match(certBind,/BIND_EXACT_STAGING_ANDROID_SHA256/);
assert.match(externalGate,/NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_NOT_CONFIGURED/);
assert.match(externalGate,/NEXT_CANDIDATE_ANDROID_SHA256_REQUIRED/);
assert.match(externalGate,/auth_custom_handler:true/);

console.log('PASS physical-failure repair contracts: email verification handler, Android notifications, Topi App Check diagnostics and off-Play attestation guards');
