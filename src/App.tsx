import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, MessageCircle, PlusCircle, ShieldAlert, UserRound, WalletCards } from 'lucide-react';
import Feed from './components/Feed';
import Chatbot from './components/Chatbot';
import NationalPublishScreen from './components/NationalPublishScreen';
import V2ListingsHydrator from './components/V2ListingsHydrator';
import WalletView from './components/WalletView';
import Inbox from './components/Inbox';
import Profile from './components/Profile';
import ProductDetail from './components/ProductDetail';
import OfflineBanner from './components/OfflineBanner';
import ErrorBoundary from './components/ErrorBoundary';
import BackendGate from './components/BackendGate';
import WelcomeTour from './components/WelcomeTour';
import DraftShelf from './components/DraftShelf';
import SellerTools from './components/SellerTools';
import UniversityNetworkSetup from './components/UniversityNetworkSetup';
import DemandRequestComposer from './components/DemandRequestComposer';
import NationalAccountControls from './components/NationalAccountControls';
import RecoveryReadinessCard from './components/RecoveryReadinessCard';
import PhysicalQaPanel from './components/PhysicalQaPanel';
import './services/nationalBackendCanonicalBridge';
import './services/rateLimitedOnlineBridge';
import './services/canonicalStoreBridge';
import './services/nationalIdentityHydrationBridge';
import './services/notificationReceiptStoreBridge';
import './services/physicalQaTelemetry';
import { handleTutopPopState } from './services/navigationHistoryBridge';
import './services/nativeNotificationRouter';
import { nationalSchemaEnabled } from './services/nationalBackend';
import { initializeNativeFirebaseSecurity } from './services/nativeFirebaseSecurity';
import { useAppStore } from './store/useAppStore';
import type { AppTab } from './types';
import AdminDashboard from './admin/AdminDashboard';
import ScopedModerationDashboard from './admin/ScopedModerationDashboard';
import PendingListingModeration from './admin/PendingListingModeration';
import AccountDeletionQueue from './admin/AccountDeletionQueue';

export default function App() {
  const path = window.location.pathname;
  const admin = path.startsWith('/admin');
  const moderation = path.startsWith('/admin/moderation');
  return (
    <ErrorBoundary>
      <BackendGate>
        {moderation ? <><PendingListingModeration /><AccountDeletionQueue /><ScopedModerationDashboard /></> : admin ? <><AdminDashboard /><a href="/admin/moderation" className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-2xl border border-violet-300/20 bg-violet-600 px-4 py-3 text-xs font-black text-white shadow-2xl shadow-violet-950/40"><ShieldAlert className="h-4 w-4"/>Moderación V2</a></> : <MobileApp />}
      </BackendGate>
    </ErrorBoundary>
  );
}

function MobileApp() {
  const { activeTab, setActiveTab, chats, activeChatId, selectedProductId } = useAppStore();
  const unread = chats.reduce((sum, chat) => sum + (chat.sin_leer || 0), 0);
  const v2 = nationalSchemaEnabled();
  const showFeedUtilities = activeTab === 'feed' && !activeChatId && !selectedProductId;

  useEffect(() => {
    if (!v2) return;
    void initializeNativeFirebaseSecurity();
  }, [v2]);

  useEffect(() => {
    const onPopState = () => { handleTutopPopState(); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const content: Record<AppTab, ReactNode> = {
    feed: <Feed />,
    bot: v2 ? <NationalPublishScreen /> : <Chatbot />,
    wallet: <WalletView />,
    inbox: <Inbox />,
    profile: <Profile />,
  };

  return (
    <div className="app-shell">
      <OfflineBanner />
      <WelcomeTour />
      {showFeedUtilities && <UniversityNetworkSetup />}
      {showFeedUtilities && <DemandRequestComposer />}
      {v2 && <V2ListingsHydrator />}
      <main className="min-h-screen pb-[calc(76px+env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
            {content[activeTab]}
          </motion.div>
        </AnimatePresence>
      </main>

      {!v2 && activeTab === 'bot' && !activeChatId && !selectedProductId && <DraftShelf />}
      {activeTab === 'profile' && !activeChatId && !selectedProductId && <><SellerTools /><NationalAccountControls />{v2 && <><RecoveryReadinessCard /><PhysicalQaPanel /></>}</>}

      {!activeChatId && (
        <nav className="bottom-nav" aria-label="Navegación principal">
          <NavButton icon={<Home />} label="Inicio" active={activeTab === 'feed'} onClick={() => setActiveTab('feed')} />
          <NavButton icon={<PlusCircle />} label="Publicar" active={activeTab === 'bot'} onClick={() => setActiveTab('bot')} />
          <NavButton icon={<WalletCards />} label="Wallet" active={activeTab === 'wallet'} onClick={() => setActiveTab('wallet')} />
          <NavButton icon={<MessageCircle />} label="Mensajes" active={activeTab === 'inbox'} onClick={() => setActiveTab('inbox')} badge={unread > 0 ? String(Math.min(unread, 99)) : undefined} />
          <NavButton icon={<UserRound />} label="Perfil" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
        </nav>
      )}

      <AnimatePresence>{selectedProductId && <ProductDetail />}</AnimatePresence>
    </div>
  );
}

function NavButton({ icon, label, active, onClick, badge }: { icon: ReactNode; label: string; active: boolean; onClick: () => void; badge?: string }) {
  return (
    <motion.button whileTap={{ scale: 0.92 }} onClick={onClick} className={`nav-item ${active ? 'nav-item-active' : ''}`} aria-current={active ? 'page' : undefined}>
      <span className="relative [&>svg]:h-[21px] [&>svg]:w-[21px]">
        {icon}
        {badge && <span className="nav-badge">{badge}</span>}
      </span>
      <span>{label}</span>
    </motion.button>
  );
}