import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, CircleDollarSign, PackageCheck, Search, ShoppingBag, Store } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import ChatConversation from './ChatConversation';

type InboxFilter = 'Todos' | 'Compras' | 'Ventas';

export default function Inbox() {
  const { chats, products, user, activeChatId, openChat } = useAppStore();
  const [filter, setFilter] = useState<InboxFilter>('Todos');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const counters = useMemo(() => ({
    Compras: chats.filter((chat) => chat.comprador_id === user.id).length,
    Ventas: chats.filter((chat) => chat.vendedor_id === user.id).length,
    Pendientes: chats.filter((chat) => chat.vendedor_id === user.id && (chat.sin_leer || 0) > 0).length,
  }), [chats, user.id]);

  const visibleChats = useMemo(() => chats.filter((chat) => {
    const roleMatches = filter === 'Todos' || (filter === 'Compras' ? chat.comprador_id === user.id : chat.vendedor_id === user.id);
    const product = products.find((item) => item.id === chat.producto_id);
    const needle = query.trim().toLowerCase();
    const textMatches = !needle || `${chat.nombre_otro_usuario} ${product?.titulo || ''}`.toLowerCase().includes(needle);
    return roleMatches && textMatches;
  }).sort((a, b) => {
    const aTime = a.mensajes[a.mensajes.length - 1]?.hora || '';
    const bTime = b.mensajes[b.mensajes.length - 1]?.hora || '';
    return bTime.localeCompare(aTime);
  }), [chats, products, filter, query, user.id]);

  if (activeChatId) return <ChatConversation chatId={activeChatId} />;

  return (
    <div className="page-pad pt-safe">
      <header className="flex items-center justify-between pb-3"><div><h1 className="text-[25px] font-black tracking-tight">Mensajes</h1><p className="mt-0.5 text-[10px] text-muted">Compras y ventas separadas para que no se mezclen.</p></div><button onClick={() => setSearching((value) => !value)} className="icon-button-lg" aria-label="Buscar conversaciones"><Search className="h-5 w-5" /></button></header>

      <section className="grid grid-cols-3 gap-2 pb-3">
        <button onClick={() => setFilter('Compras')} className={`rounded-2xl border p-3 text-left ${filter === 'Compras' ? 'border-sky-400/20 bg-sky-500/10' : 'border-white/5 bg-white/[0.025]'}`}><ShoppingBag className="h-4 w-4 text-sky-300" /><strong className="mt-2 block text-lg">{counters.Compras}</strong><span className="text-[9px] text-muted">Compras</span></button>
        <button onClick={() => setFilter('Ventas')} className={`rounded-2xl border p-3 text-left ${filter === 'Ventas' ? 'border-violet-400/20 bg-violet-500/10' : 'border-white/5 bg-white/[0.025]'}`}><Store className="h-4 w-4 text-violet-300" /><strong className="mt-2 block text-lg">{counters.Ventas}</strong><span className="text-[9px] text-muted">Ventas</span></button>
        <button onClick={() => setFilter('Ventas')} className="rounded-2xl border border-white/5 bg-white/[0.025] p-3 text-left"><CircleDollarSign className="h-4 w-4 text-emerald-300" /><strong className="mt-2 block text-lg">{counters.Pendientes}</strong><span className="text-[9px] text-muted">Por responder</span></button>
      </section>

      {searching && <div className="search-field mb-3"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Persona o producto…" /></div>}
      <div className="segmented-control">{(['Todos', 'Compras', 'Ventas'] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={filter === value ? 'active' : ''}>{value}</button>)}</div>

      <div className="mt-3 space-y-2">
        {visibleChats.map((chat, index) => {
          const product = products.find((item) => item.id === chat.producto_id);
          const last = chat.mensajes[chat.mensajes.length - 1];
          if (!product) return null;
          const purchase = chat.comprador_id === user.id;
          const completed = chat.entrega_confirmada;
          return <motion.button onClick={() => openChat(chat.id)} key={chat.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.025, 0.12) }} className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3 text-left"><div className="relative"><img src={product.imagen_url} alt="" className="h-14 w-14 rounded-[13px] object-cover" />{completed && <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-[#050a13] bg-emerald-500 text-white"><CheckCircle2 className="h-3 w-3" /></span>}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-1.5"><strong className="truncate text-[13px]">{chat.nombre_otro_usuario}</strong><span className={`rounded-full px-1.5 py-0.5 text-[7px] font-black ${purchase ? 'bg-sky-500/10 text-sky-300' : 'bg-violet-500/10 text-violet-300'}`}>{purchase ? 'COMPRA' : 'VENTA'}</span></div><span className="shrink-0 text-[9px] text-muted">{last ? new Date(last.hora).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : ''}</span></div><p className="mt-1 truncate text-[11px] font-semibold text-[#A7B0C0]">{product.titulo} · ${product.precio_mxn.toLocaleString('es-MX')}</p><p className="mt-1 truncate text-[11px] text-muted">{last?.texto || (purchase ? 'Pregunta al vendedor' : 'Espera el primer mensaje del comprador')}</p><div className="mt-1.5 flex items-center gap-2 text-[8px] text-slate-600">{completed ? <span className="inline-flex items-center gap-1 text-emerald-400"><PackageCheck className="h-3 w-3" />Completada</span> : <span>{chat.entrega_estado === 'esperando_confirmacion' ? 'Esperando confirmación' : 'En conversación'}</span>}</div></div>{(chat.sin_leer || 0) > 0 && <span className="unread-badge">{chat.sin_leer}</span>}</motion.button>;
        })}
        {visibleChats.length === 0 && <div className="empty-card my-4"><strong className="block text-slate-300">No hay conversaciones aquí.</strong><span className="mt-1 block">{filter === 'Compras' ? 'Cuando contactes un producto aparecerá en Compras.' : filter === 'Ventas' ? 'Los mensajes de personas interesadas aparecerán en Ventas.' : 'Tus conversaciones aparecerán cuando empieces a comprar o vender.'}</span></div>}
      </div>
    </div>
  );
}
