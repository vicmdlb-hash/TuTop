import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseApkBadgingVersionIdentity, validateApkVersionCode, validateApkVersionName } from './apk-badging-version-identity.mjs';

const extract=fs.readFileSync('scripts/extract-next-candidate-apk-identity.mjs','utf8');
const sha256=fs.readFileSync('scripts/register-staging-android-sha256.mjs','utf8');
const sha1=fs.readFileSync('scripts/register-next-candidate-staging-native-key.mjs','utf8');
const audit=fs.readFileSync('scripts/audit-staging-offplay-app-check.mjs','utf8');
const external=fs.readFileSync('scripts/next-candidate-external-preapk-gate.mjs','utf8');

assert.match(extract,/APKSIGNER_REQUIRED/);
assert.match(extract,/AAPT2_REQUIRED/);
assert.match(extract,/aapt2/);
assert.match(extract,/dump','badging/);
assert.match(extract,/mx\.tutop\.app/);
assert.match(extract,/APK_PACKAGE_NAME_MISSING/);
assert.match(extract,/APK_PACKAGE_MISMATCH/);
assert.match(extract,/parseApkBadgingVersionIdentity/);
const pureParser=fs.readFileSync('scripts/apk-badging-version-identity.mjs','utf8');
assert.match(pureParser,/APK_VERSION_CODE_INVALID/);
assert.match(pureParser,/APK_VERSION_NAME_INVALID/);
assert.match(extract,/TUTOP_NEXT_CANDIDATE_APK_VERSION_CODE/);
assert.match(extract,/TUTOP_NEXT_CANDIDATE_APK_VERSION_NAME/);
assert.match(extract,/UNVERIFIED_REQUIRE_DEVICE_INVENTORY/);
// Execute real pure parsing with synthetic aapt2 output; no Android/Firebase.
const goodBadging="package: name='mx.tutop.app' versionCode='90215' versionName='0.9.2-beta.11'\napplication-label:'TuTop'";
assert.deepEqual(parseApkBadgingVersionIdentity(goodBadging),
  {versionCode:90215,versionName:'0.9.2-beta.11'});
assert.equal(validateApkVersionCode('90200'),90200);
assert.equal(validateApkVersionName('0.9.2-beta.0'),'0.9.2-beta.0');
for (const bad of ['', '0', '-1', '1e3', 'abc', '12345678901', 90215, null]) {
  assert.throws(() => validateApkVersionCode(bad),/APK_VERSION_CODE_INVALID/);
}
for (const bad of ['', '0.9.2 beta', 'evil\nname', 90215, null]) {
  assert.throws(() => validateApkVersionName(bad),/APK_VERSION_NAME_INVALID/);
}
for (const bad of [
  "package: name='mx.tutop.app' versionCode='0' versionName='0.9.2-beta.0'",
  "package: name='mx.tutop.app' versionName='0.9.2-beta.0'",
  "package: name='mx.tutop.app' versionCode='90215'",
  "package: name='mx.tutop.app' versionCode='90215' versionCode='90216' versionName='0.9.2-beta.11'",
  "application-label:'TuTop'",
]) {
  assert.throws(() => parseApkBadgingVersionIdentity(bad),/APK_VERSION_(CODE|NAME)_INVALID/);
}
assert.throws(() => parseApkBadgingVersionIdentity(null),/APK_BADGING_INVALID/);
assert.match(extract,/extractApkSignerDigest/);
assert.match(extract,/GITHUB_REF_NAME/);
assert.match(extract,/EXACT_EXTRACTION_BRANCH_REQUIRED/);
assert.match(extract,/GITHUB_SHA/);
assert.match(extract,/SOURCE_SHA_INVALID/);
assert.match(extract,/TUTOP_NEXT_CANDIDATE_SOURCE_SHA/);
assert.match(extract,/TUTOP_ANDROID_CERT_SHA1/);
assert.match(extract,/TUTOP_ANDROID_CERT_SHA256/);
assert.match(extract,/TUTOP_EXPECTED_ANDROID_CERT_SHA256/);
assert.doesNotMatch(extract,/keystore|storePassword|keyPassword/i);

for (const binding of [sha256, sha1]) {
  assert.match(binding,/GITHUB_ACTIONS_REQUIRED/);
  assert.match(binding,/GITHUB_REF_NAME/);
  assert.match(binding,/candidate\/tutop-121-post120-physical-repair/);
  assert.match(binding,/EXACT_BINDING_BRANCH_REQUIRED/);
  assert.match(binding,/GITHUB_SHA/);
  assert.match(binding,/SOURCE_SHA_INVALID/);
  assert.match(binding,/TUTOP_NEXT_CANDIDATE_SOURCE_SHA/);
  assert.match(binding,/EXTRACTED_SOURCE_SHA_INVALID/);
  assert.match(binding,/CANDIDATE_SOURCE_SHA_MISMATCH/);
  assert.match(binding,/TUTOP_NEXT_CANDIDATE_APK_SHA256/);
  assert.match(binding,/APK_SHA256_INVALID/);
}

