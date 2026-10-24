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
