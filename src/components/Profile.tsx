import { useRef, useState } from 'react';
import { BadgeCheck, Camera, Database, Edit3, ExternalLink, LogOut, MoreVertical, Pause, Play, Settings, ShieldCheck, Star, Tag, Volume2, VolumeX, X } from 'lucide-react';
import { compressImageForFirestore } from '../lib/imageCompression';
import { MARKETPLACE_CATEGORIES, VALID_MEETING_POINTS } from '../lib/productAssistant';
import { sellerReputationEvidence } from '../lib/reputationEvidence';
import { FACULTIES } from '../lib/universityNetwork';
import { isSoundEnabled, setSoundEnabled } from '../lib/feedback';
import { onlineBackend } from '../services/onlineBackend';
import { useAppStore } from '../store/useAppStore';
import type { Product, ProductCategory } from '../types';

export default function Profile() {
  const { user, products, chats, reviews, updateProduct, openProduct, isAdmin, clearOnline, hydrateOnline } = useAppStore();
  const [status, setStatus] = useState<'Activo' | 'Pausado' | 'Vendido'>('Activo');
  const [showSettings, setShowSettings] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const verificationInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profileName, setProfileName] = useState(user.nombre);
  const [profileFaculty, setProfileFaculty] = useState(user.facultad);
  const [profileBusy, setProfileBusy] = useState(false);
  const [soundEnabled, setSoundState] = useState(() => isSoundEnabled());
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const myProducts = products.filter((product) => product.vendedor_id === user.id && product.estado === status);
  const reputation = sellerReputationEvidence(user.id, reviews, chats);
  const target = user.nivel_vendedor === 'Novato' ? 50 : user.nivel_vendedor === 'Pro' ? 200 : user.puntos_prestigio;
  const progress = user.nivel_vendedor === 'Leyenda' ? 100 : Math.min(100, (user.puntos_prestigio / Math.max(target, 1)) * 100);
  const institutionId = user.institution_id || user.university?.institution_id;
  const institutionLabel = user.university?.institution_name || institutionId || 'Red TuTop';
  const facultyLabel = user.university?.faculty_name || user.facultad || 'Sin facultad';
  const facultyOptions = FACULTIES.filter((item) => !institutionId || item.institution_id === institutionId).map((item) => item.name);

  const signOut = () => {
    onlineBackend.signOut();
    clearOnline();
    window.location.reload();
  };

  const saveProfile = async () => {
    if (profileName.trim().length < 2) return;
    try {
      setProfileBusy(true);
      await onlineBackend.updateProfile({ nombre: profileName, facultad: profileFaculty });
      hydrateOnline(await onlineBackend.loadSnapshot());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo guardar el perfil.');
    } finally { setProfileBusy(false); }
  };

  const updateAvatar = async (file?: File) => {
    if (!file) return;
    try {
      setAvatarBusy(true);
      const image = await compressImageForFirestore(file, { maxDimension: 640, maxBytes: 70_000 });
      await onlineBackend.updateProfile({ avatar_url: image });
      hydrateOnline(await onlineBackend.loadSnapshot());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo actualizar la foto.');
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = '';
    }
  };

  const submitVerification = async (file?: File) => {
    if (!file) return;
    try {
      setVerificationStatus('Comprimiendo y enviando credencial…');
      const image = await compressImageForFirestore(file, { maxDimension: 1400, maxBytes: 155_000 });
      await onlineBackend.submitVerification(image);
      setVerificationStatus('Solicitud enviada. Aparecerá en MiTuTop Admin para revisión.');
    } catch (error) {
      setVerificationStatus(error instanceof Error ? error.message : 'No se pudo enviar la credencial.');
    } finally {
      if (verificationInput.current) verificationInput.current.value = '';
    }
  };

  const saveProductEdit = () => {
    if (!editingProduct || editingProduct.titulo.trim().length < 2 || editingProduct.precio_mxn <= 0) return;
    updateProduct(editingProduct.id, {
      titulo: editingProduct.titulo.trim().slice(0, 120),
      descripcion: editingProduct.descripcion?.trim().slice(0, 1000) || '',
      precio_mxn: Math.max(1, Number(editingProduct.precio_mxn)),
      stock: Math.max(1, Math.min(99, Number(editingProduct.stock || 1))),
      categoria: editingProduct.categoria,
      punto_encuentro: editingProduct.punto_encuentro,
    });
    setEditingProduct(null);
  };

  return (
    <div className="pb-4">
      <div className="profile-cover pt-safe">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(168,85,247,.45),transparent_32%),radial-gradient(circle_at_78%_16%,rgba(56,189,248,.18),transparent_30%),linear-gradient(135deg,#111827,#22113f_58%,#07101c)]" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#050a13] to-transparent" />
        <button aria-label="Abrir configuración" onClick={() => setShowSettings(true)} className="absolute right-4 top-[calc(12px+env(safe-area-inset-top))] z-10 icon-button-lg bg-black/30"><Settings className="h-5 w-5" /></button>
      </div>
      <div className="px-4">
        <div className="-mt-9 flex items-end justify-between">
          <div className="relative"><input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(event) => void updateAvatar(event.target.files?.[0])} /><button type="button" aria-label="Cambiar foto de perfil" disabled={avatarBusy} onClick={() => avatarInput.current?.click()} className="profile-avatar overflow-hidden">{user.avatar_url ? <img src={user.avatar_url} alt={user.nombre} className="h-full w-full object-cover" /> : user.nombre.slice(0, 1).toUpperCase()}<span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-[#050a13] bg-violet-600 text-white"><Camera className="h-3.5 w-3.5" /></span></button></div>
          <button onClick={() => setShowSettings(true)} aria-label="Abrir configuración" className="icon-button-lg mb-1"><MoreVertical className="h-5 w-5" /></button>
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-1.5"><h1 className="text-[21px] font-black">{user.nombre}</h1>{user.esta_verificado && <BadgeCheck className="h-5 w-5 text-[#38BDF8]" fill="currentColor" strokeWidth={1.5} />}</div>
          <p className="mt-0.5 text-[11px] text-muted">{facultyLabel} · {institutionLabel}</p>
          <div className="mt-2 flex flex-wrap gap-2">{user.esta_verificado && <span className="verified-pill"><ShieldCheck className="h-3.5 w-3.5" />Estudiante verificado</span>}<span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-bold text-emerald-300"><ShieldCheck className="h-3 w-3" />Cuenta TuTop activa</span></div>
        </div>
        <div className="profile-stats mt-5"><div><strong>{reputation.positiveRate === null ? '—' : `${reputation.positiveRate}%`}</strong><span>{reputation.hasEvidence ? 'Cumplimiento' : 'Sin historial'}</span></div><div><strong>{user.puntos_prestigio}</strong><span>PP</span></div><div><strong className="flex items-center justify-center gap-1"><Star className="h-4 w-4 text-[#FBBF24]" fill="currentColor" />{user.nivel_vendedor}</strong><span>Nivel</span></div></div>
        <p className="mt-2 px-1 text-[9px] leading-4 text-slate-500">{reputation.detail}</p>
        <section className="prestige-card mt-3"><div className="flex items-center justify-between"><div><p className="text-[11px] text-muted">Nivel de vendedor</p><h2 className="mt-1 text-[15px] font-extrabold">{user.nivel_vendedor}</h2></div><span className="text-[11px] text-muted">{user.puntos_prestigio} / {target} PP</span></div><div className="mt-3 h-2 rounded-full bg-[#202B3D]"><div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#D946EF]" style={{ width: `${progress}%` }} /></div></section>
        <section className="mt-6"><div className="mb-3 flex items-center justify-between"><h2 className="section-title">Mis productos</h2><span className="text-[10px] text-muted">Actualizados en TuTop</span></div><div className="segmented-control"><button className={status === 'Activo' ? 'active' : ''} onClick={() => setStatus('Activo')}>Activos</button><button className={status === 'Pausado' ? 'active' : ''} onClick={() => setStatus('Pausado')}>Pausados</button><button className={status === 'Vendido' ? 'active' : ''} onClick={() => setStatus('Vendido')}>Vendidos</button></div><div className="mt-2 space-y-2">{myProducts.length ? myProducts.map((product) => <div key={product.id} className="profile-product-row"><button onClick={() => openProduct(product.id)}><img src={product.imagen_url} alt={product.titulo} /></button><button onClick={() => openProduct(product.id)} className="min-w-0 flex-1 text-left"><p className="truncate text-[12px] font-semibold">{product.titulo}</p><p className="mt-1 text-[12px] font-bold text-white">${product.precio_mxn.toLocaleString('es-MX')}</p></button><div className="flex flex-col gap-1">{product.estado !== 'Vendido' && <button onClick={() => setEditingProduct(product)} className="profile-action"><Edit3 />Editar</button>}{product.estado === 'Activo' && <button onClick={() => updateProduct(product.id, { estado: 'Pausado', es_top: false, jerarquia_top: 0 })} className="profile-action"><Pause />Pausar</button>}{product.estado === 'Pausado' && <button onClick={() => updateProduct(product.id, { estado: 'Activo' })} className="profile-action"><Play />Activar</button>}{product.estado !== 'Vendido' && <button onClick={() => updateProduct(product.id, { estado: 'Vendido', es_top: false, jerarquia_top: 0 })} className="profile-action"><Tag />Vendido</button>}</div></div>) : <div className="empty-card">No tienes productos {status.toLowerCase()}s.</div>}</div></section>
        {editingProduct && <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Editar producto"><button aria-label="Cerrar edición" className="settings-backdrop" onClick={() => setEditingProduct(null)} /><div className="settings-sheet"><div className="flex items-center justify-between"><div><p className="eyebrow">TU ANUNCIO</p><h2 className="mt-1 text-xl font-black">Editar producto</h2></div><button aria-label="Cerrar" className="icon-button-lg" onClick={() => setEditingProduct(null)}><X className="h-5 w-5" /></button></div><div className="mt-4 space-y-3"><div><label className="auth-label mt-0">Título</label><input className="auth-input" value={editingProduct.titulo} maxLength={120} onChange={(event) => setEditingProduct({ ...editingProduct, titulo: event.target.value })} /></div><div className="grid grid-cols-2 gap-2"><div><label className="auth-label mt-0">Precio</label><input className="auth-input" type="number" min="1" max="1000000" value={editingProduct.precio_mxn} onChange={(event) => setEditingProduct({ ...editingProduct, precio_mxn: Number(event.target.value) })} /></div><div><label className="auth-label mt-0">Cantidad</label><input className="auth-input" type="number" min="1" max="99" value={editingProduct.stock || 1} onChange={(event) => setEditingProduct({ ...editingProduct, stock: Math.max(1, Math.min(99, Number(event.target.value) || 1)) })} /></div></div><div><label className="auth-label mt-0">Categoría</label><select className="auth-input" value={editingProduct.categoria} onChange={(event) => setEditingProduct({ ...editingProduct, categoria: event.target.value as ProductCategory })}>{MARKETPLACE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div><div><label className="auth-label mt-0">Descripción</label><textarea className="auth-input min-h-24" maxLength={1000} value={editingProduct.descripcion || ''} onChange={(event) => setEditingProduct({ ...editingProduct, descripcion: event.target.value })} /></div><div><label className="auth-label mt-0">Entrega</label><select className="auth-input" value={editingProduct.punto_encuentro} onChange={(event) => setEditingProduct({ ...editingProduct, punto_encuentro: event.target.value as Product['punto_encuentro'] })}>{VALID_MEETING_POINTS.map((point) => <option key={point}>{point}</option>)}</select></div><button className="w-full rounded-xl bg-violet-600 py-3 text-xs font-black text-white" onClick={saveProductEdit}>Guardar cambios</button></div></div></div>}
        {showSettings && <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Configuración de TuTop"><button aria-label="Cerrar configuración" className="settings-backdrop" onClick={() => setShowSettings(false)} /><div className="settings-sheet"><div className="flex items-center justify-between"><div><p className="eyebrow">CUENTA Y PRIVACIDAD</p><h2 className="mt-1 text-xl font-black">Configuración</h2></div><button aria-label="Cerrar" className="icon-button-lg" onClick={() => setShowSettings(false)}><X className="h-5 w-5" /></button></div><div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3"><label className="auth-label mt-0">Nombre</label><input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="auth-input" maxLength={80} /><label className="auth-label">Facultad / escuela</label><input list="tutop-faculty-options" value={profileFaculty} onChange={(event) => setProfileFaculty(event.target.value.slice(0, 120))} className="auth-input" maxLength={120} placeholder="Tu facultad o escuela" /><datalist id="tutop-faculty-options">{facultyOptions.map((item) => <option key={item} value={item} />)}</datalist><p className="mt-1 text-[9px] text-slate-500">Institución actual: {institutionLabel}. Puedes escribir una facultad aunque aún no esté en el catálogo.</p><button disabled={profileBusy || profileName.trim().length < 2} onClick={() => void saveProfile()} className="mt-3 w-full rounded-xl bg-violet-600 py-2.5 text-xs font-black text-white disabled:opacity-50">{profileBusy ? 'Guardando…' : 'Guardar perfil'}</button></div><div className="mt-3 space-y-2">{isAdmin && <a className="settings-link" href="/admin"><span><strong>MiTuTop Admin</strong><small>Panel privado de administración</small></span><Database /></a>}{!user.esta_verificado && <><input ref={verificationInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void submitVerification(event.target.files?.[0])} /><button className="settings-link w-full text-left" onClick={() => verificationInput.current?.click()}><span><strong>Solicitar verificación</strong><small>Envía tu credencial de forma privada para revisión</small></span><Camera /></button>{verificationStatus && <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] leading-relaxed text-slate-300">{verificationStatus}</p>}</>}<button className="settings-link w-full text-left" onClick={() => { const next = !soundEnabled; setSoundEnabled(next); setSoundState(next); }}><span><strong>Sonidos y vibración</strong><small>{soundEnabled ? 'Feedback satisfactorio activado' : 'Feedback de sonido desactivado'}</small></span>{soundEnabled ? <Volume2 /> : <VolumeX />}</button><a className="settings-link" href="/privacy.html" target="_blank" rel="noreferrer"><span><strong>Privacidad</strong><small>Cómo tratamos datos en TuTop</small></span><ExternalLink /></a><a className="settings-link" href="/terms.html" target="_blank" rel="noreferrer"><span><strong>Reglas de comunidad</strong><small>Productos permitidos y convivencia</small></span><ExternalLink /></a><a className="settings-link danger" href="/delete-account.html" target="_blank" rel="noreferrer"><span><strong>Eliminar mi cuenta</strong><small>Solicita eliminar tu cuenta y tus datos</small></span><ExternalLink /></a><button className="settings-link w-full text-left" onClick={signOut}><span><strong>Cerrar sesión</strong><small>Quita el token de este dispositivo</small></span><LogOut /></button></div><p className="mt-4 text-[10px] leading-relaxed text-muted">TuTop guarda tus publicaciones, conversaciones, UCoins y reputación para mantener tu experiencia sincronizada.</p></div></div>}
      </div>
    </div>
  );
}
