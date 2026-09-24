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
const appCheckAudit=fs.readFileSync('scripts/audit-staging-offplay-app-check.mjs','utf8');
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
assert.match(authJs,/\['verifyEmail', 'recoverEmail', 'resetPassword'\]/);
assert.match(authJs,/accounts:update/);
assert.match(authJs,/accounts:resetPassword/);
assert.match(authJs,/newPassword: password/);
assert.match(authJs,/target\.origin === location\.origin/);
assert.doesNotMatch(authJs,/localStorage|sessionStorage|refreshToken|idToken/);
assert.doesNotMatch(authJs,/console\.(?:log|error|warn).*password/i);
assert.match(authHtml,/id="reset-form"/);
assert.match(authHtml,/autocomplete="new-password"/);
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
assert.match(appCheckRepair,/INFO no successor signing SHA-256 exists yet/);
assert.match(appCheckAudit,/EXPECTED_ANDROID_CERT_SHA256_NOT_REGISTERED/);
assert.match(certBind,/certType:'SHA_256'/);
assert.match(certBind,/BIND_EXACT_STAGING_ANDROID_SHA256/);
assert.match(externalGate,/NEXT_CANDIDATE_SIGNED_CERT_SHA256_REQUIRED/);
assert.match(externalGate,/NEXT_CANDIDATE_EXACT_ANDROID_SHA256_NOT_REGISTERED/);
assert.match(externalGate,/FIREBASE_DEFAULT_MANAGED/);
assert.match(externalGate,/same-UID paste-link recovery \+ verification auto-refresh/);
assert.match(externalGate,/TUTOP_CUSTOM/);
assert.match(externalGate,/NEXT_CANDIDATE_AUTH_HANDLER_UNRECOGNIZED/);
assert.match(externalGate,/NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_NOT_REACHABLE/);
assert.match(externalGate,/NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_CONTENT_MISMATCH/);
assert.match(externalGate,/NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_CACHE_UNSAFE/);
assert.match(externalGate,/NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_FRAME_UNSAFE/);

console.log('PASS physical-failure repair contracts: email verification handler, Android notifications, Topi App Check diagnostics and off-Play attestation guards');
