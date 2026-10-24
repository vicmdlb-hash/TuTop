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
denied(check('publish_listing', 'under_13', { guardian: guardian(['publish_listing'], { expiresAtMs: nowMs }) }), 'guardian_missing');
denied(check('publish_listing', 'under_13', { guardian: guardian(['publish_listing'], { issuer: 'client' }) }), 'guardian_missing');
assert.equal(check('publish_listing', 'under_13', { guardian: guardian(['publish_listing']) }).allowed, true);
denied(check('direct_chat', 'under_13', { guardian: guardian(['direct_chat']) }), 'age_restricted');
denied(check('share_personal_info', 'under_13', { guardian: guardian(['share_personal_info']), adultAction: { subjectUid: 'child', actorUid: 'guardian', capability: 'share_personal_info', issuer: 'trusted_server', authorized: true, expiresAtMs: nowMs + 60_000 } }), 'age_restricted');
denied(check('precise_location', 'under_13', { guardian: guardian(['precise_location']) }), 'age_restricted');
assert.equal(check('direct_chat', 'teen_13_17').allowed, true);
denied(check('share_personal_info', 'teen_13_17'), 'requires_guardian_action');
denied(check('share_personal_info', 'teen_13_17', { adultAction: {
  subjectUid: 'other', actorUid: 'guardian', capability: 'share_personal_info',
  issuer: 'trusted_server', authorized: true, expiresAtMs: nowMs + 60_000,
} }), 'requires_guardian_action');
const adultAction = (extras = {}) => ({
  subjectUid: 'child', actorUid: 'adult-guardian',
  capability: 'share_personal_info', issuer: 'trusted_server',
  authorized: true, expiresAtMs: nowMs + 60_000, ...extras,
});
assert.equal(check('share_personal_info', 'teen_13_17', { adultAction: adultAction() }).allowed, true);
denied(check('share_personal_info', 'teen_13_17', { adultAction: adultAction({ expiresAtMs: nowMs }) }), 'requires_guardian_action');
denied(check('share_personal_info', 'teen_13_17', { adultAction: adultAction({ authorized: false }) }), 'requires_guardian_action');
denied(check('share_personal_info', 'teen_13_17', { adultAction: adultAction({ actorUid: 'child' }) }), 'requires_guardian_action');
denied(check('share_personal_info', 'teen_13_17', { adultAction: adultAction({ issuer: 'client' }) }), 'requires_guardian_action');
denied(check('share_personal_info', 'teen_13_17', { adultAction: adultAction({ capability: 'direct_chat' }) }), 'requires_guardian_action');
denied(check('precise_location', 'teen_13_17'), 'age_restricted');
denied(check('topi_generative', 'adult'), 'topi_runtime_unapproved');
denied(check('topi_generative', 'adult', { topi: { approved: true, issuer: 'trusted_server', audience: 'adults_only' } }), 'topi_runtime_unapproved');
denied(check('topi_generative', 'under_13', { guardian: guardian(['topi_generative']) }), 'topi_runtime_unapproved');
assert.equal(check('topi_generative', 'under_13', {
  guardian: guardian(['topi_generative']),
  topi: { approved: true, issuer: 'trusted_server', audience: 'all_ages' },
}).allowed, true);

// Untrusted runtime JSON must not turn strings, absent fields or unknown
// capability names into approval. These tests are synthetic only.
denied(check('not_registered_capability', 'adult'), 'capability_unknown');
denied(check('not_registered_capability', 'teen_13_17'), 'capability_unknown');
denied(check('browse_approved', 'adult', { age: age('adult', { revoked: 'false' }) }), 'age_unverified');
denied(check('browse_approved', 'adult', { age: age('malformed_band') }), 'age_unverified');
denied(check('browse_approved', 'adult', { age: age('adult', { expiresAtMs: '9999999999999' }) }), 'age_unverified');
denied(check('browse_approved', 'adult', { uid: {} }), 'age_unverified');
denied(check('publish_listing', 'under_13', { guardian: guardian(['publish_listing'], { active: 'true' }) }), 'guardian_missing');
denied(check('publish_listing', 'under_13', { guardian: guardian(['publish_listing'], { consentVersion: null }) }), 'guardian_missing');
denied(check('publish_listing', 'under_13', { guardian: guardian('publish_listing') }), 'guardian_missing');
denied(check('publish_listing', 'under_13', { guardian: guardian(null) }), 'guardian_missing');
denied(check('publish_listing', 'under_13', { guardian: guardian(['publish_listing'], { guardianUid: {} }) }), 'guardian_missing');
denied(check('publish_listing', 'under_13', { guardian: guardian(['publish_listing'], { guardianUid: '  ' }) }), 'guardian_missing');
denied(check('topi_generative', 'adult', {
  topi: { audience: 'all_ages', approved: 'true', issuer: 'trusted_server' },
}), 'topi_runtime_unapproved');
denied(check('share_personal_info', 'teen_13_17', {
  adultAction: adultAction({ authorized: 'true' }),
}), 'requires_guardian_action');
denied(check('share_personal_info', 'teen_13_17', {
  adultAction: adultAction({ actorUid: {} }),
}), 'requires_guardian_action');
denied(check('share_personal_info', 'teen_13_17', {
  adultAction: adultAction({ actorUid: '  ' }),
}), 'requires_guardian_action');
console.log('PASS guardian strict runtime-proof rejection cases (synthetic; backend authority still pending)');
