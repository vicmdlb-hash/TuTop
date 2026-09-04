import { useRef, useState } from 'react';
import { BadgeCheck, Camera, Database, ExternalLink, LogOut, MoreVertical, Pause, Play, Settings, ShieldCheck, Star, Tag, X } from 'lucide-react';
import { compressImageForFirestore } from '../lib/imageCompression';
import { reliabilityFor } from '../lib/productAssistant';
import { onlineBackend } from '../services/onlineBackend';
import { useAppStore } from '../store/useAppStore';

const FACULTADES = ['Turismo Internacional', 'Odontología', 'Ciencias Económico Administrativas', 'Derecho', 'Medicina'];

export default function Profile() {
  const { user, products, updateProduct, openProduct, isAdmin, clearOnline, hydrateOnline } = useAppStore();
  const [status, setStatus] = useState<'Activo' | 'Pausado' | 'Vendido'>('Activo');
  const [showSettings, setShowSettings] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const verificationInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profileName, setProfileName] = useState(user.nombre);
  const [profileFaculty, setProfileFaculty] = useState(user.facultad);
  const [profileBusy, setProfileBusy] = useState(false);
  const myProducts = products.filter((product) => product.vendedor_id === user.id && product.estado === status);
  const reliability = reliabilityFor(user.strikes);
  const target = user.nivel_vendedor === 'Novato' ? 50 : user.nivel_vendedor === 'Pro' ? 200 : user.puntos_prestigio;
  const progress = user.nivel_vendedor === 'Leyenda' ? 100 : Math.min(100, (user.puntos_prestigio / Math.max(target, 1)) * 100);

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
          <p className="mt-0.5 text-[11px] text-muted">Facultad de {user.facultad} · UATx</p>
          <div className="mt-2 flex flex-wrap gap-2">{user.esta_verificado && <span className="verified-pill"><ShieldCheck className="h-3.5 w-3.5" />Estudiante verificado</span>}<span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-bold text-emerald-300"><Database className="h-3 w-3" />Firebase online</span></div>
        </div>
        <div className="profile-stats mt-5"><div><strong>{reliability}%</strong><span>Confiabilidad</span></div><div><strong>{user.puntos_prestigio}</strong><span>PP</span></div><div><strong className="flex items-center justify-center gap-1"><Star className="h-4 w-4 text-[#FBBF24]" fill="currentColor" />{user.nivel_vendedor}</strong><span>Nivel</span></div></div>
        <section className="prestige-card mt-3"><div className="flex items-center justify-between"><div><p className="text-[11px] text-muted">Nivel de vendedor</p><h2 className="mt-1 text-[15px] font-extrabold">{user.nivel_vendedor}</h2></div><span className="text-[11px] text-muted">{user.puntos_prestigio} / {target} PP</span></div><div className="mt-3 h-2 rounded-full bg-[#202B3D]"><div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#D946EF]" style={{ width: `${progress}%` }} /></div></section>
        <section className="mt-6"><div className="mb-3 flex items-center justify-between"><h2 className="section-title">Mis productos</h2><span className="text-[10px] text-muted">Sincronizados con Firestore</span></div><div className="segmented-control"><button className={status === 'Activo' ? 'active' : ''} onClick={() => setStatus('Activo')}>Activos</button><button className={status === 'Pausado' ? 'active' : ''} onClick={() => setStatus('Pausado')}>Pausados</button><button className={status === 'Vendido' ? 'active' : ''} onClick={() => setStatus('Vendido')}>Vendidos</button></div><div className="mt-2 space-y-2">{myProducts.length ? myProducts.map((product) => <div key={product.id} className="profile-product-row"><button onClick={() => openProduct(product.id)}><img src={product.imagen_url} alt={product.titulo} /></button><button onClick={() => openProduct(product.id)} className="min-w-0 flex-1 text-left"><p className="truncate text-[12px] font-semibold">{product.titulo}</p><p className="mt-1 text-[12px] font-bold text-white">${product.precio_mxn.toLocaleString('es-MX')}</p></button><div className="flex flex-col gap-1">{product.estado === 'Activo' && <button onClick={() => updateProduct(product.id, { estado: 'Pausado', es_top: false, jerarquia_top: 0 })} className="profile-action"><Pause />Pausar</button>}{product.estado === 'Pausado' && <button onClick={() => updateProduct(product.id, { estado: 'Activo' })} className="profile-action"><Play />Activar</button>}{product.estado !== 'Vendido' && <button onClick={() => updateProduct(product.id, { estado: 'Vendido', es_top: false, jerarquia_top: 0 })} className="profile-action"><Tag />Vendido</button>}</div></div>) : <div className="empty-card">No tienes productos {status.toLowerCase()}s.</div>}</div></section>
        {showSettings && <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Configuración de TuTop"><button aria-label="Cerrar configuración" className="settings-backdrop" onClick={() => setShowSettings(false)} /><div className="settings-sheet"><div className="flex items-center justify-between"><div><p className="eyebrow">CUENTA Y PRIVACIDAD</p><h2 className="mt-1 text-xl font-black">Configuración</h2></div><button aria-label="Cerrar" className="icon-button-lg" onClick={() => setShowSettings(false)}><X className="h-5 w-5" /></button></div><div className="mt-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3"><label className="auth-label mt-0">Nombre</label><input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="auth-input" maxLength={80} /><label className="auth-label">Facultad</label><select value={profileFaculty} onChange={(event) => setProfileFaculty(event.target.value)} className="auth-input">{FACULTADES.map((item) => <option key={item}>{item}</option>)}</select><button disabled={profileBusy || profileName.trim().length < 2} onClick={() => void saveProfile()} className="mt-3 w-full rounded-xl bg-violet-600 py-2.5 text-xs font-black text-white disabled:opacity-50">{profileBusy ? 'Guardando…' : 'Guardar perfil'}</button></div><div className="mt-3 space-y-2">{isAdmin && <a className="settings-link" href="/admin"><span><strong>MiTuTop Admin</strong><small>Panel privado conectado a Firestore</small></span><Database /></a>}{!user.esta_verificado && <><input ref={verificationInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void submitVerification(event.target.files?.[0])} /><button className="settings-link w-full text-left" onClick={() => verificationInput.current?.click()}><span><strong>Solicitar verificación</strong><small>Sube tu credencial; se guarda comprimida en Firestore durante la beta sin costo</small></span><Camera /></button>{verificationStatus && <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] leading-relaxed text-slate-300">{verificationStatus}</p>}</>}<a className="settings-link" href="/privacy.html" target="_blank" rel="noreferrer"><span><strong>Privacidad</strong><small>Cómo tratamos datos en la beta</small></span><ExternalLink /></a><a className="settings-link" href="/terms.html" target="_blank" rel="noreferrer"><span><strong>Reglas de comunidad</strong><small>Productos permitidos y convivencia</small></span><ExternalLink /></a><a className="settings-link danger" href="/delete-account.html" target="_blank" rel="noreferrer"><span><strong>Eliminar mi cuenta</strong><small>Proceso de eliminación de datos de la beta</small></span><ExternalLink /></a><button className="settings-link w-full text-left" onClick={signOut}><span><strong>Cerrar sesión</strong><small>Quita el token de este dispositivo</small></span><LogOut /></button></div><p className="mt-4 text-[10px] leading-relaxed text-muted">Esta beta no usa datos ficticios. Los productos, chats, Wallet y reputación provienen del proyecto Firebase configurado en el dispositivo.</p></div></div>}
      </div>
    </div>
  );
}
