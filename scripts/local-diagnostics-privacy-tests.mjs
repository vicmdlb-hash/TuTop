import assert from 'node:assert/strict';
import { recordDiagnostic, readLocalDiagnostics, clearLocalDiagnostics } from '../src/services/localDiagnostics.ts';

const oldLocalStorage = globalThis.localStorage;
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
};

try {
  clearLocalDiagnostics();
  recordDiagnostic('media', 'photo_processing_failed', {
    source: 'camera',
    mime: 'mp4',
    status_class: 400,
    count: 3,
    ready: true,
    uid: 'account-a',
    phone_number: '2461234567',
    raw: 'user@example.com',
    secret_token: 'abc123',
    failure_kind: 'user@example.com',
  });
  assert.deepEqual(readLocalDiagnostics().at(-1).context, {
    source: 'camera', mime: 'mp4', status_class: 400, count: 3, ready: true,
  });
  recordDiagnostic('ai', 'request-failed', {
    failure_kind: 'network',
    fallback_model: false,
    app_check: 'uid-or-secret',
    source: 'unknown-sensitive-source',
    status_class: 999,
    count: -10,
  });
  assert.deepEqual(readLocalDiagnostics().at(-1).context, {
    failure_kind: 'network', fallback_model: false,
  });
  recordDiagnostic('media', 'video_upload_success', { mime: 'quicktime' });
  assert.deepEqual(readLocalDiagnostics().at(-1).context, { mime: 'quicktime' });
  recordDiagnostic('ai', 'topi_privacy_redaction_applied', {
    email: true, phone: true, otp: false, token: true, count: 4,
  });
  assert.deepEqual(readLocalDiagnostics().at(-1).context, {
    email: true, phone: true, otp: false, token: true, count: 4,
  });
  assert(!JSON.stringify(readLocalDiagnostics()).includes('user@example.com'));
  assert(!JSON.stringify(readLocalDiagnostics()).includes('account-a'));
  assert(!JSON.stringify(readLocalDiagnostics()).includes('2461234567'));

  recordDiagnostic('media', 'buyer-private@example.com session-abc', { status_class: 403 });
  assert.equal(readLocalDiagnostics().at(-1).code, 'unknown');
  assert.equal(readLocalDiagnostics().at(-1).context, undefined);
  recordDiagnostic('media', 'storage_http_error', { status_class: 500 });
  assert.deepEqual(readLocalDiagnostics().at(-1).context, { status_class: 500 });

  // Existing device history is untrusted and must be rewritten without raw PII.
  const at = '2026-10-31T20:00:00.000Z';
  const key = 'tutop.diagnostics.v092';
  memory.set(key, JSON.stringify([
    { at, category: 'media', code: 'person@example.com', context: { uid: 'private-user', source: 'camera', raw: 'secret-data' } },
    { at, category: 'media', code: 'storage_http_error', context: { status_class: 400, phone_number: '2461234567' } },
    { at: 'not-an-ISO-date-private-value', category: 'ai', code: 'request-failed', context: { ready: true } },
    { at, category: 'non-category', code: 'leak', context: { ready: true } },
  ]));
  assert.deepEqual(readLocalDiagnostics(), [
    { at, category: 'media', code: 'unknown', context: { source: 'camera' } },
    { at, category: 'media', code: 'storage_http_error', context: { status_class: 400 } },
  ]);
  for (const secret of ['person@example.com', 'private-user', 'secret-data', '2461234567', 'not-an-ISO-date-private-value']) {
    assert(!memory.get(key).includes(secret), 'historical diagnostics retained sensitive data');
  }
  memory.set(key, 'not-json-sensitive');
  assert.deepEqual(readLocalDiagnostics(), []);
  assert.equal(memory.has(key), false);

  console.log('PASS local diagnostics context retains only explicitly allowed booleans, bounded counts and safe enums');
  console.log('PASS local diagnostics reject unknown identifiers and arbitrary strings without network');
} finally {
  if (oldLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldLocalStorage;
}
