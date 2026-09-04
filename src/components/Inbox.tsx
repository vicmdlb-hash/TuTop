import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import ChatConversation from './ChatConversation';

export default function Inbox() {
  const { chats, products, user, activeChatId, openChat } = useAppStore();
  const [filter, setFilter] = useState<'Todos' | 'Compras' | 'Ventas'>('Todos');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const visibleChats = useMemo(() => chats.filter((chat) => {
    const roleMatches = filter === 'Todos' || (filter === 'Compras' ? chat.comprador_id === user.id : chat.vendedor_id === user.id);
    const product = products.find((item) => item.id === chat.producto_id);
    const needle = query.trim().toLowerCase();
    const textMatches = !needle || `${chat.nombre_otro_usuario} ${product?.titulo || ''}`.toLowerCase().includes(needle);
    return roleMatches && textMatches;
  }), [chats, products, filter, query, user.id]);

  if (activeChatId) return <ChatConversation chatId={activeChatId} />;

  return (
    <div className="page-pad pt-safe">
      <header className="flex items-center justify-between pb-4"><h1 className="text-[25px] font-black tracking-tight">Mensajes</h1><button onClick={() => setSearching((value) => !value)} className="icon-button-lg" aria-label="Buscar conversaciones"><Search className="h-5 w-5" /></button></header>
      {searching && <div className="search-field mb-3"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversación…" /></div>}
      <div className="segmented-control">{(['Todos', 'Compras', 'Ventas'] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={filter === value ? 'active' : ''}>{value}</button>)}</div>
      <div className="mt-3 divide-y divide-white/5 border-y border-white/5">
        {visibleChats.map((chat, index) => {
          const product = products.find((item) => item.id === chat.producto_id);
          const last = chat.mensajes[chat.mensajes.length - 1];
          if (!product) return null;
          return <motion.button onClick={() => openChat(chat.id)} key={chat.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="conversation-row"><img src={product.imagen_url} alt="" className="h-14 w-14 rounded-[13px] object-cover" /><div className="min-w-0 flex-1 text-left"><div className="flex items-center justify-between gap-2"><strong className="truncate text-[14px]">{chat.nombre_otro_usuario}</strong><span className="shrink-0 text-[10px] text-muted">{last ? new Date(last.hora).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : ''}</span></div><p className="mt-0.5 truncate text-[11px] text-[#A7B0C0]">{product.titulo}</p><p className="mt-1 truncate text-[12px] text-muted">{last?.texto || 'Inicia la conversación'}</p></div>{(chat.sin_leer || 0) > 0 && <span className="unread-badge">{chat.sin_leer}</span>}</motion.button>;
        })}
        {visibleChats.length === 0 && <div className="empty-card my-4">No hay conversaciones en esta sección.</div>}
      </div>
    </div>
  );
}
