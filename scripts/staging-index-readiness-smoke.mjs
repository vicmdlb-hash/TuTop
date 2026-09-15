import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';

const projectId = assertStagingFreezeContext();
const token = await firebaseCiAccessToken();
const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`;
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'X-Goog-User-Project': projectId,
};

const probeString = '__tutop_index_readiness_probe__';
const recentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const MAX_ATTEMPTS = 20;
const RETRY_MS = 15_000;
const NETWORK_MAX_ATTEMPTS = 4;
const NETWORK_RETRY_MS = 2_000;

const field = (fieldPath) => ({ fieldPath });
const stringValue = (value) => ({ stringValue: value });
const timestampValue = (value) => ({ timestampValue: value });
const arrayValue = (values) => ({ arrayValue: { values } });
const filter = (fieldPath, op, value) => ({ fieldFilter: { field: field(fieldPath), op, value } });
const and = (...filters) => ({ compositeFilter: { op: 'AND', filters } });
const orderBy = (fieldPath, direction) => ({ field: field(fieldPath), direction });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const probes = [
  {
    name: 'chats participants + updated_at',
    query: {
      from: [{ collectionId: 'chats' }],
      where: filter('participants', 'ARRAY_CONTAINS', stringValue(probeString)),
      orderBy: [orderBy('updated_at', 'DESCENDING')],
      limit: 1,
    },
  },
  {
    name: 'wallet_transactions user_id + created_at',
    query: {
      from: [{ collectionId: 'wallet_transactions' }],
      where: filter('user_id', 'EQUAL', stringValue(probeString)),
      orderBy: [orderBy('created_at', 'DESCENDING')],
      limit: 1,
    },
  },
  {
    name: 'reviews evaluado + calificacion + fecha',
    query: {
      from: [{ collectionId: 'reviews' }],
      where: and(
        filter('evaluado_id', 'EQUAL', stringValue(probeString)),
        filter('calificacion', 'EQUAL', stringValue('negative')),
        filter('fecha', 'GREATER_THAN_OR_EQUAL', timestampValue(recentCutoff)),
      ),
      orderBy: [orderBy('fecha', 'ASCENDING')],
      limit: 1,
    },
  },
  {
    name: 'favorites uid + product_id IN',
    query: {
      from: [{ collectionId: 'favorites' }],
      where: and(
        filter('uid', 'EQUAL', stringValue(probeString)),
        filter('product_id', 'IN', arrayValue([stringValue(probeString)])),
      ),
      limit: 1,
    },
  },
  ...[
    ['campus_id', 'uatx-riberena'],
    ['institution_id', 'uatx'],
    ['city_id', 'tlaxcala'],
    ['visibility_scope', 'campus'],
  ].map(([scopeField, scopeValue]) => ({
    name: `listings_v2 status + moderation + ${scopeField} + updated_at`,
    query: {
      from: [{ collectionId: 'listings_v2' }],
      where: and(
        filter('status', 'EQUAL', stringValue('active')),
        filter('moderation_status', 'EQUAL', stringValue('approved')),
        filter(scopeField, 'EQUAL', stringValue(scopeValue)),
      ),
      orderBy: [orderBy('updated_at', 'DESCENDING')],
      limit: 1,
    },
  })),
  {
    name: 'listings_v2 seller_id + updated_at',
    query: {
      from: [{ collectionId: 'listings_v2' }],
      where: filter('seller_id', 'EQUAL', stringValue(probeString)),
      orderBy: [orderBy('updated_at', 'DESCENDING')],
      limit: 1,
    },
  },
  {
    name: 'listings_v2 moderation_status + updated_at',
    query: {
      from: [{ collectionId: 'listings_v2' }],
      where: filter('moderation_status', 'EQUAL', stringValue('pending')),
      orderBy: [orderBy('updated_at', 'DESCENDING')],
      limit: 1,
    },
  },
  {
    name: 'listings_v2 moderation + institution + updated_at',
    query: {
      from: [{ collectionId: 'listings_v2' }],
      where: and(
        filter('moderation_status', 'EQUAL', stringValue('pending')),
        filter('institution_id', 'EQUAL', stringValue('uatx')),
      ),
      orderBy: [orderBy('updated_at', 'DESCENDING')],
      limit: 1,
    },
  },
  {
    name: 'notification_outbox recipient_uid + created_at',
    query: {
      from: [{ collectionId: 'notification_outbox' }],
      where: filter('recipient_uid', 'EQUAL', stringValue(probeString)),
      orderBy: [orderBy('created_at', 'DESCENDING')],
      limit: 1,
    },
  },
];

function networkErrorCode(error) {
  const direct = error?.code;
  if (typeof direct === 'string') return direct;
  const cause = error?.cause;
  if (typeof cause?.code === 'string') return cause.code;
  if (Array.isArray(cause?.errors)) {
    const match = cause.errors.find((item) => typeof item?.code === 'string');
    if (match) return match.code;
  }
  return '';
}

function isTransientNetworkError(error) {
  const code = networkErrorCode(error);
  return [
    'ETIMEDOUT',
    'ENETUNREACH',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ].includes(code) || (error instanceof TypeError && /fetch failed/i.test(error.message));
}

async function runProbe(probe) {
  for (let networkAttempt = 1; networkAttempt <= NETWORK_MAX_ATTEMPTS; networkAttempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ structuredQuery: probe.query }),
      });
      const text = await response.text();
      if (response.ok) return;
      const detail = `${response.status}: ${text.slice(0, 1200)}`;
      const explicitBuildingState = /index/i.test(detail) && /(building|being built|not ready|cannot be used yet)/i.test(detail);
      const freshlyDeployedMissingState = /FAILED_PRECONDITION/i.test(detail) && /query requires an index/i.test(detail);
      const error = new Error(`${probe.name}: ${detail}`);
      error.transientIndexState = explicitBuildingState || freshlyDeployedMissingState;
      throw error;
    } catch (error) {
      if (error?.transientIndexState) throw error;
      if (!isTransientNetworkError(error)) throw error;
      if (networkAttempt === NETWORK_MAX_ATTEMPTS) {
        const blocked = new Error(`STAGING_INDEX_NETWORK_BLOCKED:${probe.name}:${networkErrorCode(error) || 'fetch_failed'}`);
        blocked.cause = error;
        throw blocked;
      }
      console.log(`⏳ INDEX NETWORK RETRY: ${probe.name} (network ${networkAttempt}/${NETWORK_MAX_ATTEMPTS})`);
      await sleep(NETWORK_RETRY_MS * networkAttempt);
    }
  }
}

let pending = [...probes];
for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length; attempt += 1) {
  const results = await Promise.allSettled(pending.map((probe) => runProbe(probe)));
  const retry = [];
  results.forEach((result, index) => {
    const probe = pending[index];
    if (result.status === 'fulfilled') {
      console.log(`✅ INDEX READY: ${probe.name}`);
      return;
    }
    if (result.reason?.transientIndexState) {
      retry.push(probe);
      console.log(`⏳ INDEX PENDING: ${probe.name} (attempt ${attempt}/${MAX_ATTEMPTS})`);
      return;
    }
    throw result.reason;
  });

  if (!retry.length) {
    pending = [];
    break;
  }
  if (attempt === MAX_ATTEMPTS) {
    throw new Error(`STAGING_INDEX_READINESS_BLOCKED:${retry.map((probe) => probe.name).join('|')}`);
  }
  pending = retry;
  await sleep(RETRY_MS);
}

console.log(`✅ Firestore staging composite-index matrix READY (${probes.length}/${probes.length}) on ${projectId}.`);
