import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nationalVerificationIndicators } from '../src/lib/nationalVerificationIndicators.ts';

const uid = 'uid-owner';
const trustedUser = {
  localId: uid,
  emailVerified: true,
  phoneNumber: '+522461234567',
};
assert.deepEqual(nationalVerificationIndicators(trustedUser, uid), {
  emailVerified: true, phoneVerified: true,
});

for (const untrusted of [
  null,
  undefined,
  { localId: uid, emailVerified: true, phone: '+522461234567' },
  { localId: uid, emailVerified: true, telefono: '+522461234567' },
  { localId: uid, emailVerified: true, phoneNumber: '2461234567' },
  { localId: uid, emailVerified: true, phoneNumber: '+12025550199' },
  { localId: uid, emailVerified: true, phoneNumber: '+5212461234567' },
  { localId: 'uid-other', emailVerified: true, phoneNumber: '+522461234567' },
  { localId: uid, emailVerified: 'true', phoneNumber: '+522461234567' },
]) {
  const result = nationalVerificationIndicators(untrusted, uid);
  assert.equal(result.emailVerified && result.phoneVerified, false,
    'untrusted record cannot establish both factors');
}
assert.deepEqual(nationalVerificationIndicators(trustedUser, 'uid-switched'), {
  emailVerified: false, phoneVerified: false,
});
assert.deepEqual(nationalVerificationIndicators(trustedUser, ''), {
  emailVerified: false, phoneVerified: false,
});
assert.deepEqual(nationalVerificationIndicators({
  localId: uid, emailVerified: false, phoneNumber: '+522461234567',
}, uid), { emailVerified: false, phoneVerified: true });
assert.deepEqual(nationalVerificationIndicators({
  localId: uid, emailVerified: true,
}, uid), { emailVerified: true, phoneVerified: false });

const auth = fs.readFileSync('src/services/verifiedEmailBetaAuth.ts', 'utf8');
const config = JSON.parse(fs.readFileSync('config/tutop-national-product-direction.json', 'utf8'));
const project = JSON.parse(fs.readFileSync('config/project.json', 'utf8'));
assert.match(auth, /identityRequest\('accounts:lookup'/);
assert.match(auth, /nationalVerificationIndicators\(user, stored.uid\)/);
assert.match(auth, /user.localId !== stored.uid/);
assert.match(auth, /phoneVerified: false/);
assert.equal(config.market.verificationMethod, 'VERIFIED_EMAIL_AND_VERIFIED_PHONE_SAME_FIREBASE_UID');
assert.equal(config.verification.publicRegistrationWithDualFactor, 'BLOCKED_UNTIL_REAL_PHONE_PROOF');
assert.equal(config.verification.smsSendingEnabled, false);
assert.equal(config.verification.billingUpgradeApproved, false);
assert.equal(config.release.releaseApproved, false);
assert.equal(project.productionPublishingAllowed, false);
assert.equal(project.billingAllowed, false);

console.log('PASS national verification indicators: same UID, Firebase Auth lookup, email + MX phone');
console.log('PASS negative cases: typed phone, legacy alias, foreign/old number, account switch');
console.log('PASS no real SMS, spend, server privilege, Firebase deploy, or release enabled');
