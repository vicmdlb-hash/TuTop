import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canModerateItem, moderationQueueFor, requireModerationCaseTransition } from '../src/lib/institutionalModeration.ts';

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

console.log('Institutional moderation tests: PASS');
