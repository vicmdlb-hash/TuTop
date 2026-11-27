import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { validateLocalQaIntent, formatLocalQaProvenance, validateOwnerPublicManifest, validateLocalQaInputDigest, localQaCandidateDirectory } from './local-private-qa-sign-encrypt.mjs';
import { parseQaProvenance, assessPrivateNoAiSmoke } from './private-qa-no-ai-smoke-gate.mjs';

const good={
 sourceSha:'a'.repeat(40),signerSha256:'8cdc55f2178668f606ac46fc40b49ff418d80128710ba61b5064fa00d81efa79',
 ageRecipient:'age1zqk5errpgfx9f2gkt8q2ptw393yw8fue6gq7f067ltek54hhzp3sje2v9p',
 alias:'tutop-qa-private-20261116'
};
const intent=validateLocalQaIntent(good);
const inputHash='a'.repeat(64);
assert.equal(validateLocalQaInputDigest(inputHash,inputHash),inputHash);
for (const [expected,actual] of [[inputHash,'b'.repeat(64)],['invalid',inputHash],[null,inputHash],[inputHash,null]]) {
  assert.throws(()=>validateLocalQaInputDigest(expected,actual),/LOCAL_QA_INPUT_APK_DIGEST_MISMATCH/);
}
const privateRoot=path.resolve('synthetic-private-root');
assert.equal(localQaCandidateDirectory(privateRoot,good.sourceSha),path.join(privateRoot,'qa-output',good.sourceSha));
assert.notEqual(localQaCandidateDirectory(privateRoot,good.sourceSha),localQaCandidateDirectory(privateRoot,'b'.repeat(40)));
assert.throws(()=>localQaCandidateDirectory(privateRoot,'../escape'),/LOCAL_QA_CANDIDATE_DIRECTORY_INVALID/);
assert.throws(()=>localQaCandidateDirectory('relative',good.sourceSha),/LOCAL_QA_CANDIDATE_DIRECTORY_INVALID/);

const canonicalPublic = {
  schema:'tutop.qa.public-provenance.v1',package:'mx.tutop.app',
  qa_cert_sha256:good.signerSha256,qa_keystore_sha256:'c'.repeat(64),
  age_public_recipient:good.ageRecipient,signing_alias:good.alias
};
assert.deepEqual(validateOwnerPublicManifest(canonicalPublic,intent),
  {qa_keystore_sha256:'c'.repeat(64)});
for (const bad of [
  {...canonicalPublic,schema:'wrong'},
  {...canonicalPublic,package:'mx.other.app'},
  {...canonicalPublic,qa_cert_sha256:'d'.repeat(64)},
  {...canonicalPublic,qa_keystore_sha256:'invalid'},
  {...canonicalPublic,age_public_recipient:'age1different'},
  {...canonicalPublic,signing_alias:'androiddebugkey'},
  {...canonicalPublic,qa_cert_sha256:undefined,certificate_sha256:good.signerSha256},
]) assert.throws(()=>validateOwnerPublicManifest(bad,intent),
  /LOCAL_QA_PUBLIC_MANIFEST_MISMATCH/);

const p=parseQaProvenance(formatLocalQaProvenance(intent,'b'.repeat(64)));
assert.equal(p.source_sha,good.sourceSha);
assert.equal(p.qa_certificate_sha256,good.signerSha256);
assert.equal(p.qa_signed_apk_sha256,'b'.repeat(64));
assert.equal(p.package,'mx.tutop.app');
assert.equal(p.version,'0.9.2-beta.0');
assert.equal(p.firebase_project,'tutop-beta-vicmdlb-1356585881');
assert.equal(p.encryption,'age-public-recipient');
assert.equal(p.release_ready,'false');
assert.equal(p.device_a_b_passed,'false');
assert.equal(assessPrivateNoAiSmoke(p,{},Date.now()).release_blocked,true);
for(const invalid of [
 {...good,sourceSha:'bad'}, {...good,signerSha256:'bad'},
 {...good,ageRecipient:'age1notvalid'}, {...good,alias:'androiddebugkey'},
 {...good,alias:'bad alias'}, {...good,sourceSha:null},
])assert.throws(()=>validateLocalQaIntent(invalid));
assert.throws(()=>formatLocalQaProvenance(intent,'invalid'),/LOCAL_QA_PROVENANCE_INVALID/);
const invocation=spawnSync(process.execPath,['scripts/local-private-qa-sign-encrypt.mjs'],
 {encoding:'utf8',cwd:process.cwd(),env:{PATH:process.env.PATH||''},timeout:15000});
assert.equal(invocation.status,2);
assert.equal(invocation.stdout,'');
assert.match(invocation.stderr,/LOCAL_QA_EXPLICIT_ACK_REQUIRED/);
assert(!invocation.stderr.includes('PRIVATE_QA_ENCRYPTED_OWNER_RECOVERY_PASS'));
const guardSource = (await import('node:fs')).readFileSync('scripts/local-private-qa-sign-encrypt.mjs','utf8');
assert.match(guardSource,/LOCAL_QA_KEYSTORE_DIGEST_MISMATCH/);
assert.match(guardSource,/LOCAL_QA_EXPLICIT_ACK_REQUIRED/);
assert.match(guardSource,/LOCAL_QA_REFUSE_OVERWRITE/);
for (const required of ['TUTOP_QA_INPUT_APK_SHA256','validateLocalQaInputDigest(inputHash,HASH(fs.readFileSync(snapshot)))',"'--out',signed,snapshot]",'fs.mkdirSync(out,{mode:0o700})','fs.copyFileSync(encrypted,destination,fs.constants.COPYFILE_EXCL)']) assert(guardSource.includes(required));
for (const forbidden of ['unlinkSync(destination)','unlinkSync(prov)','renameSync(encrypted,destination)']) assert(!guardSource.includes(forbidden));
console.log('PASS owner-local input digest and SHA-isolated output contract');
console.log('PASS owner-local private QA signer contract: fail-closed, same exact provenance, no remote secrets, R6 never self-authorized');
