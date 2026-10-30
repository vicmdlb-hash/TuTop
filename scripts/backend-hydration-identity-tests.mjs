import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isCurrentBackendHydration,isLiveAccountSnapshot} from '../src/lib/backendHydrationIdentity.ts';
const A='synthetic-a', B='synthetic-b';
assert.equal(isCurrentBackendHydration(A,A,A,3,3),true);
for(const [expected,live,snapshot,startEpoch,currentEpoch] of [
 [A,B,A,3,3],[A,A,B,3,3],[A,null,A,3,3],[A,A,A,3,4],
 ['',A,A,3,3],[A,A,undefined,3,3],[A,A,A,-1,0],
]) assert.equal(isCurrentBackendHydration(expected,live,snapshot,startEpoch,currentEpoch),false);
// Real shared UID predicate: bootstrap A is allowed with A's live token;
// A's completed request must never overwrite B or resurrect signed-out A.
assert.equal(isLiveAccountSnapshot('',A,A),true);
assert.equal(isLiveAccountSnapshot(A,A,A),true);
for(const [storeUid,sessionUid,snapshotUid] of [
  [B,B,A], [B,A,A], [A,B,B], [A,A,B],
  ['',null,A], ['',undefined,A], [A,null,A],
  ['',A,B], ['',A,''], ['', '',A],
]) assert.equal(isLiveAccountSnapshot(storeUid,sessionUid,snapshotUid),false,
  'stale or unauthenticated snapshot must not overwrite another account');
const appStore = fs.readFileSync('src/store/useAppStore.ts','utf8');
assert(appStore.includes("import { isLiveAccountSnapshot } from '../lib/backendHydrationIdentity';"));
assert(appStore.includes('if (!isLiveAccountSnapshot(state.user.id, onlineBackend.session?.uid, snapshot.user.id)) return state;'));
const source=fs.readFileSync('src/components/BackendGate.tsx','utf8');
assert.match(source,/const expectedEpoch = authEpoch\.current/);
assert.match(source,/const snapshot = await onlineBackend\.loadSnapshot\(\);[\s\S]*if \(!stillCurrent\(snapshot\.user\.id\)\) return;[\s\S]*hydrateOnline\(snapshot\)/);
assert.match(source,/const verified = await verifiedEmailBetaAuth\.refreshVerificationStatus\(\);\s*if \(!stillCurrent\(expectedUid\)\) return;/);
assert.match(source,/authEpoch\.current \+= 1;[\s\S]*const currentUid/);
assert.match(source,/syncQueued\.current = true/);
assert.match(source,/syncQueued\.current = false;[\s\S]*Promise\.resolve\(\)\.then\(\(\) => sync\(true\)\)/);
console.log('PASS stale Firebase snapshot A cannot hydrate UI for B or after logout; queued B retry is not silently dropped');
