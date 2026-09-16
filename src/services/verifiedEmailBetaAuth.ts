import { getNativeAppCheckToken } from './nativeAppCheckToken';
import { FirebaseRestClient, normalizeMexicoPhone } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

export interface VerifiedEmailBetaProfile {
  nombre: string;
  facultad: string;
  institution_id: string;
  institution_name: string;
  campus_id: string;
  campus_name: string;
  phone?: string;
}

export interface VerifiedEmailBetaStatus {
  uid: string;
  email: string;
  emailVerified: boolean;
}

type AuthPayload = {
  localId: string;
  email?: string;
  idToken: string;
  refreshToken: string;
  expiresIn?: string;
};

type CompatibleSession = {
  uid: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  phone: string;
  email?: string;
  emailVerified?: boolean;
  authMode?: 'email_password_verified_beta';
};

let authGeneration = 0;

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('EMAIL_INVALID');
  return email;
}

function normalizeOptionalPhone(value?: string) {
  const phone = String(value || '').trim();
  return phone ? normalizeMexicoPhone(phone) : '';
}

async function authHeaders() {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const appCheck = await getNativeAppCheckToken(false).catch(() => null);
  if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
  return headers;
}

async function readJson(response: Response) {
  const text = await response.text();
  let data: any = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!response.ok) {
    const message = data?.error?.message || data?.error?.status || data?.raw || `HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return data;
}

async function identityRequest(endpoint: string, body: Record<string, unknown>) {
  const config = getFirebaseConfig();
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  return readJson(response);
}

function sessionClient() {
  return new FirebaseRestClient(getFirebaseConfig());
}

function persistCanonicalSession(session: CompatibleSession) {
  const client = sessionClient();
  const internal = client as any;
  // Deliberate internal boundary: nativeSecureSessionBridge replaces this method
  // on Android so the same call writes process sessionStorage + encrypted Keystore.
  // On web it preserves FirebaseRestClient's normal scoped localStorage behavior.
  if (typeof internal.persistSession !== 'function') throw new Error('AUTH_SESSION_PERSISTENCE_UNAVAILABLE');
  internal.persistSession(session);
  return session;
}

function clearCanonicalSession() {
  // A generation bump invalidates every in-flight lookup/refresh so an async
  // response that finishes after sign-out cannot resurrect the cleared session.
  authGeneration += 1;
  sessionClient().signOut();
}

function persistCompatibleSession(payload: AuthPayload, email: string, emailVerified: boolean, phone = '') {
  authGeneration += 1;
  const session: CompatibleSession = {
    uid: payload.localId,
    idToken: payload.idToken,
    refreshToken: payload.refreshToken,
    expiresAt: Date.now() + Number(payload.expiresIn || 3600) * 1000,
    phone: normalizeOptionalPhone(phone),
    email,
    emailVerified,
    authMode: 'email_password_verified_beta',
  };
  return persistCanonicalSession(session);
}

function readCompatibleSession(): CompatibleSession | null {
  const session = sessionClient().currentSession as CompatibleSession | null;
  if (!session?.uid || !session?.idToken || !session?.refreshToken) return null;
  return session;
}

function assertSessionUnchanged(expectedGeneration: number, expectedUid: string, expectedRefreshToken: string) {
  const current = readCompatibleSession();
  if (
    authGeneration !== expectedGeneration
    || !current
    || current.uid !== expectedUid
    || current.refreshToken !== expectedRefreshToken
  ) throw new Error('AUTH_SESSION_CHANGED');
  return current;
}

async function forceRefreshStoredSession(expectedGeneration = authGeneration) {
  const config = getFirebaseConfig();
  const stored = readCompatibleSession();
  if (!stored?.refreshToken) throw new Error('AUTH_REQUIRED');
  const originalRefreshToken = stored.refreshToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const appCheck = await getNativeAppCheckToken(false).catch(() => null);
  if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: originalRefreshToken }),
  });
  const data = await readJson(response);
  assertSessionUnchanged(expectedGeneration, stored.uid, originalRefreshToken);
  const next: CompatibleSession = {
    ...stored,
    uid: data.user_id || stored.uid,
    idToken: data.id_token,
    refreshToken: data.refresh_token || originalRefreshToken,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return persistCanonicalSession(next);
}

async function createMarketplaceAccount(payload: AuthPayload, email: string, profile: VerifiedEmailBetaProfile) {
  const config = getFirebaseConfig();
  const normalizedPhone = normalizeOptionalPhone(profile.phone);
  persistCompatibleSession(payload, email, false, normalizedPhone);
  // A fresh client must be authenticated immediately in this same process. On
  // Android the native bridge now reads the session written above from
  // sessionStorage while its encrypted Keystore write completes asynchronously.
  // Promotion invariant: the verified-email Rules/Auth contract must be cut over
  // together for a later candidate. Against build106 Rules this write is expected
  // to fail closed; do not weaken Rules or silently fall back to phone-alias auth.
  const client = new FirebaseRestClient(config);
  const at = new Date().toISOString();
  const walletTxId = `welcome-${payload.localId}`;
  const userData: Record<string, unknown> = {
    uid: payload.localId,
    nombre: profile.nombre.trim().slice(0, 80),
    facultad: profile.facultad.trim().slice(0, 120),
    esta_verificado: false,
    institution_id: profile.institution_id,
    institution_name: profile.institution_name,
    campus_id: profile.campus_id,
    campus_name: profile.campus_name,
    verification_level: 0,
    verification_badge: 'Cuenta TuTop',
    created_at: at,
    updated_at: at,
  };
  const privateData: Record<string, unknown> = {
    uid: payload.localId,
    institutional_email: email,
    auth_mode: 'email_password_verified_beta',
    created_at: at,
    updated_at: at,
  };
  if (normalizedPhone) privateData.telefono = normalizedPhone;
  await client.commit([
    { update: client.encodeDocumentForWrite(`users/${payload.localId}`, userData), currentDocument: { exists: false } },
    { update: client.encodeDocumentForWrite(`user_private/${payload.localId}`, privateData), currentDocument: { exists: false } },
    { update: client.encodeDocumentForWrite(`wallets/${payload.localId}`, { owner_uid: payload.localId, balance: 10, prestige: 0, welcome_granted: true, last_op_id: walletTxId, updated_at: at }), currentDocument: { exists: false } },
    { update: client.encodeDocumentForWrite(`wallet_transactions/${walletTxId}`, { user_id: payload.localId, type: 'income', description: 'Bono de bienvenida', amount: 10, operation_id: walletTxId, created_at: at }), currentDocument: { exists: false } },
  ]);
}

export const verifiedEmailBetaAuth = {
  async register(emailInput: string, password: string, profile: VerifiedEmailBetaProfile) {
    const email = normalizeEmail(emailInput);
    if (password.length < 8) throw new Error('WEAK_PASSWORD');
    if (profile.nombre.trim().length < 2) throw new Error('NAME_REQUIRED');
    if (!profile.institution_id || !profile.campus_id) throw new Error('UNIVERSITY_IDENTITY_REQUIRED');
    // Validate/normalize optional phone before creating Firebase Auth so bad
    // metadata cannot leave behind a newly-created identity.
    const normalizedPhone = normalizeOptionalPhone(profile.phone);
    const normalizedProfile: VerifiedEmailBetaProfile = {
      ...profile,
      ...(normalizedPhone ? { phone: normalizedPhone } : { phone: undefined }),
    };
    const data = await identityRequest('accounts:signUp', { email, password, returnSecureToken: true }) as AuthPayload;
    try {
      // Send VERIFY_EMAIL before Firestore account documents. If delivery setup
      // fails, rollback Auth while there are no marketplace docs to orphan.
      await identityRequest('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: data.idToken });
      await createMarketplaceAccount(data, email, normalizedProfile);
      return { uid: data.localId, email, emailVerified: false } satisfies VerifiedEmailBetaStatus;
    } catch (error) {
      try { await identityRequest('accounts:delete', { idToken: data.idToken }); } catch { /* best effort rollback */ }
      clearCanonicalSession();
      throw error;
    }
  },

  async login(emailInput: string, password: string) {
    const email = normalizeEmail(emailInput);
    const data = await identityRequest('accounts:signInWithPassword', { email, password, returnSecureToken: true }) as AuthPayload;
    persistCompatibleSession(data, email, false);
    const client = sessionClient();
    const profile = await client.getDocument(`users/${data.localId}`);
    if (!profile) {
      clearCanonicalSession();
      throw new Error('PROFILE_MISSING');
    }
    return this.refreshVerificationStatus();
  },

  async resendVerificationEmail() {
    const stored = readCompatibleSession();
    if (!stored?.idToken) throw new Error('AUTH_REQUIRED');
    await identityRequest('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: stored.idToken });
    return true;
  },

  async refreshVerificationStatus(): Promise<VerifiedEmailBetaStatus> {
    const generation = authGeneration;
    let stored = readCompatibleSession();
    if (!stored?.idToken) throw new Error('AUTH_REQUIRED');
    const lookup = await identityRequest('accounts:lookup', { idToken: stored.idToken }).catch(async (error) => {
      if (!/INVALID_ID_TOKEN|TOKEN_EXPIRED/i.test(error instanceof Error ? error.message : String(error))) throw error;
      stored = await forceRefreshStoredSession(generation);
      return identityRequest('accounts:lookup', { idToken: stored.idToken });
    });
    const user = lookup?.users?.[0];
    if (!user?.localId || !user?.email) throw new Error('USER_NOT_FOUND');
    const verified = user.emailVerified === true;
    if (verified) stored = await forceRefreshStoredSession(generation);
    assertSessionUnchanged(generation, stored.uid, stored.refreshToken);
    const next: CompatibleSession = {
      ...stored,
      email: String(user.email).toLowerCase(),
      emailVerified: verified,
      authMode: 'email_password_verified_beta',
    };
    persistCanonicalSession(next);
    return { uid: user.localId, email: String(user.email).toLowerCase(), emailVerified: verified };
  },

  readLocalStatus(): VerifiedEmailBetaStatus | null {
    const stored = readCompatibleSession();
    if (!stored?.uid || !stored?.email) return null;
    return { uid: stored.uid, email: stored.email, emailVerified: stored.emailVerified === true };
  },

  signOut() {
    clearCanonicalSession();
  },
};
