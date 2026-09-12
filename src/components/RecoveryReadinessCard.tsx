import { KeyRound, ShieldAlert } from 'lucide-react';
import { accountRecoveryReadiness } from '../services/accountRecoveryOrchestrator';

export default function RecoveryReadinessCard() {
  const readiness = accountRecoveryReadiness();
  return (
    <section className="mx-4 mb-4 rounded-2xl border border-amber-300/10 bg-amber-500/[0.035] p-3">
      <div className="flex items-start gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-400/10"><KeyRound className="h-4 w-4 text-amber-200" /></div>
        <div className="min-w-0 flex-1">
          <strong className="block text-[10px] text-slate-100">Recuperación de Clave TuTop</strong>
          <p className="mt-1 text-[9px] leading-4 text-slate-500">{readiness.public_message}</p>
          <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-black/10 px-2.5 py-2 text-[8px] text-slate-500"><ShieldAlert className="h-3.5 w-3.5 text-amber-300" />Requisito de producción: canal verificado + proveedor trusted + rate limit. Nunca se usará conocer un número como prueba de identidad.</div>
        </div>
      </div>
    </section>
  );
}
