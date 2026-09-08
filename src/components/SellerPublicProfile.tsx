import { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, PackageCheck, ShieldCheck, Store } from 'lucide-react';
import { sellerReputationEvidence } from '../lib/reputationEvidence';
import {
  trustedReputationAgeHours,
  trustedReputationBackend,
  trustedReputationIsFresh,
  type TrustedReputationSnapshot,
} from '../services/trustedReputationBackend';
import { useAppStore } from '../store/useAppStore';

export default function SellerPublicProfile({
  sellerId,
  sellerName,
  faculty,
  verified = false,
  onClose,
}: {
  sellerId: string;
  sellerName: string;
  faculty: string;
  verified?: boolean;
  onClose: () => void;
}) {
  const { products, reviews, chats, openProduct } = useAppStore();
  const visibleEvidence = sellerReputationEvidence(sellerId, reviews, chats);
  const [trusted, setTrusted] = useState<TrustedReputationSnapshot | null>(null);
  const [trustedLoaded, setTrustedLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setTrustedLoaded(false);
    void trustedReputationBackend.load(sellerId)
      .then((value) => {
        if (!active) return;
        setTrusted(value);
        setTrustedLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setTrusted(null);
        setTrustedLoaded(true);
      });
    return () => { active = false; };
  }, [sellerId]);

  const activeListings = products
    .filter((product) => product.vendedor_id === sellerId && product.estado === 'Activo')
    .sort((a, b) => new Date(b.updated_at || b.fecha_creacion).getTime() - new Date(a.updated_at || a.fecha_creacion).getTime());

  const hasTrustedEvidence = Boolean(trusted && (trusted.seller_review_count > 0 || trusted.completed_as_seller > 0));
  const trustedFresh = trustedReputationIsFresh(trusted);
  const trustedAgeHours = trustedReputationAgeHours(trusted);
  const reputationLabel = hasTrustedEvidence
    ? trusted!.seller_review_count > 0 && trusted!.seller_positive_rate != null
      ? `${Math.round(trusted!.seller_positive_rate)}% cumplió · ${trusted!.seller_review_count} ${trusted!.seller_review_count === 1 ? 'reseña' : 'reseñas'}`
      : `${trusted!.completed_as_seller} ${trusted!.completed_as_seller === 1 ? 'venta completada' : 'ventas completadas'}`
    : visibleEvidence.label;
  const reputationDetail = hasTrustedEvidence
    ? trusted!.seller_review_count > 0
      ? `${trusted!.seller_positive_count} de ${trusted!.seller_review_count} reseñas trusted de vendedor son positivas.`
      : 'Snapshot trusted basado en operaciones completadas registradas por TuTop.'
    : trustedLoaded
      ? visibleEvidence.detail
      : 'Cargando reputación trusted…';
  const reputationHasEvidence = hasTrustedEvidence || visibleEvidence.hasEvidence;
  const trustedFreshnessNote = hasTrustedEvidence
    ? trustedFresh
      ? 'Reputación trusted agregada por TuTop y actualizada recientemente; el cliente no puede fabricarla ni modificarla.'
      : `Snapshot trusted pendiente de actualización reciente${trustedAgeHours == null ? '' : ` · hace ~${trustedAgeHours} h`}. Los valores siguen siendo trusted, pero no se presentan como información en tiempo real.`
    : 'Si no existe snapshot trusted, TuTop muestra sólo evidencia visible para esta sesión y no la presenta como reputación pública completa.';

  return (
    <div className="fixed inset-0 z-[90] bg-[#050a13] text-white" role="dialog" aria-modal="true" aria-label={`Perfil público de ${sellerName}`}>
      <div className="mx-auto min-h-full max-w-xl pb-[calc(24px+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-[#050a13]/95 px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] backdrop-blur">
          <button onClick={onClose} className="icon-button-lg" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button>
          <div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-violet-300">PERFIL PÚBLICO</p><h1 className="text-base font-black">Vendedor en TuTop</h1></div>
        </header>

        <main className="px-4 pt-5">
          <section className="rounded-3xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-xl font-black">{sellerName.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><h2 className="truncate text-lg font-black">{sellerName}</h2>{verified && <BadgeCheck className="h-5 w-5 text-sky-400" fill="currentColor" />}</div>
                <p className="mt-0.5 text-[11px] text-slate-500">Facultad de {faculty}</p>
                <div className="mt-2 flex flex-wrap gap-2">{verified && <span className="verified-pill"><ShieldCheck className="h-3.5 w-3.5" />Identidad verificada</span>}<span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-1 text-[9px] font-bold text-slate-400"><Store className="h-3 w-3" />{activeListings.length} {activeListings.length === 1 ? 'publicación activa' : 'publicaciones activas'}</span></div>
              </div>
            </div>

            <div className={`mt-4 rounded-2xl p-3 ${reputationHasEvidence ? 'bg-emerald-500/[0.07]' : 'bg-white/[0.025]'}`}>
              <div className={`flex items-center gap-2 text-[11px] font-black ${reputationHasEvidence ? 'text-emerald-200' : 'text-slate-500'}`}><ShieldCheck className="h-4 w-4" />{reputationLabel}</div>
              <p className="mt-1 text-[9px] leading-4 text-slate-500">{reputationDetail}</p>
              <p className="mt-2 text-[8px] leading-4 text-slate-600">{trustedFreshnessNote}</p>
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">MARKETPLACE</p><h2 className="mt-1 text-sm font-black">Publicaciones activas</h2></div><PackageCheck className="h-5 w-5 text-violet-300" /></div>
            {activeListings.length ? <div className="grid grid-cols-2 gap-2">{activeListings.map((product) => (
              <button key={product.id} onClick={() => { onClose(); openProduct(product.id); }} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025] text-left">
                <img src={product.imagen_url} alt={product.titulo} className="aspect-[4/3] w-full object-cover" />
                <div className="p-2.5"><p className="line-clamp-2 text-[10px] font-bold leading-4">{product.titulo}</p><p className="mt-1 text-xs font-black text-emerald-300">${product.precio_mxn.toLocaleString('es-MX')}</p><p className="mt-1 text-[8px] text-slate-600">{product.categoria}</p></div>
              </button>
            ))}</div> : <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center"><Store className="mx-auto h-6 w-6 text-slate-700" /><p className="mt-2 text-xs font-bold text-slate-400">Sin publicaciones activas</p><p className="mt-1 text-[9px] text-slate-600">El historial no se rellena con anuncios vendidos o privados.</p></div>}
          </section>
        </main>
      </div>
    </div>
  );
}
