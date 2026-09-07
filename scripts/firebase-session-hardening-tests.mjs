import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FirebaseSessionLifecycle, isTerminalFirebaseRefreshFailure } from '../src/lib/firebaseSessionLifecycle.ts';

const sessionA = { uid: 'uid-a', marker: 'session-a' };
const sessionB = { uid: 'uid-a', marker: 'session-b' };

// 1) Several requests hitting an expired token must share one refresh request.
let refreshCalls = 0;
const concurrent = new FirebaseSessionLifecycle(sessionA);
const options = {
  refresh: async () => {
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return { token: 'fresh-token', session: sessionB };
  },
  restore: () => { throw new Error('restore not expected'); },
  clear: () => { throw new Error('clear not expected'); },
};
const tokens = await Promise.all(Array.from({ length: 6 }, () => concurrent.runRefresh(options)));
assert.deepEqual(new Set(tokens), new Set(['fresh-token']));
assert.equal(refreshCalls, 1, 'expired session caused a refresh storm');
assert.equal(concurrent.authoritativeSession, sessionB);

// 2) Signing out while refresh is in flight must never resurrect the previous session.
const signout = new FirebaseSessionLifecycle(sessionA);
let releaseRefresh;
const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
let restored = 'not-called';
const lateRefresh = signout.runRefresh({
  refresh: async () => {
    await refreshGate;
    return { token: 'late-token', session: sessionB };
  },
  restore: (session) => { restored = session; },
  clear: () => { throw new Error('clear not expected on generation change'); },
});
await Promise.resolve();
signout.signOut();
releaseRefresh();
await assert.rejects(lateRefresh, /AUTH_SESSION_CHANGED/);
assert.equal(signout.authoritativeSession, null);
assert.equal(restored, null, 'late refresh did not restore authoritative signed-out state');

// 3) Terminal refresh failures clear unusable credentials so UI cannot remain ghost-authenticated.
const terminal = new FirebaseSessionLifecycle(sessionA);
let cleared = 0;
await assert.rejects(terminal.runRefresh({
  refresh: async () => { throw Object.assign(new Error('INVALID_REFRESH_TOKEN'), { payload: { error: { status: 'INVALID_ARGUMENT' } } }); },
  restore: () => { throw new Error('restore not expected'); },
  clear: () => { cleared += 1; },
}), /INVALID_REFRESH_TOKEN/);
assert.equal(cleared, 1);
assert.equal(terminal.authoritativeSession, null);
assert.equal(isTerminalFirebaseRefreshFailure(new Error('USER_DISABLED')), true);
assert.equal(isTerminalFirebaseRefreshFailure(new TypeError('network offline')), false);

// 4) A transient network failure must preserve the session so reconnect can retry.
const transient = new FirebaseSessionLifecycle(sessionA);
let transientClear = 0;
await assert.rejects(transient.runRefresh({
  refresh: async () => { throw new TypeError('network offline'); },
  restore: () => { throw new Error('restore not expected'); },
  clear: () => { transientClear += 1; },
}), /network offline/);
assert.equal(transientClear, 0);
assert.equal(transient.authoritativeSession, sessionA);

// Runtime wiring contract: shared lifecycle must actually protect FirebaseRestClient at bootstrap.
const bridge = fs.readFileSync('src/services/firebaseSessionHardeningBridge.ts', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
assert.match(bridge, /FirebaseSessionLifecycle/);
assert.match(bridge, /state\.runRefresh/);
assert.match(bridge, /restoreAuthoritative/);
assert.match(bridge, /originalSignOut/);
assert.match(main, /firebaseSessionHardeningBridge/);

console.log('PASS expired-token refresh is single-flight');
console.log('PASS sign-out cannot be undone by a late refresh response');
console.log('PASS terminal refresh failure clears ghost session');
console.log('PASS transient offline failure preserves retryable session');
console.log('PASS runtime bridge installs shared session lifecycle at bootstrap');
console.log('Firebase session hardening tests: PASS');
