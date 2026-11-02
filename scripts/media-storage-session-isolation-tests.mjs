import assert from 'node:assert/strict';
import vm from 'node:vm';
import { compileTypescriptFixture } from './typescript-fixture-compiler.mjs';
import { assertFirebaseRequestSessionCurrent } from '../src/lib/firebaseSharedSessionGuard.ts';

// Real media service, fake transport and credentials. No Firebase network, uploads,
// deletes, access tokens, Android device or production state are used.
const compiled = compileTypescriptFixture('src/services/firebaseMediaStorage.ts')
  .replaceAll('import.meta.env', '__testEnv');

const first = { uid: 'A', idToken: 'synthetic-A-old', refreshToken: 'synthetic-refresh-A-old' };
const next = { uid: 'B', idToken: 'synthetic-B', refreshToken: 'synthetic-refresh-B' };
const relogin = { uid: 'A', idToken: 'synthetic-A-new', refreshToken: 'synthetic-refresh-A-new' };
const file = new Blob(['synthetic video'], { type: 'video/mp4' });
const uriA = 'firebase-storage://synthetic-bucket.test/product-videos/A/file.mp4';
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function until(predicate, label) {
  for (let i = 0; i < 100 && !predicate(); i++) await Promise.resolve();
  assert(predicate(), 'fixture did not reach ' + label);
}

function harness({ attestationGate = null, onObjectUrl = null } = {}) {
  let stored = first;
  let appCheckStarted = false;
  let createdUrls = 0;
  let revokedUrls = 0;
  const timers = new Map();
  let nextTimerId = 0;
  const requests = [];
  const diagnostics = [];
  class FirebaseRestClient {
    constructor() { this.session = stored; }
    get currentSession() { return this.session; }
    async getIdToken() { return this.session.idToken; }
  }
  const plugin = async () => {
    appCheckStarted = true;
    if (attestationGate) await attestationGate.promise;
    return null;
  };
  const mockFetch = (url, init) => {
    assert(String(url).startsWith('https://firebasestorage.googleapis.com/'));
    const request = { url, init, pending: deferred() };
    requests.push(request);
    return request.pending.promise;
  };
  class Url extends URL {
    static createObjectURL() {
      createdUrls += 1;
      if (onObjectUrl) onObjectUrl();
      return 'blob:synthetic';
    }
    static revokeObjectURL() { revokedUrls += 1; }
  }
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(name) {
      const dependencies = {
        './nativeAppCheckToken': { getNativeAppCheckToken: plugin },
        './firebaseRest': { FirebaseRestClient },
        './localDiagnostics': { recordDiagnostic: (category, code) => diagnostics.push({ category, code }) },
        './runtimeConfig': { getFirebaseConfig: () => ({ appId: 'synthetic', projectId: 'synthetic' }) },
        '../lib/firebaseSharedSessionGuard': { assertFirebaseRequestSessionCurrent },
      };
      assert(Object.prototype.hasOwnProperty.call(dependencies, name), 'unexpected import: ' + name);
      return dependencies[name];
    },
    __testEnv: {
      VITE_TUTOP_MEDIA_STORAGE_ENABLED: 'true',
      VITE_FIREBASE_STORAGE_BUCKET: 'synthetic-bucket.test',
    },
    fetch: mockFetch, Blob, URL: Url, Promise, Date, Math, AbortController,
    setTimeout(fn, delay) { const id = ++nextTimerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    crypto: { randomUUID: () => 'synthetic-random-id' },
  }, { timeout: 3000 });
  return {
    media: module.exports.firebaseMediaStorage, requests, diagnostics,
    switchTo: (s) => { stored = s; },
    attestationStarted: () => appCheckStarted,
    urlCount: () => createdUrls,
    revokedCount: () => revokedUrls,
    activeTimers: () => timers.size,
    expireTimers: () => {
      const ready = [...timers.values()];
      timers.clear();
      for (const timer of ready) timer.fn();
    },
  };
}

