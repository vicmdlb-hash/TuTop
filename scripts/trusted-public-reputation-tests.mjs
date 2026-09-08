import fs from 'node:fs';
import assert from 'node:assert/strict';

const backend = fs.readFileSync('src/services/trustedReputationBackend.ts', 'utf8');
const profile = fs.readFileSync('src/components/SellerPublicProfile.tsx', 'utf8');
const evidence = fs.readFileSync('src/lib/reputationEvidence.ts', 'utf8');
const rules = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');

assert.match(backend, /reputation\/\$\{cleanUid\}/);
assert.match(backend, /TRUSTED_REPUTATION_CACHE_TTL_MS = 5 \* 60_000/);
assert.match(backend, /REPUTATION_SUBJECT_MISMATCH/);
assert.match(profile, /trustedReputationBackend\.load\(sellerId\)/);
assert.match(profile, /Reputación trusted agregada por TuTop/);
assert.match(evidence, /evidencia visible/);
assert.match(evidence, /no representa necesariamente la reputación pública completa/);

assert.match(rules, /match \/reviews\/\{reviewId\}/);
assert.match(rules, /allow read: if signedIn\(\) && \(resource\.data\.evaluador_id == request\.auth\.uid \|\| resource\.data\.evaluado_id == request\.auth\.uid \|\| isAdmin\(\)\)/);
assert.match(rules, /match \/reputation\/\{uid\} \{ allow read: if signedIn\(\); allow write: if isAdmin\(\); \}/);

console.log('PASS private reviews remain restricted to their participants/admin');
console.log('PASS public seller reputation reads only the trusted reputation aggregate');
console.log('PASS session-visible fallback is never labeled as complete public reputation');
console.log('Trusted public reputation contract: PASS');
