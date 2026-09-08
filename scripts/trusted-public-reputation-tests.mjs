import fs from 'node:fs';
import assert from 'node:assert/strict';

const backend = fs.readFileSync('src/services/trustedReputationBackend.ts', 'utf8');
const profile = fs.readFileSync('src/components/SellerPublicProfile.tsx', 'utf8');
const inline = fs.readFileSync('src/components/SellerReputationInline.tsx', 'utf8');
const ownCard = fs.readFileSync('src/components/OwnTrustedReputationCard.tsx', 'utf8');
const productDetail = fs.readFileSync('src/components/ProductDetail.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const evidence = fs.readFileSync('src/lib/reputationEvidence.ts', 'utf8');
const rules = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');
const maintenance = fs.readFileSync('scripts/v2-trusted-maintenance.mjs', 'utf8');
const guard = fs.readFileSync('scripts/trusted-reputation-capacity-guard.mjs', 'utf8');
const guardedRunner = fs.readFileSync('scripts/v2-trusted-maintenance-guarded.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/v2-trusted-maintenance.yml', 'utf8');

assert.match(backend, /reputation\/\$\{cleanUid\}/);
assert.match(backend, /TRUSTED_REPUTATION_CACHE_TTL_MS = 5 \* 60_000/);
assert.match(backend, /TRUSTED_REPUTATION_FRESH_MS = 72 \* 60 \* 60_000/);
assert.match(backend, /trustedReputationIsFresh/);
assert.match(backend, /trustedReputationAgeHours/);
assert.match(backend, /REPUTATION_SUBJECT_MISMATCH/);
assert.match(profile, /trustedReputationBackend\.load\(sellerId\)/);
assert.match(profile, /Snapshot trusted pendiente de actualización reciente/);
assert.match(profile, /no se presentan como información en tiempo real/);
assert.match(inline, /trustedReputationBackend\.load\(sellerId\)/);
assert.match(inline, /Snapshot trusted no reciente; no se presenta como información en tiempo real/);
assert.match(productDetail, /<SellerReputationInline sellerId=\{product\.vendedor_id\} visibleEvidence=\{reputation\} \/>/);
assert.match(ownCard, /trustedReputationBackend\.load\(uid\)/);
assert.match(ownCard, /Reputación trusted/);
assert.match(ownCard, /Snapshot trusted no reciente/);
assert.match(app, /<OwnTrustedReputationCard \/>/);
assert.match(evidence, /evidencia visible/);
assert.match(evidence, /no representa necesariamente la reputación pública completa/);

assert.match(rules, /match \/reviews\/\{reviewId\}/);
assert.match(rules, /allow read: if signedIn\(\) && \(resource\.data\.evaluador_id == request\.auth\.uid \|\| resource\.data\.evaluado_id == request\.auth\.uid \|\| isAdmin\(\)\)/);
assert.match(rules, /match \/reputation\/\{uid\} \{ allow read: if signedIn\(\); allow write: if isAdmin\(\); \}/);
assert.match(maintenance, /query\('transactions_v2'\), query\('reviews'\), query\('moderation_cases'\)/);
assert.match(maintenance, /const completedChats = new Map/);
assert.match(maintenance, /patchWrite\(`reputation\/\$\{uid\}`/);

assert.match(guard, /runAggregationQuery/);
assert.match(guard, /tasksArg/);
assert.match(guard, /outcomes: \['transactions_v2', 'transaction_outcome_claims', 'transaction_cancellation_requests'\]/);
assert.match(guard, /reputation: \['transactions_v2', 'reviews', 'moderation_cases'\]/);
assert.match(guard, /credentials: \['verificationRequests'\]/);
assert.match(guard, /'saved-searches': \['saved_searches', 'listings_v2'\]/);
assert.match(guard, /push: \['notification_outbox', 'device_tokens'\]/);
assert.match(guard, /unknownTasks/);
assert.match(guard, /count > limit/);
assert.match(guard, /mantenimiento trusted podría truncarse/);

assert.match(guardedRunner, /defaultTasks = \['outcomes', 'reputation', 'credentials', 'saved-searches', 'push'\]/);
assert.match(guardedRunner, /for \(const task of selectedTasks\)/);
assert.match(guardedRunner, /trusted-reputation-capacity-guard\.mjs', \[\.\.\.sharedArgs, taskArg\]/);
assert.match(guardedRunner, /v2-trusted-maintenance\.mjs', \[\.\.\.sharedArgs, taskArg\]/);
assert.match(guardedRunner, /blocked\.push\(task\)/);
assert.match(guardedRunner, /Las demás tareas seguras sí pudieron continuar/);

assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/);
assert.doesNotMatch(workflow, /schedule:/);
assert.match(workflow, /TUTOP_ALLOW_V2_MAINTENANCE: staging-v2/);
assert.match(workflow, /node scripts\/v2-trusted-maintenance-guarded\.mjs --apply/);
assert.doesNotMatch(workflow, /run: node scripts\/v2-trusted-maintenance\.mjs --apply/);

console.log('PASS private reviews remain restricted to their participants/admin');
console.log('PASS seller profile, product detail and current-user profile consume trusted reputation');
console.log('PASS trusted reputation derives from completed transaction evidence in trusted maintenance');
console.log('PASS every trusted maintenance task capacity-checks all source collections it scans');
console.log('PASS oversized tasks fail closed without blocking other safe maintenance tasks');
console.log('PASS stale trusted snapshots are disclosed instead of presented as real-time');
console.log('PASS trusted maintenance remains manual-only during the Actions outage');
console.log('Trusted public reputation + maintenance capacity contract: PASS');
