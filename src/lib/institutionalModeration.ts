export type ModeratorScope =
  | { kind: 'global' }
  | { kind: 'institution'; institution_id: string };

export type ModerationQueueItem = {
  id: string;
  institution_id?: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  priority?: 'normal' | 'high' | 'urgent';
};

export function canModerateItem(scope: ModeratorScope, item: ModerationQueueItem) {
  if (scope.kind === 'global') return true;
  return Boolean(item.institution_id && item.institution_id === scope.institution_id);
}

export function moderationQueueFor(scope: ModeratorScope, items: ModerationQueueItem[]) {
  const priorityWeight = { urgent: 3, high: 2, normal: 1 } as const;
  return items
    .filter((item) => item.status === 'open' || item.status === 'reviewing')
    .filter((item) => canModerateItem(scope, item))
    .sort((a, b) => (priorityWeight[b.priority || 'normal'] - priorityWeight[a.priority || 'normal']));
}


/**
 * Client-side defense in depth for an existing moderation case.
 * Firestore Rules must independently enforce these rules on every commit.
 * The source data/role still comes from authenticated backend reads.
 */
export function requireModerationCaseTransition(
  admin: {
    active: boolean;
    role: 'super_admin' | 'trust_safety' | 'moderator'
      | 'institution_moderator' | 'verification_reviewer' | 'support';
    institution_id?: string;
  },
  current: { kind?: unknown; status?: unknown; institution_id?: unknown },
  next: 'reviewing' | 'resolved' | 'dismissed',
): string | undefined {
  if (!admin?.active) throw new Error('ADMIN_REQUIRED');
  if (!current || typeof current !== 'object') throw new Error('MODERATION_CASE_INVALID');
  if (!['super_admin', 'trust_safety', 'moderator', 'institution_moderator',
    'verification_reviewer', 'support'].includes(admin.role)) {
    throw new Error('ROLE_SCOPE_DENIED');
  }
  const kind = current.kind;
  if (!['credential', 'product', 'user', 'chat', 'possible_scam',
    'prohibited_content', 'appeal', 'urgent_incident'].includes(String(kind))) {
    throw new Error('MODERATION_CASE_KIND_INVALID');
  }
  if (admin.role === 'verification_reviewer' && kind !== 'credential') {
    throw new Error('ROLE_SCOPE_DENIED');
  }
  if (admin.role === 'support' && kind !== 'appeal') {
    throw new Error('ROLE_SCOPE_DENIED');
  }
  const institution = typeof current.institution_id === 'string'
    ? current.institution_id.trim() : '';
  if (admin.role === 'institution_moderator'
    && (!admin.institution_id || admin.institution_id !== institution)) {
    throw new Error('INSTITUTION_SCOPE_DENIED');
  }
  const before = current.status;
  if (!['open', 'reviewing'].includes(String(before))
    || !['reviewing', 'resolved', 'dismissed'].includes(next)
    || (before === 'reviewing' && next === 'reviewing')) {
    throw new Error('MODERATION_CASE_INVALID_TRANSITION');
  }
  return institution || undefined;
}


/**
 * Client-only defense for no-show decisions. The server and Firestore Rules
 * must also authenticate role/scope and enforce an atomic final transition.
 */
export function requireNoShowClaimDecision(
  admin: Parameters<typeof requireModerationCaseTransition>[0],
  current: { institution_id?: unknown; status?: unknown },
  next: 'upheld' | 'dismissed',
): string | undefined {
  if (!admin?.active) throw new Error('ADMIN_REQUIRED');
  if (!['super_admin', 'trust_safety', 'moderator', 'institution_moderator'].includes(admin.role)) {
    throw new Error('ROLE_SCOPE_DENIED');
  }
  if (!current || typeof current !== 'object') throw new Error('NO_SHOW_CLAIM_INVALID');
  const institution = typeof current.institution_id === 'string'
    ? current.institution_id.trim() : '';
  if (admin.role === 'institution_moderator'
    && (!admin.institution_id || admin.institution_id !== institution)) {
    throw new Error('INSTITUTION_SCOPE_DENIED');
  }
  if (current.status !== 'open' || !['upheld', 'dismissed'].includes(next)) {
    throw new Error('NO_SHOW_INVALID_TRANSITION');
  }
  return institution || undefined;
}
