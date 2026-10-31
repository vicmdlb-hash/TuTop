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
