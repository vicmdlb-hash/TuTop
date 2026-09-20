import assert from 'node:assert/strict';
import {
  isRecoverablePublicationSessionError,
  withPublicationSessionRecovery,
} from '../src/lib/publicationRecovery.ts';

assert.equal(isRecoverablePublicationSessionError(new Error('Missing or insufficient permissions')), true);
assert.equal(isRecoverablePublicationSessionError(new Error('PERMISSION_DENIED')), true);
assert.equal(isRecoverablePublicationSessionError(new Error('HTTP 403')), true);
assert.equal(isRecoverablePublicationSessionError(new Error('TOKEN_EXPIRED')), true);
assert.equal(isRecoverablePublicationSessionError(new Error('LISTING_TITLE_INVALID')), false);

{
  let attempts = 0;
  let refreshes = 0;
  const diagnostics = [];
  const result = await withPublicationSessionRecovery({
    attempt: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('PERMISSION_DENIED');
      return { id: 'listing-op-same', recovered: true };
    },
    refreshVerification: async () => {
      refreshes += 1;
      return { emailVerified: true };
    },
    diagnostic: (code) => diagnostics.push(code),
  });
  assert.equal(attempts, 2);
  assert.equal(refreshes, 1);
  assert.deepEqual(result, { id: 'listing-op-same', recovered: true });
  assert.deepEqual(diagnostics, ['publish_self_heal_started', 'publish_self_heal_success']);
}

{
  let attempts = 0;
  let refreshes = 0;
  await assert.rejects(
    withPublicationSessionRecovery({
      attempt: async () => {
        attempts += 1;
        throw new Error('LISTING_TITLE_INVALID');
      },
      refreshVerification: async () => {
        refreshes += 1;
        return { emailVerified: true };
      },
    }),
    /LISTING_TITLE_INVALID/,
  );
  assert.equal(attempts, 1);
  assert.equal(refreshes, 0);
}

{
  let attempts = 0;
  await assert.rejects(
    withPublicationSessionRecovery({
      attempt: async () => {
        attempts += 1;
        throw new Error('HTTP 403');
      },
      refreshVerification: async () => ({ emailVerified: false }),
    }),
    /PUBLISH_EMAIL_NOT_VERIFIED_AFTER_REFRESH/,
  );
  assert.equal(attempts, 1);
}

{
  let attempts = 0;
  await assert.rejects(
    withPublicationSessionRecovery({
      attempt: async () => {
        attempts += 1;
        throw new Error('UNAUTHENTICATED');
      },
      refreshVerification: async () => { throw new Error('NETWORK'); },
    }),
    /PUBLISH_SESSION_REFRESH_FAILED/,
  );
  assert.equal(attempts, 1);
}

{
  let attempts = 0;
  let refreshes = 0;
  await assert.rejects(
    withPublicationSessionRecovery({
      attempt: async () => {
        attempts += 1;
        throw new Error(attempts === 1 ? 'PERMISSION_DENIED' : 'PERMISSION_DENIED_RETRY');
      },
      refreshVerification: async () => {
        refreshes += 1;
        return { emailVerified: true };
      },
    }),
    /PERMISSION_DENIED_RETRY/,
  );
  assert.equal(attempts, 2);
  assert.equal(refreshes, 1);
}

console.log('PASS recoverable publication/session errors are narrowly classified');
console.log('PASS one verified-session refresh enables exactly one retry');
console.log('PASS non-recoverable validation errors never retry');
console.log('PASS unverified/refresh-failure paths fail closed');
console.log('PASS retry failure is surfaced without an infinite loop');
