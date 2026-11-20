// Pure, no-I/O witness for Firebase push reads and receipt writes.
// UID alone cannot identify a session across logout -> same-UID login.
export type PushSessionIdentity = { uid: string; refreshToken: string };

export function isCurrentPushSession(
  expected: PushSessionIdentity | null | undefined,
  client: PushSessionIdentity | null | undefined,
  canonical: PushSessionIdentity | null | undefined,
): boolean {
  if (!expected?.uid || !expected.refreshToken || !client?.uid
      || !client.refreshToken || !canonical?.uid || !canonical.refreshToken) return false;
  return expected.uid === client.uid && expected.uid === canonical.uid
    && expected.refreshToken === client.refreshToken
    && expected.refreshToken === canonical.refreshToken;
}
