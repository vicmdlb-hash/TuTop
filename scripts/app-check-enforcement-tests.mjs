import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAppCheckPhysicalEvidence, requireAppCheckPhysicalEvidence } from './app-check-enforcement-readiness.mjs';
import os from 'node:os';
import path from 'node:path';

const historical = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
assert.equal(historical.physical_release_candidate, false);
assert.equal(historical.candidate_status, 'obsolete_physical_fail');
assert.equal(historical.replacement_required, true);
const candidate = {
  ...historical,
  // Synthetic candidate is used only via explicit test injection; Build120
  // remains retired and cannot pass the real manifest loader.
  app_version: '0.9.2-beta.99',
  android_version_code: 90299,
  apk_cert_sha256: 'c'.repeat(64),
  artifact_url: 'https://github.com/vicmdlb-hash/TuTop/actions/runs/1/artifacts/2',
  artifact_digest: 'sha256:' + 'd'.repeat(64),
  physical_release_candidate: true,
  candidate_status: 'synthetic_contract_fixture',
  replacement_required: false,
};

const now = Date.parse('2026-09-07T04:30:00.000Z');
const valid = {
  status: 'verified',
  platform: 'android',
  app_version: candidate.app_version,
  android_version_code: candidate.android_version_code,
  staging_project: 'tutop-beta-vicmdlb-1356585881',
  candidate_apk_sha256: candidate.apk_sha256,
  candidate_apk_cert_sha256: candidate.apk_cert_sha256,
  candidate_artifact_id: candidate.artifact_id,
  candidate_artifact_url: candidate.artifact_url,
  candidate_artifact_digest: candidate.artifact_digest,
  candidate_build_run_id: candidate.build_run_id,
  candidate_build_commit_sha: candidate.build_commit_sha,
  candidate_build_tree_sha: candidate.build_tree_sha,
  device_count: 2,
  devices: [
    { slot: 'A', physical: true, evidence_session_id: 'appcheck-session-a', profile_fingerprint_sha256: 'a'.repeat(64), app_check_token_observed: true, verified_at: '2026-09-07T04:20:00.000Z' },
    { slot: 'B', physical: true, evidence_session_id: 'appcheck-session-b', profile_fingerprint_sha256: 'b'.repeat(64), app_check_token_observed: true, verified_at: '2026-09-07T04:21:00.000Z' },
  ],
  app_check_token_observed: true,
  verified_at: '2026-09-07T04:22:00.000Z',
  contains_raw_token: false,
};
const ready = validateAppCheckPhysicalEvidence(valid, now, candidate);
assert.equal(ready.ready, true);
assert.equal(ready.min_device_count, 2);
assert.equal(ready.max_age_days, 7);
assert.equal(ready.candidate_artifact_id, candidate.artifact_id);

for (const mutate of [
  (x) => { x.status = 'pending_human'; },
  (x) => { x.platform = 'web'; },
  (x) => { x.app_version = '0.9.0-beta.0'; },
  (x) => { x.android_version_code = 90298; },
  (x) => { x.app_check_token_observed = false; },
  (x) => { x.staging_project = 'tutop-3a4f7'; },
  (x) => { x.device_count = 1; },
  (x) => { x.contains_raw_token = true; },
  (x) => { x.refreshToken = 'sensitive'; },
  (x) => { x.verified_at = '2026-08-20T00:00:00.000Z'; },
]) {
  const evidence = structuredClone(valid);
  mutate(evidence);
  assert.equal(validateAppCheckPhysicalEvidence(evidence, now, candidate).ready, false);
}

const oneDevice = structuredClone(valid);
oneDevice.devices = [oneDevice.devices[0]];
oneDevice.device_count = 1;
assert(validateAppCheckPhysicalEvidence(oneDevice, now, candidate).errors.includes('two_device_evidence_required'));

const fakeCount = structuredClone(valid);
fakeCount.device_count = 2;
fakeCount.devices = [fakeCount.devices[0]];
assert.equal(validateAppCheckPhysicalEvidence(fakeCount, now, candidate).ready, false);

