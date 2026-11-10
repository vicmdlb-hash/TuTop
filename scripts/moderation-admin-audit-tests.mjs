import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summarizeModerationAdminInventory } from './moderation-admin-audit-lib.mjs';

function admin({ active = true, role = 'moderator', institution = '' } = {}) {
  return { document: {
    name: 'projects/demo/documents/admins/secret-synthetic-uid',
    fields: {
      active: { booleanValue: active },
      role: { stringValue: role },
      institution_id: { stringValue: institution },
      private_email: { stringValue: 'private@example.test' },
    },
  } };
}
const empty = summarizeModerationAdminInventory([{ readTime: 'synthetic' }]);
assert.equal(empty.admins_total, 0);
assert.equal(empty.first_admin_record_needed, true);
assert.equal(empty.structurally_valid_active_admin_present, false);
assert.equal(empty.human_identity_legitimacy_proven, false);

const valid = summarizeModerationAdminInventory([
  admin({ role: 'moderator' }), admin({ role: 'institution_moderator', institution: 'institution-1' }),
  admin({ active: false, role: 'unknown' }), { readTime: 'synthetic' },
]);
assert.equal(valid.admins_total, 3);
assert.equal(valid.active_admins, 2);
assert.equal(valid.active_valid_role_admins, 2);
assert.equal(valid.structurally_valid_active_admin_present, true);
assert.equal(valid.active_role_counts.institution_moderator, 1);
assert.equal(valid.human_identity_legitimacy_proven, false);
const serialized = JSON.stringify(valid);
assert(!serialized.includes('secret-synthetic-uid'));
assert(!serialized.includes('private@example.test'));

const badRole = summarizeModerationAdminInventory([admin(), admin({ role: 'bogus' })]);
assert.equal(badRole.active_invalid_role_admins, 1);
assert.equal(badRole.structurally_valid_active_admin_present, false);
const badInstitution = summarizeModerationAdminInventory([admin({ role: 'institution_moderator' })]);
assert.equal(badInstitution.active_institution_moderators_missing_scope, 1);
assert.equal(badInstitution.structurally_valid_active_admin_present, false);

assert.throws(() => summarizeModerationAdminInventory({ admins: [] }), /MODERATION_ADMIN_INVENTORY_INVALID/);
assert.throws(() => summarizeModerationAdminInventory([{ error: { code: 403 } }]), /MODERATION_ADMIN_INVENTORY_ERROR/);
assert.throws(() => summarizeModerationAdminInventory([{ document: { fields: null } }]), /MODERATION_ADMIN_DOCUMENT_INVALID/);
assert.throws(() => summarizeModerationAdminInventory([{ document: { fields: { role: { stringValue: 'moderator' } } } }]), /MODERATION_ADMIN_ACTIVE_FLAG_UNVERIFIED/);
assert.throws(() => summarizeModerationAdminInventory([{ document: { fields: { active: { stringValue: 'true' } } } }]), /MODERATION_ADMIN_ACTIVE_FLAG_UNVERIFIED/);
assert.equal(summarizeModerationAdminInventory(Array.from({ length: 999 }, () => admin({ active: false }))).admins_total, 999);
assert.throws(
  () => summarizeModerationAdminInventory(Array.from({ length: 1000 }, () => admin())),
  /MODERATION_ADMIN_INVENTORY_TRUNCATED/,
  'query reaching exactly its limit is not proof of a complete admin inventory',
);

const source = fs.readFileSync('scripts/audit-staging-moderation-identity.mjs', 'utf8');
assert.match(source, /STAGING_PROJECT_REQUIRED/);
assert.match(source, /GITHUB_ACTIONS_REQUIRED/);
assert.match(source, /firestore\.googleapis\.com/);
assert.match(source, /documents:runQuery/);
assert.match(source, /method: 'POST'/);
assert.match(source, /fields:\s*\[/);
assert.match(source, /summarizeModerationAdminInventory\(await response\.json\(\)\)/);
assert.doesNotMatch(source, /documents:commit|batchWrite|firebase:deploy|--apply|createAdmin|deleteAdmin|patchAdmin/i);
assert(source.indexOf('STAGING_PROJECT_REQUIRED') < source.indexOf('firebaseCiAccessToken()'));
assert(source.indexOf('GITHUB_ACTIONS_REQUIRED') < source.indexOf('firebaseCiAccessToken()'));
console.log('PASS moderation admin read-only audit: no PII, no silent truncation, no trusted-admin claim, fail-closed');
