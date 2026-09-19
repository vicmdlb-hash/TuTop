import type { FirebaseRestClient } from './firebaseRest';

export type RateLimitAction =
  | 'listing_create'
  | 'chat_create'
  | 'offer_create'
  | 'message_create'
  | 'report_create'
  | 'demand_create';

type RateLimitMode = 'increment' | 'reset';

function bucketPath(uid: string, action: RateLimitAction) {
  return `rate_limits/${uid}-${action}`;
}

function permissionDenied(error: unknown) {
  const anyError = error as any;
  const text = `${anyError?.message || ''} ${JSON.stringify(anyError?.payload || {})}`;
  return /PERMISSION_DENIED|Missing or insufficient permissions|HTTP 403/i.test(text);
}

function conflictError(error: unknown) {
  const anyError = error as any;
  const text = `${anyError?.message || ''} ${JSON.stringify(anyError?.payload || {})}`;
  return /ABORTED|FAILED_PRECONDITION|conflict|update time/i.test(text);
}

async function buildRateLimitAttempt(
  client: FirebaseRestClient,
  action: RateLimitAction,
  mode: RateLimitMode,
) {
  const uid = client.currentSession?.uid;
  if (!uid) throw new Error('AUTH_REQUIRED');

  const path = bucketPath(uid, action);
  const existing = await client.getDocument<any>(path);

  if (!existing) {
    return {
      existing: false,
      write: {
        update: client.encodeDocumentForWrite(path, { uid, action, count: 1 }),
        updateTransforms: [
          { fieldPath: 'window_start', setToServerValue: 'REQUEST_TIME' as const },
          { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' as const },
        ],
        currentDocument: { exists: false },
      },
    };
  }

  const write: any = {
    update: client.encodeDocumentForWrite(path, { uid, action, count: 1 }),
    currentDocument: existing.updateTime ? { updateTime: existing.updateTime } : undefined,
  };

  if (mode === 'increment') {
    const parsedStart = Date.parse(String(existing.data?.window_start || ''));
    const currentCount = Number(existing.data?.count);
    if (!Number.isFinite(parsedStart) || !Number.isInteger(currentCount) || currentCount < 1) {
      throw new Error('RATE_LIMIT_BUCKET_INVALID');
    }
    write.update = client.encodeDocumentForWrite(path, {
      uid,
      action,
      window_start: new Date(parsedStart),
      count: currentCount + 1,
    });
    write.updateTransforms = [
      { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' as const },
    ];
  } else {
    write.updateTransforms = [
      { fieldPath: 'window_start', setToServerValue: 'REQUEST_TIME' as const },
      { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' as const },
    ];
  }

  return { existing: true, write };
}

// Public helper retained for compatibility. It no longer uses the caller/device
// wall clock to decide whether a one-hour window is current. The first attempt
// always preserves an existing server-timestamped window; Rules are the authority
// on whether that window has expired.
export async function buildRateLimitWrite(
  client: FirebaseRestClient,
  action: RateLimitAction,
  _at = new Date(),
) {
  return (await buildRateLimitAttempt(client, action, 'increment')).write;
}

export async function commitWithRateLimit(
  client: FirebaseRestClient,
  action: RateLimitAction,
  writes: any[],
  _at = new Date(),
) {
  let lastError: unknown;
  let mode: RateLimitMode = 'increment';

  // A server-authoritative state machine avoids relying on the phone clock:
  // 1) preserve/increment an existing window;
  // 2) if Rules say that is no longer valid, reset with REQUEST_TIME;
  // 3) one final alternation handles a concurrent bucket rollover.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const built = await buildRateLimitAttempt(client, action, mode);
    try {
      return await client.commit([...writes, built.write]);
    } catch (error) {
      lastError = error;
      if (conflictError(error) && attempt < 2) continue;
      if (built.existing && permissionDenied(error) && attempt < 2) {
        mode = mode === 'increment' ? 'reset' : 'increment';
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}
