import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync('config/tutop-national-product-direction.json', 'utf8'));
const project = JSON.parse(fs.readFileSync('config/project.json', 'utf8'));
const registration = fs.readFileSync('src/components/BackendGate.tsx', 'utf8');
const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx', 'utf8');
const recovery = fs.readFileSync('src/services/v2OnboardingRecovery.ts', 'utf8');
const accessRules = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');

assert.equal(policy.schemaVersion, 1);
assert.equal(policy.status, 'OWNER_DECISION_NOT_DEPLOYED');
assert.equal(policy.market.country, 'MX');
assert.equal(policy.market.national, true);
assert.equal(policy.market.accountVerificationRequired, true);
assert.equal(policy.market.institutionMembershipRequired, false);
assert.equal(policy.market.verificationMethod, 'TO_DEFINE_BEYOND_VERIFIED_EMAIL');
assert.equal(policy.audience.under13DirectChatAllowed, false);
assert.equal(policy.audience.under18PersonalInfoRequiresVerifiedAdultAction, true);
assert.equal(policy.audience.guardianCanRevokeImmediately, true);
assert.equal(policy.moderation.initialModeration, 'OWNER_ONLY');
assert.equal(policy.moderation.preApproveAllListings, true);
assert.equal(policy.ai.generativeRequiredForV1, false);
assert.equal(policy.ai.remoteProviderApproved, false);
assert.equal(policy.promotion.billingEnabled, false);
assert.equal(policy.release.billingBudgetMXN, 0);
assert.equal(policy.release.releaseApproved, false);
assert.equal(project.productionPublishingAllowed, false);
assert.equal(project.zeroInvestmentMode, true);
assert.equal(project.billingAllowed, false);

// A PRODUCT DECISION is not evidence of deployment. Document each active
// university-bound onboarding/publishing dependency instead of bypassing it
// with fake campus IDs or weakening Firestore Rules to allow everyone.
const blockers = [
  ['registration', registration.includes('Selecciona universidad y campus.')],
  ['national onboarding', recovery.includes('V2_REGISTRATION_IDENTITY_REQUIRED')],
  ['publication', publish.includes("publishIssues.push('universidad/campus')")],
  ['Firestore metadata', accessRules.includes('validUniversityMetadata(data)')],
].filter(([,blocked]) => blocked).map(([name]) => name);
assert(blockers.length >= 1, 'migration gate must be revisited after all legacy restrictions are removed');
console.log('PASS owner-confirmed nationwide scope recorded; STILL BLOCKED on ' + blockers.join(', '));
console.log('PASS zero-spend, no paid boosts, no underage bypass, no release approval');