assert.match(sha256,/BIND_EXACT_STAGING_ANDROID_SHA256/);
assert.match(sha256,/ANDROID_SHA256_READBACK_FAILED/);
assert.match(sha256,/source_sha:sourceSha/);
assert.match(sha256,/apk_sha256:apkSha256/);
assert.match(sha1,/BIND_NEXT_CANDIDATE_STAGING_NATIVE_KEY/);
assert.match(sha1,/NEXT_CANDIDATE_SHA1_READBACK_FAILED/);
assert.match(sha1,/API_TARGETS_CHANGED/);

assert.match(audit,/EXPECTED_ANDROID_CERT_SHA256_NOT_REGISTERED/);

assert.match(external,/GITHUB_ACTIONS_REQUIRED/);
assert.match(external,/GITHUB_REF_NAME/);
assert.match(external,/candidate\/tutop-121-post120-physical-repair/);
assert.match(external,/EXACT_PROMOTION_BRANCH_REQUIRED/);
assert.match(external,/GITHUB_SHA/);
assert.match(external,/SOURCE_SHA_INVALID/);
assert.match(external,/TUTOP_NEXT_CANDIDATE_SOURCE_SHA/);
assert.match(external,/EXTRACTED_SOURCE_SHA_INVALID/);
assert.match(external,/CANDIDATE_SOURCE_SHA_MISMATCH/);
assert.match(external,/TUTOP_NEXT_CANDIDATE_APK_SHA256/);
assert.match(external,/APK_SHA256_INVALID/);
assert.match(external,/TUTOP_NEXT_CANDIDATE_APK_VERSION_CODE/);
assert.match(external,/TUTOP_NEXT_CANDIDATE_APK_VERSION_NAME/);
assert.match(external,/validateApkVersionCode/);
assert.match(external,/validateApkVersionName/);
assert.match(external,/UNVERIFIED_REQUIRE_DEVICE_INVENTORY/);
assert.ok(external.indexOf("validateApkVersionCode(required(") < external.indexOf('const token=await firebaseCiAccessToken()'), 'invalid APK version must abort before Firebase access');
assert.match(external,/source_sha:sourceSha/);
assert.match(external,/apk_sha256:apkSha256/);
assert.match(external,/NEXT_CANDIDATE_SIGNED_CERT_SHA256_REQUIRED/);
assert.match(external,/NEXT_CANDIDATE_EXACT_ANDROID_SHA256_NOT_REGISTERED/);
// Regression for the read-only Auth callback pre-promotion gate:
// never permit HTTP or embedded URL credentials before contacting the handler.
assert.match(external,/callbackUrl\.protocol\s*!==\s*'https:'/);
assert.match(external,/callbackUrl\.username\s*\|\|\s*callbackUrl\.password/);
assert.match(external,/NEXT_CANDIDATE_AUTH_HANDLER_INSECURE_URL/);
assert.ok(external.indexOf('NEXT_CANDIDATE_AUTH_HANDLER_INSECURE_URL') < external.indexOf('const customHandler='));
assert.doesNotMatch(external,/NEXT_CANDIDATE_ANDROID_SHA256_REQUIRED/);

console.log('PASS exact source SHA + TuTop package + signed APK identity are extracted together');
console.log('PASS exact SHA-1 API-key and SHA-256 Firebase bindings require extraction source continuity + exact APK identity + explicit ACK');
console.log('PASS pre-promotion external gate requires the same source/artifact provenance chain');
console.log('PASS no private signing key is introduced by the source-only preparation');


