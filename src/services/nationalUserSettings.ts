import { DEFAULT_NOTIFICATION_PREFERENCES, normalizeNotificationPreferences, type NotificationPreferences } from '../lib/notificationPreferences.ts';
import { FirebaseRestClient } from './firebaseRest.ts';
import { nationalSchemaEnabled } from './nationalBackend.ts';
import { getFirebaseConfig } from './runtimeConfig.ts';

export type AccountDeletionRequestStatus = 'pending' | 'processing' | 'completed' | 'rejected';

export type AccountDeletionRequest = {
  uid: string;
  status: AccountDeletionRequestStatus;
  requested_at: string;
  updated_at: string;
};

function client() {
  if (!nationalSchemaEnabled()) throw new Error('SCHEMA_V2_DISABLED');
  return new FirebaseRestClient(getFirebaseConfig());
}

function requireSession(firebase: FirebaseRestClient) {
  const session = firebase.currentSession;
  if (!session?.uid) throw new Error('AUTH_REQUIRED');
  return session;
}

async function readJson(response: Response) {
  const text = await response.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!response.ok) throw new Error(String(data?.error?.message || data?.raw || `HTTP ${response.status}`));
  return data;
}

export const nationalUserSettings = {
  async loadNotificationPreferences(): Promise<NotificationPreferences> {
    const firebase = client();
    const session = requireSession(firebase);
    const document = await firebase.getDocument<Partial<NotificationPreferences>>(`notification_preferences/${session.uid}`);
    return document ? normalizeNotificationPreferences(document.data) : { ...DEFAULT_NOTIFICATION_PREFERENCES };
  },

  async saveNotificationPreferences(input: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const firebase = client();
    const session = requireSession(firebase);
    const preferences = normalizeNotificationPreferences(input);
    await firebase.setDocument(`notification_preferences/${session.uid}`, {
      ...preferences,
      updated_at: new Date(),
    });
    return preferences;
  },

  async changePassword(nextPassword: string) {
    const firebase = client();
    requireSession(firebase);
    if (nextPassword.length < 8) throw new Error('WEAK_PASSWORD');
    if (nextPassword.length > 128) throw new Error('PASSWORD_TOO_LONG');
    const token = await firebase.getIdToken();
    const config = getFirebaseConfig();
    await readJson(await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token, password: nextPassword, returnSecureToken: false }),
    }));
    return true;
  },

  async requestAccountDeletion(): Promise<AccountDeletionRequest> {
    const firebase = client();
    const session = requireSession(firebase);
    const existing = await firebase.getDocument<AccountDeletionRequest>(`account_deletion_requests/${session.uid}`);
    if (existing) return existing.data;
    const now = new Date();
    await firebase.setDocument(`account_deletion_requests/${session.uid}`, {
      uid: session.uid,
      status: 'pending',
      requested_at: now,
      updated_at: now,
    }, { exists: false });
    return {
      uid: session.uid,
      status: 'pending',
      requested_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
  },

  async accountDeletionStatus(): Promise<AccountDeletionRequest | null> {
    const firebase = client();
    const session = requireSession(firebase);
    return (await firebase.getDocument<AccountDeletionRequest>(`account_deletion_requests/${session.uid}`))?.data || null;
  },
};
