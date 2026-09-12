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
