import { identityFor } from '../lib/universityNetwork';
import { nationalBackend, nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';

const KEY = 'tutop.pending-university-identity.v2';

type PendingIdentity = {
  phone: string;
  institution_id: string;
  campus_id: string;
  legacy_adapter: string;
  created_at: string;
};

function read(): PendingIdentity | null {
  try {
    const value = localStorage.getItem(KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as PendingIdentity;
    if (!parsed.phone || !parsed.institution_id || !parsed.campus_id) return null;
    if (Date.now() - Date.parse(parsed.created_at) > 24 * 60 * 60_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function rememberPendingUniversityIdentity(input: Omit<PendingIdentity, 'created_at'>) {
  if (!nationalSchemaEnabled()) return;
  localStorage.setItem(KEY, JSON.stringify({ ...input, created_at: new Date().toISOString() }));
}

export function clearPendingUniversityIdentity() {
  localStorage.removeItem(KEY);
}

export async function completePendingUniversityIdentity() {
  if (!nationalSchemaEnabled()) return false;
  const pending = read();
  const session = onlineBackend.session;
  if (!pending || !session?.uid || session.phone !== pending.phone) return false;
  await nationalBackend.updateUniversityIdentity(
    identityFor(pending.institution_id, pending.campus_id),
    pending.legacy_adapter,
  );
  clearPendingUniversityIdentity();
  return true;
}
