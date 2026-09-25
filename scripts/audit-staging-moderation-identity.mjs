import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const PROJECT = 'tutop-beta-vicmdlb-1356585881';
const ROLES = ['super_admin','trust_safety','moderator','institution_moderator','verification_reviewer','support'];

if (String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim() !== PROJECT) {
  throw new Error('STAGING_PROJECT_REQUIRED');
}
if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('GITHUB_ACTIONS_REQUIRED');
}

const token = await firebaseCiAccessToken();
const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
const response = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Goog-User-Project': PROJECT,
  },
  body: JSON.stringify({
    structuredQuery: {
      select: {
        fields: [
          { fieldPath: 'active' },
          { fieldPath: 'role' },
          { fieldPath: 'institution_id' },
        ],
      },
      from: [{ collectionId: 'admins' }],
      limit: 1000,
    },
  }),
});
if (!response.ok) throw new Error(`MODERATION_AUDIT_HTTP_${response.status}`);

const rows = await response.json();
const counts = Object.fromEntries(ROLES.map((role) => [role, 0]));
let adminsTotal = 0;
let activeAdmins = 0;
let activeValidRoleAdmins = 0;
let activeInvalidRoleAdmins = 0;
let activeInstitutionModeratorsMissingScope = 0;

for (const row of Array.isArray(rows) ? rows : []) {
  const doc = row?.document;
  if (!doc) continue;
  adminsTotal += 1;
  const fields = doc.fields || {};
  const active = fields.active?.booleanValue === true;
  if (!active) continue;
  activeAdmins += 1;
  const role = String(fields.role?.stringValue || '').trim();
  const institutionId = String(fields.institution_id?.stringValue || '').trim();
  if (!ROLES.includes(role)) {
    activeInvalidRoleAdmins += 1;
    continue;
  }
  counts[role] += 1;
  activeValidRoleAdmins += 1;
  if (role === 'institution_moderator' && !institutionId) {
    activeInstitutionModeratorsMissingScope += 1;
  }
}

const structurallyValidActiveAdminPresent =
  activeValidRoleAdmins > 0 &&
  activeInvalidRoleAdmins === 0 &&
  activeInstitutionModeratorsMissingScope === 0;

console.log(JSON.stringify({
  status: 'PASS',
  project_id: PROJECT,
  mutation: false,
  pii_logged: false,
  admins_total: adminsTotal,
  active_admins: activeAdmins,
  active_valid_role_admins: activeValidRoleAdmins,
  active_invalid_role_admins: activeInvalidRoleAdmins,
  active_institution_moderators_missing_scope: activeInstitutionModeratorsMissingScope,
  active_role_counts: counts,
  first_admin_record_needed: activeAdmins === 0,
  structurally_valid_active_admin_present: structurallyValidActiveAdminPresent,
  human_identity_legitimacy_proven: false,
}, null, 2));
console.log('PASS staging moderation identity audit completed read-only; no UID/email/document path emitted.');
