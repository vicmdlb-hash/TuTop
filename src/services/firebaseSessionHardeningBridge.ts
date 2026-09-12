import { FirebaseSessionLifecycle } from '../lib/firebaseSessionLifecycle';
import { FirebaseRestClient, type AuthSession } from './firebaseRest';

const states = new WeakMap<FirebaseRestClient, FirebaseSessionLifecycle<AuthSession>>();
const proto = FirebaseRestClient.prototype as any;
const originalGetIdToken = proto.getIdToken;
const originalSignOut = proto.signOut;
const originalRegister = proto.registerWithPhonePassword;
const originalSignIn = proto.signInWithPhonePassword;

function stateFor(client: FirebaseRestClient) {
  let state = states.get(client);
  if (!state) {
    state = new FirebaseSessionLifecycle<AuthSession>(client.currentSession);
    states.set(client, state);
  }
  return state;
}

function restoreAuthoritative(client: FirebaseRestClient, session: AuthSession | null) {
  // Deliberate internal boundary: FirebaseRestClient owns persistence privately, but a
  // stale async refresh/auth replacement must be able to restore the winning session.
  // Keep this cast isolated here rather than weakening FirebaseRestClient's public API.
  const internal = client as any;
  if (typeof internal.persistSession === 'function') internal.persistSession(session);
  else if (!session) originalSignOut.call(client);
}

function authSessionChangedError() {
  return new Error('AUTH_SESSION_CHANGED');
}

if (!proto.__tutopSessionHardeningInstalled) {
  Object.defineProperty(proto, '__tutopSessionHardeningInstalled', { value: true, configurable: false, enumerable: false });

  proto.signOut = function hardenedSignOut(this: FirebaseRestClient) {
    stateFor(this).signOut();
    return originalSignOut.call(this);
  };

  proto.registerWithPhonePassword = async function hardenedRegister(this: FirebaseRestClient, phone: string, password: string) {
    const state = stateFor(this);
    const generation = state.beginAuthReplacement();
    try {
      const session = await originalRegister.call(this, phone, password);
      const accepted = state.completeAuthReplacement(generation, session, (value) => restoreAuthoritative(this, value));
      if (!accepted) throw authSessionChangedError();
      return session;
    } catch (error) {
      if ((error as Error)?.message === 'AUTH_SESSION_CHANGED') throw error;
      const accepted = state.failAuthReplacement(generation, this.currentSession, (value) => restoreAuthoritative(this, value));
      if (!accepted) throw authSessionChangedError();
      throw error;
    }
  };

  proto.signInWithPhonePassword = async function hardenedSignIn(this: FirebaseRestClient, phone: string, password: string) {
    const state = stateFor(this);
    const generation = state.beginAuthReplacement();
    try {
      const session = await originalSignIn.call(this, phone, password);
      const accepted = state.completeAuthReplacement(generation, session, (value) => restoreAuthoritative(this, value));
      if (!accepted) throw authSessionChangedError();
      return session;
    } catch (error) {
      if ((error as Error)?.message === 'AUTH_SESSION_CHANGED') throw error;
      const accepted = state.failAuthReplacement(generation, this.currentSession, (value) => restoreAuthoritative(this, value));
      if (!accepted) throw authSessionChangedError();
      throw error;
    }
  };

  proto.getIdToken = function hardenedGetIdToken(this: FirebaseRestClient) {
    const state = stateFor(this);
    return state.runRefresh({
      refresh: async () => {
        const token = await originalGetIdToken.call(this);
        return { token, session: this.currentSession };
      },
      restore: (session) => restoreAuthoritative(this, session),
      clear: () => originalSignOut.call(this),
    });
  };
}

export const FIREBASE_SESSION_HARDENING = {
  refresh_single_flight: true,
  stale_refresh_cannot_restore_signed_out_session: true,
  terminal_refresh_failure_clears_session: true,
  transient_network_failure_preserves_session_for_retry: true,
  latest_auth_replacement_wins: true,
  stale_refresh_cannot_overwrite_new_login: true,
  logs_tokens: false,
} as const;
