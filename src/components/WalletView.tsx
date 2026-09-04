import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Bell, Coins, Info, LockKeyhole, Star } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function WalletView() {
  const { user, transactions } = useAppStore();
  const nextTarget = user.nivel_vendedor === 'Novato' ? 50 : user.nivel_vendedor === 'Pro' ? 200 : user.puntos_prestigio;
  const levelBase = user.nivel_vendedor === 'Pro' ? 50 : 0;
  const progress = user.nivel_vendedor === 'Leyenda' ? 100 : Math.max(0, Math.min(100, ((user.puntos_prestigio - levelBase) / (nextTarget - levelBase)) * 100));

  return (
    <div className="page-pad pt-safe">
      <header className="flex items-center justify-between pb-4"><div className="wordmark"><span>Tu</span><span>Top</span></div><button className="icon-button-lg"><Bell className="h-5 w-5" /></button></header>
      <h1 className="sr-only">Wallet</h1>

      <section className="wallet-balance-card"><div><p className="text-[11px] text-white/65">Saldo actual</p><div className="mt-2 flex items-center gap-3"><span className="big-coin"><Coins className="h-6 w-6" /></span><strong className="text-[38px] leading-none">{user.saldo_ucoins}</strong><span className="text-[15px]">UCoins</span></div><p className="mt-2 text-[10px] text-[#7DD3FC]">Puntos internos de visibilidad · sin valor monetario fijado</p></div><button disabled className="recharge-button opacity-55">Próximamente</button></section>

      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300/10 bg-amber-300/5 p-3 text-[10px] leading-relaxed text-amber-100/70"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><p>Las recargas con dinero real están deshabilitadas. En la beta gratuita, el saldo, las pujas y los PP se guardan en Firestore y las reglas exigen que cada puja descuente el saldo en la misma operación.</p></div>

      <section className="prestige-card mt-3"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><span className="star-disc"><Star className="h-5 w-5" fill="currentColor" /></span><div><div className="flex items-center gap-1"><h2 className="text-[14px] font-bold">Puntos de Prestigio</h2><Info className="h-3.5 w-3.5 text-muted" /></div><p className="mt-1 text-[25px] font-extrabold">{user.puntos_prestigio} PP</p></div></div><span className="text-[11px] text-muted">{user.nivel_vendedor}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#202B3D]"><motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7]" /></div>{user.nivel_vendedor !== 'Leyenda' && <p className="mt-2 text-[11px] text-muted">Faltan <strong className="text-[#FBBF24]">{Math.max(0, nextTarget - user.puntos_prestigio)} PP</strong> para {user.nivel_vendedor === 'Novato' ? 'Pro' : 'Leyenda'}</p>}</section>

      <section className="mt-6"><div className="mb-2 flex items-center justify-between"><h2 className="section-title">Historial de movimientos</h2><span className="text-[10px] text-success">Firestore online</span></div><div className="transaction-list">{transactions.slice(0, 8).map((tx) => <div key={tx.id} className="transaction-row"><span className={`tx-icon ${tx.type === 'income' ? 'tx-income' : 'tx-expense'}`}>{tx.type === 'income' ? <ArrowUp /> : <ArrowDown />}</span><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{tx.description}</p><p className="mt-0.5 text-[10px] text-muted">{new Date(tx.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div><strong className={`text-[12px] ${tx.amount >= 0 ? 'text-success' : 'text-[#FB7185]'}`}>{tx.amount > 0 ? '+' : ''}{tx.amount} UCoins</strong></div>)}</div></section>
    </div>
  );
}
