import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail, MapPin, Phone, RefreshCw, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { CAMPUSES, INSTITUTIONS } from '../lib/universityNetwork';
import { clearApproxLocation } from '../lib/nearbyMarketplace';
import { nationalSchemaEnabled } from '../services/nationalBackend';
import { onlineBackend } from '../services/onlineBackend';
import { completePendingUniversityIdentity } from '../services/v2OnboardingRecovery';
import { verifiedEmailBetaAuth, type VerifiedEmailBetaStatus } from '../services/verifiedEmailBetaAuth';
import { useAppStore } from '../store/useAppStore';

type AuthMode = 'login' | 'register' | 'legacy';

function friendlyError(raw: string) {
  if (/EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/i.test(raw)) return 'Datos de acceso o clave incorrectos.';
  if (/EMAIL_EXISTS/i.test(raw)) return 'Ese correo ya tiene una cuenta. Usa “Entrar”.';
  if (/EMAIL_INVALID|INVALID_EMAIL/i.test(raw)) return 'Escribe un correo electrónico válido.';
  if (/WEAK_PASSWORD|PASSWORD_DOES_NOT_MEET_REQUIREMENTS/i.test(raw)) return 'Tu Clave TuTop necesita al menos 8 caracteres.';
  if (/TOO_MANY_ATTEMPTS|TOO_MANY_REQUESTS/i.test(raw)) return 'Hubo demasiados intentos. Inténtalo de nuevo más tarde.';
  if (/NETWORK|FETCH|OFFLINE/i.test(raw)) return 'No pudimos conectar. Revisa tu internet e inténtalo otra vez.';
  if (/OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND/i.test(raw)) return 'Ese método de recuperación no está disponible en esta beta. Usa “Entrar” con tu correo o crea una cuenta nueva.';
  if (/PERMISSION_DENIED|403/i.test(raw)) return 'Tu identidad todavía no autoriza esta acción. Verifica tu correo e inténtalo otra vez.';
  if (/PROFILE_MISSING|WALLET_MISSING|PRIVATE_IDENTITY_MISSING/i.test(raw)) return 'Tu cuenta necesita una reparación rápida. Vuelve a intentarlo.';
  if (/AUTH_UID_MISMATCH/i.test(raw)) return 'Detuvimos la migración porque la cuenta no coincidió. No se creó una cuenta nueva.';
  return raw.length < 120 ? raw : 'Algo no salió como esperábamos. Inténtalo otra vez.';
}

