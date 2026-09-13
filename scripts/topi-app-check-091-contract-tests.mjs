import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/services/nativeAppCheckToken.ts', 'utf8');
const stagingEnv = fs.readFileSync('scripts/export-staging-v2-build-env.mjs', 'utf8');
const guard = fs.readFileSync('scripts/staging-freeze-guard.mjs', 'utf8');
const config = fs.readFileSync('scripts/configure-app-check-staging.mjs', 'utf8');
const runtimeSmoke = fs.readFileSync('scripts/staging-topi-ai-runtime-smoke.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/staging-v2-smoke.yml', 'utf8');

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

assert.match(guard, /assertAiAppCheckFreezeMode/);
assert.match(guard, /TUTOP_ALLOW_AI_APP_CHECK_ENFORCEMENT/);
assert.match(guard, /staging-ai-only/);
assert.match(guard, /general_app_check_enforcement_forbidden_during_runtime_freeze/);

assert.match(config, /firestore\.googleapis\.com/);
assert.match(config, /identitytoolkit\.googleapis\.com/);
assert.match(config, /firebaseml\.googleapis\.com/);
assert.match(config, /assertAppCheckFreezeMode/);
assert.match(config, /assertAiAppCheckFreezeMode/);

assert.match(runtimeSmoke, /crypto\.randomUUID\(\)/);
assert.match(runtimeSmoke, /debugTokens/);
assert.match(runtimeSmoke, /exchangeDebugToken/);
assert.match(runtimeSmoke, /CustomProvider/);
assert.match(runtimeSmoke, /getAppCheckToken/);
assert.match(runtimeSmoke, /deleteEphemeralDebugToken/);
assert.match(runtimeSmoke, /MAX_ATTEMPTS = 12/);
assert.match(runtimeSmoke, /clearTimeout\(timeoutId\)/);
assert.doesNotMatch(runtimeSmoke, /debugToken:\s*['"][A-Za-z0-9_-]{12,}['"]/);

const configure = workflow.indexOf('Configure App Check staging AI-only enforcement');
const prove = workflow.indexOf('Prove Firebase AI Logic generateContent runtime');
assert(configure >= 0 && prove > configure, 'AI-only App Check enforcement must precede real AI runtime proof');
assert.match(workflow, /TUTOP_ALLOW_AI_APP_CHECK_ENFORCEMENT: staging-ai-only/);
assert.match(workflow, /TUTOP_APP_CHECK_AI_MODE: ENFORCED/);
assert.match(workflow, /Verify final App Check service isolation/);

console.log('✅ TuTop 0.9.1 staging App Check AI-only + ephemeral CI debug-token contract PASS');