const duplicateSession = structuredClone(valid);
duplicateSession.devices[1].evidence_session_id = duplicateSession.devices[0].evidence_session_id;
assert(validateAppCheckPhysicalEvidence(duplicateSession, now, candidate).errors.includes('independent_evidence_sessions_required'));

const duplicateFingerprint = structuredClone(valid);
duplicateFingerprint.devices[1].profile_fingerprint_sha256 = duplicateFingerprint.devices[0].profile_fingerprint_sha256;
assert(validateAppCheckPhysicalEvidence(duplicateFingerprint, now, candidate).errors.includes('independent_device_fingerprints_required'));

const nonPhysical = structuredClone(valid);
nonPhysical.devices[1].physical = false;
assert.equal(validateAppCheckPhysicalEvidence(nonPhysical, now, candidate).ready, false);

const perDeviceStale = structuredClone(valid);
perDeviceStale.devices[1].verified_at = '2026-08-20T00:00:00.000Z';
assert.equal(validateAppCheckPhysicalEvidence(perDeviceStale, now, candidate).ready, false);

// App Check evidence timestamps must be real Gregorian UTC instants, not
// Date.parse rollover dates, abbreviated dates, numeric epochs or offsets.
// These synthetic fixtures cannot satisfy the real two-device release gate.
const rolloverNow = Date.parse('2026-03-03T04:30:00.000Z');
const rolloverValid = structuredClone(valid);
rolloverValid.verified_at = '2026-03-03T04:22:00.000Z';
rolloverValid.devices[0].verified_at = '2026-03-03T04:20:00.000Z';
rolloverValid.devices[1].verified_at = '2026-03-03T04:21:00.000Z';
assert.equal(validateAppCheckPhysicalEvidence(rolloverValid, rolloverNow, candidate).ready, true);
for (const malformed of [
  '2026-02-31T04:22:00.000Z', // Date.parse silently normalizes to March 3
  '2026-03-03',
  '2026-03-03T04:22:00+00:00',
  1772511720000,
]) {
  const topLevel = structuredClone(rolloverValid);
  topLevel.verified_at = malformed;
  const topResult = validateAppCheckPhysicalEvidence(topLevel, rolloverNow, candidate);
  assert.equal(topResult.ready, false, 'invalid top-level timestamp must block');
  assert(topResult.errors.includes('verified_at_invalid'));
  const deviceLevel = structuredClone(rolloverValid);
  deviceLevel.devices[0].verified_at = malformed;
  const deviceResult = validateAppCheckPhysicalEvidence(deviceLevel, rolloverNow, candidate);
  assert.equal(deviceResult.ready, false, 'invalid per-device timestamp must block');
  assert(deviceResult.errors.includes('device_A_evidence_stale_or_future'));
}
assert.equal(validateAppCheckPhysicalEvidence(rolloverValid, NaN, candidate).ready, false,
  'invalid clock must not establish fresh physical App Check evidence');
console.log('PASS App Check evidence timestamps reject impossible dates and non-UTC strings');

// Regression: raw credentials must not evade redaction checks by using
// camelCase, snake_case, or nested keys (including device telemetry).
for (const key of [
  'appCheckToken', 'app_check_token', 'App_Check_Token', 'fcmToken',
  'access_token', 'authorization', 'apiKey', 'private_key',
  'password', 'refresh_token', 'deviceToken',
]) {
  const sensitive = structuredClone(valid);
  sensitive.devices[0].diagnostic = { nested: [{ [key]: 'sensitive-value' }] };
  const result = validateAppCheckPhysicalEvidence(sensitive, now, candidate);
  assert.equal(result.ready, false, `raw ${key} should block App Check readiness`);
  assert(result.errors.includes('raw_token_must_not_be_stored'));
}

// Prevent nested or alternate-cased raw-token flags from silently bypassing
// QA evidence sanitization (the top-level false flag remains permitted).
for (const field of ['contains_raw_token', 'containsRawToken', 'Contains_Raw_Token']) {
  for (const value of [true, 'false', null, 1]) {
    const leaked = structuredClone(valid);
    leaked.devices[0].diagnostic = { telemetry: [{ [field]: value }] };
    const result = validateAppCheckPhysicalEvidence(leaked, now, candidate);
    assert.equal(result.ready, false, `nested ${field}=${String(value)} must fail closed`);
    assert(result.errors.includes('raw_token_must_not_be_stored'));
  }
  const clean = structuredClone(valid);
  clean.devices[0].diagnostic = { telemetry: [{ [field]: false }] };
  assert.equal(validateAppCheckPhysicalEvidence(clean, now, candidate).ready, true,
    `nested ${field}=false should remain valid`);
}

