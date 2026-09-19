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
    const ranked = [...list].sort((a, b) => {
      const byTime = recordTime(b) - recordTime(a);
      if (byTime) return byTime;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    const newestTime = recordTime(ranked[0]);
    const newest = ranked.filter((item) => recordTime(item) === newestTime);
    const owners = new Set(newest.map((item) => String(item.owner_uid || '')).filter(Boolean));
    if (owners.size !== 1) continue;
    const owner = [...owners][0];
    const sameOwnerNewest = newest.filter((item) => String(item.owner_uid || '') === owner);
    const winner = sameOwnerNewest.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))[0];
    if (!winner || winner.active === false) continue;
    current.push({ ...winner, token });
  }
  return current;
}

export function eligibleRecipientTargets(records = [], recipientUid = '') {
  const uid = String(recipientUid || '').trim();
  if (!uid) return [];
  return currentTokenOwnerRecords(records).filter((target) => String(target.owner_uid || '') === uid);
}

export function isPermanentFcmTokenError(status, body = '') {
  const text = String(body || '');
  if (Number(status) === 404 && /UNREGISTERED|NOT_FOUND|registration token/i.test(text)) return true;
  if (Number(status) === 400 && /UNREGISTERED|INVALID_ARGUMENT[^\n]*(token|registration)/i.test(text)) return true;
  return /messaging\/registration-token-not-registered/i.test(text);
}
