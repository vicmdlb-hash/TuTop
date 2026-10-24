import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isCurrentBackendHydration} from '../src/lib/backendHydrationIdentity.ts';
const A='synthetic-a', B='synthetic-b';
assert.equal(isCurrentBackendHydration(A,A,A,3,3),true);
for(const [expected,live,snapshot,startEpoch,currentEpoch] of [
 [A,B,A,3,3],[A,A,B,3,3],[A,null,A,3,3],[A,A,A,3,4],
 ['',A,A,3,3],[A,A,undefined,3,3],[A,A,A,-1,0],
]) assert.equal(isCurrentBackendHydration(expected,live,snapshot,startEpoch,currentEpoch),false);
const source=fs.readFileSync('src/components/BackendGate.tsx','utf8');
assert.match(source,/const expectedEpoch = authEpoch\.current/);
assert.match(source,/const snapshot = await onlineBackend\.loadSnapshot\(\);[\s\S]*if \(!stillCurrent\(snapshot\.user\.id\)\) return;[\s\S]*hydrateOnline\(snapshot\)/);
assert.match(source,/const verified = await verifiedEmailBetaAuth\.refreshVerificationStatus\(\);\s*if \(!stillCurrent\(expectedUid\)\) return;/);
assert.match(source,/authEpoch\.current \+= 1;[\s\S]*const currentUid/);
assert.match(source,/syncQueued\.current = true/);
assert.match(source,/syncQueued\.current = false;[\s\S]*Promise\.resolve\(\)\.then\(\(\) => sync\(true\)\)/);
console.log('PASS stale Firebase snapshot A cannot hydrate UI for B or after logout; queued B retry is not silently dropped');
