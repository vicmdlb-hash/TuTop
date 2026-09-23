import { motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, Bell, CheckCheck, CircleDollarSign, MessageCircle, PackageCheck, Search, ShieldAlert, Trophy, Truck } from 'lucide-react';
import { inAppNotificationDestination } from '../lib/inAppNotificationRouting';
import { useAppStore } from '../store/useAppStore';

export default function NotificationCenter({ onClose }: { onClose: () => void }) {
  const { notifications, markNotificationRead, markAllNotificationsRead, openChat, openProduct, setActiveTab, chats } = useAppStore();
  const iconFor = (kind: string) => {
    if (kind === 'message') return <MessageCircle />;
    if (kind === 'offer') return <CircleDollarSign />;
    if (kind === 'reservation') return <PackageCheck />;
    if (kind === 'delivery') return <Truck />;
    if (kind === 'search') return <Search />;
    if (kind === 'verification') return <BadgeCheck />;
    if (kind === 'safety') return <ShieldAlert />;
    if (kind === 'bid') return <Trophy />;
    return <Bell />;
  };

  const activateNotification = (notification: typeof notifications[number]) => {
    markNotificationRead(notification.id);
    const destination = inAppNotificationDestination(notification);
    if (destination.kind === 'chat') {
      openChat(destination.chatId);
      onClose();
      return;
    }
    if (destination.kind === 'product') {
      setActiveTab('feed');
      openProduct(destination.productId);
      onClose();
      return;
    }
    if (destination.kind === 'transaction') {
      const chat = chats.find((item) => item.transaction_id === destination.transactionId);
      if (chat) openChat(chat.id);
      else setActiveTab('inbox');
      onClose();
      return;
    }
    if (destination.kind === 'tab') {
      setActiveTab(destination.tab);
      onClose();
    }
  };

  return (
    <motion.div className="fixed inset-0 z-[90] mx-auto w-full max-w-[460px] overflow-y-auto bg-[#050a13]" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 340 }}>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-white/5 bg-[#050a13]/95 px-3 pt-safe backdrop-blur-xl">
        <button onClick={onClose} className="icon-button-lg" aria-label="Volver"><ArrowLeft aria-hidden="true" /></button>
        <h1 className="flex-1 text-[17px] font-black">Notificaciones</h1>
        <button onClick={markAllNotificationsRead} className="flex items-center gap-1 text-[10px] font-bold text-primary"><CheckCheck className="h-4 w-4" aria-hidden="true" />Marcar leídas</button>
      </header>
      <div className="p-3">
        {notifications.length === 0 && <div className="empty-card">Todavía no hay notificaciones.</div>}
        {notifications.map((notification) => (
          <button key={notification.id} onClick={() => activateNotification(notification)} className={`notification-row ${notification.read ? '' : 'notification-unread'}`}>
            <span className="notification-icon" aria-hidden="true">{iconFor(notification.kind)}</span>
            <span className="min-w-0 flex-1 text-left"><strong className="block text-[12px]">{notification.title}</strong><span className="mt-1 block text-[11px] leading-snug text-muted">{notification.body}</span></span>
            {!notification.read && <span className="h-2 w-2 rounded-full bg-violet-400" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
