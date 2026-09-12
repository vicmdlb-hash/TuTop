import type { AppNotification } from '../types';
import { FirebaseRestClient } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { getFirebaseConfig } from './runtimeConfig';

export type PushPlatform = 'android' | 'ios' | 'web';

function getClient() {
  if (!nationalSchemaEnabled()) throw new Error('SCHEMA_V2_DISABLED');
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function receiptId(uid: string, notificationId: string) {
  return `${uid}-${notificationId}`.slice(0, 240);
}

export const pushBackend = {
  async registerDeviceToken(token: string, platform: PushPlatform, appVersion: string) {
    const client = getClient();
    const uid = client.currentSession!.uid;
    const cleanToken = token.trim();
    if (cleanToken.length < 20 || cleanToken.length > 4096) throw new Error('INVALID_PUSH_TOKEN');
    const tokenHash = await sha256(cleanToken);
    const id = `${uid}-${platform}-${tokenHash.slice(0, 20)}`;
    const now = new Date().toISOString();
    const existing = await client.getDocument(`device_tokens/${id}`);
    const payload = {
      owner_uid: uid,
      token: cleanToken,
      platform,
      app_version: appVersion.slice(0, 40),
      active: true,
      ...(existing ? {} : { created_at: now }),
      updated_at: now,
    };
    if (existing) await client.setDocument(`device_tokens/${id}`, payload, { merge: true });
    else await client.setDocument(`device_tokens/${id}`, payload, { exists: false });
    return id;
  },

  async unregisterDeviceToken(token: string, platform: PushPlatform) {
    const client = getClient();
    const uid = client.currentSession!.uid;
    const tokenHash = await sha256(token.trim());
    const id = `${uid}-${platform}-${tokenHash.slice(0, 20)}`;
    const existing = await client.getDocument(`device_tokens/${id}`);
    if (!existing) return;
    await client.setDocument(`device_tokens/${id}`, { active: false, updated_at: new Date().toISOString() }, { merge: true });
  },

  async loadTrustedNotifications(limit = 80): Promise<AppNotification[]> {
    const client = getClient();
    const uid = client.currentSession!.uid;
    const [docs, receipts] = await Promise.all([
      client.runQuery<any>(
        'notification_outbox',
        [{ field: 'recipient_uid', op: 'EQUAL', value: uid }],
        [{ field: 'created_at', direction: 'DESCENDING' }],
        Math.max(1, Math.min(100, limit)),
      ),
      client.runQuery<any>('notification_receipts', [{ field: 'owner_uid', op: 'EQUAL', value: uid }], [], 200).catch(() => []),
    ]);
    const read = new Set(receipts.filter((doc) => Boolean(doc.data?.read_at)).map((doc) => String(doc.data.notification_id || '')));
    return docs.map((doc) => ({
      id: doc.id,
      kind: doc.data.kind === 'saved_search_match' ? 'search' : doc.data.kind === 'new_message' ? 'message' : doc.data.kind === 'safety_alert' ? 'safety' : 'system',
      title: String(doc.data.title || 'TuTop'),
      body: String(doc.data.body || ''),
      created_at: String(doc.data.created_at || new Date().toISOString()),
      read: read.has(doc.id),
      chat_id: doc.data.chat_id ? String(doc.data.chat_id) : undefined,
      product_id: doc.data.listing_id ? String(doc.data.listing_id) : undefined,
      transaction_id: doc.data.transaction_id ? String(doc.data.transaction_id) : undefined,
      saved_search_id: doc.data.saved_search_id ? String(doc.data.saved_search_id) : undefined,
    }));
  },

  async markNotificationRead(notificationId: string) {
    const client = getClient();
    const uid = client.currentSession!.uid;
    const outbox = await client.getDocument<any>(`notification_outbox/${notificationId}`);
    if (!outbox || outbox.data?.recipient_uid !== uid) throw new Error('NOTIFICATION_NOT_FOUND');
    const id = receiptId(uid, notificationId);
    const now = new Date().toISOString();
    const existing = await client.getDocument<any>(`notification_receipts/${id}`);
    const payload = { owner_uid: uid, notification_id: notificationId, read_at: now, updated_at: now, ...(existing ? {} : { created_at: now }) };
    if (existing) await client.setDocument(`notification_receipts/${id}`, payload, { merge: true });
    else await client.setDocument(`notification_receipts/${id}`, payload, { exists: false });
  },

  async markAllNotificationsRead(notificationIds: string[]) {
    for (const id of [...new Set(notificationIds)].slice(0, 100)) await this.markNotificationRead(id);
  },
};
