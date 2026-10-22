/**
 * Native notification navigation and snapshot hydration must never trust a
 * locally cached UI identity as proof of the authenticated recipient.
 *
 * Keep these decisions pure so cross-account cases can run without Firebase,
 * Android devices, permissions or real push tokens.
 */
function uid(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function canRouteNativeNotification(
  recipientUid: unknown,
  authenticatedUid: unknown,
  storeUid: unknown,
): boolean {
  const recipient = uid(recipientUid);
  const auth = uid(authenticatedUid);
  const currentStore = uid(storeUid);
  return Boolean(recipient && auth && currentStore && recipient === auth && recipient === currentStore);
}

export function canApplyNativeNotificationSnapshot(
  recipientUid: unknown,
  authenticatedUid: unknown,
  storeUid: unknown,
  snapshotUid: unknown,
): boolean {
  const recipient = uid(recipientUid);
  return canRouteNativeNotification(recipient, authenticatedUid, storeUid)
    && uid(snapshotUid) === recipient;
}
