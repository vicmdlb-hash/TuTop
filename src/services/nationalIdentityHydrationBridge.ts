import { identityFor, verificationBadge } from '../lib/universityNetwork';
import type { VerificationLevel } from '../types';
import { canonicalListingsBackend } from './canonicalListingsBackend';
import { FirebaseRestClient } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';
import { getFirebaseConfig } from './runtimeConfig';

if (nationalSchemaEnabled()) {
  const originalLoadSnapshot = onlineBackend.loadSnapshot.bind(onlineBackend);

  onlineBackend.loadSnapshot = async () => {
    const snapshot = await originalLoadSnapshot();
    const config = getFirebaseConfig();
    const firebase = new FirebaseRestClient(config);
    const uid = firebase.currentSession?.uid;
    if (!uid || uid !== snapshot.user.id) return snapshot;

    const profile = await firebase.getDocument<Record<string, unknown>>(`users/${uid}`).catch(() => null);
    if (!profile) return snapshot;
    const data = profile.data;
    const identity = identityFor(
      data.institution_id ? String(data.institution_id) : undefined,
      data.campus_id ? String(data.campus_id) : undefined,
      data.faculty_id ? String(data.faculty_id) : undefined,
      data.career_id ? String(data.career_id) : undefined,
    );
    const rawLevel = Number(data.verification_level ?? (snapshot.user.esta_verificado ? 2 : 0));
    const level = Math.max(0, Math.min(4, Number.isFinite(rawLevel) ? Math.trunc(rawLevel) : 0)) as VerificationLevel;

    // In schema V2 the feed has one authority only: listings_v2. This prevents the
    // legacy `products` snapshot and V2 hydrator from racing every 30 seconds.
    const products = await canonicalListingsBackend.loadMarketplaceProducts({
      campusId: identity.campus_id,
      institutionId: identity.institution_id,
      cityId: identity.city_id,
      limitPerScope: 30,
    }).catch(() => snapshot.products.filter((product) => product.listing_kind === 'offer' && product.institution_id));

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
