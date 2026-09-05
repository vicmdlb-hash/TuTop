import type { ApprovedMeetingPoint, Campus, FacultyCatalogItem, Institution, ListingVisibilityScope, UniversityIdentity, VerificationBadge, VerificationLevel } from '../types';

export const INSTITUTIONS: Institution[] = [
  { id: 'uatx', name: 'Universidad Autónoma de Tlaxcala', short_name: 'UATx', country_code: 'MX', state_code: 'TLAX', state_name: 'Tlaxcala', city_name: 'Tlaxcala', domains: ['uatx.mx'], active: true },
  { id: 'buap', name: 'Benemérita Universidad Autónoma de Puebla', short_name: 'BUAP', country_code: 'MX', state_code: 'PUE', state_name: 'Puebla', city_name: 'Puebla', domains: ['buap.mx', 'alumno.buap.mx'], active: true },
  { id: 'unam', name: 'Universidad Nacional Autónoma de México', short_name: 'UNAM', country_code: 'MX', state_code: 'CMX', state_name: 'Ciudad de México', city_name: 'Ciudad de México', domains: ['unam.mx', 'comunidad.unam.mx'], active: true },
  { id: 'ipn', name: 'Instituto Politécnico Nacional', short_name: 'IPN', country_code: 'MX', state_code: 'CMX', state_name: 'Ciudad de México', city_name: 'Ciudad de México', domains: ['ipn.mx', 'alumno.ipn.mx'], active: true },
  { id: 'uanl', name: 'Universidad Autónoma de Nuevo León', short_name: 'UANL', country_code: 'MX', state_code: 'NLE', state_name: 'Nuevo León', city_name: 'San Nicolás de los Garza', domains: ['uanl.edu.mx'], active: true },
  { id: 'udg', name: 'Universidad de Guadalajara', short_name: 'UdeG', country_code: 'MX', state_code: 'JAL', state_name: 'Jalisco', city_name: 'Guadalajara', domains: ['udg.mx'], active: true },
  { id: 'uaq', name: 'Universidad Autónoma de Querétaro', short_name: 'UAQ', country_code: 'MX', state_code: 'QUE', state_name: 'Querétaro', city_name: 'Santiago de Querétaro', domains: ['uaq.mx'], active: true },
];

export const CAMPUSES: Campus[] = [
  { id: 'uatx-riberena', institution_id: 'uatx', name: 'Campus Ribereña', city_name: 'Tlaxcala', state_code: 'TLAX', active: true },
  { id: 'buap-cu', institution_id: 'buap', name: 'Ciudad Universitaria', city_name: 'Puebla', state_code: 'PUE', active: true },
  { id: 'unam-cu', institution_id: 'unam', name: 'Ciudad Universitaria', city_name: 'Ciudad de México', state_code: 'CMX', active: true },
  { id: 'uanl-cu', institution_id: 'uanl', name: 'Ciudad Universitaria', city_name: 'San Nicolás de los Garza', state_code: 'NLE', active: true },
  { id: 'udg-cu-csh', institution_id: 'udg', name: 'Centro Universitario de Ciencias Sociales y Humanidades', city_name: 'Guadalajara', state_code: 'JAL', active: true },
];

export const FACULTIES: FacultyCatalogItem[] = [
  { id: 'uatx-fcea', institution_id: 'uatx', campus_id: 'uatx-riberena', name: 'Ciencias Económico Administrativas', careers: [{ id: 'uatx-turismo', name: 'Turismo Internacional' }] },
  { id: 'uatx-derecho', institution_id: 'uatx', campus_id: 'uatx-riberena', name: 'Derecho, Ciencias Políticas y Criminología' },
  { id: 'buap-administracion', institution_id: 'buap', campus_id: 'buap-cu', name: 'Administración' },
  { id: 'unam-contaduria', institution_id: 'unam', campus_id: 'unam-cu', name: 'Contaduría y Administración' },
];

