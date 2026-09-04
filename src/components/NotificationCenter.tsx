import { motion } from 'framer-motion';
import { ArrowLeft, Bell, CheckCheck, MessageCircle, Trophy } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function NotificationCenter({ onClose }: { onClose: () => void }) {
  const { notifications, markNotificationRead, markAllNotificationsRead, openChat } = useAppStore();
  const iconFor = (kind: string) => kind === 'message' ? <MessageCircle /> : kind === 'bid' ? <Trophy /> : <Bell />;
  return (
    <motion.div className="fixed inset-0 z-[90] mx-auto w-full max-w-[460px] overflow-y-auto bg-[#050a13]" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 340 }}>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-white/5 bg-[#050a13]/95 px-3 pt-safe backdrop-blur-xl">
        <button onClick={onClose} className="icon-button-lg"><ArrowLeft /></button>
        <h1 className="flex-1 text-[17px] font-black">Notificaciones</h1>
        <button onClick={markAllNotificationsRead} className="flex items-center gap-1 text-[10px] font-bold text-primary"><CheckCheck className="h-4 w-4" />Marcar leídas</button>
      </header>
      <div className="p-3">
        {notifications.length === 0 && <div className="empty-card">Todavía no hay notificaciones.</div>}
        {notifications.map((notification) => (
          <button key={notification.id} onClick={() => { markNotificationRead(notification.id); if (notification.chat_id) { openChat(notification.chat_id); onClose(); } }} className={`notification-row ${notification.read ? '' : 'notification-unread'}`}>
            <span className="notification-icon">{iconFor(notification.kind)}</span>
            <span className="min-w-0 flex-1 text-left"><strong className="block text-[12px]">{notification.title}</strong><span className="mt-1 block text-[11px] leading-snug text-muted">{notification.body}</span></span>
            {!notification.read && <span className="h-2 w-2 rounded-full bg-violet-400" />}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
