import { useAppStore } from '../store/useAppStore';
import { nationalSchemaEnabled } from './nationalBackend';
import { pushBackend } from './pushBackend';

if (nationalSchemaEnabled()) {
  useAppStore.setState({
    markNotificationRead: (notificationId: string) => {
      const state = useAppStore.getState();
      const notification = state.notifications.find((item) => item.id === notificationId);
      useAppStore.setState((current) => ({
        notifications: current.notifications.map((item) => item.id === notificationId ? { ...item, read: true } : item),
      }));
      if (notification?.kind === 'message' && notification.chat_id) useAppStore.getState().markChatRead(notification.chat_id);
      void pushBackend.markNotificationRead(notificationId).catch((error) => {
        console.warn('[TuTop notification receipt]', error);
      });
    },
    markAllNotificationsRead: () => {
      const state = useAppStore.getState();
      const unread = state.notifications.filter((item) => !item.read);
      const chatIds = [...new Set(unread.filter((item) => item.kind === 'message' && item.chat_id).map((item) => item.chat_id as string))];
      useAppStore.setState((current) => ({ notifications: current.notifications.map((item) => ({ ...item, read: true })) }));
      for (const chatId of chatIds) useAppStore.getState().markChatRead(chatId);
      void pushBackend.markAllNotificationsRead(unread.map((item) => item.id)).catch((error) => {
        console.warn('[TuTop notification receipts]', error);
      });
    },
  });
}
