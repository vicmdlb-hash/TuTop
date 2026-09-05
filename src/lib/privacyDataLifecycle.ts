export type DataZone = 'public' | 'private' | 'verification' | 'transactional' | 'trust_safety' | 'analytics';

export const DATA_COLLECTION_ZONES: Record<string, DataZone> = {
  public_profiles: 'public',
  users: 'public',
  private_accounts: 'private',
  user_private: 'private',
  verifications: 'verification',
  verificationRequests: 'verification',
  publicVerifications: 'public',
  listings: 'public',
  products: 'public',
  transactions: 'transactional',
  transactions_v2: 'transactional',
  chats: 'transactional',
  reports: 'trust_safety',
  moderation_cases: 'trust_safety',
  audit_log: 'trust_safety',
  marketplace_events: 'analytics',
};

export type AccountDeletionDecision = {
  action: 'delete' | 'anonymize' | 'retain_temporarily';
  reason: string;
  retention_days?: number;
};

export function accountDeletionDecision(input: {
  zone: DataZone;
  active_dispute?: boolean;
  upheld_fraud_case?: boolean;
  legal_retention_required?: boolean;
}): AccountDeletionDecision {
  if (input.active_dispute) return { action: 'retain_temporarily', reason: 'active_dispute', retention_days: 90 };
  if (input.legal_retention_required) return { action: 'retain_temporarily', reason: 'legal_retention', retention_days: 365 };
  if (input.upheld_fraud_case && input.zone === 'trust_safety') {
    return { action: 'retain_temporarily', reason: 'fraud_prevention', retention_days: 365 };
  }
  if (input.zone === 'transactional' || input.zone === 'analytics') {
    return { action: 'anonymize', reason: 'preserve_market_integrity_without_direct_identity' };
  }
  return { action: 'delete', reason: 'user_requested_account_deletion' };
}

export function publicProfileFields() {
  return [
    'uid',
    'nombre',
    'handle',
    'avatar_url',
    'institution_id',
    'campus_id',
    'faculty_id',
    'career_id',
    'verification_level',
    'verification_badge',
    'member_since',
    'reputation_summary',
  ] as const;
}

export function privateAccountFields() {
  return [
    'uid',
    'phone',
    'email',
    'institutional_email',
    'account_recovery',
    'notification_tokens',
    'security_metadata',
  ] as const;
}

export function assertNoPrivateFieldsInPublicProfile(profile: Record<string, unknown>) {
  const forbidden = ['telefono', 'phone', 'email', 'institutional_email', 'credential', 'image_data', 'exact_address', 'notification_tokens'];
  return forbidden.every((key) => !(key in profile));
}
