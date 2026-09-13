import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, HelpCircle, Loader2, Mic, RotateCcw, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { startTopiDictation } from '../lib/topiVoice';
import { supportNode, type SupportRouteId } from '../lib/supportDecisionTree';
import { answerConsumerSupport, type SupportAnswer } from '../services/topiConsumerSupport';
import TopiMascot from './TopiMascot';

export default function TopiSupportAssistant() {
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState<SupportRouteId[]>(['root']);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<SupportAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentId = route[route.length - 1] || 'root';
  const node = useMemo(() => supportNode(currentId), [currentId]);

  const choose = (next: SupportRouteId) => {
    setRoute((current) => [...current, next]);
    setAnswer(null);
    setQuestion('');
  };
  const back = () => {
    if (route.length <= 1) return;
    setRoute((current) => current.slice(0, -1));
    setAnswer(null);
    setQuestion('');
  };
  const reset = () => {
    setRoute(['root']);
    setAnswer(null);
    setQuestion('');
  };

  const ask = async () => {
    const clean = question.trim();
    if (clean.length < 3 || busy) return;
    setBusy(true);
    try {
      const result = await answerConsumerSupport(clean, currentId);
      setAnswer(result);
      if (result.route !== 'root' && result.route !== currentId) setRoute((current) => [...current, result.route]);
    } finally { setBusy(false); }
  };

  const dictate = () => {
    startTopiDictation({
      onText: (text) => setQuestion((current) => `${current}${current ? ' ' : ''}${text}`.slice(0, 900)),
      onStatus: (status) => setListening(status === 'listening'),
    });
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-[65] flex items-center gap-2 rounded-2xl border border-violet-300/20 bg-violet-600 px-3 py-2.5 text-[10px] font-black text-white shadow-2xl shadow-violet-950/40" aria-label="Abrir Topi">
        <TopiMascot className="h-7 w-7" /><span>Pregúntale a Topi</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/60 px-2 pb-[calc(82px+env(safe-area-inset-bottom))] pt-safe backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[78vh] w-full overflow-hidden rounded-[26px] border border-violet-300/15 bg-[#0d111a] shadow-2xl sm:max-w-md">
        <header className="flex items-center gap-3 border-b border-white/[0.06] p-4">
          <TopiMascot className="h-11 w-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black">Topi</h2>
            <p className="mt-0.5 text-[9px] text-slate-500">Tu amigo para resolver dudas y usar TuTop.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05] text-slate-400" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </header>

        <div className="max-h-[calc(78vh-72px)] overflow-y-auto p-4">
          <div className="mb-3 flex items-center gap-2">
            {route.length > 1 && <button type="button" onClick={back} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-2 py-1.5 text-[9px] font-bold text-slate-300"><ArrowLeft className="h-3 w-3" />Atrás</button>}
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.04] px-2 py-1.5 text-[9px] font-bold text-slate-400"><RotateCcw className="h-3 w-3" />Inicio</button>
          </div>

          <div className={`rounded-2xl border p-4 ${node.priority === 'safety' ? 'border-amber-300/15 bg-amber-500/[0.05]' : 'border-violet-300/10 bg-violet-500/[0.04]'}`}>
            <div className="flex items-center gap-2">{node.priority === 'safety' ? <ShieldCheck className="h-4 w-4 text-amber-300" /> : <HelpCircle className="h-4 w-4 text-violet-300" />}<strong className="text-xs">{node.title}</strong></div>
            <p className="mt-2 text-[10px] leading-5 text-slate-400">{node.prompt}</p>
            {node.answer && <div className="mt-3 rounded-xl bg-black/10 p-3 text-[10px] leading-5 text-slate-300">{node.answer}</div>}
          </div>

          {node.choices?.length ? (
            <div className="mt-3 grid gap-2">{node.choices.map((choice) => <button key={choice.id} type="button" onClick={() => choose(choice.next)} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-left text-[10px] font-bold text-slate-200 transition active:scale-[0.99]">{choice.label}</button>)}</div>
          ) : (
            <div className="mt-3 flex gap-2"><button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-[9px] font-black text-emerald-200">Ya quedó</button><button type="button" onClick={() => inputRef.current?.focus()} className="flex-1 rounded-xl bg-violet-500/10 px-3 py-2.5 text-[9px] font-black text-violet-200">Preguntar otra cosa</button></div>
          )}

          {answer && (
            <div className="mt-3 rounded-2xl border border-emerald-300/10 bg-emerald-500/[0.04] p-4">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-300" /><strong className="text-[10px] text-emerald-200">Topi</strong></div>
              <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-slate-300">{answer.text}</p>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
            <label className="text-[9px] font-bold text-slate-400">Escribe o dicta tu pregunta</label>
            <div className="mt-2 flex gap-2">
              <input ref={inputRef} value={question} onChange={(event) => setQuestion(event.target.value.slice(0, 900))} onKeyDown={(event) => { if (event.key === 'Enter') void ask(); }} className="min-w-0 flex-1 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 text-[10px] outline-none placeholder:text-slate-700 focus:border-violet-400/30" placeholder="Ej. ¿Cómo publico algo cerca de mi campus?" />
              <button type="button" onClick={dictate} className={`grid h-10 w-10 place-items-center rounded-xl ${listening ? 'bg-fuchsia-500 text-white' : 'bg-violet-500/10 text-violet-300'}`} aria-label="Dictar pregunta"><Mic className="h-4 w-4" /></button>
              <button type="button" disabled={busy || question.trim().length < 3} onClick={() => void ask()} className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white disabled:opacity-40" aria-label="Preguntar a Topi">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
            </div>
            <p className="mt-2 text-[8px] leading-4 text-slate-600">Por seguridad, no compartas contraseñas, códigos, tarjetas ni tu domicilio exacto.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
