import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { fcmDataForNotification } from './fcm-payload-lib.mjs';
import { shouldSuppressBlockedDirectNotification } from './user-block-notification-lib.mjs';
import { eligibleRecipientTargets, isPermanentFcmTokenError, supersededActiveTokenRecords, assertCompleteFcmInventory, fcmTokenCleanupPrecondition } from './fcm-token-ownership-lib.mjs';
import { validatePhysicalQaFcmApplyGate, selectExactPhysicalNotification, selectExactPhysicalTarget } from './physical-qa-fcm-gate-lib.mjs';
import { planFcmOutboxClaim, attachCommittedFcmClaim, planFcmOutboxCompletion } from './fcm-outbox-attempt-lib.mjs';

const STAGING_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const apply = process.argv.includes('--apply');
const allow = String(process.env.TUTOP_ALLOW_V2_MAINTENANCE || '').trim();
// A malformed bound must not silently disable query completeness checks.
const limit = Number(process.env.TUTOP_POST110_FCM_LIMIT ?? 300);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
  throw new Error('FCM_QUERY_LIMIT_INVALID');
}
const applyGate = validatePhysicalQaFcmApplyGate({
  apply,
  maintenanceAllow: allow,
  ack: process.env.TUTOP_FCM_PHYSICAL_APPLY_ACK,
  candidateSha: process.env.TUTOP_FCM_PHYSICAL_CANDIDATE_SHA,
  candidateArtifactId: process.env.TUTOP_FCM_PHYSICAL_CANDIDATE_ARTIFACT_ID,
  candidateBuildRunId: process.env.TUTOP_FCM_PHYSICAL_CANDIDATE_BUILD_RUN_ID,
  candidateApkSha256: process.env.TUTOP_FCM_PHYSICAL_CANDIDATE_APK_SHA256,
  candidateCertSha256: process.env.TUTOP_FCM_PHYSICAL_CANDIDATE_CERT_SHA256,
  notificationId: process.env.TUTOP_FCM_PHYSICAL_NOTIFICATION_ID,
  recipientUid: process.env.TUTOP_FCM_PHYSICAL_RECIPIENT_UID,
  deviceTokenRecordId: process.env.TUTOP_FCM_PHYSICAL_DEVICE_TOKEN_RECORD_ID,
});

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (projectId !== STAGING_PROJECT) stop(`post110 FCM sender requiere ${STAGING_PROJECT}.`);
if (!applyGate.pass) stop(applyGate.error);

const token = await firebaseCiAccessToken();
const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;

function decodeValue(value = {}) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return undefined;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function encodeValue(value, key = '') {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') {
    if (/_at$|^updated_at$|^created_at$|^sent_at$/.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return { timestampValue: value };
    return { stringValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => encodeValue(item)) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}

function encodeFields(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encodeValue(value, key)]));
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  // Backend errors can include sensitive device identifiers: emit status only.
  if (!response.ok) throw new Error(`FCM_STAGING_REQUEST_HTTP_${response.status}`);
  return data;
}

