export function buildAccountErasurePlan({ projectId, uid, status, apply = false, directDeletes = [], queryDeletePaths = [], withdrawDocs = [], retained = [], blockers = [] }) {
  // A pure planner may be reused outside this CLI: never label a non-staging
  // project or a truthy non-boolean (e.g. 'false') as an authorized apply plan.
  if (projectId !== 'tutop-beta-vicmdlb-1356585881') throw new Error('ERASURE_PROJECT_NOT_ALLOWED');
  if (typeof apply !== 'boolean') throw new Error('ERASURE_APPLY_FLAG_INVALID');
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(uid)) throw new Error('INVALID_UID');
  if (!['pending', 'processing'].includes(status)) throw new Error(`UNPROCESSABLE_STATUS:${status || 'unknown'}`);

  // Only explicitly disposable collections may enter a privileged delete plan.
  // Retained transaction/chat/audit records must never be accepted as paths
  // merely because an upstream query or caller supplied them.
  const directCollections = new Set([
    'users', 'user_private', 'notification_preferences', 'verificationRequests',
    'publicVerifications', 'reputation', 'moderationStatus', 'wallets',
  ]);
  const queryCollections = new Set([
    'device_tokens', 'notification_receipts', 'favorites',
    'saved_searches', 'wallet_transactions',
  ]);
  const segment = value => typeof value === 'string'
    && /^[A-Za-z0-9_-]{1,128}$/.test(value) && !value.startsWith('__');
  const checkDeletePath = (path, direct) => {
    if (typeof path !== 'string') throw new Error('ERASURE_DELETE_PATH_INVALID');
    const parts = path.split('/');
    const valid = direct
      ? parts.length === 2 && directCollections.has(parts[0]) && parts[1] === uid
      : (parts.length === 2 && queryCollections.has(parts[0]) && segment(parts[1]))
        || (parts.length === 4 && parts[0] === 'user_blocks'
          && parts[2] === 'targets' && segment(parts[1]) && segment(parts[3])
          && (parts[1] === uid || parts[3] === uid));
    if (!valid) throw new Error('ERASURE_DELETE_PATH_INVALID');
    return path;
  };
  const deletePaths = [...new Set([
    ...directDeletes.map(path => checkDeletePath(path, true)),
    ...queryDeletePaths.map(path => checkDeletePath(path, false)),
  ])].sort();
  // A caller may provide collection='listings_v2' with path='users/victim'.
  // Never allow that metadata mismatch to mutate unrelated Firestore records.
  const allowedWithdrawals = new Set(['listings_v2', 'demand_requests']);
  // Unknown or malformed inventory entries may represent missed account data.
  // Fail closed instead of silently dropping them from the withdrawal proof.
  if (!Array.isArray(withdrawDocs)) throw new Error('ERASURE_WITHDRAW_INVENTORY_INVALID');
  const normalizedWithdrawals = [...new Map(withdrawDocs
    .map((item) => {
      if (!item || !allowedWithdrawals.has(item.collection)) {
        throw new Error('ERASURE_WITHDRAW_COLLECTION_INVALID');
      }
      const parts = typeof item.path === 'string' ? item.path.split('/') : [];
      if (parts.length !== 2 || parts[0] !== item.collection || !segment(parts[1])) {
        throw new Error('ERASURE_WITHDRAW_PATH_INVALID');
      }
      return { collection: item.collection, path: item.path };
    })
    .map((item) => [item.path, item])).values()]
    .sort((a, b) => a.path.localeCompare(b.path));
  // An invalid count must never be silently discarded from the retention
  // inventory; otherwise the report could falsely claim a clean deletion.
  if (!Array.isArray(retained) || !Array.isArray(blockers)) {
    throw new Error('ERASURE_INVENTORY_INVALID');
  }
  const normalizedRetained = retained
    .map((item) => {
      if (!item || typeof item.collection !== 'string' || !item.collection
        || !Number.isSafeInteger(item.count) || item.count < 0) {
        throw new Error('ERASURE_RETAINED_COUNT_INVALID');
      }
      return { collection: item.collection, field: String(item.field || ''), count: item.count };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => `${a.collection}:${a.field}`.localeCompare(`${b.collection}:${b.field}`));
  const normalizedBlockers = blockers
    .map((item) => {
      if (!item || typeof item.code !== 'string' || !item.code
        || typeof item.collection !== 'string' || !item.collection
        || typeof item.id !== 'string' || !item.id) {
        throw new Error('ERASURE_BLOCKER_INVALID');
      }
      return { code: item.code, collection: item.collection, id: item.id,
        status: String(item.status || 'unknown') };
    })
    .filter((item, index, items) => items.findIndex((other) => JSON.stringify([other.code, other.collection, other.id])
      === JSON.stringify([item.code, item.collection, item.id])) === index)
    .sort((a, b) => `${a.collection}:${a.id}`.localeCompare(`${b.collection}:${b.id}`));

  // Individual counts can be safe integers even when their total is not.
  // Never report an imprecise residual inventory as proof of erasure.
  const retainedCount = normalizedRetained.reduce((sum, item) => {
    const total = sum + item.count;
    if (!Number.isSafeInteger(total)) throw new Error('ERASURE_RETAINED_TOTAL_INVALID');
    return total;
  }, 0);

  return {
    project_id: projectId,
    uid,
    request_status: status,
    mode: apply ? 'apply' : 'dry-run',
    delete_paths: deletePaths,
    withdraw_paths: normalizedWithdrawals.map((item) => item.path),
    withdrawals: normalizedWithdrawals,
    retained_operational: normalizedRetained,
    retained_count: retainedCount,
    blockers: normalizedBlockers,
    blocked: normalizedBlockers.length > 0,
    auth_delete_last: true,
  };
}

