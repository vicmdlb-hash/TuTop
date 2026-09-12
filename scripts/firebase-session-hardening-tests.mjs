import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FirebaseSessionLifecycle, isTerminalFirebaseRefreshFailure } from '../src/lib/firebaseSessionLifecycle.ts';

const sessionA = { uid: 'uid-a', marker: 'session-a' };
const sessionARefreshed = { uid: 'uid-a', marker: 'session-a-refreshed' };
const sessionB = { uid: 'uid-b', marker: 'session-b' };
const sessionC = { uid: 'uid-c', marker: 'session-c' };

// 1) Several requests hitting an expired token must share one refresh request.
let refreshCalls = 0;
const concurrent = new FirebaseSessionLifecycle(sessionA);
const options = {
  refresh: async () => {
    refreshCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return { token: 'fresh-token', session: sessionARefreshed };
  },
  restore: () => { throw new Error('restore not expected'); },
  clear: () => { throw new Error('clear not expected'); },
};
const tokens = await Promise.all(Array.from({ length: 6 }, () => concurrent.runRefresh(options)));
assert.deepEqual(new Set(tokens), new Set(['fresh-token']));
assert.equal(refreshCalls, 1, 'expired session caused a refresh storm');
assert.equal(concurrent.authoritativeSession, sessionARefreshed);

// 2) Signing out while refresh is in flight must never resurrect the previous session.
const signout = new FirebaseSessionLifecycle(sessionA);
let releaseRefresh;
const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
let restored = 'not-called';
const lateRefresh = signout.runRefresh({
  refresh: async () => {
    await refreshGate;
    return { token: 'late-token', session: sessionARefreshed };
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

// 5) Concurrent logins for different accounts may finish out of order; latest-started auth wins.
const replacement = new FirebaseSessionLifecycle(sessionA);
let persisted = sessionA;
const loginB = replacement.beginAuthReplacement();
const loginC = replacement.beginAuthReplacement();
assert.equal(replacement.completeAuthReplacement(loginC, sessionC, (value) => { persisted = value; }), true);
assert.equal(persisted, sessionC);
assert.equal(replacement.completeAuthReplacement(loginB, sessionB, (value) => { persisted = value; }), false);
assert.equal(replacement.authoritativeSession, sessionC);
assert.equal(persisted, sessionC, 'stale account login overwrote the newer identity');

// 6) A stale refresh racing a new login may restore the old session temporarily, but login completion must re-apply the winner.
const refreshVsLogin = new FirebaseSessionLifecycle(sessionA);
let persistedRace = sessionA;
let releaseRaceRefresh;
const raceGate = new Promise((resolve) => { releaseRaceRefresh = resolve; });
const staleRefresh = refreshVsLogin.runRefresh({
  refresh: async () => {
    await raceGate;
    return { token: 'old-account-refresh', session: sessionARefreshed };
  },
  restore: (value) => { persistedRace = value; },
  clear: () => { persistedRace = null; },
});
await Promise.resolve();
const loginGeneration = refreshVsLogin.beginAuthReplacement();
// Simulate the raw auth call persisting the new account before its wrapper settles.
persistedRace = sessionB;
releaseRaceRefresh();
await assert.rejects(staleRefresh, /AUTH_SESSION_CHANGED/);
assert.equal(persistedRace, sessionA, 'stale refresh should restore the prior authoritative state before login settles');
assert.equal(refreshVsLogin.completeAuthReplacement(loginGeneration, sessionB, (value) => { persistedRace = value; }), true);
assert.equal(refreshVsLogin.authoritativeSession, sessionB);
assert.equal(persistedRace, sessionB, 'winning login was not re-applied after stale refresh restoration');

// 7) A stale failed login must not replace a newer successful account.
const failedReplacement = new FirebaseSessionLifecycle(sessionA);
let persistedFailure = sessionA;
const oldAttempt = failedReplacement.beginAuthReplacement();
const newAttempt = failedReplacement.beginAuthReplacement();
assert.equal(failedReplacement.completeAuthReplacement(newAttempt, sessionC, (value) => { persistedFailure = value; }), true);
assert.equal(failedReplacement.failAuthReplacement(oldAttempt, sessionA, (value) => { persistedFailure = value; }), false);
assert.equal(failedReplacement.authoritativeSession, sessionC);
assert.equal(persistedFailure, sessionC);

// Runtime wiring contract: shared lifecycle must actually protect FirebaseRestClient at bootstrap.
const bridge = fs.readFileSync('src/services/firebaseSessionHardeningBridge.ts', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
assert.match(bridge, /FirebaseSessionLifecycle/);
assert.match(bridge, /state\.runRefresh/);
assert.match(bridge, /completeAuthReplacement/);
assert.match(bridge, /failAuthReplacement/);
assert.match(bridge, /restoreAuthoritative/);
assert.match(bridge, /originalSignOut/);
assert.match(main, /firebaseSessionHardeningBridge/);

console.log('PASS expired-token refresh is single-flight');
console.log('PASS sign-out cannot be undone by a late refresh response');
console.log('PASS terminal refresh failure clears ghost session');
console.log('PASS transient offline failure preserves retryable session');
console.log('PASS latest-started account replacement wins out-of-order completion');
console.log('PASS stale refresh cannot overwrite a newly authenticated account');
console.log('PASS stale failed login cannot replace a newer successful identity');
console.log('PASS runtime bridge installs shared session lifecycle at bootstrap');
console.log('Firebase session hardening tests: PASS');
