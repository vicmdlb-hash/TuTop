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

export async function firebaseFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = FIREBASE_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const boundedTimeout = Math.max(1, Math.floor(timeoutMs));
  const controller = new AbortController();
  const upstream = init.signal;

  const relayAbort = () => controller.abort(upstream?.reason);
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
