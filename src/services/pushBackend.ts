import { appNotificationKindFromOutbox } from '../lib/notificationProjection';
import { isCurrentPushSession } from '../lib/pushBackendSessionWitness';
import { createFirstPushTokenDocument, normalizePushTokenIdentity, normalizePushAppVersion } from '../lib/pushTokenCreateFirst';
import type { AppNotification } from '../types';
import { FirebaseRestClient, type AuthSession } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { getFirebaseConfig } from './runtimeConfig';

export type PushPlatform = 'android' | 'ios' | 'web';

function getClient() {
  if (!nationalSchemaEnabled()) throw new Error('SCHEMA_V2_DISABLED');
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

function currentPushOwnerGuard(client: FirebaseRestClient) {
  const original = client.currentSession;
  if (!original?.uid || !original.refreshToken) throw new Error('AUTH_REQUIRED');
  return () => {
    // Secure native bridge shares this project-scoped readStoredSession method.
    // Never allow an old A request to return results after another login.
    const reader = client as unknown as { readStoredSession?: () => AuthSession | null };
    if (!isCurrentPushSession(original, client.currentSession, reader.readStoredSession?.() ?? null))
      throw new Error('PUSH_OWNER_SESSION_CHANGED');
  };
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
  async registerDeviceToken(
    token: string, platform: PushPlatform, appVersion: string,
    isOriginalSession?: () => boolean,
  ) {
    const client = getClient();
    const uid = client.currentSession!.uid;
    const canonicalGuard = currentPushOwnerGuard(client);
    const assertOwner = () => {
      canonicalGuard();
      if (isOriginalSession && !isOriginalSession()) throw new Error('PUSH_OWNER_SESSION_CHANGED');
    };
    assertOwner();
    const { token: cleanToken, platform: cleanPlatform } = normalizePushTokenIdentity(token, platform);
    const cleanAppVersion = normalizePushAppVersion(appVersion);
    const tokenHash = await sha256(cleanToken);
    assertOwner();
    const id = `${uid}-${cleanPlatform}-${tokenHash.slice(0, 20)}`;
    const now = new Date().toISOString();
    const payload = {
      owner_uid: uid,
      token: cleanToken,
      platform: cleanPlatform,
      app_version: cleanAppVersion,
      active: true,
      created_at: now,
      updated_at: now,
    };
    await createFirstPushTokenDocument(
      (record, options) => client.setDocument(`device_tokens/${id}`, record, options),
      payload,
      assertOwner,
    );
    return id;
  },

  async unregisterDeviceToken(token: string, platform: PushPlatform) {
    const client = getClient();
    const uid = client.currentSession!.uid;
    const assertOwner = currentPushOwnerGuard(client);
    assertOwner();
    const { token: cleanToken, platform: cleanPlatform } = normalizePushTokenIdentity(token, platform);
    const tokenHash = await sha256(cleanToken);
    assertOwner();
    const id = `${uid}-${cleanPlatform}-${tokenHash.slice(0, 20)}`;
    // A missing or unreadable token cannot be distinguished safely by a
    // pre-GET under owner-only Rules: update only an existing owner record.
    // Any 404/403/failed precondition propagates to the sign-out quarantine;
    // never report server deactivation without an acknowledged write.
    assertOwner();
    await client.setDocument(
      `device_tokens/${id}`,
      { active: false, updated_at: new Date().toISOString() },
      { merge: true, exists: true },
    );
    assertOwner();
  },

  async loadTrustedNotifications(limit = 80): Promise<AppNotification[]> {
    const client = getClient();
    const uid = client.currentSession!.uid;
    const assertOwner = currentPushOwnerGuard(client);
    assertOwner();
    const [docs, receipts] = await Promise.all([
      client.runQuery<any>(
        'notification_outbox',
        [{ field: 'recipient_uid', op: 'EQUAL', value: uid }],
        [{ field: 'created_at', direction: 'DESCENDING' }],
        Math.max(1, Math.min(100, limit)),
      ),
      client.runQuery<any>('notification_receipts', [{ field: 'owner_uid', op: 'EQUAL', value: uid }], [], 200).catch(() => []),
    ]);
    assertOwner(); // Reject A's completed query when B has logged in.
    const read = new Set(receipts.filter((doc) => Boolean(doc.data?.read_at)).map((doc) => String(doc.data.notification_id || '')));
    return docs.map((doc) => ({
      id: doc.id,
      kind: appNotificationKindFromOutbox(doc.data.kind),
      title: String(doc.data.title || 'TuTop'),
      body: String(doc.data.body || ''),
      created_at: String(doc.data.created_at || new Date().toISOString()),
      read: read.has(doc.id),
      chat_id: doc.data.chat_id ? String(doc.data.chat_id) : undefined,
      product_id: doc.data.listing_id ? String(doc.data.listing_id) : undefined,
      transaction_id: doc.data.transaction_id ? String(doc.data.transaction_id) : undefined,
      offer_id: doc.data.offer_id ? String(doc.data.offer_id) : undefined,
      saved_search_id: doc.data.saved_search_id ? String(doc.data.saved_search_id) : undefined,
    }));
  },

  async markNotificationRead(notificationId: string) {
    const client = getClient();
    const uid = client.currentSession!.uid;
    const assertOwner = currentPushOwnerGuard(client);
    assertOwner();
    const outbox = await client.getDocument<any>(`notification_outbox/${notificationId}`);
    assertOwner();
    if (!outbox || outbox.data?.recipient_uid !== uid) throw new Error('NOTIFICATION_NOT_FOUND');
    const id = receiptId(uid, notificationId);
    const now = new Date().toISOString();
    const existing = await client.getDocument<any>(`notification_receipts/${id}`);
    assertOwner();
    const payload = { owner_uid: uid, notification_id: notificationId, read_at: now, updated_at: now, ...(existing ? {} : { created_at: now }) };
    if (existing) await client.setDocument(`notification_receipts/${id}`, payload, { merge: true });
    else await client.setDocument(`notification_receipts/${id}`, payload, { exists: false });
  },

  async markAllNotificationsRead(notificationIds: string[]) {
    for (const id of [...new Set(notificationIds)].slice(0, 100)) await this.markNotificationRead(id);
  },
};
