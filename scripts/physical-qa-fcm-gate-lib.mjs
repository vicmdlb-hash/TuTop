import fs from 'node:fs';

export const PHYSICAL_QA_FCM_APPLY_ACK = 'SEND_ACTIVE_PHYSICAL_QA_SINGLE_DEVICE_FCM';
const MANIFEST_PATH='docs/PHYSICAL_QA_CANDIDATE_0.9.json';

function cleanSelector(value, label) {
  const clean = String(value || '').trim();
  if (!clean || clean.length > 180 || clean.includes('/')) throw new Error(`${label}_INVALID`);
  return clean;
}
function normalizeHex(value,length,label){
  const clean=String(value||'').replace(/:/g,'').toLowerCase();
  if(!new RegExp('^[0-9a-f]{'+length+'}$').test(clean)) throw new Error(label+'_INVALID');
  return clean;
}
function positiveInt(value,label){
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<=0) throw new Error(label+'_INVALID');
  return n;
}

export function loadActivePhysicalQaFcmAuthority(path=MANIFEST_PATH){
  const candidate=JSON.parse(fs.readFileSync(path,'utf8'));
  if(candidate?.schema!=='tutop.physical-qa-candidate.v1') throw new Error('FCM_CANDIDATE_SCHEMA_INVALID');
  if(candidate?.environment!=='staging') throw new Error('FCM_CANDIDATE_ENVIRONMENT_INVALID');
  if(candidate?.application_id!=='mx.tutop.app') throw new Error('FCM_CANDIDATE_PACKAGE_INVALID');
  if(candidate?.physical_release_candidate!==true
    || candidate?.candidate_status!=='active_exact_head'
    || candidate?.replacement_required!==false) throw new Error('FCM_ACTIVE_CANDIDATE_REQUIRED');
  const authority={
    sha:String(candidate.build_commit_sha||'').trim(),
    artifactId:positiveInt(candidate.artifact_id,'FCM_AUTHORITY_ARTIFACT_ID'),
    buildRunId:positiveInt(candidate.build_run_id,'FCM_AUTHORITY_BUILD_RUN_ID'),
    apkSha256:normalizeHex(candidate.apk_sha256,64,'FCM_AUTHORITY_APK_SHA256'),
    certSha256:normalizeHex(candidate.apk_cert_sha256,64,'FCM_AUTHORITY_CERT_SHA256'),
  };
  if(!/^[a-f0-9]{40}$/.test(authority.sha)) throw new Error('FCM_AUTHORITY_SHA_INVALID');
  return authority;
}

export function validatePhysicalQaFcmApplyGate({
  apply,
  maintenanceAllow,
  ack,
  candidateSha,
  candidateArtifactId,
  candidateBuildRunId,
  candidateApkSha256,
  candidateCertSha256,
  notificationId,
  recipientUid,
  deviceTokenRecordId,
}, authority=loadActivePhysicalQaFcmAuthority()) {
  if (!apply) {
    return {pass:true,mode:'DRY_RUN',notificationId:'',recipientUid:'',deviceTokenRecordId:'',authority};
  }
  try {
    if(String(maintenanceAllow||'').trim()!=='staging-v2') return {pass:false,error:'FCM_APPLY_REQUIRES_STAGING_V2'};
    if(String(ack||'').trim()!==PHYSICAL_QA_FCM_APPLY_ACK) return {pass:false,error:'FCM_APPLY_ACK_MISMATCH'};
    if(String(candidateSha||'').trim()!==authority.sha) return {pass:false,error:'FCM_APPLY_CANDIDATE_SHA_MISMATCH'};
    if(positiveInt(candidateArtifactId,'FCM_ARTIFACT_ID')!==authority.artifactId) return {pass:false,error:'FCM_APPLY_ARTIFACT_ID_MISMATCH'};
    if(positiveInt(candidateBuildRunId,'FCM_BUILD_RUN_ID')!==authority.buildRunId) return {pass:false,error:'FCM_APPLY_BUILD_RUN_ID_MISMATCH'};
    if(normalizeHex(candidateApkSha256,64,'FCM_APK_SHA256')!==authority.apkSha256) return {pass:false,error:'FCM_APPLY_APK_SHA256_MISMATCH'};
    if(normalizeHex(candidateCertSha256,64,'FCM_CERT_SHA256')!==authority.certSha256) return {pass:false,error:'FCM_APPLY_CERT_SHA256_MISMATCH'};
    return {
      pass:true,mode:'APPLY',authority,
      notificationId:cleanSelector(notificationId,'FCM_NOTIFICATION_ID'),
      recipientUid:cleanSelector(recipientUid,'FCM_RECIPIENT_UID'),
      deviceTokenRecordId:cleanSelector(deviceTokenRecordId,'FCM_DEVICE_TOKEN_RECORD_ID'),
    };
  } catch(error) {
    return {pass:false,error:error instanceof Error?error.message:'FCM_APPLY_SELECTOR_INVALID'};
  }
}

export function selectExactPhysicalNotification(pending, notificationId, recipientUid) {
  const matches=(pending||[]).filter((item)=>String(item?.id||'')===notificationId&&String(item?.recipient_uid||'')===recipientUid);
  if(matches.length!==1) throw new Error(`FCM_EXACT_NOTIFICATION_REQUIRED:${matches.length}`);
  return matches[0];
}
export function selectExactPhysicalTarget(targets, deviceTokenRecordId) {
  const matches=(targets||[]).filter((target)=>String(target?.id||'')===deviceTokenRecordId);
  if(matches.length!==1) throw new Error(`FCM_EXACT_DEVICE_TOKEN_RECORD_REQUIRED:${matches.length}`);
  return matches[0];
}
