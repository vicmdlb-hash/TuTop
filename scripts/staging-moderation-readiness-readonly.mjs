import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const REQUIRED = 'tutop-beta-vicmdlb-1356585881';
if (projectId !== REQUIRED) throw new Error(`MODERATION_READINESS_PROJECT_MISMATCH:${projectId || 'missing'}`);

const token = await firebaseCiAccessToken();
const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId };

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`READ_ONLY_FIRESTORE_${response.status}:${text.slice(0, 300)}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function stringField(doc, key) {
  return String(doc?.fields?.[key]?.stringValue || '').trim();
}

function boolField(doc, key) {
  return doc?.fields?.[key]?.booleanValue === true;
}

async function listAll(collection, pageSize = 500) {
  const out = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: String(Math.max(1, Math.min(1000, pageSize))) });
    if (pageToken) query.set('pageToken', pageToken);
    const raw = await request(`${base}/${collection}?${query}`, { method: 'GET' });
    out.push(...(raw?.documents || []));
    pageToken = String(raw?.nextPageToken || '');
  } while (pageToken);
  return out;
}

// Firestore runQuery uses POST transport but is read-only.
async function countPendingListings(limit = 500) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'listings_v2' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'moderation_status' },
          op: 'EQUAL',
          value: { stringValue: 'pending' },
        },
      },
      limit: Math.max(1, Math.min(1000, limit)),
    },
  };
  const rows = await request(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return (Array.isArray(rows) ? rows : []).filter((row) => row?.document).length;
}

const admins = await listAll('admins', 500);
const allowedModerationRoles = new Set(['super_admin', 'trust_safety', 'moderator', 'institution_moderator']);
const roleCounts = {};
let activeAdmins = 0;
let activeModerators = 0;
let activeInstitutionModeratorsWithoutScope = 0;

for (const doc of admins) {
  const role = stringField(doc, 'role') || 'missing_role';
  roleCounts[role] = (roleCounts[role] || 0) + 1;
  if (!boolField(doc, 'active')) continue;
  activeAdmins += 1;
  if (allowedModerationRoles.has(role)) {
    activeModerators += 1;
    if (role === 'institution_moderator' && !stringField(doc, 'institution_id')) {
      activeInstitutionModeratorsWithoutScope += 1;
    }
  }
}

const pendingListingsSampleCount = await countPendingListings(500);
const summary = {
  project_id: projectId,
  read_only: true,
  admin_documents_total: admins.length,
  active_admins_total: activeAdmins,
  active_moderation_admins_total: activeModerators,
  active_institution_moderators_missing_scope: activeInstitutionModeratorsWithoutScope,
  role_counts: roleCounts,
  pending_listings_sample_count: pendingListingsSampleCount,
  proves: {
    active_admin_inventory: activeModerators > 0,
    pending_queue_exists_if_count_positive: pendingListingsSampleCount > 0,
  },
  does_not_prove: [
    'client Rules access as a real admin session',
    'pending->approved mutation',
    'audit_log mutation',
    'second-account audience discovery',
  ],
};

console.log(JSON.stringify(summary, null, 2));

if (activeModerators < 1) {
  throw new Error('ACTIVE_STAGING_MODERATION_ADMIN_NOT_FOUND');
}
if (activeInstitutionModeratorsWithoutScope > 0) {
  throw new Error('ACTIVE_INSTITUTION_MODERATOR_SCOPE_MISSING');
}
