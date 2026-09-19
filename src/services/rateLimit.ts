import type { FirebaseRestClient } from './firebaseRest';

export type RateLimitAction =
  | 'listing_create'
  | 'chat_create'
  | 'offer_create'
  | 'message_create'
  | 'report_create'
  | 'demand_create';

const WINDOW_MS = 60 * 60_000;

function bucketPath(uid: string, action: RateLimitAction) {
  return `rate_limits/${uid}-${action}`;
}

function safeWindowStart(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export async function buildRateLimitWrite(client: FirebaseRestClient, action: RateLimitAction, at = new Date()) {
  const uid = client.currentSession?.uid;
  if (!uid) throw new Error('AUTH_REQUIRED');

  const path = bucketPath(uid, action);
  const existing = await client.getDocument<any>(path);
  const existingStart = safeWindowStart(existing?.data?.window_start);
  const sameWindow = Boolean(
    existing
    && Number.isFinite(existingStart)
    && existingStart <= at.getTime()
    && at.getTime() - existingStart < WINDOW_MS,
  );

  const count = sameWindow ? Math.max(0, Number(existing?.data?.count || 0)) + 1 : 1;
  // Never trust the device wall clock for security timestamps. Firestore Rules
  // compare these values to request.time; using REQUEST_TIME makes publication
  // robust to a phone whose clock is several minutes fast/slow.
  const payload: Record<string, unknown> = { uid, action, count };
  if (sameWindow) payload.window_start = new Date(existingStart);

  const updateTransforms: Array<{ fieldPath: string; setToServerValue: 'REQUEST_TIME' }> = [
    ...(sameWindow ? [] : [{ fieldPath: 'window_start', setToServerValue: 'REQUEST_TIME' as const }]),
    { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' as const },
  ];

  const write: any = {
    update: client.encodeDocumentForWrite(path, payload),
    updateTransforms,
  };

  if (existing?.updateTime) {
    write.currentDocument = { updateTime: existing.updateTime };
  } else {
    write.currentDocument = { exists: false };
  }

  return write;
}

export async function commitWithRateLimit(
  client: FirebaseRestClient,
  action: RateLimitAction,
  writes: any[],
  at = new Date(),
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rateWrite = await buildRateLimitWrite(client, action, at);
      return await client.commit([...writes, rateWrite]);
    } catch (error: any) {
      lastError = error;
      const text = `${error?.message || ''} ${JSON.stringify(error?.payload || {})}`;
      const retryable = /ABORTED|FAILED_PRECONDITION|conflict|update time/i.test(text);
      if (!retryable || attempt === 1) throw error;
    }
  }
  throw lastError;
}
