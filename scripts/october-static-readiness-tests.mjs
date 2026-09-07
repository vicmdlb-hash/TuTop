import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const app = fs.readFileSync('src/App.tsx', 'utf8');
const campus = fs.readFileSync('src/components/UniversityNetworkSetup.tsx', 'utf8');
const demand = fs.readFileSync('src/components/DemandRequestComposer.tsx', 'utf8');
const assistant = fs.readFileSync('src/services/assistantProvider.ts', 'utf8');
const recovery = fs.readFileSync('src/services/recoveryProviderAdapter.ts', 'utf8');
const securePlan = fs.readFileSync('docs/ANDROID_SECURE_SESSION_STORAGE_PLAN_0.9.md', 'utf8');
const performance = fs.readFileSync('src/lib/performanceBudget.ts', 'utf8');

// UX: campus + Busco belong to normal layout, never floating above feed/search.
assert.match(app, /Acciones de comunidad/);
assert.doesNotMatch(campus, /fixed right-3 top-/);
assert.doesNotMatch(demand, /fixed left-3 top-/);
assert.match(campus, /w-full/);
assert.match(demand, /w-full/);

// Topi 0.9: deterministic and zero-cost.
assert.doesNotMatch(assistant, /VITE_TUTOP_AI_ENDPOINT|remoteCopilot|\bfetch\s*\(/);
assert.match(assistant, /source: 'local'/);

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

// UATx is allowed as catalog data, never as a UI/runtime default elsewhere in src/.
const allowedUatx = new Set(['src/lib/universityNetwork.ts']);
const offenders = walk('src')
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => !allowedUatx.has(file.replaceAll('\\', '/')))
  .filter((file) => /\bUATx\b|Universidad Autónoma de Tlaxcala|Turismo Internacional/.test(fs.readFileSync(file, 'utf8')));
assert.deepEqual(offenders, [], `Hardcodes universitarios fuera del catálogo: ${offenders.join(', ')}`);

console.log('PASS feed utilities no longer overlap search/campus');
console.log('PASS Topi remains local-only and zero-cost');
console.log('PASS recovery remains trusted-backend/fail-closed');
console.log('PASS Android secure-storage migration contract remains Keystore-backed');
console.log('PASS beta network/read budgets remain bounded');
console.log('PASS no UATx/program hardcodes remain outside the national catalog');
console.log('October static readiness: PASS');
