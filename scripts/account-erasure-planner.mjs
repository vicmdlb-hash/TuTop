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
  const normalizedWithdrawals = withdrawDocs
    .filter((item) => item && ['listings_v2', 'demand_requests'].includes(item.collection) && item.path)
    .map((item) => ({ collection: item.collection, path: item.path }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const normalizedRetained = retained
    .filter((item) => item && item.collection && Number(item.count) > 0)
    .map((item) => ({ collection: String(item.collection), field: String(item.field || ''), count: Number(item.count) }))
    .sort((a, b) => `${a.collection}:${a.field}`.localeCompare(`${b.collection}:${b.field}`));
  const normalizedBlockers = blockers
    .filter((item) => item && item.code && item.collection && item.id)
    .map((item) => ({ code: String(item.code), collection: String(item.collection), id: String(item.id), status: String(item.status || 'unknown') }))
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