export default function BackendGate({ children }: { children: ReactNode }) {
  const hydrateOnline = useAppStore((state) => state.hydrateOnline);
  const clearOnline = useAppStore((state) => state.clearOnline);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suspended, setSuspended] = useState<{ active: boolean; reason?: string }>({ active: false });
  const [verificationPending, setVerificationPending] = useState<VerifiedEmailBetaStatus | null>(null);
  const [legacyIdentity, setLegacyIdentity] = useState(false);
  const syncInFlight = useRef(false);

  const signOutAll = () => {
    const currentUid = useAppStore.getState().user.id;
    clearApproxLocation(currentUid || undefined);
    try { onlineBackend.signOut(); } catch { /* no configured client */ }
    verifiedEmailBetaAuth.signOut();
    clearOnline();
    setAuthenticated(false);
    setVerificationPending(null);
    setLegacyIdentity(false);
    setSuspended({ active: false });
  };

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
        setVerificationPending(null);
        setLegacyIdentity(false);
        setSuspended({ active: false });
        return;
      }

      const localIdentity = verifiedEmailBetaAuth.readLocalStatus();
      if (!localIdentity) {
        // Legacy phone-alias sessions prove possession of the existing TuTop
        // password, but not ownership of the phone number. Keep sensitive flows
        // closed and offer same-UID migration to a real email instead of forcing
        // a duplicate re-registration.
        setLegacyIdentity(true);
        setAuthenticated(true);
        setVerificationPending(null);
        return;
      }

      const verified = await verifiedEmailBetaAuth.refreshVerificationStatus();
      if (!verified.emailVerified) {
        setAuthenticated(true);
        setVerificationPending(verified);
        setLegacyIdentity(false);
        return;
      }

      setVerificationPending(null);
      setLegacyIdentity(false);
      onlineBackend.configureFromRuntime();
      if (nationalSchemaEnabled()) await completePendingUniversityIdentity().catch(() => false);
      const snapshot = await onlineBackend.loadSnapshot();
      hydrateOnline(snapshot);
      setAuthenticated(true);
      setSuspended({ active: snapshot.user.is_suspended === true, reason: snapshot.user.suspension_reason });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      if (message === 'AUTH_REQUIRED' || /TOKEN_EXPIRED|INVALID_ID_TOKEN|USER_NOT_FOUND/i.test(message)) signOutAll();
      else setError(friendlyError(message));
    } finally {
      syncInFlight.current = false;
      setLoading(false);
    }
  };

  useEffect(() => { void sync(); }, []);
  useEffect(() => {
    if (!authenticated || verificationPending || legacyIdentity) return;
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
  }, [authenticated, verificationPending, legacyIdentity]);

  if (!authenticated && !loading) return <AuthScreen onAuthenticated={() => void sync()} />;
  if (loading && !authenticated) return <FullLoader label="Preparando TuTop…" />;
  if (legacyIdentity) return <LegacyIdentityScreen onMigrated={() => void sync()} onSignOut={signOutAll} />;
  if (verificationPending) return <EmailVerificationScreen status={verificationPending} onVerified={() => void sync()} onSignOut={signOutAll} />;
  if (authenticated && suspended.active) return <SuspendedScreen reason={suspended.reason} onSignOut={signOutAll} />;

  return <>{error && <div className="fixed inset-x-3 top-[calc(10px+env(safe-area-inset-top))] z-[120] mx-auto max-w-xl rounded-2xl border border-amber-300/20 bg-[#17110b]/95 p-3 text-xs text-amber-100 shadow-2xl backdrop-blur"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><strong>No pudimos sincronizar TuTop</strong><p className="mt-1 text-amber-100/65">{error}</p></div><button onClick={() => void sync()} className="rounded-lg border border-amber-200/15 px-2 py-1 font-bold">Reintentar</button></div></div>}{children}</>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>('register');
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordScore = password.length >= 12 ? 3 : password.length >= 10 ? 2 : password.length >= 8 ? 1 : 0;
  const campusOptions = useMemo(() => CAMPUSES.filter((campus) => campus.institution_id === institutionId), [institutionId]);
  const institution = INSTITUTIONS.find((item) => item.id === institutionId);
  const campus = campusOptions.find((item) => item.id === campusId);

  const chooseInstitution = (id: string) => {
    setInstitutionId(id);
    setCampusId('');
  };

  const submit = async () => {
    try {
      setBusy(true);
      setError(null);
      if (mode === 'register') {
        if (name.trim().length < 2) throw new Error('Escribe tu nombre.');
        if (!institutionId || !campusId || !institution || !campus) throw new Error('Selecciona universidad y campus.');
        const legacyAdapter = campus.name || institution.short_name || 'Red universitaria';
        await verifiedEmailBetaAuth.register(email, password, {
          nombre: name,
          facultad: legacyAdapter,
          institution_id: institutionId,
          institution_name: institution.name,
          campus_id: campusId,
          campus_name: campus.name,
          phone: phone.trim() || undefined,
        });
      } else if (mode === 'legacy') {
        await verifiedEmailBetaAuth.recoverLegacyPhoneAccount(phone, password, email);
      } else {
        await verifiedEmailBetaAuth.login(email, password);
      }
      onAuthenticated();
    } catch (submitError) {
      const raw = submitError instanceof Error ? submitError.message : String(submitError);
      setError(raw === 'Escribe tu nombre.' || raw === 'Selecciona universidad y campus.' ? raw : friendlyError(raw));
    } finally {
      setBusy(false);
    }
  };

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const firstStepReady = name.trim().length >= 2 && validEmail && password.length >= 8;
  const legacyReady = validEmail && phone.replace(/\D/g, '').length >= 10 && password.length >= 8;

  return (
    <div className="auth-screen min-h-screen px-4 py-8 text-white sm:grid sm:place-items-center">
      <div className="w-full max-w-md overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#0b111c] shadow-2xl">
        <div className="relative overflow-hidden px-6 pb-6 pt-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(168,85,247,.30),transparent_43%),radial-gradient(circle_at_92%_10%,rgba(56,189,248,.12),transparent_30%)]" />
          <div className="relative">
            <div><div className="wordmark text-4xl" aria-label="TuTop"><span>Tu</span><span>Top</span></div><p className="mt-1 text-[10px] font-bold uppercase tracking-[.18em] text-violet-300/80">Descubre, conecta y encuentra cerca de ti.</p></div>
            <h1 className="mt-7 text-[27px] font-black leading-[1.05] tracking-[-.04em]">Compra, vende y encuentra dentro de tu comunidad.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">Para proteger publicaciones y transacciones, esta beta verifica que tengas acceso a un correo real.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-semibold text-slate-300"><span className="auth-benefit"><ShieldCheck />Identidad verificable</span><span className="auth-benefit"><Sparkles />10 UCoins de bienvenida</span></div>
          </div>
        </div>
        <div className="border-t border-white/[0.06] p-5 sm:p-6">
          <div className="grid grid-cols-2 rounded-xl bg-[#070b12] p-1"><button onClick={() => { setMode('register'); setStep(1); setError(null); }} className={`rounded-lg py-2.5 text-[10px] font-black ${mode === 'register' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Crear cuenta</button><button onClick={() => { setMode('login'); setStep(1); setError(null); }} className={`rounded-lg py-2.5 text-[10px] font-black ${mode === 'login' ? 'bg-violet-600 text-white' : 'text-slate-500'}`}>Entrar</button></div>
          {mode === 'register' && <div className="mt-4"><div className="flex items-center justify-between text-[10px] font-bold"><span className="text-violet-300">Paso {step} de 2</span><span className="text-slate-600">{step === 1 ? 'Tu cuenta' : 'Tu red universitaria'}</span></div><div className="mt-2 grid grid-cols-2 gap-1"><span className="h-1 rounded-full bg-violet-500" /><span className={`h-1 rounded-full ${step === 2 ? 'bg-violet-500' : 'bg-white/5'}`} /></div></div>}
          {mode === 'register' && step === 1 && <>
            <label className="auth-label">Tu nombre</label><div className="relative"><UserRound className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={name} onChange={(event) => setName(event.target.value)} className="auth-input pl-10" placeholder="¿Cómo te llamas?" maxLength={80} /></div>
            <label className="auth-label">Correo electrónico</label><div className="relative"><Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={email} onChange={(event) => setEmail(event.target.value)} className="auth-input pl-10" inputMode="email" autoComplete="email" placeholder="tu@correo.com" maxLength={180} /></div>
            <p className="mt-2 text-[9px] leading-4 text-slate-500">Te enviaremos un enlace de Firebase para demostrar que tienes acceso a este correo.</p>
            <label className="auth-label">Celular <span className="font-normal text-slate-600">(opcional)</span></label><div className="relative"><Phone className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={phone} onChange={(event) => setPhone(event.target.value)} className="auth-input pl-10" inputMode="tel" autoComplete="tel" placeholder="246 123 4567" /></div>
            <p className="mt-2 text-[9px] leading-4 text-slate-500">El celular permanece SIN VERIFICAR mientras no exista OTP real; no se usa como prueba de identidad.</p>
            <label className="auth-label">Clave TuTop</label><div className="relative"><LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input px-10" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo 8 caracteres" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3.5 text-slate-600" aria-label={showPassword ? 'Ocultar clave' : 'Mostrar clave'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            <div className="mt-2 grid grid-cols-3 gap-1">{[1, 2, 3].map((value) => <span key={value} className={`h-1 rounded-full ${passwordScore >= value ? 'bg-emerald-400' : 'bg-white/5'}`} />)}</div>
            {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <button disabled={!firstStepReady} onClick={() => { setStep(2); setError(null); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black disabled:opacity-40"><ArrowRight className="h-4 w-4" />Continuar</button>
          </>}
          {mode === 'register' && step === 2 && <>
            <button onClick={() => setStep(1)} className="mt-4 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500"><ArrowLeft className="h-3.5 w-3.5" />Atrás</button>
            <h2 className="mt-4 text-lg font-black">¿En qué universidad estás?</h2><p className="mt-1 text-xs leading-5 text-slate-500">Elige institución y campus; nunca se infieren por LADA o ubicación.</p>
            <label className="auth-label">Institución</label><div className="relative"><Building2 className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><select value={institutionId} onChange={(event) => chooseInstitution(event.target.value)} className="auth-input pl-10"><option value="">Selecciona institución</option>{INSTITUTIONS.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.short_name} · {item.name}</option>)}</select></div>
            <label className="auth-label">Campus</label><div className="relative"><MapPin className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><select value={campusId} onChange={(event) => setCampusId(event.target.value)} className="auth-input pl-10" disabled={!institutionId}><option value="">Selecciona campus</option>{campusOptions.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <button disabled={busy || !institutionId || !campusId} onClick={() => void submit()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}Crear mi cuenta TuTop</button>
            <p className="mt-3 text-center text-[9px] leading-5 text-slate-600">Seleccionar universidad no prueba afiliación académica. El correo prueba control de una identidad digital; otros niveles de verificación siguen separados.</p>
          </>}
          {mode === 'login' && <>
            <label className="auth-label">Correo electrónico</label><div className="relative"><Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={email} onChange={(event) => setEmail(event.target.value)} className="auth-input pl-10" inputMode="email" autoComplete="email" placeholder="tu@correo.com" /></div>
            <label className="auth-label">Clave TuTop</label><div className="relative"><LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input px-10" type={showPassword ? 'text' : 'password'} autoComplete="current-password" onKeyDown={(event) => event.key === 'Enter' && void submit()} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3.5 text-slate-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <button disabled={busy || !validEmail || password.length < 8} onClick={() => void submit()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}Entrar a TuTop</button>
            <button type="button" onClick={() => { setMode('legacy'); setError(null); }} className="mt-3 w-full text-center text-[10px] font-bold text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline">¿Usabas TuTop antes? Recuperar cuenta anterior</button>
          </>}
          {mode === 'legacy' && <>
            <button type="button" onClick={() => { setMode('login'); setError(null); }} className="mt-4 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500"><ArrowLeft className="h-3.5 w-3.5" />Volver a Entrar</button>
            <div className="mt-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-3 text-[10px] leading-5 text-amber-100/80">Usa el número y la Clave TuTop de tu cuenta anterior. El número sólo sirve para localizar esa cuenta; no se considera verificado. Tu UID, publicaciones, chats y UCoins se conservan.</div>
            <label className="auth-label">Número de tu cuenta anterior</label><div className="relative"><Phone className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={phone} onChange={(event) => setPhone(event.target.value)} className="auth-input pl-10" inputMode="tel" autoComplete="tel" placeholder="246 123 4567" /></div>
            <label className="auth-label">Correo real para actualizar la cuenta</label><div className="relative"><Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={email} onChange={(event) => setEmail(event.target.value)} className="auth-input pl-10" inputMode="email" autoComplete="email" placeholder="tu@correo.com" maxLength={180} /></div>
            <label className="auth-label">Clave TuTop existente</label><div className="relative"><LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input px-10" type={showPassword ? 'text' : 'password'} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3.5 text-slate-600">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            <p className="mt-2 text-[9px] leading-4 text-slate-500">Firebase cambiará el correo sobre la misma cuenta y después te pedirá verificarlo por enlace. No se crea otra cuenta ni se usa SMS.</p>
            {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <button disabled={busy || !legacyReady} onClick={() => void submit()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Recuperar mi misma cuenta</button>
          </>}
        </div>
      </div>
    </div>
  );
}

function EmailVerificationScreen({ status, onVerified, onSignOut }: { status: VerifiedEmailBetaStatus; onVerified: () => void; onSignOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const check = async () => {
    try {
      setBusy(true); setMessage('');
      const current = await verifiedEmailBetaAuth.refreshVerificationStatus();
      if (current.emailVerified) { onVerified(); return; }
      setMessage('El correo todavía aparece pendiente. Abre el enlace recibido y vuelve a comprobar.');
    } catch (error) { setMessage(friendlyError(error instanceof Error ? error.message : String(error))); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    try {
      setBusy(true); setMessage('');
      await verifiedEmailBetaAuth.resendVerificationEmail();
      setMessage('Nuevo correo de verificación enviado. Revisa también Spam/No deseado.');
    } catch (error) { setMessage(friendlyError(error instanceof Error ? error.message : String(error))); }
    finally { setBusy(false); }
  };
  return <div className="grid min-h-screen place-items-center bg-[#070b12] px-6 text-center text-white"><div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b111c] p-6"><Mail className="mx-auto h-10 w-10 text-violet-300" /><h1 className="mt-4 text-xl font-black">Verifica tu correo</h1><p className="mt-2 text-sm leading-6 text-slate-400">Abre el enlace de verificación de <strong className="text-slate-200">{status.email}</strong>. Si no recibiste el correo, pulsa “Reenviar correo”. Hasta verificarlo puedes conservar tu cuenta, pero publicación, chat, ofertas y reservaciones permanecen bloqueados por Security Rules.</p>{message && <p className="mt-4 rounded-xl bg-white/5 p-3 text-xs text-slate-300">{message}</p>}<button disabled={busy} onClick={() => void check()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3 text-sm font-black disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Ya verifiqué · comprobar</button><button disabled={busy} onClick={() => void resend()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-xs font-bold text-slate-300 disabled:opacity-50"><RefreshCw className="h-4 w-4" />Reenviar correo</button><button onClick={onSignOut} className="mt-4 text-xs font-bold text-slate-500">Usar otra cuenta</button></div></div>;
}

function LegacyIdentityScreen({ onMigrated, onSignOut }: { onMigrated: () => void; onSignOut: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const migrate = async () => {
    try {
      setBusy(true); setMessage('');
      await verifiedEmailBetaAuth.migrateCurrentLegacySession(email);
      onMigrated();
    } catch (error) { setMessage(friendlyError(error instanceof Error ? error.message : String(error))); }
    finally { setBusy(false); }
  };
  return <div className="grid min-h-screen place-items-center bg-[#070b12] px-6 text-center text-white"><div className="w-full max-w-sm rounded-3xl border border-amber-300/15 bg-[#0b111c] p-6"><AlertTriangle className="mx-auto h-10 w-10 text-amber-300" /><h1 className="mt-4 text-xl font-black">Actualiza tu cuenta anterior</h1><p className="mt-2 text-sm leading-6 text-slate-400">Tu sesión antigua sigue perteneciendo al mismo UID. El número no demuestra propiedad del teléfono, así que no lo marcaremos como verificado. Agrega un correo real y conservaremos la misma cuenta, publicaciones, chats y UCoins.</p><label className="auth-label text-left">Correo real</label><div className="relative"><Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={email} onChange={(event) => setEmail(event.target.value)} className="auth-input pl-10 text-left" inputMode="email" autoComplete="email" placeholder="tu@correo.com" /></div>{message && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{message}</p>}<button disabled={busy || !validEmail} onClick={() => void migrate()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Conservar mi cuenta y verificar correo</button><button onClick={onSignOut} className="mt-4 text-xs font-bold text-slate-500">Cerrar sesión</button></div></div>;
}

function SuspendedScreen({ reason, onSignOut }: { reason?: string; onSignOut: () => void }) {
  return <div className="grid min-h-screen place-items-center bg-[#070b12] px-6 text-center text-white"><div className="max-w-sm"><AlertTriangle className="mx-auto h-10 w-10 text-amber-300" /><h1 className="mt-4 text-xl font-black">Cuenta temporalmente restringida</h1><p className="mt-2 text-sm leading-6 text-slate-400">{reason || 'Tu cuenta requiere revisión antes de continuar usando el marketplace.'}</p><button onClick={onSignOut} className="mt-5 rounded-xl bg-white/5 px-4 py-2 text-xs font-bold">Cerrar sesión</button></div></div>;
}

function FullLoader({ label }: { label: string }) {
  return <div className="grid min-h-screen place-items-center bg-[#070b12] text-white"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-violet-400" /><p className="mt-3 text-xs text-slate-500">{label}</p></div></div>;
}
