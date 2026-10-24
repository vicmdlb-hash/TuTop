import assert from 'node:assert/strict';
import { decideCapability } from '../src/lib/guardianCapabilities.ts';

const nowMs = 1_760_000_000_000;
const age = (band, extras = {}) => ({
  subjectUid: 'child', band, issuer: 'trusted_server',
  expiresAtMs: nowMs + 60_000, revoked: false, ...extras,
});
const guardian = (caps, extras = {}) => ({
  childUid: 'child', guardianUid: 'adult-guardian', issuer: 'trusted_server',
  active: true, expiresAtMs: nowMs + 60_000,
  consentVersion: 'v1', approvedCapabilities: caps, ...extras,
});
const check = (capability, band, opts = {}) => decideCapability({
  uid: 'child', capability, age: age(band), nowMs, ...opts,
});
const denied = (decision, why) => {
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, why);
};

denied(check('direct_chat', 'unknown'), 'age_unverified');
denied(check('publish_listing', 'adult', { age: null }), 'age_unverified');
denied(check('direct_chat', 'adult', { age: age('adult', { revoked: true }) }), 'age_unverified');
denied(check('browse_approved', 'adult', { age: age('adult', { expiresAtMs: nowMs }) }), 'age_unverified');
denied(check('direct_chat', 'adult', { age: age('adult', { subjectUid: 'other' }) }), 'age_unverified');
denied(check('publish_listing', 'under_13'), 'guardian_missing');
denied(check('publish_listing', 'under_13', { guardian: guardian(['publish_listing'], { active: false }) }), 'guardian_missing');
denied(check('publish_listing', 'under_13', { guardian: guardian(['publish_listing'], { childUid: 'other' }) }), 'guardian_missing');
denied(check('publish_listing', 'under_13', { guardian: guardian(['browse_approved']) }), 'guardian_missing');
assert.equal(check('publish_listing', 'under_13', { guardian: guardian(['publish_listing']) }).allowed, true);
denied(check('direct_chat', 'under_13', { guardian: guardian(['direct_chat']) }), 'age_restricted');
denied(check('share_personal_info', 'under_13', { guardian: guardian(['share_personal_info']), adultActionForPersonalInfo: true }), 'age_restricted');
denied(check('precise_location', 'under_13', { guardian: guardian(['precise_location']) }), 'age_restricted');
assert.equal(check('direct_chat', 'teen_13_17').allowed, true);
denied(check('share_personal_info', 'teen_13_17'), 'requires_guardian_action');
assert.equal(check('share_personal_info', 'teen_13_17', { adultActionForPersonalInfo: true }).allowed, true);
denied(check('precise_location', 'teen_13_17'), 'age_restricted');
denied(check('topi_generative', 'adult'), 'topi_runtime_unapproved');
denied(check('topi_generative', 'adult', { topi: { approved: true, issuer: 'trusted_server', audience: 'adults_only' } }), 'topi_runtime_unapproved');
denied(check('topi_generative', 'under_13', { guardian: guardian(['topi_generative']) }), 'topi_runtime_unapproved');
assert.equal(check('topi_generative', 'under_13', {
  guardian: guardian(['topi_generative']),
  topi: { approved: true, issuer: 'trusted_server', audience: 'all_ages' },
}).allowed, true);
console.log('PASS 21 all-ages capability decisions (source contract only; backend enforcement pending)');
