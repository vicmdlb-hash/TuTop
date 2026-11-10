// Pure, source-only moderation-admin inventory summary. No Auth, Firebase or I/O.
// Do not expose document paths, email addresses or raw UID in logs.
const ALLOWED_ROLES = Object.freeze([
  'super_admin', 'trust_safety', 'moderator',
  'institution_moderator', 'verification_reviewer', 'support',
]);
const PAGE_CAP = 1000;

export function summarizeModerationAdminInventory(rows) {
  if (!Array.isArray(rows)) throw new Error('MODERATION_ADMIN_INVENTORY_INVALID');
  const counts = Object.fromEntries(ALLOWED_ROLES.map((role) => [role, 0]));
  let adminsTotal = 0;
  let activeAdmins = 0;
  let activeValidRoleAdmins = 0;
  let activeInvalidRoleAdmins = 0;
  let activeInstitutionModeratorsMissingScope = 0;
  for (const row of rows) {
    if (row?.error || (row && typeof row !== 'object')) {
      throw new Error('MODERATION_ADMIN_INVENTORY_ERROR');
    }
    const doc = row?.document;
    if (!doc) continue; // Firestore may include a readTime-only terminal row.
    if (!doc.fields || typeof doc.fields !== 'object') {
      throw new Error('MODERATION_ADMIN_DOCUMENT_INVALID');
    }
    adminsTotal += 1;
    // A capped query must never be mistaken for a complete inventory.
    if (adminsTotal >= PAGE_CAP) throw new Error('MODERATION_ADMIN_INVENTORY_TRUNCATED');
    const fields = doc.fields;
    // Missing/malformed active status cannot justify saying there is no admin.
    if (typeof fields.active?.booleanValue !== 'boolean') {
      throw new Error('MODERATION_ADMIN_ACTIVE_FLAG_UNVERIFIED');
    }
    if (!fields.active.booleanValue) continue;
    activeAdmins += 1;
    const role = typeof fields.role?.stringValue === 'string' ? fields.role.stringValue.trim() : '';
    const institutionId = typeof fields.institution_id?.stringValue === 'string'
      ? fields.institution_id.stringValue.trim() : '';
    if (!ALLOWED_ROLES.includes(role)) {
      activeInvalidRoleAdmins += 1;
      continue;
    }
    counts[role] += 1;
    activeValidRoleAdmins += 1;
    if (role === 'institution_moderator' && !institutionId) {
      activeInstitutionModeratorsMissingScope += 1;
    }
  }
  return {
    admins_total: adminsTotal,
    active_admins: activeAdmins,
    active_valid_role_admins: activeValidRoleAdmins,
    active_invalid_role_admins: activeInvalidRoleAdmins,
    active_institution_moderators_missing_scope: activeInstitutionModeratorsMissingScope,
    active_role_counts: counts,
    first_admin_record_needed: activeAdmins === 0,
    structurally_valid_active_admin_present: activeValidRoleAdmins > 0
      && activeInvalidRoleAdmins === 0 && activeInstitutionModeratorsMissingScope === 0,
    // Structural metadata is not human authorization, legal age or identity proof.
    human_identity_legitimacy_proven: false,
  };
}
