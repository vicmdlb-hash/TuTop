import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const auth = read('src/services/verifiedEmailBetaAuth.ts');
const appCheck = read('src/services/nativeAppCheckToken.ts');
const location = read('src/services/nativeDeviceCapabilities.ts');

// Auth lifecycle: normalize/validate optional phone before sign-up, request email
// verification after atomic Firestore account creation, and reject stale async session
// responses after sign-out or another authentication event.
assert.match(auth, /normalizeMexicoPhone/);
const registerStart = auth.indexOf('async register(');
const registerEnd = auth.indexOf('\n\n  async login(', registerStart);
assert.ok(registerStart >= 0 && registerEnd > registerStart, 'register implementation must be locatable');
const register = auth.slice(registerStart, registerEnd);
const phoneValidationIndex = register.indexOf('const normalizedPhone = normalizeOptionalPhone(profile.phone)');
const signUpIndex = register.indexOf("identityRequest('accounts:signUp'");
assert.ok(phoneValidationIndex >= 0 && signUpIndex > phoneValidationIndex, 'phone validation must precede sign-up');
const accountCreateIndex = register.indexOf('await createMarketplaceAccount(data, email, normalizedProfile)');
const verifyIndex = register.indexOf("identityRequest('accounts:sendOobCode'");
assert.ok(accountCreateIndex >= 0 && verifyIndex > accountCreateIndex, 'successful marketplace commit must precede recoverable verification mail delivery');
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
