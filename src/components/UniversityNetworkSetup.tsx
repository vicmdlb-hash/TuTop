import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, ChevronRight, GraduationCap, MapPin, Network, ShieldCheck, X } from 'lucide-react';
import { CAMPUSES, FACULTIES, INSTITUTIONS, identityFor, verificationBadge } from '../lib/universityNetwork';
import { useAppStore } from '../store/useAppStore';

const STORAGE_KEY = 'tutop.university-identity.v1';

type StoredIdentity = {
  institution_id?: string;
  campus_id?: string;
  faculty_id?: string;
  career_id?: string;
};

function readStored(): StoredIdentity | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
}

export default function UniversityNetworkSetup() {
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const setCurrentFacultad = useAppStore((state) => state.setCurrentFacultad);
  const [open, setOpen] = useState(false);
  const [institutionId, setInstitutionId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [careerId, setCareerId] = useState('');

  useEffect(() => {
    const stored = readStored();
    if (!stored || !user.id) return;
    const identity = identityFor(stored.institution_id, stored.campus_id, stored.faculty_id, stored.career_id);
    if (!identity.institution_id || user.institution_id === identity.institution_id && user.campus_id === identity.campus_id && user.faculty_id === identity.faculty_id && user.career_id === identity.career_id) return;
    setUser({
      ...user,
      institution_id: identity.institution_id,
      campus_id: identity.campus_id,
      faculty_id: identity.faculty_id,
      career_id: identity.career_id,
      university: identity,
      verification_level: user.esta_verificado ? 2 : Math.max(0, user.verification_level || 0) as 0 | 1 | 2 | 3 | 4,
      verification_badge: verificationBadge(user.esta_verificado ? 2 : Math.max(0, user.verification_level || 0) as 0 | 1 | 2 | 3 | 4),
      facultad: identity.career_name || identity.faculty_name || user.facultad,
    });
  }, [user, setUser]);

  const selectedInstitution = INSTITUTIONS.find((item) => item.id === institutionId);
  const campusOptions = useMemo(() => CAMPUSES.filter((item) => item.institution_id === institutionId), [institutionId]);
  const facultyOptions = useMemo(() => FACULTIES.filter((item) => item.institution_id === institutionId && (!item.campus_id || !campusId || item.campus_id === campusId)), [institutionId, campusId]);
  const selectedFaculty = facultyOptions.find((item) => item.id === facultyId);
  const hasIdentity = Boolean(user.institution_id || user.university?.institution_id);
  const identityLabel = user.university?.institution_name || INSTITUTIONS.find((item) => item.id === user.institution_id)?.short_name;
  const campusLabel = user.university?.campus_name || CAMPUSES.find((item) => item.id === user.campus_id)?.name;

  const begin = () => {
    const stored = readStored();
    const existingInstitution = stored?.institution_id || user.institution_id || user.university?.institution_id || 'uatx';
    const existingCampus = stored?.campus_id || user.campus_id || user.university?.campus_id || '';
    const existingFaculty = stored?.faculty_id || user.faculty_id || user.university?.faculty_id || '';
    const existingCareer = stored?.career_id || user.career_id || user.university?.career_id || '';
    setInstitutionId(existingInstitution);
    setCampusId(existingCampus);
    setFacultyId(existingFaculty);
    setCareerId(existingCareer);
    setOpen(true);
  };

  const save = () => {
    const identity = identityFor(institutionId, campusId, facultyId, careerId);
    if (!identity.institution_id) return;
    const stored: StoredIdentity = { institution_id: identity.institution_id, campus_id: identity.campus_id, faculty_id: identity.faculty_id, career_id: identity.career_id };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch { /* local persistence is optional */ }
    const legacyFaculty = identity.career_name || identity.faculty_name || user.facultad;
    setUser({
      ...user,
      institution_id: identity.institution_id,
      campus_id: identity.campus_id,
      faculty_id: identity.faculty_id,
      career_id: identity.career_id,
      university: identity,
      verification_level: user.esta_verificado ? 2 : user.verification_level || 0,
      verification_badge: verificationBadge(user.esta_verificado ? 2 : user.verification_level || 0),
      facultad: legacyFaculty,
    });
    setCurrentFacultad(legacyFaculty);
    setOpen(false);
  };

  if (!user.id) return null;

  return <>
    <button onClick={begin} className="fixed right-3 top-[calc(68px+env(safe-area-inset-top))] z-[56] flex max-w-[210px] items-center gap-2 rounded-2xl border border-violet-300/15 bg-[#111827]/95 px-3 py-2 text-left shadow-xl backdrop-blur" aria-label="Configurar universidad y campus">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-violet-300"><Network className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><strong className="block truncate text-[10px] text-slate-100">{hasIdentity ? identityLabel : 'Configura tu universidad'}</strong><span className="block truncate text-[8px] text-slate-500">{hasIdentity ? campusLabel || 'Elige tu campus' : 'TuTop México · red universitaria'}</span></span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
    </button>

    {open && <div className="fixed inset-0 z-[150] grid items-end bg-black/70 p-2 backdrop-blur-sm sm:place-items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-white/10 bg-[#0b111c] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.14em] text-violet-300"><Network className="h-3.5 w-3.5" />Red TuTop México</div><h2 className="mt-3 text-xl font-black">¿Dónde estudias?</h2><p className="mt-1 text-xs leading-5 text-slate-500">Tu campus determina qué publicaciones son realmente cercanas. No compartimos tu ubicación exacta.</p></div><button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-slate-400" aria-label="Cerrar"><X className="h-4 w-4" /></button></div>

        <label className="auth-label">Institución</label><div className="relative"><Building2 className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><select value={institutionId} onChange={(event) => { setInstitutionId(event.target.value); setCampusId(''); setFacultyId(''); setCareerId(''); }} className="auth-input pl-10"><option value="">Selecciona tu universidad</option>{INSTITUTIONS.map((item) => <option key={item.id} value={item.id}>{item.short_name} · {item.name}</option>)}</select></div>

        <label className="auth-label">Campus</label><div className="relative"><MapPin className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><select value={campusId} disabled={!institutionId} onChange={(event) => { setCampusId(event.target.value); setFacultyId(''); setCareerId(''); }} className="auth-input pl-10 disabled:opacity-40"><option value="">{campusOptions.length ? 'Selecciona tu campus' : 'Campus pendiente de agregar'}</option>{campusOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>

        <label className="auth-label">Facultad / escuela <span className="font-normal text-slate-700">(opcional)</span></label><div className="relative"><GraduationCap className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><select value={facultyId} disabled={!institutionId} onChange={(event) => { setFacultyId(event.target.value); setCareerId(''); }} className="auth-input pl-10 disabled:opacity-40"><option value="">Prefiero elegirla después</option>{facultyOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>

        {selectedFaculty?.careers?.length ? <><label className="auth-label">Carrera <span className="font-normal text-slate-700">(opcional)</span></label><select value={careerId} onChange={(event) => setCareerId(event.target.value)} className="auth-input"><option value="">Prefiero elegirla después</option>{selectedFaculty.careers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></> : null}

        {selectedInstitution && <div className="mt-5 rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.06] p-3"><div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><div><strong className="text-[10px] text-emerald-100">Identidad universitaria progresiva</strong><p className="mt-1 text-[9px] leading-4 text-slate-500">Elegir tu universidad no significa que TuTop ya la verificó. La insignia de estudiante se obtiene después mediante correo institucional o credencial.</p></div></div></div>}

        <button disabled={!institutionId} onClick={save} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 text-sm font-black disabled:opacity-40"><CheckCircle2 className="h-4 w-4" />Guardar mi comunidad</button>
        <p className="mt-3 text-center text-[8px] leading-4 text-slate-700">Catálogo inicial en expansión. La arquitectura ya admite nuevas universidades, campus, facultades y carreras sin cambiar el modelo de datos.</p>
      </div>
    </div>}
  </>;
}
