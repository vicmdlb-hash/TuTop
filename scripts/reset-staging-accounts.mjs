import fs from 'node:fs';
import {
  adminDeleteDocument,
  adminDeleteTestUsers,
  adminGetDocument,
  adminListAuthUsers,
  adminListCollectionGroupDocuments,
  adminListDocuments,
  adminPatchDocument,
} from './staging-v2-admin.mjs';

const EXPECTED_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const configPath = 'config/staging-reset-once.json';
const apply = process.argv.includes('--apply');
const requiredAck = 'DELETE_ALL_BETA_ACCOUNTS';

if (projectId !== EXPECTED_PROJECT) throw new Error(`STAGING_RESET_BLOCKED_PROJECT:${projectId || 'missing'}`);
if (!fs.existsSync(configPath)) throw new Error(`STAGING_RESET_CONFIG_MISSING:${configPath}`);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config?.approved !== true) throw new Error('STAGING_RESET_NOT_APPROVED');
if (config?.project_id !== EXPECTED_PROJECT) throw new Error('STAGING_RESET_CONFIG_PROJECT_MISMATCH');
const resetId = String(config?.reset_id || '').trim();
if (!/^staging-reset-[a-z0-9-]{12,120}$/.test(resetId)) throw new Error('STAGING_RESET_ID_INVALID');
if (apply && process.env.TUTOP_STAGING_RESET_ACK !== requiredAck) throw new Error(`STAGING_RESET_APPLY_REQUIRES_${requiredAck}`);

const markerPath = `staging_maintenance/${resetId}`;
const existingMarker = await adminGetDocument(markerPath);
if (existingMarker) {
  console.log(`✅ Reset staging ${resetId} ya fue aplicado. No se repite.`);
  process.exit(0);
}

// Preserve canonical catalog/infrastructure and administrative evidence. Wipe
// beta accounts plus user-generated marketplace/messaging state only.
const ROOT_COLLECTIONS_TO_WIPE = [
  'notification_receipts',
  'device_tokens',
  'notification_preferences',
  'favorites',
  'saved_searches',
  'wallet_transactions',
  'wallets',
  'listing_reservation_locks',
  'transactions_v2',
  'offers',
  'reviews',
  'reports',
  'demand_requests',
  'listings_v2',
  'products',
  'bids',
  'chats',
  'publicVerifications',
  'verificationRequests',
  'reputation',
  'moderationStatus',
  'rate_limits',
  'account_deletion_requests',
  'user_private',
  'users',
];

// Firestore parent deletion never cascades. Scan these as collection groups so
// even orphan descendants from already-deleted chats are discovered and wiped.
const CHAT_SUBCOLLECTIONS = ['messages', 'confirmations', 'reads'];

const discovered = new Map();
for (const collection of ROOT_COLLECTIONS_TO_WIPE) {
  const docs = await adminListDocuments(collection);
  discovered.set(collection, docs);
}

const nestedChatDocuments = new Map();
for (const subcollection of CHAT_SUBCOLLECTIONS) {
  nestedChatDocuments.set(subcollection, await adminListCollectionGroupDocuments(subcollection));
}

const authUsers = await adminListAuthUsers();
const nestedCounts = Object.fromEntries(
  CHAT_SUBCOLLECTIONS.map((name) => [name, nestedChatDocuments.get(name).length]),
);
const nestedTotal = Object.values(nestedCounts).reduce((sum, count) => sum + count, 0);
const rootTotal = [...discovered.values()].reduce((sum, docs) => sum + docs.length, 0);
const totalDocs = rootTotal + nestedTotal;

console.log(JSON.stringify({
  reset_id: resetId,
  project_id: projectId,
  apply,
  auth_users: authUsers.length,
  firestore_documents: totalDocs,
  root_documents: rootTotal,
  nested_chat_documents: nestedCounts,
  preserved: [
    'institutions', 'campuses', 'faculties', 'careers', 'institution_domains',
    'approved_meeting_points', 'catalog', 'admins', 'audit_log', 'moderation_cases',
    'staging_maintenance',
  ],
  collection_counts: Object.fromEntries([...discovered.entries()].map(([name, docs]) => [name, docs.length])),
}, null, 2));

if (!apply) {
  console.log('DRY-RUN: no se modificó staging.');
  process.exit(0);
}

// Children first, then parents/root data.
for (const subcollection of CHAT_SUBCOLLECTIONS) {
  for (const document of nestedChatDocuments.get(subcollection)) await adminDeleteDocument(document.path);
}
for (const collection of ROOT_COLLECTIONS_TO_WIPE) {
  for (const document of discovered.get(collection) || []) await adminDeleteDocument(document.path);
}

const uids = authUsers.map((user) => user.localId);
for (let offset = 0; offset < uids.length; offset += 1000) {
  await adminDeleteTestUsers(uids.slice(offset, offset + 1000));
}

// Fail closed: do not write the one-shot marker until Auth, every root collection,
// and every known chat collection group are independently verified empty.
const remainingUsers = await adminListAuthUsers();
if (remainingUsers.length) throw new Error(`STAGING_RESET_AUTH_NOT_EMPTY:${remainingUsers.length}`);
for (const collection of ROOT_COLLECTIONS_TO_WIPE) {
  const left = await adminListDocuments(collection);
  if (left.length) throw new Error(`STAGING_RESET_COLLECTION_NOT_EMPTY:${collection}:${left.length}`);
}
for (const subcollection of CHAT_SUBCOLLECTIONS) {
  const left = await adminListCollectionGroupDocuments(subcollection);
  if (left.length) throw new Error(`STAGING_RESET_CHAT_COLLECTION_GROUP_NOT_EMPTY:${subcollection}:${left.length}`);
}

await adminPatchDocument(markerPath, {
  reset_id: resetId,
  project_id: projectId,
  completed_at: new Date(),
  auth_users_deleted: uids.length,
  firestore_documents_deleted: totalDocs,
  reason: String(config.reason || 'staging reset').slice(0, 300),
});

console.log(`✅ LAVADO STAGING COMPLETO · auth=${uids.length} · docs=${totalDocs} · collection-groups messages/confirmations/reads=0 · catálogo/infra/auditoría preservados.`);
