import { useAppStore } from '../store/useAppStore';
import { qaEvent } from './physicalQaTelemetry';

const base = useAppStore.getState();
const originalOpenProduct = base.openProduct;
const originalCloseProduct = base.closeProduct;
const originalOpenChat = base.openChat;
const originalCloseChat = base.closeChat;
const originalContactProduct = base.contactProduct;

type OverlayKind = 'product' | 'chat';
type OverlayState = { tutopOverlay?: { kind: OverlayKind; id: string } };

function marker(): OverlayState['tutopOverlay'] {
  const state = history.state as OverlayState | null;
  return state?.tutopOverlay;
}

function push(kind: OverlayKind, id: string) {
  const current = marker();
  if (current?.kind === kind && current.id === id) return;
  history.pushState({ ...(history.state || {}), tutopOverlay: { kind, id } }, '', window.location.href);
  qaEvent('history_push', `${kind}:${id.slice(0, 48)}`);
}

function replace(kind: OverlayKind, id: string) {
  history.replaceState({ ...(history.state || {}), tutopOverlay: { kind, id } }, '', window.location.href);
  qaEvent('history_replace', `${kind}:${id.slice(0, 48)}`);
}

function closeThroughHistory(kind: OverlayKind, fallback: () => void) {
  if (marker()?.kind === kind) {
    history.back();
    return;
  }
  fallback();
}

useAppStore.setState({
  openProduct: (productId: string) => {
    const state = useAppStore.getState();
    if (!state.selectedProductId && !state.activeChatId) push('product', productId);
    else if (state.selectedProductId && state.selectedProductId !== productId) replace('product', productId);
    originalOpenProduct(productId);
  },
  closeProduct: () => closeThroughHistory('product', originalCloseProduct),
  openChat: (chatId: string) => {
    const state = useAppStore.getState();
    if (!state.activeChatId) {
      if (state.selectedProductId && marker()?.kind === 'product') replace('chat', chatId);
      else push('chat', chatId);
    }
    originalOpenChat(chatId);
  },
  closeChat: () => closeThroughHistory('chat', originalCloseChat),
  contactProduct: (productId: string) => {
    const before = useAppStore.getState();
    const chatId = originalContactProduct(productId);
    if (chatId && !before.activeChatId) {
      if (before.selectedProductId && marker()?.kind === 'product') replace('chat', chatId);
      else push('chat', chatId);
    }
    return chatId;
  },
});

export function handleTutopPopState() {
  const state = useAppStore.getState();
  if (state.activeChatId) {
    qaEvent('history_pop', 'chat');
    originalCloseChat();
    return true;
  }
  if (state.selectedProductId) {
    qaEvent('history_pop', 'product');
    originalCloseProduct();
    return true;
  }
  return false;
}
