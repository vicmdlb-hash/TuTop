export function buildAccountErasurePlan({ projectId, uid, status, apply = false, directDeletes = [], queryDeletePaths = [], withdrawDocs = [], retained = [], blockers = [] }) {
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
  const normalizedWithdrawals = withdrawDocs
    .filter((item) => item && allowedWithdrawals.has(item.collection))
    .map((item) => {
      const parts = typeof item.path === 'string' ? item.path.split('/') : [];
      if (parts.length !== 2 || parts[0] !== item.collection || !segment(parts[1])) {
        throw new Error('ERASURE_WITHDRAW_PATH_INVALID');
      }
      return { collection: item.collection, path: item.path };
    })
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
    .filter((item, index, items) => items.findIndex((other) => `${other.code}:${other.collection}:${other.id}` === `${item.code}:${item.collection}:${item.id}`) === index)
    .sort((a, b) => `${a.collection}:${a.id}`.localeCompare(`${b.collection}:${b.id}`));

  return {
    project_id: projectId,
    uid,
    request_status: status,
    mode: apply ? 'apply' : 'dry-run',
    delete_paths: deletePaths,
    withdraw_paths: normalizedWithdrawals.map((item) => item.path),
    withdrawals: normalizedWithdrawals,
    retained_operational: normalizedRetained,
    retained_count: normalizedRetained.reduce((sum, item) => sum + item.count, 0),
    blockers: normalizedBlockers,
    blocked: normalizedBlockers.length > 0,
    auth_delete_last: true,
  };
}

export function residualRiskSummary(plan) {
  return {
    delete_count: plan.delete_paths.length,
    withdraw_count: plan.withdraw_paths.length,
    retained_count: plan.retained_count,
    blocker_count: plan.blockers?.length || 0,
    requires_retention_review: plan.retained_count > 0,
    safe_to_execute_in_staging: !plan.blocked && (plan.request_status === 'pending' || plan.request_status === 'processing'),
  };
}