// Retained reservation locks are not disposable data, but their presence
// prevents truthful completion: a transaction can appear terminal while a
// stale lock still reserves the listing. This is an inventory-only blocker.
export function reservationLockBlockers(lockDocs, uid) {
  if (!Array.isArray(lockDocs) || typeof uid !== 'string'
    || !/^[A-Za-z0-9_-]{8,128}$/.test(uid)) throw Error('ERASURE_LOCK_INVENTORY_INVALID');
  const blockers = new Map();
  for (const doc of lockDocs) {
    const match = typeof doc?.path === 'string'
      ? /^listing_reservation_locks\/([A-Za-z0-9_-]{1,128})$/.exec(doc.path)
      : null;
    if (!match || match[1].startsWith('__')) throw Error('ERASURE_LOCK_PATH_INVALID');
    const buyer = doc?.fields?.buyer_id?.stringValue;
    const seller = doc?.fields?.seller_id?.stringValue;
    if (buyer !== uid && seller !== uid) throw Error('ERASURE_LOCK_OWNER_MISMATCH');
    blockers.set(doc.path, {
      code: 'marketplace_reservation_lock_present',
      collection: 'listing_reservation_locks',
      id: match[1],
      status: 'lock_present',
    });
  }
  return [...blockers.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function residualRiskSummary(plan) {
  return {
    delete_count: plan.delete_paths.length,
    withdraw_count: plan.withdraw_paths.length,
    retained_count: plan.retained_count,
    blocker_count: plan.blockers?.length || 0,
    // An empty observed snapshot does not approve unresolved legal periods or
    // prove that every indirect reference has been inventoried.
    requires_retention_review: true,
    legal_review_approved: false,
    residual_inventory_exhaustive: false,
    // A clean inventory snapshot does not atomically prevent new marketplace operations.
    // Until a trusted admission freeze is enforced, dry-run safety cannot authorize apply.
    admission_freeze_verified: false,
    safe_to_execute_in_staging: false,
  };
}

// Inventory-only grouping: two fields can reference the SAME retained
// document. Never report one retained record twice or silently discard a
// malformed query result. This is not legal authorization for its retention.
export function summarizeRetainedOperationalMatches(entries) {
  if (!Array.isArray(entries)) throw new Error('ERASURE_RETAINED_MATCHES_INVALID');
  const byCollection = new Map();
  for (const entry of entries) {
    const collection = entry?.collection;
    const field = entry?.field;
    if (typeof collection !== 'string' || !/^[A-Za-z0-9_]+$/.test(collection)
      || typeof field !== 'string' || !/^[A-Za-z0-9_]+$/.test(field)
      || !Array.isArray(entry.docs)) throw new Error('ERASURE_RETAINED_MATCH_INVALID');
    let bucket = byCollection.get(collection);
    if (!bucket) {
      bucket = { paths: new Set(), fields: new Set() };
      byCollection.set(collection, bucket);
    }
    // A query with zero matches is not evidence that its field referenced this UID.
    if (entry.docs.length > 0) bucket.fields.add(field);
    for (const doc of entry.docs) {
      const parts = typeof doc?.path === 'string' ? doc.path.split('/') : [];
      if (parts.length !== 2 || parts[0] !== collection || !parts[1]
        || parts[1] === '.' || parts[1] === '..') {
        throw new Error('ERASURE_RETAINED_MATCH_PATH_INVALID');
      }
      bucket.paths.add(doc.path);
    }
  }
  return [...byCollection.entries()].filter(([, info]) => info.paths.size > 0)
    .map(([collection, info]) => ({
      collection,
      field: [...info.fields].sort().join('|'),
      count: info.paths.size,
    }))
    .sort((a, b) => a.collection.localeCompare(b.collection));
}