export const SAFE_MEETING_POINTS: ApprovedMeetingPoint[] = [
  { id: 'uatx-riberena-cafeteria', institution_id: 'uatx', campus_id: 'uatx-riberena', name: 'Cafetería Central · Campus Ribereña', description: 'Zona concurrida dentro del campus; preferente durante horario universitario.', active: true },
  { id: 'uatx-riberena-entrada', institution_id: 'uatx', campus_id: 'uatx-riberena', name: 'Acceso principal · Campus Ribereña', description: 'Punto visible y con flujo constante de estudiantes.', active: true },
  { id: 'buap-cu-biblioteca', institution_id: 'buap', campus_id: 'buap-cu', name: 'Zona de Biblioteca · CU BUAP', description: 'Referencia pública y concurrida dentro de Ciudad Universitaria.', active: true },
  { id: 'unam-cu-biblioteca-central', institution_id: 'unam', campus_id: 'unam-cu', name: 'Explanada Biblioteca Central · UNAM', description: 'Punto público de alta visibilidad; confirma horario antes de acudir.', active: true },
];

export const VISIBILITY_SCOPES: Array<{ id: ListingVisibilityScope; label: string; hint: string }> = [
  { id: 'campus', label: 'Mi campus', hint: 'Comida, apuntes y entregas rápidas.' },
  { id: 'institution', label: 'Mi universidad', hint: 'Libros, accesorios y servicios entre campus.' },
  { id: 'university-zone', label: 'Zona universitaria', hint: 'Renta, transporte y servicios cercanos.' },
  { id: 'city', label: 'Mi ciudad', hint: 'Electrónica, ropa y artículos generales.' },
  { id: 'national', label: 'Todo México', hint: 'Solo para artículos que realmente puedas enviar.' },
];

export function safeMeetingPointsFor(campusId?: string, institutionId?: string) {
  return SAFE_MEETING_POINTS.filter((point) => point.active && (campusId ? point.campus_id === campusId : institutionId ? point.institution_id === institutionId : false));
}

export function verificationBadge(level: VerificationLevel): VerificationBadge {
  if (level >= 4) return 'Vendedor destacado';
  if (level === 3) return 'Usuario confiable';
  if (level === 2) return 'Estudiante verificado';
  if (level === 1) return 'Universidad verificada';
  return 'Cuenta TuTop';
}

export function institutionFromEmail(email: string) {
  const domain = email.trim().toLowerCase().split('@')[1] || '';
  if (!domain) return undefined;
  return INSTITUTIONS.find((institution) => institution.domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`)));
}

export function identityFor(institutionId?: string, campusId?: string, facultyId?: string, careerId?: string): UniversityIdentity {
  const institution = INSTITUTIONS.find((item) => item.id === institutionId);
  const campus = CAMPUSES.find((item) => item.id === campusId && (!institutionId || item.institution_id === institutionId));
  const faculty = FACULTIES.find((item) => item.id === facultyId && (!institutionId || item.institution_id === institutionId));
  const career = faculty?.careers?.find((item) => item.id === careerId);
  return {
    country_code: 'MX',
    state_code: institution?.state_code || campus?.state_code,
    state_name: institution?.state_name,
    city_id: institution ? `${institution.state_code}-${institution.city_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined,
    city_name: campus?.city_name || institution?.city_name,
    institution_id: institution?.id,
    institution_name: institution?.name,
    campus_id: campus?.id,
    campus_name: campus?.name,
    faculty_id: faculty?.id,
    faculty_name: faculty?.name,
    career_id: career?.id,
    career_name: career?.name,
  };
}

export function listingMatchesScope(scope: ListingVisibilityScope, product: { institution_id?: string; campus_id?: string; city_id?: string; visibility_scope?: ListingVisibilityScope }, user: { institution_id?: string; campus_id?: string; university?: UniversityIdentity }) {
  if (scope === 'national') return true;
  const userInstitution = user.institution_id || user.university?.institution_id;
  const userCampus = user.campus_id || user.university?.campus_id;
  const userCity = user.university?.city_id;
  if (scope === 'campus') return Boolean(userCampus && product.campus_id === userCampus);
  if (scope === 'institution') return Boolean(userInstitution && product.institution_id === userInstitution);
  if (scope === 'city' || scope === 'university-zone') return Boolean(userCity && product.city_id === userCity);
  return true;
}

export function defaultScopeForCategory(category?: string): ListingVisibilityScope {
  if (!category) return 'campus';
  if (['Comida', 'Postres', 'Apuntes & Guías', 'Libros & Apuntes', 'Servicios'].includes(category)) return 'campus';
  if (['Cuartos & Renta', 'Transporte'].includes(category)) return 'university-zone';
  if (['Electrónica', 'Ropa & Accesorios', 'Hogar', 'Videojuegos'].includes(category)) return 'city';
  return 'institution';
}
