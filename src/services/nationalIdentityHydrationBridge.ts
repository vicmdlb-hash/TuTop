import { identityFor, verificationBadge } from '../lib/universityNetwork';
import type { UniversityIdentity, VerificationLevel } from '../types';
import { canonicalListingsBackend } from './canonicalListingsBackend';
import { FirebaseRestClient } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';
import { getFirebaseConfig } from './runtimeConfig';

const IDENTITY_CACHE_TTL_MS = 5 * 60_000;
const identityCache = new Map<string, { identity: UniversityIdentity; level: VerificationLevel; expiresAt: number }>();

if (nationalSchemaEnabled()) {
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
      identity = identityFor(
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