const rawNestedToken = structuredClone(valid);
rawNestedToken.devices[0].app_check_token = 'must-never-be-stored';
assert(validateAppCheckPhysicalEvidence(rawNestedToken, now, candidate).errors.includes('raw_token_must_not_be_stored'));

for (const [field, value, expectedError] of [
  ['candidate_apk_sha256', '71975f84cd26adb1526db895e76dcb455aed2f258e3f6cf01035c9fd90c95321', 'wrong_apk_candidate'],
  ['candidate_apk_cert_sha256', 'e'.repeat(64), 'wrong_apk_cert_candidate'],
  ['candidate_artifact_url', 'https://example.com/not-our-run', 'wrong_artifact_url_candidate'],
  ['candidate_artifact_digest', 'sha256:' + 'f'.repeat(64), 'wrong_artifact_digest_candidate'],
  ['candidate_build_commit_sha', 'e'.repeat(40), 'wrong_build_commit_candidate'],
  ['candidate_artifact_id', 10002002950, 'wrong_artifact_candidate'],
  ['candidate_build_run_id', 34075660334, 'wrong_build_run_candidate'],
  ['candidate_build_tree_sha', '0000000000000000000000000000000000000000', 'wrong_build_tree_candidate'],
]) {
  const staleCandidate = structuredClone(valid);
  staleCandidate[field] = value;
  const result = validateAppCheckPhysicalEvidence(staleCandidate, now, candidate);
  assert.equal(result.ready, false);
  assert(result.errors.includes(expectedError));
}

for (const [patch, reason] of [
  [{ apk_cert_sha256: undefined }, 'candidate_provenance_incomplete'],
  [{ android_version_code: undefined }, 'candidate_provenance_incomplete'],
  [{ artifact_digest: undefined }, 'candidate_provenance_incomplete'],
  [{ physical_release_candidate: false }, 'candidate_not_active'],
  [{ replacement_required: true }, 'candidate_not_active'],
]) {
  const result = validateAppCheckPhysicalEvidence(valid, now, { ...candidate, ...patch });
  assert.equal(result.ready, false);
  assert(result.errors.includes(reason));
}

