import crypto from 'node:crypto';

function stableId(parts) {
  return crypto.createHash('sha256')
    .update(parts.map((value) => String(value ?? '')).join(':'))
    .digest('hex')
    .slice(0, 40);
}

function asTime(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function projectSafetyModerationNotifications({
  moderationStatuses = [],
  preferencesByUid = new Map(),
  now = Date.now(),
  lookbackMs = 48 * 3600_000,
}) {
  const cutoff = now - lookbackMs;
  const projected = [];

  for (const status of moderationStatuses) {
    const uid = String(status.id || status.uid || '').trim();
    const updatedAt = asTime(status.updated_at);
    if (!uid || !updatedAt || updatedAt < cutoff) continue;
    if (!String(status.admin_uid || '').trim()) continue;

    const preferences = preferencesByUid.get(uid) || {};
    if (preferences.safety_alert === false) continue;

    const suspended = status.suspended === true;
    projected.push({
      id: stableId(['safety-moderation', uid, suspended ? 'suspended' : 'cleared', status.updated_at]),
      recipient_uid: uid,
      kind: 'safety_alert',
      title: suspended ? 'Tu cuenta tiene una restricción de seguridad' : 'Se actualizó el estado de seguridad de tu cuenta',
      body: suspended
        ? 'TuTop aplicó una restricción a tu cuenta. Abre Perfil para revisar el estado y los siguientes pasos.'
        : 'TuTop actualizó el estado de seguridad de tu cuenta. Abre Perfil para revisar el estado actual.',
      status: 'pending',
      attempts: 0,
      source_event_at: new Date(updatedAt).toISOString(),
    });
  }

  const unique = new Map();
  for (const item of projected) unique.set(item.id, item);
  return [...unique.values()].sort((a,b)=>String(a.source_event_at).localeCompare(String(b.source_event_at)));
}
