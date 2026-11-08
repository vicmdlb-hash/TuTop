export const FIREBASE_REQUEST_TIMEOUT_MS = 15_000;
export const FIREBASE_REQUEST_TIMEOUT_CODE = 'FIREBASE_REQUEST_TIMEOUT';

export class FirebaseRequestTimeoutError extends Error {
  readonly code = FIREBASE_REQUEST_TIMEOUT_CODE;
  readonly retryable = true;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(FIREBASE_REQUEST_TIMEOUT_CODE);
    this.name = 'FirebaseRequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export function isFirebaseRequestTimeout(error: unknown) {
  if (error instanceof FirebaseRequestTimeoutError) return true;
  const candidate = error as { code?: unknown; message?: unknown } | null;
  return candidate?.code === FIREBASE_REQUEST_TIMEOUT_CODE
    || candidate?.message === FIREBASE_REQUEST_TIMEOUT_CODE;
}

export async function firebaseFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = FIREBASE_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const boundedTimeout = Math.max(1, Math.floor(timeoutMs));
  const controller = new AbortController();
  const upstream = init.signal;

  // Caller cancellation must settle even if a transport ignores AbortSignal.
  // Do not misreport an upstream cancel as a Firebase network timeout.
  let rejectCallerAbort: ((reason: unknown) => void) | undefined;
  const callerAbort = new Promise<never>((_, reject) => { rejectCallerAbort = reject; });
  const relayAbort = () => {
    controller.abort(upstream?.reason);
    rejectCallerAbort?.(controller.signal.reason);
  };
  if (upstream?.aborted) relayAbort();
  else upstream?.addEventListener('abort', relayAbort, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new FirebaseRequestTimeoutError(boundedTimeout));
    }, boundedTimeout);
  });

  try {
    return await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      timeout,
      callerAbort,
    ]);
  } catch (error) {
    if (timedOut && !(error instanceof FirebaseRequestTimeoutError)) {
      throw new FirebaseRequestTimeoutError(boundedTimeout);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    upstream?.removeEventListener('abort', relayAbort);
  }
}

/**
 * Headers may arrive before the response body stalls. Limit body consumption
 * independently from firebaseFetch's header timeout; never log response text.
 * The original network reader may finish later, but cannot keep its caller hung.
 */
export async function readFirebaseResponseText(
  response: Pick<Response, 'text'>,
  timeoutMs = FIREBASE_REQUEST_TIMEOUT_MS,
): Promise<string> {
  const boundedTimeout = Number.isFinite(timeoutMs) ? Math.max(1, Math.floor(timeoutMs)) : FIREBASE_REQUEST_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FirebaseRequestTimeoutError(boundedTimeout)), boundedTimeout);
  });
  try {
    return await Promise.race([response.text(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
