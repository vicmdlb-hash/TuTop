import { useAppStore } from '../store/useAppStore';
import { NATIVE_NOTIFICATION_EVENT, type NativeNotificationIntent } from './nativeFirebaseSecurity';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';

let installed = false;

function route(intent: NativeNotificationIntent) {
  const state = useAppStore.getState();
  if (intent.notification_id) state.markNotificationRead(intent.notification_id);
  if (intent.source !== 'action') return;

  if (intent.chat_id) {
    state.openChat(intent.chat_id);
    return;
  }
  if (intent.listing_id) {
    state.setActiveTab('feed');
    state.openProduct(intent.listing_id);
    return;
  }
  if (intent.transaction_id) {
    const chat = state.chats.find((item: any) => item.transaction_id === intent.transaction_id);
    if (chat) state.openChat(chat.id);
    else state.setActiveTab('inbox');
    return;
  }
  if (intent.saved_search_id) {
    state.setActiveTab('feed');
    return;
  }
  state.setActiveTab(intent.kind === 'new_message' || intent.kind === 'offer_received' || intent.kind === 'counter_offer' ? 'inbox' : 'feed');
}

export function installNativeNotificationRouter() {
  if (installed || typeof window === 'undefined' || !nationalSchemaEnabled()) return;
  installed = true;
  window.addEventListener(NATIVE_NOTIFICATION_EVENT, ((event: CustomEvent<NativeNotificationIntent>) => {
    route(event.detail || { source: 'received' });
    void onlineBackend.loadSnapshot().then((snapshot) => useAppStore.getState().hydrateOnline(snapshot)).catch(() => undefined);
  }) as EventListener);
}

installNativeNotificationRouter();
