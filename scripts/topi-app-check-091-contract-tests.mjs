import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/services/nativeAppCheckToken.ts', 'utf8');
const stagingEnv = fs.readFileSync('scripts/export-staging-v2-build-env.mjs', 'utf8');

assert.match(source, /function useStagingDebugProvider\(\)/);
assert.match(source, /environment === 'staging'/);
assert.match(source, /\^0\\\.9\\\.1-beta\\\./);
assert.match(source, /debugToken: useStagingDebugProvider\(\)/);
assert.match(source, /isTokenAutoRefreshEnabled: true/);
assert.doesNotMatch(source, /debugToken:\s*true/);
assert.doesNotMatch(source, /debugToken:\s*['"][A-Za-z0-9_-]{12,}['"]/);

assert.match(stagingEnv, /VITE_TUTOP_ENVIRONMENT=staging/);
assert.match(stagingEnv, /VITE_TUTOP_APP_VERSION=/);
assert.match(stagingEnv, /VITE_TUTOP_TOPI_FIREBASE_AI_ENABLED=true/);

console.log('✅ TuTop 0.9.1 staging App Check debug-provider guard contract PASS');
