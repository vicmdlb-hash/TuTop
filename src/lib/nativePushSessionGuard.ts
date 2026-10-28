// Synthetic-testable, process-local session witness; never log or persist it.
export type PushSessionWitness = { uid: string; refreshToken: string; generation: number; epoch: number };
export function matchesNativePushSession(
  witness: PushSessionWitness | null,
  current: { uid: string; refreshToken: string } | null,
  generation: number, epoch: number, pendingReset: boolean,
): boolean {
  return Boolean(witness && current && !pendingReset
    && witness.uid && witness.refreshToken
    && witness.uid === current.uid && witness.refreshToken === current.refreshToken
    && witness.generation === generation && witness.epoch === epoch);
}
