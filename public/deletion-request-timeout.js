// Bounded browser requests for the account-deletion resource.
// A timed-out write has an UNKNOWN outcome: callers must read the existing
// request before offering another create. Do not retry a POST automatically.
export const DELETION_REQUEST_TIMEOUT_MS = 15000;

export async function deletionJsonRequest(
  url, options = {}, { fetchImpl = fetch, timeoutMs = DELETION_REQUEST_TIMEOUT_MS, acceptNotFound = false } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (acceptNotFound && response.status === 404) return { status: 404, data: null };
    const text = await response.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); } catch { data = {}; }
    }
    if (!response.ok) {
      const error = new Error('REMOTE_REQUEST_FAILED');
      error.status = response.status;
      error.remoteStatus = data?.error?.status || '';
      throw error;
    }
    return { status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}
