// Pure, synthetic-testable create-first protocol. No Firebase initialization,
// network IO, secrets or native device calls occur in this module.

// This input crosses native/browser bridges that are not guaranteed to obey
// TypeScript annotations at runtime. Reject malformed values BEFORE hashing,
// building a Firestore document ID, or attempting any token write.
export function normalizePushTokenIdentity(token: unknown, platform: unknown): {
  token: string; platform: 'android' | 'ios' | 'web';
} {
  if (typeof token !== 'string') throw Error('INVALID_PUSH_TOKEN');
  const cleanToken = token.trim();
  if (cleanToken.length < 20 || cleanToken.length > 4096) throw Error('INVALID_PUSH_TOKEN');
  if (platform !== 'android' && platform !== 'ios' && platform !== 'web')
    throw Error('INVALID_PUSH_PLATFORM');
  return { token: cleanToken, platform };
}
export function normalizePushAppVersion(version: unknown): string {
  if (typeof version !== 'string') throw Error('INVALID_PUSH_APP_VERSION');
  const clean = version.trim();
  if (!clean || clean.length > 128 || /[\u0000-\u001f\u007f]/.test(clean))
    throw Error('INVALID_PUSH_APP_VERSION');
  return clean.slice(0, 40);
}

type TokenWriteOptions = { exists?: boolean; merge?: boolean };
type PushTokenRecord = {
  owner_uid: string;
  token: string;
  platform: string;
  app_version: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};
type TokenWriter = (record: Record<string, unknown>, options: TokenWriteOptions) => Promise<unknown>;

function isDocumentAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const found = error as { status?: unknown; payload?: { error?: { status?: unknown } } };
  // Do not reinterpret PERMISSION_DENIED, ABORTED or arbitrary 409 errors as
  // evidence that we own an existing token document.
  return found.status === 409 && found.payload?.error?.status === 'ALREADY_EXISTS';
}

export async function createFirstPushTokenDocument(
  write: TokenWriter,
  record: PushTokenRecord,
  assertCurrentOwner: () => void,
): Promise<'created' | 'updated'> {
  assertCurrentOwner();
  try {
    // Firestore POST /device_tokens?documentId=... is create-only.
    // A forbidden GET of an absent document must not block registration.
    await write(record, { exists: false });
    assertCurrentOwner();
    return 'created';
  } catch (error) {
    assertCurrentOwner(); // Logout/account switch must never enter fallback.
    if (!isDocumentAlreadyExists(error)) throw error;
  }

  // An existing token can only be refreshed, never recreated by a stale write.
  // Preserve the original created_at and require the document to still exist.
  const update = {
    owner_uid: record.owner_uid,
    token: record.token,
    platform: record.platform,
    app_version: record.app_version,
    active: record.active,
    updated_at: record.updated_at,
  };
  assertCurrentOwner();
  await write(update, { merge: true, exists: true });
  assertCurrentOwner();
  return 'updated';
}
