import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { SellerReputationEvidence } from '../lib/reputationEvidence';
import {
  trustedReputationBackend,
  trustedReputationIsFresh,
  type TrustedReputationSnapshot,
} from '../services/trustedReputationBackend';

export default function SellerReputationInline({ sellerId, visibleEvidence }: { sellerId: string; visibleEvidence: SellerReputationEvidence }) {
  const [trusted, setTrusted] = useState<TrustedReputationSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    void trustedReputationBackend.load(sellerId)
      .then((value) => {
        if (!active) return;
        setTrusted(value);
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setTrusted(null);
        setLoaded(true);
      });
    return () => { active = false; };
  }, [sellerId]);

  const hasTrusted = Boolean(trusted && (trusted.seller_review_count > 0 || trusted.completed_as_seller > 0));
  const fresh = trustedReputationIsFresh(trusted);
  const label = hasTrusted
    ? trusted!.seller_review_count > 0 && trusted!.seller_positive_rate != null
      ? `${Math.round(trusted!.seller_positive_rate)}% cumplió · ${trusted!.seller_review_count} ${trusted!.seller_review_count === 1 ? 'reseña' : 'reseñas'}`
      : `${trusted!.completed_as_seller} ${trusted!.completed_as_seller === 1 ? 'venta completada' : 'ventas completadas'}`
    : visibleEvidence.label;
  const detail = hasTrusted
    ? trusted!.seller_review_count > 0
      ? `${trusted!.seller_positive_count} de ${trusted!.seller_review_count} reseñas trusted son positivas.`
      : 'Evidencia trusted basada en operaciones completadas registradas por TuTop.'
    : loaded
      ? visibleEvidence.detail
      : 'Consultando reputación trusted…';
  const hasEvidence = hasTrusted || visibleEvidence.hasEvidence;

  return (
    <div className={`mt-3 rounded-xl p-2.5 ${hasEvidence ? 'bg-emerald-500/[0.06]' : 'bg-white/[0.025]'}`}>
      <div className={`flex items-center gap-1.5 text-[10px] font-black ${hasEvidence ? 'text-emerald-200' : 'text-slate-500'}`}><ShieldCheck className="h-3.5 w-3.5" />{label}</div>
      <p className="mt-1 text-[8px] leading-4 text-slate-600">{detail}</p>
      <p className="mt-1 text-[7px] leading-3 text-slate-700">{hasTrusted ? (fresh ? 'Snapshot trusted actualizado recientemente.' : 'Snapshot trusted no reciente; no se presenta como información en tiempo real.') : 'Sin snapshot trusted reciente: se muestra sólo evidencia visible para tu sesión.'}</p>
    </div>
  );
}
