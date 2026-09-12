import assert from 'node:assert/strict';
import fs from 'node:fs';

const pluginGenerator = fs.readFileSync('scripts/android-secure-session-plugin.mjs', 'utf8');
const bootstrap = fs.readFileSync('scripts/android-bootstrap.mjs', 'utf8');
const secure = fs.readFileSync('src/services/nativeSecureSession.ts', 'utf8');
const bridge = fs.readFileSync('src/services/nativeSecureSessionBridge.ts', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');

assert.match(pluginGenerator, /AndroidKeyStore/);
assert.match(pluginGenerator, /AES\/GCM\/NoPadding/);
assert.match(pluginGenerator, /KeyGenParameterSpec\.Builder/);
assert.match(pluginGenerator, /setRandomizedEncryptionRequired\(true\)/);
assert.match(pluginGenerator, /putString\(key, encrypt\(value\)\)/, 'SharedPreferences may only receive encrypted payload');
assert.doesNotMatch(pluginGenerator, /putString\(key, value\)/, 'plaintext session must never be written natively');
assert.match(pluginGenerator, /registerPlugin\(TuTopSecureStorePlugin\.class\)/);
assert.match(bootstrap, /android-secure-session-plugin\.mjs/);

assert.match(secure, /sessionStorage\.setItem\(key, raw\)/);
assert.match(secure, /plugin\.set\(\{ key, value: legacyRaw \}\)/, 'legacy native session must migrate into secure store');
assert.match(secure, /nativeSignOutTombstoneKey/);
assert.match(bridge, /markNativeSignedOut\(key, true\)/);
assert.match(bridge, /native_local_storage_tokens: false/);
assert.doesNotMatch(bridge, /localStorage\.setItem\([^\n]*(idToken|refreshToken|JSON\.stringify\(session\))/i);

const restoreAt = main.indexOf('restoreNativeSessionForProject');
const appAt = main.indexOf("import('./App')");
assert.ok(restoreAt >= 0 && appAt > restoreAt, 'native session must restore before App module is imported');
assert.match(main, /nativeSecureSessionBridge/);
assert.match(main, /firebaseSessionHardeningBridge/);

console.log('✅ TuTop 0.9.1 native secure session contracts PASS');
