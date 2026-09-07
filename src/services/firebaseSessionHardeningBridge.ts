import { FirebaseRestClient, type AuthSession } from './firebaseRest';

type ClientState = {
  generation: number;
  authoritative: AuthSession | null;
  inflight: Promise<string> | null;
};

type FirebaseRestInternals = FirebaseRestClient & {
  persistSession?: (session: AuthSession | null) => void;
};

const states = new WeakMap<FirebaseRestClient, ClientState>();
const proto = FirebaseRestClient.prototype as FirebaseRestClient & Record<string, any>;
const originalGetIdToken = proto.getIdToken;
const originalSignOut = proto.signOut;
const originalRegister = proto.registerWithPhonePassword;
const originalSignIn = proto.signInWithPhonePassword;

function stateFor(client: FirebaseRestClient) {
  let state = states.get(client);
  if (!state) {
    state = { generation: 0, authoritative: client.currentSession, inflight: null };
    states.set(client, state);
  }
  return state;
}

function restoreAuthoritative(client: FirebaseRestClient, state: ClientState) {
  const internal = client as FirebaseRestInternals;
  if (typeof internal.persistSession === 'function') internal.persistSession(state.authoritative);
  else if (!state.authoritative) originalSignOut.call(client);
}

function terminalRefreshFailure(error: unknown) {
  const candidate = error as any;
  const text = [candidate?.message, candidate?.payload?.error?.message, candidate?.payload?.error?.status]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  return [
    'INVALID_REFRESH_TOKEN',
    'TOKEN_EXPIRED',
    'USER_DISABLED',
    'USER_NOT_FOUND',
    'INVALID_GRANT',
    'MISSING_REFRESH_TOKEN',
  ].some((marker) => text.includes(marker));
}

function beginAuthReplacement(client: FirebaseRestClient) {
  const state = stateFor(client);
  state.generation += 1;
  state.inflight = null;
  return state;
}

if (!(proto as any).__tutopSessionHardeningInstalled) {
  Object.defineProperty(proto, '__tutopSessionHardeningInstalled', { value: true, configurable: false, enumerable: false });

  proto.signOut = function hardenedSignOut(this: FirebaseRestClient) {
    const state = stateFor(this);
    state.generation += 1;
    state.authoritative = null;
    state.inflight = null;
    return originalSignOut.call(this);
  };

  proto.registerWithPhonePassword = async function hardenedRegister(this: FirebaseRestClient, phone: string, password: string) {
    const state = beginAuthReplacement(this);
    try {
      const session = await originalRegister.call(this, phone, password);
      state.authoritative = this.currentSession;
      return session;
    } catch (error) {
      state.authoritative = this.currentSession;
      throw error;
    }
  };

  proto.signInWithPhonePassword = async function hardenedSignIn(this: FirebaseRestClient, phone: string, password: string) {
    const state = beginAuthReplacement(this);
    try {
      const session = await originalSignIn.call(this, phone, password);
      state.authoritative = this.currentSession;
      return session;
    } catch (error) {
      state.authoritative = this.currentSession;
      throw error;
    }
  };

  proto.getIdToken = function hardenedGetIdToken(this: FirebaseRestClient) {
    const state = stateFor(this);
    if (state.inflight) return state.inflight;
    const generation = state.generation;

    let task: Promise<string>;
    task = Promise.resolve(originalGetIdToken.call(this)).then((token: string) => {
      if (state.generation !== generation) {
        restoreAuthoritative(this, state);
        throw new Error('AUTH_SESSION_CHANGED');
      }
      state.authoritative = this.currentSession;
      return token;
    }).catch((error: unknown) => {
      if (state.generation !== generation) {
        restoreAuthoritative(this, state);
        throw new Error('AUTH_SESSION_CHANGED');
      }
      if (terminalRefreshFailure(error)) {
        state.generation += 1;
        state.authoritative = null;
        originalSignOut.call(this);
      }
      throw error;
    }).finally(() => {
      if (state.inflight === task) state.inflight = null;
    });

    state.inflight = task;
    return task;
  };
}

export const FIREBASE_SESSION_HARDENING = {
  refresh_single_flight: true,
  stale_refresh_cannot_restore_signed_out_session: true,
  terminal_refresh_failure_clears_session: true,
  transient_network_failure_preserves_session_for_retry: true,
  logs_tokens: false,
} as const;