// App Check QA diagnostics are exportable and must not reflect attacker-
// controlled device slot values, which could themselves be private identifiers.
for (const maliciousSlot of [
  'tester@example.invalid', 'A1:B2:C3:D4:E5:F6',
  'synthetic.header.signature',
]) {
  const evidence = structuredClone(valid);
  evidence.devices[0].slot = maliciousSlot;
  evidence.devices[0].physical = false;
  evidence.devices[0].app_check_token_observed = false;
  evidence.devices[0].verified_at = 'invalid';
  const verdict = validateAppCheckPhysicalEvidence(evidence, now, candidate);
  assert.equal(verdict.ready, false);
  assert(verdict.errors.includes('device_slots_A_B_required'));
  assert(verdict.errors.includes('device_unknown_not_physical'));
  assert(verdict.errors.includes('device_unknown_token_not_observed'));
  assert(verdict.errors.includes('device_unknown_evidence_stale_or_future'));
  assert.equal(JSON.stringify(verdict).includes(maliciousSlot), false,
    'untrusted device slot must not leak into QA diagnostics');
}
// Caller-supplied local filenames and malformed JSON fragments must be redacted
// from exception messages. These tests do not access Firebase or real devices.
const privateFilename = 'tester@example.invalid';
assert.throws(
  () => requireAppCheckPhysicalEvidence('./missing-private-qa/' + privateFilename + '.json', now),
  err => err?.message === 'APP_CHECK_PHYSICAL_EVIDENCE_NOT_FOUND'
);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutop-appcheck-synthetic-'));
try {
  const badJson = path.join(tmpDir, privateFilename + '.json');
  fs.writeFileSync(badJson, '{"synthetic.email@example.invalid":', 'utf8');
  assert.throws(
    () => requireAppCheckPhysicalEvidence(badJson, now),
    err => err?.message === 'APP_CHECK_PHYSICAL_EVIDENCE_INPUT_INVALID'
  );
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
console.log('PASS App Check QA diagnostics redact untrusted slots, paths and JSON parser fragments');

console.log('PASS retired Build120 manifest remains historical App Check provenance and is not an active candidate');
console.log('PASS App Check enforcement accepts fresh verified Android evidence only against an explicit candidate');
console.log('PASS two independent A/B device records, sessions and sanitized fingerprints are required');
console.log('PASS fake device_count, duplicate evidence, stale devices and nested raw tokens fail closed');
console.log('App Check enforcement readiness contract: PASS');
// Late native App Check plugin registration regression. All fixtures are synthetic:
 // no Android runtime, Firebase credentials, network requests, or real token.
 // Transpile the production TypeScript file to exercise its actual exported API.
import { stripTypeScriptTypes } from 'node:module';
const nativeAppCheckFixtureSource = fs.readFileSync('src/services/nativeAppCheckToken.ts', 'utf8')
  .replaceAll('import.meta.env', 'globalThis.__tutopAppCheckTestEnv');
const nativeAppCheckFixtureJs = stripTypeScriptTypes(nativeAppCheckFixtureSource);
const originalWindow = globalThis.window;
const originalEnv = globalThis.__tutopAppCheckTestEnv;
let pluginExposed = false;
let initializationCount = 0;
const simulatedNativePlugin = {
  initialize: async () => { initializationCount += 1; },
  getToken: async () => ({ token: 'synthetic-only-app-check-token', expireTimeMillis: Date.now() + 15 * 60_000 }),
};
try {
  globalThis.__tutopAppCheckTestEnv = {
    VITE_TUTOP_ENVIRONMENT: 'staging',
    VITE_TUTOP_APP_VERSION: '0.9.2-beta.0',
  };
  globalThis.window = {
    Capacitor: {
      isNativePlatform: () => true,
      registerPlugin: (name) => name === 'FirebaseAppCheck' && pluginExposed
        ? simulatedNativePlugin : null,
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  const appCheckModule = await import('data:text/javascript;base64,'
    + Buffer.from(nativeAppCheckFixtureJs).toString('base64'));
  const missing = await Promise.all([
    appCheckModule.initializeNativeAppCheck(),
    appCheckModule.initializeNativeAppCheck(),
  ]);
  assert.deepEqual(missing, [null, null],
    'initial plugin absence must fail closed, not invent a token');
  assert.equal(initializationCount, 0);
  pluginExposed = true;
  const recovered = await appCheckModule.initializeNativeAppCheck();
  assert.equal(recovered, simulatedNativePlugin,
    'native plugin must be rediscovered after initially unavailable');
  assert.equal(initializationCount, 1,
    'only one initialization after plugin becomes available');
  assert.equal(await appCheckModule.getNativeAppCheckToken(false),
    'synthetic-only-app-check-token');
  assert.equal(appCheckModule.nativeAppCheckStatus().debugProvider, false,
    '0.9.2 must retain Play Integrity, not silently switch to debug');
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalEnv === undefined) delete globalThis.__tutopAppCheckTestEnv;
  else globalThis.__tutopAppCheckTestEnv = originalEnv;
}
console.log('PASS synthetic late native App Check plugin registration recovery');



// R258/R265/R266: execute the actual staging auditor with synthetic GET replies.
// No credentials, actual fetch, Firebase writes, or physical acceptance.
const offplaySource = fs.readFileSync('scripts/audit-staging-offplay-app-check.mjs', 'utf8');
const offplayImport = "import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';";
assert.equal(offplaySource.split(offplayImport).length, 2);
const offplayInjected = offplaySource.replace(offplayImport,
  "const { firebaseCiAccessToken, fetch, process, console } = globalThis.__tutopOffplayFixture;");
const projectId = 'tutop-beta-vicmdlb-1356585881';
const appId = 'synthetic-app';
const appName = 'projects/' + projectId + '/androidApps/' + appId;
const configName = 'projects/123/apps/' + appId + '/playIntegrityConfig';
const certHash = 'A'.repeat(64);
const offplayBase = [
  {projectId, projectNumber:'123'},
  {apps:[{projectId, appId, name:appName, packageName:'mx.tutop.app',state:'ACTIVE'}]},
  {certificates:[{name:appName+'/sha/synthetic',certType:'SHA_256',shaHash:certHash}]},
  {name:configName, appIntegrity:{allowUnrecognizedVersion:true},accountDetails:{requireLicensed:false},deviceIntegrity:{minDeviceRecognitionLevel:'MEETS_DEVICE_INTEGRITY'}},
];
let offplaySequence = 0;
async function offplayCase(mutate, error, expected=certHash) {
  const replies=structuredClone(offplayBase);
  mutate(replies);
  let calls=0;
  const output=[];
  const previous=globalThis.__tutopOffplayFixture;
  globalThis.__tutopOffplayFixture={
    firebaseCiAccessToken:async()=> 'synthetic',
    process:{env:{TUTOP_FIREBASE_PROJECT_ID:projectId,TUTOP_EXPECTED_ANDROID_CERT_SHA256:expected}},
    console:{log:x=>output.push(x)},
    fetch:async(url,opts)=>{
      assert.equal(opts.method,'GET');
      assert.equal(opts.redirect,'error');
      assert(opts.signal instanceof AbortSignal);
      assert.match(url,/^https:\/\//);
      assert(calls<replies.length);
      const reply=replies[calls++];
      return {ok:true,status:200,text:async()=>JSON.stringify(reply)};
    },
  };
  try{
    const run=()=>import('data:text/javascript;base64,'+Buffer.from(offplayInjected+'\n// fixture '+(++offplaySequence)).toString('base64'));
    if(error){
      await assert.rejects(run, e=>e.message===error);
      assert(!output.some(x=>String(x).startsWith('POLICY_')));
    }else{
      await run();
      assert.equal(calls,4);
      assert.equal(output.at(-1),expected?'POLICY_AND_EXACT_CERT_BINDING_READ_ONLY_PASS':'POLICY_READ_ONLY_PASS_BINDING_UNVERIFIED');
    }
  }finally{
    if(previous===undefined)delete globalThis.__tutopOffplayFixture;
    else globalThis.__tutopOffplayFixture=previous;
  }
}
await offplayCase(()=>{},null);
await offplayCase(()=>{},null,'');
await offplayCase(x=>{x[0].projectId='other';},'STAGING_ANDROID_APP_IDENTITY_MISMATCH');
await offplayCase(x=>{x[1].apps.push({...x[1].apps[0]});},'STAGING_ANDROID_APP_IDENTITY_AMBIGUOUS');
await offplayCase(x=>{x[1].apps.push(null);},'STAGING_ANDROID_APP_LIST_MALFORMED');
await offplayCase(x=>{x[1].nextPageToken='next';},'STAGING_ANDROID_APP_LIST_INCOMPLETE');
for(const invalid of ['a/b','a\\b','a?b','a#b','a%b','a b','.','..','']){
  await offplayCase(x=>{x[1].apps[0].appId=invalid;x[1].apps[0].name='projects/'+projectId+'/androidApps/'+invalid;},'STAGING_ANDROID_APP_IDENTITY_MISMATCH');
}
await offplayCase(x=>{x[2].certificates[0].name='other/sha/c';},'STAGING_CERT_IDENTITY_MALFORMED');
await offplayCase(x=>{x[2].certificates.push({...x[2].certificates[0],shaHash:''});},'STAGING_CERT_IDENTITY_MALFORMED');
await offplayCase(x=>{x[2].certificates=[];},'EXPECTED_ANDROID_CERT_SHA256_NOT_REGISTERED');
await offplayCase(x=>{x[3].name='other';},'STAGING_PLAY_INTEGRITY_CONFIG_IDENTITY_MISMATCH');
await offplayCase(x=>{x[3].accountDetails.requireLicensed='false';},'OFFPLAY_LICENSE_POLICY_MALFORMED');
await offplayCase(x=>{x[3]=null;},'STAGING_RESPONSE_INVALID');
console.log('PASS synthetic off-Play identity, response and exact binding contract');
