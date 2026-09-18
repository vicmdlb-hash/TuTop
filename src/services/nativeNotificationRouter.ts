import { useAppStore } from '../store/useAppStore';
import { NATIVE_NOTIFICATION_EVENT, type NativeNotificationIntent } from './nativeFirebaseSecurity';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';

let installed = false;

function route(intent: NativeNotificationIntent, markRead = true) {
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
    const exactTargetResolved = route(intent);
    void onlineBackend.loadSnapshot().then((snapshot) => {
      useAppStore.getState().hydrateOnline(snapshot);
      if (!exactTargetResolved && intent.source === 'action' && intent.transaction_id) route(intent, false);
    }).catch(() => undefined);
  }) as EventListener);
}

installNativeNotificationRouter();
