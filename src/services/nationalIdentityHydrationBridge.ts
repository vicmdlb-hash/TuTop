import { identityFor, verificationBadge } from '../lib/universityNetwork';
import type { VerificationLevel } from '../types';
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

    return {
      ...snapshot,
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
