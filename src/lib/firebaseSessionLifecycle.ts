export function isTerminalFirebaseRefreshFailure(error: unknown) {
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

export class FirebaseSessionLifecycle<T> {
  private generation = 0;
  private authoritative: T | null;
  private inflight: Promise<string> | null = null;

  constructor(initial: T | null) {
    this.authoritative = initial;
  }

  beginAuthReplacement() {
    this.generation += 1;
    this.inflight = null;
    return this.generation;
  }

  completeAuthReplacement(generation: number, value: T | null, restore: (session: T | null) => void) {
    if (this.generation !== generation) {
      restore(this.authoritative);
      return false;
    }
    this.authoritative = value;
    // Re-apply the winning session because a stale refresh may have restored the
    // previous authoritative value after the raw auth call persisted `value`.
    restore(value);
    return true;
  }

  failAuthReplacement(generation: number, current: T | null, restore: (session: T | null) => void) {
    if (this.generation !== generation) {
      restore(this.authoritative);
      return false;
    }
    this.authoritative = current;
    return true;
  }

  acceptAuthoritative(value: T | null) {
    this.authoritative = value;
  }

  signOut() {
    this.generation += 1;
    this.authoritative = null;
    this.inflight = null;
  }

  get authoritativeSession() {
    return this.authoritative;
  }

  runRefresh(options: {
    refresh: () => Promise<{ token: string; session: T | null }>;
    restore: (session: T | null) => void;
    clear: () => void;
    terminalFailure?: (error: unknown) => boolean;
  }): Promise<string> {
    if (this.inflight) return this.inflight;
    const generation = this.generation;
    const terminalFailure = options.terminalFailure || isTerminalFirebaseRefreshFailure;

    let task: Promise<string>;
    task = Promise.resolve().then(options.refresh).then(({ token, session }) => {
      if (this.generation !== generation) {
        options.restore(this.authoritative);
        throw new Error('AUTH_SESSION_CHANGED');
      }
      this.authoritative = session;
      return token;
    }).catch((error: unknown) => {
      if (this.generation !== generation) {
        options.restore(this.authoritative);
        throw new Error('AUTH_SESSION_CHANGED');
      }
      if (terminalFailure(error)) {
        this.generation += 1;
        this.authoritative = null;
        options.clear();
      }
      throw error;
    }).finally(() => {
      if (this.inflight === task) this.inflight = null;
    });

    this.inflight = task;
    return task;
  }
}

export const FIREBASE_SESSION_LIFECYCLE_CONTRACT = {
  refresh_single_flight: true,
  stale_refresh_cannot_restore_signed_out_session: true,
  terminal_refresh_failure_clears_session: true,
  transient_network_failure_preserves_session_for_retry: true,
  latest_auth_replacement_wins: true,
  stale_refresh_cannot_overwrite_new_login: true,
} as const;
