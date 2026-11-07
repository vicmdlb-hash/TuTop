/**
 * Guard a completed backend snapshot against a changed Firebase session.
 * Read-only predicate; no storage, network or permission side effects.
 */
export function isCurrentBackendHydration(
  expectedUid: string,
  liveUid: string | null | undefined,
  snapshotUid: string | null | undefined,
  expectedEpoch: number,
  currentEpoch: number,
) {
  return Boolean(expectedUid) && liveUid === expectedUid && snapshotUid === expectedUid
    && Number.isSafeInteger(expectedEpoch) && currentEpoch === expectedEpoch;
}

/**
 * Last-line defense for all store snapshot writers, including async marketplace
 * mutations that bypass BackendGate's own auth-epoch guard.
 * Empty store UID is allowed only during a currently authenticated bootstrap.
 */
export function isLiveAccountSnapshot(
  currentStoreUid: string | null | undefined,
  liveSessionUid: string | null | undefined,
  snapshotUid: string | null | undefined,
): boolean {
  return Boolean(snapshotUid) && liveSessionUid === snapshotUid
    && (!currentStoreUid || currentStoreUid === snapshotUid);
}
