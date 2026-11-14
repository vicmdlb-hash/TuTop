import assert from 'node:assert/strict';
import { parseQaProvenance, assessPrivateNoAiSmoke, PRIVATE_SMOKE_CASES } from './private-qa-no-ai-smoke-gate.mjs';

const SHA='a'.repeat(40), APK='b'.repeat(64), CERT='c'.repeat(64);
const now=Date.parse('2026-11-12T20:00:00.000Z');
const p=parseQaProvenance([
 'source_sha='+SHA,'package=mx.tutop.app','version=0.9.2-beta.0',
 'firebase_project=tutop-beta-vicmdlb-1356585881',
 'qa_signed_apk_sha256='+APK,'qa_certificate_sha256='+CERT,
 'encryption=age-public-recipient','release_ready=false','device_a_b_passed=false'
].join('\n'));
const e={
 schema:'tutop.private-smoke-no-ai.v1',source_sha:SHA,apk_sha256:APK,
 certificate_sha256:CERT,firebase_project:'tutop-beta-vicmdlb-1356585881',
 remote_ai_enabled:false,observed_at:'2026-11-12T19:50:00.000Z',
 device:{physical:true,manufacturer:'Synthetic',model:'Test-Android',android_version:'15',installation:'clean'},
 recovery:{owner_age_decryption_verified:true,decrypted_apk_sha256:APK,certificate_sha256:CERT},
 cases:{...Object.fromEntries(PRIVATE_SMOKE_CASES.map(k=>[k,'pass'])),topi_real_ai:'not_applicable'}
};
// Malformed caller-supplied provenance must fail closed in the exported pure
// API, not throw or accidentally authorize a private QA self-report.
for (const malformedProvenance of [null, undefined, false, [], 'malformed']) {
  const verdict = assessPrivateNoAiSmoke(malformedProvenance, e, now);
  assert.equal(verdict.status, 'BLOCKED');
  assert.equal(verdict.private_smoke_evidence_complete, false);
  assert.equal(verdict.release_blocked, true);
  assert.equal(verdict.r6_release_blocked, true);
  assert(verdict.errors.some((error) => error.includes('provenance must be an object')));
}
const good=assessPrivateNoAiSmoke(p,e,now);
assert.equal(good.status,'EVIDENCE_COMPLETE_SELF_REPORTED');
assert.equal(good.private_smoke_evidence_complete,true);
assert.equal(good.r6_release_blocked,true);
assert.equal(good.release_blocked,true);
function denied(mutator,label){
 const x=structuredClone(e), provenance={...p};mutator(x,provenance);
 const result=assessPrivateNoAiSmoke(provenance,x,now);
 assert.equal(result.private_smoke_evidence_complete,false,label);
 assert.equal(result.release_blocked,true,label);
 assert.equal(result.r6_release_blocked,true,label);
 assert(result.errors.length>0,label);
}
denied(x=>{x.source_sha='0'.repeat(40)},'wrong trigger source');
denied(x=>{x.apk_sha256='0'.repeat(64)},'wrong APK hash');
denied(x=>{x.certificate_sha256='0'.repeat(64)},'wrong signer');
denied(x=>{x.remote_ai_enabled=true},'remote AI');
denied(x=>{x.cases.topi_real_ai='pass'},'fake real AI');
denied(x=>{x.cases.topi_real_ai='pending'},'ambiguous AI');
denied(x=>{x.cases.auth_identity='pending'},'missing auth');
denied(x=>{delete x.cases.app_check_token_observed},'missing App Check');
denied(x=>{x.device.physical=false},'not physical');
denied(x=>{x.device.model='PENDIENTE'},'placeholder');
denied(x=>{x.device.model='123456789012345'},'IMEI-like hardware identifier');
denied(x=>{x.device.manufacturer='A1:B2:C3:D4:E5:F6'},'MAC-like hardware identifier');
denied(x=>{x.device.imei='synthetic-identifier'},'private device field');
denied(x=>{x.refreshToken='synthetic'},'raw auth token');
// Raw JSON keys must not be reflected by privacy/audit verdicts, even when
// that key is itself an email, device ID or token-like string.
for (const sensitiveKey of [
  'tester@example.invalid',
  'a'.repeat(24)+'.'+'b'.repeat(24)+'.'+'c'.repeat(24),
  'A1:B2:C3:D4:E5:F6',
]) {
  for (const target of ['root','device','recovery','cases']) {
    const probe=structuredClone(e);
    const item=target==='root'?probe:probe[target];
    item[sensitiveKey]='synthetic-secret';
    const verdict=assessPrivateNoAiSmoke(p,probe,now);
    assert.equal(verdict.status,'BLOCKED');
    assert.equal(verdict.r6_release_blocked,true);
    assert.equal(JSON.stringify(verdict).includes(sensitiveKey),false,
      'unknown JSON property name must be redacted');
    assert(verdict.errors.some(err=>err.includes('unrecognized field [redacted]')));
  }
}
const sourceText=(await import('node:fs')).readFileSync(
  'scripts/private-qa-no-ai-smoke-gate.mjs','utf8');
assert.match(sourceText,/PRIVATE_SMOKE_INPUT_INVALID/);
assert.doesNotMatch(sourceText,/errors:\[String\(err\)\]/);

denied(x=>{x.recovery.privateKey='synthetic'},'private age key');
denied(x=>{x.recovery.owner_age_decryption_verified=false},'not decrypted');
denied(x=>{x.recovery.decrypted_apk_sha256='0'.repeat(64)},'restored bytes mismatch');
denied(x=>{x.observed_at='2026-11-10T00:00:00.000Z'},'expired session');
denied(x=>{x.observed_at='2026-11-13T00:00:00.000Z'},'future session');
denied((_,p)=>{p.release_ready='true'},'fake release');
denied((_,p)=>{p.device_a_b_passed='true'},'fake R6');
denied((_,p)=>{p.firebase_project='prod'},'wrong environment');
assert.throws(()=>parseQaProvenance('source_sha=x\nsource_sha=y'),/DUPLICATE_PROVENANCE_KEY/);
assert.throws(()=>parseQaProvenance('idToken=secret'),/UNEXPECTED_PROVENANCE_KEY/);
assert.throws(()=>parseQaProvenance('malformed'),/INVALID_PROVENANCE_LINE/);
console.log('PASS private NO-AI smoke self-report fixture + 25 fail-closed checks; R6 and release ALWAYS BLOCKED');
