import { FirebaseSessionLifecycle } from '../lib/firebaseSessionLifecycle';
import { FirebaseRestClient, type AuthSession } from './firebaseRest';

type FirebaseRestInternals = FirebaseRestClient & {
  persistSession?: (session: AuthSession | null) => void;
};

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
  const internal = client as FirebaseRestInternals;
  if (typeof internal.persistSession === 'function') internal.persistSession(session);
  else if (!session) originalSignOut.call(client);
}

if (!proto.__tutopSessionHardeningInstalled) {
  Object.defineProperty(proto, '__tutopSessionHardeningInstalled', { value: true, configurable: false, enumerable: false });

  proto.signOut = function hardenedSignOut(this: FirebaseRestClient) {
    stateFor(this).signOut();
    return originalSignOut.call(this);
  };

  proto.registerWithPhonePassword = async function hardenedRegister(this: FirebaseRestClient, phone: string, password: string) {
    const state = stateFor(this);
    state.beginAuthReplacement();
    try {
      const session = await originalRegister.call(this, phone, password);
      state.acceptAuthoritative(this.currentSession);
      return session;
    } catch (error) {
      state.acceptAuthoritative(this.currentSession);
      throw error;
    }
  };

  proto.signInWithPhonePassword = async function hardenedSignIn(this: FirebaseRestClient, phone: string, password: string) {
    const state = stateFor(this);
    state.beginAuthReplacement();
    try {
      const session = await originalSignIn.call(this, phone, password);
      state.acceptAuthoritative(this.currentSession);
      return session;
    } catch (error) {
      state.acceptAuthoritative(this.currentSession);
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
  logs_tokens: false,
} as const;
