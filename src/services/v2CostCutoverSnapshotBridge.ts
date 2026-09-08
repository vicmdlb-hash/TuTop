import { sellerLevelFor } from '../lib/productAssistant';
import type { Review, User, WalletTransaction } from '../types';
import { FirebaseRestClient, type FirestoreDocument } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend, type OnlineSnapshot } from './onlineBackend';
import { reviewStrikeCountBackend } from './reviewStrikeCountBackend';
import { reviewsLazyCutoverEnabled, walletLazyCutoverEnabled } from './v2CostCutoverFlags';

function nowIso() { return new Date().toISOString(); }

if (nationalSchemaEnabled()) {
  const reviewsCutover = reviewsLazyCutoverEnabled();
  const walletCutover = walletLazyCutoverEnabled();

  if (reviewsCutover || walletCutover) {
    onlineBackend.loadSnapshot = async (): Promise<OnlineSnapshot> => {
      const backend = onlineBackend as any;
      const client = backend.getClient() as FirebaseRestClient;
      const session = client.currentSession;
      if (!session) throw new Error('AUTH_REQUIRED');
      await client.getIdToken();
      await backend.ensureMarketplaceCatalog().catch(() => undefined);

      const [profileDoc, walletDoc, chatsDocs, favoritesDocs, ownReviewDocs, receivedReviewDocs, txDocs, publicVerification, adminDoc, moderationDoc] = await Promise.all([
        client.getDocument<any>(`users/${session.uid}`),
        client.getDocument<any>(`wallets/${session.uid}`),
        client.runQuery<any>('chats', [{ field: 'participants', op: 'ARRAY_CONTAINS', value: session.uid }], [{ field: 'updated_at', direction: 'DESCENDING' }], 60),
        client.runQuery<any>('favorites', [{ field: 'uid', op: 'EQUAL', value: session.uid }], [], 200),
        reviewsCutover ? Promise.resolve([] as FirestoreDocument<any>[]) : client.runQuery<any>('reviews', [{ field: 'evaluador_id', op: 'EQUAL', value: session.uid }], [], 100),
        reviewsCutover ? Promise.resolve([] as FirestoreDocument<any>[]) : client.runQuery<any>('reviews', [{ field: 'evaluado_id', op: 'EQUAL', value: session.uid }], [], 100),
        walletCutover ? Promise.resolve([] as FirestoreDocument<any>[]) : client.runQuery<any>('wallet_transactions', [{ field: 'user_id', op: 'EQUAL', value: session.uid }], [{ field: 'created_at', direction: 'DESCENDING' }], 100),
        client.getDocument<any>(`publicVerifications/${session.uid}`),
        client.getDocument<any>(`admins/${session.uid}`),
        client.getDocument<any>(`moderationStatus/${session.uid}`),
      ]);

      if (!profileDoc) throw new Error('PROFILE_MISSING');
      if (!walletDoc) throw new Error('WALLET_MISSING');

      const chats = await Promise.all(chatsDocs.map(async (doc: FirestoreDocument<any>) => backend.loadChat(doc, session.uid)));
      const strikes = reviewsCutover
        ? await reviewStrikeCountBackend.load()
        : receivedReviewDocs
          .filter((doc: FirestoreDocument<any>) => doc.data?.calificacion === 'negative')
          .filter((doc: FirestoreDocument<any>) => Date.parse(String(doc.data?.fecha || doc.data?.created_at || 0)) >= Date.now() - 30 * 86400000)
          .length;

      const wallet = walletDoc.data;
      const profile = profileDoc.data;
      const user: User = {
        id: session.uid,
        telefono: session.phone,
        nombre: String(profile.nombre || 'Estudiante'),
        facultad: String(profile.facultad || 'Comunidad universitaria'),
        saldo_ucoins: Number(wallet.balance || 0),
        puntos_prestigio: Number(wallet.prestige || 0),
        nivel_vendedor: sellerLevelFor(Number(wallet.prestige || 0)),
        esta_verificado: publicVerification?.data?.approved === true,
        strikes,
        fecha_registro: String(profile.created_at || nowIso()),
        avatar_url: profile.avatar_url ? String(profile.avatar_url) : undefined,
        is_suspended: moderationDoc?.data?.suspended === true,
        suspension_reason: moderationDoc?.data?.reason ? String(moderationDoc.data.reason) : undefined,
      };

      const reviewDocs = [...ownReviewDocs, ...receivedReviewDocs]
        .filter((doc, index, list) => list.findIndex((item) => item.id === doc.id) === index);
      const reviews: Review[] = reviewDocs.map((doc) => ({
        id: doc.id,
        chat_id: String(doc.data.chat_id || ''),
        evaluador_id: String(doc.data.evaluador_id || ''),
        evaluado_id: String(doc.data.evaluado_id || ''),
        calificacion: doc.data.calificacion,
        comentario: doc.data.comentario ? String(doc.data.comentario) : undefined,
        fecha: String(doc.data.fecha || doc.data.created_at || nowIso()),
      }));
      const transactions: WalletTransaction[] = txDocs.map((doc) => ({
        id: doc.id,
        type: doc.data.type === 'income' ? 'income' : 'expense',
        description: String(doc.data.description || 'Movimiento'),
        amount: Number(doc.data.amount || 0),
        date: String(doc.data.created_at || nowIso()),
        operation_id: doc.data.operation_id ? String(doc.data.operation_id) : undefined,
      }));

      return {
        user,
        products: [],
        chats,
        reviews,
        transactions,
        notifications: backend.deriveNotifications(chats, [], [], session.uid),
        favorites: favoritesDocs.map((doc) => String(doc.data.product_id || '')).filter(Boolean),
        isAdmin: adminDoc?.data?.active === true,
      };
    };
  }
}
