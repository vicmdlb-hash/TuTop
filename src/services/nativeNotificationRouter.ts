import { useAppStore } from '../store/useAppStore';
import { canApplyNativeNotificationSnapshot, canRouteNativeNotification } from '../lib/nativeNotificationSessionGuard';
import { NATIVE_NOTIFICATION_EVENT, type NativeNotificationIntent } from './nativeFirebaseSecurity';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';
import { verifiedEmailBetaAuth } from './verifiedEmailBetaAuth';

let installed = false;

function activeRecipientUid() {
  try {
    if (!onlineBackend.ready) onlineBackend.configureFromRuntime();
  } catch { /* missing verified Auth must fail closed */ }
  // A cached FirebaseRestClient may still hold A after a separate client logs
  // in as B. Route only when it agrees with the canonical stored identity.
  const cachedUid = String(onlineBackend.session?.uid || '').trim();
  const canonicalUid = String(verifiedEmailBetaAuth.readSessionIdentity()?.uid || '').trim();
  return cachedUid && cachedUid === canonicalUid ? canonicalUid : '';
}

function recipientMatchesActiveSession(intent: NativeNotificationIntent) {
  return canRouteNativeNotification(
    intent.recipient_uid,
    activeRecipientUid(),
    useAppStore.getState().user.id,
  );
}

function route(intent: NativeNotificationIntent, markRead = true) {
  if (!recipientMatchesActiveSession(intent)) return false;
  const state = useAppStore.getState();
  if (markRead && intent.notification_id) state.markNotificationRead(intent.notification_id);
  if (intent.source !== 'action') return true;

  if (intent.chat_id) {
    state.openChat(intent.chat_id);
    return true;
  }
  if (intent.listing_id) {
    state.setActiveTab('feed');
    state.openProduct(intent.listing_id);
    return true;
  }
  if (intent.transaction_id) {
    const chat = state.chats.find((item: any) => item.transaction_id === intent.transaction_id);
    if (chat) {
      state.openChat(chat.id);
      return true;
    }
    // On a cold start the store can be empty when Android delivers the tap.
    // Keep an immediate safe Inbox fallback, then retry the exact target once
    // the authoritative online snapshot has hydrated below.
    state.setActiveTab('inbox');
    return false;
  }
  if (intent.saved_search_id) {
    state.setActiveTab('feed');
    return true;
  }
  state.setActiveTab(intent.kind === 'new_message' || intent.kind === 'offer_received' || intent.kind === 'counter_offer' ? 'inbox' : 'feed');
  return true;
}

export function installNativeNotificationRouter() {
  if (installed || typeof window === 'undefined' || !nationalSchemaEnabled()) return;
  installed = true;
  window.addEventListener(NATIVE_NOTIFICATION_EVENT, ((event: CustomEvent<NativeNotificationIntent>) => {
    const intent = event.detail || { source: 'received' };
    if (!recipientMatchesActiveSession(intent)) return;
    const expectedUid = String(intent.recipient_uid || '').trim();
    const expectedSessionGeneration = verifiedEmailBetaAuth.sessionGeneration();
    const expectedCanonicalSession = verifiedEmailBetaAuth.readSessionIdentity();
    if (!expectedCanonicalSession || expectedCanonicalSession.uid !== expectedUid) return;
    const exactTargetResolved = route(intent);
    void onlineBackend.loadSnapshot().then((snapshot) => {
      // An A-owned request can settle after A logs out and B signs in.
      // Never hydrate or retry a target if the verified identity has changed.
      const store = useAppStore.getState();
      // UID checks alone are insufficient for logout -> login of the same UID.
      if (verifiedEmailBetaAuth.sessionGeneration() !== expectedSessionGeneration) return;
      const currentCanonicalSession = verifiedEmailBetaAuth.readSessionIdentity();
      // The phone-password path does not increment the email-beta generation.
      // Refresh-token ownership changes across logout/relogin of the same UID.
      if (!currentCanonicalSession
        || currentCanonicalSession.uid !== expectedCanonicalSession.uid
        || currentCanonicalSession.refreshToken !== expectedCanonicalSession.refreshToken) return;
      if (!canApplyNativeNotificationSnapshot(
        expectedUid, activeRecipientUid(), store.user.id, snapshot.user.id,
      )) return;
      store.hydrateOnline(snapshot);
      if (!exactTargetResolved && intent.source === 'action' && intent.transaction_id) route(intent, false);
    }).catch(() => undefined);
  }) as EventListener);
}

installNativeNotificationRouter();
