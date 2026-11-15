import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canModerateCase } from '../src/lib/marketplaceGovernance.ts';
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

// Regression: missing institution scope must never fall through to a global
// query. The actual Firestore security rules remain a separate server gate.
const reportsQuery = backendSource.split('async reports(')[1]
  ?.split('async noShowClaims(')[0];
const claimsQuery = backendSource.split('async noShowClaims(')[1]
  ?.split('async auditLog(')[0];
const auditQuery = backendSource.split('async auditLog(')[1]
  ?.split('async moderateListing(')[0];
for (const [name, query] of [['reports', reportsQuery], ['claims', claimsQuery]]) {
  assert(query, name + ' query must exist');
  assert.match(query, /admin\.role === 'institution_moderator' && !admin\.institution_id\?\.trim\(\)/);
  assert.match(query, /INSTITUTION_SCOPE_REQUIRED/);
  assert.match(query, /field: 'institution_id', op: 'EQUAL'/);
}
assert(auditQuery, 'audit query must exist');
assert.match(auditQuery, /if \(admin\.role === 'institution_moderator'\) \{/);
assert.match(auditQuery, /if \(!admin\.institution_id\?\.trim\(\)\) throw new Error\('INSTITUTION_SCOPE_REQUIRED'\)/);
assert.match(auditQuery, /field: 'institution_id', op: 'EQUAL', value: admin\.institution_id/);
assert.doesNotMatch(auditQuery, /if \(admin\.role === 'institution_moderator' && admin\.institution_id\)/);
console.log('PASS missing institutional scope cannot request cross-institution admin queues');

// The V2 template is intentionally permissive input to a fail-closed
// generator; release security must be checked in the generated-policy source.
const firestoreTemplate = fs.readFileSync('firebase/firestore.v2.rules', 'utf8');
const prepareGenerator = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs', 'utf8');
assert(firestoreTemplate.includes("match /moderation_cases/{caseId} { allow read, write: if isAdmin(); }"));
assert(prepareGenerator.includes("requireOnce(generated, permissiveModeration, 'moderation_cases permisivo')"));
const auditGenerator = prepareGenerator.split("  '    match /audit_log/{entryId} {'")[1]
  ?.split("  'audit log scope',")[0];
assert(auditGenerator, 'audit_log generator transform must exist');
assert(auditGenerator.includes("allow read: if globalModerationAdmin() || institutionModeratorFor(resource.data);"));
assert(auditGenerator.includes("institutionModeratorFor(request.resource.data)"));
console.log('PASS audit least-privilege transform is present in V2 generator');

// Role separation must agree with marketplaceGovernance.canModerateCase.
checkDeny('ROLE_SCOPE_DENIED', actor('moderator'), record('credential'));
checkDeny('ROLE_SCOPE_DENIED', actor('institution_moderator', 'uatx'), record('credential'));
assert.equal(requireModerationCaseTransition(actor('moderator'), record('chat'), 'resolved'), 'uatx');
assert.equal(requireModerationCaseTransition(actor('verification_reviewer'), record('credential'), 'resolved'), 'uatx');

// The generator, not its input template, owns the actual V2 rules used by
// the emulator. These contracts guard strict role-scoped output construction.
const reportTransform = prepareGenerator.split("  '    match /reports/{reportId} {'").at(-1)
  ?.split("  'reports institutional scope',")[0];
const moderationOutput = prepareGenerator.split('const strictModerationAndPrivacy = `')[1]
  ?.split('`;' + '\n' + 'requireOnce(generated, permissiveModeration')[0];
assert(reportTransform, 'reports scoped rule transformer must exist');
assert(moderationOutput, 'generated moderation rules must exist');
assert(reportTransform.includes("canModerateInstitution(resource.data)"));
assert(reportTransform.includes("resource.data.status in ['open','reviewing']"));
assert(reportTransform.includes("request.resource.data.status != resource.data.status"));
assert(moderationOutput.includes("allow read: if canHandleModerationCase(resource.data)"));
assert(moderationOutput.includes("allow create: if canDecideModerationCase(request.resource.data)"));
assert(moderationOutput.includes("allow update: if canDecideModerationCase(resource.data)"));
assert(moderationOutput.includes("resource.data.status in ['open','reviewing']"));
assert(moderationOutput.includes("request.resource.data.status != resource.data.status"));
assert(moderationOutput.includes("allow delete: if false;"));
assert(prepareGenerator.includes("function canDecideModerationCase(data)"));
assert(prepareGenerator.includes("institutionModeratorFor(data) && ('kind' in data) && data.kind != 'credential'"));
console.log('PASS generated moderation/report Rules role and transition contracts');

// Frontend must not advertise impossible moderation decisions or hide failed
// security reads behind an apparently empty queue. The backend remains the gate.
const sampleCredential = {
  id: 'cred1', kind: 'credential', institution_id: 'uatx',
  priority: 'high', status: 'open',
};
assert.equal(canModerateCase(actor('moderator'), sampleCredential), false);
assert.equal(canModerateCase(actor('institution_moderator', 'uatx'), sampleCredential), false);
assert.equal(canModerateCase(actor('verification_reviewer'), sampleCredential), true);
assert.equal(canModerateCase(actor('support'), sampleCredential), false);
assert.equal(canModerateCase(actor('support'), { ...sampleCredential, kind: 'appeal' }), true);
assert.equal(canModerateCase(actor('institution_moderator', 'uatx'),
  { ...sampleCredential, kind: 'product' }), true);

const moderationDashboard = fs.readFileSync('src/admin/ScopedModerationDashboard.tsx', 'utf8');
const caseCard = moderationDashboard.split('function CaseCard(')[1];
assert(caseCard, 'dashboard must render case cards');
assert.match(moderationDashboard, /canModerateCase\(context,/);
assert.match(moderationDashboard, /failedSections\.length\) setError/);
assert.match(moderationDashboard, /No se pudo verificar la cola completa/);
assert.doesNotMatch(moderationDashboard, /\.catch\(\(\) => \[\]\)/);
assert.match(caseCard, /!closed && canDecide/);
assert.match(caseCard, /!closed && !canDecide/);
console.log('PASS admin queue failures are visible and unauthorized actions are read-only');

console.log('Institutional moderation tests: PASS');
