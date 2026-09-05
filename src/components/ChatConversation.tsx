import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, CircleDollarSign, Flag, ImagePlus, Loader2, MapPin, RefreshCw, Send, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { compressImageForFirestore } from '../lib/imageCompression';
import { feedbackMessage, feedbackSuccess } from '../lib/feedback';
import { onlineBackend } from '../services/onlineBackend';
import { useAppStore } from '../store/useAppStore';

const BUYER_QUICK = ['¿Sigue disponible?', '¿Dónde entregas?', '¿Puedes entregarlo mañana?', 'Me interesa'];
const SELLER_QUICK = ['Sí, sigue disponible', 'Podemos acordar punto y horario', '¿Qué horario te funciona?', 'Puedo resolver tus dudas'];

function parseOffer(text: string) {
  const match = text.match(/(?:te ofrezco|contraoferta:)\s*\$\s*([\d,.]+)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

export default function ChatConversation({ chatId }: { chatId: string }) {
  const { chats, products, user, closeChat, sendMessage, sendImageMessage, markChatRead, confirmDelivery, reviews, submitReview } = useAppStore();
  const [text, setText] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [counterAmount, setCounterAmount] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chat = chats.find((item) => item.id === chatId);
  const product = products.find((item) => item.id === chat?.producto_id);
  const alreadyReviewed = reviews.some((review) => review.chat_id === chatId && review.evaluador_id === user.id);
  const userConfirmed = chat ? (chat.comprador_id === user.id ? chat.confirmaciones_entrega?.comprador : chat.confirmaciones_entrega?.vendedor) : false;
  const isBuyer = chat?.comprador_id === user.id;
  const quickMessages = isBuyer ? BUYER_QUICK : SELLER_QUICK;
  const latestOffer = useMemo(() => {
    if (!chat) return null;
    for (let i = chat.mensajes.length - 1; i >= 0; i -= 1) {
      const message = chat.mensajes[i];
      const amount = parseOffer(message.texto || '');
      if (amount) return { amount, message, index: i };
    }
    return null;
  }, [chat]);
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

  const submitCounter = () => {
    const amount = Number(counterAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    submitText(`Contraoferta: $${Math.round(amount).toLocaleString('es-MX')} por ${product.titulo}. Si te funciona, acordamos entrega.`);
    setCounterAmount('');
    setCounterOpen(false);
  };

  const respondToOffer = (kind: 'accept' | 'reject') => {
    if (!latestOffer) return;
    if (kind === 'accept') submitText(`Acepto tu oferta de $${latestOffer.amount.toLocaleString('es-MX')}. Ahora acordemos un lugar público y horario de entrega.`);
    else submitText(`Gracias por la oferta de $${latestOffer.amount.toLocaleString('es-MX')}, pero por ahora no puedo aceptarla.`);
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
        <button onClick={closeChat} className="icon-button" aria-label="Regresar"><ArrowLeft /></button>
        <img src={product.imagen_url} alt="" className="h-9 w-9 rounded-xl object-cover" />
        <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h1 className="truncate text-[13px] font-black">{chat.nombre_otro_usuario}</h1><span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${isBuyer ? 'bg-sky-500/10 text-sky-300' : 'bg-violet-500/10 text-violet-300'}`}>{isBuyer ? 'COMPRA' : 'VENTA'}</span></div><p className="truncate text-[10px] text-muted">{product.titulo} · ${product.precio_mxn.toLocaleString('es-MX')}</p></div>
      </header>

      <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-white/5 bg-[#0d1725] px-3 py-2 text-[10px] text-muted"><MapPin className="h-3.5 w-3.5 text-success" /><span className="min-w-0 flex-1 truncate">{product.punto_encuentro}</span><button onClick={() => void reportChat()} className="inline-flex items-center gap-1 text-slate-500" aria-label="Reportar conversación"><Flag className="h-3.5 w-3.5" />Reportar</button></div>
      <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl border border-emerald-400/10 bg-emerald-500/[0.05] px-3 py-2 text-[9px] leading-relaxed text-slate-400"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />Acuérdense de verse en un lugar público. No compartas tu domicilio exacto si no es necesario.</div>

      <div className="mx-4 mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {quickMessages.map((message) => <button key={message} onClick={() => submitText(message)} className="shrink-0 rounded-full border border-white/5 bg-white/[0.035] px-3 py-2 text-[9px] font-bold text-slate-400">{message}</button>)}
        {isBuyer && <button onClick={() => setOfferOpen((value) => !value)} className="shrink-0 rounded-full border border-emerald-400/10 bg-emerald-500/10 px-3 py-2 text-[9px] font-bold text-emerald-300"><CircleDollarSign className="mr-1 inline h-3.5 w-3.5" />Hacer oferta</button>}
      </div>

      {offerOpen && isBuyer && <div className="mx-4 mt-2 rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.06] p-3"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-300" /><div className="flex-1"><p className="text-[10px] font-black text-emerald-200">Propón un precio</p><p className="text-[9px] text-slate-500">Se enviará como oferta clara dentro del chat. TuTop no procesa pagos.</p></div></div><div className="mt-2 flex gap-2"><div className="relative flex-1"><span className="absolute left-3 top-2.5 text-xs font-black text-emerald-300">$</span><input value={offerAmount} onChange={(event) => setOfferAmount(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submitOffer()} inputMode="numeric" type="number" min="1" className="h-9 w-full rounded-xl border border-white/5 bg-[#071019] pl-7 pr-3 text-xs outline-none" placeholder={String(Math.max(1, Math.round(product.precio_mxn * 0.9)))} /></div><button disabled={!Number(offerAmount)} onClick={submitOffer} className="rounded-xl bg-emerald-500/15 px-4 text-[10px] font-black text-emerald-300 disabled:opacity-40">Enviar</button></div></div>}

      {!isBuyer && latestOffer && <section className="mx-4 mt-2 rounded-2xl border border-violet-400/10 bg-violet-500/[0.06] p-3"><div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-violet-300" /><div className="flex-1"><p className="text-[10px] font-black text-violet-200">Oferta detectada: ${latestOffer.amount.toLocaleString('es-MX')}</p><p className="text-[9px] text-slate-500">Puedes responder sin escribir todo de nuevo.</p></div></div><div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => respondToOffer('accept')} className="rounded-xl bg-emerald-500/15 py-2 text-[9px] font-black text-emerald-300"><Check className="mr-1 inline h-3.5 w-3.5" />Aceptar</button><button onClick={() => respondToOffer('reject')} className="rounded-xl bg-rose-500/10 py-2 text-[9px] font-black text-rose-300"><X className="mr-1 inline h-3.5 w-3.5" />Rechazar</button><button onClick={() => setCounterOpen((value) => !value)} className="rounded-xl bg-white/[0.05] py-2 text-[9px] font-black text-slate-300"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Contraoferta</button></div>{counterOpen && <div className="mt-2 flex gap-2"><div className="relative flex-1"><span className="absolute left-3 top-2.5 text-xs font-black text-violet-300">$</span><input value={counterAmount} onChange={(event) => setCounterAmount(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submitCounter()} inputMode="numeric" type="number" min="1" className="h-9 w-full rounded-xl border border-white/5 bg-[#071019] pl-7 pr-3 text-xs outline-none" placeholder={String(Math.max(latestOffer.amount + 1, Math.round(product.precio_mxn * 0.95)))} /></div><button disabled={!Number(counterAmount)} onClick={submitCounter} className="rounded-xl bg-violet-500/15 px-4 text-[10px] font-black text-violet-300 disabled:opacity-40">Enviar</button></div>}</section>}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {chat.mensajes.length === 0 && <div className="mx-auto max-w-[270px] rounded-2xl bg-white/5 p-3 text-center text-[10px] text-muted">{isBuyer ? 'Pregunta si sigue disponible, haz una oferta o acuerden entrega.' : 'Cuando llegue una oferta podrás aceptarla, rechazarla o contraofertar desde aquí.'}</div>}
        {chat.mensajes.map((message, index) => {
          const mine = message.sender_id ? message.sender_id === user.id : (chat.comprador_id === user.id ? message.emisor === 'comprador' : message.emisor === 'vendedor');
          const offer = parseOffer(message.texto || '');
          return <div key={message.id || `${message.hora}-${index}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`message-bubble ${mine ? 'message-user' : 'message-bot'} ${message.image_url ? 'overflow-hidden p-1.5' : ''} ${offer ? 'ring-1 ring-emerald-400/20' : ''}`}>{offer && <span className="mb-1 block text-[8px] font-black uppercase tracking-wide text-emerald-300">Oferta · ${offer.toLocaleString('es-MX')}</span>}{message.image_url && <img src={message.image_url} alt="Foto enviada" className="max-h-56 w-full rounded-xl object-cover" />}{message.texto && <span className={message.image_url ? 'block px-1.5 pb-1 pt-2' : ''}>{message.texto}</span>}{mine && <span className="mt-1 flex justify-end px-1 text-[8px] text-white/55"><CheckCheck className="h-3 w-3" /></span>}</div></div>;
        })}
        <div ref={endRef} />
      </div>

      <section className="mx-4 mb-2 rounded-2xl border border-white/5 bg-[#0b1420] p-3">
        <p className="text-[10px] text-muted">{waitingText}</p>
        {!chat.entrega_confirmada && <button disabled={Boolean(userConfirmed)} onClick={() => { confirmDelivery(chatId); feedbackSuccess(); }} className="mt-2 h-9 w-full rounded-xl bg-emerald-500/15 text-[10px] font-bold text-emerald-300 disabled:opacity-50">{userConfirmed ? 'Confirmación enviada' : isBuyer ? 'Confirmar que recibí el producto' : 'Confirmar que entregué el producto'}</button>}
        {chat.entrega_confirmada && !alreadyReviewed && <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => { submitReview(chatId, 'positive'); feedbackSuccess(); }} className="rating-positive"><ThumbsUp />Cumplió</button><button onClick={() => submitReview(chatId, 'negative')} className="rating-negative"><ThumbsDown />No-show</button></div>}
        {alreadyReviewed && <p className="mt-2 text-[10px] font-bold text-success">✓ Ya calificaste esta entrega.</p>}
      </section>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void sendImage(event.target.files?.[0])} />
      <div className="chat-composer"><button className="chat-attach" onClick={() => imageInputRef.current?.click()} disabled={imageBusy} aria-label="Enviar foto">{imageBusy ? <Loader2 className="animate-spin" /> : <ImagePlus />}</button><input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder={isBuyer ? 'Escribe al vendedor…' : 'Responde al comprador…'} maxLength={1500} /><button onClick={submit} disabled={!text.trim()}><Send /></button></div>
    </div>
  );
}
