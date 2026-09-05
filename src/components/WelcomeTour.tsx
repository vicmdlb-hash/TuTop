import { useState } from 'react';
import { ArrowRight, Check, Search, ShieldCheck, Sparkles, Store, X } from 'lucide-react';
import { MARKETPLACE_CATEGORIES } from '../lib/productAssistant';

const TOUR_KEY = 'tutop.onboarding.v1';
const INTEREST_KEY = 'tutop.interests.v1';

export default function WelcomeTour() {
  const [visible, setVisible] = useState(() => localStorage.getItem(TOUR_KEY) !== 'done');
  const [step, setStep] = useState(1);
  const [interests, setInterests] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(INTEREST_KEY) || '[]'); } catch { return []; }
  });

  if (!visible) return null;

  const finish = () => {
    try {
      localStorage.setItem(TOUR_KEY, 'done');
      localStorage.setItem(INTEREST_KEY, JSON.stringify(interests.slice(0, 6)));
    } catch { /* onboarding must never block access */ }
    setVisible(false);
  };

  const toggleInterest = (category: string) => {
    setInterests((current) => current.includes(category) ? current.filter((item) => item !== category) : current.length < 6 ? [...current, category] : current);
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-end bg-black/75 backdrop-blur-sm sm:place-items-center" role="dialog" aria-modal="true" aria-label="Bienvenida a TuTop">
      <section className="w-full max-w-md rounded-t-[28px] border border-white/10 bg-[#09111d] p-5 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]">
        <div className="flex items-center justify-between"><div><p className="eyebrow">BIENVENIDO A TUTOP</p><p className="mt-1 text-[10px] text-slate-500">{step} de 3</p></div><button onClick={finish} className="icon-button" aria-label="Saltar tutorial"><X className="h-4 w-4" /></button></div>
        <div className="mt-3 flex gap-1.5">{[1, 2, 3].map((item) => <div key={item} className={`h-1.5 flex-1 rounded-full ${item <= step ? 'bg-violet-500' : 'bg-white/[0.06]'}`} />)}</div>

        {step === 1 && <div className="py-7 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-2xl font-black shadow-lg shadow-violet-950/50">T</div><h1 className="mt-5 text-2xl font-black">Tu comunidad compra y vende aquí</h1><p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-slate-400">Explora rápido, publica en pocos pasos y habla directamente con otros estudiantes. Sin lenguaje técnico ni procesos innecesarios.</p><div className="mt-5 grid grid-cols-3 gap-2 text-[9px]"><div className="rounded-2xl bg-white/[0.035] p-3"><Search className="mx-auto h-5 w-5 text-sky-300" /><strong className="mt-2 block">Encuentra</strong></div><div className="rounded-2xl bg-white/[0.035] p-3"><Store className="mx-auto h-5 w-5 text-emerald-300" /><strong className="mt-2 block">Vende</strong></div><div className="rounded-2xl bg-white/[0.035] p-3"><ShieldCheck className="mx-auto h-5 w-5 text-violet-300" /><strong className="mt-2 block">Con confianza</strong></div></div></div>}

        {step === 2 && <div className="py-5"><div className="flex items-center gap-3"><span className="brand-mini">T</span><div><h2 className="text-lg font-black">Conoce a Topi</h2><p className="text-[10px] text-slate-500">Tu compañero dentro de TuTop.</p></div></div><div className="mt-4 rounded-2xl border border-violet-400/10 bg-violet-500/[0.055] p-4"><Sparkles className="h-5 w-5 text-violet-300" /><p className="mt-3 text-xs leading-5 text-slate-300">Topi puede sugerir una categoría, mejorar un anuncio, orientar un precio o ayudarte a preguntar antes de comprar.</p><strong className="mt-3 block text-xs text-white">Nunca publica ni envía nada por ti.</strong></div><p className="mt-4 text-[10px] leading-5 text-slate-500">Puedes ignorarlo, minimizarlo o usarlo solo cuando te ahorre tiempo.</p></div>}

        {step === 3 && <div className="py-5"><h2 className="text-lg font-black">¿Qué te interesa?</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">Es opcional. Solo sirve para ordenar mejor “Para ti” y puedes seguir viendo todo cuando quieras.</p><div className="mt-4 flex max-h-52 flex-wrap gap-2 overflow-y-auto">{MARKETPLACE_CATEGORIES.map((category) => { const active = interests.includes(category); return <button key={category} onClick={() => toggleInterest(category)} className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] font-bold ${active ? 'border-violet-400/30 bg-violet-500/15 text-violet-100' : 'border-white/5 bg-white/[0.025] text-slate-400'}`}>{active && <Check className="h-3 w-3" />}{category}</button>; })}</div><p className="mt-3 text-[9px] text-slate-600">Puedes elegir hasta 6. También puedes no elegir ninguna.</p></div>}

        <div className="mt-2 flex gap-2">{step > 1 && <button onClick={() => setStep((current) => current - 1)} className="rounded-2xl border border-white/5 bg-white/[0.025] px-4 py-3 text-xs font-bold text-slate-400">Atrás</button>}<button onClick={() => step < 3 ? setStep((current) => current + 1) : finish()} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-xs font-black text-white">{step < 3 ? 'Continuar' : 'Entrar a TuTop'}<ArrowRight className="h-4 w-4" /></button></div>
        <button onClick={finish} className="mt-3 w-full text-center text-[9px] font-semibold text-slate-600">Saltar por ahora</button>
      </section>
    </div>
  );
}
