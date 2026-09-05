import { useMemo, useState } from 'react';
import { BarChart3, Edit3, Eye, MessageCircle, PackageCheck, Pause, Play, PlusCircle, Store, Tag, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function SellerTools() {
  const { user, products, chats, openProduct, updateProduct, setActiveTab } = useAppStore();
  const [open, setOpen] = useState(false);
  const mine = useMemo(() => products.filter((product) => product.vendedor_id === user.id), [products, user.id]);
  const active = mine.filter((product) => product.estado === 'Activo');
  const paused = mine.filter((product) => product.estado === 'Pausado');
  const sold = mine.filter((product) => product.estado === 'Vendido');
  const buyerChats = chats.filter((chat) => chat.vendedor_id === user.id);
  const unread = buyerChats.reduce((sum, chat) => sum + (chat.sin_leer || 0), 0);
  const completed = buyerChats.filter((chat) => chat.entrega_confirmada).length;
  const inConversation = new Set(buyerChats.filter((chat) => !chat.entrega_confirmada && chat.mensajes.length > 0).map((chat) => chat.producto_id));

  if (!mine.length) return null;

  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] right-4 z-[64] inline-flex h-11 items-center gap-2 rounded-full border border-violet-400/15 bg-[#17102a]/95 px-4 text-[10px] font-black text-violet-200 shadow-xl backdrop-blur" aria-label="Abrir gestión de ventas"><Store className="h-4 w-4" />Gestionar ventas{unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[8px] text-white">{Math.min(unread, 99)}</span>}</button>
      {open && <div className="settings-overlay z-[140]" role="dialog" aria-modal="true" aria-label="Gestión de ventas"><button className="settings-backdrop" aria-label="Cerrar gestión" onClick={() => setOpen(false)} /><div className="settings-sheet max-h-[78vh] overflow-y-auto"><div className="flex items-center justify-between"><div><p className="eyebrow">MODO VENDEDOR</p><h2 className="mt-1 text-xl font-black">Gestiona tus ventas</h2><p className="mt-1 text-[10px] text-muted">Lo importante sin mezclarlo con tus compras.</p></div><button className="icon-button-lg" onClick={() => setOpen(false)} aria-label="Cerrar"><X className="h-5 w-5" /></button></div>

        <div className="mt-4 grid grid-cols-4 gap-2"><Metric icon={<Store />} value={active.length} label="Activos" /><Metric icon={<MessageCircle />} value={unread} label="Pendientes" /><Metric icon={<BarChart3 />} value={inConversation.size} label="En trato" /><Metric icon={<PackageCheck />} value={completed} label="Entregas" /></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => { setOpen(false); setActiveTab('bot'); }} className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-[10px] font-black text-white"><PlusCircle className="h-4 w-4" />Nueva publicación</button><button onClick={() => { setOpen(false); setActiveTab('inbox'); }} className="flex items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.035] py-3 text-[10px] font-black text-slate-300"><MessageCircle className="h-4 w-4" />Ver mensajes</button></div>

        <div className="mt-5 flex items-center justify-between"><h3 className="text-sm font-black">Tus publicaciones</h3><span className="text-[9px] text-muted">{active.length} activas · {paused.length} pausadas · {sold.length} vendidas</span></div>
        <div className="mt-2 space-y-2">{mine.map((product) => { const talking = inConversation.has(product.id); return <article key={product.id} className="rounded-2xl border border-white/5 bg-white/[0.025] p-3"><div className="flex gap-3"><button onClick={() => { setOpen(false); openProduct(product.id); }} className="relative shrink-0"><img src={product.imagen_url} alt={product.titulo} className="h-16 w-16 rounded-xl object-cover" />{talking && <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-[#08111c] bg-sky-500 px-1.5 py-0.5 text-[7px] font-black text-white">EN TRATO</span>}</button><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="truncate text-xs font-black">{product.titulo}</h4><p className="mt-1 text-sm font-black text-emerald-300">${product.precio_mxn.toLocaleString('es-MX')}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-black ${product.estado === 'Activo' ? 'bg-emerald-500/10 text-emerald-300' : product.estado === 'Pausado' ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-500/10 text-slate-400'}`}>{product.estado === 'Activo' ? 'Disponible' : product.estado}</span></div><p className="mt-1 text-[9px] text-muted">{product.stock || 1} disponible{(product.stock || 1) === 1 ? '' : 's'}{talking ? ' · Hay una conversación activa' : ''}</p></div></div><div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => { setOpen(false); openProduct(product.id); }} className="rounded-xl bg-white/[0.04] py-2 text-[9px] font-bold text-slate-300"><Eye className="mr-1 inline h-3.5 w-3.5" />Ver</button>{product.estado === 'Activo' && <button onClick={() => updateProduct(product.id, { estado: 'Pausado', es_top: false, jerarquia_top: 0 })} className="rounded-xl bg-amber-500/10 py-2 text-[9px] font-bold text-amber-300"><Pause className="mr-1 inline h-3.5 w-3.5" />Pausar</button>}{product.estado === 'Pausado' && <button onClick={() => updateProduct(product.id, { estado: 'Activo' })} className="rounded-xl bg-emerald-500/10 py-2 text-[9px] font-bold text-emerald-300"><Play className="mr-1 inline h-3.5 w-3.5" />Activar</button>}{product.estado !== 'Vendido' ? <button onClick={() => updateProduct(product.id, { estado: 'Vendido', es_top: false, jerarquia_top: 0 })} className="rounded-xl bg-violet-500/10 py-2 text-[9px] font-bold text-violet-300"><Tag className="mr-1 inline h-3.5 w-3.5" />Vendido</button> : <button disabled className="rounded-xl bg-white/[0.025] py-2 text-[9px] font-bold text-slate-600"><PackageCheck className="mr-1 inline h-3.5 w-3.5" />Cerrado</button>}</div>{talking && product.estado === 'Activo' && <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-sky-500/[0.06] px-2.5 py-2 text-[8px] text-sky-200"><Edit3 className="h-3 w-3" />“En trato” es una señal local basada en tus chats; el producto sigue disponible hasta que tú lo cambies.</p>}</article>; })}</div>
      </div></div>}
    </>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-2.5 text-center"><span className="mx-auto grid h-7 w-7 place-items-center rounded-lg bg-white/[0.04] text-violet-300 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span><strong className="mt-1.5 block text-sm">{value}</strong><span className="text-[8px] text-muted">{label}</span></div>;
}
