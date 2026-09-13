import { CAMPUSES, FACULTIES, INSTITUTIONS, identityFor, verificationBadge } from '../lib/universityNetwork';
import type { UniversityIdentity, VerificationLevel } from '../types';
import { canonicalListingsBackend } from './canonicalListingsBackend';
import { FirebaseRestClient } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';
import { getFirebaseConfig } from './runtimeConfig';

const IDENTITY_CACHE_TTL_MS = 5 * 60_000;
const identityCache = new Map<string, { identity: UniversityIdentity; level: VerificationLevel; expiresAt: number }>();

type ResolvedIdentity = {
  institution: (typeof INSTITUTIONS)[number];
  campus: (typeof CAMPUSES)[number];
  faculty?: (typeof FACULTIES)[number];
  career?: NonNullable<(typeof FACULTIES)[number]['careers']>[number];
};

function normalized(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function canonicalInstitution(...values: unknown[]) {
  const needles = values.map(normalized).filter(Boolean);
  return INSTITUTIONS.find((institution) => {
    const candidates = [institution.id, institution.name, institution.short_name].map(normalized);
    return needles.some((needle) => candidates.includes(needle));
  });
}

function canonicalCampus(institutionId: string, ...values: unknown[]) {
  const candidates = CAMPUSES.filter((campus) => campus.institution_id === institutionId && campus.active);
  const needles = values.map(normalized).filter(Boolean);
  const exact = candidates.find((campus) => needles.some((needle) => [campus.id, campus.name].map(normalized).includes(needle)));
  if (exact) return exact;
  // A legacy beta profile often stored only the university. If that university
  // has exactly one canonical campus in the current catalog, choosing it is
  // deterministic and avoids fabricating an arbitrary campus.
  return candidates.length === 1 ? candidates[0] : undefined;
}

function canonicalFaculty(institutionId: string, campusId: string, ...values: unknown[]) {
  const needles = values.map(normalized).filter(Boolean);
  return FACULTIES.find((faculty) => faculty.institution_id === institutionId
    && faculty.campus_id === campusId
    && needles.some((needle) => [faculty.id, faculty.name].map(normalized).includes(needle)));
}

function canonicalCareer(faculty: (typeof FACULTIES)[number] | undefined, ...values: unknown[]) {
  if (!faculty?.careers?.length) return undefined;
  const needles = values.map(normalized).filter(Boolean);
  return faculty.careers.find((career) => needles.some((needle) => [career.id, career.name].map(normalized).includes(needle)));
}

function resolveCanonicalIdentity(input: Record<string, unknown>, fallback: Record<string, unknown> = {}): ResolvedIdentity | null {
  const institution = canonicalInstitution(
    input.institution_id, input.institution_name,
    fallback.institution_id, fallback.institution_name,
  );
  if (!institution) return null;
  const campus = canonicalCampus(
    institution.id,
    input.campus_id, input.campus_name,
    fallback.campus_id, fallback.campus_name,
  );
  if (!campus) return null;
  const faculty = canonicalFaculty(
    institution.id,
    campus.id,
    input.faculty_id, input.faculty_name, input.facultad,
    fallback.faculty_id, fallback.faculty_name, fallback.facultad,
  );
  const career = canonicalCareer(
    faculty,
    input.career_id, input.career_name,
    fallback.career_id, fallback.career_name,
  );
  return { institution, campus, faculty, career };
}

async function validateResolvedIdentityInFirestore(firebase: FirebaseRestClient, resolved: ResolvedIdentity): Promise<ResolvedIdentity> {
  const [institutionDoc, campusDoc] = await Promise.all([
    firebase.getDocument<Record<string, unknown>>(`institutions/${resolved.institution.id}`),
    firebase.getDocument<Record<string, unknown>>(`campuses/${resolved.campus.id}`),
  ]);
  if (!institutionDoc) throw new Error('INSTITUTION_CATALOG_MISSING');
  if (!campusDoc) throw new Error('CAMPUS_CATALOG_MISSING');
  if (String(campusDoc.data.institution_id || '') !== resolved.institution.id) {
    throw new Error('CAMPUS_INSTITUTION_MISMATCH');
  }

  let faculty = resolved.faculty;
  if (faculty) {
    const facultyDoc = await firebase.getDocument<Record<string, unknown>>(`faculties/${faculty.id}`);
    if (!facultyDoc) faculty = undefined;
  }

  let career = faculty ? resolved.career : undefined;
  if (career) {
    const careerDoc = await firebase.getDocument<Record<string, unknown>>(`careers/${career.id}`);
    if (!careerDoc) career = undefined;
  }

  return { institution: resolved.institution, campus: resolved.campus, faculty, career };
}

function profileMatchesResolved(profileData: Record<string, unknown>, resolved: ResolvedIdentity) {
  return String(profileData.institution_id || '') === resolved.institution.id
    && String(profileData.campus_id || '') === resolved.campus.id
    && (!resolved.faculty || String(profileData.faculty_id || '') === resolved.faculty.id)
    && (!resolved.career || String(profileData.career_id || '') === resolved.career.id);
}

async function migrateLegacyIdentity(firebase: FirebaseRestClient, uid: string, profileData: Record<string, unknown>, resolved: ResolvedIdentity) {
  const identity = identityFor(resolved.institution.id, resolved.campus.id, resolved.faculty?.id, resolved.career?.id);
  const next: Record<string, unknown> = {
    ...profileData,
    country_code: 'MX',
    state_code: identity.state_code,
    city_id: identity.city_id,
    city_name: identity.city_name,
    institution_id: identity.institution_id,
    institution_name: identity.institution_name,
    campus_id: identity.campus_id,
    campus_name: identity.campus_name,
    updated_at: new Date().toISOString(),
  };

  // Remove stale optional identity IDs instead of preserving invalid catalog
  // references. Firestore allows these identity keys to change on an owner
  // profile update, while immutable account fields remain untouched.
  for (const key of ['faculty_id', 'faculty_name', 'career_id', 'career_name']) delete next[key];
  if (identity.faculty_id) next.faculty_id = identity.faculty_id;
  if (identity.faculty_name) next.faculty_name = identity.faculty_name;
  if (identity.career_id) next.career_id = identity.career_id;
  if (identity.career_name) next.career_name = identity.career_name;

  await firebase.setDocument(`users/${uid}`, next);
  const verified = await firebase.getDocument<Record<string, unknown>>(`users/${uid}`);
  if (!verified || !profileMatchesResolved(verified.data, resolved)) throw new Error('PROFILE_IDENTITY_RECHECK_FAILED');
  identityCache.delete(uid);
  return identity;
}

if (nationalSchemaEnabled()) {
  // Canonical publication has one authority path. Before creating listings_v2,
  // prove the selected institution/campus against the real Firestore catalog,
  // reconcile the owner profile, then re-read it. Never swallow an identity
  // error and "try the listing anyway" because that only moves the failure into
  // Firestore rules and creates a confusing physical-device loop.
  const originalCreateListing = canonicalListingsBackend.create.bind(canonicalListingsBackend);
  canonicalListingsBackend.create = async (listing, category) => {
    const firebase = new FirebaseRestClient(getFirebaseConfig());
    const uid = firebase.currentSession?.uid;
    if (!uid || uid !== listing.seller_id) return originalCreateListing(listing, category);

    const profile = await firebase.getDocument<Record<string, unknown>>(`users/${uid}`);
    if (!profile) throw new Error('Tu perfil de TuTop no está disponible. Cierra sesión, vuelve a entrar e intenta publicar de nuevo.');

    // The listing reflects the community currently selected by the user. It must
    // resolve independently; a stale profile is not allowed to silently replace
    // the selection. Firestore catalog documents are then the final authority.
    const selected = resolveCanonicalIdentity({
      institution_id: listing.institution_id,
      campus_id: listing.campus_id,
      faculty_id: listing.faculty_id,
      career_id: listing.career_id,
    });
    if (!selected) {
      throw new Error('La universidad o campus seleccionado ya no pertenece al catálogo vigente. Vuelve a elegir tu comunidad desde Perfil y reintenta.');
    }

    let resolved: ResolvedIdentity;
    try {
      resolved = await validateResolvedIdentityInFirestore(firebase, selected);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`No pudimos validar tu universidad/campus contra el catálogo de TuTop (${reason}). El anuncio no se creó.`);
    }

    if (!profileMatchesResolved(profile.data, resolved)) {
      try {
        await migrateLegacyIdentity(firebase, uid, profile.data, resolved);
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        throw new Error(`No pudimos sincronizar la universidad/campus de tu cuenta antes de publicar (${raw}). El anuncio no se creó.`);
      }
    } else {
      // Even an apparently canonical profile is re-read immediately before the
      // listing write, so another stale in-memory copy cannot race this invariant.
      const verified = await firebase.getDocument<Record<string, unknown>>(`users/${uid}`);
      if (!verified || !profileMatchesResolved(verified.data, resolved)) {
        throw new Error('Tu perfil cambió mientras preparábamos la publicación. Vuelve a intentarlo; el anuncio no se creó.');
      }
    }

    const canonicalIdentity = identityFor(resolved.institution.id, resolved.campus.id, resolved.faculty?.id, resolved.career?.id);
    return originalCreateListing({
      ...listing,
      institution_id: resolved.institution.id,
      campus_id: resolved.campus.id,
      city_id: canonicalIdentity.city_id || listing.city_id,
      faculty_id: resolved.faculty?.id,
      career_id: resolved.career?.id,
    }, category);
  };

  const originalLoadSnapshot = onlineBackend.loadSnapshot.bind(onlineBackend);

  onlineBackend.loadSnapshot = async () => {
    const snapshot = await originalLoadSnapshot();
    const config = getFirebaseConfig();
    const firebase = new FirebaseRestClient(config);
    const uid = firebase.currentSession?.uid;
    if (!uid || uid !== snapshot.user.id) return snapshot;

    const cached = identityCache.get(uid);
    let identity: UniversityIdentity;
    let level: VerificationLevel;

    if (cached && cached.expiresAt > Date.now()) {
      identity = cached.identity;
      level = cached.level;
    } else {
      // The base snapshot has already proven this profile exists. A second cold-read
      // failure must not downgrade V2 into an identity-less, empty marketplace state.
      const profile = await firebase.getDocument<Record<string, unknown>>(`users/${uid}`);
      if (!profile) throw new Error('PROFILE_MISSING');
      const data = profile.data;
      const resolved = resolveCanonicalIdentity(data);
      identity = resolved
        ? identityFor(resolved.institution.id, resolved.campus.id, resolved.faculty?.id, resolved.career?.id)
        : identityFor(
          data.institution_id ? String(data.institution_id) : undefined,
          data.campus_id ? String(data.campus_id) : undefined,
          data.faculty_id ? String(data.faculty_id) : undefined,
          data.career_id ? String(data.career_id) : undefined,
        );
      const rawLevel = Number(data.verification_level ?? (snapshot.user.esta_verificado ? 2 : 0));
      level = Math.max(0, Math.min(4, Number.isFinite(rawLevel) ? Math.trunc(rawLevel) : 0)) as VerificationLevel;
      identityCache.set(uid, { identity, level, expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS });
    }

    let products;
    try {
      products = await canonicalListingsBackend.loadMarketplaceProducts({
        campusId: identity.campus_id,
        institutionId: identity.institution_id,
        cityId: identity.city_id,
        limitPerScope: 30,
      });
    } catch (error) {
      console.warn('[TuTop V2 canonical listings hydration]', error);
      throw new Error('NETWORK_V2_LISTINGS_SYNC_UNAVAILABLE');
    }

    return {
      ...snapshot,
      products,
      user: {
        ...snapshot.user,
        institution_id: identity.institution_id,
        campus_id: identity.campus_id,
        faculty_id: identity.faculty_id,
        career_id: identity.career_id,
        university: identity.institution_id ? identity : undefined,
        verification_level: level,
        verification_badge: verificationBadge(level),
      },
    };
  };
}