import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const auth = read('src/services/verifiedEmailBetaAuth.ts');
const appCheck = read('src/services/nativeAppCheckToken.ts');
const location = read('src/services/nativeDeviceCapabilities.ts');

// Auth lifecycle: normalize/validate optional phone before sign-up, request email
// verification before Firestore account creation, and reject stale async session
// responses after sign-out or another authentication event.
assert.match(auth, /normalizeMexicoPhone/);
const phoneValidationIndex = auth.indexOf('const normalizedPhone = normalizeOptionalPhone(profile.phone)');
const signUpIndex = auth.indexOf("identityRequest('accounts:signUp'");
assert.ok(phoneValidationIndex >= 0 && signUpIndex > phoneValidationIndex, 'phone validation must precede sign-up');
const verifyIndex = auth.indexOf("identityRequest('accounts:sendOobCode'");
const accountCreateIndex = auth.indexOf('await createMarketplaceAccount(data, email, normalizedProfile)');
assert.ok(verifyIndex >= 0 && accountCreateIndex > verifyIndex, 'VERIFY_EMAIL request must precede marketplace document creation');
assert.match(auth, /let authGeneration = 0/);
assert.match(auth, /AUTH_SESSION_CHANGED/);
assert.match(auth, /assertSessionUnchanged\(generation, stored\.uid, stored\.refreshToken\)/);

// App Check: every native await that can block Topi is bounded. A timeout clears
// the shared initialization promise so a later user retry is not stuck behind the
// same never-settling plugin call. Production strictness remains in nativeTopiAI.
assert.match(appCheck, /APP_CHECK_INITIALIZE_TIMEOUT_MS = 6_000/);
assert.match(appCheck, /APP_CHECK_TOKEN_TIMEOUT_MS = 6_000/);
assert.match(appCheck, /function withTimeout/);
assert.match(appCheck, /APP_CHECK_TIMEOUT/);
assert.match(appCheck, /withTimeout\(appCheck\.initialize/);
assert.match(appCheck, /withTimeout\(appCheck\.getToken/);
assert.match(appCheck, /initializePromise = null/);
assert.match(appCheck, /lastFailure = timedOut\(error\) \? 'timeout'/);

// Location fallback: finishing a watch cannot block on clearWatch, and if the
// first callback wins the race before watchPosition returns its id, cleanup is
// retried as soon as that id arrives.
assert.match(location, /let cleanupRequested = false/);
assert.match(location, /const clearActiveWatch = \(\) =>/);
assert.match(location, /void geolocation\.clearWatch\(\{ id \}\)\.catch/);
assert.doesNotMatch(location, /await geolocation\.clearWatch/);
assert.match(location, /if \(settled \|\| cleanupRequested\) clearActiveWatch\(\)/);
const cleanupIndex = location.indexOf('clearActiveWatch();\n      resolve(value);');
assert.ok(cleanupIndex >= 0, 'location result must resolve independently of native clearWatch completion');

console.log('✅ post106 runtime recovery contracts PASS: auth lifecycle + bounded App Check + nonblocking location cleanup');
