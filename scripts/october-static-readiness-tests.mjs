import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function executableSource(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const app = fs.readFileSync('src/App.tsx', 'utf8');
const campus = fs.readFileSync('src/components/UniversityNetworkSetup.tsx', 'utf8');
const demand = fs.readFileSync('src/components/DemandRequestComposer.tsx', 'utf8');
const assistant = fs.readFileSync('src/services/assistantProvider.ts', 'utf8');
const envExample = fs.readFileSync('.env.example', 'utf8');
const recovery = fs.readFileSync('src/services/recoveryProviderAdapter.ts', 'utf8');
const securePlan = fs.readFileSync('docs/ANDROID_SECURE_SESSION_STORAGE_PLAN_0.9.md', 'utf8');
const performance = fs.readFileSync('src/lib/performanceBudget.ts', 'utf8');

// UX: campus + Busco belong to normal layout, never floating above feed/search.
assert.match(app, /Acciones de comunidad/);
assert.doesNotMatch(campus, /fixed right-3 top-/);
assert.doesNotMatch(demand, /fixed left-3 top-/);
assert.match(campus, /w-full/);
assert.match(demand, /w-full/);

// Topi 0.9.1: local-first/$0, with an optional TuTop-owned HTTPS proxy. The
// provider secret must never enter Vite/client configuration and failures fall back locally.
assert.match(assistant, /TOPI_PERSONA/);
assert.match(assistant, /source: 'local'/);
assert.match(assistant, /VITE_TUTOP_TOPI_REMOTE_ENABLED/);
assert.match(assistant, /VITE_TUTOP_TOPI_ENDPOINT/);
assert.match(assistant, /backend proxy/i);
assert.match(assistant, /return remote \|\| localTopi\(action, context\)/);
assert.match(assistant, /\^https:\\\/\\\//);
assert.doesNotMatch(assistant, /VITE_TUTOP_AI_ENDPOINT|remoteCopilot/);
assert.doesNotMatch(assistant, /authorization['"]?\s*:/i);
assert.doesNotMatch(envExample, /OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|PROVIDER_API_KEY/i);
assert.match(envExample, /VITE_TUTOP_TOPI_REMOTE_ENABLED=false/);

// Recovery: runtime must remain fail-closed until a verified trusted channel exists.
assert.match(recovery, /class DisabledRecoveryAdapter/);
assert.match(recovery, /return disabled/);
assert.match(recovery, /trusted_backend_only/);

// Android secrets: plan must require real Keystore-backed encryption, not Preferences theater.
for (const marker of ['Android Keystore', 'AES-GCM', 'fail-closed', 'migrateLegacy', 'no token en logs']) {
  assert.match(securePlan.toLowerCase(), new RegExp(marker.toLowerCase().replace('-', '[- ]?')));
}
assert.match(securePlan, /No usar `@capacitor\/preferences` como solución de seguridad/);

// Cost budget remains intentionally small for beta.
assert.match(performance, /feed_page_size:\s*24/);
assert.match(performance, /search_page_size:\s*24/);
assert.match(performance, /max_cached_feed_items:\s*80/);
assert.match(performance, /network_retry_limit:\s*4/);

// UATx is allowed as catalog data, never as executable UI/runtime defaults elsewhere in src/.
// Comments/documentation are intentionally ignored so migration notes cannot create false positives.
const allowedUatx = new Set(['src/lib/universityNetwork.ts']);
const offenders = walk('src')
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => !allowedUatx.has(file.replaceAll('\\', '/')))
  .filter((file) => /\bUATx\b|Universidad Autónoma de Tlaxcala|Turismo Internacional/.test(executableSource(fs.readFileSync(file, 'utf8'))));
assert.deepEqual(offenders, [], `Hardcodes universitarios ejecutables fuera del catálogo: ${offenders.join(', ')}`);

console.log('PASS feed utilities no longer overlap search/campus');
console.log('PASS Topi is local-first/$0 and any remote model is isolated behind a secret-free HTTPS TuTop proxy');
console.log('PASS recovery remains trusted-backend/fail-closed');
console.log('PASS Android secure-storage migration contract remains Keystore-backed');
console.log('PASS beta network/read budgets remain bounded');
console.log('PASS no executable UATx/program hardcodes remain outside the national catalog');
console.log('October static readiness: PASS');
