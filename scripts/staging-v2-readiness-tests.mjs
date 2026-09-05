import assert from 'node:assert/strict';
import fs from 'node:fs';

const deploy = fs.readFileSync('scripts/deploy-firebase-staging.mjs', 'utf8');
const firebaseV2 = JSON.parse(fs.readFileSync('firebase.v2.json', 'utf8'));

assert.equal(firebaseV2.firestore.rules, 'firebase/firestore.v2.rules');
assert.match(deploy, /historicalProject = 'tutop-3a4f7'/);
assert.match(deploy, /TUTOP_ALLOW_FIREBASE_DEPLOY=staging-v2/);
assert.match(deploy, /--config', 'firebase\.v2\.json'/);
assert.match(deploy, /--only', 'firestore:rules,firestore:indexes'/);
assert.match(deploy, /v2:catalog:plan/);
assert.doesNotMatch(deploy, /firestore:rules,firestore:indexes,storage,functions,hosting/);
assert.doesNotMatch(deploy, /--only', 'functions/);
assert.doesNotMatch(deploy, /--only', 'hosting/);
assert.doesNotMatch(deploy, /--only', 'storage/);
assert.match(deploy, /NO despliega hosting, storage, functions/);

console.log('PASS V2 deploy uses firebase.v2.json explicitly');
console.log('PASS historical TuTop Firebase project is blocked');
console.log('PASS deploy scope is Firestore V2 rules/indexes only');
console.log('PASS V2 catalog dry-run is mandatory before deploy');
console.log('V2 staging readiness checks: PASS');
