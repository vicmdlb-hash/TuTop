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
const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
function canonicalUtcNanoKey(timestamp) {
  // Firestore updateTime can contain nine decimal digits. Date.parse only
  // preserves milliseconds, which is insufficient for proof chronology.
  const ms = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
  if (typeof timestamp !== 'string' || !utcTimestamp.test(timestamp)
    || !Number.isFinite(ms)
    || new Date(ms).toISOString().slice(0, 19) !== timestamp.slice(0, 19)) {
    throw Error('ERASURE_ATOMIC_UPDATE_TIME_REQUIRED');
  }
  const dot = timestamp.indexOf('.');
  const nanos = dot < 0 ? '000000000' : timestamp.slice(dot + 1, -1).padEnd(9, '0');
  return timestamp.slice(0, 19) + '.' + nanos;
}

export function buildAccountErasureFinalCommit({projectId,uid,processorRunId,requestUpdateTime,completed,audit}) {
  if(projectId!==PROJECT) throw Error('ERASURE_ATOMIC_STAGING_ONLY');
  if(!safeId(uid,8)||!safeId(processorRunId)) throw Error('ERASURE_ATOMIC_ID_INVALID');
  const requestNanoKey = canonicalUtcNanoKey(requestUpdateTime);
  // A completion timestamp cannot predate the request generation it finalizes.
  // Treat inconsistent audit timestamps as contradictory proof, never success.
  const requestUpdatedMs = Date.parse(requestUpdateTime);
  if(!completed||completed.status!=='completed'||completed.auth_deleted!==true
    ||completed.processor_run_id!==processorRunId
    ||!(completed.completed_at instanceof Date)||Number.isNaN(completed.completed_at.getTime())
    ||completed.completed_at.getTime()<requestUpdatedMs
    ||canonicalUtcNanoKey(completed.completed_at.toISOString())<requestNanoKey
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


/**
 * SOURCE-ONLY READ PLAN; never a Firestore REST Write or authorization.
 * Firestore v1 Write supports update/delete/transform, NOT verify.
 * A future trusted writer must read every participant's deletion request
 * INSIDE the same read-write transaction that commits commerce changes.
 * Caller-provided snapshots and this pure model cannot prove atomicity.
 * No trusted-writer wiring, staging apply, or deployment is authorized.
 *
 * requestSnapshots are synthetic, caller-attested inputs. null represents
 * a confirmed missing document (not a network error); a rejected request
 * includes its exact updateTime for model comparisons.
 * https://firebase.google.com/docs/firestore/reference/rest/v1/Write
 */
export function buildSyntheticErasureAdmissionReadPlan({
  projectId, participants, requestSnapshots,
}) {
  if (projectId !== PROJECT) throw Error('ERASURE_ADMISSION_STAGING_ONLY');
  if (!Array.isArray(participants) || participants.length < 1
    || participants.length > 2 || participants.some(uid => !safeId(uid, 8))
    || new Set(participants).size !== participants.length) {
    throw Error('ERASURE_ADMISSION_PARTICIPANTS_INVALID');
  }
  if (!Array.isArray(requestSnapshots) || requestSnapshots.length !== participants.length) {
    throw Error('ERASURE_ADMISSION_SNAPSHOTS_INVALID');
  }
  const snapshots = new Map();
  for (const row of requestSnapshots) {
    if (!row || !safeId(row.uid, 8) || snapshots.has(row.uid)
      || !Object.hasOwn(row, 'document')) throw Error('ERASURE_ADMISSION_SNAPSHOT_INVALID');
    snapshots.set(row.uid, row.document);
  }
  const root = `projects/${projectId}/databases/(default)/documents`;
  return participants.map(uid => {
    if (!snapshots.has(uid)) throw Error('ERASURE_ADMISSION_UID_NOT_READ');
    const document = snapshots.get(uid);
    const name = `${root}/account_deletion_requests/${uid}`;
    if (document === null) {
      return { kind: 'transaction_read', documentPath: name, expected: { exists: false } };
    }
    if (!document || typeof document !== 'object' || Array.isArray(document)
      || document.status !== 'rejected') throw Error('ERASURE_ADMISSION_NOT_ALLOWED');
    canonicalUtcNanoKey(document.updateTime);
    return { kind: 'transaction_read', documentPath: name, expected: { updateTime: document.updateTime } };
  });
}

/**
 * Fail closed for the historical prototype API. Firestore v1 REST Write has
 * no verify operation, so NEVER hand a fabricated witness to documents:commit.
 * Kept only to fail loudly if any future caller tries to reuse the old name.
 */
export function buildSyntheticErasureAdmissionVerifyWrites() {
  throw Error('ERASURE_ADMISSION_REST_VERIFY_UNSUPPORTED');
}
