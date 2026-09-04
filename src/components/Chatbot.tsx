import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Bot, Camera, ImagePlus, Loader2, Send, Sparkles } from 'lucide-react';
import { parseProductMessage } from '../lib/productAssistant';
import { compressImageForFirestore } from '../lib/imageCompression';
import { useAppStore } from '../store/useAppStore';
import type { Message, Product, ProductFormData } from '../types';
import PreviewModal from './PreviewModal';

const fallbackImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
<defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#151b2a"/><stop offset="1" stop-color="#3b1b6c"/></linearGradient></defs>
<rect width="900" height="600" fill="url(#g)"/><circle cx="450" cy="270" r="86" fill="#7c3aed" opacity=".24"/><text x="450" y="300" text-anchor="middle" font-size="72" fill="#d8b4fe" font-family="Arial" font-weight="700">TuTop</text><text x="450" y="365" text-anchor="middle" font-size="24" fill="#94a3b8" font-family="Arial">Foto pendiente</text>
</svg>`)}`;

export default function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([
    { emisor: 'bot', texto: '¡Hola! Soy tu asistente de TuTop 🤖\nCuéntame qué vendes. Puedes darme todo de golpe, por ejemplo: “Vendo brownies a 25 pesos, entrego en cafetería”.', hora: new Date().toISOString() },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [formData, setFormData] = useState<Partial<ProductFormData>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { publishProduct, user, setActiveTab, syncError } = useAppStore();

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      setImageBusy(true);
      const dataUrl = await compressImageForFirestore(file, { maxDimension: 960, maxBytes: 110_000 });
      setImagePreview(dataUrl);
      setFormData((current) => ({ ...current, imagen_url: dataUrl }));
      setMessages((prev) => [...prev, { emisor: 'bot', texto: '📸 Foto optimizada y lista para la publicación online.', hora: new Date().toISOString() }]);
    } catch (error) {
      setMessages((prev) => [...prev, { emisor: 'bot', texto: error instanceof Error ? error.message : 'No pude procesar esa imagen.', hora: new Date().toISOString() }]);
    } finally { setImageBusy(false); }
  };

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isTyping) return;
    setMessages((prev) => [...prev, { emisor: 'user', texto: text, hora: new Date().toISOString() }]);
    setInputText('');
    setIsTyping(true);
    window.setTimeout(() => {
      const result = parseProductMessage(text, formData, user.facultad);
      setFormData(result.data);
      setMessages((prev) => [...prev, { emisor: 'bot', texto: result.response, hora: new Date().toISOString() }]);
      if (result.complete) setShowPreview(true);
      setIsTyping(false);
    }, 420);
  };

  const handlePublish = async (impulsar: boolean) => {
    if (!formData.titulo || !formData.precio_mxn || !formData.categoria || !formData.facultad || !formData.punto_encuentro || publishing) return;
    setPublishing(true);
    const product: Product = {
      id: `prod-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      vendedor_id: user.id,
      vendedor_nombre: user.nombre,
      vendedor_handle: `@${user.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '.').replace(/^\.|\.$/g, '') || 'estudiante'}`,
      vendedor_verificado: user.esta_verificado,
      titulo: formData.titulo,
      descripcion: formData.descripcion || 'Publicación creada con el asistente TuTop.',
      precio_mxn: formData.precio_mxn,
      categoria: formData.categoria,
      facultad: formData.facultad,
      punto_encuentro: formData.punto_encuentro,
      imagen_url: formData.imagen_url || fallbackImage,
      estado: 'Activo',
      es_top: false,
      jerarquia_top: 0,
      puja_ucoins: 0,
      likes: 0,
      fecha_creacion: new Date().toISOString(),
    };

    const ok = await publishProduct(product, impulsar ? 5 : 0);
    setPublishing(false);
    if (!ok) {
      setMessages((prev) => [...prev, { emisor: 'bot', texto: `No pude publicar en Firebase. ${syncError || 'Revisa tu conexión, saldo o reglas de Firestore.'}`, hora: new Date().toISOString() }]);
      return;
    }
    setShowPreview(false);
    setFormData({});
    setImagePreview(null);
    setMessages((prev) => [...prev, { emisor: 'bot', texto: impulsar ? '🚀 Publicación guardada en Firebase y puja de 5 UCoins registrada en la semana actual.' : '✅ Publicación guardada en Firebase. Ya aparece en el mercado online.', hora: new Date().toISOString() }]);
    window.setTimeout(() => setActiveTab('feed'), 550);
  };

  return (
    <div className="chat-screen pt-safe">
      <header className="chat-header">
        <button onClick={() => setActiveTab('feed')} className="icon-button" aria-label="Volver al inicio"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1 text-center"><h1 className="text-[16px] font-bold">Publicar producto</h1><p className="text-[10px] text-success">Firebase online · beta gratuita</p></div>
        <div className="bot-avatar"><Bot className="h-4 w-4" /></div>
      </header>
      <div className="chat-intro"><Sparkles className="h-4 w-4 text-[#C084FC]" /><span>Da varios datos de una vez; te preguntaré solo lo que falte.</span></div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {messages.map((message, index) => (
          <motion.div key={`${message.hora}-${index}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex items-end gap-2 ${message.emisor === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.emisor === 'bot' && <div className="bot-avatar shrink-0"><Bot className="h-4 w-4" /></div>}
            <div className={`message-bubble ${message.emisor === 'user' ? 'message-user' : 'message-bot'}`}>{message.texto.split('\n').map((line, lineIndex) => <span key={`${line}-${lineIndex}`} className="block">{line}</span>)}</div>
          </motion.div>
        ))}
        {imagePreview && <div className="ml-9 max-w-[220px] overflow-hidden rounded-2xl border border-violet-400/20"><img src={imagePreview} alt="Vista previa seleccionada" className="aspect-[4/3] w-full object-cover" /></div>}
        {(isTyping || imageBusy) && <div className="flex items-end gap-2"><div className="bot-avatar"><Bot className="h-4 w-4" /></div><div className="message-bubble message-bot"><Loader2 className="h-4 w-4 animate-spin text-violet-300" /></div></div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-media-row">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} />
        <button disabled={imageBusy} onClick={() => fileInputRef.current?.click()}><ImagePlus />Foto</button>
        <button disabled={imageBusy} onClick={() => fileInputRef.current?.click()}><Camera />Cámara / galería</button>
        <span>La foto se optimiza automáticamente para cargar rápido.</span>
      </div>
      <div className="chat-composer"><input value={inputText} onChange={(event) => setInputText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && handleSend()} placeholder="Ej. Vendo una sudadera en $450…" maxLength={800} /><motion.button whileTap={{ scale: 0.9 }} onClick={handleSend} disabled={!inputText.trim() || isTyping}><Send className="h-5 w-5" /></motion.button></div>
      <AnimatePresence>{showPreview && <PreviewModal formData={formData as ProductFormData} onClose={() => !publishing && setShowPreview(false)} onPublish={(boost) => void handlePublish(boost)} />}</AnimatePresence>
    </div>
  );
}
