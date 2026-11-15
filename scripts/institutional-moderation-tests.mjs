import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canModerateItem, moderationQueueFor, requireModerationCaseTransition, requireNoShowClaimDecision } from '../src/lib/institutionalModeration.ts';

const items = [
  { id: 'uatx-urgent', institution_id: 'uatx', status: 'open', priority: 'urgent' },
  { id: 'uatx-normal', institution_id: 'uatx', status: 'reviewing', priority: 'normal' },
  { id: 'buap-high', institution_id: 'buap', status: 'open', priority: 'high' },
  { id: 'global-unknown', status: 'open', priority: 'urgent' },
  { id: 'closed', institution_id: 'uatx', status: 'resolved', priority: 'urgent' },
];

assert.equal(canModerateItem({ kind: 'global' }, items[2]), true);
assert.equal(canModerateItem({ kind: 'institution', institution_id: 'uatx' }, items[0]), true);
assert.equal(canModerateItem({ kind: 'institution', institution_id: 'uatx' }, items[2]), false);
assert.equal(canModerateItem({ kind: 'institution', institution_id: 'uatx' }, items[3]), false);

const uatx = moderationQueueFor({ kind: 'institution', institution_id: 'uatx' }, items);
assert.deepEqual(uatx.map((item) => item.id), ['uatx-urgent', 'uatx-normal']);

const global = moderationQueueFor({ kind: 'global' }, items);
assert.deepEqual(global.map((item) => item.id), ['uatx-urgent', 'global-unknown', 'buap-high', 'uatx-normal']);

console.log('PASS institution moderators see only their institution');
console.log('PASS unscoped reports stay out of institution queues');
console.log('PASS global moderation can see all active queues');
console.log('PASS queues prioritize urgent/high reports');
// Synthetic defense-in-depth: a caller may not write another institution or
// reopen/overwrite closed cases, even if the UI already filtered the queue.
const actor = (role, institution_id) => ({ active: true, role, institution_id });
const record = (kind, institution_id = 'uatx', status = 'open') =>
  ({ kind, institution_id, status });
const checkDeny = (reason, admin, item, status = 'resolved') =>
  assert.throws(() => requireModerationCaseTransition(admin, item, status),
    { message: reason });
assert.equal(requireModerationCaseTransition(actor('institution_moderator', 'uatx'),
  record('product'), 'reviewing'), 'uatx');
assert.equal(requireModerationCaseTransition(actor('verification_reviewer'),
  record('credential'), 'resolved'), 'uatx');
assert.equal(requireModerationCaseTransition(actor('support'),
  record('appeal', ''), 'dismissed'), undefined);
checkDeny('INSTITUTION_SCOPE_DENIED', actor('institution_moderator', 'uatx'),
  record('product', 'buap'));
checkDeny('INSTITUTION_SCOPE_DENIED', actor('institution_moderator', 'uatx'),
  record('product', ''));
checkDeny('ROLE_SCOPE_DENIED', actor('verification_reviewer'), record('product'));
checkDeny('ROLE_SCOPE_DENIED', actor('support'), record('user'));
checkDeny('ROLE_SCOPE_DENIED', actor('unknown'), record('credential'));
checkDeny('ADMIN_REQUIRED', { ...actor('moderator'), active: false }, record('product'));
checkDeny('MODERATION_CASE_KIND_INVALID', actor('moderator'), record('unknown'));
checkDeny('MODERATION_CASE_INVALID_TRANSITION', actor('moderator'),
  record('product', 'uatx', 'resolved'));
checkDeny('MODERATION_CASE_INVALID_TRANSITION', actor('moderator'),
  record('product', 'uatx', 'reviewing'), 'reviewing');
assert.equal(requireModerationCaseTransition(actor('trust_safety'),
  record('urgent_incident', ''), 'resolved'), undefined);

// Verify the privileged client wrapper actually invokes the policy check
// and uses a stored document version, rather than trusting a UI argument.
const backendSource = fs.readFileSync('src/services/scopedAdminBackend.ts', 'utf8');
const actionSection = backendSource.split('async resolveModerationCase(')[1]
  ?.split('async resolveReport(')[0];
assert(actionSection, 'moderation action wrapper must exist');
assert.match(actionSection, /requireModerationCaseTransition\(admin, current\.data, status\)/);
assert.match(actionSection, /MODERATION_CASE_VERSION_UNVERIFIED/);
assert.match(actionSection, /expectedUpdateTime: current\.updateTime/);
assert.match(actionSection, /const current = await firebase\.getDocument/);

// No-show cases are terminal once decided. Client arguments may not override
// the actual institution or write a case twice after another reviewer.
assert.equal(requireNoShowClaimDecision(actor('institution_moderator', 'uatx'),
  { status: 'open', institution_id: 'uatx' }, 'upheld'), 'uatx');
assert.equal(requireNoShowClaimDecision(actor('trust_safety'),
  { status: 'open' }, 'dismissed'), undefined);
const noShowDeny = (reason, admin, item, next = 'upheld') =>
  assert.throws(() => requireNoShowClaimDecision(admin, item, next),
    { message: reason });
noShowDeny('ROLE_SCOPE_DENIED', actor('support'), { status: 'open' });
noShowDeny('ROLE_SCOPE_DENIED', actor('verification_reviewer'), { status: 'open' });
noShowDeny('ADMIN_REQUIRED', { ...actor('moderator'), active: false },
  { status: 'open' });
noShowDeny('INSTITUTION_SCOPE_DENIED', actor('institution_moderator', 'uatx'),
  { status: 'open', institution_id: 'buap' });
noShowDeny('INSTITUTION_SCOPE_DENIED', actor('institution_moderator', 'uatx'),
  { status: 'open' });
noShowDeny('NO_SHOW_INVALID_TRANSITION', actor('moderator'),
  { status: 'upheld' });
noShowDeny('NO_SHOW_INVALID_TRANSITION', actor('moderator'),
  { status: 'dismissed' });
noShowDeny('NO_SHOW_INVALID_TRANSITION', actor('moderator'),
  { status: 'open' }, 'reviewing');
const noShowSection = backendSource.split('async resolveNoShowClaim(')[1]?.split('\n};')[0];
assert(noShowSection, 'no-show action wrapper must exist');
assert.match(noShowSection, /requireNoShowClaimDecision\(admin, current\.data, status\)/);
assert.match(noShowSection, /NO_SHOW_CLAIM_VERSION_UNVERIFIED/);
assert.match(noShowSection, /expectedUpdateTime: current\.updateTime/);

// Existing listing and account-erasure administrative writes must also be
// compare-and-swap, with the stored listing institution as the audit source.
const listingSection = backendSource.split('async moderateListing(')[1]
  ?.split('async updateAccountDeletionRequest(')[0];
assert(listingSection);
assert.match(listingSection, /LISTING_VERSION_UNVERIFIED/);
assert.match(listingSection, /expectedUpdateTime: listing\.updateTime/);
assert.match(listingSection, /institutionId: listingInstitution \|\| undefined/);
assert.doesNotMatch(listingSection, /institutionId: institutionId \|\| listingInstitution/);
const erasureSection = backendSource.split('async updateAccountDeletionRequest(')[1]
  ?.split('async resolveModerationCase(')[0];
assert(erasureSection);
assert.match(erasureSection, /ACCOUNT_DELETION_VERSION_UNVERIFIED/);
assert.match(erasureSection, /expectedUpdateTime: current\.updateTime/);
assert.match(erasureSection, /ACCOUNT_DELETION_INVALID_TRANSITION/);

console.log('Institutional moderation tests: PASS');
