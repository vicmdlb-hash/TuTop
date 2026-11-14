export type RecoveryChannel = 'verified_email' | 'verified_sms' | 'recovery_code';
export type RecoveryProviderState = 'disabled' | 'ready' | 'degraded';
export type RecoveryAttemptStatus = 'requested' | 'challenge_failed' | 'challenge_verified' | 'completed';

export type RecoveryAttempt = {
  at: number;
  status: RecoveryAttemptStatus;
};

export type RecoveryRateDecision = {
  allowed: boolean;
  retry_after_ms: number;
  recent_attempts: number;
  reason: 'ok' | 'rate_limited' | 'temporarily_locked';
};

export const ACCOUNT_RECOVERY_POLICY = {
  challenge_ttl_ms: 10 * 60_000,
  attempt_window_ms: 15 * 60_000,
  max_attempts_per_window: 3,
  temporary_lock_ms: 30 * 60_000,
  max_identifier_length: 128,
} as const;

export function evaluateRecoveryRateLimit(attempts: RecoveryAttempt[], now = Date.now()): RecoveryRateDecision {
  // Rate-limiter inputs may ultimately come from stored JSON or an untrusted
  // clock. An invalid context must NOT become an empty history and allow a
  // fresh recovery attempt. A trusted backend must still enforce its own limit.
  const knownStatuses = new Set<RecoveryAttemptStatus>([
    'requested', 'challenge_failed', 'challenge_verified', 'completed',
  ]);
  if (!Number.isSafeInteger(now) || now <= 0
    || !Array.isArray(attempts) || attempts.length > 1000
    || attempts.some((attempt) => !attempt || typeof attempt !== 'object'
      || !Number.isSafeInteger(attempt.at) || attempt.at <= 0 || attempt.at > now
      || !knownStatuses.has(attempt.status))) {
    return {
      allowed: false,
      retry_after_ms: ACCOUNT_RECOVERY_POLICY.temporary_lock_ms,
      recent_attempts: Array.isArray(attempts) ? attempts.length : 0,
      reason: 'temporarily_locked',
    };
  }
  const recent = attempts
    .filter((attempt) => now - attempt.at <= ACCOUNT_RECOVERY_POLICY.attempt_window_ms)
    .sort((a, b) => b.at - a.at);

  // The normal attempt window is 15 minutes, but a lock lasts 30.
  // Looking only at "recent" would accidentally unlock failed challenges
  // as soon as the first 15 minutes elapsed. Examine the full potential
  // lock horizon (window + lock), and require that the threshold failures
  // actually occurred inside ONE attempt window before applying the lock.
  const failures = attempts
    .filter((attempt) => attempt.status === 'challenge_failed'
      && now - attempt.at < ACCOUNT_RECOVERY_POLICY.attempt_window_ms + ACCOUNT_RECOVERY_POLICY.temporary_lock_ms)
    .sort((a, b) => b.at - a.at);
  for (let i = 0; i <= failures.length - ACCOUNT_RECOVERY_POLICY.max_attempts_per_window; i += 1) {
    const newest = failures[i].at;
    const oldest = failures[i + ACCOUNT_RECOVERY_POLICY.max_attempts_per_window - 1].at;
    if (newest - oldest <= ACCOUNT_RECOVERY_POLICY.attempt_window_ms) {
      const remainingMs = newest + ACCOUNT_RECOVERY_POLICY.temporary_lock_ms - now;
      if (remainingMs > 0) {
        return { allowed: false, retry_after_ms: remainingMs,
          recent_attempts: recent.length, reason: 'temporarily_locked' };
      }
    }
  }

  if (recent.length >= ACCOUNT_RECOVERY_POLICY.max_attempts_per_window) {
    const oldest = recent[recent.length - 1]?.at || now;
    const retryAt = oldest + ACCOUNT_RECOVERY_POLICY.attempt_window_ms;
    if (retryAt > now) {
      return { allowed: false, retry_after_ms: retryAt - now, recent_attempts: recent.length, reason: 'rate_limited' };
    }
  }

  return { allowed: true, retry_after_ms: 0, recent_attempts: recent.length, reason: 'ok' };
}

export function recoveryChannelLabel(channel: RecoveryChannel) {
  if (channel === 'verified_email') return 'correo verificado';
  if (channel === 'verified_sms') return 'SMS verificado';
  return 'código de recuperación';
}

export function publicRecoveryResponse() {
  return 'Si la cuenta tiene un canal de recuperación verificado, recibirás instrucciones. TuTop no confirma si una cuenta existe.';
}
