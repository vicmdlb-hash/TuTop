import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Loader2, LockKeyhole, Phone, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { onlineBackend } from '../services/onlineBackend';
import { useAppStore } from '../store/useAppStore';

const FACULTADES = ['Turismo Internacional', 'Odontología', 'Ciencias Económico Administrativas', 'Derecho', 'Medicina'];
type AuthMode = 'login' | 'register';

function friendlyError(raw: string) {
  if (/EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/i.test(raw)) return 'Número o clave incorrectos.';
  if (/EMAIL_EXISTS/i.test(raw)) return 'Ese número ya tiene una cuenta. Usa “Entrar”.';
  if (/WEAK_PASSWORD|PASSWORD_DOES_NOT_MEET_REQUIREMENTS/i.test(raw)) return 'Tu Clave TuTop necesita al menos 8 caracteres.';
  if (/TOO_MANY_ATTEMPTS|TOO_MANY_REQUESTS/i.test(raw)) return 'Hubo demasiados intentos. Espera un momento y vuelve a probar.';
  if (/NETWORK|FETCH|OFFLINE/i.test(raw)) return 'No pudimos conectar. Revisa tu internet e inténtalo otra vez.';
  if (/OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND/i.test(raw)) return 'TuTop está terminando de preparar el acceso. Inténtalo de nuevo en un momento.';
  if (/PERMISSION_DENIED|403/i.test(raw)) return 'TuTop no pudo completar esta acción. Actualiza la app o inténtalo más tarde.';
  if (/PROFILE_MISSING|WALLET_MISSING/i.test(raw)) return 'Tu cuenta necesita una reparación rápida. Vuelve a entrar o crea tu cuenta de nuevo con el mismo número.';
  return 'Algo no salió como esperábamos. Inténtalo otra vez.';
}

