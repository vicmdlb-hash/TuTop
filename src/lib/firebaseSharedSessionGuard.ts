/** 
 * A UID is not a session identity: logout and login may return the same UID
 * with a new refresh token. Never log these credentials or persist fingerprints.
 */
export type FirebaseSessionIdentity = {
  uid: string;
  idToken: string;
  refreshToken: string;
};

export function sameFirebaseSession(
  a: FirebaseSessionIdentity | null | undefined,
  b: FirebaseSessionIdentity | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return Boolean(
    a.uid && a.idToken && a.refreshToken
    && a.uid === b.uid
    && a.idToken === b.idToken
    && a.refreshToken === b.refreshToken
  );
}

/** Fail closed when a Firestore request outlives its exact authenticated session. */
export function assertFirebaseRequestSessionCurrent(
  request: FirebaseSessionIdentity | null,
  runtime: FirebaseSessionIdentity | null,
  persisted: FirebaseSessionIdentity | null,
): void {
  if (!request || !sameFirebaseSession(request, runtime) || !sameFirebaseSession(request, persisted)) {
    throw new Error('AUTH_SESSION_CHANGED');
  }
}
