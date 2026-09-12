import { adminDeleteDocument, adminDeleteTestUsers, adminGetDocument, adminPatchDocument, adminRunQuery } from './staging-v2-admin.mjs';
import { buildAccountErasurePlan } from './account-erasure-planner.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const REQUIRED = 'tutop-beta-vicmdlb-1356585881';
const uidArgIndex = process.argv.indexOf('--uid');
const uid = uidArgIndex >= 0 ? String(process.argv[uidArgIndex + 1] || '').trim() : '';
const apply = process.argv.includes('--apply');

if (projectId !== REQUIRED) throw new Error(`Account erasure sólo puede operar en staging ${REQUIRED}.`);
if (!uid || uid.length < 8 || uid.length > 128) throw new Error('Usa --uid <firebase_uid> válido.');
if (apply && process.env.TUTOP_ALLOW_ACCOUNT_ERASURE !== 'staging-reviewed') throw new Error('Apply bloqueado: requiere TUTOP_ALLOW_ACCOUNT_ERASURE=staging-reviewed.');

function fieldString(document, field) {
  return String(document?.fields?.[field]?.stringValue || '');
}

const request = await adminGetDocument(`account_deletion_requests/${uid}`);
if (!request) throw new Error('No existe solicitud de eliminación para ese UID.');
const status = fieldString(request, 'status');
if (!['pending', 'processing'].includes(status)) throw new Error(`Solicitud no procesable desde estado ${status || 'desconocido'}.`);

const directDeletes = [
  `user_private/${uid}`,
  `notification_preferences/${uid}`,
  `verificationRequests/${uid}`,
  `publicVerifications/${uid}`,
  `reputation/${uid}`,
  `moderationStatus/${uid}`,
  `wallets/${uid}`,
];

const queryDeletes = [
  ['device_tokens', 'owner_uid'],
  ['notification_receipts', 'owner_uid'],
  ['favorites', 'uid'],
  ['saved_searches', 'owner_uid'],
  ['wallet_transactions', 'user_id'],
];

const withdrawals = [
  ['listings_v2', 'seller_id'],
  ['demand_requests', 'buyer_id'],
];

const retainedOperational = [
  ['transactions_v2', 'buyer_id'], ['transactions_v2', 'seller_id'],
  ['listing_reservation_locks', 'buyer_id'], ['listing_reservation_locks', 'seller_id'],
  ['offers', 'buyer_id'], ['offers', 'seller_id'],
  ['chats', 'buyer_id'], ['chats', 'seller_id'],
  ['reviews', 'evaluador_id'], ['reviews', 'evaluado_id'],
  ['reports', 'created_by'],
];

const queryDeletePaths = [];
for (const [collection, field] of queryDeletes) {
  for (const doc of await adminRunQuery(collection, [{ field, value: uid }], 1000)) queryDeletePaths.push(doc.path);
}

const withdrawDocs = [];
for (const [collection, field] of withdrawals) {
  for (const doc of await adminRunQuery(collection, [{ field, value: uid }], 1000)) withdrawDocs.push({ collection, path: doc.path });
}

const retained = [];
for (const [collection, field] of retainedOperational) {
  const docs = await adminRunQuery(collection, [{ field, value: uid }], 1000);
  if (docs.length) retained.push({ collection, field, count: docs.length });
}

// A deletion request may exist while a marketplace operation is still in flight,
// but destructive erasure must wait until the transaction is terminal. Otherwise
// the counterpart could lose the account/listing context needed to finish or dispute.
const transactionDocs = new Map();
for (const field of ['buyer_id', 'seller_id']) {
  for (const document of await adminRunQuery('transactions_v2', [{ field, value: uid }], 1000)) transactionDocs.set(document.path, document);
}
const terminalStatuses = new Set(['completed', 'cancelled', 'expired', 'no_show']);
const blockers = [...transactionDocs.values()]
  .map((document) => ({
    code: 'active_marketplace_transaction',
    collection: 'transactions_v2',
    id: document.path.split('/').pop() || document.path,
    status: fieldString(document, 'status') || 'unknown',
  }))
  .filter((item) => !terminalStatuses.has(item.status));

const plan = buildAccountErasurePlan({ projectId, uid, status, apply, directDeletes, queryDeletePaths, withdrawDocs, retained, blockers });
console.log(JSON.stringify(plan, null, 2));

if (plan.blocked) {
  if (apply) throw new Error(`ACCOUNT_ERASURE_BLOCKED:${plan.blockers.map((item) => `${item.id}:${item.status}`).join(',')}`);
  console.log('DRY-RUN BLOQUEADO: existen operaciones activas; no se modificó Firestore/Auth.');
  process.exit(0);
}

if (!apply) {
  console.log('DRY-RUN: no se modificó Firestore/Auth.');
  process.exit(0);
}

if (status === 'pending') await adminPatchDocument(`account_deletion_requests/${uid}`, { status: 'processing', updated_at: new Date() });

for (const item of plan.withdrawals) {
  if (item.collection === 'listings_v2') {
    await adminPatchDocument(item.path, {
      status: 'archived', moderation_status: 'rejected', title: 'Publicación retirada', description: '', updated_at: new Date(),
    });
  } else if (item.collection === 'demand_requests') {
    await adminPatchDocument(item.path, { status: 'expired', title: 'Solicitud retirada', description: '', updated_at: new Date() });
  }
}

for (const path of plan.delete_paths) await adminDeleteDocument(path);

// El perfil público se elimina después de retirar contenido; referencias históricas
// permanecen sólo en colecciones operativas retenidas para transacciones/disputas.
await adminDeleteDocument(`users/${uid}`);

await adminPatchDocument(`account_deletion_requests/${uid}`, {
  status: 'completed', updated_at: new Date(), processing_note: 'staging-controlled-erasure-v1',
});
await adminPatchDocument(`audit_log/account-erasure-${uid}-${Date.now()}`, {
  admin_uid: 'trusted-runner', actor_type: 'trusted_runner', role: 'trust_safety', action: 'account_erasure_completed',
  target_type: 'account_deletion_request', target_id: uid, created_at: new Date(),
});

// Auth se borra al final para evitar dejar datos privados activos si un paso anterior falla.
await adminDeleteTestUsers([uid]);
console.log(`✅ Eliminación controlada staging completada para ${uid}. Datos operativos retenidos: ${plan.retained_count}.`);
