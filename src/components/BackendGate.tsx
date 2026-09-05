import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, Eye, EyeOff, Loader2, LockKeyhole, MapPin, Phone, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { CAMPUSES, INSTITUTIONS, identityFor } from '../lib/universityNetwork';
import { nationalBackend, nationalSchemaEnabled } from '../services/nationalBackend';
import { onlineBackend } from '../services/onlineBackend';
import { useAppStore } from '../store/useAppStore';

type AuthMode = 'login' | 'register';

function friendlyError(raw: string) {
  if (/EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/i.test(raw)) return 'Número o clave incorrectos.';
  if (/EMAIL_EXISTS/i.test(raw)) return 'Ese número ya tiene una cuenta. Usa “Entrar”.';
  if (/WEAK_PASSWORD|PASSWORD_DOES_NOT_MEET_REQUIREMENTS/i.test(raw)) return 'Tu Clave TuTop necesita al menos 8 caracteres.';
  if (/TOO_MANY_ATTEMPTS|TOO_MANY_REQUESTS/i.test(raw)) return 'Hubo demasiados intentos. Inténtalo de nuevo más tarde.';
  if (/NETWORK|FETCH|OFFLINE/i.test(raw)) return 'No pudimos conectar. Revisa tu internet e inténtalo otra vez.';
  if (/OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND/i.test(raw)) return 'TuTop está terminando de preparar el acceso.';
  if (/PERMISSION_DENIED|403/i.test(raw)) return 'TuTop no pudo completar esta acción. Actualiza la app o inténtalo más tarde.';
  if (/PROFILE_MISSING|WALLET_MISSING/i.test(raw)) return 'Tu cuenta necesita una reparación rápida. Vuelve a entrar.';
  return raw.length < 120 ? raw : 'Algo no salió como esperábamos. Inténtalo otra vez.';
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
      if (!onlineBackend.session) {
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
      } else setError(friendlyError(message));
    } finally {
      syncInFlight.current = false;
      setLoading(false);
    }
  };

  useEffect(() => { void sync(); }, []);
  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') void sync(true); }, 30_000);
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

  return <>{error && <div className="fixed inset-x-3 top-[calc(10px+env(safe-area-inset-top))] z-[120] mx-auto max-w-xl rounded-2xl border border-amber-300/20 bg-[#17110b]/95 p-3 text-xs text-amber-100 shadow-2xl backdrop-blur"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><strong>No pudimos sincronizar TuTop</strong><p className="mt-1 text-amber-100/65">{error}</p></div><button onClick={() => void sync()} className="rounded-lg border border-amber-200/15 px-2 py-1 font-bold">Reintentar</button></div></div>}{children}</>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>('register');
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [institutionId, setInstitutionId] = useState('uatx');
  const [campusId, setCampusId] = useState('uatx-riberena');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordScore = password.length >= 12 ? 3 : password.length >= 10 ? 2 : password.length >= 8 ? 1 : 0;
  const campusOptions = useMemo(() => CAMPUSES.filter((campus) => campus.institution_id === institutionId), [institutionId]);
  const institution = INSTITUTIONS.find((item) => item.id === institutionId);
  const campus = campusOptions.find((item) => item.id === campusId);

  const chooseInstitution = (id: string) => {
    setInstitutionId(id);
    const firstCampus = CAMPUSES.find((item) => item.institution_id === id);
    setCampusId(firstCampus?.id || '');
  };

  const submit = async () => {
    try {
      setBusy(true);
      setError(null);
      onlineBackend.configureFromRuntime();
      if (mode === 'register') {
        if (name.trim().length < 2) throw new Error('Escribe tu nombre.');
        if (!institutionId || !campusId) throw new Error('Selecciona universidad y campus.');
        const legacyAdapter = campus?.name || institution?.short_name || 'Red universitaria';
        await onlineBackend.register(phone, password, { nombre: name, facultad: legacyAdapter });
        if (nationalSchemaEnabled()) {
          await nationalBackend.updateUniversityIdentity(identityFor(institutionId, campusId), legacyAdapter);
        }
      } else await onlineBackend.login(phone, password);
      onAuthenticated();
    } catch (submitError) {
      const raw = submitError instanceof Error ? submitError.message : String(submitError);
      setError(raw === 'Escribe tu nombre.' || raw === 'Selecciona universidad y campus.' ? raw : friendlyError(raw));
    } finally {
      setBusy(false);
    }
  };

  const firstStepReady = name.trim().length >= 2 && phone.trim().length >= 8 && password.length >= 8;

  return (
    <div className="auth-screen min-h-screen px-4 py-8 text-white sm:grid sm:place-items-center">
      <div className="w-full max-w-md overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#0b111c] shadow-2xl">
        <div className="relative overflow-hidden px-6 pb-6 pt-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(168,85,247,.30),transparent_43%),radial-gradient(circle_at_92%_10%,rgba(56,189,248,.12),transparent_30%)]" />
          <div className="relative">
            <div className="flex items-center gap-3"><div className="brand-mark"><span>T</span><i /></div><div><div className="wordmark text-3xl"><span>Tu</span><span>Top</span></div><p className="mt-1 text-[10px] font-bold uppercase tracking-[.18em] text-violet-300/80">Red universitaria</p></div></div>
            <h1 className="mt-7 text-[27px] font-black leading-[1.05] tracking-[-.04em]">Compra, vende y encuentra dentro de tu comunidad.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">Tu identidad empieza por universidad y campus. Facultad y carrera son contexto adicional, no fronteras del marketplace.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-300"><span className="auth-benefit"><ShieldCheck />Comunidad protegida</span><span className="auth-benefit"><Sparkles />10 UCoins de bienvenida</span></div>
          </div>
        </div>
        <div className="border-t border-white/[0.06] p-5 sm:p-6">
          <div className="grid grid-cols-2 rounded-xl bg-[#070b12] p-1"><button onClick={() => { setMode('register'); setStep(1); setError(null); }} className={`rounded-lg py-2.5 text-xs font-black ${mode === 'register' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Crear cuenta</button><button onClick={() => { setMode('login'); setStep(1); setError(null); }} className={`rounded-lg py-2.5 text-xs font-black ${mode === 'login' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Entrar</button></div>
          {mode === 'register' && <div className="mt-4"><div className="flex items-center justify-between text-[10px] font-bold"><span className="text-violet-300">Paso {step} de 2</span><span className="text-slate-600">{step === 1 ? 'Tu cuenta' : 'Tu red universitaria'}</span></div><div className="mt-2 grid grid-cols-2 gap-1"><span className="h-1 rounded-full bg-violet-500" /><span className={`h-1 rounded-full ${step === 2 ? 'bg-violet-500' : 'bg-white/5'}`} /></div></div>}
          {mode === 'register' && step === 1 && <>
            <label className="auth-label">Tu nombre</label><div className="relative"><UserRound className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={name} onChange={(event) => setName(event.target.value)} className="auth-input pl-10" placeholder="¿Cómo te llamas?" maxLength={80} /></div>
            <label className="auth-label">Número celular</label><div className="relative"><Phone className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={phone} onChange={(event) => setPhone(event.target.value)} className="auth-input pl-10" inputMode="tel" autoComplete="tel" placeholder="246 123 4567" /></div>
            <label className="auth-label">Clave TuTop</label><div className="relative"><LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input px-10" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo 8 caracteres" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3.5 text-slate-600" aria-label={showPassword ? 'Ocultar clave' : 'Mostrar clave'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            <div className="mt-2 grid grid-cols-3 gap-1">{[1, 2, 3].map((value) => <span key={value} className={`h-1 rounded-full ${passwordScore >= value ? 'bg-emerald-400' : 'bg-white/5'}`} />)}</div>
            {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <button disabled={!firstStepReady} onClick={() => { setStep(2); setError(null); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black disabled:opacity-40"><ArrowRight className="h-4 w-4" />Continuar</button>
          </>}
          {mode === 'register' && step === 2 && <>
            <button onClick={() => setStep(1)} className="mt-4 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500"><ArrowLeft className="h-3.5 w-3.5" />Atrás</button>
            <h2 className="mt-4 text-lg font-black">¿En qué universidad estás?</h2><p className="mt-1 text-xs leading-5 text-slate-500">Elige institución y campus. Después puedes añadir facultad, carrera o comunidad.</p>
            <label className="auth-label">Institución</label><div className="relative"><Building2 className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><select value={institutionId} onChange={(event) => chooseInstitution(event.target.value)} className="auth-input pl-10">{INSTITUTIONS.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.short_name} · {item.name}</option>)}</select></div>
            <label className="auth-label">Campus</label><div className="relative"><MapPin className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><select value={campusId} onChange={(event) => setCampusId(event.target.value)} className="auth-input pl-10"><option value="">Selecciona campus</option>{campusOptions.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <button disabled={busy || !campusId} onClick={() => void submit()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}Crear mi cuenta TuTop</button>
            <p className="mt-3 text-center text-[9px] leading-5 text-slate-600">Elegir una institución no equivale a estar verificado. La verificación universitaria es progresiva y opcional.</p>
          </>}
          {mode === 'login' && <>
            <label className="auth-label">Número celular</label><div className="relative"><Phone className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={phone} onChange={(event) => setPhone(event.target.value)} className="auth-input pl-10" inputMode="tel" autoComplete="tel" placeholder="246 123 4567" /></div>
            <label className="auth-label">Clave TuTop</label><div className="relative"><LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input px-10" type={showPassword ? 'text' : 'password'} autoComplete="current-password" onKeyDown={(event) => event.key === 'Enter' && void submit()} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3.5 text-slate-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <button disabled={busy || !phone.trim() || password.length < 8} onClick={() => void submit()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}Entrar a TuTop</button>
          </>}
        </div>
      </div>
    </div>
  );
}

function SuspendedScreen({ reason, onSignOut }: { reason?: string; onSignOut: () => void }) {
  return <div className="grid min-h-screen place-items-center bg-[#070b12] px-6 text-center text-white"><div className="max-w-sm"><AlertTriangle className="mx-auto h-10 w-10 text-amber-300" /><h1 className="mt-4 text-xl font-black">Cuenta temporalmente restringida</h1><p className="mt-2 text-sm leading-6 text-slate-400">{reason || 'Tu cuenta requiere revisión antes de continuar usando el marketplace.'}</p><button onClick={onSignOut} className="mt-5 rounded-xl bg-white/5 px-4 py-2 text-xs font-bold">Cerrar sesión</button></div></div>;
}

function FullLoader({ label }: { label: string }) {
  return <div className="grid min-h-screen place-items-center bg-[#070b12] text-white"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-violet-400" /><p className="mt-3 text-xs text-slate-500">{label}</p></div></div>;
}