export default function BackendGate({ children }: { children: ReactNode }) {
  const hydrateOnline = useAppStore((state) => state.hydrateOnline);
  const clearOnline = useAppStore((state) => state.clearOnline);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suspended, setSuspended] = useState<{ active: boolean; reason?: string }>({ active: false });
  const syncInFlight = useRef(false);

  const sync = async (quiet = false) => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    try {
      if (!quiet) setLoading(true);
      setError(null);
      onlineBackend.configureFromRuntime();
      const session = onlineBackend.session;
      if (!session) {
        clearOnline();
        setAuthenticated(false);
        setSuspended({ active: false });
        return;
      }
      const snapshot = await onlineBackend.loadSnapshot();
      hydrateOnline(snapshot);
      setAuthenticated(true);
      setSuspended({ active: snapshot.user.is_suspended === true, reason: snapshot.user.suspension_reason });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      if (message === 'AUTH_REQUIRED' || /TOKEN_EXPIRED|INVALID_ID_TOKEN|USER_NOT_FOUND/i.test(message)) {
        onlineBackend.signOut();
        clearOnline();
        setAuthenticated(false);
      } else {
        setError(friendlyError(message));
      }
    } finally {
      syncInFlight.current = false;
      setLoading(false);
    }
  };

  useEffect(() => { void sync(); }, []);

  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') void sync(true);
    }, 30000);
    const online = () => void sync(true);
    const visible = () => { if (document.visibilityState === 'visible' && navigator.onLine) void sync(true); };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [authenticated]);

  if (!authenticated && !loading) return <AuthScreen onAuthenticated={() => void sync()} />;
  if (loading && !authenticated) return <FullLoader label="Preparando TuTop…" />;
  if (authenticated && suspended.active) return <SuspendedScreen reason={suspended.reason} onSignOut={() => { onlineBackend.signOut(); clearOnline(); setAuthenticated(false); setSuspended({ active: false }); }} />;

  return (
    <>
      {error && (
        <div className="fixed inset-x-3 top-[calc(10px+env(safe-area-inset-top))] z-[120] mx-auto max-w-xl rounded-2xl border border-amber-300/20 bg-[#17110b]/95 p-3 text-xs text-amber-100 shadow-2xl backdrop-blur">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><strong>No pudimos sincronizar TuTop</strong><p className="mt-1 text-amber-100/65">{error}</p></div><button onClick={() => void sync()} className="rounded-lg border border-amber-200/15 px-2 py-1 font-bold">Reintentar</button></div>
        </div>
      )}
      {children}
    </>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>('register');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [faculty, setFaculty] = useState('Turismo Internacional');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setBusy(true);
      setError(null);
      onlineBackend.configureFromRuntime();
      if (mode === 'register') {
        if (name.trim().length < 2) throw new Error('Escribe tu nombre.');
        await onlineBackend.register(phone, password, { nombre: name, facultad: faculty });
      } else {
        await onlineBackend.login(phone, password);
      }
      onAuthenticated();
    } catch (submitError) {
      const raw = submitError instanceof Error ? submitError.message : String(submitError);
      if (raw === 'Escribe tu nombre.') setError(raw);
      else setError(friendlyError(raw));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen min-h-screen px-4 py-8 text-white sm:grid sm:place-items-center">
      <div className="w-full max-w-md overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#0b111c] shadow-2xl">
        <div className="relative overflow-hidden px-6 pb-6 pt-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(168,85,247,.30),transparent_43%),radial-gradient(circle_at_92%_10%,rgba(56,189,248,.12),transparent_30%)]" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="brand-mark"><span>T</span><i /></div>
              <div><div className="wordmark text-3xl"><span>Tu</span><span>Top</span></div><p className="mt-1 text-[10px] font-bold uppercase tracking-[.18em] text-violet-300/80">Marketplace universitario</p></div>
            </div>
            <h1 className="mt-7 text-[27px] font-black leading-[1.05] tracking-[-.04em]">Compra, vende y conecta dentro de tu comunidad.</h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">Publica en minutos, acuerda entregas dentro del campus y construye tu reputación en TuTop.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-300"><span className="auth-benefit"><ShieldCheck />Comunidad protegida</span><span className="auth-benefit"><Sparkles />10 UCoins de bienvenida</span></div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] p-5 sm:p-6">
          <div className="grid grid-cols-2 rounded-xl bg-[#070b12] p-1">
            <button onClick={() => { setMode('register'); setError(null); }} className={`rounded-lg py-2.5 text-xs font-black ${mode === 'register' ? 'bg-violet-600 text-white shadow-lg shadow-violet-950/30' : 'text-slate-500'}`}>Crear cuenta</button>
            <button onClick={() => { setMode('login'); setError(null); }} className={`rounded-lg py-2.5 text-xs font-black ${mode === 'login' ? 'bg-violet-600 text-white shadow-lg shadow-violet-950/30' : 'text-slate-500'}`}>Entrar</button>
          </div>

          {mode === 'register' && <>
            <label className="auth-label">Tu nombre</label>
            <div className="relative"><UserRound className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={name} onChange={(event) => setName(event.target.value)} className="auth-input pl-10" placeholder="¿Cómo te llamas?" maxLength={80} /></div>
            <label className="auth-label">Facultad</label>
            <select value={faculty} onChange={(event) => setFaculty(event.target.value)} className="auth-input">{FACULTADES.map((item) => <option key={item}>{item}</option>)}</select>
          </>}

          <label className="auth-label">Número celular</label>
          <div className="relative"><Phone className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={phone} onChange={(event) => setPhone(event.target.value)} className="auth-input pl-10" inputMode="tel" autoComplete="tel" placeholder="246 123 4567" /></div>

          <label className="auth-label">Clave TuTop</label>
          <div className="relative"><LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input pl-10" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="Mínimo 8 caracteres" onKeyDown={(event) => event.key === 'Enter' && void submit()} /></div>

          <p className="mt-3 text-[10px] leading-5 text-slate-600">Tu número se usa para identificar tu cuenta. No se muestra públicamente en tus anuncios.</p>
          {error && <p className="mt-3 rounded-xl border border-rose-400/10 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}

          <button disabled={busy || !phone.trim() || password.length < 8 || (mode === 'register' && name.trim().length < 2)} onClick={() => void submit()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black shadow-lg shadow-violet-950/30 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{mode === 'register' ? 'Crear mi cuenta TuTop' : 'Entrar a TuTop'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuspendedScreen({ reason, onSignOut }: { reason?: string; onSignOut: () => void }) {
  return <div className="grid min-h-screen place-items-center bg-[#070b12] px-5 text-white"><div className="w-full max-w-md rounded-[28px] border border-rose-400/15 bg-[#0b111c] p-6 shadow-2xl"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-300"><LockKeyhole className="h-6 w-6" /></div><p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-rose-300">Cuenta en revisión</p><h1 className="mt-2 text-2xl font-black">Tu cuenta está temporalmente limitada.</h1><p className="mt-3 text-sm leading-6 text-slate-400">{reason || 'El equipo de TuTop aplicó una restricción temporal a esta cuenta.'}</p><button onClick={onSignOut} className="mt-5 w-full rounded-xl bg-white/[0.06] py-3 text-sm font-black text-slate-200">Cerrar sesión</button></div></div>;
}

function FullLoader({ label }: { label: string }) {
  return <div className="grid min-h-screen place-items-center bg-[#070b12] text-white"><div className="text-center"><div className="brand-mark mx-auto h-16 w-16 text-2xl"><span>T</span><i /></div><Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-violet-300" /><p className="mt-3 text-sm font-bold">{label}</p><p className="mt-1 text-xs text-slate-600">Estamos dejando todo listo para ti.</p></div></div>;
}
