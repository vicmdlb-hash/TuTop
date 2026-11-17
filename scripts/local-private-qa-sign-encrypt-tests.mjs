import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateLocalQaIntent, formatLocalQaProvenance } from './local-private-qa-sign-encrypt.mjs';
import { parseQaProvenance, assessPrivateNoAiSmoke } from './private-qa-no-ai-smoke-gate.mjs';

const good={
 sourceSha:'a'.repeat(40),signerSha256:'8cdc55f2178668f606ac46fc40b49ff418d80128710ba61b5064fa00d81efa79',
 ageRecipient:'age1zqk5errpgfx9f2gkt8q2ptw393yw8fue6gq7f067ltek54hhzp3sje2v9p',
 alias:'tutop-qa-private-20261116'
};
const intent=validateLocalQaIntent(good);
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
console.log('PASS owner-local private QA signer contract: fail-closed, same exact provenance, no remote secrets, R6 never self-authorized');
