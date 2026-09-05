import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, CircleDollarSign, Flag, ImagePlus, Loader2, MapPin, Send, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { compressImageForFirestore } from '../lib/imageCompression';
import { feedbackMessage, feedbackSuccess } from '../lib/feedback';
import { onlineBackend } from '../services/onlineBackend';
import { useAppStore } from '../store/useAppStore';

const QUICK_MESSAGES = ['¿Sigue disponible?', '¿Aceptas ofertas?', '¿Dónde entregas?', 'Me interesa'];

export default function ChatConversation({ chatId }: { chatId: string }) {
  const { chats, products, user, closeChat, sendMessage, sendImageMessage, markChatRead, confirmDelivery, reviews, submitReview } = useAppStore();
  const [text, setText] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chat = chats.find((item) => item.id === chatId);
  const product = products.find((item) => item.id === chat?.producto_id);
  const alreadyReviewed = reviews.some((review) => review.chat_id === chatId && review.evaluador_id === user.id);
  const userConfirmed = chat ? (chat.comprador_id === user.id ? chat.confirmaciones_entrega?.comprador : chat.confirmaciones_entrega?.vendedor) : false;
  const isBuyer = chat?.comprador_id === user.id;
  const waitingText = useMemo(() => {
    if (!chat) return '';
    if (chat.entrega_confirmada) return 'Entrega confirmada por ambas personas';
    if (userConfirmed) return 'Tu confirmación está lista · falta la otra persona';
    return 'Confirma solo después de haber realizado la entrega';
  }, [chat, userConfirmed]);

  useEffect(() => { markChatRead(chatId); }, [chatId, chat?.mensajes.length, markChatRead]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat?.mensajes.length]);
  if (!chat || !product) return <div className="page-pad pt-safe"><button onClick={closeChat}>Regresar</button><div className="empty-card mt-4">La conversación ya no está disponible.</div></div>;

  const submitText = (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    sendMessage(chatId, clean);
    feedbackMessage();
  };

  const submit = () => {
    if (!text.trim()) return;
    submitText(text);
    setText('');
  };

  const submitOffer = () => {
    const amount = Number(offerAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    submitText(`Te ofrezco $${Math.round(amount).toLocaleString('es-MX')} por ${product.titulo}. ¿Te funciona?`);
    setOfferAmount('');
    setOfferOpen(false);
  };

  const sendImage = async (file?: File) => {
    if (!file) return;
    try {
      setImageBusy(true);
      const image = await compressImageForFirestore(file, { maxDimension: 900, maxBytes: 78_000 });
      sendImageMessage(chatId, image);
    } catch {
      window.alert('No pudimos preparar esa imagen. Intenta con otra foto.');
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const reportChat = async () => {
    const reason = window.prompt('¿Qué ocurrió en esta conversación?');
    if (!reason || reason.trim().length < 3) return;
    try {
      await onlineBackend.submitReport('chat', chatId, reason);
      window.alert('Reporte enviado. El equipo de TuTop revisará la conversación.');
    } catch {
      window.alert('No pudimos enviar el reporte. Inténtalo otra vez.');
    }
  };

  return (
    <div className="chat-screen pt-safe">
      <header className="chat-header">
        <button onClick={closeChat} className="icon-button"><ArrowLeft /></button>
        <img src={product.imagen_url} alt="" className="h-9 w-9 rounded-xl object-cover" />
        <div className="min-w-0 flex-1"><h1 className="truncate text-[13px] font-black">{chat.nombre_otro_usuario}</h1><p className="truncate text-[10px] text-muted">{product.titulo} · ${product.precio_mxn.toLocaleString('es-MX')}</p></div>
      </header>
      <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-white/5 bg-[#0d1725] px-3 py-2 text-[10px] text-muted"><MapPin className="h-3.5 w-3.5 text-success" /><span className="min-w-0 flex-1 truncate">{product.punto_encuentro}</span><button onClick={() => void reportChat()} className="inline-flex items-center gap-1 text-slate-500" aria-label="Reportar conversación"><Flag className="h-3.5 w-3.5" />Reportar</button></div>

      <div className="mx-4 mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {QUICK_MESSAGES.map((message) => <button key={message} onClick={() => submitText(message)} className="shrink-0 rounded-full border border-white/5 bg-white/[0.035] px-3 py-2 text-[9px] font-bold text-slate-400">{message}</button>)}
        {isBuyer && <button onClick={() => setOfferOpen((value) => !value)} className="shrink-0 rounded-full border border-emerald-400/10 bg-emerald-500/10 px-3 py-2 text-[9px] font-bold text-emerald-300"><CircleDollarSign className="mr-1 inline h-3.5 w-3.5" />Hacer oferta</button>}
      </div>

      {offerOpen && isBuyer && <div className="mx-4 mt-2 rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.06] p-3"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-300" /><div className="flex-1"><p className="text-[10px] font-black text-emerald-200">Propón un precio</p><p className="text-[9px] text-slate-500">Se enviará como mensaje para que la otra persona pueda aceptar, rechazar o contraofertar.</p></div></div><div className="mt-2 flex gap-2"><div className="relative flex-1"><span className="absolute left-3 top-2.5 text-xs font-black text-emerald-300">$</span><input value={offerAmount} onChange={(event) => setOfferAmount(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submitOffer()} inputMode="numeric" type="number" min="1" className="h-9 w-full rounded-xl border border-white/5 bg-[#071019] pl-7 pr-3 text-xs outline-none" placeholder={String(Math.max(1, Math.round(product.precio_mxn * 0.9)))} /></div><button disabled={!Number(offerAmount)} onClick={submitOffer} className="rounded-xl bg-emerald-500/15 px-4 text-[10px] font-black text-emerald-300 disabled:opacity-40">Enviar</button></div></div>}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {chat.mensajes.length === 0 && <div className="mx-auto max-w-[260px] rounded-2xl bg-white/5 p-3 text-center text-[10px] text-muted">Pregunta si sigue disponible, haz una oferta o acuerden un punto y horario de entrega.</div>}
        {chat.mensajes.map((message, index) => {
          const mine = message.sender_id ? message.sender_id === user.id : (chat.comprador_id === user.id ? message.emisor === 'comprador' : message.emisor === 'vendedor');
          return <div key={message.id || `${message.hora}-${index}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`message-bubble ${mine ? 'message-user' : 'message-bot'} ${message.image_url ? 'overflow-hidden p-1.5' : ''}`}>{message.image_url && <img src={message.image_url} alt="Foto enviada" className="max-h-56 w-full rounded-xl object-cover" />}{message.texto && <span className={message.image_url ? 'block px-1.5 pb-1 pt-2' : ''}>{message.texto}</span>}{mine && <span className="mt-1 flex justify-end px-1 text-[8px] text-white/55"><CheckCheck className="h-3 w-3" /></span>}</div></div>;
        })}
        <div ref={endRef} />
      </div>
      <section className="mx-4 mb-2 rounded-2xl border border-white/5 bg-[#0b1420] p-3">
        <p className="text-[10px] text-muted">{waitingText}</p>
        {!chat.entrega_confirmada && <button disabled={Boolean(userConfirmed)} onClick={() => { confirmDelivery(chatId); feedbackSuccess(); }} className="mt-2 h-9 w-full rounded-xl bg-emerald-500/15 text-[10px] font-bold text-emerald-300 disabled:opacity-50">{userConfirmed ? 'Confirmación enviada' : 'Confirmar mi parte de la entrega'}</button>}
        {chat.entrega_confirmada && !alreadyReviewed && <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => { submitReview(chatId, 'positive'); feedbackSuccess(); }} className="rating-positive"><ThumbsUp />Cumplió</button><button onClick={() => submitReview(chatId, 'negative')} className="rating-negative"><ThumbsDown />No-show</button></div>}
        {alreadyReviewed && <p className="mt-2 text-[10px] font-bold text-success">✓ Ya calificaste esta entrega.</p>}
      </section>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void sendImage(event.target.files?.[0])} />
      <div className="chat-composer"><button className="chat-attach" onClick={() => imageInputRef.current?.click()} disabled={imageBusy} aria-label="Enviar foto">{imageBusy ? <Loader2 className="animate-spin" /> : <ImagePlus />}</button><input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="Escribe un mensaje…" maxLength={1500} /><button onClick={submit} disabled={!text.trim()}><Send /></button></div>
    </div>
  );
}
