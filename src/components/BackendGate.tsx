import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Database, KeyRound, Loader2, LockKeyhole, Phone, ShieldCheck, Wifi } from 'lucide-react';
import { onlineBackend } from '../services/onlineBackend';
import { clearFirebaseConfig, getFirebaseConfig, parseFirebaseConfig, saveFirebaseConfig } from '../services/runtimeConfig';
import { useAppStore } from '../store/useAppStore';

const FACULTADES = ['Turismo Internacional', 'Odontología', 'Ciencias Económico Administrativas', 'Derecho', 'Medicina'];

type AuthMode = 'login' | 'register';

export default function BackendGate({ children }: { children: ReactNode }) {
  const hydrateOnline = useAppStore((state) => state.hydrateOnline);
  const clearOnline = useAppStore((state) => state.clearOnline);
  const [configured, setConfigured] = useState(() => Boolean(getFirebaseConfig()));
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
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
      setLastSync(new Date());
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      if (message === 'AUTH_REQUIRED' || /TOKEN_EXPIRED|INVALID_ID_TOKEN|USER_NOT_FOUND/i.test(message)) {
        onlineBackend.signOut();
        clearOnline();
        setAuthenticated(false);
      } else {
        setError(message);
      }
    } finally {
      syncInFlight.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    void sync();
  }, [configured]);

  useEffect(() => {
    if (!configured || !authenticated) return;
    const timer = window.setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') void sync(true); }, 30000);
    const online = () => void sync(true);
    const visible = () => { if (document.visibilityState === 'visible' && navigator.onLine) void sync(true); };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [configured, authenticated]);

  if (!configured) return <FirebaseSetup onConfigured={() => setConfigured(true)} />;
  if (!authenticated && !loading) return <AuthScreen onAuthenticated={() => void sync()} onResetConfig={() => { clearFirebaseConfig(); onlineBackend.signOut(); setConfigured(false); }} />;
  if (loading && !authenticated) return <FullLoader label="Conectando con Firebase…" />;
  if (authenticated && suspended.active) return <SuspendedScreen reason={suspended.reason} onSignOut={() => { onlineBackend.signOut(); clearOnline(); setAuthenticated(false); setSuspended({ active: false }); }} />;

  return (
    <>
      {error && <div className="fixed inset-x-3 top-[calc(10px+env(safe-area-inset-top))] z-[120] mx-auto max-w-xl rounded-2xl border border-amber-300/20 bg-[#17110b]/95 p-3 text-xs text-amber-100 shadow-2xl backdrop-blur"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><strong>La última sincronización falló</strong><p className="mt-1 break-words text-amber-100/65">{error}</p></div><button onClick={() => void sync()} className="rounded-lg border border-amber-200/15 px-2 py-1 font-bold">Reintentar</button></div></div>}
      {children}
      {lastSync && <span className="pointer-events-none fixed bottom-[calc(78px+env(safe-area-inset-bottom))] right-2 z-20 hidden rounded-full bg-black/40 px-2 py-1 text-[8px] text-white/30 backdrop-blur sm:block">Firebase · {lastSync.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>}
    </>
  );
}

function FirebaseSetup({ onConfigured }: { onConfigured: () => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    try {
      const config = parseFirebaseConfig(input);
      saveFirebaseConfig(config);
      onlineBackend.configureFromRuntime();
      setError(null);
      onConfigured();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  return (
    <div className="min-h-screen bg-[#070b12] px-4 py-8 text-white sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/[0.07] bg-[#0b111c] shadow-2xl">
        <div className="grid lg:grid-cols-[.9fr_1.1fr]">
          <section className="border-b border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,.28),transparent_48%),#0a0f19] p-6 lg:border-b-0 lg:border-r">
            <div className="wordmark text-3xl"><span>Tu</span><span>Top</span></div>
            <p className="mt-2 text-sm text-slate-400">Configuración online · cero inversión</p>
            <div className="mt-7 space-y-3">
              <SetupPoint icon={<Database />} title="Cloud Firestore" body="Productos, usuarios, chats, Wallet, pujas y administración en línea." />
              <SetupPoint icon={<KeyRound />} title="Firebase Authentication" body="En la etapa gratuita usamos número + clave beta. El SMS real se activa más adelante." />
              <SetupPoint icon={<ShieldCheck />} title="Sin datos ficticios" body="Hasta que conectes Firebase, TuTop no inventará usuarios ni publicaciones." />
            </div>
            <div className="mt-6 rounded-2xl border border-amber-300/10 bg-amber-300/[0.045] p-4 text-xs leading-5 text-amber-100/65"><strong className="text-amber-100">Importante:</strong> Firebase Spark sí permite Firestore y Auth sin tarjeta. En 2026, Cloud Functions, Cloud Storage y SMS real requieren facturación; por eso esta beta usa lógica segura en Rules y fotos comprimidas guardadas en Firestore.</div>
          </section>
          <section className="p-6">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-400">Paso único de conexión</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight">Pega tu configuración web de Firebase</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Crea un proyecto gratuito Spark, registra una app Web y copia el bloque <code>firebaseConfig</code>. La API key web no es una contraseña.</p>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={9} className="mt-5 w-full rounded-2xl border border-white/[0.08] bg-[#070b12] p-4 font-mono text-xs leading-5 text-slate-300 outline-none transition focus:border-violet-500/60" placeholder={'const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  appId: "..."\n};'} />
            {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
            <button onClick={save} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 text-sm font-black shadow-lg shadow-violet-900/20"><Wifi className="h-4 w-4" />Conectar TuTop a Firebase<ArrowRight className="h-4 w-4" /></button>
            <div className="mt-5 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-3"><MiniStep value="1" label="Proyecto Spark" /><MiniStep value="2" label="Auth Email/Password" /><MiniStep value="3" label="Firestore" /></div>
          </section>
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ onAuthenticated, onResetConfig }: { onAuthenticated: () => void; onResetConfig: () => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [faculty, setFaculty] = useState('Turismo Internacional');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = useMemo(() => getFirebaseConfig(), []);

  const submit = async () => {
    try {
      setBusy(true); setError(null);
      onlineBackend.configureFromRuntime();
      if (mode === 'register') {
        if (name.trim().length < 2) throw new Error('Escribe tu nombre.');
        await onlineBackend.register(phone, password, { nombre: name, facultad: faculty });
      } else await onlineBackend.login(phone, password);
      onAuthenticated();
    } catch (submitError) {
      let message = submitError instanceof Error ? submitError.message : String(submitError);
      if (/EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/i.test(message)) message = 'Número o clave incorrectos.';
      if (/EMAIL_EXISTS/i.test(message)) message = 'Ese número ya tiene una cuenta. Usa “Entrar”.';
      if (/OPERATION_NOT_ALLOWED/i.test(message)) message = 'En Firebase debes activar Authentication → Email/Password para esta beta gratuita.';
      setError(message);
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#070b12] px-4 py-8 text-white sm:grid sm:place-items-center">
      <div className="w-full max-w-md rounded-[28px] border border-white/[0.07] bg-[#0b111c] p-5 shadow-2xl sm:p-7">
        <div className="flex items-center justify-between"><div><div className="wordmark text-3xl"><span>Tu</span><span>Top</span></div><p className="mt-1 text-xs text-slate-500">Firebase · {config?.projectId}</p></div><span className="rounded-full border border-emerald-400/15 bg-emerald-400/5 px-2.5 py-1 text-[10px] font-bold text-emerald-300">ONLINE</span></div>
        <div className="mt-6 grid grid-cols-2 rounded-xl bg-[#070b12] p-1"><button onClick={() => setMode('login')} className={`rounded-lg py-2 text-xs font-bold ${mode === 'login' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Entrar</button><button onClick={() => setMode('register')} className={`rounded-lg py-2 text-xs font-bold ${mode === 'register' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Crear cuenta</button></div>
        {mode === 'register' && <><label className="auth-label">Nombre</label><input value={name} onChange={(event) => setName(event.target.value)} className="auth-input" placeholder="Tu nombre" maxLength={80} /><label className="auth-label">Facultad</label><select value={faculty} onChange={(event) => setFaculty(event.target.value)} className="auth-input">{FACULTADES.map((item) => <option key={item}>{item}</option>)}</select></>}
        <label className="auth-label">Número celular</label><div className="relative"><Phone className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={phone} onChange={(event) => setPhone(event.target.value)} className="auth-input pl-10" inputMode="tel" placeholder="246 123 4567" /></div>
        <label className="auth-label">Clave beta</label><div className="relative"><LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input pl-10" type="password" placeholder="Mínimo 8 caracteres" onKeyDown={(event) => event.key === 'Enter' && void submit()} /></div>
        <div className="mt-3 rounded-xl border border-sky-300/10 bg-sky-300/[0.035] p-3 text-[10px] leading-5 text-sky-100/60"><strong className="text-sky-200">Beta gratuita:</strong> tu número identifica la cuenta, pero todavía no se envía SMS. Cuando activemos Phone Auth de pago podrás verificar y vincular el mismo número sin cambiar tu perfil.</div>
        {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
        <button disabled={busy || !phone.trim() || password.length < 8} onClick={() => void submit()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{mode === 'login' ? 'Entrar a TuTop' : 'Crear cuenta en Firebase'}</button>
        <button onClick={onResetConfig} className="mt-4 w-full text-center text-[10px] font-semibold text-slate-600 hover:text-slate-400">Cambiar proyecto Firebase</button>
      </div>
    </div>
  );
}

function SuspendedScreen({ reason, onSignOut }: { reason?: string; onSignOut: () => void }) {
  return <div className="grid min-h-screen place-items-center bg-[#070b12] px-5 text-white"><div className="w-full max-w-md rounded-[28px] border border-rose-400/15 bg-[#0b111c] p-6 shadow-2xl"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-300"><LockKeyhole className="h-6 w-6" /></div><p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-rose-300">Cuenta suspendida</p><h1 className="mt-2 text-2xl font-black">Tu cuenta no puede operar temporalmente.</h1><p className="mt-3 text-sm leading-6 text-slate-400">{reason || 'Un administrador aplicó una suspensión durante la beta.'}</p><p className="mt-3 text-xs leading-5 text-slate-600">Las Security Rules también bloquean publicaciones, pujas, mensajes y reportes mientras este estado esté activo.</p><button onClick={onSignOut} className="mt-5 w-full rounded-xl bg-white/[0.06] py-3 text-sm font-black text-slate-200">Cerrar sesión</button></div></div>;
}

function FullLoader({ label }: { label: string }) {
  return <div className="grid min-h-screen place-items-center bg-[#070b12] text-white"><div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/10 text-violet-300"><Loader2 className="h-6 w-6 animate-spin" /></div><p className="mt-4 text-sm font-bold">{label}</p><p className="mt-1 text-xs text-slate-600">No se cargan datos ficticios mientras esperas.</p></div></div>;
}

function SetupPoint({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return <div className="flex gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300 [&>svg]:h-4 [&>svg]:w-4">{icon}</div><div><p className="text-xs font-black">{title}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{body}</p></div></div>;
}

function MiniStep({ value, label }: { value: string; label: string }) {
  return <div className="flex items-center gap-2 rounded-xl bg-white/[0.025] p-2"><span className="grid h-6 w-6 place-items-center rounded-lg bg-violet-500/10 font-black text-violet-300">{value}</span><span>{label}</span></div>;
}
