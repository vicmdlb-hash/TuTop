import { nationalAcademicMetadata } from '../lib/nationalAcademicMetadata';
import { nationalVerificationIndicators } from '../lib/nationalVerificationIndicators';
import { getNativeAppCheckToken } from './nativeAppCheckToken';
import { firebaseFetch, isFirebaseRequestTimeout } from './firebaseHttp';
import { FirebaseRestClient, normalizeMexicoPhone, phoneAliasEmail } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

export interface VerifiedEmailBetaProfile {
  nombre: string;
  facultad: string;
  institution_id?: string;
  institution_name?: string;
  campus_id?: string;
  campus_name?: string;
  phone?: string;
}

export interface VerifiedEmailBetaStatus {
  uid: string;
  email: string;
  emailVerified: boolean;
  /** Read-only Firebase Auth lookup indicator; NEVER server authorization proof. */
  phoneVerified?: boolean;
  verificationEmailSent?: boolean;
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
  const response = await firebaseFetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(config.apiKey)}`, {
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
  const response = await firebaseFetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, {
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

export type AuthStatusCode =
  | 'EMAIL_VERIFICATION_PENDING'
  | 'EMAIL_VERIFIED'
  | 'PROFILE_MISSING'
  | 'VERIFICATION_EMAIL_SENT'
  | 'VERIFICATION_EMAIL_SEND_FAILED'
  | 'VERIFICATION_CHECK_FAILED'
  | 'AUTH_SYNC_FAILED';

async function syncAuthStatus(uid: string, emailVerified: boolean, code: AuthStatusCode) {
  const client = sessionClient();
  const at = new Date().toISOString();
  await client.setDocument(`auth_status/${uid}`, {
    uid,
    email_verified: emailVerified,
    auth_mode: 'email_password_verified_beta',
    last_client_code: code,
    last_seen_at: at,
  }, { merge: true }).catch(() => undefined);
}

async function synchronizePrivateEmail(uid: string, email: string) {
  const client = sessionClient();
  const privateIdentity = await client.getDocument<Record<string, unknown>>(`user_private/${uid}`);
  if (!privateIdentity) throw new Error('PRIVATE_IDENTITY_MISSING');
  const currentEmail = String(privateIdentity.data.institutional_email || '').trim().toLowerCase();
  if (currentEmail === email) return;
  await client.setDocument(`user_private/${uid}`, {
    institutional_email: email,
    updated_at: new Date().toISOString(),
  }, { merge: true });
}

async function migrateLegacySessionToEmail(session: CompatibleSession, emailInput: string, expectedGeneration: number) {
  const email = normalizeEmail(emailInput);
  const data = await identityRequest('accounts:update', {
    idToken: session.idToken,
    email,
    returnSecureToken: true,
  }) as AuthPayload;
  if (authGeneration !== expectedGeneration) throw new Error('AUTH_SESSION_CHANGED');
  if (!data.localId || data.localId !== session.uid) {
    clearCanonicalSession();
    throw new Error('AUTH_UID_MISMATCH');
  }
  const next = persistCompatibleSession(data, email, false, session.phone);
  let verificationEmailSent = true;
  try {
    await identityRequest('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: next.idToken });
  } catch { verificationEmailSent = false; }
  return { uid: data.localId, email, emailVerified: false, verificationEmailSent } satisfies VerifiedEmailBetaStatus;
}

async function createMarketplaceAccount(payload: AuthPayload, email: string, profile: VerifiedEmailBetaProfile) {
  const config = getFirebaseConfig();
  const normalizedPhone = normalizeOptionalPhone(profile.phone);
  const academicMetadata = nationalAcademicMetadata(profile);
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
    ...academicMetadata,
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
    { update: client.encodeDocumentForWrite(`auth_status/${payload.localId}`, { uid: payload.localId, email_verified: false, auth_mode: 'email_password_verified_beta', last_client_code: 'EMAIL_VERIFICATION_PENDING', last_seen_at: at }), currentDocument: { exists: false } },
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
      await createMarketplaceAccount(data, email, normalizedProfile);
    } catch (error) {
      // A network timeout is ambiguous: the atomic Firestore commit may already
      // have reached Firebase. Never delete Auth or clear the session merely
      // because the client did not receive the response.
      if (isFirebaseRequestTimeout(error)) throw error;
      try { await identityRequest('accounts:delete', { idToken: data.idToken }); } catch { /* best effort rollback */ }
      clearCanonicalSession();
      throw error;
    }
    // Mail failure after a successful atomic commit keeps a recoverable pending
    // identity. Resend retries delivery without deleting its profile or wallet.
    let verificationEmailSent = true;
    try {
      await identityRequest('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: data.idToken });
    } catch { verificationEmailSent = false; }
    return { uid: data.localId, email, emailVerified: false, verificationEmailSent } satisfies VerifiedEmailBetaStatus;
  },

  async requestPasswordReset(emailInput: string) {
    const email = normalizeEmail(emailInput);
    try {
      await identityRequest('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      // Password recovery must not become an account-enumeration oracle.
      // Firebase projects with email-enumeration protection may already return
      // the same response, but keep the client fail-closed for older behavior.
      if (/EMAIL_NOT_FOUND|USER_NOT_FOUND/i.test(raw)) return true;
      throw error;
    }
    return true;
  },

  async login(emailInput: string, password: string) {
    const email = normalizeEmail(emailInput);
    const requestGeneration = ++authGeneration;
    const data = await identityRequest('accounts:signInWithPassword', { email, password, returnSecureToken: true }) as AuthPayload;
    if (authGeneration !== requestGeneration) throw new Error('AUTH_SESSION_CHANGED');
    const ownSession = persistCompatibleSession(data, email, false);
    const ownGeneration = authGeneration;
    const client = sessionClient();
    const profile = await client.getDocument(`users/${data.localId}`);
    assertSessionUnchanged(ownGeneration, ownSession.uid, ownSession.refreshToken);
    if (!profile) {
      await syncAuthStatus(data.localId, false, 'PROFILE_MISSING');
      clearCanonicalSession();
      throw new Error('PROFILE_MISSING');
    }
    return this.refreshVerificationStatus();
  },

  async recoverLegacyPhoneAccount(phoneInput: string, password: string, emailInput: string) {
    const phone = normalizeMexicoPhone(phoneInput);
    const email = normalizeEmail(emailInput);
    if (password.length < 8) throw new Error('WEAK_PASSWORD');
    const aliasEmail = await phoneAliasEmail(phone);
    const requestGeneration = ++authGeneration;
    const data = await identityRequest('accounts:signInWithPassword', {
      email: aliasEmail,
      password,
      returnSecureToken: true,
    }) as AuthPayload;
    if (authGeneration !== requestGeneration) throw new Error('AUTH_SESSION_CHANGED');
    const legacySession: CompatibleSession = {
      uid: data.localId,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000,
      phone,
    };
    return migrateLegacySessionToEmail(legacySession, email, requestGeneration);
  },

  async migrateCurrentLegacySession(emailInput: string) {
    const stored = readCompatibleSession();
    if (!stored?.idToken || !stored.uid) throw new Error('AUTH_REQUIRED');
    if (stored.email || stored.authMode === 'email_password_verified_beta') throw new Error('LEGACY_MIGRATION_NOT_REQUIRED');
    const requestGeneration = ++authGeneration;
    return migrateLegacySessionToEmail(stored, emailInput, requestGeneration);
  },

  async applyVerificationLink(linkInput: string) {
    const stored = readCompatibleSession();
    if (!stored?.idToken || !stored.uid) throw new Error('AUTH_REQUIRED');
    let parsed: URL;
    try { parsed = new URL(String(linkInput || '').trim()); }
    catch { throw new Error('AUTH_LINK_REQUIRED'); }
    if (parsed.searchParams.get('mode') !== 'verifyEmail') throw new Error('AUTH_LINK_MODE_INVALID');
    const oobCode = String(parsed.searchParams.get('oobCode') || '').trim();
    if (oobCode.length < 8 || oobCode.length > 4096) throw new Error('AUTH_LINK_REQUIRED');

    const response = await identityRequest('accounts:update', { oobCode }) as AuthPayload;
    if (!response?.localId || response.localId !== stored.uid) {
      throw new Error('AUTH_UID_MISMATCH');
    }
    const current = await this.refreshVerificationStatus();
    if (!current.emailVerified) throw new Error('EMAIL_VERIFICATION_PENDING');
    return current;
  },

  async resendVerificationEmail() {
    const stored = readCompatibleSession();
    if (!stored?.idToken) throw new Error('AUTH_REQUIRED');
    try {
      await identityRequest('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: stored.idToken });
      await syncAuthStatus(stored.uid, stored.emailVerified === true, 'VERIFICATION_EMAIL_SENT');
      return true;
    } catch (error) {
      await syncAuthStatus(stored.uid, stored.emailVerified === true, 'VERIFICATION_EMAIL_SEND_FAILED');
      throw error;
    }
  },

  async recordDiagnostic(code: Extract<AuthStatusCode, 'VERIFICATION_CHECK_FAILED' | 'AUTH_SYNC_FAILED'>) {
    const stored = readCompatibleSession();
    if (!stored?.uid) return false;
    await syncAuthStatus(stored.uid, stored.emailVerified === true, code);
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
    // Accounts:lookup is a Firebase Auth response for the active ID token,
    // NOT a profile phone or phone-alias string supplied by the client.
    const evidence = nationalVerificationIndicators(user, stored.uid);
    if (user.localId !== stored.uid) throw new Error('AUTH_UID_MISMATCH');
    const verified = evidence.emailVerified;
    if (verified) stored = await forceRefreshStoredSession(generation);
    assertSessionUnchanged(generation, stored.uid, stored.refreshToken);
    const normalizedUserEmail = String(user.email).toLowerCase();
    if (verified) await synchronizePrivateEmail(user.localId, normalizedUserEmail);
    await syncAuthStatus(user.localId, verified, verified ? 'EMAIL_VERIFIED' : 'EMAIL_VERIFICATION_PENDING');
    assertSessionUnchanged(generation, stored.uid, stored.refreshToken);
    const next: CompatibleSession = {
      ...stored,
      email: normalizedUserEmail,
      emailVerified: verified,
      authMode: 'email_password_verified_beta',
    };
    persistCanonicalSession(next);
    return { uid: user.localId, email: normalizedUserEmail, emailVerified: verified, phoneVerified: evidence.phoneVerified };
  },

  readLocalStatus(): VerifiedEmailBetaStatus | null {
    const stored = readCompatibleSession();
    if (!stored?.uid || !stored?.email) return null;
    // No local phone flag is trusted between fresh Firebase Auth lookups.
    return { uid: stored.uid, email: stored.email, emailVerified: stored.emailVerified === true, phoneVerified: false };
  },

  // Read-only, process-local generation: changes on login/logout, but not on
  // ordinary token refresh. Async UI callbacks can reject an obsolete session
  // even when the user signs out and signs back into the same account.
  sessionGeneration() { return authGeneration; },
  // Read the one project-scoped canonical session regardless of login method.
  // Returns an in-memory identity witness; do not log, persist or send the token.
  readSessionIdentity() {
    const session = readCompatibleSession();
    return session ? { uid: session.uid, refreshToken: session.refreshToken } : null;
  },
  signOut() {
    clearCanonicalSession();
  },
};
