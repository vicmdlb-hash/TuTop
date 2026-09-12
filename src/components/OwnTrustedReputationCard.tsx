import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  trustedReputationAgeHours,
  trustedReputationBackend,
  trustedReputationIsFresh,
  type TrustedReputationSnapshot,
} from '../services/trustedReputationBackend';
import { useAppStore } from '../store/useAppStore';

export default function OwnTrustedReputationCard() {
  const uid = useAppStore((state) => state.user.id);
  const [snapshot, setSnapshot] = useState<TrustedReputationSnapshot | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (!uid) return;
    let active = true;
    setState('loading');
    void trustedReputationBackend.load(uid)
      .then((value) => {
        if (!active) return;
        setSnapshot(value);
        setState('ready');
      })
      .catch(() => {
        if (!active) return;
        setSnapshot(null);
        setState('error');
      });
    return () => { active = false; };
  }, [uid]);

  const fresh = trustedReputationIsFresh(snapshot);
  const age = trustedReputationAgeHours(snapshot);
  const reviewCount = snapshot?.seller_review_count || 0;
  const positiveRate = snapshot?.seller_positive_rate;
  const completed = snapshot?.completed_as_seller || 0;

  return (
    <section className="mx-4 mt-3 rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.04] p-3" aria-label="Reputación trusted de vendedor">
      <div className="flex items-center gap-2 text-[11px] font-black text-emerald-200"><ShieldCheck className="h-4 w-4" />Reputación trusted</div>
      {state === 'loading' && <p className="mt-2 text-[9px] text-slate-500">Consultando historial agregado…</p>}
      {state === 'error' && <p className="mt-2 text-[9px] text-slate-500">No pudimos consultar el snapshot trusted. TuTop no sustituye ese dato con una puntuación inventada.</p>}
      {state === 'ready' && !snapshot && <p className="mt-2 text-[9px] text-slate-500">Aún no existe un snapshot trusted para tu cuenta.</p>}
      {state === 'ready' && snapshot && <>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/[0.025] p-2"><strong className="block text-sm">{positiveRate == null ? '—' : `${Math.round(positiveRate)}%`}</strong><span className="text-[8px] text-slate-500">Cumplimiento</span></div>
          <div className="rounded-xl bg-white/[0.025] p-2"><strong className="block text-sm">{reviewCount}</strong><span className="text-[8px] text-slate-500">Reseñas</span></div>
          <div className="rounded-xl bg-white/[0.025] p-2"><strong className="block text-sm">{completed}</strong><span className="text-[8px] text-slate-500">Ventas</span></div>
        </div>
        <p className="mt-2 text-[8px] leading-4 text-slate-600">{fresh ? 'Snapshot trusted actualizado recientemente.' : `Snapshot trusted no reciente${age == null ? '' : ` · hace ~${age} h`}; no se presenta como información en tiempo real.`}</p>
      </>}
    </section>
  );
}
