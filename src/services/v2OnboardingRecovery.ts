import { buildV2InitialAccountDocuments } from '../lib/v2InitialAccount';
import { identityFor } from '../lib/universityNetwork';
import { nationalBackend, nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend, type OnlineSnapshot } from './onlineBackend';
import { normalizeMexicoPhone } from './firebaseRest';

const KEY = 'tutop.v2.pending-university-identity';
let atomicBridgeInstalled = false;

interface PendingIdentity {
  phone: string;
  institution_id: string;
  campus_id: string;
  faculty_id?: string;
  career_id?: string;
  legacy_facultad_adapter?: string;
  legacy_adapter?: string;
}

function readPending(): PendingIdentity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingIdentity;
    if (!value.phone || !value.institution_id || !value.campus_id) return null;
    return value;
  } catch {
    return null;
  }
}

function clearPending() {
  try { localStorage.removeItem(KEY); } catch { /* optional recovery state */ }
}

export function rememberPendingUniversityIdentity(input: PendingIdentity) {
  const normalizedPhone = normalizeMexicoPhone(input.phone);
  const resolved = identityFor(input.institution_id, input.campus_id, input.faculty_id, input.career_id);
  if (!resolved.institution_id || !resolved.campus_id) throw new Error('Selecciona una universidad y campus válidos antes de registrarte.');
  localStorage.setItem(KEY, JSON.stringify({ ...input, phone: normalizedPhone }));
}

function universityFromProfile(profile: Record<string, unknown>) {
  return {
    country_code: 'MX' as const,
    state_code: profile.state_code ? String(profile.state_code) : undefined,
    state_name: profile.state_name ? String(profile.state_name) : undefined,
    city_id: profile.city_id ? String(profile.city_id) : undefined,
    city_name: profile.city_name ? String(profile.city_name) : undefined,
    institution_id: profile.institution_id ? String(profile.institution_id) : undefined,
    institution_name: profile.institution_name ? String(profile.institution_name) : undefined,
    campus_id: profile.campus_id ? String(profile.campus_id) : undefined,
    campus_name: profile.campus_name ? String(profile.campus_name) : undefined,
    faculty_id: profile.faculty_id ? String(profile.faculty_id) : undefined,
    faculty_name: profile.faculty_name ? String(profile.faculty_name) : undefined,
    career_id: profile.career_id ? String(profile.career_id) : undefined,
    career_name: profile.career_name ? String(profile.career_name) : undefined,
  };
}

async function registerV2Atomically(phone: string, password: string, profile: { nombre: string; facultad: string }) {
  const pending = readPending();
  if (!pending) throw new Error('V2_REGISTRATION_IDENTITY_REQUIRED');
  const normalizedPhone = normalizeMexicoPhone(phone);
  if (normalizeMexicoPhone(pending.phone) !== normalizedPhone) throw new Error('V2_REGISTRATION_PHONE_MISMATCH');

  const identity = identityFor(pending.institution_id, pending.campus_id, pending.faculty_id, pending.career_id);
  if (!identity.institution_id || !identity.campus_id) throw new Error('V2_REGISTRATION_IDENTITY_REQUIRED');

  const client = onlineBackend.configureFromRuntime();
  if (!client) throw new Error('FIREBASE_NOT_CONFIGURED');
  let createdAuthIdentity = true;
  let session;
  try {
    session = await client.registerWithPhonePassword(normalizedPhone, password);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/EMAIL_EXISTS/i.test(message)) throw error;
    createdAuthIdentity = false;
    session = await client.signInWithPhonePassword(normalizedPhone, password);
    const existingProfile = await client.getDocument<Record<string, unknown>>(`users/${session.uid}`);
    if (existingProfile) {
      client.signOut();
      throw error;
    }
  }

  const now = new Date().toISOString();
  const docs = buildV2InitialAccountDocuments({
    uid: session.uid,
    phone: session.phone,
    nombre: profile.nombre,
    legacyFacultad: pending.legacy_facultad_adapter || pending.legacy_adapter || profile.facultad,
    identity,
    now,
  });

  try {
    await client.commit([
      { update: client.encodeDocumentForWrite(`users/${session.uid}`, docs.profile), currentDocument: { exists: false } },
      { update: client.encodeDocumentForWrite(`user_private/${session.uid}`, docs.privateProfile), currentDocument: { exists: false } },
      { update: client.encodeDocumentForWrite(`wallets/${session.uid}`, docs.wallet), currentDocument: { exists: false } },
      { update: client.encodeDocumentForWrite(`wallet_transactions/${docs.walletTransaction.id}`, docs.walletTransaction.data), currentDocument: { exists: false } },
    ]);

    const verified = await client.getDocument<Record<string, unknown>>(`users/${session.uid}`);
    if (verified?.data?.institution_id !== identity.institution_id || verified?.data?.campus_id !== identity.campus_id) {
      throw new Error('V2_REGISTRATION_IDENTITY_RECHECK_FAILED');
    }
    clearPending();
    await onlineBackend.ensureMarketplaceCatalog().catch(() => undefined);
    return session;
  } catch (error) {
    if (createdAuthIdentity) {
      try { await client.deleteAuthAccount(); } catch { client.signOut(); }
    } else client.signOut();
    throw error;
  }
}

