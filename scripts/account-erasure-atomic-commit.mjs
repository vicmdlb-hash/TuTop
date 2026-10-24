// Pure, credential-free Firestore batch plan for account-erasure finalization.
// Firestore documents:commit applies all writes atomically.
const PROJECT = 'tutop-beta-vicmdlb-1356585881';
const safeId = (s, min=1) => typeof s === 'string' &&
  new RegExp('^[A-Za-z0-9_-]{' + min + ',128}$').test(s);
function encode(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return {timestampValue:v.toISOString()};
  if (typeof v==='string') return {stringValue:v};
  if (typeof v==='boolean') return {booleanValue:v};
  if (Number.isSafeInteger(v)) return {integerValue:String(v)};
  if (typeof v==='number' && Number.isFinite(v)) return {doubleValue:v};
  throw Error('ERASURE_ATOMIC_FIELD_TYPE_INVALID');
}
const fields = o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,encode(v)]));
export function buildAccountErasureFinalCommit({projectId,uid,processorRunId,requestUpdateTime,completed,audit}) {
  if(projectId!==PROJECT) throw Error('ERASURE_ATOMIC_STAGING_ONLY');
  if(!safeId(uid,8)||!safeId(processorRunId)) throw Error('ERASURE_ATOMIC_ID_INVALID');
  if(typeof requestUpdateTime!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(requestUpdateTime)
    ||!Number.isFinite(Date.parse(requestUpdateTime))) throw Error('ERASURE_ATOMIC_UPDATE_TIME_REQUIRED');
  // A completion timestamp cannot predate the request generation it finalizes.
  // Treat inconsistent audit timestamps as contradictory proof, never success.
  const requestUpdatedMs = Date.parse(requestUpdateTime);
  if(!completed||completed.status!=='completed'||completed.auth_deleted!==true
    ||completed.processor_run_id!==processorRunId
    ||!(completed.completed_at instanceof Date)||Number.isNaN(completed.completed_at.getTime())
    ||completed.completed_at.getTime()<requestUpdatedMs
    ||!(completed.updated_at instanceof Date)
    ||Number.isNaN(completed.updated_at.getTime())
    ||completed.updated_at.getTime()!==completed.completed_at.getTime()
    ||!completed.erasure_policy_version||!completed.residual_manifest_version
    ||!['deleted_count','withdrawn_count','retained_count'].every(k=>
      Number.isSafeInteger(completed[k])&&completed[k]>=0)) throw Error('ERASURE_ATOMIC_COMPLETION_PROOF_INVALID');
  if(!audit||audit.actor_type!=='trusted_runner'||audit.role!=='trust_safety'
    ||!safeId(audit.admin_uid)
    ||audit.action!=='account_erasure_completed'
    ||audit.target_type!=='account_deletion_request'||audit.target_id!==uid
    ||audit.processor_run_id!==processorRunId
    ||audit.residual_manifest_version!==completed.residual_manifest_version
    ||!(audit.created_at instanceof Date)
    ||audit.created_at.getTime()!==completed.completed_at.getTime())
      throw Error('ERASURE_ATOMIC_AUDIT_INVALID');
  const root=`projects/${projectId}/databases/(default)/documents`;
  return { writes:[
    {update:{name:`${root}/account_deletion_requests/${uid}`,fields:fields(completed)},
     updateMask:{fieldPaths:Object.keys(completed)},
     currentDocument:{updateTime:requestUpdateTime}},
    {update:{name:`${root}/audit_log/account-erasure-${uid}-${processorRunId}`,fields:fields(audit)},
     currentDocument:{exists:false}}
  ]};
}
