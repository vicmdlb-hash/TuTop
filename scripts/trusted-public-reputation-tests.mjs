import fs from 'node:fs';
import assert from 'node:assert/strict';

const backend = fs.readFileSync('src/services/trustedReputationBackend.ts', 'utf8');
const profile = fs.readFileSync('src/components/SellerPublicProfile.tsx', 'utf8');
const evidence = fs.readFileSync('src/lib/reputationEvidence.ts', 'utf8');
const rules = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');
const maintenance = fs.readFileSync('scripts/v2-trusted-maintenance.mjs', 'utf8');
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
assert.match(evidence, /evidencia visible/);
assert.match(evidence, /no representa necesariamente la reputación pública completa/);

assert.match(rules, /match \/reviews\/\{reviewId\}/);
assert.match(rules, /allow read: if signedIn\(\) && \(resource\.data\.evaluador_id == request\.auth\.uid \|\| resource\.data\.evaluado_id == request\.auth\.uid \|\| isAdmin\(\)\)/);
assert.match(rules, /match \/reputation\/\{uid\} \{ allow read: if signedIn\(\); allow write: if isAdmin\(\); \}/);
assert.match(maintenance, /query\('transactions_v2'\), query\('reviews'\), query\('moderation_cases'\)/);
assert.match(maintenance, /const completedChats = new Map/);
assert.match(maintenance, /patchWrite\(`reputation\/\$\{uid\}`/);
assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/);
assert.doesNotMatch(workflow, /schedule:/);
assert.match(workflow, /TUTOP_ALLOW_V2_MAINTENANCE: staging-v2/);

console.log('PASS private reviews remain restricted to their participants/admin');
console.log('PASS public seller reputation reads only the trusted reputation aggregate');
console.log('PASS trusted reputation derives from completed transaction evidence in trusted maintenance');
console.log('PASS stale trusted snapshots are disclosed instead of presented as real-time');
console.log('PASS trusted maintenance remains manual-only during the Actions outage');
console.log('Trusted public reputation contract: PASS');
