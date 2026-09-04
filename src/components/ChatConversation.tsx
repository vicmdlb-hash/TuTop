import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, MapPin, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function ChatConversation({ chatId }: { chatId: string }) {
  const { chats, products, user, closeChat, sendMessage, markChatRead, confirmDelivery, reviews, submitReview } = useAppStore();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const chat = chats.find((item) => item.id === chatId);
  const product = products.find((item) => item.id === chat?.producto_id);
  const alreadyReviewed = reviews.some((review) => review.chat_id === chatId && review.evaluador_id === user.id);
  const userConfirmed = chat ? (chat.comprador_id === user.id ? chat.confirmaciones_entrega?.comprador : chat.confirmaciones_entrega?.vendedor) : false;
  const waitingText = useMemo(() => {
    if (!chat) return '';
    if (chat.entrega_confirmada) return 'Entrega confirmada por ambas personas';
    if (userConfirmed) return 'Tu confirmación está lista · falta la otra persona';
    return 'Confirma solo después de haber realizado la entrega';
  }, [chat, userConfirmed]);

  useEffect(() => { markChatRead(chatId); }, [chatId, chat?.mensajes.length, markChatRead]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat?.mensajes.length]);
  if (!chat || !product) return <div className="page-pad pt-safe"><button onClick={closeChat}>Regresar</button><div className="empty-card mt-4">La conversación ya no está disponible.</div></div>;

  const submit = () => { if (!text.trim()) return; sendMessage(chatId, text); setText(''); };
  return (
    <div className="chat-screen pt-safe">
      <header className="chat-header">
        <button onClick={closeChat} className="icon-button"><ArrowLeft /></button>
        <img src={product.imagen_url} alt="" className="h-9 w-9 rounded-xl object-cover" />
        <div className="min-w-0 flex-1"><h1 className="truncate text-[13px] font-black">{chat.nombre_otro_usuario}</h1><p className="truncate text-[10px] text-muted">{product.titulo} · ${product.precio_mxn.toLocaleString('es-MX')}</p></div>
      </header>
      <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-white/5 bg-[#0d1725] px-3 py-2 text-[10px] text-muted"><MapPin className="h-3.5 w-3.5 text-success" />{product.punto_encuentro}</div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {chat.mensajes.length === 0 && <div className="mx-auto max-w-[260px] rounded-2xl bg-white/5 p-3 text-center text-[10px] text-muted">Pregunta si sigue disponible o acuerden un punto y horario de entrega.</div>}
        {chat.mensajes.map((message, index) => {
          const mine = message.sender_id ? message.sender_id === user.id : (chat.comprador_id === user.id ? message.emisor === 'comprador' : message.emisor === 'vendedor');
          return <div key={message.id || `${message.hora}-${index}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`message-bubble ${mine ? 'message-user' : 'message-bot'}`}><span>{message.texto}</span>{mine && <span className="mt-1 flex justify-end text-[8px] text-white/55"><CheckCheck className="h-3 w-3" /></span>}</div></div>;
        })}
        <div ref={endRef} />
      </div>
      <section className="mx-4 mb-2 rounded-2xl border border-white/5 bg-[#0b1420] p-3">
        <p className="text-[10px] text-muted">{waitingText}</p>
        {!chat.entrega_confirmada && <button disabled={Boolean(userConfirmed)} onClick={() => confirmDelivery(chatId)} className="mt-2 h-9 w-full rounded-xl bg-emerald-500/15 text-[10px] font-bold text-emerald-300 disabled:opacity-50">{userConfirmed ? 'Confirmación enviada' : 'Confirmar mi parte de la entrega'}</button>}
        {chat.entrega_confirmada && !alreadyReviewed && <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => submitReview(chatId, 'positive')} className="rating-positive"><ThumbsUp />Cumplió</button><button onClick={() => submitReview(chatId, 'negative')} className="rating-negative"><ThumbsDown />No-show</button></div>}
        {alreadyReviewed && <p className="mt-2 text-[10px] font-bold text-success">✓ Ya calificaste esta entrega.</p>}
      </section>
      <div className="chat-composer"><input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="Escribe un mensaje…" maxLength={1500} /><button onClick={submit} disabled={!text.trim()}><Send /></button></div>
    </div>
  );
}
