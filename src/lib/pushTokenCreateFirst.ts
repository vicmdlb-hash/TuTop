// Pure, synthetic-testable create-first protocol. No Firebase initialization,
// network IO, secrets or native device calls occur in this module.
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
