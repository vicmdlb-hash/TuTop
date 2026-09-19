import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Compass, Home, MessageCircle, PlusCircle, ShieldAlert, UserRound, WalletCards } from 'lucide-react';
import Feed from './components/Feed';
import Chatbot from './components/Chatbot';
import ExploreScreen from './components/ExploreScreen';
import NationalPublishScreen from './components/NationalPublishScreen';
import V2ListingsHydrator from './components/V2ListingsHydrator';
import V2NearbyListingsHydrator from './components/V2NearbyListingsHydrator';
import V2ChatHistoryHydrator from './components/V2ChatHistoryHydrator';
import V2ReviewStatusHydrator from './components/V2ReviewStatusHydrator';
import V2ReviewStrikeHydrator from './components/V2ReviewStrikeHydrator';
import V2VisibleFavoritesHydrator from './components/V2VisibleFavoritesHydrator';
import WalletView from './components/WalletView';
import Inbox from './components/Inbox';
import Profile from './components/Profile';
import AppearanceSettings from './components/AppearanceSettings';
import PermissionSettings from './components/PermissionSettings';
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
import OwnTrustedReputationCard from './components/OwnTrustedReputationCard';
import TopiSupportAssistant from './components/TopiSupportAssistant';
import './services/nationalBackendCanonicalBridge';
import './services/rateLimitedOnlineBridge';
import './services/canonicalStoreBridge';
import './services/v2LeanChatSnapshotBridge';
import './services/v2StoreChatMutationBridge';
import './services/v2StoreReviewMutationBridge';
import './services/v2CostCutoverSnapshotBridge';
import './services/v2FavoriteMutationCacheBridge';
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

type UtilitySurface = 'explore' | 'wallet' | null;

function MobileApp() {
  const { activeTab, setActiveTab, chats, activeChatId, selectedProductId, user } = useAppStore();
  const [surface, setSurface] = useState<UtilitySurface>(null);
  const unread = chats.reduce((sum, chat) => sum + (chat.sin_leer || 0), 0);
  const v2 = nationalSchemaEnabled();
  const showFeedUtilities = activeTab === 'feed' && surface === null && !activeChatId && !selectedProductId;

  useEffect(() => {
    if (!v2) return;
    void initializeNativeFirebaseSecurity();
  }, [v2]);

  useEffect(() => {
    const onPopState = () => { handleTutopPopState(); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (tab: AppTab) => {
    setSurface(null);
    setActiveTab(tab);
  };

  const content: Record<AppTab, ReactNode> = {
    feed: <Feed />,
    bot: v2 ? <NationalPublishScreen key={user.id} /> : <Chatbot />,
    wallet: <WalletView />,
    inbox: <Inbox />,
    profile: <>
      <Profile />
      <section className="page-pad mt-4 pb-1">
        <button type="button" onClick={() => setSurface('wallet')} className="flex w-full items-center gap-3 rounded-[22px] border border-white/[0.06] bg-white/[0.025] p-4 text-left transition active:scale-[0.99]">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-300"><WalletCards className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-xs">Mi Wallet</strong><span className="mt-1 block text-[9px] leading-4 text-slate-500">Movimientos, U-Coins y actividad de tus transacciones.</span></span>
          <ChevronRight className="h-4 w-4 text-slate-600" />
        </button>
      </section>
      <AppearanceSettings />
      <PermissionSettings />
    </>,
  };

  const renderedContent = surface === 'explore' ? <ExploreScreen /> : surface === 'wallet' ? <WalletView /> : content[activeTab];
  const transitionKey = surface || activeTab;

  return (
    <div className="app-shell">
      <OfflineBanner />
      <WelcomeTour />
      {showFeedUtilities && (
        <div className="page-pad pt-safe pb-1">
          <div className="grid grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] gap-2" aria-label="Acciones de comunidad">
            <DemandRequestComposer />
            <UniversityNetworkSetup />
          </div>
        </div>
      )}
      {v2 && <V2ListingsHydrator />}
      {v2 && <V2NearbyListingsHydrator />}
      {v2 && <V2VisibleFavoritesHydrator />}
      {v2 && <V2ChatHistoryHydrator />}
      {v2 && <V2ReviewStatusHydrator />}
      {v2 && <V2ReviewStrikeHydrator />}
      <main className="min-h-screen pb-[calc(76px+env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait">
          <motion.div key={transitionKey} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
            {renderedContent}
          </motion.div>
        </AnimatePresence>
      </main>

      {!v2 && activeTab === 'bot' && surface === null && !activeChatId && !selectedProductId && <DraftShelf />}
      {activeTab === 'profile' && surface === null && !activeChatId && !selectedProductId && <><SellerTools /><NationalAccountControls />{v2 && <OwnTrustedReputationCard />}</>}
      {!activeChatId && <TopiSupportAssistant />}

      {!activeChatId && (
        <nav className="bottom-nav" aria-label="Navegación principal">
          <NavButton icon={<Home />} label="Inicio" active={surface === null && activeTab === 'feed'} onClick={() => navigate('feed')} />
          <NavButton icon={<Compass />} label="Explorar" active={surface === 'explore'} onClick={() => setSurface('explore')} />
          <NavButton icon={<PlusCircle />} label="Publicar" active={surface === null && activeTab === 'bot'} onClick={() => navigate('bot')} />
          <NavButton icon={<MessageCircle />} label="Mensajes" active={surface === null && activeTab === 'inbox'} onClick={() => navigate('inbox')} badge={unread > 0 ? String(Math.min(unread, 99)) : undefined} />
          <NavButton icon={<UserRound />} label="Perfil" active={surface === 'wallet' || (surface === null && activeTab === 'profile')} onClick={() => navigate('profile')} />
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
