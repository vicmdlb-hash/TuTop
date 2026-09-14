import fs from 'node:fs';
import {
  adminDeleteDocument,
  adminDeleteTestUsers,
  adminGetDocument,
  adminListAuthUsers,
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

// Preserve infrastructure/catalog collections deliberately. Only beta account,
// marketplace, messaging and user-generated state is in this allowlist.
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

const discovered = new Map();
for (const collection of ROOT_COLLECTIONS_TO_WIPE) {
  const docs = await adminListDocuments(collection);
  discovered.set(collection, docs);
}

// Firestore does not cascade-delete subcollections. Delete chat messages before
// deleting the parent chat documents so stale conversations cannot survive.
const nestedMessagePaths = [];
for (const chat of discovered.get('chats') || []) {
  const chatId = chat.path.split('/').pop();
  if (!chatId) continue;
  for (const message of await adminListDocuments(`chats/${chatId}/messages`)) nestedMessagePaths.push(message.path);
}

const authUsers = await adminListAuthUsers();
const totalDocs = [...discovered.values()].reduce((sum, docs) => sum + docs.length, 0) + nestedMessagePaths.length;
console.log(JSON.stringify({
  reset_id: resetId,
  project_id: projectId,
  apply,
  auth_users: authUsers.length,
  firestore_documents: totalDocs,
  preserved: ['institutions', 'campuses', 'faculties', 'careers', 'institution_domains', 'approved_meeting_points', 'catalog', 'admins', 'staging_maintenance'],
  collection_counts: Object.fromEntries([...discovered.entries()].map(([name, docs]) => [name, docs.length])),
  nested_chat_messages: nestedMessagePaths.length,
}, null, 2));

if (!apply) {
  console.log('DRY-RUN: no se modificó staging.');
  process.exit(0);
}

for (const path of nestedMessagePaths) await adminDeleteDocument(path);
for (const collection of ROOT_COLLECTIONS_TO_WIPE) {
  for (const document of discovered.get(collection) || []) await adminDeleteDocument(document.path);
}

const uids = authUsers.map((user) => user.localId);
for (let offset = 0; offset < uids.length; offset += 1000) {
  await adminDeleteTestUsers(uids.slice(offset, offset + 1000));
}

const remainingUsers = await adminListAuthUsers();
if (remainingUsers.length) throw new Error(`STAGING_RESET_AUTH_NOT_EMPTY:${remainingUsers.length}`);
for (const collection of ROOT_COLLECTIONS_TO_WIPE) {
  const left = await adminListDocuments(collection);
  if (left.length) throw new Error(`STAGING_RESET_COLLECTION_NOT_EMPTY:${collection}:${left.length}`);
}

await adminPatchDocument(markerPath, {
  reset_id: resetId,
  project_id: projectId,
  completed_at: new Date(),
  auth_users_deleted: uids.length,
  firestore_documents_deleted: totalDocs,
  reason: String(config.reason || 'staging reset').slice(0, 300),
});

console.log(`✅ LAVADO STAGING COMPLETO · auth=${uids.length} · docs=${totalDocs} · catálogo/infra preservados.`);