// R259: actual pre-promotion gate with mocked network and native WHATWG URL.
// No Firebase calls, real credentials, APKs or publication.
assert.ok(external.indexOf('NEXT_CANDIDATE_AUTH_HANDLER_DOMAIN_NOT_AUTHORIZED') < external.indexOf('fetch(callbackUrl.toString()'));
const tokenImport="import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';";
const versionImport="import { validateApkVersionCode, validateApkVersionName } from './apk-badging-version-identity.mjs';";
assert.equal(external.split(tokenImport).length,2);
assert.equal(external.split(versionImport).length,2);
const injected=external.replace(tokenImport,"const { firebaseCiAccessToken, fetch, process, console, validateApkVersionCode, validateApkVersionName }=globalThis.__tutopExternalGateFixture;").replace(versionImport,"");
const project='tutop-beta-vicmdlb-1356585881';
const customHost='example.invalid';
const cert='A'.repeat(64);
let fixtureSequence=0;
async function handlerCase(callback,domains,error,handlerCalls,options={}){
  const calls=[],output=[];
  const env={GITHUB_ACTIONS:'true',GITHUB_REF_NAME:'candidate/tutop-121-post120-physical-repair',TUTOP_FIREBASE_PROJECT_ID:project,GITHUB_SHA:'a'.repeat(40),TUTOP_NEXT_CANDIDATE_SOURCE_SHA:'a'.repeat(40),TUTOP_NEXT_CANDIDATE_APK_SHA256:'b'.repeat(64),TUTOP_NEXT_CANDIDATE_APK_VERSION_CODE:'90200',TUTOP_NEXT_CANDIDATE_APK_VERSION_NAME:'0.9.2-beta.0',TUTOP_EXPECTED_ANDROID_CERT_SHA256:cert};
  const json=body=>({ok:true,status:200,text:async()=>JSON.stringify(body)});
  const previous=globalThis.__tutopExternalGateFixture;
  globalThis.__tutopExternalGateFixture={
    firebaseCiAccessToken:async()=> 'synthetic',process:{env},console:{log:x=>output.push(x)},validateApkVersionCode,validateApkVersionName,
    fetch:async(url,opts)=>{
      if(url.startsWith('https://identitytoolkit.googleapis.com/'))return json({notification:{sendEmail:{callbackUri:callback}},authorizedDomains:domains});
      if(url.startsWith('https://firebase.googleapis.com/')){
        if(url.endsWith('/sha'))return json({certificates:options.noCert?[]:[{certType:'SHA_256',shaHash:cert}]});
        return json({apps:[{packageName:'mx.tutop.app',state:'ACTIVE',name:'projects/'+project+'/androidApps/synthetic'}]});
      }
      calls.push(url);
      assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert(opts.signal instanceof AbortSignal);
      assert.equal(opts.headers.Authorization,undefined);
      return {ok:true,text:async()=>options.badContent?'invalid':'Acción de cuenta TuTop auth-action.js',headers:{get:key=>({'cache-control':options.badCache?'public':'no-store','x-frame-options':'DENY','referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()','x-content-type-options':'nosniff'})[key]}};
    },
  };
  try{
    const run=()=>import('data:text/javascript;base64,'+Buffer.from(injected+'\n// fixture '+(++fixtureSequence)).toString('base64'));
    if(error){await assert.rejects(run,e=>e.message===error);assert(!output.some(x=>String(x).startsWith('PASS')));}
    else{await run();assert(output.some(x=>String(x).startsWith('PASS')));}
    assert.equal(calls.length,handlerCalls);
  }finally{
    if(previous===undefined)delete globalThis.__tutopExternalGateFixture;
    else globalThis.__tutopExternalGateFixture=previous;
  }
}
const custom='https://'+customHost+'/auth-action.html';
await handlerCase(custom,[customHost],null,1);
await handlerCase('https://'+project+'.firebaseapp.com/__/auth/action',[project+'.firebaseapp.com'],null,0);
await handlerCase(custom,['other.invalid'],'NEXT_CANDIDATE_AUTH_HANDLER_DOMAIN_NOT_AUTHORIZED',0);
await handlerCase(custom,[],'NEXT_CANDIDATE_AUTH_HANDLER_DOMAIN_NOT_AUTHORIZED',0);
for(const url of [custom+'?x=1',custom+'#fragment','https://'+customHost+':8443/auth-action.html']){
  await handlerCase(url,[customHost],'NEXT_CANDIDATE_AUTH_HANDLER_NONCANONICAL_URL',0);
}
await handlerCase('http://'+customHost+'/auth-action.html',[customHost],'NEXT_CANDIDATE_AUTH_HANDLER_INSECURE_URL',0);
await handlerCase('https://user@'+customHost+'/auth-action.html',[customHost],'NEXT_CANDIDATE_AUTH_HANDLER_INSECURE_URL',0);
await handlerCase(custom,[customHost],'NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_CACHE_UNSAFE',1,{badCache:true});
await handlerCase(custom,[customHost],'NEXT_CANDIDATE_AUTH_CUSTOM_HANDLER_CONTENT_MISMATCH',1,{badContent:true});
await handlerCase(custom,[customHost],'NEXT_CANDIDATE_EXACT_ANDROID_SHA256_NOT_REGISTERED',1,{noCert:true});
console.log('PASS synthetic callback URL authorization before network access');
