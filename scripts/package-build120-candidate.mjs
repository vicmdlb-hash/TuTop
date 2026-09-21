import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(sha!==process.env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(sha))throw new Error('EXACT_SHA_REQUIRED');

const apk='android/app/build/outputs/apk/debug/app-debug.apk';
if(!fs.existsSync(apk))throw new Error('APK_MISSING');
const bytes=fs.readFileSync(apk);
const hash=crypto.createHash('sha256').update(bytes).digest('hex');
const expectedHash=String(process.env.TUTOP_BUILD120_APK_SHA256||'').trim().toLowerCase();
if(expectedHash&&hash!==expectedHash)throw new Error('APK_SHA256_ENV_MISMATCH');

const cert=String(process.env.TUTOP_BUILD120_CERT_SHA1||'').replace(/:/g,'').trim().toUpperCase();
if(!/^[0-9A-F]{40}$/.test(cert))throw new Error('BUILD120_CERT_SHA1_REQUIRED');

const bindingPath='staging-readiness/build120-native-key-binding.json';
const rulesPath='staging-readiness/build120-rules-readback.json';
if(!fs.existsSync(bindingPath))throw new Error('BUILD120_STAGING_BINDING_EVIDENCE_MISSING');
if(!fs.existsSync(rulesPath))throw new Error('BUILD120_RULES_READBACK_EVIDENCE_MISSING');
const binding=JSON.parse(fs.readFileSync(bindingPath,'utf8'));
const rules=JSON.parse(fs.readFileSync(rulesPath,'utf8'));
if(binding.status!=='PASS'||binding.exact_build120_app_allowed!==true||binding.build120_apk_sha256!==hash||binding.exact_apk_cert_sha1!==cert)throw new Error('BUILD120_STAGING_BINDING_EVIDENCE_MISMATCH');
if(rules.status!=='PASS'||rules.whitespace_comment_normalized_equal!==true||rules.national_requires_shipping!==false||rules.explicit_delivery_required!==true)throw new Error('BUILD120_RULES_READBACK_EVIDENCE_MISMATCH');

const directory='engineering-candidate';
fs.mkdirSync(directory,{recursive:true});
const name='TuTop-build120-'+sha.slice(0,12)+'-deviceA-publication-repair-staging.apk';
fs.copyFileSync(apk,directory+'/'+name);
fs.writeFileSync(directory+'/'+name+'.sha256',hash+'  '+name+'\n');

const manifest={
  candidate:'build120-deviceA-publication-repair',
  source_sha:sha,
  repair_base_sha:'95b81de8e820b04a5a6c21a86cce3e15c16bd460',
  predecessor_build119_sha:'90b2f1806b83aad2d9b67a5cde791eec8b3c9b82',
  predecessor_physical_authority:'BUILD118_DEVICE_A_PARTIAL_FAIL',
  apk:name,
  apk_sha256:hash,
  apk_cert_sha1:cert,
  android_version_code:90214,
  beta_version:'0.9.2-beta.10',
  physical_failures_targeted:[
    'REACT_HOOK_ORDER_PHYSICAL_FAIL',
    'TOPI_NATIVE_AI_PHYSICAL_FAIL',
    'NOTIFICATION_ACTIVATION_PHYSICAL_FAIL',
    'BUILD119_NATIONAL_PUBLICATION_POLICY_DEFECT',
  ],
  build120_repairs:[
    'ProductDetail_hooks_unconditional_before_null_guard',
    'Topi_real_Firebase_AI_bounded_retry_and_safe_failure_classification',
    'exact_Build120_package_certificate_allowed_on_staging_Firebase_API_key',
    'notification_permission_token_ownership_delivery_truth_split',
    'FCM_token_failure_reason_and_retry_UI',
    'national_visibility_decoupled_from_shipping_in_UI_and_canonical_backend',
    'explicit_delivery_method_still_required',
    'final_Rules_semantically_equal_to_active_staging_no_deploy_required',
  ],
  staging_native_key_binding:{
    exact_build120_app_allowed:true,
    api_targets_preserved:true,
    mutation_required:Boolean(binding.mutated),
  },
  staging_rules:{
    semantic_readback_pass:true,
    active_ruleset:rules.active_ruleset,
    deploy_required:false,
  },
  physical_evidence:'NOT_TESTED',
  publication_result:'UNKNOWN_UNTIL_DEVICE_RETEST',
  spend:0,
  real_fcm_sent:false,
  play_or_production_release:false,
  status:'ENGINEERING_CANDIDATE_AWAITING_DEVICE_A_RETEST',
};
fs.writeFileSync(directory+'/provenance.json',JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync(bindingPath,directory+'/staging-native-key-binding.json');
fs.copyFileSync(rulesPath,directory+'/staging-rules-readback.json');
console.log(JSON.stringify({source_sha:sha,apk:name,apk_sha256:hash,apk_cert_sha1:cert,status:manifest.status}));
