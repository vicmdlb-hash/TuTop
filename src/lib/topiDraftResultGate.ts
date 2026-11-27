/**
 * A Topi compose result is advisory. It must not overwrite a newer manual edit,
 * an A→B→A account transition, or the result of a newer request.
 * This pure predicate is not a server-side authorization decision.
 */
export type TopiDraftRequestIdentity = {
  uid: string;
  serial: number;
  draftVersion: string;
};

export function topiDraftResultIsCurrent(
  started: TopiDraftRequestIdentity,
  current: TopiDraftRequestIdentity,
): boolean {
  return Boolean(started.uid)
    && started.uid === current.uid
    && Number.isSafeInteger(started.serial)
    && started.serial > 0
    && started.serial === current.serial
    && started.draftVersion === current.draftVersion;
}
