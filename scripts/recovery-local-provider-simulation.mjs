import crypto from 'node:crypto';

const channels = new Set(['verified_email', 'verified_sms', 'recovery_code']);
const MAX_VERIFY_ATTEMPTS = 3;
const TTL_MS = 10 * 60_000;

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export class LocalRecoveryProviderSimulation {
  #challenges = new Map();

  issue({ identifier, channel, correlation_id, now = Date.now() }) {
    if (!channels.has(channel)) throw new Error('RECOVERY_CHANNEL_UNSUPPORTED');
    if (!String(identifier || '').trim()) throw new Error('RECOVERY_IDENTIFIER_REQUIRED');
    if (!/^[a-z0-9-]{8,80}$/i.test(String(correlation_id || ''))) throw new Error('RECOVERY_CORRELATION_INVALID');
    const challenge_id = `sim-${digest(`${correlation_id}:${now}`).slice(0, 20)}`;
    if (this.#challenges.has(challenge_id)) throw new Error('RECOVERY_CHALLENGE_COLLISION');
    const synthetic_code = String(100000 + (parseInt(digest(challenge_id).slice(0, 8), 16) % 900000));
    this.#challenges.set(challenge_id, {
      identifier_hash: digest(identifier), channel, correlation_id, code_hash: digest(synthetic_code),
      created_at: now, expires_at: now + TTL_MS, attempts: 0, consumed: false,
    });
    // synthetic_code is returned ONLY by this scripts/ test harness. Runtime adapters never expose codes.
    return { challenge_id, synthetic_code, expires_at: now + TTL_MS };
  }

  verify({ challenge_id, code, now = Date.now() }) {
    const challenge = this.#challenges.get(challenge_id);
    if (!challenge) return { accepted: false, reason: 'not_found' };
    if (challenge.consumed) return { accepted: false, reason: 'consumed' };
    if (now > challenge.expires_at) return { accepted: false, reason: 'expired' };
    if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) return { accepted: false, reason: 'locked' };
    challenge.attempts += 1;
    if (!crypto.timingSafeEqual(Buffer.from(challenge.code_hash), Buffer.from(digest(code)))) {
      return { accepted: false, reason: challenge.attempts >= MAX_VERIFY_ATTEMPTS ? 'locked' : 'invalid' };
    }
    challenge.consumed = true;
    return { accepted: true, reason: 'verified', correlation_id: challenge.correlation_id, channel: challenge.channel };
  }

  summary() {
    return [...this.#challenges.values()].map(({ channel, correlation_id, expires_at, attempts, consumed }) => ({ channel, correlation_id, expires_at, attempts, consumed }));
  }
}
