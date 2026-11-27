/**
 * TuTop OWNER-LOCAL private QA signing path. Does NOT upload a key, deploy
 * Firebase, publish an APK, or establish physical R6/release readiness.
 * Input APK provenance is owner-observed, not a reproducible-build attestation.
 * Requires exact clean git HEAD and explicit owner approval at execution.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { extractApkSignerDigest } from './apksigner-certificate-digest.mjs';

const PROJECT = 'tutop-beta-vicmdlb-1356585881';
const PACKAGE = 'mx.tutop.app';
const VERSION = '0.9.2-beta.0';
const ACK = 'LOCAL_OWNER_SIGN_ENCRYPT_PRIVATE_QA';
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const AGE_RECIPIENT = /^age1[a-z0-9]{40,}$/;
const ALIAS = /^[a-z0-9][a-z0-9._-]{4,79}$/;
const MAX_APK = 200 * 1024 * 1024;
const HASH = data => crypto.createHash('sha256').update(data).digest('hex');

export function validateLocalQaIntent({ sourceSha, signerSha256, ageRecipient, alias }) {
  if (typeof sourceSha !== 'string' || !SHA40.test(sourceSha))
    throw Error('LOCAL_QA_SOURCE_SHA_INVALID');
  if (typeof signerSha256 !== 'string' || !SHA256.test(signerSha256))
    throw Error('LOCAL_QA_SIGNER_CERT_INVALID');
  if (typeof ageRecipient !== 'string' || !AGE_RECIPIENT.test(ageRecipient))
    throw Error('LOCAL_QA_AGE_RECIPIENT_INVALID');
  if (typeof alias !== 'string' || !ALIAS.test(alias) || alias === 'androiddebugkey')
    throw Error('LOCAL_QA_DEBUG_OR_INVALID_SIGNING_ALIAS');
  return { source_sha:sourceSha, expected_cert_sha256:signerSha256,
    age_public_recipient:ageRecipient, alias };
}

export function formatLocalQaProvenance(intent, signedApkSha256) {
  if (!intent || !SHA40.test(intent.source_sha)
      || !SHA256.test(intent.expected_cert_sha256)
      || !SHA256.test(signedApkSha256))
    throw Error('LOCAL_QA_PROVENANCE_INVALID');
  return [
    'source_sha='+intent.source_sha, 'package='+PACKAGE, 'version='+VERSION,
    'firebase_project='+PROJECT, 'qa_signed_apk_sha256='+signedApkSha256,
    'qa_certificate_sha256='+intent.expected_cert_sha256,
    'encryption=age-public-recipient', 'release_ready=false',
    'device_a_b_passed=false',
  ].join('\n')+'\n';
}

// Owner-observed input bytes, not an independent build attestation.
export function validateLocalQaInputDigest(expected, actual) {
  if (typeof expected !== 'string' || !SHA256.test(expected) ||
      typeof actual !== 'string' || !SHA256.test(actual) || expected !== actual)
    throw Error('LOCAL_QA_INPUT_APK_DIGEST_MISMATCH');
  return actual;
}
export function localQaCandidateDirectory(root, sourceSha) {
  if (typeof root !== 'string' || !path.isAbsolute(root) ||
      typeof sourceSha !== 'string' || !SHA40.test(sourceSha))
    throw Error('LOCAL_QA_CANDIDATE_DIRECTORY_INVALID');
  return path.join(root, 'qa-output', sourceSha);
}
function required(name) {
  const v = process.env[name];
  if (typeof v !== 'string' || !v.trim()) throw Error('LOCAL_QA_REQUIRED_SETTING_MISSING');
  return v.trim();
}
function requireFile(name) {
  const pathname = path.resolve(required(name));
  const stat = fs.lstatSync(pathname);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0)
    throw Error('LOCAL_QA_REQUIRED_FILE_INVALID');
  return pathname;
}
function run(bin,args,timeout=180000) {
  const r=spawnSync(bin,args,{encoding:'utf8',windowsHide:true,
    stdio:['ignore','pipe','pipe'],shell:false,maxBuffer:1024*1024,timeout});
  // Intentionally never print stdout/stderr/error: arguments and paths
  // may expose private material in tool diagnostics.
  if (r.error || r.status !== 0) throw Error('LOCAL_QA_TOOL_FAILED');
  return r.stdout;
}
function verifyPackage(aapt2, apk) {
  const x=run(aapt2,['dump','badging',apk]);
  const m=/(?:^|\n)package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'/.exec(x);
  if (!m || m[1] !== PACKAGE || m[2] !== '90200' || m[3] !== VERSION)
    throw Error('LOCAL_QA_PACKAGE_VERSION_MISMATCH');
}
export function validateOwnerPublicManifest(m, intent) {
  const expectedCert = String(intent?.expected_cert_sha256 || '').toLowerCase();
  const expectedAge = String(intent?.age_public_recipient || '');
  const expectedAlias = String(intent?.alias || '');
  const keystoreHash = String(m?.qa_keystore_sha256 || '').toLowerCase();
  // The owner's 2026-11-16 public manifest uses qa_cert_sha256, not
  // certificate_sha256. Both cert and original .p12 hash are public digests.
  if (!m || Array.isArray(m) || typeof m !== 'object'
      || m.schema !== 'tutop.qa.public-provenance.v1'
      || m.package !== PACKAGE
      || !SHA256.test(expectedCert) || !AGE_RECIPIENT.test(expectedAge)
      || !ALIAS.test(expectedAlias) || !SHA256.test(keystoreHash)
      || String(m.qa_cert_sha256 || '').toLowerCase() !== expectedCert
      || m.age_public_recipient !== expectedAge
      || m.signing_alias !== expectedAlias)
    throw Error('LOCAL_QA_PUBLIC_MANIFEST_MISMATCH');
  return { qa_keystore_sha256: keystoreHash };
}
function validateOwnerManifest(filename,intent) {
  const raw=fs.readFileSync(filename,'utf8');
  if (raw.length>65536) throw Error('LOCAL_QA_PUBLIC_MANIFEST_INVALID');
  return validateOwnerPublicManifest(JSON.parse(raw),intent);
}
function secureOutputRoot(sourceSha) {
  const dir=path.resolve(required('TUTOP_QA_PRIVATE_DIR'));
  const st=fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) throw Error('LOCAL_QA_PRIVATE_DIRECTORY_INVALID');
  // The owner must verify this directory has private ACLs, not synced storage.
  const out=path.join(dir,'qa-output');
  fs.mkdirSync(out,{recursive:true,mode:0o700});
  const st2=fs.lstatSync(out);
  if (!st2.isDirectory() || st2.isSymbolicLink()) throw Error('LOCAL_QA_OUTPUT_DIRECTORY_INVALID');
  return {dir,out:localQaCandidateDirectory(dir,sourceSha)};
}
function execute() {
  if (process.env.TUTOP_LOCAL_QA_ACK !== ACK) throw Error('LOCAL_QA_EXPLICIT_ACK_REQUIRED');
  const intent=validateLocalQaIntent({
    sourceSha:required('TUTOP_QA_SOURCE_SHA').toLowerCase(),
    signerSha256:required('TUTOP_QA_EXPECTED_CERT_SHA256').replace(/:/g,'').toLowerCase(),
    ageRecipient:required('TUTOP_QA_AGE_RECIPIENT'),
    alias:required('TUTOP_QA_KEY_ALIAS').toLowerCase(),
  });
  const exactHead=run('git',['rev-parse','HEAD']).trim().toLowerCase();
  if (exactHead!==intent.source_sha || run('git',['status','--porcelain']).trim())
    throw Error('LOCAL_QA_SOURCE_DIRTY_OR_MISMATCH');
  const publicManifest=validateOwnerManifest(requireFile('TUTOP_QA_PUBLIC_MANIFEST_PATH'),intent);
  const input=requireFile('TUTOP_QA_INPUT_APK');
  if (fs.statSync(input).size>MAX_APK) throw Error('LOCAL_QA_APK_TOO_LARGE');
  const inputHash=validateLocalQaInputDigest(required('TUTOP_QA_INPUT_APK_SHA256').toLowerCase(), HASH(fs.readFileSync(input)));
  const keystore=requireFile('TUTOP_QA_KEYSTORE_PATH');
  if (HASH(fs.readFileSync(keystore)) !== publicManifest.qa_keystore_sha256)
    throw Error('LOCAL_QA_KEYSTORE_DIGEST_MISMATCH');
  const ageIdentity=requireFile('TUTOP_QA_AGE_IDENTITY_PATH');
  const java=requireFile('TUTOP_QA_JAVA_BIN');
  const signerJar=requireFile('TUTOP_QA_APKSIGNER_JAR');
  const aapt2=requireFile('TUTOP_QA_AAPT2_BIN');
  const age=requireFile('TUTOP_QA_AGE_BIN');
  const ageKeygen=requireFile('TUTOP_QA_AGE_KEYGEN_BIN');
  required('TUTOP_QA_JKS_PASSWORD');
  required('TUTOP_QA_KEY_PASSWORD');
  if (run(ageKeygen,['-y',ageIdentity]).trim()!==intent.age_public_recipient)
    throw Error('LOCAL_QA_OWNER_AGE_IDENTITY_MISMATCH');
  verifyPackage(aapt2,input);
  const {dir,out}=secureOutputRoot(intent.source_sha);
  const destination=path.join(out,'TuTop-Private-QA.apk.age');
  const prov=path.join(out,'TuTop-Private-QA.provenance.txt');
  if (fs.existsSync(out)||fs.existsSync(destination)||fs.existsSync(prov))
    throw Error('LOCAL_QA_REFUSE_OVERWRITE');
  const temporary=fs.mkdtempSync(path.join(dir,'.qa-candidate-'));
  const snapshot=path.join(temporary,'qa-input.apk');
  const signed=path.join(temporary,'qa-signed.apk');
  const encrypted=path.join(temporary,'qa.apk.age');
  const decrypted=path.join(temporary,'qa-decrypted.apk');
  try {
    // Sign only a private snapshot matching the independently supplied digest.
    fs.copyFileSync(input,snapshot,fs.constants.COPYFILE_EXCL);
    if (fs.statSync(snapshot).size>MAX_APK) throw Error('LOCAL_QA_APK_TOO_LARGE');
    validateLocalQaInputDigest(inputHash,HASH(fs.readFileSync(snapshot)));
    verifyPackage(aapt2,snapshot);
    const apksigner=['-jar',signerJar];
    run(java,[...apksigner,'sign','--ks',keystore,
      '--ks-key-alias',intent.alias,'--ks-pass','env:TUTOP_QA_JKS_PASSWORD',
      '--key-pass','env:TUTOP_QA_KEY_PASSWORD','--out',signed,snapshot]);
    verifyPackage(aapt2,signed);
    const certOutput=run(java,[...apksigner,'verify','--print-certs',signed]);
    const cert=extractApkSignerDigest(certOutput,'SHA-256',64).toLowerCase();
    if (cert!==intent.expected_cert_sha256)
      throw Error('LOCAL_QA_SIGNER_MISMATCH');
    const signedHash=HASH(fs.readFileSync(signed));
    run(age,['-e','-r',intent.age_public_recipient,'-o',encrypted,signed]);
    run(age,['-d','-i',ageIdentity,'-o',decrypted,encrypted]);
    if (HASH(fs.readFileSync(decrypted))!==signedHash)
      throw Error('LOCAL_QA_OWNER_DECRYPTION_MISMATCH');
    const provenance=formatLocalQaProvenance(intent,signedHash);
    // Exclusively reserve a SHA-specific output directory. Preserve old
    // archives and any incomplete result; never overwrite or auto-delete it.
    if (fs.existsSync(out)) throw Error('LOCAL_QA_REFUSE_OVERWRITE');
    fs.mkdirSync(out,{mode:0o700});
    fs.copyFileSync(encrypted,destination,fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(prov,provenance,{flag:'wx',mode:0o600});
    validateLocalQaInputDigest(HASH(fs.readFileSync(encrypted)),HASH(fs.readFileSync(destination)));
    if (fs.readFileSync(prov,'utf8')!==provenance) throw Error('LOCAL_QA_OUTPUT_READBACK_MISMATCH');
    console.log(JSON.stringify({status:'PRIVATE_QA_ENCRYPTED_OWNER_RECOVERY_PASS',
      scope:'LOCAL_OWNER_ONLY_NO_FIREBASE_NO_RELEASE',source_sha:intent.source_sha,
      qa_signed_apk_sha256:signedHash,qa_certificate_sha256:cert,
      input_apk_sha256:inputHash,
      age_public_recipient:intent.age_public_recipient,
      ciphertext_sha256:HASH(fs.readFileSync(destination)),
      release_blocked:true,r6_release_blocked:true}));
  } finally {
    // Ephemeral plaintext never leaves the owner's private folder.
    fs.rmSync(temporary,{recursive:true,force:true});
  }
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {execute();}
  catch (e) {
    const safeCodes=new Set([
      'LOCAL_QA_EXPLICIT_ACK_REQUIRED','LOCAL_QA_SOURCE_DIRTY_OR_MISMATCH',
      'LOCAL_QA_PUBLIC_MANIFEST_MISMATCH','LOCAL_QA_KEYSTORE_DIGEST_MISMATCH',
      'LOCAL_QA_OWNER_AGE_IDENTITY_MISMATCH',
      'LOCAL_QA_SIGNER_MISMATCH','LOCAL_QA_OWNER_DECRYPTION_MISMATCH',
      'LOCAL_QA_PACKAGE_VERSION_MISMATCH','LOCAL_QA_REFUSE_OVERWRITE',
      'LOCAL_QA_INPUT_APK_DIGEST_MISMATCH','LOCAL_QA_OUTPUT_READBACK_MISMATCH',
      'LOCAL_QA_CANDIDATE_DIRECTORY_INVALID','LOCAL_QA_TOOL_FAILED',
    ]);
    console.error(safeCodes.has(e?.message)?e.message:'LOCAL_QA_BLOCKED_REDACTED');
    process.exitCode=2;
  }
}
