import fs from 'node:fs';

function replaceOnce(path, from, to, label) {
  let text = fs.readFileSync(path, 'utf8');
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 occurrence, found ${count}`);
  text = text.replace(from, to);
  fs.writeFileSync(path, text);
}

replaceOnce(
  'scripts/staging-v2-e2e-smoke.mjs',
  "  reserve.set(doc(sellerDb, 'transactions_v2', txId), { listing_id: listingId, chat_id: chatId, buyer_id: buyer.uid, seller_id: seller.uid, accepted_offer_id: counterId, agreed_amount_mxn: 475, status: 'reserved', reservation_expires_at: Timestamp.fromMillis(Date.now() + 7200000), created_at: txTime, updated_at: txTime });\n  reserve.update(doc(sellerDb, 'chats', chatId), { transaction_id: txId, current_offer_id: counterId, updated_at: txTime });\n  await reserve.commit(); docsToClean.push(`transactions_v2/${txId}`);\n  assert.equal((await getDoc(doc(sellerDb, 'listings_v2', listingId))).data()?.status, 'active');\n  ok('reserva vive en transaction; listing sigue active');",
  "  reserve.set(doc(sellerDb, 'transactions_v2', txId), { listing_id: listingId, chat_id: chatId, buyer_id: buyer.uid, seller_id: seller.uid, accepted_offer_id: counterId, agreed_amount_mxn: 475, status: 'reserved', reservation_expires_at: Timestamp.fromMillis(Date.now() + 7200000), created_at: txTime, updated_at: txTime });\n  reserve.set(doc(sellerDb, 'listing_reservation_locks', listingId), { listing_id: listingId, transaction_id: txId, buyer_id: buyer.uid, seller_id: seller.uid, created_at: txTime, updated_at: txTime });\n  reserve.update(doc(sellerDb, 'chats', chatId), { transaction_id: txId, current_offer_id: counterId, updated_at: txTime });\n  await reserve.commit(); docsToClean.push(`transactions_v2/${txId}`, `listing_reservation_locks/${listingId}`);\n  assert.equal((await getDoc(doc(sellerDb, 'listing_reservation_locks', listingId))).data()?.transaction_id, txId);\n  let lockOverwriteBlocked = false;\n  try { await updateDoc(doc(sellerDb, 'listing_reservation_locks', listingId), { transaction_id: 'tx-forged', updated_at: Timestamp.now() }); } catch { lockOverwriteBlocked = true; }\n  assert(lockOverwriteBlocked, 'reservation lock pudo sobrescribirse');\n  assert.equal((await getDoc(doc(sellerDb, 'listings_v2', listingId))).data()?.status, 'active');\n  ok('reservation lock único protege listing sin sacarlo del feed');",
  'staging smoke reservation lock',
);

replaceOnce(
  'scripts/v2-trusted-maintenance.mjs',
  "function createWrite(path, data) { return { update: { name: docName(path), fields: encodeFields(data) }, currentDocument: { exists: false } }; }",
  "function createWrite(path, data) { return { update: { name: docName(path), fields: encodeFields(data) }, currentDocument: { exists: false } }; }\nfunction deleteWrite(path) { return { delete: docName(path) }; }",
  'trusted maintenance delete helper',
);
replaceOnce(
  'scripts/v2-trusted-maintenance.mjs',
  "      patchWrite(`transactions_v2/${tx.id}`, { status: 'no_show', outcome_code: expected, outcome_actor_id: claim.accused_uid, outcome_recorded_at: at, updated_at: at }),\n      auditWrite('no_show_upheld', 'transaction', tx.id, { outcome_code: expected }),",
  "      patchWrite(`transactions_v2/${tx.id}`, { status: 'no_show', outcome_code: expected, outcome_actor_id: claim.accused_uid, outcome_recorded_at: at, updated_at: at }),\n      deleteWrite(`listing_reservation_locks/${tx.listing_id}`),\n      auditWrite('no_show_upheld', 'transaction', tx.id, { outcome_code: expected }),",
  'trusted no-show releases lock',
);
replaceOnce(
  'scripts/v2-trusted-maintenance.mjs',
  "      patchWrite(`transactions_v2/${tx.id}`, { status: 'cancelled', outcome_code: 'mutual_cancel', outcome_recorded_at: at, updated_at: at }, ['outcome_actor_id']),\n      auditWrite('mutual_cancel_completed', 'transaction', tx.id),",
  "      patchWrite(`transactions_v2/${tx.id}`, { status: 'cancelled', outcome_code: 'mutual_cancel', outcome_recorded_at: at, updated_at: at }, ['outcome_actor_id']),\n      deleteWrite(`listing_reservation_locks/${tx.listing_id}`),\n      auditWrite('mutual_cancel_completed', 'transaction', tx.id),",
  'trusted mutual cancellation releases lock',
);

replaceOnce(
  'scripts/reconcile-v2-reservations.mjs',
  "function patchWrite(documentPath, data) {\n  return {\n    update: {\n      name: `projects/${projectId}/databases/(default)/documents/${documentPath}`,\n      fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)])),\n    },\n    updateMask: { fieldPaths: Object.keys(data) },\n  };\n}",
  "function patchWrite(documentPath, data) {\n  return {\n    update: {\n      name: `projects/${projectId}/databases/(default)/documents/${documentPath}`,\n      fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)])),\n    },\n    updateMask: { fieldPaths: Object.keys(data) },\n  };\n}\nfunction deleteWrite(documentPath) {\n  return { delete: `projects/${projectId}/databases/(default)/documents/${documentPath}` };\n}",
  'reconcile delete helper',
);
replaceOnce(
  'scripts/reconcile-v2-reservations.mjs',
  "  if (plan.kind === 'expire_reserved') {\n    writes.push(patchWrite(`transactions_v2/${plan.transaction_id}`, { status: 'expired', updated_at: updatedAt }));\n  } else if (plan.kind === 'repair_completed_listing') {\n    writes.push(patchWrite(`listings_v2/${plan.listing_id}`, { status: 'sold_out', updated_at: updatedAt }));\n  }",
  "  if (plan.kind === 'expire_reserved') {\n    writes.push(patchWrite(`transactions_v2/${plan.transaction_id}`, { status: 'expired', updated_at: updatedAt }));\n    writes.push(deleteWrite(`listing_reservation_locks/${plan.listing_id}`));\n  } else if (plan.kind === 'repair_completed_listing') {\n    writes.push(patchWrite(`listings_v2/${plan.listing_id}`, { status: 'sold_out', updated_at: updatedAt }));\n    writes.push(deleteWrite(`listing_reservation_locks/${plan.listing_id}`));\n  }",
  'reconcile terminal lock cleanup',
);
replaceOnce(
  'scripts/reconcile-v2-reservations.mjs',
  "console.log('El worker nunca reserva/libera el listing; sólo expira transactions y repara sold_out tras confirmación bilateral.');",
  "console.log('El worker no cambia visibilidad al reservar; expira transactions, limpia reservation locks terminales y repara sold_out tras confirmación bilateral.');",
  'reconcile status message',
);

console.log('Transaction reservation lock integration applied.');