function enrichSnapshotWithCanonicalIdentity(snapshot: OnlineSnapshot, profile: Record<string, unknown>): OnlineSnapshot {
  const university = universityFromProfile(profile);
  if (!university.institution_id || !university.campus_id) return snapshot;
  return {
    ...snapshot,
    user: {
      ...snapshot.user,
      institution_id: university.institution_id,
      campus_id: university.campus_id,
      faculty_id: university.faculty_id,
      career_id: university.career_id,
      university,
      verification_level: Number(profile.verification_level || 0) as 0 | 1 | 2 | 3 | 4,
      verification_badge: String(profile.verification_badge || 'Cuenta TuTop') as any,
    },
  };
}

export function installV2AtomicRegistrationBridge() {
  if (atomicBridgeInstalled || !nationalSchemaEnabled()) return;
  atomicBridgeInstalled = true;
  const originalRegister = onlineBackend.register.bind(onlineBackend);
  const originalLoadSnapshot = onlineBackend.loadSnapshot.bind(onlineBackend);

  onlineBackend.register = async (phone, password, profile) => {
    if (!nationalSchemaEnabled()) return originalRegister(phone, password, profile);
    return registerV2Atomically(phone, password, profile);
  };

  onlineBackend.loadSnapshot = async () => {
    const snapshot = await originalLoadSnapshot();
    const session = onlineBackend.session;
    if (!nationalSchemaEnabled() || !session?.uid) return snapshot;
    const client = onlineBackend.configureFromRuntime();
    const profile = client ? await client.getDocument<Record<string, unknown>>(`users/${session.uid}`).catch(() => null) : null;
    return profile?.data ? enrichSnapshotWithCanonicalIdentity(snapshot, profile.data) : snapshot;
  };
}

export async function completePendingUniversityIdentity() {
  if (!nationalSchemaEnabled()) return false;
  const pending = readPending();
  if (!pending) return false;
  const session = onlineBackend.session;
  if (!session) return false;
  if (normalizeMexicoPhone(session.phone) !== normalizeMexicoPhone(pending.phone)) return false;

  const identity = identityFor(pending.institution_id, pending.campus_id, pending.faculty_id, pending.career_id);
  if (!identity.institution_id || !identity.campus_id) throw new Error('V2_REGISTRATION_IDENTITY_REQUIRED');
  await nationalBackend.updateUniversityIdentity(identity, pending.legacy_facultad_adapter || pending.legacy_adapter);
  const client = onlineBackend.configureFromRuntime();
  const profile = client ? await client.getDocument<Record<string, unknown>>(`users/${session.uid}`) : null;
  if (profile?.data?.institution_id !== identity.institution_id || profile?.data?.campus_id !== identity.campus_id) {
    throw new Error('V2_REGISTRATION_IDENTITY_RECHECK_FAILED');
  }
  clearPending();
  return true;
}

installV2AtomicRegistrationBridge();
