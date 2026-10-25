function asTime(value) {
  const n = Date.parse(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

function tokenKey(target = {}) {
  return String(target.token || '').trim();
}

function recordTime(target = {}) {
  return Math.max(asTime(target.updated_at), asTime(target.created_at));
}

/**
 * Returns the single current trusted owner record for each raw FCM token.
 * Ownership is determined across active AND inactive records so an old active
 * record can never revive after a newer record was explicitly deactivated.
 * Ambiguous ties across different owners fail closed and produce no target.
 */
export function currentTokenOwnerRecords(records = []) {
  const groups = new Map();
  for (const record of records) {
    const token = tokenKey(record);
    if (!token) continue;
    const list = groups.get(token) || [];
    list.push(record);
    groups.set(token, list);
  }

  const current = [];
  for (const [token, list] of groups) {
    // A malformed row on a device cannot safely prove an older owner is still
    // current. Refuse selection and auto-cleanup instead of reviving that row.
    if (list.some(row =>
      recordTime(row) <= 0 || typeof row.active !== 'boolean'
      // A present but malformed last-update timestamp cannot fall back to an
      // old creation date: that could resurrect a revoked prior recipient.
      || (row.updated_at !== undefined
        && (typeof row.updated_at !== 'string'
          || !/^\d{4}-\d{2}-\d{2}T/.test(row.updated_at)
          || asTime(row.updated_at) <= 0))
    )) continue;
    const ranked = [...list].sort((a, b) => {
      const byTime = recordTime(b) - recordTime(a);
      if (byTime) return byTime;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    const newestTime = recordTime(ranked[0]);
    // Unverified dates or a conflicting active/inactive tie cannot prove
    // current ownership; do not send to a possibly revoked device.
    if (newestTime <= 0) continue;
    const newest = ranked.filter((item) => recordTime(item) === newestTime);
    const owners = new Set(newest.map((item) => String(item.owner_uid || '')).filter(Boolean));
    if (owners.size !== 1 || newest.some((item) => item.active !== true)) continue;
    const owner = [...owners][0];
    const sameOwnerNewest = newest.filter((item) => String(item.owner_uid || '') === owner);
    const winner = sameOwnerNewest.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))[0];
    if (!winner || winner.active !== true) continue;
    current.push({ ...winner, token });
  }
  return current;
}

export function eligibleRecipientTargets(records = [], recipientUid = '') {
  const uid = String(recipientUid || '').trim();
  if (!uid) return [];
  return currentTokenOwnerRecords(records).filter((target) => String(target.owner_uid || '') === uid);
}

/**
 * Returns active records that are safely superseded by a unique newest record
 * for the same raw token. Ambiguous cross-UID ties are never auto-cleaned.
 * This is intentionally separate from delivery filtering so trusted maintenance
 * can retire stale mappings before a physical send without changing app runtime.
 */
export function supersededActiveTokenRecords(records = []) {
  const groups = new Map();
  for (const record of records) {
    const token = tokenKey(record);
    if (!token) continue;
    const list = groups.get(token) || [];
    list.push(record);
    groups.set(token, list);
  }

  const stale = [];
  for (const [token, list] of groups) {
    // A malformed row on a device cannot safely prove an older owner is still
    // current. Refuse selection and auto-cleanup instead of reviving that row.
    if (list.some(row =>
      recordTime(row) <= 0 || typeof row.active !== 'boolean'
      // A present but malformed last-update timestamp cannot fall back to an
      // old creation date: that could resurrect a revoked prior recipient.
      || (row.updated_at !== undefined
        && (typeof row.updated_at !== 'string'
          || !/^\d{4}-\d{2}-\d{2}T/.test(row.updated_at)
          || asTime(row.updated_at) <= 0))
    )) continue;
    const ranked = [...list].sort((a, b) => {
      const byTime = recordTime(b) - recordTime(a);
      if (byTime) return byTime;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    const newestTime = recordTime(ranked[0]);
    if (newestTime <= 0) continue;
    const newest = ranked.filter((item) => recordTime(item) === newestTime);
    // If a tie contains a revocation/malformed status, never pick an
    // alphabetical winner to mutate potentially current ownership.
    if (newest.some((item) => item.active !== newest[0].active)) continue;
    const owners = new Set(newest.map((item) => String(item.owner_uid || '')).filter(Boolean));
    if (owners.size !== 1) continue;

    const owner = [...owners][0];
    const sameOwnerNewest = newest.filter((item) => String(item.owner_uid || '') === owner)
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    const winner = sameOwnerNewest[0];
    if (!winner) continue;

    for (const record of ranked) {
      if (record === winner || record?.active !== true) continue;
      const older = recordTime(record) < newestTime;
      const sameOwnerTieDuplicate = recordTime(record) === newestTime
        && String(record.owner_uid || '') === owner
        && String(record.id || '') !== String(winner.id || '');
      if (older || sameOwnerTieDuplicate) stale.push({ ...record, token });
    }
  }
  return stale;
}

export function isPermanentFcmTokenError(status, body = '') {
  const text = String(body || '');
  if (Number(status) === 404 && /UNREGISTERED|NOT_FOUND|registration token/i.test(text)) return true;
  if (Number(status) === 400 && /UNREGISTERED|INVALID_ARGUMENT[^\n]*(token|registration)/i.test(text)) return true;
  return [400, 404].includes(Number(status)) && /messaging\/registration-token-not-registered/i.test(text);
}

/**
 * Safe pre-send guard for a bounded Firestore runQuery result. A LIMIT is only
 * an upper bound; reaching it does not prove the collection is exhausted.
 * With partial device_tokens history, an older owner could look current.
 * Refuse ALL sends (even for a single target) until a trustworthy, complete
 * inventory/paginated snapshot is available. No token content is logged.
 */
export function assertCompleteFcmInventory(rows, maxDocuments, collectionId) {
  if (!['notification_outbox', 'device_tokens'].includes(collectionId)
      || !Number.isSafeInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 500
      || !Array.isArray(rows)
      || rows.some(row => !row || typeof row !== 'object'
        || Array.isArray(row) || Object.hasOwn(row, 'error'))) {
    throw new Error('FCM_QUERY_INVENTORY_INVALID');
  }
  const docs = rows.filter(row => row.document);
  if (docs.some(row => !row.document || typeof row.document.name !== 'string'
      || !row.document.name.includes('/documents/' + collectionId + '/'))) {
    throw new Error('FCM_QUERY_INVENTORY_INVALID');
  }
  if (docs.length >= maxDocuments) throw new Error('FCM_QUERY_INCOMPLETE_DENIED');
  return docs;
}

/**
 * A cleanup must only update the EXACT Firestore document version previously
 * read during token-owner selection. exists:true alone can revoke a newly
 * re-registered device record after another account takes ownership.
 */
export function fcmTokenCleanupPrecondition(record) {
  const stamp = record?._document_update_time;
  if (typeof stamp !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(stamp)
      || !Number.isFinite(Date.parse(stamp)))
    throw new Error('FCM_STALE_TOKEN_UPDATE_TIME_REQUIRED');
  return { updateTime: stamp };
}