async function query(collectionId) {
  const rows = await request(`${base}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], limit } }),
  });
  // Reject a full/ambiguous single page before selecting a token owner.
  // Do not report a partial inventory as complete and send to a stale UID.
  return assertCompleteFcmInventory(rows, limit, collectionId).map((row) => ({
    id: row.document.name.split('/').pop(),
    ...decodeFields(row.document.fields || {}),
    // Metadata from the SAME Firestore response, not an app-written field.
    _document_update_time: row.document.updateTime,
  }));
}

async function documentOrNull(path) {
  const uri = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${base}/${uri}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`BLOCK_CHECK_FAILED:${response.status}`);
  const result = await response.json();
  return { id: String(result.name || '').split('/').pop(), ...decodeFields(result.fields || {}) };
}

const blockChatCache = new Map();
async function hasUserBlockEdge(fromUid, toUid) {
  // Read again for each pending direct notice; an earlier negative can expire.
  return Boolean(await documentOrNull(`user_blocks/${fromUid}/targets/${toUid}`));
}

async function blockedDirectOutbox(item) {
  if (!['new_message','offer_received','counter_offer','offer_accepted'].includes(item.kind)) return false;
  const chatId = String(item.chat_id || '');
  if (!blockChatCache.has(chatId)) {
    blockChatCache.set(chatId, chatId ? await documentOrNull(`chats/${chatId}`) : null);
  }
  return shouldSuppressBlockedDirectNotification(item, blockChatCache.get(chatId), hasUserBlockEdge);
}

async function claimPending(item) {
  const planned = planFcmOutboxClaim(item, new Date().toISOString());
  const name = 'projects/' + projectId + '/databases/(default)/documents/notification_outbox/' + item.id;
  const fields = encodeFields(planned.fields);
  const committed = await request(base + ':commit', {
    method: 'POST',
    body: JSON.stringify({ writes: [{
      update: { name, fields },
      updateMask: { fieldPaths: Object.keys(fields) },
      currentDocument: planned.precondition,
    }] }),
  });
  // A missing commit receipt must not be interpreted as permission to send.
  return attachCommittedFcmClaim(item, planned, committed);
}

async function markSent(claimed) {
  const planned = planFcmOutboxCompletion(claimed, new Date().toISOString());
  const name = 'projects/' + projectId + '/databases/(default)/documents/notification_outbox/' + claimed.id;
  const fields = encodeFields(planned.fields);
  await request(base + ':commit', {
    method: 'POST',
    body: JSON.stringify({ writes: [{
      update: { name, fields },
      updateMask: { fieldPaths: Object.keys(fields) },
      currentDocument: planned.precondition,
    }] }),
  });
}

async function deactivateTokenRecord(target, reason, { preserveOwnershipTime = false } = {}) {
  if (!target?.id) return false;
  const at = new Date().toISOString();
  const name = `projects/${projectId}/databases/(default)/documents/device_tokens/${target.id}`;
  const fields = encodeFields({
    active: false,
    invalidated_at: at,
    invalidation_reason: String(reason || 'fcm-permanent-error').slice(0, 80),
    ...(preserveOwnershipTime ? {} : { updated_at: at }),
  });
  await request(`${base}:commit`, {
    method: 'POST',
    body: JSON.stringify({
      writes: [{
        update: { name, fields },
        updateMask: { fieldPaths: Object.keys(fields) },
        currentDocument: fcmTokenCleanupPrecondition(target),
      }],
    }),
  });
  return true;
}

const [outbox, tokens] = await Promise.all([query('notification_outbox'), query('device_tokens')]);
const pending = outbox.filter((item) => item.status === 'pending');
const supersededActiveTokens = supersededActiveTokenRecords(tokens);
const scopedPending = apply
  ? [selectExactPhysicalNotification(pending, applyGate.notificationId, applyGate.recipientUid)]
  : pending;
let planned = 0;
let delivered = 0;
let waitingForToken = 0;
let blockedSuppressed = 0;
let supersededOwnershipDeactivated = 0;

for (const item of scopedPending) {
  if (await blockedDirectOutbox(item)) {
    blockedSuppressed += 1;
    continue;
  }
  const eligibleTargets = eligibleRecipientTargets(tokens, item.recipient_uid);
  const targets = apply
    ? [selectExactPhysicalTarget(eligibleTargets, applyGate.deviceTokenRecordId)]
    : eligibleTargets;
  if (!targets.length) {
    waitingForToken += 1;
    continue;
  }

  const data = fcmDataForNotification(item);
  if (!apply) {
    planned += targets.length;
    continue;
  }

  // Exact single-target physical send is gated above. A committed CAS claim
  // prevents retries after an ambiguous external HTTP outcome.
  const claimed = await claimPending(item);
  let deliveredForItem = 0;
  for (const target of targets) {
    const staleForTarget = supersededActiveTokens.filter((record) => record.token === target.token);
    for (const stale of staleForTarget) {
      const cleaned = await deactivateTokenRecord(stale, 'superseded-token-owner', { preserveOwnershipTime: true }).catch(() => false);
      if (cleaned) supersededOwnershipDeactivated += 1;
    }

    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: target.token,
          notification: { title: 'TuTop', body: 'Tienes actividad nueva en TuTop.' },
          data,
        },
      }),
    });
    if (response.ok) {
      deliveredForItem += 1;
      delivered += 1;
    } else {
      const detail = await response.text();
      if (isPermanentFcmTokenError(response.status, detail)) {
        await deactivateTokenRecord(target, 'fcm-permanent-token-error').catch(() => false);
      }
      console.warn(`FCM_PHYSICAL_SEND_HTTP_${response.status}; target details redacted`);
    }
  }

  if (deliveredForItem > 0) await markSent(claimed);
}

console.log(JSON.stringify({
  mode: apply ? 'APPLY' : 'DRY_RUN',
  project: projectId,
  pending_notifications: pending.length,
  scoped_pending_notifications: scopedPending.length,
  planned_deliveries: planned,
  delivered,
  waiting_for_device_token: waitingForToken,
  suppressed_by_user_blocks: blockedSuppressed,
  current_owner_filter: true,
  superseded_active_token_records_detected: supersededActiveTokens.length,
  superseded_active_token_records_deactivated: apply ? supersededOwnershipDeactivated : 0,
  superseded_owner_cleanup_scoped_to_selected_token: apply ? true : null,
  permanent_invalid_token_cleanup: apply,
  notification_id_in_payload: true,
  single_target_apply_guard: apply ? true : null,
  selected_device_token_record_id: apply ? applyGate.deviceTokenRecordId : null,
  candidate_sha: applyGate.authority?.sha || null,
  candidate_artifact_id: applyGate.authority?.artifactId || null,
  candidate_build_run_id: applyGate.authority?.buildRunId || null,
  candidate_apk_sha256: applyGate.authority?.apkSha256 || null,
  candidate_cert_sha256: applyGate.authority?.certSha256 || null,
  real_fcm_sent: apply && delivered > 0,
}, null, 2));