// Valid A upload still produces a URI after a successful synthetic HTTP response.
{
  const h = harness();
  const result = h.media.uploadListingVideo(file, 'A');
  await until(() => h.requests.length === 1, 'baseline upload');
  h.requests[0].pending.resolve({ ok: true, status: 200 });
  assert.match((await result).uri, /^firebase-storage:\/\/synthetic-bucket\.test\/product-videos\/A\//);
}
// Changing A -> B while App Check is pending must prevent a Storage request.
{
  const gate = deferred();
  const h = harness({ attestationGate: gate });
  const result = h.media.uploadListingVideo(file, 'A');
  await until(() => h.attestationStarted(), 'attestation');
  h.switchTo(next);
  gate.resolve();
  await assert.rejects(result, /AUTH_SESSION_CHANGED/);
  assert.equal(h.requests.length, 0);
}
// A different login with the same UID is a different session, too.
{
  const gate = deferred();
  const h = harness({ attestationGate: gate });
  const result = h.media.uploadListingVideo(file, 'A');
  await until(() => h.attestationStarted(), 'same UID attestation');
  h.switchTo(relogin);
  gate.resolve();
  await assert.rejects(result, /AUTH_SESSION_CHANGED/);
  assert.equal(h.requests.length, 0);
}
// A remote upload already dispatched can finish, but its URI must not be handed to B.
{
  const h = harness();
  const result = h.media.uploadListingVideo(file, 'A');
  await until(() => h.requests.length === 1, 'late upload');
  h.switchTo(next);
  h.requests[0].pending.resolve({ ok: true, status: 200 });
  await assert.rejects(result, /AUTH_SESSION_CHANGED/);
}
// B must not receive an object URL after A's video-body read finishes late.
{
  const h = harness();
  const pending = h.media.loadVideoBlobUrl(uriA);
  await until(() => h.requests.length === 1, 'video read');
  const body = deferred();
  h.requests[0].pending.resolve({ ok: true, status: 200, blob: () => body.promise });
  await until(() => true, 'body pending');
  h.switchTo(next);
  body.resolve(new Blob(['synthetic'], { type: 'video/mp4' }));
  await assert.rejects(pending, /No pudimos procesar el video/);
  assert.equal(h.urlCount(), 0, 'late old-account video must not create a blob URL');
}
// A URI owned by A cannot be deleted using B's active account.
{
  const h = harness();
  h.switchTo(next);
  await assert.rejects(h.media.delete(uriA), /MEDIA_STORAGE_OWNER_MISMATCH/);
  assert.equal(h.requests.length, 0);
}
// A delete already dispatched must not report success after B logs in.
{
  const h = harness();
  const pending = h.media.delete(uriA);
  await until(() => h.requests.length === 1, 'delete');
  h.switchTo(next);
  h.requests[0].pending.resolve({ ok: true, status: 200 });
  await assert.rejects(pending, /AUTH_SESSION_CHANGED/);
}
// Same-bucket videos remain accessible to the current account.
{
  const h = harness();
  const pending = h.media.loadVideoBlobUrl(uriA);
  await until(() => h.requests.length === 1, 'same-bucket video read');
  h.requests[0].pending.resolve({
    ok: true, status: 200,
    blob: async () => new Blob(['synthetic video body'], { type: 'video/mp4' }),
  });
  assert.equal(await pending, 'blob:synthetic');
  assert.equal(h.urlCount(), 1, 'valid video URL should be created once');
}
// A forged foreign bucket URI cannot dispatch an authenticated read or delete.
{
  const h = harness();
  const foreign = 'firebase-storage://other-bucket.test/product-videos/A/file.mp4';
  await assert.rejects(h.media.loadVideoBlobUrl(foreign), /No pudimos procesar el video/);
  assert.equal(h.requests.length, 0, 'foreign bucket video read must not reach transport');
  await assert.rejects(h.media.delete(foreign), /MEDIA_STORAGE_BUCKET_MISMATCH/);
  assert.equal(h.requests.length, 0, 'foreign bucket video deletion must not reach transport');
}
// A stalled upload is aborted and not automatically retried. Server completion stays UNKNOWN.
{
  const h = harness();
  const pending = h.media.uploadListingVideo(file, 'A');
  await until(() => h.requests.length === 1, 'upload timeout');
  h.expireTimers();
  await assert.rejects(pending, /MEDIA_STORAGE_TIMEOUT/);
  assert.equal(h.requests.length, 1, 'timeout must never resend the upload');
  assert.equal(h.requests[0].init.signal.aborted, true);
  assert.equal(h.activeTimers(), 0);
}
// A video response that never returns headers does not leave the UI pending forever.
{
  const h = harness();
  const pending = h.media.loadVideoBlobUrl(uriA);
  await until(() => h.requests.length === 1, 'read headers timeout');
  h.expireTimers();
  await assert.rejects(pending, /La conexión tardó demasiado/);
  assert.equal(h.requests[0].init.signal.aborted, true);
  assert.equal(h.urlCount(), 0);
}
// A video body that hangs after HTTP headers is also bounded, without late blob URLs.
{
  const h = harness();
  const pending = h.media.loadVideoBlobUrl(uriA);
  await until(() => h.requests.length === 1, 'read body timeout');
  const body = deferred();
  let bodyStarted = false;
  h.requests[0].pending.resolve({ ok: true, status: 200, blob: () => { bodyStarted = true; return body.promise; } });
  await until(() => bodyStarted, 'body stalled');
  h.expireTimers();
  await assert.rejects(pending, /La conexión tardó demasiado/);
  body.resolve(new Blob(['synthetic'], { type: 'video/mp4' }));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.urlCount(), 0, 'late body may not create an object URL');
}
// A stalled delete aborts once; no background deletion retry is fabricated.
{
  const h = harness();
  const pending = h.media.delete(uriA);
  await until(() => h.requests.length === 1, 'delete timeout');
  h.expireTimers();
  await assert.rejects(pending, /MEDIA_STORAGE_TIMEOUT/);
  assert.equal(h.requests[0].init.signal.aborted, true);
  assert.equal(h.requests.length, 1);
}
// If an account changes at object-URL creation, revoke the newly created URL.
{
  let h;
  h = harness({ onObjectUrl: () => h.switchTo(next) });
  const pending = h.media.loadVideoBlobUrl(uriA);
  await until(() => h.requests.length === 1, 'object URL owner change');
  h.requests[0].pending.resolve({
    ok: true, status: 200,
    blob: async () => new Blob(['synthetic'], { type: 'video/mp4' }),
  });
  await assert.rejects(pending, /No pudimos procesar el video/);
  assert.equal(h.urlCount(), 1);
  assert.equal(h.revokedCount(), 1, 'a stale URL must be revoked');
}
console.log('PASS actual Firebase media service: 14 isolated media/security cases, no Firebase traffic, no files written or deleted');
