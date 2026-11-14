/**
 * PRIVATE one-device no-AI smoke, not R6. Observations are self-reported:
 * even a complete fixture NEVER unlocks physical release, App Check
 * enforcement, beta publication, or the two-device physical acceptance gate.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA40 = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const PROJECT = 'tutop-beta-vicmdlb-1356585881';
const PROVENANCE_KEYS = [
  'source_sha','package','version','firebase_project','qa_signed_apk_sha256',
  'qa_certificate_sha256','encryption','release_ready','device_a_b_passed',
];
export const PRIVATE_SMOKE_CASES = Object.freeze([
  'install_boot','auth_identity','account_switch_isolation','public_listing_gate',
  'offline_reconnect','android_back','safe_areas','app_check_token_observed',
  'remote_ai_disabled',
]);
const EVIDENCE_KEYS = [
  'schema','source_sha','apk_sha256','certificate_sha256','firebase_project',
  'remote_ai_enabled','observed_at','device','recovery','cases',
];
function isObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
    && Object.getPrototypeOf(x) === Object.prototype;
}
function exactKeys(x, allowed, where, errors) {
  if (!isObject(x)) { errors.push(where + ' must be an object'); return false; }
  // A user-provided JSON property name may contain an email, JWT, OTP or
  // device ID. Never echo an unknown key into an exportable QA verdict.
  for (const key of Object.keys(x)) if (!allowed.includes(key))
    errors.push(where + ' has an unrecognized field [redacted]');
  for (const key of allowed) if (!Object.hasOwn(x,key)) errors.push(where + '.' + key + ' missing');
  return true;
}
function validModel(x) {
  return typeof x === 'string' && x.length >= 2 && x.length <= 80
    && !/@|\r|\n|\b\d{10,17}\b|(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}|PENDIENTE|TODO|TBD/i.test(x);
}
export function parseQaProvenance(raw) {
  if (typeof raw !== 'string' || raw.length > 16384) throw Error('INVALID_PROVENANCE_SIZE');
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    const at = line.indexOf('=');
    if (at <= 0) throw Error('INVALID_PROVENANCE_LINE');
    const key = line.slice(0,at), value = line.slice(at+1);
    if (!PROVENANCE_KEYS.includes(key)) throw Error('UNEXPECTED_PROVENANCE_KEY');
    if (Object.hasOwn(data,key)) throw Error('DUPLICATE_PROVENANCE_KEY');
    if (!value || value.length > 150) throw Error('INVALID_PROVENANCE_VALUE');
    data[key]=value;
  }
  return data;
}
export function assessPrivateNoAiSmoke(p,e,now=Date.now()) {
  const errors=[];
  if (exactKeys(p, PROVENANCE_KEYS, 'provenance', errors)) {
    if (!SHA40.test(p.source_sha)) errors.push('source_sha invalid');
    if (!SHA256.test(p.qa_signed_apk_sha256)) errors.push('APK SHA-256 invalid');
    if (!SHA256.test(p.qa_certificate_sha256)) errors.push('signer SHA-256 invalid');
    if (p.package !== 'mx.tutop.app' || p.version !== '0.9.2-beta.0'
      || p.firebase_project !== PROJECT) errors.push('wrong package/version/staging');
    if (p.encryption !== 'age-public-recipient') errors.push('age encryption is required');
    if (p.release_ready !== 'false' || p.device_a_b_passed !== 'false') errors.push('fake release/physical success');
  }
  if (exactKeys(e,EVIDENCE_KEYS,'evidence',errors)) {
    if (e.schema !== 'tutop.private-smoke-no-ai.v1') errors.push('wrong schema');
    if (e.source_sha !== p.source_sha) errors.push('wrong source SHA');
    if (!SHA256.test(e.apk_sha256) || e.apk_sha256 !== p.qa_signed_apk_sha256) errors.push('wrong decrypted APK SHA');
    if (!SHA256.test(e.certificate_sha256) || e.certificate_sha256 !== p.qa_certificate_sha256) errors.push('wrong QA signer');
    if (e.firebase_project !== PROJECT) errors.push('not staging');
    if (e.remote_ai_enabled !== false) errors.push('remote AI must be OFF');
    const at=typeof e.observed_at === 'string' ? Date.parse(e.observed_at) : NaN;
    if (!Number.isFinite(at) || !Number.isFinite(now)
      || at > now + 300000 || now - at > 86400000) errors.push('device observation missing/stale/future');
    if (exactKeys(e.device,['physical','manufacturer','model','android_version','installation'],'device',errors)) {
      if (e.device.physical !== true) errors.push('real Android device evidence required');
      for (const field of ['manufacturer','model','android_version'])
        if (!validModel(e.device[field])) errors.push('invalid/nonprivate device.'+field);
      if (!['clean','reinstall','upgrade'].includes(e.device.installation)) errors.push('invalid installation');
    }
    if (exactKeys(e.recovery,['owner_age_decryption_verified','decrypted_apk_sha256','certificate_sha256'],'recovery',errors)) {
      if (e.recovery.owner_age_decryption_verified !== true
        || e.recovery.decrypted_apk_sha256 !== p.qa_signed_apk_sha256
        || e.recovery.certificate_sha256 !== p.qa_certificate_sha256) errors.push('owner decrypted APK / signer unverified');
    }
    if (exactKeys(e.cases,[...PRIVATE_SMOKE_CASES,'topi_real_ai'],'cases',errors)) {
      for(const key of PRIVATE_SMOKE_CASES) if(e.cases[key]!=='pass') errors.push('observed case '+key+' not PASS');
      if(e.cases.topi_real_ai!=='not_applicable') errors.push('remote Topi real AI cannot be PASS in no-AI private QA');
    }
  }
  return {
    scope:'PRIVATE_NO_AI_SINGLE_DEVICE_SELF_REPORTED',
    status:errors.length?'BLOCKED':'EVIDENCE_COMPLETE_SELF_REPORTED',
    private_smoke_evidence_complete:errors.length===0,
    r6_release_blocked:true,
    release_blocked:true,
    errors,
  };
}
function main() {
  const args=process.argv.slice(2).filter(x=>!x.startsWith('--'));
  if(args.length!==2){console.error('Usage: node scripts/private-qa-no-ai-smoke-gate.mjs <provenance.txt> <evidence.json> [--json]');process.exitCode=2;return;}
  let result;
  try{
    const raw=fs.readFileSync(args[0],'utf8');
    const evidenceBytes=fs.readFileSync(args[1]);
    if(evidenceBytes.length>65536) throw Error('EVIDENCE_TOO_LARGE');
    result=assessPrivateNoAiSmoke(parseQaProvenance(raw),JSON.parse(evidenceBytes.toString('utf8')));
  }catch{
    // JSON.parse and filesystem exceptions may include raw document fragments,
    // attacker-controlled paths or values. Keep only a fixed failure category.
    result={scope:'PRIVATE_NO_AI_SINGLE_DEVICE_SELF_REPORTED',status:'BLOCKED',
      private_smoke_evidence_complete:false,r6_release_blocked:true,
      release_blocked:true,errors:['PRIVATE_SMOKE_INPUT_INVALID']};
  }
  console.log(process.argv.includes('--json')?JSON.stringify(result,null,2):result.status+'; R6/RELEASE ALWAYS BLOCKED\n'+result.errors.join('\n'));
  if(!result.private_smoke_evidence_complete)process.exitCode=2;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main();
