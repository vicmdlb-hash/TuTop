import type { WalletTransaction } from '../types';
import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

const DEFAULT_WALLET_HISTORY_LIMIT = 12;
const MAX_WALLET_HISTORY_LIMIT = 24;

function client() {
  const firebase = new FirebaseRestClient(getFirebaseConfig());
  if (!firebase.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return firebase;
}

export const walletHistoryBackend = {
  async load(limit = DEFAULT_WALLET_HISTORY_LIMIT): Promise<WalletTransaction[]> {
    const firebase = client();
    const uid = firebase.currentSession!.uid;
    const safeLimit = Math.max(1, Math.min(MAX_WALLET_HISTORY_LIMIT, Math.trunc(limit || DEFAULT_WALLET_HISTORY_LIMIT)));
    const docs = await firebase.runQuery<any>(
      'wallet_transactions',
      [{ field: 'user_id', op: 'EQUAL', value: uid }],
      [{ field: 'created_at', direction: 'DESCENDING' }],
      safeLimit,
    );
    return docs.map((doc) => ({
      id: doc.id,
      type: doc.data.type === 'income' ? 'income' : 'expense',
      description: String(doc.data.description || 'Movimiento'),
      amount: Number(doc.data.amount || 0),
      date: String(doc.data.created_at || new Date(0).toISOString()),
      operation_id: doc.data.operation_id ? String(doc.data.operation_id) : undefined,
    }));
  },
};

export const WALLET_HISTORY_INITIAL_LIMIT = DEFAULT_WALLET_HISTORY_LIMIT;
