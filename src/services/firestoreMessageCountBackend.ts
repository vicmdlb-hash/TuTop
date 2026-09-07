import { getNativeAppCheckToken } from './nativeAppCheckToken';
import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

function encodePath(path: string) {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function getClient() {
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

export const firestoreMessageCountBackend = {
  async countAfter(chatId: string, afterIso?: string) {
    const cleanChatId = chatId.trim();
    if (!cleanChatId) throw new Error('CHAT_ID_REQUIRED');
    const client = getClient();
    const token = await client.getIdToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const appCheck = await getNativeAppCheckToken(false).catch(() => null);
    if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;

    const structuredQuery: Record<string, unknown> = { from: [{ collectionId: 'messages' }] };
    if (afterIso) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: 'created_at' },
          op: 'GREATER_THAN',
          value: { timestampValue: new Date(afterIso).toISOString() },
        },
      };
    }
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(client.projectId)}/databases/(default)/documents/${encodePath(`chats/${cleanChatId}`)}:runAggregationQuery`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        structuredAggregationQuery: {
          structuredQuery,
          aggregations: [{ alias: 'count', count: {} }],
        },
      }),
    });
    const text = await response.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) throw new Error(String(data?.error?.message || `HTTP ${response.status}`));
    const rows = Array.isArray(data) ? data : [];
    const raw = rows.find((row) => row?.result?.aggregateFields?.count)?.result?.aggregateFields?.count;
    const value = Number(raw?.integerValue ?? raw?.doubleValue ?? 0);
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  },
};
